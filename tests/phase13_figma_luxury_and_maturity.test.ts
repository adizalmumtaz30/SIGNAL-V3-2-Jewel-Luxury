import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoState } from '../src/domain/seed';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { saveIntakeDraftToState } from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import { computeNextSequentialNumber } from '../src/domain/persuratan/finalization/numberingEngine';
import { bulkArchiveDocumentsInState } from '../src/domain/persuratan/archive/archiveEngine';
import {
  buildAgendaCsvString,
  buildAgendaRows,
  exportAgendaRegisterPdf,
} from '../src/domain/persuratan/archive/agendaExport';
import {
  generateBatchDocumentsInState,
  parseManualRecipientsText,
} from '../src/domain/persuratan/intake/batchEngine';
import {
  previewBlocksToTipTapDoc,
  tipTapDocToPreviewBlocks,
} from '../src/components/persuratan/TemplateVisualEditor';
import { NumberingFormatModal } from '../src/components/persuratan/NumberingFormatModal';
import { BatchIssueModal } from '../src/components/persuratan/BatchIssueModal';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { DocumentArchiveDetail } from '../src/components/persuratan/DocumentArchiveDetail';
import { TemplateManager } from '../src/components/persuratan/TemplateManager';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';

describe('Fase A, Fase B & 7 Feature Maturity Upgrades (Persuratan & Arsip)', () => {
  it('1. Pengaturan Format Penomoran Surat Madrasah — startingSequence, madrasahCode, formatPattern, & modal SSR', () => {
    const demo = createDemoState();
    const customState = {
      ...demo,
      settings: {
        ...demo.settings,
        documentNumbering: {
          enabled: true,
          madrasahCode: 'MTsN.02/BDG',
          formatPattern: 'B-{SEQ}/{KODE_SURAT}/{KODE_MADRASAH}/{BULAN_ROMAWI}/{TAHUN}',
          resetMode: 'YEARLY' as const,
          seqPadding: 3,
          startingSequence: 45,
          kindCodes: {
            SURAT_TUGAS: 'KP.01',
          },
        },
      },
    };

    const next = computeNextSequentialNumber({
      state: customState,
      kind: 'SURAT_TUGAS',
      documentDate: '2026-11-18',
    });

    expect(next.nextSequence).toBeGreaterThanOrEqual(45);
    expect(next.suggestedNumber).toContain('B-045/KP.01/MTsN.02/BDG/XI/2026');

    const modalHtml = renderToStaticMarkup(
      React.createElement(NumberingFormatModal, {
        open: true,
        state: customState,
        onClose: () => {},
        onSaveConfig: async () => {},
      })
    );
    expect(modalHtml).toContain('role="dialog"');
    expect(modalHtml).toContain('Format Penomoran Surat');
    expect(modalHtml).toContain('MTsN.02/BDG');
    expect(modalHtml).toContain('Nomor Urut Awal Periode');
  });

  it('2. Lampiran Dropzone di Form Data Surat & Hapus Notice Tahap 4 Usang + Compact Kop Strip', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const intakeHtml = renderToStaticMarkup(
      React.createElement(DocumentIntakeForm, {
        state: demo,
        template: tpl01,
        onBackToTemplates: () => {},
        onOpenCenter: () => {},
        onSaveDraft: () => {},
        onOpenStudio: () => {},
        onPersistState: async () => {},
      })
    );

    expect(intakeHtml).toContain('s03-compact-kop-strip');
    expect(intakeHtml).toContain('s03-attachment-dropzone');
    expect(intakeHtml).toContain('Terbitkan Massal');
    expect(intakeHtml).not.toContain('jangan unggah lampiran');
    expect(intakeHtml).not.toContain('Tahap 4');
  });

  it('3. Fase B — DocumentStudio Floating Capsule Toolbar, Inline Title Rename, Slash Hint & Inline Attachments', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Bimbingan Teknis Asesmen Madrasah',
        penyelenggara: 'Kanwil Kemenag',
        tanggal_mulai: '2026-12-01',
        tanggal_selesai: '2026-12-02',
        lokasi: 'Hotel Grand Edu',
        documentDate: '2026-11-18',
      },
      { timestamp: '2026-11-18T09:00:00Z' }
    );

    const html = renderToStaticMarkup(
      React.createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        onPersistStudioState: () => {},
        onPersistState: async () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );

    expect(html).toContain('data-studio-toolbar-mode="capsule"');
    expect(html).toContain('Paragraf');
    expect(html).toContain('Sisipkan');
    expect(html).toContain('Ketik / untuk sisip cepat');
    expect(html).toContain('s04-doc-title-btn');
    expect(html).toContain('Lampiran Draft');
    expect(html).toContain('s04-drawer-attach-box');
  });

  it('4. Editor Visual Template (TipTap round-trip) & TemplateManager tanpa textarea polos', () => {
    const sampleBlocks = [
      { type: 'heading' as const, text: 'SURAT KETERANGAN', align: 'center' as const },
      { type: 'paragraph' as const, text: 'Nomor: {{NOMOR_SURAT}}' },
      { type: 'list' as const, ordered: true, items: ['Butir pertama', 'Butir kedua'] },
      {
        type: 'table' as const,
        columns: ['No', 'Nama', 'Jabatan'],
        sampleRows: [['1', '{{NAMA_GURU}}', 'Guru Mapel']],
      },
    ];

    const doc = previewBlocksToTipTapDoc(sampleBlocks);
    const back = tipTapDocToPreviewBlocks(doc);

    expect(back).toHaveLength(4);
    expect(back[0]).toMatchObject({ type: 'heading', text: 'SURAT KETERANGAN', align: 'center' });
    expect(back[1]).toMatchObject({ type: 'paragraph', text: 'Nomor: {{NOMOR_SURAT}}' });
    expect(back[2]).toMatchObject({ type: 'list', ordered: true, items: ['Butir pertama', 'Butir kedua'] });
    expect(back[3]).toMatchObject({ type: 'table', columns: ['No', 'Nama', 'Jabatan'] });

    const demo = createDemoState();
    const tmHtml = renderToStaticMarkup(
      React.createElement(TemplateManager, {
        state: demo,
        onPersistState: async () => {},
        onBackToGallery: () => {},
      })
    );

    expect(tmHtml).toContain('Format Nomor Surat');
    expect(tmHtml).toContain('Kelola Template');
  });

  it('5. Penerbitan Surat Massal (Batch / Mail Merge) — Draft & Auto-Finalize berurutan + BatchIssueModal SSR', async () => {
    const demo = createDemoState();
    const tpl14 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-14')!; // Surat Keterangan Siswa

    const manualRecipients = parseManualRecipientsText(
      'Ahmad Fauzi | 0091234561\nSiti Rahmah | 0091234562\nBudi Santoso | 0091234563'
    );
    expect(manualRecipients).toHaveLength(3);
    expect(manualRecipients[0]).toMatchObject({
      label: 'Ahmad Fauzi',
      secondaryValue: '0091234561',
    });

    const baseStudentValues = {
      documentTitle: 'Surat Keterangan Siswa Aktif',
      ttl_siswa: 'Malang, 12 Mei 2012',
      kelas_id: demo.classes[0].id,
      keperluan: 'Persyaratan Beasiswa PIP',
      documentDate: '2026-11-19',
    };

    // Mode Draft (3 surat keterangan untuk 3 siswa)
    const draftBatch = await generateBatchDocumentsInState({
      state: demo,
      template: tpl14,
      baseValues: baseStudentValues,
      recipients: manualRecipients,
      finalizeImmediately: false,
      timestamp: '2026-11-19T08:00:00Z',
    });

    expect(draftBatch.errors).toHaveLength(0);
    expect(draftBatch.createdCount).toBe(3);
    expect(draftBatch.finalizedCount).toBe(0);

    // Mode Auto-Finalize (nomor urut unik berurutan untuk 2 siswa)
    const finalBatch = await generateBatchDocumentsInState({
      state: demo,
      template: tpl14,
      baseValues: baseStudentValues,
      recipients: manualRecipients.slice(0, 2),
      finalizeImmediately: true,
      demoAcknowledged: true,
      timestamp: '2026-11-19T09:00:00Z',
    });

    expect(finalBatch.errors).toHaveLength(0);
    expect(finalBatch.createdCount).toBe(2);
    expect(finalBatch.finalizedCount).toBe(2);
    expect(finalBatch.assignedNumbers).toHaveLength(2);
    expect(finalBatch.assignedNumbers[0]).not.toBe(finalBatch.assignedNumbers[1]);

    const batchModalHtml = renderToStaticMarkup(
      React.createElement(BatchIssueModal, {
        open: true,
        state: demo,
        template: tpl14,
        baseValues: { documentDate: '2026-11-19' },
        onClose: () => {},
        onPersistState: async () => {},
        onCompleted: () => {},
      })
    );
    expect(batchModalHtml).toContain('Terbitkan Surat Massal');
    expect(batchModalHtml).toContain('role="dialog"');
    // Zero teacher NIP in Batch modal
    for (const t of demo.teachers) {
      if (t.nip && t.nip.trim().length >= 8) {
        expect(batchModalHtml).not.toContain(t.nip.trim());
      }
    }
  });

  it('6. Cetak Langsung (Print) & Overflow Menu di Detail Arsip tanpa jargon S05/PII', async () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Rapat Koordinasi Madrasah',
        penyelenggara: 'MTs',
        tanggal_mulai: '2026-12-01',
        tanggal_selesai: '2026-12-01',
        lokasi: 'Aula',
        documentDate: '2026-11-18',
      },
      { timestamp: '2026-11-18T10:00:00Z' }
    );
    const built = buildInitialStudioContentFromDraft(saved.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const cleanContent = {
      type: 'doc' as const,
      content: [
        { type: 'heading', attrs: { level: 2, textAlign: 'center' }, content: [{ type: 'text', text: 'SURAT TUGAS' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Menugaskan guru mengikuti rapat koordinasi.' }] },
      ],
    };
    const nextNum = computeNextSequentialNumber({
      state: saved.state,
      kind: 'SURAT_TUGAS',
      documentDate: '2026-11-18',
    });
    const finalized = await finalizeDocumentTransaction({
      state: saved.state,
      draft: saved.draft,
      content: cleanContent,
      pageSettings: built.pageSettings,
      documentNumber: nextNum.suggestedNumber,
      numberingMode: 'AUTO',
      demoAcknowledged: true,
    });

    const archiveHtml = renderToStaticMarkup(
      React.createElement(DocumentArchiveDetail, {
        state: finalized.state,
        documentId: finalized.documentRecord.id,
        onPersistState: async () => {},
        onBackToCenter: () => {},
        onOpenStudio: () => {},
      })
    );

    expect(archiveHtml).toContain('Cetak');
    expect(archiveHtml).toContain('Unduh PDF Final');
    expect(archiveHtml).toContain('s06-overflow-trigger');
    expect(archiveHtml).not.toContain('Buka Layar S05');
    expect(archiveHtml).not.toContain('Sanitasi PII');
  });

  it('7. Aksi Massal Arsip, Ekspor Buku Agenda (CSV UTF-8 BOM & PDF Landscape) tanpa kebocoran NIP + Subnav Fase A', async () => {
    const demo = createDemoState();
    const tpl14 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-14')!;
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;

    // Seed 2 FINAL documents + 1 DRAFT document in state
    const finalizedBatch = await generateBatchDocumentsInState({
      state: demo,
      template: tpl14,
      baseValues: {
        documentTitle: 'Surat Keterangan Siswa Aktif',
        ttl_siswa: 'Malang, 12 Mei 2012',
        kelas_id: demo.classes[0].id,
        keperluan: 'Lomba KSM Tingkat Kabupaten',
        documentDate: '2026-11-19',
      },
      recipients: [
        { id: 'r1', label: 'Ahmad Fauzi', secondaryValue: '0091234561' },
        { id: 'r2', label: 'Siti Rahmah', secondaryValue: '0091234562' },
      ],
      finalizeImmediately: true,
      demoAcknowledged: true,
      timestamp: '2026-11-19T08:00:00Z',
    });
    const withDraft = saveIntakeDraftToState(
      finalizedBatch.state,
      tpl01,
      {
        documentTitle: 'Draft Surat Tugas Pelatihan',
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Pelatihan Kurikulum',
        penyelenggara: 'Kemenag',
        tanggal_mulai: '2026-12-05',
        tanggal_selesai: '2026-12-06',
        lokasi: 'Aula Kemenag',
        documentDate: '2026-11-19',
      },
      { timestamp: '2026-11-19T09:00:00Z' }
    );

    const seededState = withDraft.state;
    const docs = seededState.documents ?? [];
    expect(docs.length).toBe(3);

    // Buku Agenda rows & CSV
    const rows = buildAgendaRows(docs, seededState);
    expect(rows.length).toBe(docs.length);

    const csv = buildAgendaCsvString(docs, seededState);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Nomor Surat');
    expect(csv).toContain('Judul / Perihal');

    // Zero NIP leakage in CSV
    for (const t of seededState.teachers) {
      if (t.nip && t.nip.trim().length >= 8) {
        expect(csv).not.toContain(t.nip.trim());
      }
    }

    // Buku Agenda PDF (saveFile: false for headless test)
    const pdfResult = exportAgendaRegisterPdf(docs, seededState, { saveFile: false });
    expect(pdfResult.rowCount).toBe(docs.length);
    expect(pdfResult.bytes.byteLength).toBeGreaterThan(500);
    expect(pdfResult.fileName).toContain('Buku_Agenda_Persuratan_');

    // Bulk Archive: archives 2 FINAL documents and skips 1 DRAFT
    const bulkRes = bulkArchiveDocumentsInState(
      seededState,
      docs.map((d) => d.id),
      '2026-11-19T10:00:00Z'
    );
    expect(bulkRes.archivedIds).toHaveLength(2);
    expect(bulkRes.skippedIds).toHaveLength(1);
    for (const d of bulkRes.state.documents ?? []) {
      if (d.id === withDraft.documentRecord.id) {
        expect(d.status).toBe('DRAFT');
      } else {
        expect(d.status).toBe('ARCHIVED');
      }
    }

    // CorrespondenceCenter SSR features (Buku Agenda, Format Nomor, row checkboxes, Auto-Resume draft strip)
    const centerHtml = renderToStaticMarkup(
      React.createElement(CorrespondenceCenter, {
        state: seededState,
        onPersistState: async () => {},
        onOpenArchiveDetail: () => {},
        onOpenStudio: () => {},
      })
    );
    expect(centerHtml).toContain('Buku Agenda');
    expect(centerHtml).toContain('Format Nomor');
    expect(centerHtml).toContain('s01-checkbox');
    expect(centerHtml).toContain('s01-resume-strip');

    // PersuratanWorkspace Fase A: step trail hidden on center view
    const wsCenterHtml = renderToStaticMarkup(
      React.createElement(PersuratanWorkspace, {
        state: seededState,
        initialView: 'center',
      })
    );
    expect(wsCenterHtml).not.toContain('persuratan-step-trail');
  });
});
