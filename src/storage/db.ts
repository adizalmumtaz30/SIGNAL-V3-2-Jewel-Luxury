import { openDB, type IDBPDatabase } from 'idb';
import type { AppState, ScheduleEntry, TeacherAssignment } from '../domain/types';
import { createDemoState } from '../domain/seed';
import { buildTimeSlots, createDefaultPeriodDefinitions } from '../domain/time';
import { generateSchedule } from '../domain/generator';
import {
  migrateLegacyRoleTitlesToAssignments,
  normalizeTeacherAssignment,
} from '../domain/teacherAssignments';
import {
  VALID_DOCUMENT_DIRECTIONS,
  VALID_DOCUMENT_KINDS,
  VALID_DOCUMENT_STATUSES,
} from '../domain/persuratan/selectors';
import {
  VALID_TEMPLATE_CATEGORIES,
  collectAllTemplates,
  sanitizeTemplatePreferences,
} from '../domain/persuratan/templates/selectors';
import { validateStudioState } from '../domain/persuratan/studio/contentValidation';
import { computeCanonicalSha256, computeSha256Hex, isSha256Hex } from './checksum';

export const DB_NAME = 'signal-academic-studio';
export const DB_VERSION = 3;
export const STORE_NAME = 'workspace';
export const SNAPSHOT_STORE_NAME = 'snapshots';
export const AUDIT_STORE_NAME = 'audit_log';
export const ASSIGNMENT_STORE_NAME = 'teacher_assignments';

export const CURRENT_APP_SCHEMA_VERSION = 2;
export const CURRENT_BACKUP_FORMAT_VERSION = 2;

export type BackupVerificationStatus = 'verified' | 'legacy_unverified';

export interface BackupParseResult {
  state: AppState;
  formatName: 'SIGNAL-LOCAL-BACKUP' | 'SIGNAL-V5-SEAL';
  formatVersion: number;
  schemaVersion: number;
  verification: BackupVerificationStatus;
  warnings: string[];
  checksum?: string;
}

export interface BackupEnvelope {
  formatName: 'SIGNAL-LOCAL-BACKUP';
  formatVersion: number;
  schemaVersion: number;
  appVersion: string;
  checksumAlgorithm: 'SHA-256';
  exportedAt: string;
  payload: AppState;
  checksum: string;
}

export interface UpgradeStoreLike {
  createIndex: (name: string, keyPath: string) => unknown;
}

export interface UpgradeDbLike {
  objectStoreNames: {
    contains: (name: string) => boolean;
  };
  createObjectStore: (name: string, options: { keyPath: string }) => UpgradeStoreLike;
}

export interface StoreAccessLike {
  get: (key: string) => Promise<unknown>;
  put: (value: unknown) => Promise<unknown>;
  getAll?: () => Promise<unknown[]>;
  clear?: () => Promise<void>;
}

export interface TransactionLike {
  objectStore: (name: string) => StoreAccessLike;
  done: Promise<void>;
}

export interface SignalDbLike {
  get: (storeName: string, key: string) => Promise<unknown>;
  put: (storeName: string, value: unknown) => Promise<unknown>;
  delete: (storeName: string, key: string) => Promise<void>;
  getAll: (storeName: string) => Promise<unknown[]>;
  transaction: (storeNames: string[], mode: 'readonly' | 'readwrite') => TransactionLike;
}

let dbPromise: Promise<IDBPDatabase> | undefined;

export function resetSignalDBPromise(): void {
  dbPromise = undefined;
}

/**
 * Pure, idempotent, non-destructive IndexedDB schema upgrade helper (v0/v1/v2 -> v3).
 * Never calls deleteDatabase() or deletes old object stores.
 */
export function applySignalDatabaseUpgrade(db: UpgradeDbLike, _oldVersion: number): void {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
  }
  if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) {
    const snapshotStore = db.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' });
    snapshotStore.createIndex('timestamp', 'timestamp');
    snapshotStore.createIndex('isStarred', 'isStarred');
  }
  if (!db.objectStoreNames.contains(AUDIT_STORE_NAME)) {
    const auditStore = db.createObjectStore(AUDIT_STORE_NAME, { keyPath: 'id' });
    auditStore.createIndex('timestamp', 'timestamp');
  }
  if (!db.objectStoreNames.contains(ASSIGNMENT_STORE_NAME)) {
    const assignmentStore = db.createObjectStore(ASSIGNMENT_STORE_NAME, { keyPath: 'id' });
    assignmentStore.createIndex('teacherId', 'teacherId');
    assignmentStore.createIndex('status', 'status');
    assignmentStore.createIndex('sourceType', 'sourceType');
  }
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRecordArray(arr: unknown, label: string): void {
  if (!Array.isArray(arr)) {
    throw new Error(`Struktur ${label} pada berkas cadangan tidak valid.`);
  }
  for (let i = 0; i < arr.length; i++) {
    const item = arr[i];
    if (!isPlainObject(item) || typeof item.id !== 'string' || !item.id.trim()) {
      throw new Error(`Entri ${label} tidak lengkap atau rusak.`);
    }
  }
}

