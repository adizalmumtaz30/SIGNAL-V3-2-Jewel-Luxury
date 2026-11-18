import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import jsPDF from 'jspdf';
import { createDemoState } from '../src/domain/seed';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import {
  createInitialIntakeFormValues,
  deleteDraftFromState,
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { getIntakeSchemaForTemplate } from '../src/domain/persuratan/intake/schemaRegistry';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import type { TipTapJSONContent, TipTapJSONNode } from '../src/domain/persuratan/studio/types';
import {
  computeNextSequentialNumber,
  isDocumentNumberDuplicate,
  validateOfficialDocumentNumber,
} from '../src/domain/persuratan/finalization/numberingEngine';
import { evaluateFinalizationChecklist } from '../src/domain/persuratan/finalization/checklist';
import {
  clearMemoryFinalPdfStore,
  defaultFinalPdfStorageAdapter,
  isPdfBytesSignatureValid,
  type FinalPdfStorageAdapter,
} from '../src/domain/persuratan/finalization/finalPdfStore';
import {
  createRevisionDraftInState,
  finalizeDocumentTransaction,
  getDocumentVersionChain,
} from '../src/domain/persuratan/finalization/finalizeEngine';
import { renderOfficialDocumentPdf } from '../src/domain/persuratan/finalization/pdfRenderer';
import { DocumentPreviewFinalize } from '../src/components/persuratan/DocumentPreviewFinalize';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';
import { getDefaultMadrasahLogo } from '../src/utils/madrasahLogo';

const TEST_VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function buildCleanContentWithNumberToken(extraRows = 0): TipTapJSONContent {
  const rows: TipTapJSONNode[] = [
    {
      type: 'tableRow',
      content: [
        {
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1, verticalAlign: 'middle' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No' }] }],
        },
        {
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1, verticalAlign: 'middle' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Uraian Penugasan' }] }],
        },
      ],
    },
    {
      type: 'tableRow',
      content: [
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'top' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }],
        },
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'top' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Pembimbing KSM Sains' }] }],
        },
      ],
    },
  ];

  for (let i = 2; i <= extraRows + 1; i += 1) {
    rows.push({
      type: 'tableRow',
      content: [
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'top' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: String(i) }] }],
        },
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'top' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `Penugasan Baris ${i}` }] }],
        },
      ],
    });
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'docImage',
        attrs: {
          src: getDefaultMadrasahLogo() || TEST_VALID_PNG_DATA_URL,
          alt: 'Logo Resmi',
          widthMm: 18,
          align: 'center',
        },
      },
      {
        type: 'heading',
        attrs: { level: 1, textAlign: 'center' },
        content: [{ type: 'text', text: 'SURAT TUGAS RESMI' }],
      },
      {
        type: 'paragraph',
        attrs: { textAlign: 'center' },
        content: [{ type: 'text', text: 'Nomor: {{NOMOR_SURAT}} [Belum diisi]' }],
      },
      {
        type: 'paragraph',
        attrs: { textAlign: 'justify' },
        content: [
          {
            type: 'text',
            text: 'Kepala Madrasah menugaskan guru tersebut untuk melaksanakan kegiatan resmi sesuai jadwal.',
          },
        ],
      },
      {
        type: 'table',
        attrs: { repeatHeader: true },
        content: rows,
      },
      ...(extraRows >= 20 ? ([{ type: 'pageBreak' as const }] as TipTapJSONNode[]) : []),
      {
        type: 'paragraph',
        attrs: { textAlign: 'left' },
        content: [{ type: 'text', text: 'Demikian surat tugas ini dibuat untuk dilaksanakan.' }],
      },
    ],
  };
}

