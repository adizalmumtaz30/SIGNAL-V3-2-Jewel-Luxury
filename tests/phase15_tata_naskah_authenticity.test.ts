import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DocumentArchiveDetail } from '../src/components/persuratan/DocumentArchiveDetail';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentPreviewFinalize } from '../src/components/persuratan/DocumentPreviewFinalize';
import { NumberingFormatModal } from '../src/components/persuratan/NumberingFormatModal';
import { evaluateFinalizationChecklist } from '../src/domain/persuratan/finalization/checklist';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import {
  computeNextSequentialNumber,
  deriveMadrasahAbbreviation,
  extractLeadingSequenceNumber,
} from '../src/domain/persuratan/finalization/numberingEngine';
import {
  renderOfficialDocumentPdf,
  substituteOfficialDocumentNumberInContent,
} from '../src/domain/persuratan/finalization/pdfRenderer';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { getIntakeSchemaForTemplate } from '../src/domain/persuratan/intake/schemaRegistry';
import {
  buildInitialStudioContentFromDraft,
  formatIndonesianDateRange,
} from '../src/domain/persuratan/studio/contentGenerator';
import {
  extractPlainTextAndTokens,
  validateTipTapContent,
} from '../src/domain/persuratan/studio/contentValidation';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { createDemoState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';

function makeDraftForTemplate(
  state: AppState,
  templateId: string,
  overrides: Record<string, unknown> = {}
) {
  const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === templateId)!;
  const schema = getIntakeSchemaForTemplate(tpl);
  const base = createInitialIntakeFormValues(tpl, state);
  const activeTeachers = state.teachers.filter((t) => t.isActive);
  const teacherId = activeTeachers[0]?.id ?? state.teachers[0].id;
  const classId = state.classes.find((c) => c.isActive)?.id ?? state.classes[0].id;
  const subjectId = state.subjects.find((s) => s.isActive)?.id ?? state.subjects[0].id;

  const filled: Record<string, unknown> = {
    ...base,
    documentDate: '2026-11-24',
  };

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'auto_system') continue;
    if (ctrl.required === false) continue; // deliberately leave optional fields blank to test zero-blocker resilience
    if (ctrl.controlType === 'date_range') {
      const startKey = ctrl.startKey ?? `${ctrl.key}_mulai`;
      const endKey = ctrl.endKey ?? `${ctrl.key}_selesai`;
      filled[startKey] = '2026-11-24';
      filled[endKey] = '2026-11-26';
    } else if (ctrl.controlType === 'date') {
      filled[ctrl.key] = '2026-11-25';
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
      filled[ctrl.key] = `Data uji resmi untuk ${ctrl.label}`;
    }
  }

  Object.assign(filled, overrides);

  const saved = saveIntakeDraftToState(state, tpl, filled, {
    timestamp: '2026-11-24T08:30:00Z',
  });

  return { tpl, nextState: saved.state, draft: saved.draft, documentRecord: saved.documentRecord };
}

