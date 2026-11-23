import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { getIntakeSchemaForTemplate } from '../src/domain/persuratan/intake/schemaRegistry';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import {
  extractPlainTextAndTokens,
  sanitizePastedHtml,
  validateStudioPageSettings,
  validateStudioState,
  validateTipTapContent,
} from '../src/domain/persuratan/studio/contentValidation';
import type {
  DocumentIntakeDraft,
  DocumentStudioState,
  TipTapJSONContent,
} from '../src/domain/persuratan/types';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { cloneTemplateToMadrasah } from '../src/domain/persuratan/templates/selectors';
import { createDemoState, createEmptyState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';
import { computeCanonicalSha256 } from '../src/storage/checksum';
import {
  CURRENT_APP_SCHEMA_VERSION,
  DB_VERSION,
  buildBackupEnvelope,
  migrateAppStateSchema,
  parseBackupContent,
  validateAppStateStructure,
} from '../src/storage/db';
import { buildSignalContainer, parseSignalContent } from '../src/storage/snapshotEngine';

function createValidStudioSampleState(draft: DocumentIntakeDraft, customText = 'Paragraf resmi yang sudah disunting operator di S04.'): DocumentStudioState {
  const initial = buildInitialStudioContentFromDraft(draft);
  const editedContent: TipTapJSONContent = {
    type: 'doc',
    content: [
      ...initial.content.content,
      {
        type: 'paragraph',
        content: [{ type: 'text', text: customText, marks: [{ type: 'bold' }] }],
      },
    ],
  };
  return {
    schemaVersion: 1,
    editorStatus: 'IN_PROGRESS',
    content: editedContent,
    pageSettings: initial.pageSettings,
    updatedAt: '2026-11-16T11:30:00Z',
  };
}

function buildValidValuesForTemplate(tplId: string, state: AppState) {
  const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === tplId)!;
  const schema = getIntakeSchemaForTemplate(tpl);
  const base = createInitialIntakeFormValues(tpl, state);
  const teacherId = state.teachers.find((t) => t.isActive)?.id ?? state.teachers[0].id;
  const classId = state.classes.find((c) => c.isActive)?.id ?? state.classes[0].id;
  const subjectId = state.subjects.find((s) => s.isActive)?.id ?? state.subjects[0].id;

  const filled: Record<string, unknown> = {
    ...base,
    documentDate: '2026-11-16',
  };

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'auto_system') continue;
    if (ctrl.controlType === 'date_range') {
      const startKey = ctrl.startKey ?? `${ctrl.key}_mulai`;
      const endKey = ctrl.endKey ?? `${ctrl.key}_selesai`;
      filled[startKey] = '2026-11-20';
      filled[endKey] = '2026-11-22';
    } else if (ctrl.controlType === 'date') {
      filled[ctrl.key] = '2026-11-20';
    } else if (ctrl.controlType === 'number') {
      filled[ctrl.key] = '24';
    } else if (ctrl.controlType === 'teacher_multi_select') {
      filled[ctrl.key] = [teacherId];
    } else if (ctrl.controlType === 'teacher_single_select') {
      filled[ctrl.key] = teacherId;
    } else if (ctrl.controlType === 'class_single_select') {
      filled[ctrl.key] = classId;
    } else if (ctrl.controlType === 'subject_single_select') {
      filled[ctrl.key] = subjectId;
    } else if (ctrl.controlType === 'schedule_version') {
      filled[ctrl.key] = filled[ctrl.key] || state.history[0]?.id || '';
    } else if (ctrl.controlType === 'select') {
      filled[ctrl.key] = ctrl.key === 'tampilkan_kop' ? 'Ya' : ctrl.options?.[0]?.value ?? 'Ya';
    } else if (!filled[ctrl.key]) {
      filled[ctrl.key] = `Isian valid ${ctrl.key}`;
    }
  }
  return filled;
}