function createPreparedDraftState() {
  const base = createDemoState();
  const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
  const t0 = base.teachers[0];

  const savedIntake = saveIntakeDraftToState(
    base,
    tpl01,
    {
      documentTitle: 'Surat Tugas Olimpiade Sains',
      documentDate: '2026-11-17',
      peserta: [t0.id],
      nama_kegiatan: 'Pembinaan Olimpiade Madrasah',
      penyelenggara: 'Kemenag Kab. Malang',
      tanggal_mulai: '2026-11-20',
      tanggal_selesai: '2026-11-22',
      lokasi: 'Aula Kemenag',
      dasar_surat: 'Undangan Resmi 01/2026',
    },
    { timestamp: '2026-11-17T08:00:00Z' }
  );

  const initial = buildInitialStudioContentFromDraft(savedIntake.draft);
  const cleanContent = buildCleanContentWithNumberToken(2);

  const savedStudio = saveStudioDraftToState(
    savedIntake.state,
    savedIntake.draft.id,
    {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: cleanContent,
      pageSettings: {
        ...initial.pageSettings,
        paperSize: 'a4',
        orientation: 'portrait',
        headerText: 'Surat Tugas Resmi Madrasah',
        footerText: 'Dokumen Persuratan SIGNAL',
        showPageNumbers: true,
        pageNumberFormat: 'HALAMAN_DARI_TOTAL',
        repeatTableHeader: true,
      },
      updatedAt: '2026-11-17T08:15:00Z',
    },
    { timestamp: '2026-11-17T08:15:00Z' }
  );

  return {
    state: savedStudio.state,
    draft: savedStudio.draft,
  };
}