/**
 * Validates minimum AppState structural integrity without leaking personal data in error messages.
 */
export function validateAppStateStructure(candidate: unknown): asserts candidate is AppState {
  if (!isPlainObject(candidate)) {
    throw new Error('Isi data cadangan bukan objek aplikasi yang valid.');
  }

  if (!isPlainObject(candidate.settings)) {
    throw new Error('Konfigurasi pengaturan (settings) pada berkas cadangan tidak valid.');
  }
  if (typeof candidate.settings.schoolName !== 'string' || !Array.isArray(candidate.settings.activeDays)) {
    throw new Error('Identitas atau hari aktif pada pengaturan cadangan tidak lengkap.');
  }

  validateRecordArray(candidate.classes, 'kelas');
  validateRecordArray(candidate.teachers, 'guru');
  validateRecordArray(candidate.subjects, 'mata pelajaran');
  validateRecordArray(candidate.requirements, 'alokasi kebutuhan JP');

  if (!Array.isArray(candidate.slots)) {
    throw new Error('Struktur slot waktu pada berkas cadangan tidak valid.');
  }
  if (!Array.isArray(candidate.candidates) || !Array.isArray(candidate.history)) {
    throw new Error('Struktur kandidat atau riwayat jadwal pada berkas cadangan tidak valid.');
  }

  if (candidate.draft !== null && !Array.isArray(candidate.draft)) {
    throw new Error('Format draft jadwal pada berkas cadangan tidak valid.');
  }
  if (candidate.activeSchedule !== null && !Array.isArray(candidate.activeSchedule)) {
    throw new Error('Format jadwal aktif pada berkas cadangan tidak valid.');
  }

  if (candidate.attendance !== undefined) {
    validateRecordArray(candidate.attendance, 'presensi');
  }
  if (candidate.holidays !== undefined) {
    validateRecordArray(candidate.holidays, 'hari libur');
  }
  if (candidate.teacherAssignments !== undefined) {
    if (!Array.isArray(candidate.teacherAssignments)) {
      throw new Error('Struktur penugasan guru pada berkas cadangan tidak valid.');
    }
    for (const item of candidate.teacherAssignments) {
      if (
        !isPlainObject(item) ||
        typeof item.id !== 'string' ||
        typeof item.teacherId !== 'string' ||
        typeof item.title !== 'string'
      ) {
        throw new Error('Entri penugasan guru pada berkas cadangan rusak.');
      }
    }
  }
  if (candidate.documents !== undefined) {
    if (!Array.isArray(candidate.documents)) {
      throw new Error('Struktur daftar dokumen persuratan pada berkas cadangan tidak valid.');
    }
    for (const item of candidate.documents) {
      if (
        !isPlainObject(item) ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.title !== 'string' ||
        typeof item.subject !== 'string' ||
        typeof item.documentDate !== 'string' ||
        (item.documentNumber !== null && typeof item.documentNumber !== 'string') ||
        typeof item.direction !== 'string' ||
        !VALID_DOCUMENT_DIRECTIONS.has(item.direction) ||
        typeof item.documentType !== 'string' ||
        !VALID_DOCUMENT_KINDS.has(item.documentType as never) ||
        typeof item.status !== 'string' ||
        !VALID_DOCUMENT_STATUSES.has(item.status as never)
      ) {
        throw new Error('Entri metadata dokumen persuratan pada berkas cadangan tidak lengkap atau rusak.');
      }
    }
  }
  if (candidate.customTemplates !== undefined) {
    if (!Array.isArray(candidate.customTemplates)) {
      throw new Error('Struktur daftar template madrasah pada berkas cadangan tidak valid.');
    }
    for (const item of candidate.customTemplates) {
      if (
        !isPlainObject(item) ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.name !== 'string' ||
        !item.name.trim() ||
        typeof item.category !== 'string' ||
        !VALID_TEMPLATE_CATEGORIES.has(item.category as never) ||
        typeof item.version !== 'string' ||
        (item.source !== 'MADRASAH' && item.source !== 'USER')
      ) {
        throw new Error('Entri template madrasah pada berkas cadangan tidak lengkap atau rusak.');
      }
    }
  }
  if (candidate.intakeDrafts !== undefined) {
    if (!Array.isArray(candidate.intakeDrafts)) {
      throw new Error('Struktur daftar draft intake S03 pada berkas cadangan tidak valid.');
    }
    for (const item of candidate.intakeDrafts) {
      if (
        !isPlainObject(item) ||
        typeof item.id !== 'string' ||
        !item.id.trim() ||
        typeof item.documentId !== 'string' ||
        !item.documentId.trim() ||
        typeof item.templateId !== 'string' ||
        !item.templateId.trim() ||
        typeof item.templateVersion !== 'string' ||
        typeof item.title !== 'string' ||
        typeof item.documentDate !== 'string' ||
        !isPlainObject(item.fieldValues) ||
        !isPlainObject(item.templateSnapshot) ||
        !Array.isArray(item.sourceSnapshots)
      ) {
        throw new Error('Entri draft intake S03 pada berkas cadangan tidak lengkap atau rusak.');
      }
      if (item.studio !== undefined) {
        const studioCheck = validateStudioState(item.studio);
        if (!studioCheck.valid) {
          throw new Error(
            studioCheck.error ?? 'Struktur naskah Document Studio S04 pada berkas cadangan rusak.'
          );
        }
      }
    }
  }
  if (candidate.templatePreferences !== undefined) {
    if (!isPlainObject(candidate.templatePreferences)) {
      throw new Error('Struktur preferensi template pada berkas cadangan tidak valid.');
    }
    const prefs = candidate.templatePreferences;
    if (
      (prefs.favoriteTemplateIds !== undefined && !Array.isArray(prefs.favoriteTemplateIds)) ||
      (prefs.recentTemplates !== undefined && !Array.isArray(prefs.recentTemplates)) ||
      (prefs.selectedTemplateId !== undefined &&
        prefs.selectedTemplateId !== null &&
        typeof prefs.selectedTemplateId !== 'string')
    ) {
      throw new Error('Data favorit/riwayat template pada berkas cadangan tidak valid.');
    }
  }
}

