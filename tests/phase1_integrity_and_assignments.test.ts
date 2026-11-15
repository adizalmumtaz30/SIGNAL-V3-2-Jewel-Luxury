import { describe, expect, it } from 'vitest';
import { createDemoState } from '../src/domain/seed';
import type { AppState, TeacherAssignment } from '../src/domain/types';
import {
  isGenericRoleTitle,
  isValidIsoDate,
  migrateLegacyRoleTitlesToAssignments,
  validateTeacherAssignment,
} from '../src/domain/teacherAssignments';
import { canonicalStringify, computeCanonicalSha256, computeSha256Hex } from '../src/storage/checksum';
import {
  ASSIGNMENT_STORE_NAME,
  AUDIT_STORE_NAME,
  SNAPSHOT_STORE_NAME,
  STORE_NAME,
  applySignalDatabaseUpgrade,
  buildBackupEnvelope,
  migrateAppStateSchema,
  migrateWorkspaceRecordInDatabase,
  parseBackupContent,
  restoreWorkspaceSafelyWithDb,
  type SignalDbLike,
  type UpgradeDbLike,
} from '../src/storage/db';
import {
  buildSignalContainer,
  createSnapshot,
  getSnapshots,
  parseSignalContent,
  restoreSnapshot,
} from '../src/storage/snapshotEngine';

/**
 * Lightweight in-memory IndexedDB simulator for Node Vitest environment.
 * Supports atomic single-transaction rollback verification cleanly.
 */
function createMemorySignalDb(options?: { failOnAssignmentPut?: boolean }) {
  const stores = new Map<string, Map<string, unknown>>();
  const indexes = new Map<string, Set<string>>();

  const upgradeAdapter: UpgradeDbLike = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore: (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      if (!indexes.has(name)) indexes.set(name, new Set());
      return {
        createIndex: (indexName: string) => {
          indexes.get(name)!.add(indexName);
        },
      };
    },
  };

  const cloneVal = <T>(val: T): T => JSON.parse(JSON.stringify(val)) as T;

  const db: SignalDbLike = {
    async get(storeName, key) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`ObjectStore '${storeName}' does not exist`);
      const val = store.get(key);
      return val === undefined ? undefined : cloneVal(val);
    },
    async put(storeName, value) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`ObjectStore '${storeName}' does not exist`);
      const record = value as { id: string };
      store.set(record.id, cloneVal(record));
      return record.id;
    },
    async delete(storeName, key) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`ObjectStore '${storeName}' does not exist`);
      store.delete(key);
    },
    async getAll(storeName) {
      const store = stores.get(storeName);
      if (!store) throw new Error(`ObjectStore '${storeName}' does not exist`);
      return Array.from(store.values()).map((v) => cloneVal(v));
    },
    transaction(storeNames, mode) {
      const staging = new Map<string, Map<string, unknown>>();
      for (const name of storeNames) {
        const origin = stores.get(name);
        if (!origin) throw new Error(`ObjectStore '${name}' does not exist`);
        staging.set(name, new Map(Array.from(origin.entries()).map(([k, v]) => [k, cloneVal(v)])));
      }

      let aborted = false;

      const access = (name: string) => ({
        async get(key: string) {
          const val = staging.get(name)!.get(key);
          return val === undefined ? undefined : cloneVal(val);
        },
        async put(value: unknown) {
          if (mode !== 'readwrite') throw new Error('Readonly transaction');
          if (options?.failOnAssignmentPut && name === ASSIGNMENT_STORE_NAME) {
            aborted = true;
            throw new Error('Simulated IDB transaction failure on teacher_assignments');
          }
          const rec = value as { id: string };
          staging.get(name)!.set(rec.id, cloneVal(rec));
          return rec.id;
        },
        async getAll() {
          return Array.from(staging.get(name)!.values()).map((v) => cloneVal(v));
        },
        async clear() {
          if (mode !== 'readwrite') throw new Error('Readonly transaction');
          staging.get(name)!.clear();
        },
      });

      return {
        objectStore: access,
        get done() {
          return (async () => {
            if (aborted) throw new Error('Transaction aborted');
            if (mode === 'readwrite') {
              for (const [name, stagedMap] of staging.entries()) {
                stores.set(name, stagedMap);
              }
            }
          })();
        },
      };
    },
  };

  return { db, upgradeAdapter, stores, indexes };
}

