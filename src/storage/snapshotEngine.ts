import type { AppState } from '../domain/types';
import type { BackupBlobManifestEntry } from '../domain/persuratan/types';
import {
  collectBackupBlobsForState,
  type BinaryBlobStoreLike,
} from '../domain/persuratan/attachments/attachmentStore';
import {
  openSignalDB,
  SNAPSHOT_STORE_NAME,
  AUDIT_STORE_NAME,
  CURRENT_APP_SCHEMA_VERSION,
  isPlainObject,
  validateAppStateStructure,
  migrateAppStateSchema,
  parseBackupContent,
  type BackupParseResult,
  type BackupVerificationStatus,
  type SignalDbLike,
} from './db';
import { computeCanonicalSha256, computeSha256Hex, isSha256Hex } from './checksum';

export interface StateSnapshot {
  id: string;
  timestamp: string;
  label: string;
  triggerType: 'auto' | 'pre_generate' | 'manual_milestone' | 'pre_rollback';
  isStarred: boolean;
  diffSummary: {
    totalTeachers: number;
    totalClasses: number;
    totalSlotsAssigned: number;
    hardConflictCount: number;
    description: string;
  };
  checksum: string;
  checksumVersion?: number;
  stateCopy: AppState;
}

export interface SignalArchiveContainer {
  signature: 'SIGNAL-V5-SEAL';
  formatVersion: 2;
  checksumAlgorithm: 'SHA-256';
  checksum: string;
  data: {
    brand: 'SIGNAL-V5-SOVEREIGN-ATELIER';
    version: string;
    schemaVersion: number;
    exportedAt: string;
    institution: string;
    schoolName: string;
    state: AppState;
    starredSnapshots: StateSnapshot[];
    blobs?: BackupBlobManifestEntry[];
  };
}

const MAX_AUTO_SNAPSHOTS = 20;

async function resolveDb(dbOverride?: SignalDbLike): Promise<SignalDbLike> {
  if (dbOverride) return dbOverride;
  return (await openSignalDB()) as unknown as SignalDbLike;
}

/**
 * Deep-clones an AppState object cleanly.
 */
function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state)) as AppState;
}

/**
 * Creates and stores a new state snapshot in IndexedDB with canonical SHA-256 integrity checksum.
 */