/**
 * Non-destructive, idempotent schema migration from v1 AppState to v2 AppState (IDB v3).
 * Does NOT regenerate schedules and does NOT overwrite activeSchedule, draft, history,
 * requirements, attendance, holidays, Teacher.roleTitle, or madrasah identity settings.
 */
export function migrateAppStateSchema(
  rawState: AppState,
  timestamp: string = new Date().toISOString()
): { state: AppState; changed: boolean } {
  const cloned = JSON.parse(JSON.stringify(rawState)) as AppState;
  let changed = false;

  if (!Array.isArray(cloned.attendance)) {
    cloned.attendance = [];
    changed = true;
  }
  if (!Array.isArray(cloned.holidays)) {
    cloned.holidays = [];
    changed = true;
  }
  if (!Array.isArray(cloned.documents)) {
    cloned.documents = [];
    changed = true;
  }
  if (!Array.isArray(cloned.intakeDrafts)) {
    cloned.intakeDrafts = [];
    changed = true;
  }
  if (!Array.isArray(cloned.customTemplates)) {
    cloned.customTemplates = [];
    changed = true;
  }

  const availableTemplates = collectAllTemplates(cloned.customTemplates);
  if (!isPlainObject(cloned.templatePreferences)) {
    cloned.templatePreferences = {
      favoriteTemplateIds: [],
      recentTemplates: [],
      selectedTemplateId: null,
    };
    changed = true;
  } else {
    const sanitizedPrefs = sanitizeTemplatePreferences(cloned.templatePreferences, availableTemplates);
    if (JSON.stringify(sanitizedPrefs) !== JSON.stringify(cloned.templatePreferences)) {
      cloned.templatePreferences = sanitizedPrefs;
      changed = true;
    }
  }

  const prevAssignments = Array.isArray(cloned.teacherAssignments) ? cloned.teacherAssignments : undefined;
  const migratedAssignments = migrateLegacyRoleTitlesToAssignments(cloned, timestamp);
  if (
    !prevAssignments ||
    prevAssignments.length !== migratedAssignments.length ||
    JSON.stringify(prevAssignments) !== JSON.stringify(migratedAssignments)
  ) {
    cloned.teacherAssignments = migratedAssignments;
    changed = true;
  }

  if (!cloned.schemaVersion || cloned.schemaVersion < CURRENT_APP_SCHEMA_VERSION) {
    cloned.schemaVersion = CURRENT_APP_SCHEMA_VERSION;
    changed = true;
  }

  return { state: cloned, changed };
}

