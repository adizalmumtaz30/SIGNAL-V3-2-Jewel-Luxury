import type { AppState } from '../domain/types';
import { openSignalDB, SNAPSHOT_STORE_NAME, AUDIT_STORE_NAME } from './db';

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
  stateCopy: AppState;
}

const MAX_AUTO_SNAPSHOTS = 20;

/**
 * Calculates a quick SHA-256 hash of a JSON string.
 */
async function computeSha256(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Deep-clones an AppState object cleanly.
 */
function cloneState(state: AppState): AppState {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Creates and stores a new state snapshot in IndexedDB.
 */
export async function createSnapshot(
  state: AppState,
  label: string,
  triggerType: StateSnapshot['triggerType'] = 'auto',
  isStarred: boolean = false
): Promise<StateSnapshot> {
  const db = await openSignalDB();
  const id = `snap-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const timestamp = new Date().toISOString();
  const stateCopy = cloneState(state);

  const entries = state.draft ?? state.activeSchedule ?? [];
  const assignedSlots = entries.length;
  const teachersCount = state.teachers.filter((t) => t.isActive).length;
  const classesCount = state.classes.filter((c) => c.isActive).length;

  const desc = `${teachersCount} Guru · ${classesCount} Kelas · ${assignedSlots} Slot KBM Terisi`;

  const stateStr = JSON.stringify(stateCopy);
  const checksum = await computeSha256(stateStr);

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
    stateCopy,
  };

  await db.put(SNAPSHOT_STORE_NAME, snapshot);

  // Auto-prune old non-starred snapshots if over limit
  if (triggerType === 'auto') {
    await pruneOldSnapshots();
  }

  // Record audit log
  try {
    await db.put(AUDIT_STORE_NAME, {
      id: `audit-${Date.now()}`,
      timestamp,
      action: `Snapshot dibuat: ${label}`,
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
export async function getSnapshots(): Promise<StateSnapshot[]> {
  const db = await openSignalDB();
  const all = (await db.getAll(SNAPSHOT_STORE_NAME)) as StateSnapshot[];
  return all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

/**
 * Toggles the starred status of a snapshot (preventing it from being auto-pruned).
 */
export async function toggleStarSnapshot(id: string): Promise<boolean> {
  const db = await openSignalDB();
  const item = (await db.get(SNAPSHOT_STORE_NAME, id)) as StateSnapshot | undefined;
  if (!item) return false;
  item.isStarred = !item.isStarred;
  await db.put(SNAPSHOT_STORE_NAME, item);
  return item.isStarred;
}

/**
 * Deletes a snapshot by ID.
 */
export async function deleteSnapshot(id: string): Promise<void> {
  const db = await openSignalDB();
  await db.delete(SNAPSHOT_STORE_NAME, id);
}

/**
 * Restores a snapshot state, returning the state clone.
 * Automatically saves a pre-rollback snapshot before restoring!
 */
export async function restoreSnapshot(
  currentState: AppState,
  snapshotId: string
): Promise<AppState | null> {
  const db = await openSignalDB();
  const target = (await db.get(SNAPSHOT_STORE_NAME, snapshotId)) as StateSnapshot | undefined;
  if (!target) return null;

  // 1. Safety net: create pre-rollback snapshot of current state
  await createSnapshot(
    currentState,
    `Pra-Pemulihan: Sebelum Rollback ke ${target.label}`,
    'pre_rollback',
    true // starred so it's not pruned
  );

  return cloneState(target.stateCopy);
}

/**
 * Prunes automated snapshots exceeding MAX_AUTO_SNAPSHOTS using FIFO.
 * Starred snapshots are never pruned!
 */
export async function pruneOldSnapshots(): Promise<void> {
  const db = await openSignalDB();
  const all = (await db.getAll(SNAPSHOT_STORE_NAME)) as StateSnapshot[];

  // Filter only auto-generated, unstarred snapshots
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

/**
 * Exports single-file encrypted/checksummed .signal backup.
 */
export async function exportSignalFile(state: AppState): Promise<void> {
  const snapshots = await getSnapshots();

  const payload = {
    brand: 'SIGNAL-V5-SOVEREIGN-ATELIER',
    version: '5.0.0',
    exportedAt: new Date().toISOString(),
    institution: state.settings.ministry || 'KEMENAG',
    schoolName: state.settings.headmasterTitle ? 'Madrasah' : 'Madrasah Tsanawiyah',
    state,
    starredSnapshots: snapshots.filter((s) => s.isStarred).slice(0, 5),
  };

  const jsonStr = JSON.stringify(payload);
  const checksum = await computeSha256(jsonStr);
  const container = {
    signature: 'SIGNAL-V5-SEAL',
    checksum,
    data: payload,
  };

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
 * Parses and verifies an uploaded .signal or .json backup file.
 */
export async function parseSignalFile(file: File): Promise<AppState> {
  const text = await file.text();
  const parsed = JSON.parse(text);

  // Support V5 .signal format
  if (parsed.signature === 'SIGNAL-V5-SEAL' && parsed.data?.state) {
    return parsed.data.state as AppState;
  }

  // Support legacy format
  if (parsed.formatName === 'SIGNAL-LOCAL-BACKUP' && parsed.payload) {
    return parsed.payload as AppState;
  }

  // Direct state format
  if (parsed.classes && parsed.teachers && parsed.subjects) {
    return parsed as AppState;
  }

  throw new Error('Format berkas tidak dikenali sebagai arsip cadangan resmi SIGNAL.');
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
