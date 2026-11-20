import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoState } from '../src/domain/seed';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { saveIntakeDraftToState } from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import { computeNextSequentialNumber } from '../src/domain/persuratan/finalization/numberingEngine';
import { TemplateGallery } from '../src/components/persuratan/TemplateGallery';
import { DocumentIntakeForm } from '../src/components/persuratan/DocumentIntakeForm';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import { DocumentPreviewFinalize } from '../src/components/persuratan/DocumentPreviewFinalize';
import { FinalizationSlideDrawer } from '../src/components/persuratan/FinalizationSlideDrawer';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { PersuratanWorkspace } from '../src/components/persuratan/PersuratanWorkspace';

describe('Reformasi UI/UX Gelombang 1, Gelombang 2 & 3-Step Express Studio', () => {
  it('1. Gelombang 1 — Top-5 Quick-Launch & tombol 1-klik Pakai di Galeri Template tanpa jargon kode layar', () => {
    const demo = createDemoState();
    const html = renderToStaticMarkup(
      React.createElement(TemplateGallery, {
        state: demo,
        onUseTemplate: () => {},
        onOpenTemplateManager: () => {},
      })
    );

    expect(html).toContain('Paling Sering Dibutuhkan Madrasah');
    expect(html).toContain('s02-popular-strip');
    expect(html).toContain('s02-card-use-btn');
    expect(html).toContain('Pakai');
    expect(html).not.toContain('(S07)');
    expect(html).not.toContain('S03');
  });

  it('2. Gelombang 2 — Document Studio menghadirkan header ringkas, Mode Fokus, toolbar bersih kontekstual, & 1-Click Quick-Fill di S05', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Workshop Kurikulum Merdeka Madrasah',
        penyelenggara: 'Kankemenag Kabupaten',
        tanggal_mulai: '2026-12-10',
        tanggal_selesai: '2026-12-11',
        lokasi: 'Aula MTs',
        documentDate: '2026-11-18',
      },
      { timestamp: '2026-11-18T09:00:00Z' }
    );

    const studioHtml = renderToStaticMarkup(
      React.createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        onPersistStudioState: () => {},
        onPersistState: async () => {},
        onFinalizedToArchive: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
        onOpenPreview: () => {},
      })
    );

    expect(studioHtml).toContain('Mode Fokus');
    expect(studioHtml).toContain('Sahkan &amp; Terbitkan');
    expect(studioHtml).toContain('Struktur Naskah');
    // Toolbar kontekstual tabel tidak menumpuk saat kursor berada di luar tabel
    expect(studioHtml).not.toContain('s04-contextual-table-bar');

    // Mode Fokus aktif menyembunyikan bar subnav luar di PersuratanWorkspace
    const focusStudioHtml = renderToStaticMarkup(
      React.createElement(DocumentStudio, {
        state: saved.state,
        draft: saved.draft,
        isFocusMode: true,
        onPersistStudioState: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(focusStudioHtml).toContain('is-focus-mode');
    expect(focusStudioHtml).toContain('Keluar Fokus');

    // S05 menampilkan 1-Click Quick-Fill Identitas ketika kepala madrasah / identitas kosong
    const missingIdentityState = {
      ...saved.state,
      settings: {
        ...saved.state.settings,
        headmasterName: '',
      },
      intakeDrafts: (saved.state.intakeDrafts ?? []).map((d) => ({
        ...d,
        sourceSnapshots: d.sourceSnapshots.map((s) =>
          s.sourceKey === 'settings.madrasah_identity_signatory'
            ? {
                ...s,
                capturedValue: {
                  ...(s.capturedValue as Record<string, unknown>),
                  signatoryName: '',
                  headmasterName: '',
                },
              }
            : s
        ),
      })),
    };
    const missingDraft = missingIdentityState.intakeDrafts![0];
    const s05Html = renderToStaticMarkup(
      React.createElement(DocumentPreviewFinalize, {
        state: missingIdentityState,
        draft: missingDraft,
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s05Html).toContain('Lengkapi cepat di sini');
  });

  it('3. 3-Step Express Studio — Live Miniature Letter Preview di S03, optional fields terlipat, & tombol Sahkan Langsung', () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;

    const wsIntakeHtml = renderToStaticMarkup(
      React.createElement(PersuratanWorkspace, {
        state: demo,
        initialView: 'intake',
        initialTemplateId: tpl01.id,
      })
    );

    expect(wsIntakeHtml).toContain('Pratinjau Surat Live');
    expect(wsIntakeHtml).toContain('s03-live-paper');
    expect(wsIntakeHtml).toContain('s03-live-kop');
    expect(wsIntakeHtml).toContain('Sahkan Langsung');
    expect(wsIntakeHtml).toContain('Sunting Naskah Bebas');
    expect(wsIntakeHtml).toContain('Detail Tambahan (Opsional');
  });

  it('4. FinalizationSlideDrawer merender pengesahan 1-langkah & mendukung finalisasi Express langsung dari draft S03 ke Arsip S06', async () => {
    const demo = createDemoState();
    const tpl01 = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-01')!;
    const saved = saveIntakeDraftToState(
      demo,
      tpl01,
      {
        peserta: [demo.teachers[0].id],
        nama_kegiatan: 'Koordinasi Penilaian Akhir Semester',
        penyelenggara: 'Madrasah Tsanawiyah',
        tanggal_mulai: '2026-12-15',
        tanggal_selesai: '2026-12-16',
        lokasi: 'Ruang Rapat Guru',
        dasar_surat: 'Program Kerja Semester Ganjil 2026/2027',
        documentDate: '2026-11-18',
      },
      { timestamp: '2026-11-18T10:00:00Z' }
    );
    const built = buildInitialStudioContentFromDraft(saved.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });

    // (a) Saat naskah masih mengandung token manual (mis. IDENTITAS_PESERTA_1), drawer tetap menjaga validasi ketat
    const contentWithManualToken = {
      type: 'doc' as const,
      content: [
        ...built.content.content,
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Identitas tambahan: {{IDENTITAS_PESERTA_1}}' }],
        },
      ],
    };
    const blockedDrawerHtml = renderToStaticMarkup(
      React.createElement(FinalizationSlideDrawer, {
        open: true,
        state: saved.state,
        draft: saved.draft,
        content: contentWithManualToken,
        pageSettings: built.pageSettings,
        onClose: () => {},
        onPersistState: async () => {},
        onFinalized: () => {},
      })
    );
    expect(blockedDrawerHtml).toContain('role="dialog"');
    expect(blockedDrawerHtml).toContain('aria-modal="true"');
    expect(blockedDrawerHtml).toContain('PENGESAHAN CEPAT');
    expect(blockedDrawerHtml).toContain('Kebersihan Placeholder / Token Variabel');

    // (b) Saat naskah sudah bersih dari token placeholder, drawer menampilkan status siap 1-klik hijau
    const cleanContent = {
      type: 'doc' as const,
      content: [
        {
          type: 'heading',
          attrs: { level: 2, textAlign: 'center' },
          content: [{ type: 'text', text: 'SURAT TUGAS' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'center' },
          content: [{ type: 'text', text: 'Nomor: {{NOMOR_SURAT}}' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Kepala Madrasah menugaskan peserta untuk mengikuti Koordinasi Penilaian Akhir Semester di Ruang Rapat Guru.',
            },
          ],
        },
      ],
    };

    const drawerHtml = renderToStaticMarkup(
      React.createElement(FinalizationSlideDrawer, {
        open: true,
        state: saved.state,
        draft: saved.draft,
        content: cleanContent,
        pageSettings: built.pageSettings,
        onClose: () => {},
        onPersistState: async () => {},
        onFinalized: () => {},
      })
    );

    expect(drawerHtml).toContain('Semua syarat administrasi &amp; tanda tangan terpenuhi');
    expect(drawerHtml).toContain('Sahkan &amp; Terbitkan PDF Resmi');
    expect(drawerHtml).toContain('Ubah manual');

    // Jalankan transaksi finalisasi Express langsung menuju Arsip S06
    const autoNum = computeNextSequentialNumber({
      state: saved.state,
      kind: saved.draft.templateSnapshot.documentKind,
      documentDate: saved.draft.documentDate,
      excludeDocumentId: saved.draft.documentId,
    });
    const finalized = await finalizeDocumentTransaction({
      state: saved.state,
      draft: saved.draft,
      content: cleanContent,
      pageSettings: built.pageSettings,
      documentNumber: autoNum.suggestedNumber,
      numberingMode: 'AUTO',
      demoAcknowledged: true,
    });

    expect(finalized.documentRecord.status).toBe('FINAL');
    expect(finalized.documentVersion.documentNumber).toBe(autoNum.suggestedNumber);
    expect(finalized.documentVersion.pdfChecksum.length).toBeGreaterThanOrEqual(32);

    // Setelah FINAL, baris utama S01 mengarah langsung ke S06 Detail & Arsip (Buka Arsip & PDF)
    const s01AfterFinal = renderToStaticMarkup(
      React.createElement(CorrespondenceCenter, {
        state: finalized.state,
        onOpenArchiveDetail: () => {},
      })
    );
    expect(s01AfterFinal).toContain('Buka Arsip &amp; PDF');
    // Zero NIP leakage check
    for (const t of demo.teachers) {
      if (t.nip && t.nip.trim().length >= 8) {
        expect(drawerHtml).not.toContain(t.nip.trim());
        expect(s01AfterFinal).not.toContain(t.nip.trim());
      }
    }
  });
});