describe('Phase 15: Tahap 1 + Tahap 2 — Zero-Bug Logic & Tata Naskah Dinas Kemenag Authenticity', () => {
  it('1. deriveMadrasahAbbreviation produces MTs.DAH for MTs Daruttafsir Al-Husaini and preserves MTs.CN', () => {
    expect(deriveMadrasahAbbreviation('MADRASAH TSANAWIYAH (MTs) DARUTTAFSIR AL-HUSAINI')).toBe(
      'MTs.DAH'
    );
    expect(deriveMadrasahAbbreviation('MTs Daruttafsir Al-Husaini')).toBe('MTs.DAH');
    expect(deriveMadrasahAbbreviation('MTs Cendekia Nusantara')).toBe('MTs.CN');
    expect(deriveMadrasahAbbreviation('Madrasah Aliyah Negeri 1 Depok')).toBe('MA.1D');
  });

  it('2. extractLeadingSequenceNumber parses Kemenag nature prefixes (B-001/..., S-014/...) and plain sequences', () => {
    expect(extractLeadingSequenceNumber('001/ST/MTs.DAH/XI/2026')).toBe(1);
    expect(extractLeadingSequenceNumber('B-014/MTs.DAH/PP.00.5/11/2026')).toBe(14);
    expect(extractLeadingSequenceNumber('S-007/MTs.DAH/KP.01/XI/2026')).toBe(7);
    expect(extractLeadingSequenceNumber('SK.025/MTs.DAH/2026')).toBe(25);
    expect(extractLeadingSequenceNumber('TANPA-ANGKA')).toBeNull();
  });

  it('3. separateSkSequence isolates SK numbering book from general outgoing letters when enabled', () => {
    const demo = createDemoState();
    const withExistingDocs: AppState = {
      ...demo,
      documents: [
        ...(demo.documents ?? []),
        {
          id: 'doc-out-1',
          documentNumber: 'B-005/MTs.DAH/ST/11/2026',
          title: 'Surat Tugas Uji 5',
          subject: 'Surat Tugas Uji 5',
          documentType: 'SURAT_TUGAS',
          direction: 'OUTGOING',
          templateId: 'SYS-TPL-01',
          status: 'FINAL',
          documentDate: '2026-11-10',
          relatedTeacherIds: [],
          createdAt: '2026-11-10T08:00:00Z',
          updatedAt: '2026-11-10T08:00:00Z',
          archivedAt: null,
        },
      ],
    };

    const skShared = computeNextSequentialNumber({
      state: withExistingDocs,
      kind: 'SK',
      documentDate: '2026-11-24',
      configOverride: {
        enabled: true,
        madrasahCode: 'MTs.DAH',
        formatPattern: '{SEQ}/{KODE_SURAT}/{KODE_MADRASAH}/{BULAN_ROMAWI}/{TAHUN}',
        seqPadding: 3,
        resetMode: 'YEARLY',
        separateSkSequence: false,
      },
    });
    expect(skShared.nextSequence).toBe(6);

    const skSeparate = computeNextSequentialNumber({
      state: withExistingDocs,
      kind: 'SK',
      documentDate: '2026-11-24',
      configOverride: {
        enabled: true,
        madrasahCode: 'MTs.DAH',
        formatPattern: '{SEQ}/{KODE_SURAT}/{KODE_MADRASAH}/{BULAN_ROMAWI}/{TAHUN}',
        seqPadding: 3,
        resetMode: 'YEARLY',
        separateSkSequence: true,
      },
    });
    expect(skSeparate.nextSequence).toBe(1);
    expect(skSeparate.suggestedNumber).toBe('001/SK/MTs.DAH/XI/2026');
  });

  it('4. Zero orphan [Belum diisi] blockers across key templates even when optional fields are left blank', () => {
    const demo = createDemoState();
    const templateIds = [
      'SYS-TPL-01',
      'SYS-TPL-03',
      'SYS-TPL-07',
      'SYS-TPL-08',
      'SYS-TPL-09',
      'SYS-TPL-10',
      'SYS-TPL-11',
      'SYS-TPL-16',
      'SYS-TPL-19',
      'SYS-TPL-20',
      'SYS-TPL-23',
      'SYS-TPL-26',
    ];

    for (const tplId of templateIds) {
      const { nextState, draft, documentRecord } = makeDraftForTemplate(demo, tplId);
      const studio = buildInitialStudioContentFromDraft(draft, {
        activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
      });
      const validation = validateTipTapContent(studio.content);
      expect(validation.valid, `TipTap validation failed for ${tplId}: ${validation.error}`).toBe(true);

      const { plainText } = extractPlainTextAndTokens(studio.content);
      expect(plainText, `${tplId} still contains [Belum diisi]`).not.toContain('[Belum diisi]');

      const checklist = evaluateFinalizationChecklist({
        state: nextState,
        draft,
        content: studio.content,
        documentRecord,
      });
      const blockers = checklist.items.filter((i) => !i.passed && i.severity === 'blocker');
      expect(
        blockers,
        `${tplId} has unexpected finalization blockers: ${JSON.stringify(blockers)}`
      ).toHaveLength(0);
      expect(checklist.canFinalize).toBe(true);
    }
  });

  it('5. SYS-TPL-01 Surat Tugas adapts cleanly: 1 teacher uses borderless meta table, 2+ teachers use numbered grid table, and smart date range works', () => {
    const demo = createDemoState();
    const activeTeachers = demo.teachers.filter((t) => t.isActive);
    expect(activeTeachers.length).toBeGreaterThanOrEqual(2);

    // Same-day range helper
    expect(formatIndonesianDateRange('2026-11-25', '2026-11-25')).toBe('Rabu, 25 November 2026');
    expect(formatIndonesianDateRange('2026-11-24', '2026-11-26')).toContain(
      '24 November 2026 s.d. 26 November 2026'
    );

    // 1 teacher → borderless meta layout (NO grid table)
    const single = makeDraftForTemplate(demo, 'SYS-TPL-01', {
      peserta: [activeTeachers[0].id],
      tanggal_mulai: '2026-11-25',
      tanggal_selesai: '2026-11-25',
      dasar_surat: '',
    });
    const singleStudio = buildInitialStudioContentFromDraft(single.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const singleTables = singleStudio.content.content.filter((n) => n.type === 'table');
    expect(singleTables.some((t) => t.attrs?.tableLayout === 'meta')).toBe(true);
    expect(singleTables.some((t) => t.attrs?.tableLayout === 'grid')).toBe(false);
    expect(singleTables.some((t) => t.attrs?.tableLayout === 'signature')).toBe(true);

    // 2 teachers → numbered B&W grid table + zero NIP leakage
    const multi = makeDraftForTemplate(demo, 'SYS-TPL-01', {
      peserta: [activeTeachers[0].id, activeTeachers[1].id],
      tanggal_mulai: '2026-11-24',
      tanggal_selesai: '2026-11-26',
    });
    const multiStudio = buildInitialStudioContentFromDraft(multi.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const multiTables = multiStudio.content.content.filter((n) => n.type === 'table');
    expect(multiTables.some((t) => t.attrs?.tableLayout === 'grid')).toBe(true);
    const { plainText: multiText } = extractPlainTextAndTokens(multiStudio.content);
    if (activeTeachers[0].nip) {
      expect(multiText).not.toContain(activeTeachers[0].nip);
    }
  });

  it('6. SYS-TPL-03 SK Pembagian Tugas Mengajar renders authentic Kemenag SK anatomy + pageBreak Lampiran with real subjects', () => {
    const demo = createDemoState();
    const { draft } = makeDraftForTemplate(demo, 'SYS-TPL-03');
    const studio = buildInitialStudioContentFromDraft(draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const { plainText } = extractPlainTextAndTokens(studio.content);

    expect(plainText).toContain('KEPUTUSAN KEPALA');
    expect(plainText).toContain('Menimbang');
    expect(plainText).toContain('Mengingat');
    expect(plainText).toContain('MEMUTUSKAN');
    expect(plainText).toContain('KESATU');
    expect(plainText).toContain('Lampiran');
    expect(plainText).toContain('DAFTAR PEMBAGIAN TUGAS MENGAJAR GURU');
    expect(studio.content.content.some((n) => n.type === 'pageBreak')).toBe(true);

    // Real resolved subjects from ScheduleVersion (not hardcoded generic placeholder)
    expect(plainText).not.toContain('Sesuai jadwal terverifikasi');
    if (demo.history[0]?.fingerprint) {
      expect(plainText).toContain(demo.history[0].fingerprint);
    }
  });

  it('7. Correspondence letters (SYS-TPL-07, SYS-TPL-08) render authentic borderless letter_header, salam, and right-column signature without fake centered title', () => {
    const demo = createDemoState();

    for (const tplId of ['SYS-TPL-07', 'SYS-TPL-08']) {
      const { draft } = makeDraftForTemplate(demo, tplId);
      const studio = buildInitialStudioContentFromDraft(draft, {
        activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
      });
      const { plainText } = extractPlainTextAndTokens(studio.content);

      const tables = studio.content.content.filter((n) => n.type === 'table');
      expect(tables.some((t) => t.attrs?.tableLayout === 'letter_header')).toBe(true);
      expect(tables.some((t) => t.attrs?.tableLayout === 'signature')).toBe(true);
      expect(plainText).toContain('Assalamu’alaikum');
      expect(plainText).toContain('Wassalamu’alaikum');
      expect(plainText).toContain('Yth.');
    }
  });

  it('8. PDF renderer produces valid PDF bytes for authentic templates & substitutes NOMOR_NOTA_DINAS cleanly', async () => {
    const demo = createDemoState();

    // Test Nota Dinas token substitution
    const nota = makeDraftForTemplate(demo, 'SYS-TPL-10');
    const notaStudio = buildInitialStudioContentFromDraft(nota.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const substituted = substituteOfficialDocumentNumberInContent(
      notaStudio.content,
      '009/ND/MTs.DAH/XI/2026'
    );
    const { plainText: notaText } = extractPlainTextAndTokens(substituted);
    expect(notaText).toContain('009/ND/MTs.DAH/XI/2026');
    expect(notaText).not.toContain('{{NOMOR_NOTA_DINAS}}');

    // Render PDFs across Surat Tugas, SK + Lampiran, Undangan, and Nota Dinas
    for (const tplId of ['SYS-TPL-01', 'SYS-TPL-03', 'SYS-TPL-07', 'SYS-TPL-10']) {
      const { nextState, draft } = makeDraftForTemplate(demo, tplId);
      const studio = buildInitialStudioContentFromDraft(draft, {
        activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
      });
      const rendered = await renderOfficialDocumentPdf({
        draft,
        content: studio.content,
        pageSettings: studio.pageSettings,
        state: nextState,
        officialNumber: `001/UJI/MTs.DAH/XI/2026`,
      });
      expect(rendered.pdfBytes.length).toBeGreaterThan(1500);
      const header = new TextDecoder().decode(rendered.pdfBytes.slice(0, 8));
      expect(header.startsWith('%PDF-')).toBe(true);
    }
  });

  it('9. UI SSR print-parity renders borderless data-table-layout attributes and separateSkSequence toggle', async () => {
    const demo = createDemoState();
    const { tpl, nextState, draft } = makeDraftForTemplate(demo, 'SYS-TPL-07');
    const studio = buildInitialStudioContentFromDraft(draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });

    // NumberingFormatModal exposes separateSkSequence toggle
    const modalHtml = renderToStaticMarkup(
      createElement(NumberingFormatModal, {
        open: true,
        state: demo,
        onClose: () => {},
        onSaveConfig: () => {},
      })
    );
    expect(modalHtml).toContain('Pisahkan buku nomor SK dari surat keluar umum');

    // DocumentIntakeForm live preview renders data-table-layout="letter_header" & "signature"
    const intakeHtml = renderToStaticMarkup(
      createElement(DocumentIntakeForm, {
        state: nextState,
        template: tpl,
        existingDraft: draft,
        onSaveDraft: () => {},
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
      })
    );
    expect(intakeHtml).toContain('data-table-layout="letter_header"');
    expect(intakeHtml).toContain('data-table-layout="signature"');

    // DocumentPreviewFinalize renders authentic borderless tables & pure black ink
    const draftWithStudio = {
      ...draft,
      studioState: {
        schemaVersion: 1 as const,
        editorStatus: 'IN_PROGRESS' as const,
        content: studio.content,
        pageSettings: studio.pageSettings,
        updatedAt: '2026-11-24T09:00:00Z',
      },
    };
    const previewHtml = renderToStaticMarkup(
      createElement(DocumentPreviewFinalize, {
        state: nextState,
        draft: draftWithStudio,
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(previewHtml).toContain('data-table-layout="letter_header"');
    expect(previewHtml).toContain('data-table-layout="signature"');

    // Finalize and check DocumentArchiveDetail SSR parity
    const memStore = new Map<string, any>();
    const finalized = await finalizeDocumentTransaction({
      state: nextState,
      draft: draftWithStudio,
      content: studio.content,
      pageSettings: studio.pageSettings,
      documentNumber: '001/UND/MTs.DAH/XI/2026',
      numberingMode: 'AUTO',
      demoAcknowledged: true,
      timestamp: '2026-11-24T09:05:00Z',
      storageAdapter: {
        saveFinalPdf: async (rec) => {
          memStore.set(rec.storageKey, rec);
        },
        getFinalPdf: async (key) => memStore.get(key) ?? null,
      },
    });
    expect(finalized.documentRecord.status).toBe('FINAL');
    const archiveHtml = renderToStaticMarkup(
      createElement(DocumentArchiveDetail, {
        state: finalized.state,
        documentId: finalized.documentRecord.id,
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(archiveHtml).toContain('data-table-layout="letter_header"');
    expect(archiveHtml).toContain('data-table-layout="signature"');
  });
});