export async function createSnapshot(
  state: AppState,
  label: string,
  triggerType: StateSnapshot['triggerType'] = 'auto',
  isStarred: boolean = false,
  dbOverride?: SignalDbLike
): Promise<StateSnapshot> {
  const db = await resolveDb(dbOverride);
  const id = `snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  const stateCopy = migrateAppStateSchema(cloneState(state), timestamp).state;

  const entries = state.draft ?? state.activeSchedule ?? [];
  const assignedSlots = entries.length;
  const teachersCount = state.teachers.filter((t) => t.isActive).length;
  const classesCount = state.classes.filter((c) => c.isActive).length;

  const desc = `${teachersCount} Guru · ${classesCount} Kelas · ${assignedSlots} Slot KBM Terisi`;

  const checksum = await computeCanonicalSha256(stateCopy);

  const snapshot: StateSnapshot = {
    id,
    timestamp,
    label,
    triggerType,
    isStarred,
    diffSummary: {
      totalTeachers: teachersCount,
      totalClasses: classesCount,
      totalSlotsAssigned: assignedSlots,
      hardConflictCount: 0,
      description: desc,
    },
    checksum,
    checksumVersion: 2,
    stateCopy,
  };

  await db.put(SNAPSHOT_STORE_NAME, snapshot);

  // Auto-prune old non-starred snapshots if over limit
  if (triggerType === 'auto') {
    await pruneOldSnapshots(db);
  }

  // Record audit log
  try {
    await db.put(AUDIT_STORE_NAME, {
      id: `audit-${Date.now()}`,
      entityType: 'SNAPSHOT',
      entityId: id,
      action: 'CREATE_SNAPSHOT',
      actor: 'operator-lokal',
      timestamp,
      summary: `Snapshot dibuat: ${label}`,
      newChecksum: checksum,
      snapshotId: id,
    });
  } catch (e) {
    console.warn('Audit log write error:', e);
  }

  return snapshot;
}

/**
 * Retrieves all stored snapshots ordered from newest to oldest.
 */
export async function getSnapshots(dbOverride?: SignalDbLike): Promise<StateSnapshot[]> {
  const db = await resolveDb(dbOverride);
  const all = (await db.getAll(SNAPSHOT_STORE_NAME)) as StateSnapshot[];
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Toggles the starred status of a snapshot (preventing it from being auto-pruned).
 */
export async function toggleStarSnapshot(id: string, dbOverride?: SignalDbLike): Promise<boolean> {
  const db = await resolveDb(dbOverride);
  const item = (await db.get(SNAPSHOT_STORE_NAME, id)) as StateSnapshot | undefined;
  if (!item) return false;
  item.isStarred = !item.isStarred;
  await db.put(SNAPSHOT_STORE_NAME, item);
  return item.isStarred;
}

/**
 * Deletes a snapshot by ID.
 */
export async function deleteSnapshot(id: string, dbOverride?: SignalDbLike): Promise<void> {
  const db = await resolveDb(dbOverride);
  await db.delete(SNAPSHOT_STORE_NAME, id);
}

/**
 * Verifies snapshot integrity checksum and restores state cleanly.
 * Automatically saves a pre-rollback snapshot ONLY after verification passes.
 * Rejects tampered/corrupted snapshots without modifying existing snapshots or active data.
 */
export async function restoreSnapshot(
  currentState: AppState,
  snapshotId: string,
  dbOverride?: SignalDbLike
): Promise<AppState | null> {
  const db = await resolveDb(dbOverride);
  const target = (await db.get(SNAPSHOT_STORE_NAME, snapshotId)) as StateSnapshot | undefined;
  if (!target) return null;

  if (!isSha256Hex(target.checksum)) {
    throw new Error('Snapshot tidak memiliki checksum SHA-256 yang valid. Pemulihan dibatalkan.');
  }

  validateAppStateStructure(target.stateCopy);

  const expectedCanonical = await computeCanonicalSha256(target.stateCopy);
  const expectedLegacy =
    target.checksumVersion === 2
      ? null
      : await computeSha256Hex(JSON.stringify(target.stateCopy));

  const targetChecksum = target.checksum.toLowerCase();
  if (targetChecksum !== expectedCanonical && (expectedLegacy === null || targetChecksum !== expectedLegacy)) {
    throw new Error(
      'Verifikasi SHA-256 snapshot gagal: isi snapshot mungkin rusak atau telah diubah. Pemulihan dibatalkan demi keamanan data.'
    );
  }

  // 1. Safety net: create pre-rollback snapshot of current state only after target passes integrity checks
  await createSnapshot(
    currentState,
    `Pra-Pemulihan: Sebelum Rollback ke ${target.label}`,
    'pre_rollback',
    true,
    db
  );

  return migrateAppStateSchema(cloneState(target.stateCopy)).state;
}

/**
 * Prunes automated snapshots exceeding MAX_AUTO_SNAPSHOTS using FIFO.
 * Starred snapshots are never pruned!
 */
export async function pruneOldSnapshots(dbOverride?: SignalDbLike): Promise<void> {
  const db = await resolveDb(dbOverride);
  const all = (await db.getAll(SNAPSHOT_STORE_NAME)) as StateSnapshot[];

  const autoSnaps = all
    .filter((s) => s.triggerType === 'auto' && !s.isStarred)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  if (autoSnaps.length > MAX_AUTO_SNAPSHOTS) {
    const toDeleteCount = autoSnaps.length - MAX_AUTO_SNAPSHOTS;
    const toDelete = autoSnaps.slice(0, toDeleteCount);
    for (const snap of toDelete) {
      await db.delete(SNAPSHOT_STORE_NAME, snap.id);
    }
  }
}

export async function buildSignalContainer(
  state: AppState,
  snapshots: StateSnapshot[] = [],
  blobsOverride?: BackupBlobManifestEntry[],
  dbOverride?: BinaryBlobStoreLike
): Promise<SignalArchiveContainer> {
  const migratedState = migrateAppStateSchema(cloneState(state)).state;
  const collectedBlobs =
    blobsOverride !== undefined
      ? blobsOverride
      : await collectBackupBlobsForState(migratedState, dbOverride);

  const payload: SignalArchiveContainer['data'] = {
    brand: 'SIGNAL-V5-SOVEREIGN-ATELIER',
    version: '5.0.0',
    schemaVersion: migratedState.schemaVersion ?? CURRENT_APP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    institution: migratedState.settings.ministry || 'KEMENAG',
    schoolName: migratedState.settings.headmasterTitle ? 'Madrasah' : 'Madrasah Tsanawiyah',
    state: migratedState,
    starredSnapshots: snapshots.filter((s) => s.isStarred).slice(0, 5),
    ...(collectedBlobs.length > 0 ? { blobs: collectedBlobs } : {}),
  };

  const checksum = await computeCanonicalSha256(payload);
  return {
    signature: 'SIGNAL-V5-SEAL',
    formatVersion: 2,
    checksumAlgorithm: 'SHA-256',
    checksum,
    data: payload,
  };
}

/**
 * Exports single-file SHA-256 verified .signal backup.
 * Note: SHA-256 verifies file integrity only; it is NOT encryption or a digital signature.
 */
export async function exportSignalFile(state: AppState, dbOverride?: SignalDbLike): Promise<void> {
  const snapshots = await getSnapshots(dbOverride);
  const container = await buildSignalContainer(
    state,
    snapshots,
    undefined,
    dbOverride as unknown as BinaryBlobStoreLike
  );

  const blob = new Blob([JSON.stringify(container, null, 2)], {
    type: 'application/octet-stream',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `SIGNAL-V5-MADRASAH-${dateStr}.signal`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parses and strictly verifies an uploaded .signal or SIGNAL-LOCAL-BACKUP .json payload string.
 * Rejects tampered checksums, missing checksums on v2+ formats, unknown versions, invalid schemas,
 * and unwrapped raw JSON dumps without a verified container envelope.
 */
export async function parseSignalContent(text: string): Promise<BackupParseResult> {
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(text);
  } catch {
    throw new Error('Berkas cadangan bukan JSON/.signal yang valid atau rusak.');
  }

  if (!isPlainObject(parsedRaw)) {
    throw new Error('Struktur berkas cadangan tidak valid.');
  }

  // Case 1: Official .signal container
  if (parsedRaw.signature === 'SIGNAL-V5-SEAL') {
    if (!isPlainObject(parsedRaw.data) || !isPlainObject(parsedRaw.data.state)) {
      throw new Error('Struktur amplop .signal tidak lengkap atau rusak.');
    }

    const formatVersionRaw = parsedRaw.formatVersion;
    if (formatVersionRaw !== undefined && formatVersionRaw !== 1 && formatVersionRaw !== 2) {
      throw new Error('Versi format arsip .signal tidak dikenali oleh aplikasi ini.');
    }
    const formatVersion = typeof formatVersionRaw === 'number' ? formatVersionRaw : 1;

    const warnings: string[] = [];
    let verification: BackupVerificationStatus = 'verified';
    const hasChecksumKey = Object.prototype.hasOwnProperty.call(parsedRaw, 'checksum');
    const checksum = parsedRaw.checksum;

    const expectedCanonical = await computeCanonicalSha256(parsedRaw.data);
    const expectedLegacy = await computeSha256Hex(JSON.stringify(parsedRaw.data));

    if (formatVersion >= 2) {
      if (!isSha256Hex(checksum)) {
        throw new Error('Berkas .signal versi terbaru wajib memiliki checksum SHA-256 yang valid.');
      }
      if (checksum.toLowerCase() !== expectedCanonical) {
        throw new Error('Verifikasi SHA-256 gagal: berkas .signal telah diubah atau rusak.');
      }
    } else if (hasChecksumKey) {
      if (!isSha256Hex(checksum)) {
        throw new Error('Format checksum SHA-256 pada berkas .signal tidak valid.');
      }
      const lower = checksum.toLowerCase();
      if (lower !== expectedCanonical && lower !== expectedLegacy) {
        throw new Error('Verifikasi SHA-256 gagal: berkas .signal telah diubah atau rusak.');
      }
    } else {
      verification = 'legacy_unverified';
      warnings.push(
        'Berkas .signal format lama ini tidak menyertakan checksum SHA-256 sehingga integritasnya tidak dapat diverifikasi (legacy/unverified).'
      );
    }

    const schemaVersion = parsedRaw.data.state.schemaVersion;
    if (schemaVersion !== undefined && schemaVersion !== 1 && schemaVersion !== 2) {
      throw new Error('Versi skema data di dalam berkas .signal tidak didukung oleh aplikasi ini.');
    }

    validateAppStateStructure(parsedRaw.data.state);
    const { state: migrated } = migrateAppStateSchema(cloneState(parsedRaw.data.state as unknown as AppState));
    const parsedBlobs = Array.isArray(parsedRaw.data.blobs)
      ? (parsedRaw.data.blobs as BackupBlobManifestEntry[])
      : undefined;

    return {
      state: migrated,
      formatName: 'SIGNAL-V5-SEAL',
      formatVersion,
      schemaVersion: migrated.schemaVersion,
      verification,
      warnings,
      ...(typeof checksum === 'string' ? { checksum } : {}),
      ...(parsedBlobs ? { blobs: parsedBlobs } : {}),
    };
  }

  // Case 2: Standard JSON local backup — strictly delegate to parseBackupContent (NO bypass)
  if (parsedRaw.formatName === 'SIGNAL-LOCAL-BACKUP') {
    return parseBackupContent(text);
  }

  throw new Error(
    'Format berkas tidak dikenali sebagai arsip cadangan resmi SIGNAL (.signal atau SIGNAL-LOCAL-BACKUP).'
  );
}

export async function parseSignalFileDetailed(file: File): Promise<BackupParseResult> {
  const text = await file.text();
  return parseSignalContent(text);
}

/**
 * Parses and verifies an uploaded .signal or SIGNAL-LOCAL-BACKUP .json file.
 */
export async function parseSignalFile(file: File): Promise<AppState> {
  const result = await parseSignalFileDetailed(file);
  return result.state;
}

/**
 * Estimates storage usage in IndexedDB.
 */
export async function getStorageEstimate(): Promise<{
  usageMb: string;
  quotaMb: string;
  percent: number;
}> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    const usage = est.usage || 0;
    const quota = est.quota || 1;
    return {
      usageMb: (usage / (1024 * 1024)).toFixed(1),
      quotaMb: (quota / (1024 * 1024)).toFixed(0),
      percent: Math.min(100, Math.round((usage / quota) * 100)),
    };
  }
  return { usageMb: '1.2', quotaMb: '500', percent: 1 };
}