describe('Tahap 5 — S04 Document Studio / Editor Dokumen Bergaya Word', () => {
  it('1. Semua 30 template SYSTEM dan salinan MADRASAH menghasilkan konten JSON TipTap S04 valid tanpa error', () => {
    const demo = createDemoState();
    expect(SYSTEM_DOCUMENT_TEMPLATES).toHaveLength(30);

    for (const tpl of SYSTEM_DOCUMENT_TEMPLATES) {
      const vals = buildValidValuesForTemplate(tpl.id, demo);
      const saved = saveIntakeDraftToState(demo, tpl, vals, {
        timestamp: '2026-11-16T11:00:00Z',
      });
      expect(saved.draft.templateSnapshot.previewBlocks).toBeDefined();

      const generated = buildInitialStudioContentFromDraft(saved.draft);
      expect(validateTipTapContent(generated.content).valid).toBe(true);
      expect(validateStudioPageSettings(generated.pageSettings).valid).toBe(true);
      expect(generated.content.content.length).toBeGreaterThan(0);
    }

    const cloned = cloneTemplateToMadrasah(
      SYSTEM_DOCUMENT_TEMPLATES[0],
      'Surat Tugas Khusus Madrasah',
      [],
      '2026-11-16T11:05:00Z'
    );
    const clonedSaved = saveIntakeDraftToState(
      demo,
      cloned,
      buildValidValuesForTemplate('SYS-TPL-01', demo),
      { timestamp: '2026-11-16T11:05:00Z' }
    );
    const clonedStudio = buildInitialStudioContentFromDraft(clonedSaved.draft, {
      activeTemplates: [...SYSTEM_DOCUMENT_TEMPLATES, cloned],
    });
    expect(validateTipTapContent(clonedStudio.content).valid).toBe(true);
  });

  it('2. SYS-TPL-01 memetakan snapshot S03 secara akurat dan TIDAK membocorkan NIP guru ke tabel naskah', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const t0 = demo.teachers[0];
    const t1 = demo.teachers[1];
    expect(t0.nip).toBeTruthy();

    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [t0.id, t1.id],
        nama_kegiatan: 'Bimtek Kurikulum Berbasis Madrasah',
        penyelenggara: 'Kankemenag Kabupaten Malang',
        tanggal_mulai: '2026-11-24',
        tanggal_selesai: '2026-11-26',
        lokasi: 'Aula Kemenag',
        dasar_surat: 'Surat Undangan No. 123/2026',
        catatan_khusus: 'Memakai batik resmi hari pertama.',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T11:10:00Z' }
    );

    const studioInit = buildInitialStudioContentFromDraft(saved.draft);
    const { plainText, unresolvedTokens } = extractPlainTextAndTokens(studioInit.content);

    expect(plainText).toContain(t0.name);
    expect(plainText).toContain(t1.name);
    expect(plainText).toContain('Bimtek Kurikulum Berbasis Madrasah');
    expect(plainText).toContain('Kankemenag Kabupaten Malang');
    expect(plainText).toContain('24 November 2026 s.d. 26 November 2026');
    expect(plainText).toContain('Memakai batik resmi hari pertama.');
    // NIP guru tidak dibekukan pada master.teachers.selected dan TIDAK boleh diambil dari live state
    expect(plainText).not.toContain(t0.nip!);
    expect(plainText).not.toContain(t1.nip!);
    // Nomor surat tetap placeholder eksplisit hingga S05
    expect(unresolvedTokens).toContain('NOMOR_SURAT');
    expect(saved.documentRecord.documentNumber).toBeNull();
    expect(saved.documentRecord.status).toBe('DRAFT');
  });

  it('3. SYS-TPL-03 terikat snapshot ScheduleVersion beku & terisolasi dari mutasi Data Master/History berikutnya', () => {
    const demo = createDemoState();
    const tpl03 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;
    const initVals = createInitialIntakeFormValues(tpl03, demo);
    const saved = saveIntakeDraftToState(
      demo,
      tpl03,
      {
        ...initVals,
        tanggal_penetapan: '2026-11-16',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T11:15:00Z' }
    );

    const beforeMutation = buildInitialStudioContentFromDraft(saved.draft);
    const textBefore = extractPlainTextAndTokens(beforeMutation.content).plainText;

    // Mutasi state asal setelah S03 disimpan
    saved.state.settings.schoolName = 'MADRASAH YANG BERUBAH SETELAH DRAFT';
    saved.state.teachers[0].name = 'NAMA GURU BERUBAH TOTAL';
    saved.state.history[0].label = 'Versi Berubah';

    const afterMutation = buildInitialStudioContentFromDraft(saved.draft);
    const textAfter = extractPlainTextAndTokens(afterMutation.content).plainText;

    expect(textAfter).toBe(textBefore);
    expect(textAfter).not.toContain('MADRASAH YANG BERUBAH SETELAH DRAFT');
    expect(saved.draft.scheduleVersionFingerprint).toBe(demo.history[0].fingerprint);
    expect(textAfter).not.toContain(demo.history[0].fingerprint);
    expect(textAfter).not.toContain('Kode Validasi:');
    expect(textAfter).toContain('JP');
  });

  it('4. SYS-TPL-30 (Kanvas Kosong) menghormati opsi Tanpa Kop vs Sertakan Kop Surat', () => {
    const blank = createEmptyState();
    blank.settings.schoolName = '';
    blank.settings.headmasterName = '';
    const tpl30 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-30')!;

    const withoutKop = saveIntakeDraftToState(
      blank,
      tpl30,
      {
        judul_dokumen: 'Catatan Rapat Internal',
        tampilkan_kop: 'Tidak',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T11:20:00Z' }
    );
    const initWithoutKop = buildInitialStudioContentFromDraft(withoutKop.draft);
    expect(initWithoutKop.includeKopSurat).toBe(false);
    expect(initWithoutKop.content.content.some((n) => n.type === 'horizontalRule')).toBe(false);
    expect(extractPlainTextAndTokens(initWithoutKop.content).plainText).toContain('Catatan Rapat Internal');

    const demo = createDemoState();
    const withKop = saveIntakeDraftToState(
      demo,
      tpl30,
      {
        judul_dokumen: 'Edaran Khusus Madrasah',
        tampilkan_kop: 'Ya',
        documentDate: '2026-11-16',
      },
      { timestamp: '2026-11-16T11:21:00Z' }
    );
    const initWithKop = buildInitialStudioContentFromDraft(withKop.draft);
    expect(initWithKop.includeKopSurat).toBe(true);
    expect(initWithKop.content.content.some((n) => n.type === 'horizontalRule')).toBe(true);
    expect(extractPlainTextAndTokens(initWithKop.content).plainText).toContain(
      demo.settings.schoolName.toUpperCase()
    );
  });

  it('5. Kompatibilitas draft lama (pre-Tahap 5 tanpa previewBlocks): cocok versi vs version mismatch eksplisit', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      buildValidValuesForTemplate('SYS-TPL-01', demo),
      { timestamp: '2026-11-16T11:25:00Z' }
    );

    const legacyDraft = JSON.parse(JSON.stringify(saved.draft)) as DocumentIntakeDraft;
    delete legacyDraft.templateSnapshot.previewBlocks;

    // A. Versi sama -> pulih aman dari active template
    const matchRes = buildInitialStudioContentFromDraft(legacyDraft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    expect(matchRes.resolution.status).toBe('ACTIVE_MATCH');
    expect(matchRes.resolution.requiresConfirmation).toBe(false);
    expect(validateTipTapContent(matchRes.content).valid).toBe(true);

    // B. Versi berbeda -> peringatan eksplisit meminta konfirmasi tanpa silent overwrite
    const bumpedTemplate = { ...tpl01, version: '2.0.0' };
    const mismatchRes = buildInitialStudioContentFromDraft(legacyDraft, {
      activeTemplates: [bumpedTemplate],
    });
    expect(mismatchRes.resolution.status).toBe('VERSION_MISMATCH');
    expect(mismatchRes.resolution.requiresConfirmation).toBe(true);
    expect(mismatchRes.resolution.snapshotVersion).toBe('1.0.0');
    expect(mismatchRes.resolution.activeVersion).toBe('2.0.0');

    // C. Template dihapus -> kanvas aman fallback tanpa crash
    const missingRes = buildInitialStudioContentFromDraft(legacyDraft, {
      activeTemplates: [],
    });
    // Karena legacyDraft SYS-TPL-01 masih ter-match oleh registry SYSTEM fallback, uji template MADRASAH yang terhapus:
    const customDeletedDraft: DocumentIntakeDraft = {
      ...legacyDraft,
      templateId: 'USR-TPL-DELETED-999',
      templateSnapshot: {
        ...legacyDraft.templateSnapshot,
        templateId: 'USR-TPL-DELETED-999',
        source: 'MADRASAH',
        sourceTemplateId: null,
      },
    };
    const notFoundRes = buildInitialStudioContentFromDraft(customDeletedDraft, {
      activeTemplates: [],
    });
    expect(notFoundRes.resolution.status).toBe('NOT_FOUND');
    expect(validateTipTapContent(notFoundRes.content).valid).toBe(true);
    expect(missingRes.content.type).toBe('doc');
  });

  it('6. Idempotensi simpan S04, pelestarian naskah S04 saat S03 diedit ulang, & penolakan penomoran S05', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const vals = buildValidValuesForTemplate('SYS-TPL-01', demo);
    const s03Saved = saveIntakeDraftToState(demo, tpl01, vals, {
      timestamp: '2026-11-16T11:30:00Z',
    });

    const studioV1 = createValidStudioSampleState(s03Saved.draft, 'Paragraf S04 Revisi Kesatu');
    const savedS04First = saveStudioDraftToState(s03Saved.state, s03Saved.draft.id, studioV1, {
      timestamp: '2026-11-16T11:32:00Z',
    });

    expect(savedS04First.state.intakeDrafts).toHaveLength(1);
    expect(savedS04First.state.documents).toHaveLength(1);
    expect(savedS04First.documentRecord.status).toBe('DRAFT');
    expect(savedS04First.documentRecord.documentNumber).toBeNull();
    expect(savedS04First.documentRecord.archivedAt).toBeNull();
    expect(savedS04First.documentRecord.tags).toContain('Studio-S04');

    // Edit S03 ulang setelah S04 punya naskah -> TIDAK BOLEH menghapus/menimpa naskah S04 diam-diam
    const s03EditedAgain = saveIntakeDraftToState(
      savedS04First.state,
      tpl01,
      { ...vals, lokasi: 'Lokasi Baru Diperbarui' },
      {
        existingDraftId: s03Saved.draft.id,
        existingDocumentId: s03Saved.documentRecord.id,
        timestamp: '2026-11-16T11:35:00Z',
      }
    );

    expect(s03EditedAgain.draft.studio?.editorStatus).toBe('IN_PROGRESS');
    expect(
      extractPlainTextAndTokens(s03EditedAgain.draft.studio!.content).plainText
    ).toContain('Paragraf S04 Revisi Kesatu');
    expect(s03EditedAgain.draft.s03EditedAfterStudioAt).toBe('2026-11-16T11:35:00Z');
    expect(s03EditedAgain.state.intakeDrafts).toHaveLength(1);
    expect(s03EditedAgain.state.documents).toHaveLength(1);
  });

  it('7. Validasi batas margin/kertas, penolakan node/atribut berbahaya TipTap JSON, dan sanitasi HTML paste Word/XSS', () => {
    // Margin/Kertas validation
    expect(
      validateStudioPageSettings({
        paperSize: 'f4',
        orientation: 'landscape',
        marginsMm: { top: 15, right: 20, bottom: 15, left: 25 },
      }).valid
    ).toBe(true);
    expect(
      validateStudioPageSettings({
        paperSize: 'a4',
        orientation: 'portrait',
        marginsMm: { top: 2, right: 20, bottom: 20, left: 25 },
      }).valid
    ).toBe(false);
    expect(
      validateStudioPageSettings({
        paperSize: 'letter',
        orientation: 'portrait',
        marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
      }).valid
    ).toBe(false);

    // Malicious / Unknown TipTap JSON rejection
    expect(
      validateTipTapContent({
        type: 'doc',
        content: [{ type: 'script', content: [{ type: 'text', text: 'alert(1)' }] }],
      }).valid
    ).toBe(false);

    expect(
      validateTipTapContent({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            attrs: { onclick: 'alert(1)' },
            content: [{ type: 'text', text: 'unsafe' }],
          },
        ],
      }).valid
    ).toBe(false);

    expect(
      validateStudioState({
        schemaVersion: 1,
        editorStatus: 'IN_PROGRESS',
        updatedAt: '2026-11-16T12:00:00Z',
        pageSettings: {
          paperSize: 'a4',
          orientation: 'portrait',
          marginsMm: { top: 90, right: 20, bottom: 20, left: 25 },
        },
        content: { type: 'doc', content: [{ type: 'paragraph', content: [] }] },
      }).valid
    ).toBe(false);

    // HTML Paste sanitization (XSS + Word mso- styling)
    const dirtyPaste =
      '<p class="MsoNormal" style="mso-margin-top-alt:auto;color:red" onclick="alert(1)">Isi <strong>Penting</strong></p>' +
      '<script>window.__xss=true</script><iframe src="https://evil.example"></iframe>' +
      '<a href="javascript:alert(1)">Klik</a>';
    const sanitized = sanitizePastedHtml(dirtyPaste);
    expect(sanitized).toContain('<p>Isi <strong>Penting</strong></p>');
    expect(sanitized).not.toContain('<script');
    expect(sanitized).not.toContain('<iframe');
    expect(sanitized).not.toContain('onclick');
    expect(sanitized).not.toContain('mso-margin');
    expect(sanitized).not.toContain('javascript:');
  });

  it('8. Integritas Backup JSON & .signal ber-SHA-256 mempertahankan draft.studio, menolak tampering, & menjaga migrasi skema aman', async () => {
    expect(DB_VERSION).toBeGreaterThanOrEqual(3);
    expect(CURRENT_APP_SCHEMA_VERSION).toBe(2);

    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const s03 = saveIntakeDraftToState(demo, tpl01, buildValidValuesForTemplate('SYS-TPL-01', demo), {
      timestamp: '2026-11-16T11:40:00Z',
    });
    const studioState = createValidStudioSampleState(s03.draft, 'Paragraf Arsip Terenkripsi SHA256');
    const s04 = saveStudioDraftToState(s03.state, s03.draft.id, studioState, {
      timestamp: '2026-11-16T11:42:00Z',
    });

    // Round-trip Backup JSON
    const backup = await buildBackupEnvelope(s04.state);
    const parsedBackup = await parseBackupContent(JSON.stringify(backup));
    expect(parsedBackup.verification).toBe('verified');
    expect(parsedBackup.state.intakeDrafts?.[0]?.studio).toEqual(s04.draft.studio);

    // Tamper 1 karakter di dalam draft.studio.content -> wajib ditolak SHA-256
    const tampered = JSON.parse(JSON.stringify(backup));
    const lastNode =
      tampered.payload.intakeDrafts[0].studio.content.content[
        tampered.payload.intakeDrafts[0].studio.content.content.length - 1
      ];
    lastNode.content[0].text += '!';
    await expect(parseBackupContent(JSON.stringify(tampered))).rejects.toThrow(/SHA-256/i);

    // .signal container round-trip
    const seal = await buildSignalContainer(s04.state, []);
    const parsedSeal = await parseSignalContent(JSON.stringify(seal));
    expect(parsedSeal.verification).toBe('verified');
    expect(parsedSeal.state.intakeDrafts?.[0]?.studio).toEqual(s04.draft.studio);

    // Validasi struktur korup pada item.studio ditolak validateAppStateStructure
    const corruptStudioApp = JSON.parse(JSON.stringify(s04.state)) as AppState;
    (corruptStudioApp.intakeDrafts![0].studio!.content.content as unknown[]) = [{ type: 'iframe' }];
    expect(() => validateAppStateStructure(corruptStudioApp)).toThrow();

    // Backup valid tanpa properti previewBlocks / studio tetap lolos & idempoten
    const legacyNoStudio = JSON.parse(JSON.stringify(s03.state)) as AppState;
    delete legacyNoStudio.intakeDrafts![0].templateSnapshot.previewBlocks;
    const legacyBody = {
      formatName: 'SIGNAL-LOCAL-BACKUP' as const,
      formatVersion: 2,
      schemaVersion: 2,
      appVersion: '1.2.1',
      checksumAlgorithm: 'SHA-256' as const,
      exportedAt: '2026-11-16T11:00:00Z',
      payload: legacyNoStudio,
    };
    const legacyChecksum = await computeCanonicalSha256(legacyBody);
    const parsedLegacy = await parseBackupContent(
      JSON.stringify({ ...legacyBody, checksum: legacyChecksum })
    );
    expect(parsedLegacy.verification).toBe('verified');
    expect(migrateAppStateSchema(parsedLegacy.state).changed).toBe(false);
  });

  it('9. Render SSR DocumentStudio S04, PersuratanWorkspace, S01, S03, dan App menjaga batas jujur Tahap 5', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const savedS03 = saveIntakeDraftToState(
      demo,
      tpl01,
      buildValidValuesForTemplate('SYS-TPL-01', demo),
      { timestamp: '2026-11-16T11:45:00Z' }
    );
    const studioSample = createValidStudioSampleState(savedS03.draft, 'Uji Render SSR Studio');
    const savedS04 = saveStudioDraftToState(savedS03.state, savedS03.draft.id, studioSample, {
      timestamp: '2026-11-16T11:46:00Z',
    });

    const studioHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state: savedS04.state,
        initialView: 'studio',
        initialDraftId: savedS04.draft.id,
      })
    );

    expect(studioHtml).toContain('data-doc-editor="true"');
    expect(studioHtml).toContain('Editor Naskah');
    expect(studioHtml).toContain('Pas');
    expect(studioHtml).toContain('Simpan Draft');
    expect(studioHtml).toContain('Ubah Data Surat');
    expect(studioHtml).toContain('Mode Fokus');
    expect(studioHtml).toContain('Detail Dokumen');
    expect(studioHtml).toContain('Sumber Snapshot');
    expect(studioHtml).toContain('Pengaturan Halaman');
    expect(studioHtml).toContain('Dataset Demo');
    expect(studioHtml).toContain('Uji Render SSR Studio');
    // Batas jujur: kontrol finalisasi hanya terbuka lewat slide-over drawer atau halaman S05
    expect(studioHtml).not.toContain('Terbitkan Nomor');
    expect(studioHtml).not.toContain('Finalisasi Dokumen');
    expect(studioHtml).not.toContain('Tanda Tangan Digital');

    // Render langsung komponen DocumentStudio untuk draft dengan konflik S03 pasca-S04
    const reEditedS03 = saveIntakeDraftToState(
      savedS04.state,
      tpl01,
      { ...buildValidValuesForTemplate('SYS-TPL-01', demo), lokasi: 'Aula Diperbarui' },
      {
        existingDraftId: savedS04.draft.id,
        existingDocumentId: savedS04.documentRecord.id,
        timestamp: '2026-11-16T11:50:00Z',
      }
    );
    const conflictStudioHtml = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: reEditedS03.state,
        draft: reEditedS03.draft,
        onPersistStudioState: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(conflictStudioHtml).toContain('Data Awal telah diperbarui');
    expect(conflictStudioHtml).toContain('Pertahankan Naskah Editor');
    expect(conflictStudioHtml).toContain('Buat Ulang dari Data Baru');

    // S01 menampilkan Lanjutkan Naskah & dock aksi kebab tetap utuh
    const s01Html = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: savedS04.state,
        onEditIntakeDraft: () => {},
        onOpenStudio: () => {},
      })
    );
    expect(s01Html).toContain('Data surat tersimpan');
    expect(s01Html).toContain('Lanjutkan Naskah');
    expect(s01Html).toContain('s5-action-dock');
    expect(s01Html).toContain('Aksi lainnya untuk');

    // S03 menampilkan tombol Buka Editor Naskah pada draft tersimpan
    const s03Html = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: savedS03.state,
        template: tpl01,
        existingDraft: savedS03.draft,
        onSaveDraft: () => {},
        onOpenStudio: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(s03Html).toContain('Buka Editor Naskah');

    // App shell tetap utuh
    const appHtml = renderToStaticMarkup(createElement(App));
    expect(appHtml).toContain('SAKALA');
  });
});
