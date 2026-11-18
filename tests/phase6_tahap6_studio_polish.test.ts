import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoState } from '../src/domain/seed';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import { saveIntakeDraftToState, saveStudioDraftToState } from '../src/domain/persuratan/intake/draftEngine';
import { buildInitialStudioContentFromDraft } from '../src/domain/persuratan/studio/contentGenerator';
import {
  extractDocumentOutline,
  getStudioSaveStatusLabel,
} from '../src/domain/persuratan/studio/outline';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';

describe('Tahap 6 — Penyempurnaan S04 Editor Dasar (Outline, Autosave Status, Shortcuts & Resume)', () => {
  it('mengekstrak daftar outline H1–H3 serta ringkasan paragraf, tabel, dan daftar secara akurat', () => {
    const summary = extractDocumentOutline({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'SURAT KEPUTUSAN KEPALA MADRASAH' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Menimbang dan mengingat peraturan madrasah.' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '   ' }],
        },
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'MEMUTUSKAN' }],
        },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kesatu' }] }],
            },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Lampiran Tugas Mengajar' }],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nama' }] }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(summary.headings).toHaveLength(3);
    expect(summary.headings.map((h) => [h.level, h.text, h.headingIndex])).toEqual([
      [1, 'SURAT KEPUTUSAN KEPALA MADRASAH', 0],
      [2, 'MEMUTUSKAN', 1],
      [3, 'Lampiran Tugas Mengajar', 2],
    ]);
    expect(summary.paragraphCount).toBe(1);
    expect(summary.tableCount).toBe(1);
    expect(summary.listCount).toBe(1);
  });

  it('memformat seluruh indikator status penyimpanan manual & autosave dengan jujur', () => {
    const ts = '2026-11-17T09:30:45.000Z';
    expect(getStudioSaveStatusLabel('new', null)).toBe('Draft Baru');
    expect(getStudioSaveStatusLabel('dirty', ts)).toBe('Perubahan belum disimpan');
    expect(getStudioSaveStatusLabel('autosaving', ts)).toBe('Menyimpan otomatis…');
    expect(getStudioSaveStatusLabel('saving', ts)).toBe('Menyimpan draft…');
    expect(getStudioSaveStatusLabel('saved_auto', ts)).toMatch(/^Tersimpan otomatis/);
    expect(getStudioSaveStatusLabel('saved_manual', ts)).toMatch(/^Tersimpan lokal/);
    expect(getStudioSaveStatusLabel('error', ts)).toBe('Gagal menyimpan — periksa penyimpanan');
  });

  it('mempertahankan naskah S04 & pengaturan kertas saat draft disimpan lalu dibuka ulang (resume)', () => {
    const base = createDemoState();
    const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-08')!;
    const s03 = saveIntakeDraftToState(base, tpl, {
      documentTitle: 'Undangan Rapat Komite',
      documentDate: '2026-11-18',
      instansi_tujuan: 'Pengurus Komite Madrasah',
      sifat_surat: 'Penting',
      perihal: 'Undangan Rapat Anggaran',
      isi_pokok: 'penyampaian rencana kerja dan anggaran madrasah tahun berjalan pada pukul 09.00 WIB di Aula Madrasah',
    });

    const initial = buildInitialStudioContentFromDraft(s03.draft);
    const editedContent = {
      ...initial.content,
      content: [
        ...initial.content.content,
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Agenda Tambahan Operator' }],
        },
      ],
    };

    const persisted = saveStudioDraftToState(s03.state, s03.draft.id, {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: editedContent,
      pageSettings: {
        paperSize: 'f4',
        orientation: 'portrait',
        marginsMm: { top: 25, right: 20, bottom: 25, left: 30 },
      },
      updatedAt: '2026-11-17T08:15:00.000Z',
    });

    const resumedHtml = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: persisted.state,
        draft: persisted.draft,
        onPersistStudioState: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );

    expect(resumedHtml).toContain('Struktur Naskah');
    expect(resumedHtml).toContain('Agenda Tambahan Operator');
    expect(resumedHtml).toContain('Autosave Aktif');
    expect(resumedHtml).toContain('Tersimpan lokal');
    expect(resumedHtml).toContain('F4 / Folio (210 × 330 mm)');
  });
});
