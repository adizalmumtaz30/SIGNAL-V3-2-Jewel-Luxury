import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createDemoState, createEmptyState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import {
  buildSkTeachingLaunchPayload,
  buildTeacherDocumentLaunchPayload,
  getOfficialScheduleBasisStatus,
  getTeacherOperationalProfile,
  updateTeacherAssignmentStatusInState,
  upsertTeacherAssignmentInState,
} from '../src/domain/persuratan/assignments/teacherIntegration';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { extractPlainTextAndTokens } from '../src/domain/persuratan/studio/contentValidation';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import { clearMemoryFinalPdfStore } from '../src/domain/persuratan/finalization/finalPdfStore';
import { TeacherAssignmentDrawer } from '../src/components/TeacherAssignmentDrawer';
import { WorkloadDashboard } from '../src/components/WorkloadDashboard';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import { DocumentPreviewFinalize } from '../src/components/persuratan/DocumentPreviewFinalize';

describe('Tahap 9 — Integrasi Penugasan Guru, ScheduleVersion Resmi & Provenance Snapshot', () => {
  it('1. Gate SK Mengajar (SYS-TPL-03) menolak draft, activeSchedule polos, & versi terkorupsi; hanya menerima ScheduleVersion terbit valid', () => {
    const demo = createDemoState();
    const validBasis = getOfficialScheduleBasisStatus(demo);
    expect(validBasis.allowed).toBe(true);
    expect(validBasis.selectedVersion?.isValidForOfficialUse).toBe(true);

    const launch = buildSkTeachingLaunchPayload(demo, {
      nonce: 101,
      todayIso: '2026-11-17',
    });
    expect(launch.view).toBe('intake');
    expect(launch.templateId).toBe('SYS-TPL-03');
    expect(launch.prefillValues?.schedule_version_id).toBe(demo.history[0].id);

    // Draft-only state -> blocked
    const draftOnlyState: AppState = {
      ...demo,
      history: [],
      draft: [...(demo.activeSchedule ?? [])],
    };
    const draftBasis = getOfficialScheduleBasisStatus(draftOnlyState);
    expect(draftBasis.allowed).toBe(false);
    expect(draftBasis.hasUnpublishedDraft).toBe(true);
    expect(draftBasis.blockedReason).toMatch(/Draft/i);
    expect(() => buildSkTeachingLaunchPayload(draftOnlyState)).toThrow();

    // Loose activeSchedule without ScheduleVersion -> blocked
    const looseActiveState: AppState = {
      ...demo,
      history: [],
      draft: null,
    };
    const looseBasis = getOfficialScheduleBasisStatus(looseActiveState);
    expect(looseBasis.allowed).toBe(false);
    expect(looseBasis.hasLooseActiveSchedule).toBe(true);
    expect(() => buildSkTeachingLaunchPayload(looseActiveState)).toThrow();

    // Tampered fingerprint on ScheduleVersion -> blocked
    const tamperedState: AppState = {
      ...demo,
      history: [
        {
          ...demo.history[0],
          fingerprint: 'CORRUPTED-FINGERPRINT',
        },
      ],
    };
    const tamperedBasis = getOfficialScheduleBasisStatus(tamperedState, demo.history[0].id);
    expect(tamperedBasis.allowed).toBe(false);
    expect(tamperedBasis.blockedReason).toMatch(/fingerprint|integritas/i);
    expect(() =>
      buildSkTeachingLaunchPayload(tamperedState, { scheduleVersionId: demo.history[0].id })
    ).toThrow();
  });

  it('2. CRUD TeacherAssignment, penautan ke Persuratan, anti-NIP, & tidak menimpa naskah S04 saat Data Master berubah', () => {
    const demo = createDemoState();
    const teacher = demo.teachers.find((t) => t.isActive)!;

    // Add a manual TeacherAssignment
    const added = upsertTeacherAssignmentInState(
      demo,
      {
        teacherId: teacher.id,
        title: 'Pembina Olimpiade Sains Madrasah',
        assignmentType: 'ADDITIONAL_DUTY',
        startDate: '2026-11-01',
        weeklyJP: 2,
        description: 'Membina tim KSM IPA & Matematika tingkat kabupaten.',
      },
      '2026-11-17T08:00:00Z'
    );
    expect(added.assignment.teacherId).toBe(teacher.id);
    expect(added.assignment.status).toBe('ACTIVE');

    // Launch a teacher-linked document (SYS-TPL-04) from assignment
    const launchReq = buildTeacherDocumentLaunchPayload(added.state, {
      teacherId: teacher.id,
      templateId: 'SYS-TPL-04',
      assignmentId: added.assignment.id,
      nonce: 202,
      todayIso: '2026-11-17',
    });
    expect(launchReq.linkedAssignmentId).toBe(added.assignment.id);
    expect(launchReq.prefillValues?.daftar_penugasan).toEqual([teacher.id]);
    expect(JSON.stringify(launchReq.prefillValues)).not.toContain(teacher.nip ?? 'NO_NIP_TOKEN');

    // Inactive teacher must be rejected
    const inactiveState: AppState = {
      ...added.state,
      teachers: added.state.teachers.map((t, i) => (i === 0 ? { ...t, isActive: false } : t)),
    };
    expect(() =>
      buildTeacherDocumentLaunchPayload(inactiveState, {
        teacherId: teacher.id,
        templateId: 'SYS-TPL-01',
      })
    ).toThrow(/nonaktif/i);

    // Save S03 intake + S04 manual prose edit
    const tpl04 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-04')!;
    const initVals = createInitialIntakeFormValues(
      tpl04,
      added.state,
      null,
      launchReq.prefillValues
    );
    const savedS03 = saveIntakeDraftToState(
      added.state,
      tpl04,
      {
        ...initVals,
        jenis_tugas_tambahan: 'Pembina KSM Madrasah',
        uraian_tugas: 'Membina siswa peserta KSM bidang IPA.',
        periode_tugas: 'Tahun Ajaran 2026/2027',
        dasar_penetapan: 'Rapat Dewan Guru 10 November 2026',
      },
      {
        linkedAssignmentId: launchReq.linkedAssignmentId,
        timestamp: '2026-11-17T08:10:00Z',
      }
    );
    expect(savedS03.draft.linkedAssignmentId).toBe(added.assignment.id);
    expect(
      savedS03.draft.sourceSnapshots.some(
        (s) =>
          s.sourceKey === 'master.teacher_assignment.linked' &&
          s.capturedAt === '2026-11-17T08:10:00Z'
      )
    ).toBe(true);

    const studioBuild = buildInitialStudioContentFromDraft(savedS03.draft);
    const manualContent = {
      ...studioBuild.content,
      content: [
        ...studioBuild.content.content,
        {
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: 'CATATAN KHUSUS EDITOR MANUAL S04' }],
        },
      ],
    };
    const savedS04 = saveStudioDraftToState(savedS03.state, savedS03.draft.id, {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: manualContent,
      pageSettings: studioBuild.pageSettings,
      updatedAt: '2026-11-17T08:15:00Z',
    });

    // Now mutate TeacherAssignment & Master Teacher name AFTER S04 edit -> must NOT overwrite S04 prose!
    const mutatedAssign = upsertTeacherAssignmentInState(
      savedS04.state,
      {
        id: added.assignment.id,
        teacherId: teacher.id,
        title: 'JUDUL TUGAS MASTER BERUBAH TOTAL',
        assignmentType: 'ADDITIONAL_DUTY',
        startDate: '2026-11-01',
      },
      '2026-11-17T09:00:00Z'
    );
    const statusUpdated = updateTeacherAssignmentStatusInState(
      mutatedAssign.state,
      added.assignment.id,
      'COMPLETED',
      '2026-11-17T09:05:00Z'
    );
    const masterEdited: AppState = {
      ...statusUpdated.state,
      teachers: statusUpdated.state.teachers.map((t) =>
        t.id === teacher.id ? { ...t, name: 'NAMA MASTER DIUBAH BELAKANGAN' } : t
      ),
    };

    const preservedDraft = masterEdited.intakeDrafts!.find((d) => d.id === savedS04.draft.id)!;
    const plainAfterMasterChange = extractPlainTextAndTokens(preservedDraft.studio!.content).plainText;
    expect(plainAfterMasterChange).toContain('CATATAN KHUSUS EDITOR MANUAL S04');
    expect(plainAfterMasterChange).toContain(teacher.name);
    expect(plainAfterMasterChange).not.toContain('NAMA MASTER DIUBAH BELAKANGAN');
    expect(plainAfterMasterChange).not.toContain('JUDUL TUGAS MASTER BERUBAH TOTAL');
  });

  it('3. Finalisasi SK Mengajar (SYS-TPL-03) & Surat Penugasan menautkan documentId ke TeacherAssignment dengan snapshot resmi', async () => {
    clearMemoryFinalPdfStore();
    const demo = createDemoState();
    const teacher = demo.teachers.find((t) => t.isActive)!;

    // A. Finalize assignment-linked SYS-TPL-04
    const added = upsertTeacherAssignmentInState(demo, {
      teacherId: teacher.id,
      title: 'Koordinator Ekstrakurikuler Riset',
      assignmentType: 'COORDINATOR',
      startDate: '2026-11-17',
    });
    const tpl04 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-04')!;
    const req04 = buildTeacherDocumentLaunchPayload(added.state, {
      teacherId: teacher.id,
      templateId: 'SYS-TPL-04',
      assignmentId: added.assignment.id,
      todayIso: '2026-11-17',
    });
    const s03 = saveIntakeDraftToState(
      added.state,
      tpl04,
      {
        ...createInitialIntakeFormValues(tpl04, added.state, null, req04.prefillValues),
        jenis_tugas_tambahan: 'Koordinator Ekstrakurikuler Riset',
        uraian_tugas: 'Membimbing kelompok karya ilmiah remaja madrasah.',
        periode_tugas: 'Semester Ganjil 2026/2027',
        dasar_penetapan: 'Program Kerja Kesiswaan',
      },
      { linkedAssignmentId: req04.linkedAssignmentId }
    );
    const studio04 = buildInitialStudioContentFromDraft(s03.draft);
    const fin04 = await finalizeDocumentTransaction({
      state: s03.state,
      draft: {
        ...s03.draft,
        studio: {
          schemaVersion: 1,
          editorStatus: 'IN_PROGRESS',
          content: studio04.content,
          pageSettings: studio04.pageSettings,
          updatedAt: '2026-11-17T10:00:00Z',
        },
      },
      content: studio04.content,
      pageSettings: studio04.pageSettings,
      documentNumber: '015/SK/MTs.CN/XI/2026',
      numberingMode: 'AUTO',
      demoAcknowledged: true,
    });
    const linkedTa = fin04.state.teacherAssignments?.find((a) => a.id === added.assignment.id);
    expect(linkedTa?.documentId).toBe(fin04.documentRecord.id);

    // B. Finalize SYS-TPL-03 SK Pembagian Tugas Mengajar -> auto-creates PUBLISHED_SCHEDULE TeacherAssignments
    const skLaunch = buildSkTeachingLaunchPayload(fin04.state, { todayIso: '2026-11-17' });
    const tpl03 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;
    const s03Sk = saveIntakeDraftToState(fin04.state, tpl03, {
      ...createInitialIntakeFormValues(tpl03, fin04.state, null, skLaunch.prefillValues),
      dasar_hukum: 'SK Jadwal Terbit Resmi',
    });
    const studioSk = buildInitialStudioContentFromDraft(s03Sk.draft);
    const finSk = await finalizeDocumentTransaction({
      state: s03Sk.state,
      draft: s03Sk.draft,
      content: studioSk.content,
      pageSettings: studioSk.pageSettings,
      documentNumber: '016/SK/MTs.CN/XI/2026',
      numberingMode: 'AUTO',
      demoAcknowledged: true,
    });

    const skAssignments = (finSk.state.teacherAssignments ?? []).filter(
      (a) =>
        a.sourceType === 'PUBLISHED_SCHEDULE' &&
        a.documentId === finSk.documentRecord.id &&
        a.sourceScheduleVersionId === finSk.documentRecord.scheduleVersionId
    );
    expect(skAssignments.length).toBeGreaterThan(0);
    expect(skAssignments[0].weeklyJP).toBeGreaterThan(0);

    const profile = getTeacherOperationalProfile(finSk.state, skAssignments[0].teacherId);
    expect(profile?.linkedDocuments.some((d) => d.id === finSk.documentRecord.id)).toBe(true);
    expect(profile?.officialVersion?.version.id).toBe(finSk.documentRecord.scheduleVersionId);

    // Empty state has no valid profile/official schedule
    const empty = createEmptyState();
    expect(getOfficialScheduleBasisStatus(empty).allowed).toBe(false);
  });

  it('4. Render SSR TeacherAssignmentDrawer, WorkloadDashboard SK CTA, S05 Provenance & PersuratanWorkspace Launch Request', () => {
    const demo = createDemoState();
    const teacher = demo.teachers.find((t) => t.isActive)!;

    const drawerHtml = renderToStaticMarkup(
      createElement(TeacherAssignmentDrawer, {
        isOpen: true,
        teacher,
        state: demo,
        onClose: () => {},
        onUpdateState: () => {},
        onLaunchPersuratan: () => {},
      })
    );
    expect(drawerHtml).toContain(teacher.name);
    expect(drawerHtml).toContain('Sumber Resmi SK Mengajar (Jadwal Terbit)');
    expect(drawerHtml).toContain('Buat Dokumen Guru');
    expect(drawerHtml).not.toContain(teacher.nip ?? 'NO_NIP_TOKEN');

    const workloadPublishedHtml = renderToStaticMarkup(
      createElement(WorkloadDashboard, {
        state: demo,
        initialSourceMode: 'PUBLISHED',
        onLaunchTeachingSk: () => {},
      })
    );
    expect(workloadPublishedHtml).toContain('Buat SK Pembagian Tugas');

    const workloadDraftHtml = renderToStaticMarkup(
      createElement(WorkloadDashboard, {
        state: { ...demo, draft: demo.activeSchedule },
        initialSourceMode: 'DRAFT',
        onLaunchTeachingSk: () => {},
      })
    );
    expect(workloadDraftHtml).toContain('disabled');

    const skLaunch = buildSkTeachingLaunchPayload(demo, { nonce: 777, todayIso: '2026-11-17' });
    const wsHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: demo,
        launchRequest: skLaunch,
      })
    );
    expect(wsHtml).toContain('VER-DEMO-01');
    expect(wsHtml).toContain('Lampiran Rekap Beban JP per Guru');
    expect(wsHtml).toContain('Isian Konteks');

    // S05 shows Snapshot Provenance card
    const tpl03 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;
    const saved = saveIntakeDraftToState(demo, tpl03, {
      ...createInitialIntakeFormValues(tpl03, demo, null, skLaunch.prefillValues),
    });
    const studioInit = buildInitialStudioContentFromDraft(saved.draft);
    const s05Html = renderToStaticMarkup(
      createElement(DocumentPreviewFinalize, {
        state: saved.state,
        draft: {
          ...saved.draft,
          studio: {
            schemaVersion: 1,
            editorStatus: 'IN_PROGRESS',
            content: studioInit.content,
            pageSettings: studioInit.pageSettings,
            updatedAt: '2026-11-17T10:15:00Z',
          },
        },
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s05Html).toContain('Sumber Data &amp; Snapshot');
    expect(s05Html).toContain('Diambil:');
  });
});