function createLegacyV1State(): AppState {
  const demo = createDemoState();
  const cloned = JSON.parse(JSON.stringify(demo)) as AppState;
  cloned.schemaVersion = 1;
  delete cloned.teacherAssignments;
  cloned.dataMode = 'custom';
  cloned.settings.schoolName = 'MTs Al-Hikmah Terpadu';
  cloned.settings.headmasterName = 'H. Abdurrahman, M.Pd.';
  // Add a teacher with pure generic roleTitle to verify non-promotion
  cloned.teachers.push({
    id: 'TCH-GENERIC',
    code: 'T-99',
    name: 'Siti Aminah, S.Pd',
    subjectIds: ['SUB-MAT'],
    maxWeeklyJP: 18,
    isActive: true,
    roleTitle: 'Guru Mapel',
  });
  return cloned;
}

describe('Tahap 1 Group A — Integritas Backup JSON (SIGNAL-LOCAL-BACKUP)', () => {
  it('round-trip export + parseBackupContent terverifikasi SHA-256 dan bebas peringatan', async () => {
    const demo = createDemoState();
    const envelope = await buildBackupEnvelope(demo);
    const result = await parseBackupContent(JSON.stringify(envelope, null, 2));

    expect(result.verification).toBe('verified');
    expect(result.warnings).toHaveLength(0);
    expect(result.formatName).toBe('SIGNAL-LOCAL-BACKUP');
    expect(result.formatVersion).toBe(2);
    expect(result.schemaVersion).toBe(2);
    expect(result.state.classes).toHaveLength(demo.classes.length);
    expect(result.state.teachers).toHaveLength(demo.teachers.length);
  });

  it('kanonikalisasi JSON tahan terhadap perubahan urutan properti objek', async () => {
    const state = createDemoState();
    const envelope = await buildBackupEnvelope(state);
    // Reorder keys at top-level and inside settings
    const reordered = {
      checksum: envelope.checksum,
      payload: {
        teacherAssignments: envelope.payload.teacherAssignments,
        holidays: envelope.payload.holidays,
        attendance: envelope.payload.attendance,
        lastBackupAt: envelope.payload.lastBackupAt,
        history: envelope.payload.history,
        candidates: envelope.payload.candidates,
        activeSchedule: envelope.payload.activeSchedule,
        draft: envelope.payload.draft,
        slots: envelope.payload.slots,
        requirements: envelope.payload.requirements,
        subjects: envelope.payload.subjects,
        teachers: envelope.payload.teachers,
        classes: envelope.payload.classes,
        settings: {
          ...Object.fromEntries(Object.entries(envelope.payload.settings).reverse()),
        },
        dataMode: envelope.payload.dataMode,
        schemaVersion: envelope.payload.schemaVersion,
      },
      exportedAt: envelope.exportedAt,
      checksumAlgorithm: envelope.checksumAlgorithm,
      appVersion: envelope.appVersion,
      schemaVersion: envelope.schemaVersion,
      formatVersion: envelope.formatVersion,
      formatName: envelope.formatName,
    };

    expect(canonicalStringify(envelope.payload)).toBe(canonicalStringify(reordered.payload));
    const parsed = await parseBackupContent(JSON.stringify(reordered));
    expect(parsed.verification).toBe('verified');
  });

  it('menolak backup jika 1 karakter/byte payload diubah', async () => {
    const envelope = await buildBackupEnvelope(createDemoState());
    envelope.payload.settings.schoolName = `${envelope.payload.settings.schoolName}!`;

    await expect(parseBackupContent(JSON.stringify(envelope))).rejects.toThrow(/Checksum SHA-256/i);
  });

  it('menolak backup format v2 jika checksum dihapus atau kosong', async () => {
    const envelope = await buildBackupEnvelope(createDemoState());
    const { checksum: _removed, ...withoutChecksum } = envelope;

    await expect(parseBackupContent(JSON.stringify(withoutChecksum))).rejects.toThrow(/wajib menyertakan checksum/i);
    await expect(parseBackupContent(JSON.stringify({ ...envelope, checksum: '' }))).rejects.toThrow(
      /checksum/i
    );
  });

  it('menandai backup legacy v1 tanpa checksum secara eksplisit sebagai legacy_unverified', async () => {
    const legacyState = createLegacyV1State();
    const legacyV1WithoutChecksum = {
      formatName: 'SIGNAL-LOCAL-BACKUP',
      schemaVersion: 1,
      appVersion: '1.0.0',
      exportedAt: '2026-08-01T00:00:00.000Z',
      payload: legacyState,
    };

    const result = await parseBackupContent(JSON.stringify(legacyV1WithoutChecksum));
    expect(result.verification).toBe('legacy_unverified');
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/legacy\/unverified/i);
    expect(result.state.schemaVersion).toBe(2);
    expect(result.state.settings.schoolName).toBe('MTs Al-Hikmah Terpadu');
  });

  it('menolak backup legacy v1 jika field checksum ada tetapi tidak cocok', async () => {
    const legacyState = createLegacyV1State();
    const legacyBody = {
      formatName: 'SIGNAL-LOCAL-BACKUP',
      schemaVersion: 1,
      appVersion: '1.0.0',
      exportedAt: '2026-08-01T00:00:00.000Z',
      payload: legacyState,
    };
    const fakeChecksum = await computeSha256Hex('corrupted');
    await expect(
      parseBackupContent(JSON.stringify({ ...legacyBody, checksum: fakeChecksum }))
    ).rejects.toThrow(/Checksum SHA-256/i);
  });

  it('menolak schemaVersion tidak dikenal, JSON rusak, dan struktur array tidak valid', async () => {
    const envelope = await buildBackupEnvelope(createDemoState());

    await expect(parseBackupContent('{json rusak')).rejects.toThrow(/JSON/i);
    await expect(parseBackupContent(JSON.stringify({ ...envelope, schemaVersion: 99 }))).rejects.toThrow(
      /Versi skema/i
    );

    const brokenStructureBody = {
      formatName: 'SIGNAL-LOCAL-BACKUP',
      formatVersion: 2,
      schemaVersion: 2,
      appVersion: '1.2.1',
      checksumAlgorithm: 'SHA-256',
      exportedAt: new Date().toISOString(),
      payload: { ...envelope.payload, teachers: 'bukan-array' },
    };
    const brokenChecksum = await computeCanonicalSha256(brokenStructureBody);
    await expect(
      parseBackupContent(JSON.stringify({ ...brokenStructureBody, checksum: brokenChecksum }))
    ).rejects.toThrow(/guru/i);
  });
});