/**
 * Idempotent v2 -> v3 data migration inside an atomic transaction across workspace & teacher_assignments.
 * Never touches snapshots, audit_log, activeSchedule, draft, history, requirements, attendance, or settings.
 */
export async function migrateWorkspaceRecordInDatabase(
  db: SignalDbLike,
  timestamp: string = new Date().toISOString()
): Promise<{ migrated: boolean; assignmentsSynced: number }> {
  const tx = db.transaction([STORE_NAME, ASSIGNMENT_STORE_NAME], 'readwrite');
  const workspaceStore = tx.objectStore(STORE_NAME);
  const assignmentStore = tx.objectStore(ASSIGNMENT_STORE_NAME);

  const row = (await workspaceStore.get('main')) as { id?: string; state?: AppState; savedAt?: string } | undefined;
  if (!row?.state) {
    await tx.done;
    return { migrated: false, assignmentsSynced: 0 };
  }

  const { state: migratedState, changed } = migrateAppStateSchema(row.state, timestamp);
  const assignments = migratedState.teacherAssignments ?? [];

  if (changed) {
    await workspaceStore.put({
      id: 'main',
      state: migratedState,
      savedAt: row.savedAt ?? timestamp,
      migratedAt: timestamp,
    });
  }

  const existingAssignments = assignmentStore.getAll ? ((await assignmentStore.getAll()) as TeacherAssignment[]) : [];
  const existingById = new Map(existingAssignments.map((item) => [item.id, item]));
  let assignmentsSynced = 0;

  for (const assignment of assignments) {
    const normalized = normalizeTeacherAssignment(assignment, timestamp);
    const prev = existingById.get(normalized.id);
    if (!prev || JSON.stringify(prev) !== JSON.stringify(normalized)) {
      await assignmentStore.put(normalized);
      assignmentsSynced++;
    }
  }

  await tx.done;
  return { migrated: changed, assignmentsSynced };
}

export function openSignalDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        applySignalDatabaseUpgrade(db as unknown as UpgradeDbLike, oldVersion);
      },
    })
      .then(async (db) => {
        await migrateWorkspaceRecordInDatabase(db as unknown as SignalDbLike);
        return db;
      })
      .catch((error) => {
        dbPromise = undefined;
        throw error;
      });
  }
  return dbPromise;
}

