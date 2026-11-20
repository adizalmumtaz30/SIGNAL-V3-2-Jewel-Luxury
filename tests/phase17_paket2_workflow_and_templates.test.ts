import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CorrespondenceCenter } from '../src/components/persuratan/CorrespondenceCenter';
import { DocumentArchiveDetail } from '../src/components/persuratan/DocumentArchiveDetail';
import { DocumentPreviewFinalize } from '../src/components/persuratan/DocumentPreviewFinalize';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import {
  previewBlocksToTipTapDoc,
  tipTapDocToPreviewBlocks,
} from '../src/components/persuratan/TemplateVisualEditor';
import { exportAgendaRegisterPdf } from '../src/domain/persuratan/archive/agendaExport';
import {
  archiveDocumentInState,
  attachFileToDocumentInState,
  computeNextIncomingAgendaNumber,
  recordIncomingDocumentInState,
  restoreArchivedDocumentInState,
  updateIncomingDispositionInState,
} from '../src/domain/persuratan/archive/archiveEngine';
import type { BinaryBlobStoreLike } from '../src/domain/persuratan/attachments/attachmentStore';
import { evaluateFinalizationChecklist } from '../src/domain/persuratan/finalization/checklist';
import { finalizeDocumentTransaction } from '../src/domain/persuratan/finalization/finalizeEngine';
import { renderOfficialDocumentPdf } from '../src/domain/persuratan/finalization/pdfRenderer';
import {
  createInitialIntakeFormValues,
  saveIntakeDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import { getIntakeSchemaForTemplate } from '../src/domain/persuratan/intake/schemaRegistry';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import { extractPlainTextAndTokens } from '../src/domain/persuratan/studio/contentValidation';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import type { TemplatePreviewBlock } from '../src/domain/persuratan/templates/types';
import { createDemoState } from '../src/domain/seed';
import type { AppState } from '../src/domain/types';

function createMemoryBlobStore(): BinaryBlobStoreLike {
  const map = new Map<string, unknown>();
  return {
    async get(storeName, key) {
      return map.get(`${storeName}:${key}`) ?? null;
    },
    async put(storeName, value) {
      const rec = value as { storageKey?: string; id?: string };
      const key = rec.storageKey ?? rec.id ?? '';
      map.set(`${storeName}:${key}`, value);
      return key;
    },
    async delete(storeName, key) {
      map.delete(`${storeName}:${key}`);
    },
  };
}

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
    if (ctrl.required === false) continue;
    if (ctrl.controlType === 'date_range') {
      filled[ctrl.startKey ?? `${ctrl.key}_mulai`] = '2026-11-24';
      filled[ctrl.endKey ?? `${ctrl.key}_selesai`] = '2026-11-26';
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
      filled[ctrl.key] = ctrl.options?.[0]?.value ?? 'Ya';
    } else {
      filled[ctrl.key] = `Isian Uji ${ctrl.label}`;
    }
  }

  Object.assign(filled, overrides);
  const saved = saveIntakeDraftToState(state, tpl, filled, {
    timestamp: '2026-11-24T08:00:00.000Z',
  });
  return { tpl, ...saved };
}