describe('Tahap 1 Group B — Integritas Arsip .signal (SIGNAL-V5-SEAL)', () => {
  it('round-trip .signal container lolos verifikasi SHA-256', async () => {
    const demo = createDemoState();
    const container = await buildSignalContainer(demo);
    const parsed = await parseSignalContent(JSON.stringify(container, null, 2));

    expect(parsed.formatName).toBe('SIGNAL-V5-SEAL');
    expect(parsed.verification).toBe('verified');
    expect(parsed.state.teachers).toHaveLength(demo.teachers.length);
  });

  it('menolak .signal bila payload dimodifikasi 1 karakter atau checksum diubah', async () => {
    const container = await buildSignalContainer(createDemoState());
    container.data.state.classes[0]!.name = 'VII-X';

    await expect(parseSignalContent(JSON.stringify(container))).rejects.toThrow(/SHA-256/i);
  });

  it('tidak mengizinkan bypass: menolak raw AppState tanpa amplop & memverifikasi SIGNAL-LOCAL-BACKUP', async () => {
    const demo = createDemoState();
    await expect(parseSignalContent(JSON.stringify(demo))).rejects.toThrow(/tidak dikenali/i);

    const backupEnvelope = await buildBackupEnvelope(demo);
    backupEnvelope.payload.settings.schoolName = 'Dimanipulasi';
    await expect(parseSignalContent(JSON.stringify(backupEnvelope))).rejects.toThrow(/Checksum SHA-256/i);
  });

  it('menolak formatVersion 2 .signal tanpa checksum, dan menandai .signal v1 tanpa checksum sebagai legacy_unverified', async () => {
    const container = await buildSignalContainer(createDemoState());
    const { checksum: _removed, ...noChecksumV2 } = container;
    await expect(parseSignalContent(JSON.stringify(noChecksumV2))).rejects.toThrow(/checksum SHA-256/i);

    const legacyV1Signal = {
      signature: 'SIGNAL-V5-SEAL',
      data: container.data,
    };
    const res = await parseSignalContent(JSON.stringify(legacyV1Signal));
    expect(res.verification).toBe('legacy_unverified');
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe('Tahap 1 Group C — Keamanan Restore & Snapshot Time Machine', () => {
  it('restore gagal atau transaksi gagal tidak merusak workspace yang sedang aktif', async () => {
    const original = createDemoState();
    original.settings.schoolName = 'MTs Negeri 1 Aktif';
    const { db, upgradeAdapter } = createMemorySignalDb();
    applySignalDatabaseUpgrade(upgradeAdapter, 0);
    await restoreWorkspaceSafelyWithDb(db, original);

    // Try restoring corrupted structure
    await expect(
      restoreWorkspaceSafelyWithDb(db, { ...original, classes: null as unknown as AppState['classes'] })
    ).rejects.toThrow(/kelas/i);

    const stillActive = (await db.get(STORE_NAME, 'main')) as { state: AppState };
    expect(stillActive.state.settings.schoolName).toBe('MTs Negeri 1 Aktif');

    // Simulate transactional rollback when assignment write throws
    const { db: txFailDb, upgradeAdapter: txFailUpgrade } = createMemorySignalDb({
      failOnAssignmentPut: true,
    });
    applySignalDatabaseUpgrade(txFailUpgrade, 0);
    await txFailDb.put(STORE_NAME, { id: 'main', state: original, savedAt: '2026-10-01T00:00:00Z' });

    const candidateNew = createDemoState();
    candidateNew.settings.schoolName = 'MTs Baru Gagal Simpan';
    await expect(restoreWorkspaceSafelyWithDb(txFailDb, candidateNew)).rejects.toThrow(/Simulated IDB/);

    const intactRow = (await txFailDb.get(STORE_NAME, 'main')) as { state: AppState };
    expect(intactRow.state.settings.schoolName).toBe('MTs Negeri 1 Aktif');
  });

  it('restore berhasil menjaga attendance, holidays, dan teacherAssignments', async () => {
    const { db, upgradeAdapter } = createMemorySignalDb();
    applySignalDatabaseUpgrade(upgradeAdapter, 0);

    const source = createDemoState();
    const extraAssignment: TeacherAssignment = {
      id: 'TA-CUSTOM-01',
      teacherId: source.teachers[0]!.id,
      assignmentType: 'COMMITTEE',
      title: 'Ketua Panitia ASAS Ganjil',
      startDate: '2026-11-20',
      endDate: '2026-12-10',
      status: 'ACTIVE',
      sourceType: 'MANUAL',
      createdAt: '2026-11-15T10:00:00Z',
      updatedAt: '2026-11-15T10:00:00Z',
    };
    source.teacherAssignments = [...(source.teacherAssignments ?? []), extraAssignment];

    const envelope = await buildBackupEnvelope(source);
    const parsed = await parseBackupContent(JSON.stringify(envelope));
    const saved = await restoreWorkspaceSafelyWithDb(db, parsed.state);

    expect(saved.attendance?.length).toBe(source.attendance?.length);
    expect(saved.holidays?.length).toBe(source.holidays?.length);
    expect(saved.teacherAssignments?.some((a) => a.id === 'TA-CUSTOM-01')).toBe(true);

    const storedAssigns = (await db.getAll(ASSIGNMENT_STORE_NAME)) as TeacherAssignment[];
    expect(storedAssigns.some((a) => a.id === 'TA-CUSTOM-01')).toBe(true);
  });

  it('restoreSnapshot memverifikasi checksum snapshot dan menolak snapshot korup sebelum membuat pre_rollback', async () => {
    const { db, upgradeAdapter } = createMemorySignalDb();
    applySignalDatabaseUpgrade(upgradeAdapter, 0);

    const current = createDemoState();
    const snap = await createSnapshot(current, 'Baseline Valid', 'manual_milestone', true, db);

    // Tamper snapshot stateCopy in storage without updating checksum
    snap.stateCopy.settings.schoolName = 'Rusak Diam-diam';
    await db.put(SNAPSHOT_STORE_NAME, snap);

    await expect(restoreSnapshot(current, snap.id, db)).rejects.toThrow(/SHA-256/i);

    // Ensure pre_rollback snapshot was NOT created when target checksum failed
    const allSnapsAfterError = await getSnapshots(db);
    expect(allSnapsAfterError).toHaveLength(1);
    expect(allSnapsAfterError[0]!.id).toBe(snap.id);

    // Valid snapshot restores & writes pre_rollback safety net
    const validSnap = await createSnapshot(current, 'Milestone Bersih', 'manual_milestone', true, db);
    const restored = await restoreSnapshot(current, validSnap.id, db);
    expect(restored?.settings.schoolName).toBe(current.settings.schoolName);

    const snapsAfterSuccess = await getSnapshots(db);
    expect(snapsAfterSuccess.some((s) => s.triggerType === 'pre_rollback')).toBe(true);
  });
});

describe('Tahap 1 Group D — Migrasi IndexedDB v2 -> v3 Non-Destruktif & Idempotent', () => {
  it('fresh install v0 -> v3 membuat seluruh object store dan index yang diharapkan', () => {
    const { upgradeAdapter, stores, indexes } = createMemorySignalDb();
    applySignalDatabaseUpgrade(upgradeAdapter, 0);

    expect(stores.has(STORE_NAME)).toBe(true);
    expect(stores.has(SNAPSHOT_STORE_NAME)).toBe(true);
    expect(stores.has(AUDIT_STORE_NAME)).toBe(true);
    expect(stores.has(ASSIGNMENT_STORE_NAME)).toBe(true);

    expect(indexes.get(ASSIGNMENT_STORE_NAME)).toEqual(
      new Set(['teacherId', 'status', 'sourceType'])
    );
  });

  it('upgrade v2 -> v3 menjaga snapshots, audit_log, jadwal, presensi, dan settings tetap utuh serta idempotent', async () => {
    const { db, upgradeAdapter, stores } = createMemorySignalDb();
    // Simulate pre-existing IDB v2 schema
    applySignalDatabaseUpgrade({
      objectStoreNames: { contains: (n) => stores.has(n) },
      createObjectStore: (name) => {
        if (name !== ASSIGNMENT_STORE_NAME && !stores.has(name)) stores.set(name, new Map());
        return { createIndex: () => {} };
      },
    }, 2);
    stores.delete(ASSIGNMENT_STORE_NAME); // v2 did NOT have teacher_assignments

    const v2State = createLegacyV1State();
    const originalScheduleCount = v2State.activeSchedule?.length ?? 0;
    const originalHistoryId = v2State.history[0]?.id;
    const originalReqCount = v2State.requirements.length;
    const originalAttCount = v2State.attendance?.length ?? 0;

    await db.put(STORE_NAME, { id: 'main', state: v2State, savedAt: '2026-09-01T08:00:00Z' });
    await db.put(SNAPSHOT_STORE_NAME, {
      id: 'snap-old-v2',
      timestamp: '2026-09-01T08:00:00Z',
      label: 'Snapshot v2 Lama',
      triggerType: 'manual_milestone',
      isStarred: true,
      diffSummary: { totalTeachers: 9, totalClasses: 4, totalSlotsAssigned: 160, hardConflictCount: 0, description: 'v2' },
      checksum: '0'.repeat(64),
      stateCopy: v2State,
    });
    await db.put(AUDIT_STORE_NAME, {
      id: 'audit-old-v2',
      timestamp: '2026-09-01T08:00:00Z',
      action: 'Legacy log',
    });

    // Run IDB v2 -> v3 schema upgrade + idempotent data migration
    applySignalDatabaseUpgrade(upgradeAdapter, 2);
    const firstRun = await migrateWorkspaceRecordInDatabase(db, '2026-11-15T15:00:00Z');
    expect(firstRun.migrated).toBe(true);
    expect(firstRun.assignmentsSynced).toBeGreaterThan(0);

    // Run a SECOND time -> strictly idempotent (zero changes/duplicates)
    const secondRun = await migrateWorkspaceRecordInDatabase(db, '2026-11-15T15:05:00Z');
    expect(secondRun.migrated).toBe(false);
    expect(secondRun.assignmentsSynced).toBe(0);

    // Verify existing stores and records are completely preserved
    const preservedSnap = await db.get(SNAPSHOT_STORE_NAME, 'snap-old-v2');
    const preservedAudit = await db.get(AUDIT_STORE_NAME, 'audit-old-v2');
    expect(preservedSnap).toBeDefined();
    expect(preservedAudit).toBeDefined();

    const migratedRow = (await db.get(STORE_NAME, 'main')) as { state: AppState };
    expect(migratedRow.state.schemaVersion).toBe(2);
    expect(migratedRow.state.activeSchedule?.length).toBe(originalScheduleCount);
    expect(migratedRow.state.history[0]?.id).toBe(originalHistoryId);
    expect(migratedRow.state.requirements.length).toBe(originalReqCount);
    expect(migratedRow.state.attendance?.length).toBe(originalAttCount);
    expect(migratedRow.state.settings.schoolName).toBe('MTs Al-Hikmah Terpadu');

    // Verify non-generic roleTitle migrated with null dates & generic 'Guru Mapel' NOT promoted
    const assignments = migratedRow.state.teacherAssignments ?? [];
    expect(assignments.some((a) => a.teacherId === 'TCH-GENERIC')).toBe(false);
    const wakaAssignment = assignments.find((a) => a.teacherId === 'TCH-001');
    expect(wakaAssignment).toBeDefined();
    expect(wakaAssignment?.startDate).toBeNull();
    expect(wakaAssignment?.endDate).toBeNull();
    expect(wakaAssignment?.isDateUnknown).toBe(true);
    expect(wakaAssignment?.sourceType).toBe('LEGACY_MIGRATION');

    // Verify original Teacher.roleTitle untouched for legacy UI/PDF
    expect(migratedRow.state.teachers.find((t) => t.id === 'TCH-001')?.roleTitle).toBe(
      'Waka Kurikulum / Guru Mapel'
    );
  });
});

describe('Tahap 1 Group E — Domain Model TeacherAssignment & Validasi', () => {
  it('mendukung multi-penugasan per guru termasuk rentang waktu berbeda atau paralel', () => {
    const demo = createDemoState();
    const teacher = demo.teachers[0]!;

    const a1: TeacherAssignment = {
      id: 'TA-1',
      teacherId: teacher.id,
      assignmentType: 'ADDITIONAL_DUTY',
      title: 'Wakil Kepala Bidang Kurikulum',
      startDate: '2026-07-01',
      endDate: '2027-06-30',
      academicYear: '2026/2027',
      semester: 'Ganjil',
      status: 'ACTIVE',
      sourceType: 'MANUAL',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-01T08:00:00Z',
    };

    const a2: TeacherAssignment = {
      id: 'TA-2',
      teacherId: teacher.id,
      assignmentType: 'COMMITTEE',
      title: 'Ketua Panitia PPDB',
      startDate: '2027-03-01',
      endDate: '2027-06-15',
      academicYear: '2026/2027',
      semester: 'Genap',
      status: 'ACTIVE',
      sourceType: 'MANUAL',
      createdAt: '2026-07-01T08:00:00Z',
      updatedAt: '2026-07-01T08:00:00Z',
    };

    expect(validateTeacherAssignment(a1, demo.teachers, []).valid).toBe(true);
    expect(validateTeacherAssignment(a2, demo.teachers, [a1]).valid).toBe(true);
  });

  it('menolak teacherId tidak dikenal, tanggal kalender invalid, dan endDate < startDate', () => {
    const demo = createDemoState();

    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-08-17')).toBe(true);
    expect(isGenericRoleTitle('Guru Mapel')).toBe(true);
    expect(isGenericRoleTitle('Waka Kurikulum')).toBe(false);

    const missingTeacher: TeacherAssignment = {
      id: 'TA-ERR-1',
      teacherId: 'TCH-TIDAK-ADA',
      assignmentType: 'HOMEROOM',
      title: 'Wali Kelas IX-A',
      startDate: '2026-07-01',
      endDate: null,
      status: 'ACTIVE',
      sourceType: 'MANUAL',
      createdAt: '2026-07-01T00:00:00Z',
      updatedAt: '2026-07-01T00:00:00Z',
    };
    const r1 = validateTeacherAssignment(missingTeacher, demo.teachers);
    expect(r1.valid).toBe(false);
    expect(r1.errors.join(' ')).toMatch(/Guru/i);

    const badDate: TeacherAssignment = {
      ...missingTeacher,
      id: 'TA-ERR-2',
      teacherId: demo.teachers[0]!.id,
      startDate: '2026-02-30',
    };
    expect(validateTeacherAssignment(badDate, demo.teachers).valid).toBe(false);

    const reversedRange: TeacherAssignment = {
      ...missingTeacher,
      id: 'TA-ERR-3',
      teacherId: demo.teachers[0]!.id,
      startDate: '2026-10-10',
      endDate: '2026-10-01',
    };
    const r3 = validateTeacherAssignment(reversedRange, demo.teachers);
    expect(r3.valid).toBe(false);
    expect(r3.errors.join(' ')).toMatch(/lebih awal/i);
  });

  it('mempertahankan penugasan saat guru dinonaktifkan dan tidak mengubah Teacher.roleTitle', () => {
    const demo = createDemoState();
    const targetTeacher = demo.teachers[1]!;
    const originalRole = targetTeacher.roleTitle;
    targetTeacher.isActive = false;

    // 1. Penugasan yang sudah ada TIDAK terhapus ketika guru dinonaktifkan, dan roleTitle tetap utuh
    const afterDeactivate = migrateLegacyRoleTitlesToAssignments(demo, '2026-11-15T15:00:00Z');
    const kept = afterDeactivate.find((a) => a.teacherId === targetTeacher.id);
    expect(kept).toBeDefined();
    expect(targetTeacher.roleTitle).toBe(originalRole);

    // Validasi assignment aktif milik guru nonaktif tetap valid dengan peringatan non-fatal
    const check = validateTeacherAssignment(kept!, demo.teachers);
    expect(check.valid).toBe(true);
    expect(check.warnings.length).toBeGreaterThan(0);

    // 2. Guru yang memang sudah nonaktif sebelum migrasi awal mendapat status COMPLETED
    const unmigrated = { ...demo, teacherAssignments: undefined };
    const freshMigrated = migrateLegacyRoleTitlesToAssignments(unmigrated, '2026-11-15T15:00:00Z');
    expect(freshMigrated.find((a) => a.teacherId === targetTeacher.id)?.status).toBe('COMPLETED');

    const { state: schemaRes } = migrateAppStateSchema(demo, '2026-11-15T15:00:00Z');
    expect(schemaRes.teachers.find((t) => t.id === targetTeacher.id)?.roleTitle).toBe(originalRole);
  });
});