export async function loadAppState(): Promise<AppState> {
  try {
    const db = await openSignalDB();
    const row = (await db.get(STORE_NAME, 'main')) as { id?: string; state?: AppState } | undefined;
    if (row?.state) {
      const { state } = migrateAppStateSchema(row.state);

      if (!state.settings.periodMinutes) state.settings.periodMinutes = 40;
      if (state.dataMode !== 'custom') {
        if (!state.settings.ministry) state.settings.ministry = 'KEMENTERIAN AGAMA REPUBLIK INDONESIA';
        if (!state.settings.regionalOffice) state.settings.regionalOffice = 'KANTOR KEMENTERIAN AGAMA KABUPATEN MALANG';
        if (!state.settings.address) state.settings.address = 'Jl. Raya Cendekia No. 45, Sumberpucung';
        if (!state.settings.city) state.settings.city = 'Kabupaten Malang';
        if (!state.settings.postalCode) state.settings.postalCode = '65165';
        if (!state.settings.npsn) state.settings.npsn = '20580001';
        if (!state.settings.nsm) state.settings.nsm = '121235070001';
        if (!state.settings.phone) state.settings.phone = '0812-3456-7890 / (0341) 395123';
        if (!state.settings.email) state.settings.email = 'mts.cendekia@kemenag.go.id';
        if (!state.settings.headmasterName) state.settings.headmasterName = 'Drs. H. M. Zainuddin, M.Pd.I';
        if (!state.settings.headmasterNip) state.settings.headmasterNip = '197405101999031003';
        if (!state.settings.headmasterTitle) state.settings.headmasterTitle = 'Kepala Madrasah';
        if (!state.settings.curriculumLeaderName) state.settings.curriculumLeaderName = 'Ahmad Fauzi, S.Pd.';
        if (!state.settings.curriculumLeaderNip) state.settings.curriculumLeaderNip = '198204122008011015';
        if (!state.settings.curriculumLeaderTitle) state.settings.curriculumLeaderTitle = 'Waka Bidang Kurikulum';
      }

      // Ensure periodDefinitions has valid KBM/non-KBM schedule structure
      if (!state.settings.periodDefinitions || state.settings.periodDefinitions.length === 0) {
        state.settings.periodDefinitions = createDefaultPeriodDefinitions(
          state.settings.teachingPeriodsPerDay ?? 8,
          [3, 6],
          state.settings.periodMinutes ?? 40,
        );
        state.settings.breakAfterJP = [3, 6];
      }
      state.slots = buildTimeSlots(state.settings);

      // Verify schedule entries: purge invalid slot placements; only auto-seed demo schedule if dataMode === 'demo'
      const validSlots = new Map<string, boolean>();
      for (const slot of state.slots) {
        if (slot.kind === 'TEACHING' && slot.active && slot.jpNo != null) {
          validSlots.set(`${slot.day}-${slot.jpNo}`, true);
        }
      }
      const isCleanEntry = (e: ScheduleEntry) => validSlots.get(`${e.day}-${e.jpNo}`) === true;

      if (Array.isArray(state.activeSchedule)) {
        state.activeSchedule = state.activeSchedule.filter(isCleanEntry);
      }
      if (Array.isArray(state.draft)) {
        state.draft = state.draft.filter(isCleanEntry);
      }

      if (state.dataMode === 'demo' && (!state.activeSchedule || state.activeSchedule.length === 0)) {
        const genRes = generateSchedule(state, 42);
        if (genRes.status === 'SUCCESS' && genRes.candidate) {
          state.activeSchedule = genRes.candidate.entries;
          state.candidates = [genRes.candidate];
          state.draft = null;
        }
      }

      await saveAppStateWithDb(db as unknown as SignalDbLike, state);
      return state;
    }

    const initial = createDemoState();
    await saveAppStateWithDb(db as unknown as SignalDbLike, initial);
    return initial;
  } catch (error) {
    console.error('IndexedDB unavailable:', error);
    return createDemoState();
  }
}

export async function saveAppStateWithDb(db: SignalDbLike, state: AppState): Promise<void> {
  const now = new Date().toISOString();
  const normalized = migrateAppStateSchema(state, now).state;
  const assignments = normalized.teacherAssignments ?? [];

  const tx = db.transaction([STORE_NAME, ASSIGNMENT_STORE_NAME], 'readwrite');
  const workspaceStore = tx.objectStore(STORE_NAME);
  const assignmentStore = tx.objectStore(ASSIGNMENT_STORE_NAME);

  await workspaceStore.put({ id: 'main', state: normalized, savedAt: now });
  if (assignmentStore.clear) {
    await assignmentStore.clear();
  }
  for (const assignment of assignments) {
    await assignmentStore.put(normalizeTeacherAssignment(assignment, now));
  }
  await tx.done;
}

export async function saveAppState(state: AppState): Promise<void> {
  const db = await openSignalDB();
  await saveAppStateWithDb(db as unknown as SignalDbLike, state);
}

export async function restoreWorkspaceSafelyWithDb(db: SignalDbLike, restoredState: AppState): Promise<AppState> {
  validateAppStateStructure(restoredState);
  const { state: migrated } = migrateAppStateSchema(restoredState);
  await saveAppStateWithDb(db, migrated);
  return migrated;
}

export async function restoreWorkspaceSafely(restoredState: AppState): Promise<AppState> {
  validateAppStateStructure(restoredState);
  const db = await openSignalDB();
  return restoreWorkspaceSafelyWithDb(db as unknown as SignalDbLike, restoredState);
}

export async function clearAppState(): Promise<void> {
  const db = await openSignalDB();
  const tx = db.transaction([STORE_NAME, ASSIGNMENT_STORE_NAME], 'readwrite');
  await tx.objectStore(STORE_NAME).delete('main');
  await tx.objectStore(ASSIGNMENT_STORE_NAME).clear();
  await tx.done;
}