describe('Tahap 8 — S05 Preview, Checklist, Penomoran, Finalisasi PDF & Revisi Non-Destruktif', () => {
  it('1. Penomoran surat otomatis (YEARLY/MONTHLY/CONTINUOUS), anti-duplikat lintas dokumen & versi, serta tidak memakan nomor saat preview/hapus draft', () => {
    const base = createDemoState();
    const { state, draft } = createPreparedDraftState();

    // Preview read-only tidak boleh mengubah urutan ketika dipanggil berkali-kali
    const c1 = computeNextSequentialNumber({
      state,
      kind: 'SURAT_TUGAS',
      documentDate: '2026-11-17',
    });
    const c2 = computeNextSequentialNumber({
      state,
      kind: 'SURAT_TUGAS',
      documentDate: '2026-11-17',
    });
    expect(c1.suggestedNumber).toBe(c2.suggestedNumber);
    expect(c1.nextSequence).toBeGreaterThanOrEqual(1);
    expect(c1.suggestedNumber).toContain('/ST/');
    expect(c1.suggestedNumber).toContain('/XI/2026');

    // Mode MONTHLY mereset per bulan sementara CONTINUOUS merata semua tahun
    const stateWith2026Nov = {
      ...base,
      settings: {
        ...base.settings,
        documentNumbering: {
          enabled: true,
          madrasahCode: 'MAN.1',
          formatPattern: '{SEQ}/{KODE_SURAT}/{KODE_MADRASAH}/{BULAN_ROMAWI}/{TAHUN}',
          seqPadding: 3,
          resetMode: 'MONTHLY' as const,
          kindCodes: { SURAT_TUGAS: 'ST' },
        },
      },
      documents: [
        ...(base.documents ?? []),
        {
          id: 'DOC-EXISTING-NOV',
          direction: 'OUTGOING' as const,
          documentType: 'SURAT_TUGAS' as const,
          documentNumber: '005/ST/MAN.1/XI/2026',
          title: 'Dokumen Nov',
          subject: 'Uji',
          documentDate: '2026-11-10',
          status: 'FINAL' as const,
          relatedTeacherIds: [],
          tags: [],
          createdAt: '2026-11-10T01:00:00Z',
          updatedAt: '2026-11-10T01:00:00Z',
          archivedAt: null,
        },
      ],
    };

    const nextNovMonthly = computeNextSequentialNumber({
      state: stateWith2026Nov,
      kind: 'SURAT_TUGAS',
      documentDate: '2026-11-18',
    });
    expect(nextNovMonthly.suggestedNumber).toBe('006/ST/MAN.1/XI/2026');

    const nextDecMonthly = computeNextSequentialNumber({
      state: stateWith2026Nov,
      kind: 'SURAT_TUGAS',
      documentDate: '2026-12-01',
    });
    expect(nextDecMonthly.suggestedNumber).toBe('001/ST/MAN.1/XII/2026');

    // Duplicate guard harus menolak nomor yang sama (case-insensitive / spasi beda)
    expect(isDocumentNumberDuplicate('005/st/man.1/xi/2026', stateWith2026Nov)).toBe(true);
    const dupCheck = validateOfficialDocumentNumber('005/ST/MAN.1/XI/2026', stateWith2026Nov);
    expect(dupCheck.valid).toBe(false);
    expect(dupCheck.error).toContain('sudah terdaftar');

    // Validasi juga memeriksa riwayat documentVersions agar bekas nomor versi lama tidak pernah dipakai ulang
    const stateWithOldVersionOnly = {
      ...base,
      documents: [],
      documentVersions: [
        {
          id: 'VER-OLD-1',
          documentId: 'DOC-OLD',
          rootDocumentId: 'DOC-OLD',
          parentVersionId: null,
          versionNumber: 1,
          status: 'FINAL' as const,
          documentNumber: '012/SK/MAN.1/XI/2026',
          numberingMode: 'AUTO' as const,
          title: 'SK Lama',
          subject: 'SK Lama',
          documentDate: '2026-11-01',
          documentKind: 'SK' as const,
          relatedTeacherIds: [],
          templateSnapshot: SYSTEM_DOCUMENT_TEMPLATES[2] as never,
          sourceSnapshots: [],
          fieldValues: {},
          snapshotContent: { type: 'doc' as const, content: [] },
          snapshotPageSettings: draft.studio!.pageSettings,
          contentChecksum: 'a'.repeat(64),
          pdfChecksum: 'b'.repeat(64),
          pdfStorageKey: 'PDF-VER-OLD-1',
          pdfSizeBytes: 1000,
          pdfPageCount: 1,
          finalizedAt: '2026-11-01T00:00:00Z',
          finalizedBy: 'Kepala',
        },
      ],
    };
    const dupInVersion = validateOfficialDocumentNumber('012/SK/MAN.1/XI/2026', stateWithOldVersionOnly);
    expect(dupInVersion.valid).toBe(false);
  });

  it('2. Checklist S05 memblokir token non-nomor, tanggal tidak valid, Kop/penandatangan kosong, dan jadwal non-resmi pada SK', () => {
    const { state, draft } = createPreparedDraftState();

    // Dokumen bersih dengan {{NOMOR_SURAT}} lolos canFinalize (tetap mencatat requiresDemoAck pada demo state)
    const okReport = evaluateFinalizationChecklist({
      draft,
      content: draft.studio!.content,
      state,
    });
    expect(okReport.canFinalize).toBe(true);
    expect(okReport.blockersCount).toBe(0);
    expect(okReport.requiresDemoAck).toBe(true);

    // Token selain nomor surat wajib memblokir
    const dirtyContent: TipTapJSONContent = {
      type: 'doc',
      content: [
        ...draft.studio!.content.content,
        { type: 'paragraph', content: [{ type: 'text', text: 'Tujuan: {{TUJUAN_KHUSUS}} [Belum diisi]' }] },
      ],
    };
    const tokenReport = evaluateFinalizationChecklist({
      draft,
      content: dirtyContent,
      state,
    });
    expect(tokenReport.canFinalize).toBe(false);
    expect(tokenReport.unresolvedTokens).toContain('TUJUAN_KHUSUS');

    // SK (SYS-TPL-03) tanpa ScheduleVersion valid wajib ditolak
    const tpl03 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-03')!;
    const tpl03Schema = getIntakeSchemaForTemplate(tpl03);
    const tpl03Vals: Record<string, unknown> = {
      ...createInitialIntakeFormValues(tpl03, state),
      documentDate: '2026-11-17',
    };
    for (const ctrl of tpl03Schema.controls) {
      if (ctrl.controlType === 'auto_system') continue;
      if (ctrl.controlType === 'date') tpl03Vals[ctrl.key] = '2026-11-17';
      else if (ctrl.controlType === 'schedule_version') tpl03Vals[ctrl.key] = state.history[0]?.id ?? '';
      else if (ctrl.controlType === 'select') tpl03Vals[ctrl.key] = ctrl.options?.[0]?.value ?? 'Ya';
      else if (!tpl03Vals[ctrl.key]) tpl03Vals[ctrl.key] = `Isian ${ctrl.key}`;
    }
    const emptyIdentityState = {
      ...state,
      settings: {
        ...state.settings,
        schoolName: '',
        address: '',
        city: '',
        headmasterName: '',
      },
    };
    const skSaved = saveIntakeDraftToState(state, tpl03, tpl03Vals);
    const skWithoutScheduleAndIdentity = {
      ...skSaved.draft,
      scheduleVersionId: null,
      sourceSnapshots: skSaved.draft.sourceSnapshots.map((snap) =>
        snap.sourceKey === 'settings.madrasah_identity_signatory'
          ? {
              ...snap,
              capturedValue: {
                schoolName: '',
                address: '',
                city: '',
                signatoryTitle: 'Kepala Madrasah',
                signatoryName: '',
                signatoryNip: '',
              },
            }
          : snap
      ),
    };
    const skBlocked = evaluateFinalizationChecklist({
      draft: skWithoutScheduleAndIdentity,
      content: buildCleanContentWithNumberToken(0),
      state: emptyIdentityState,
    });
    expect(skBlocked.canFinalize).toBe(false);
    expect(skBlocked.items.some((i) => i.id === 'published_schedule_source' && !i.passed)).toBe(true);
    expect(skBlocked.items.some((i) => i.id === 'kop_identity' && !i.passed)).toBe(true);
    expect(skBlocked.items.some((i) => i.id === 'official_signatory' && !i.passed)).toBe(true);
  });

  it('3. Transaksi finalisasi atomic menghasilkan PDF %PDF- valid multi-halaman F4 tanpa memanggil jsPDF.save(), menyisipkan nomor, dan menolak bila storage gagal', async () => {
    clearMemoryFinalPdfStore();
    const saveSpy = vi.spyOn(
      jsPDF.API as unknown as { save: (...args: unknown[]) => unknown },
      'save'
    );
    const { state, draft } = createPreparedDraftState();

    // Render multi-halaman F4 landscape dengan tabel 40 baris + pageBreak + header/footer + logo
    const complex40Rows = buildCleanContentWithNumberToken(40);
    const f4Preview = await renderOfficialDocumentPdf({
      draft,
      content: complex40Rows,
      pageSettings: {
        ...draft.studio!.pageSettings,
        paperSize: 'f4',
        orientation: 'landscape',
      },
      state,
      officialNumber: '001/ST/MTsN.1/XI/2026',
    });
    expect(isPdfBytesSignatureValid(f4Preview.pdfBytes)).toBe(true);
    expect(f4Preview.pageCount).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(f4Preview.resolvedContent)).not.toContain('{{NOMOR_SURAT}}');
    expect(JSON.stringify(f4Preview.resolvedContent)).toContain('001/ST/MTsN.1/XI/2026');
    expect(saveSpy).not.toHaveBeenCalled();

    // Uji rollback transaksi ketika penyimpanan PDF gagal -> dokumen harus tetap DRAFT
    const failingAdapter: FinalPdfStorageAdapter = {
      async saveFinalPdf() {
        throw new Error('Disk IndexedDB penuh simulasi');
      },
      async getFinalPdf() {
        return null;
      },
    };
    const nextCandidate = computeNextSequentialNumber({
      state,
      kind: 'SURAT_TUGAS',
      documentDate: draft.documentDate,
    });

    await expect(
      finalizeDocumentTransaction({
        state,
        draft,
        content: draft.studio!.content,
        pageSettings: draft.studio!.pageSettings,
        documentNumber: nextCandidate.suggestedNumber,
        numberingMode: 'AUTO',
        demoAcknowledged: true,
        storageAdapter: failingAdapter,
      })
    ).rejects.toThrow('Disk IndexedDB penuh simulasi');

    // State asal tidak tersentuh
    const stillDraft = (state.documents ?? []).find((d) => d.id === draft.documentId);
    expect(stillDraft?.status).toBe('DRAFT');
    expect(stillDraft?.documentNumber).toBeNull();
    expect(state.documentVersions ?? []).toHaveLength(0);

    // Uji sukses transaksi dengan adapter default
    const finalized = await finalizeDocumentTransaction({
      state,
      draft,
      content: draft.studio!.content,
      pageSettings: draft.studio!.pageSettings,
      documentNumber: nextCandidate.suggestedNumber,
      numberingMode: 'AUTO',
      demoAcknowledged: true,
      timestamp: '2026-11-17T09:00:00Z',
    });

    expect(finalized.documentRecord.status).toBe('FINAL');
    expect(finalized.documentRecord.documentNumber).toBe(nextCandidate.suggestedNumber);
    expect(finalized.documentVersion.versionNumber).toBe(1);
    expect(finalized.documentVersion.pdfChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(isPdfBytesSignatureValid(finalized.pdfBytes)).toBe(true);

    const storedPdf = await defaultFinalPdfStorageAdapter.getFinalPdf(
      finalized.documentVersion.pdfStorageKey
    );
    expect(storedPdf).not.toBeNull();
    expect(storedPdf?.sha256).toBe(finalized.documentVersion.pdfChecksum);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('4. Dokumen FINAL terkunci read-only dan revisi non-destruktif menerbitkan versi v2 tanpa menimpa v1', async () => {
    clearMemoryFinalPdfStore();
    const { state, draft } = createPreparedDraftState();
    const candidate = computeNextSequentialNumber({
      state,
      kind: 'SURAT_TUGAS',
      documentDate: draft.documentDate,
    });

    const v1 = await finalizeDocumentTransaction({
      state,
      draft,
      content: draft.studio!.content,
      pageSettings: draft.studio!.pageSettings,
      documentNumber: candidate.suggestedNumber,
      numberingMode: 'AUTO',
      demoAcknowledged: true,
      timestamp: '2026-11-17T09:00:00Z',
    });

    // Penolakan edit/hapus draft FINAL
    expect(() =>
      saveStudioDraftToState(v1.state, draft.id, draft.studio!)
    ).toThrow(/read-only/i);
    expect(() =>
      deleteDraftFromState(v1.state, { draftId: draft.id, documentId: draft.documentId })
    ).toThrow(/disahkan|dihapus/i);

    // Buat revisi non-destruktif v2
    const rev = createRevisionDraftInState(v1.state, {
      sourceDocumentId: v1.documentRecord.id,
      revisionReason: 'Perbaikan lokasi aula kegiatan sesuai ralat panitia',
      timestamp: '2026-11-17T09:30:00Z',
    });

    expect(rev.revisionDocument.status).toBe('DRAFT');
    expect(rev.revisionDocument.documentNumber).toBeNull();
    expect(rev.revisionDocument.versionNumber).toBe(2);
    expect(rev.revisionDocument.parentDocumentId).toBe(v1.documentRecord.id);

    // Dokumen v1 di state tetap FINAL utuh
    const preservedV1 = (rev.state.documents ?? []).find((d) => d.id === v1.documentRecord.id);
    expect(preservedV1?.status).toBe('FINAL');
    expect(preservedV1?.documentNumber).toBe(candidate.suggestedNumber);

    // Finalisasi revisi v2 menghasilkan nomor resmi baru & chain v2 -> v1 terurut
    const candidateV2 = computeNextSequentialNumber({
      state: rev.state,
      kind: 'SURAT_TUGAS',
      documentDate: rev.revisionDraft.documentDate,
    });
    expect(candidateV2.suggestedNumber).not.toBe(candidate.suggestedNumber);

    const v2 = await finalizeDocumentTransaction({
      state: rev.state,
      draft: rev.revisionDraft,
      content: rev.revisionDraft.studio!.content,
      pageSettings: rev.revisionDraft.studio!.pageSettings,
      documentNumber: candidateV2.suggestedNumber,
      numberingMode: 'AUTO',
      demoAcknowledged: true,
      timestamp: '2026-11-17T10:00:00Z',
    });

    const chain = getDocumentVersionChain(v2.state, v2.documentRecord.id);
    expect(chain.versions).toHaveLength(2);
    expect(chain.versions[0].versionNumber).toBe(2);
    expect(chain.versions[1].versionNumber).toBe(1);
    expect(chain.versions[1].documentNumber).toBe(candidate.suggestedNumber);
  });

  it('5. Komponen S05 DocumentPreviewFinalize & PersuratanWorkspace (mode preview) ter-render bersih via SSR', () => {
    const { state, draft } = createPreparedDraftState();
    const doc = (state.documents ?? []).find((d) => d.id === draft.documentId)!;

    const previewHtml = renderToStaticMarkup(
      createElement(DocumentPreviewFinalize, {
        state,
        draft,
        documentRecord: doc,
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(previewHtml).toContain('S05 PRATINJAU &amp; PENGESAHAN');
    expect(previewHtml).toContain('Checklist Administrasi');
    expect(previewHtml).toContain('Terbitkan Nomor Surat');
    expect(previewHtml).toContain('Finalisasi Dokumen');

    const workspaceHtml = renderToStaticMarkup(
      createElement(PersuratanWorkspace, {
        state,
        onPersistState: async () => {},
        onNotify: () => {},
        onNavigateToSettings: () => {},
      })
    );
    expect(workspaceHtml).toContain('Arsip &amp; Surat');
    expect(workspaceHtml).toContain('4. Pratinjau &amp; Sahkan');
  });
});