describe('Phase 17 — Paket 2 Workflow Completeness, 8 System Templates, & Editor Parity', () => {
  it('1. Records Surat Masuk end-to-end (agenda numbering, scan blob, disposition, archive/restore, agenda PDF)', async () => {
    const demo = createDemoState();
    const teachersWithFakeNip: AppState = {
      ...demo,
      teachers: demo.teachers.map((t, idx) => ({
        ...t,
        nip: `19880101201903100${idx + 1}`,
      })),
    };

    const suggestedAgenda = computeNextIncomingAgendaNumber(teachersWithFakeNip, '2026-11-24');
    expect(suggestedAgenda).toMatch(/^001\/SM\/.+\/XI\/2026$/);

    const recorded = recordIncomingDocumentInState({
      state: teachersWithFakeNip,
      originalNumber: 'B-412/Kk.10.22/PP.00/11/2026',
      senderName: 'Kantor Kementerian Agama Kota Depok',
      subject: 'Undangan Evaluasi KSM Tingkat Kota',
      documentDate: '2026-11-23',
      receivedDate: '2026-11-24',
      dispositionNote: 'Mohon Waka Kurikulum koordinasi dengan pembina olimpiade.',
      relatedTeacherIds: [teachersWithFakeNip.teachers[0].id],
      timestamp: '2026-11-24T08:15:00.000Z',
    });

    expect(recorded.document.direction).toBe('INCOMING');
    expect(recorded.document.status).toBe('RECEIVED');
    expect(recorded.document.documentType).toBe('SURAT_MASUK');
    expect(recorded.document.incomingAgendaNumber).toBe(suggestedAgenda);
    expect(recorded.document.receivedDate).toBe('2026-11-24');

    // Attach valid PDF scan bytes
    const blobStore = createMemoryBlobStore();
    const fakePdfScan = new TextEncoder().encode('%PDF-1.4\n%Scan surat masuk\n%%EOF');
    const attached = await attachFileToDocumentInState({
      state: recorded.state,
      documentId: recorded.document.id,
      fileName: 'scan_undangan_kemenag.pdf',
      declaredMimeType: 'application/pdf',
      bytes: fakePdfScan,
      notes: 'Scan Surat Masuk',
      dbOverride: blobStore,
    });
    expect(attached.attachment.fileName).toBe('scan_undangan_kemenag.pdf');

    // Update disposition status to IN_REVIEW
    const updatedDisp = updateIncomingDispositionInState({
      state: attached.state,
      documentId: recorded.document.id,
      dispositionNote: 'Diteruskan ke Pembina KSM & dijadwalkan rapat.',
      nextStatus: 'IN_REVIEW',
    });
    expect(updatedDisp.document.status).toBe('IN_REVIEW');
    expect(updatedDisp.document.dispositionNote).toContain('Pembina KSM');

    // Archive and restore back to RECEIVED (not FINAL)
    const archived = archiveDocumentInState(updatedDisp.state, recorded.document.id);
    expect(archived.document.status).toBe('ARCHIVED');
    expect(() =>
      updateIncomingDispositionInState({
        state: archived.state,
        documentId: recorded.document.id,
        dispositionNote: 'Percobaan ubah saat arsip',
      })
    ).toThrow(/terkunci/i);

    const restored = restoreArchivedDocumentInState(archived.state, recorded.document.id);
    expect(restored.document.status).toBe('RECEIVED');

    // Export Buku Agenda PDF and verify valid PDF without leaking teacher NIPs
    const agendaPdf = exportAgendaRegisterPdf(restored.state.documents ?? [], restored.state, {
      periodLabel: 'November 2026',
    });
    expect(agendaPdf.rowCount).toBeGreaterThanOrEqual(1);
    expect(new TextDecoder().decode(agendaPdf.bytes.slice(0, 8)).startsWith('%PDF-')).toBe(true);
    const pdfRawText = new TextDecoder('latin1').decode(agendaPdf.bytes);
    expect(pdfRawText).not.toContain('198801012019031001');
  });

  it('2. Produces authentic, blocker-free, zero-teacher-NIP documents & PDFs across all 8 newly specialized templates', async () => {
    const baseDemo = createDemoState();
    const stateWithTeacherNips: AppState = {
      ...baseDemo,
      teachers: baseDemo.teachers.map((t, idx) => ({
        ...t,
        nip: `19850505201001100${idx + 1}`,
      })),
    };
    const activeTeachers = stateWithTeacherNips.teachers.filter((t) => t.isActive);
    const t1 = activeTeachers[0].id;
    const t2 = activeTeachers[1]?.id ?? t1;

    const templateConfigs: Array<{ id: string; label: string; overrides: Record<string, unknown> }> = [
      {
        id: 'SYS-TPL-06-SINGLE',
        label: 'SYS-TPL-06 (1 Pengawas)',
        overrides: {
          _tplId: 'SYS-TPL-06',
          jenis_ujian: 'Asesmen Sumatif Akhir Semester Ganjil',
          periode_ujian_mulai: '2026-12-01',
          periode_ujian_selesai: '2026-12-08',
          daftar_pengawas: [t1],
        },
      },
      {
        id: 'SYS-TPL-06-MULTI',
        label: 'SYS-TPL-06 (Multi Pengawas)',
        overrides: {
          _tplId: 'SYS-TPL-06',
          jenis_ujian: 'Asesmen Sumatif Akhir Semester Ganjil',
          periode_ujian_mulai: '2026-12-01',
          periode_ujian_selesai: '2026-12-08',
          daftar_pengawas: [t1, t2],
        },
      },
      {
        id: 'SYS-TPL-09',
        label: 'SYS-TPL-09 Pengumuman',
        overrides: {
          sasaran: 'Seluruh Guru, Tenaga Kependidikan, dan Wali Murid',
          topik: 'Jadwal Penilaian Akhir Semester & Pembagian Rapor Ganjil',
          rincian: '1. Asesmen dilaksanakan 1–8 Desember 2026.\n2. Rapor dibagikan 19 Desember 2026.',
        },
      },
      {
        id: 'SYS-TPL-15',
        label: 'SYS-TPL-15 Rekomendasi',
        overrides: {
          subjek_rekomendasi: 'Ahmad Fauzi, S.Pd. (Guru Matematika)',
          tujuan_program: 'Beasiswa Pelatihan Literasi Numerasi Kemenag RI',
          dasar_pertimbangan: 'Berdedikasi tinggi dan berprestasi dalam pembinaan olimpiade siswa.',
        },
      },
      {
        id: 'SYS-TPL-19',
        label: 'SYS-TPL-19 Notula Rapat',
        overrides: {
          judul_rapat: 'Rapat Koordinasi Persiapan Asesmen Madrasah',
          pimpinan_notulis: 'Kepala Madrasah / Staf Kurikulum',
          ringkasan_bahasan: '1. Finalisasi kisi-kisi soal.\n2. Penjadwalan pengawas ruang.',
        },
      },
      {
        id: 'SYS-TPL-20',
        label: 'SYS-TPL-20 Laporan Kegiatan',
        overrides: {
          nama_kegiatan: 'Pesantren Kilat Ramadhan 1447 H',
          pelaksanaan: '10–14 Maret 2026 di Aula MTs Daruttafsir Al-Husaini',
          capaian: 'Diikuti 100% siswa kelas VII–IX dengan capaian hafalan dan kajian fiqih sesuai target.',
        },
      },
      {
        id: 'SYS-TPL-21',
        label: 'SYS-TPL-21 Laporan Pelatihan',
        overrides: {
          pelaksana: t1,
          nomor_surat_tugas: '045/ST/MTs.DAH/XI/2026',
          ringkasan_materi: 'Implementasi Kurikulum Berbasis Cinta dan evaluasi formatif di kelas.',
        },
      },
      {
        id: 'SYS-TPL-22',
        label: 'SYS-TPL-22 Laporan Ujian',
        overrides: {
          jenis_ujian: 'Asesmen Madrasah Kelas IX Tahun 2026',
          rekap_kelas: 'IX-A: 32 hadir\nIX-B: 30 hadir',
          evaluasi: 'Seluruh sesi berjalan tertib dan lancar tanpa kendala jaringan berarti.',
        },
      },
      {
        id: 'SYS-TPL-29',
        label: 'SYS-TPL-29 Surat Pernyataan',
        overrides: {
          pihak_menyatakan: 'Kepala MTs Daruttafsir Al-Husaini',
          isi_pernyataan: '1. Data pendidik dan rombel yang diunggah adalah benar.\n2. Siap mempertanggungjawabkan secara administratif.',
          keperluan_pernyataan: 'Verifikasi Data Emis Semester Ganjil',
        },
      },
    ];

    for (const cfg of templateConfigs) {
      const realTplId = typeof cfg.overrides._tplId === 'string' ? cfg.overrides._tplId : cfg.id;
      const cleanOverrides = { ...cfg.overrides };
      delete cleanOverrides._tplId;

      const built = makeDraftForTemplate(stateWithTeacherNips, realTplId, cleanOverrides);
      const studio = buildInitialStudioContentFromDraft(built.draft, {
        activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
      });

      const { plainText, unresolvedTokens } = extractPlainTextAndTokens(studio.content);
      expect(plainText, cfg.label).not.toContain('[Belum diisi]');
      expect(plainText, cfg.label).not.toContain('19850505201001100');

      const allowedOnlyNumberTokens = unresolvedTokens.filter(
        (t) => !['NOMOR_SURAT', 'NOMOR_SK', 'NOMOR_LAPORAN', 'NOMOR_NOTULA'].includes(t)
      );
      expect(allowedOnlyNumberTokens, `${cfg.label} unresolved`).toEqual([]);

      const checklist = evaluateFinalizationChecklist({
        state: built.state,
        draft: built.draft,
        content: studio.content,
      });
      const blockers = checklist.items.filter((i) => !i.passed && i.severity === 'blocker');
      expect(blockers, `${cfg.label} blockers`).toEqual([]);
      expect(checklist.canFinalize, `${cfg.label} canFinalize`).toBe(true);

      const pdf = await renderOfficialDocumentPdf({
        draft: built.draft,
        content: studio.content,
        pageSettings: studio.pageSettings,
        state: built.state,
        officialNumber: '099/SK/MTs.DAH/XI/2026',
      });
      expect(
        new TextDecoder().decode(pdf.pdfBytes.slice(0, 8)).startsWith('%PDF-'),
        `${cfg.label} PDF header`
      ).toBe(true);
    }
  });

  it('3. Losslessly round-trips TemplateVisualEditor blocks (meta_grid, single/dual signature, grid table, align)', () => {
    const originalBlocks: TemplatePreviewBlock[] = [
      { type: 'heading', text: 'SURAT KETERANGAN', align: 'center' },
      { type: 'paragraph', text: 'Paragraf rata kanan-kiri resmi.', align: 'justify' },
      {
        type: 'meta_grid',
        rows: [
          { label: 'Nama', value: '{{NAMA_GURU}}' },
          { label: 'Jabatan', value: '{{JABATAN_PEGAWAI}}' },
        ],
      },
      {
        type: 'table',
        columns: ['No', 'Uraian', 'Keterangan'],
        sampleRows: [['1', 'Item A', 'Lengkap']],
      },
      {
        type: 'list',
        ordered: true,
        items: ['Ketentuan pertama', 'Ketentuan kedua'],
      },
      {
        type: 'signature',
        leftTitle: 'Mengetahui Komite,',
        leftName: 'Ketua Komite',
        rightTitle: 'Kepala Madrasah,',
        rightName: '{{NAMA_KEPALA_MADRASAH}}',
        rightIdLabel: 'NIP. {{NIP_KEPALA_MADRASAH}}',
      },
    ];

    const doc = previewBlocksToTipTapDoc(originalBlocks);
    const roundTripped = tipTapDocToPreviewBlocks(doc);

    expect(roundTripped).toHaveLength(6);
    expect(roundTripped[0]).toEqual({ type: 'heading', text: 'SURAT KETERANGAN', align: 'center' });
    expect(roundTripped[1]).toEqual({
      type: 'paragraph',
      text: 'Paragraf rata kanan-kiri resmi.',
      align: 'justify',
    });
    expect(roundTripped[2]).toEqual(originalBlocks[2]);
    expect(roundTripped[3]).toEqual(originalBlocks[3]);
    expect(roundTripped[4]).toEqual(originalBlocks[4]);
    expect(roundTripped[5]).toEqual(originalBlocks[5]);
  });

  it('4. Renders Surat Masuk UI, cleans obsolete Phase 2 copy, and exposes Audit/Cetak in S04/S05/S06 SSR', async () => {
    const demo = createDemoState();
    const recorded = recordIncomingDocumentInState({
      state: demo,
      originalNumber: 'B-007/KEMENAG/XI/2026',
      senderName: 'Kemenag Kota Depok',
      subject: 'Pemberitahuan Pendataan Emis',
      documentDate: '2026-11-20',
      receivedDate: '2026-11-21',
      dispositionNote: 'Segera tindak lanjuti operator Emis.',
    });

    const s01Html = renderToStaticMarkup(
      createElement(CorrespondenceCenter, {
        state: recorded.state,
        onPersistState: async () => {},
        onOpenTemplateGallery: () => {},
      })
    );
    expect(s01Html).toContain('Catat Surat Masuk');
    expect(s01Html).toContain(recorded.document.incomingAgendaNumber!);
    expect(s01Html).not.toContain('Tahap 3 (Galeri Template S02) Belum Diaktifkan');

    const s06Html = renderToStaticMarkup(
      createElement(DocumentArchiveDetail, {
        state: recorded.state,
        documentId: recorded.document.id,
        onPersistState: async () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s06Html).toContain('Lembar Kendali &amp; Disposisi Surat Masuk');
    expect(s06Html).toContain('Catatan Disposisi Pimpinan');
    expect(s06Html).toContain('Unggah / Kelola Scan Surat');
    expect(s06Html).toContain('Simpan Disposisi');

    // S04 & S05 parity checks
    const built07 = makeDraftForTemplate(demo, 'SYS-TPL-07');
    const studio07 = buildInitialStudioContentFromDraft(built07.draft, {
      activeTemplates: SYSTEM_DOCUMENT_TEMPLATES,
    });
    const draftWithStudio = {
      ...built07.draft,
      studio: {
        schemaVersion: 1 as const,
        editorStatus: 'IN_PROGRESS' as const,
        content: studio07.content,
        pageSettings: studio07.pageSettings,
        updatedAt: '2026-11-24T09:00:00.000Z',
      },
    };

    const s04Html = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: built07.state,
        draft: draftWithStudio,
        onPersistStudioState: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s04Html).toContain('data-table-layout="letter_header"');
    expect(s04Html).toContain('data-table-layout="signature"');

    const s05DraftHtml = renderToStaticMarkup(
      createElement(DocumentPreviewFinalize, {
        state: built07.state,
        draft: draftWithStudio,
        onPersistState: async () => {},
        onBackToStudio: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s05DraftHtml).toContain('Audit Tata Naskah Dinas');

    const memPdf = new Map<string, any>();
    const finalized = await finalizeDocumentTransaction({
      state: built07.state,
      draft: draftWithStudio,
      content: studio07.content,
      pageSettings: studio07.pageSettings,
      documentNumber: '055/UND/MTs.DAH/XI/2026',
      numberingMode: 'AUTO',
      demoAcknowledged: true,
      storageAdapter: {
        saveFinalPdf: async (rec) => {
          memPdf.set(rec.storageKey, rec);
        },
        getFinalPdf: async (key) => memPdf.get(key) ?? null,
      },
    });

    const s05FinalHtml = renderToStaticMarkup(
      createElement(DocumentPreviewFinalize, {
        state: finalized.state,
        documentRecord: finalized.documentRecord,
        activeVersion: finalized.documentVersion,
        onPersistState: async () => {},
        onBackToStudio: () => {},
        onBackToCenter: () => {},
      })
    );
    expect(s05FinalHtml).toContain('Unduh PDF Final');
    expect(s05FinalHtml).toContain('Cetak');
  });
});