export async function buildBackupEnvelope(state: AppState): Promise<BackupEnvelope> {
  const { state: normalized } = migrateAppStateSchema(state);
  const envelopeBody = {
    formatName: 'SIGNAL-LOCAL-BACKUP' as const,
    formatVersion: CURRENT_BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_APP_SCHEMA_VERSION,
    appVersion: '1.2.1',
    checksumAlgorithm: 'SHA-256' as const,
    exportedAt: new Date().toISOString(),
    payload: normalized,
  };
  const checksum = await computeCanonicalSha256(envelopeBody);
  return {
    ...envelopeBody,
    checksum,
  };
}

export async function exportAppState(state: AppState): Promise<void> {
  const envelope = await buildBackupEnvelope(state);
  const downloadPayload = JSON.stringify(envelope, null, 2);
  const blob = new Blob([downloadPayload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SIGNAL-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Parses and strictly verifies a SIGNAL-LOCAL-BACKUP JSON string.
 * Supports v1 (legacy) and v2 (current), enforces SHA-256 checksum on v2+ and any file carrying checksum,
 * and marks v1 backups without checksum explicitly as `legacy_unverified`.
 */
export async function parseBackupContent(text: string): Promise<BackupParseResult> {
  let parsedRaw: unknown;
  try {
    parsedRaw = JSON.parse(text);
  } catch {
    throw new Error('Berkas backup bukan JSON yang valid atau rusak.');
  }

  if (!isPlainObject(parsedRaw) || parsedRaw.formatName !== 'SIGNAL-LOCAL-BACKUP' || !isPlainObject(parsedRaw.payload)) {
    throw new Error('Format file tidak dikenali sebagai backup SIGNAL-LOCAL-BACKUP.');
  }

  const schemaVersion = parsedRaw.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    throw new Error('Versi skema backup tidak cocok atau tidak didukung oleh aplikasi ini.');
  }

  const formatVersionRaw = parsedRaw.formatVersion;
  if (formatVersionRaw !== undefined && formatVersionRaw !== 1 && formatVersionRaw !== 2) {
    throw new Error('Versi format backup tidak dikenali oleh aplikasi ini.');
  }
  const formatVersion = typeof formatVersionRaw === 'number' ? formatVersionRaw : schemaVersion === 1 ? 1 : 2;

  const warnings: string[] = [];
  let verification: BackupVerificationStatus = 'verified';

  const { checksum, ...withoutChecksum } = parsedRaw;
  const hasChecksumKey = Object.prototype.hasOwnProperty.call(parsedRaw, 'checksum');

  if (formatVersion >= 2 || schemaVersion >= 2) {
    if (!isSha256Hex(checksum)) {
      throw new Error('Berkas backup versi terbaru wajib menyertakan checksum SHA-256 yang valid.');
    }
    const expectedCanonical = await computeCanonicalSha256(withoutChecksum);
    if (checksum.toLowerCase() !== expectedCanonical) {
      throw new Error('Checksum SHA-256 backup tidak cocok. File mungkin berubah atau rusak.');
    }
  } else if (hasChecksumKey) {
    if (!isSha256Hex(checksum)) {
      throw new Error('Format checksum SHA-256 pada backup tidak valid.');
    }
    const expectedCanonical = await computeCanonicalSha256(withoutChecksum);
    const expectedLegacy = await computeSha256Hex(JSON.stringify(withoutChecksum));
    const lowerChecksum = checksum.toLowerCase();
    if (lowerChecksum !== expectedCanonical && lowerChecksum !== expectedLegacy) {
      throw new Error('Checksum SHA-256 backup tidak cocok. File mungkin berubah atau rusak.');
    }
  } else {
    verification = 'legacy_unverified';
    warnings.push(
      'Berkas backup format lama (v1) ini tidak memiliki checksum SHA-256 sehingga integritas datanya tidak dapat diverifikasi (legacy/unverified).'
    );
  }

  validateAppStateStructure(parsedRaw.payload);
  const { state: migrated } = migrateAppStateSchema(parsedRaw.payload);

  return {
    state: migrated,
    formatName: 'SIGNAL-LOCAL-BACKUP',
    formatVersion,
    schemaVersion,
    verification,
    warnings,
    ...(typeof checksum === 'string' ? { checksum } : {}),
  };
}

export async function parseBackupFileDetailed(file: File): Promise<BackupParseResult> {
  const text = await file.text();
  return parseBackupContent(text);
}

export async function parseBackupFile(file: File): Promise<AppState> {
  const result = await parseBackupFileDetailed(file);
  return result.state;
}
