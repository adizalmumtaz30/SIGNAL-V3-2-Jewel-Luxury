import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InspectorSlideDrawer } from '../src/components/InspectorSlideDrawer';
import { WorkloadDashboard } from '../src/components/WorkloadDashboard';
import {
  MISSING_HISTORICAL_METADATA_LABEL,
  aggregateTeacherWorkloadFromEntries,
  aggregateTeacherWorkloadFromRequirements,
  getLatestValidPublishedVersion,
  getPublishedScheduleVersions,
  resolveWorkloadSource,
  verifyScheduleVersion,
} from '../src/domain/scheduleSources';
import { createDemoState, createEmptyState } from '../src/domain/seed';
import type { AppState, ScheduleEntry, ScheduleVersion } from '../src/domain/types';
import { buildScheduleFingerprint } from '../src/domain/validator';
import { exportScheduleTeacherPDF } from '../src/utils/pdfExport';

describe('Tahap 3B — Sumber Resmi Beban Mengajar Guru (ScheduleVersion vs Draft vs Requirements)', () => {
  it('1. ScheduleVersion pada seed demo tervalidasi fingerprint sah serta menyimpan tahun ajaran & semester', () => {
    const state = createDemoState();
    const versions = getPublishedScheduleVersions(state);
    expect(versions).toHaveLength(1);
    expect(versions[0].isFingerprintValid).toBe(true);
    expect(versions[0].isEntryCountValid).toBe(true);
    expect(versions[0].isValidForOfficialUse).toBe(true);
    expect(versions[0].metadata.academicYearText).toBe('2026/2027');
    expect(versions[0].metadata.semesterText).toBe('Ganjil');
    expect(versions[0].metadata.isHistoricalPeriodMissing).toBe(false);
  });

  it('2. Mode PUBLISHED selalu mengambil ScheduleVersion terbit sah meskipun draft berubah atau tidak valid', () => {
    const base = createDemoState();
    const publishedEntries = base.history[0].entries;
    const firstTeacherId = base.teachers[0].id;

    // Simulasikan operator mengedit draft secara besar-besaran (mengurangi entri draft ke 2 slot)
    const editedState: AppState = {
      ...base,
      draft: publishedEntries.slice(0, 2),
    };

    const resPublished = resolveWorkloadSource(editedState, 'PUBLISHED');
    expect(resPublished.canUseAsOfficialSKBasis).toBe(true);
    expect(resPublished.hasUnpublishedDraft).toBe(true);
    expect(resPublished.entries).toHaveLength(publishedEntries.length);

    const resDraft = resolveWorkloadSource(editedState, 'DRAFT');
    expect(resDraft.canUseAsOfficialSKBasis).toBe(false);
    expect(resDraft.entries).toHaveLength(2);
    expect(resDraft.statusBannerTitle).toContain('PRATINJAU DRAFT');

    // Hitung beban guru: Published tetap utuh, Draft terpisah
    const statsPub = aggregateTeacherWorkloadFromEntries(
      editedState.teachers,
      resPublished.entries,
      editedState.settings.activeDays,
      editedState.settings.periodMinutes
    );
    const statsDraft = aggregateTeacherWorkloadFromEntries(
      editedState.teachers,
      resDraft.entries,
      editedState.settings.activeDays,
      editedState.settings.periodMinutes
    );

    const pubTeacherJP = statsPub.find((s) => s.teacher.id === firstTeacherId)?.totalJP ?? 0;
    const draftTeacherJP = statsDraft.find((s) => s.teacher.id === firstTeacherId)?.totalJP ?? 0;
    expect(pubTeacherJP).toBeGreaterThanOrEqual(draftTeacherJP);
    expect(resPublished.entries.length).not.toBe(resDraft.entries.length);
  });

  it('3. Ketika ada 2 ScheduleVersion, default PUBLISHED memakai versi terbaru yang sah dan tetap menjaga versi lama immutable', () => {
    const state = createDemoState();
    const v1Entries = state.history[0].entries;
    const v2Entries = v1Entries.slice(0, Math.max(4, v1Entries.length - 4));

    const v2: ScheduleVersion = {
      id: 'VER-DEMO-02',
      version: 2,
      createdAt: '2026-09-01T08:00:00Z',
      label: 'Jadwal 2026/2027 · Ganjil · v2 (Revisi)',
      entryCount: v2Entries.length,
      entries: v2Entries,
      fingerprint: buildScheduleFingerprint(v2Entries),
      validatorVersion: 'SIGNAL-validator/1.0.0',
      academicYear: '2026/2027',
      semester: 'Ganjil',
    };

    const twoVersionsState: AppState = {
      ...state,
      history: [state.history[0], v2], // sengaja acak urutan untuk uji sorting
    };

    const latest = getLatestValidPublishedVersion(twoVersionsState);
    expect(latest?.version.id).toBe('VER-DEMO-02');

    const resDefault = resolveWorkloadSource(twoVersionsState, 'PUBLISHED');
    expect(resDefault.selectedVersion?.version.id).toBe('VER-DEMO-02');
    expect(resDefault.entries).toHaveLength(v2Entries.length);

    const resV1 = resolveWorkloadSource(twoVersionsState, 'PUBLISHED', 'VER-DEMO-01');
    expect(resV1.selectedVersion?.version.id).toBe('VER-DEMO-01');
    expect(resV1.entries).toHaveLength(v1Entries.length);
  });

  it('4. Menolak activeSchedule telanjang tanpa ScheduleVersion di state.history sebagai dasar resmi SK', () => {
    const state = createDemoState();
    const unversionedState: AppState = {
      ...state,
      history: [],
      draft: null,
      // activeSchedule masih ada, tetapi tidak ada ScheduleVersion di history
    };

    const res = resolveWorkloadSource(unversionedState, 'PUBLISHED');
    expect(res.canUseAsOfficialSKBasis).toBe(false);
    expect(res.entries).toEqual([]);
    expect(res.pdfExportAllowed).toBe(false);
    expect(res.statusTone).toBe('empty');
    expect(res.statusBannerTitle).toContain('Belum ada jadwal yang dipublikasikan');
    expect(res.statusBannerMessage).toContain('tidak dapat digunakan sebagai dasar resmi SK');
  });

  it('5. Menolak ScheduleVersion dengan fingerprint tidak cocok atau entryCount rusak secara eksplisit', () => {
    const state = createDemoState();
    const tamperedVersion: ScheduleVersion = {
      ...state.history[0],
      fingerprint: 'deadbeef',
    };

    const verified = verifyScheduleVersion(tamperedVersion);
    expect(verified.isFingerprintValid).toBe(false);
    expect(verified.isValidForOfficialUse).toBe(false);
    expect(verified.integrityIssues.length).toBeGreaterThan(0);

    const brokenHistoryState: AppState = {
      ...state,
      history: [tamperedVersion],
    };
    const res = resolveWorkloadSource(brokenHistoryState, 'PUBLISHED');
    expect(res.canUseAsOfficialSKBasis).toBe(false);
    expect(res.entries).toEqual([]);
    expect(res.statusTone).toBe('error');
    expect(res.pdfExportAllowed).toBe(false);
    expect(res.statusBannerTitle).toContain('gagal');
  });

  it('6. Versi lama tanpa academicYear/semester menampilkan label eksplisit "Tidak tercatat pada versi lama" dan tidak memalsukan dari settings saat ini', () => {
    const state = createDemoState();
    const legacyVersion: ScheduleVersion = {
      id: 'VER-OLD-01',
      version: 1,
      createdAt: '2025-07-10T08:00:00Z',
      label: 'Jadwal Lama',
      entryCount: state.history[0].entries.length,
      entries: state.history[0].entries,
      fingerprint: buildScheduleFingerprint(state.history[0].entries),
      validatorVersion: 'SIGNAL-validator/1.0.0',
      // sengaja tanpa academicYear & semester
    };

    const currentSettingsDifferentYear: AppState = {
      ...state,
      settings: {
        ...state.settings,
        academicYear: '2029/2030',
        semester: 'Genap',
      },
      history: [legacyVersion],
    };

    const res = resolveWorkloadSource(currentSettingsDifferentYear, 'PUBLISHED');
    expect(res.selectedVersion?.isValidForOfficialUse).toBe(true);
    expect(res.selectedVersion?.metadata.isHistoricalPeriodMissing).toBe(true);
    expect(res.selectedVersion?.metadata.academicYearText).toBe(MISSING_HISTORICAL_METADATA_LABEL);
    expect(res.selectedVersion?.metadata.semesterText).toBe(MISSING_HISTORICAL_METADATA_LABEL);

    const html = renderToStaticMarkup(
      createElement(WorkloadDashboard, { state: currentSettingsDifferentYear })
    );
    expect(html).toContain(MISSING_HISTORICAL_METADATA_LABEL);
    expect(html).not.toContain('2029/2030 · Genap');
  });

  it('7. Mode REQUIREMENTS membaca state.requirements terpisah, menolak PDF jadwal, dan TeacherAssignment tidak tercampur', () => {
    const state = createDemoState();
    const reqResolution = resolveWorkloadSource(state, 'REQUIREMENTS');
    expect(reqResolution.canUseAsOfficialSKBasis).toBe(false);
    expect(reqResolution.pdfExportAllowed).toBe(false);
    expect(reqResolution.statusBannerTitle).toContain('KEBUTUHAN PERENCANAAN');

    const reqStats = aggregateTeacherWorkloadFromRequirements(state.teachers, state);
    const totalPlanned = reqStats.reduce((sum, item) => sum + item.plannedJP, 0);
    const expectedSum = state.requirements.reduce((sum, r) => sum + r.requiredJP, 0);
    expect(totalPlanned).toBe(expectedSum);

    // Tambah TeacherAssignment non-teaching tidak boleh mengubah totalJP jadwal maupun totalPlanned
    const withExtraAssignment: AppState = {
      ...state,
      teacherAssignments: [
        ...(state.teacherAssignments ?? []),
        {
          id: 'ASG-TEST-WALI',
          teacherId: state.teachers[0].id,
          assignmentType: 'HOMEROOM',
          title: 'Wali Kelas VII-A',
          startDate: '2026-07-01',
          endDate: null,
          weeklyJP: 99, // angka administratif tidak boleh masuk hitungan JP jadwal
          status: 'ACTIVE',
          sourceType: 'MANUAL',
          createdAt: '2026-07-01T00:00:00Z',
          updatedAt: '2026-07-01T00:00:00Z',
        },
      ],
    };

    const pubEntries = resolveWorkloadSource(withExtraAssignment, 'PUBLISHED').entries;
    const pubStats = aggregateTeacherWorkloadFromEntries(
      withExtraAssignment.teachers,
      pubEntries,
      withExtraAssignment.settings.activeDays,
      withExtraAssignment.settings.periodMinutes
    );
    expect(pubStats.find((s) => s.teacher.id === state.teachers[0].id)?.totalJP).toBeLessThan(99);
  });

  it('8. Ekspor PDF guru menghormati entriesOverride dan menandai DRAFT vs Sumber Resmi ScheduleVersion (tanpa menulis PDF ke root)', () => {
    const state = createDemoState();
    const teacher = state.teachers[0];
    const sv = state.history[0];

    const pubDoc = exportScheduleTeacherPDF(state, teacher.id, {
      entriesOverride: sv.entries,
      sourceMode: 'PUBLISHED',
      versionInfo: {
        id: sv.id,
        version: sv.version,
        createdAt: sv.createdAt,
        fingerprint: sv.fingerprint,
        academicYear: sv.academicYear,
        semester: sv.semester,
      },
      skipSave: true,
    });
    expect(pubDoc).toBeDefined();
    const pubPagesText = ((pubDoc!.internal as unknown as { pages: string[][] }).pages ?? [])
      .flat()
      .join('\n')
      .replace(/\\([()])/g, '$1');
    expect(pubPagesText).toContain(`Sumber Resmi: Versi ${sv.version} (${sv.id})`);
    expect(pubPagesText).not.toContain('PRATINJAU DRAFT');

    const draftEntries: ScheduleEntry[] = sv.entries.slice(0, 1);
    const draftDoc = exportScheduleTeacherPDF(state, teacher.id, {
      entriesOverride: draftEntries,
      sourceMode: 'DRAFT',
      skipSave: true,
    });
    expect(draftDoc).toBeDefined();
    const draftPagesText = ((draftDoc!.internal as unknown as { pages: string[][] }).pages ?? [])
      .flat()
      .join('\n')
      .replace(/\\([()])/g, '$1');
    expect(draftPagesText).toContain('PRATINJAU DRAFT - BELUM DITERBITKAN');
  });

  it('9. Render UI WorkloadDashboard pada ketiga mode & InspectorSlideDrawer melabeli sumber secara akurat', () => {
    const state = createDemoState();
    const publishedHtml = renderToStaticMarkup(
      createElement(WorkloadDashboard, { state, initialSourceMode: 'PUBLISHED' })
    );
    expect(publishedHtml).toContain('Jadwal Terbit (Resmi)');
    expect(publishedHtml).toContain('Pratinjau Draft');
    expect(publishedHtml).toContain('Kebutuhan JP (Rencana)');
    expect(publishedHtml).toContain('VER-DEMO-01');
    expect(publishedHtml).toContain('(Sah)');

    const draftHtml = renderToStaticMarkup(
      createElement(WorkloadDashboard, { state: { ...state, draft: state.history[0].entries.slice(0, 2) }, initialSourceMode: 'DRAFT' })
    );
    expect(draftHtml).toContain('PRATINJAU DRAFT — BELUM DITERBITKAN; BUKAN DASAR SK RESMI');

    const reqHtml = renderToStaticMarkup(
      createElement(WorkloadDashboard, { state, initialSourceMode: 'REQUIREMENTS' })
    );
    expect(reqHtml).toContain('KEBUTUHAN PERENCANAAN — BUKAN JAM MENGAJAR TERJADWAL');
    expect(reqHtml).toContain('Perencanaan (Bukan SK)');

    const emptyHtml = renderToStaticMarkup(
      createElement(WorkloadDashboard, { state: createEmptyState(), initialSourceMode: 'PUBLISHED' })
    );
    expect(emptyHtml).toContain('Belum ada jadwal yang dipublikasikan');

    const drawerHtml = renderToStaticMarkup(
      createElement(InspectorSlideDrawer, {
        isOpen: true,
        target: { type: 'teacher', data: state.teachers[0] },
        state,
        onClose: () => {},
        onNotify: () => {},
      })
    );
    expect(drawerHtml).toContain('Rencana Kebutuhan JP (Planning)');
    expect(drawerHtml).toContain('bukan jadwal terbit');
  });
});
