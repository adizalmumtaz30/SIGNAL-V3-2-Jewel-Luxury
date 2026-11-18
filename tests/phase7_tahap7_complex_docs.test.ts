import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createDemoState } from '../src/domain/seed';
import { SYSTEM_DOCUMENT_TEMPLATES } from '../src/domain/persuratan/templates/registry';
import {
  saveIntakeDraftToState,
  saveStudioDraftToState,
} from '../src/domain/persuratan/intake/draftEngine';
import {
  detectRasterImageMimeFromBytes,
  validateStudioPageSettings,
  validateTipTapContent,
} from '../src/domain/persuratan/studio/contentValidation';
import {
  adoptSelectedSourceUpdatesToDraft,
  compareDraftSnapshotsWithLiveState,
} from '../src/domain/persuratan/studio/sourceDiff';
import { getDefaultMadrasahLogo } from '../src/utils/madrasahLogo';
import { DocumentStudio } from '../src/components/persuratan/DocumentStudio';
import type { TipTapJSONContent, TipTapJSONNode } from '../src/domain/persuratan/studio/types';

const TEST_VALID_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function getTestSafeLogoUrl(): string {
  return getDefaultMadrasahLogo() || TEST_VALID_PNG_DATA_URL;
}

function build115RowComplexSkContent(safeLogoUrl: string): TipTapJSONContent {
  const rows: TipTapJSONNode[] = [
    {
      type: 'tableRow',
      attrs: { rowHeightMm: 10 },
      content: [
        {
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1, verticalAlign: 'middle', colwidth: [36] },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'No' }] }],
        },
        {
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1, verticalAlign: 'middle', colwidth: [180] },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nama Pendidik' }] }],
        },
        {
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1, verticalAlign: 'middle', colwidth: [140] },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Mata Pelajaran' }] }],
        },
        {
          type: 'tableHeader',
          attrs: { colspan: 1, rowspan: 1, verticalAlign: 'middle', colwidth: [80] },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Total JP' }] }],
        },
      ],
    },
  ];

  for (let i = 1; i <= 115; i += 1) {
    rows.push({
      type: 'tableRow',
      attrs: { rowHeightMm: i === 1 ? 14 : undefined },
      content: [
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'middle' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: String(i) }] }],
        },
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'top' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `Guru Uji ${i}` }] }],
        },
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'top' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `Mapel ${((i - 1) % 12) + 1}` }] }],
        },
        {
          type: 'tableCell',
          attrs: { verticalAlign: 'bottom' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: `${18 + (i % 8)} JP` }] }],
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
          src: safeLogoUrl,
          alt: 'Logo Resmi Madrasah',
          widthMm: 22,
          align: 'center',
        },
      },
      {
        type: 'heading',
        attrs: { level: 1, textAlign: 'center' },
        content: [{ type: 'text', text: 'LAMPIRAN SK PEMBAGIAN TUGAS MENGAJAR' }],
      },
      {
        type: 'table',
        attrs: { repeatHeader: true },
        content: rows,
      },
      { type: 'pageBreak' },
      {
        type: 'heading',
        attrs: { level: 2, textAlign: 'left' },
        content: [{ type: 'text', text: 'REKAPITULASI GABUNGAN' }],
      },
      {
        type: 'table',
        attrs: { repeatHeader: true },
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                attrs: { colspan: 2, rowspan: 1, verticalAlign: 'middle' },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ringkasan Beban' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { verticalAlign: 'top' },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Total Baris' }] }],
              },
              {
                type: 'tableCell',
                attrs: { verticalAlign: 'top' },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: '115 Baris' }] }],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('Tahap 7 — S04 Tabel Kompleks, Multi-Halaman, Gambar Aman & Diff Sumber Data', () => {
  it('memvalidasi 115-baris SK tabel kompleks (colspan/colwidth/verticalAlign/rowHeightMm), docImage, pageBreak pada A4 & F4 Portrait/Landscape', () => {
    const logo = getTestSafeLogoUrl();
    const complexDoc = build115RowComplexSkContent(logo);
    const check = validateTipTapContent(complexDoc);
    expect(check.valid).toBe(true);

    const combinations: Array<['a4' | 'f4', 'portrait' | 'landscape']> = [
      ['a4', 'portrait'],
      ['a4', 'landscape'],
      ['f4', 'portrait'],
      ['f4', 'landscape'],
    ];

    for (const [paperSize, orientation] of combinations) {
      const pageCheck = validateStudioPageSettings({
        paperSize,
        orientation,
        marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
        headerText: 'Lampiran SK Mengajar 2026/2027',
        footerText: 'SIGNAL V3.2 Madrasah',
        showPageNumbers: true,
        pageNumberFormat: 'HALAMAN_DARI_TOTAL',
        repeatTableHeader: true,
      });
      expect(pageCheck.valid).toBe(true);
      expect(pageCheck.normalized?.repeatTableHeader).toBe(true);
      expect(pageCheck.normalized?.showPageNumbers).toBe(true);
    }
  });

  it('menjaga keamanan gambar (magic bytes & XSS rejection pada node selain docImage)', () => {
    // PNG magic bytes
    expect(
      detectRasterImageMimeFromBytes(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
      )
    ).toBe('image/png');
    // JPEG magic bytes
    expect(
      detectRasterImageMimeFromBytes(
        new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
      )
    ).toBe('image/jpeg');
    // Fake HTML disguised as image
    expect(
      detectRasterImageMimeFromBytes(new TextEncoder().encode('<script>alert(1)</script>'))
    ).toBeNull();

    // Tolak URL eksternal pada docImage
    const badExternalImg = validateTipTapContent({
      type: 'doc',
      content: [
        {
          type: 'docImage',
          attrs: { src: 'https://evil.example/tracker.png', widthMm: 30, align: 'center' },
        },
      ],
    });
    expect(badExternalImg.valid).toBe(false);

    // Tolak SVG data URL pada docImage
    const badSvgImg = validateTipTapContent({
      type: 'doc',
      content: [
        {
          type: 'docImage',
          attrs: {
            src: 'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=',
            widthMm: 30,
          },
        },
      ],
    });
    expect(badSvgImg.valid).toBe(false);

    // Tetap blokir atribut src pada paragraph biasa
    const forbiddenSrcOnParagraph = validateTipTapContent({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { src: 'data:image/png;base64,AAAA' },
          content: [{ type: 'text', text: 'Halo' }],
        },
      ],
    });
    expect(forbiddenSrcOnParagraph.valid).toBe(false);
  });

  it('membandingkan perubahan Data Master terhadap snapshot draft dan mengadopsinya secara selektif tanpa menimpa naskah manual S04', () => {
    const base = createDemoState();
    const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-08')!;
    const s03 = saveIntakeDraftToState(base, tpl, {
      documentTitle: 'Surat Undangan Evaluasi',
      documentDate: '2026-11-18',
      instansi_tujuan: 'Pengurus Komite',
      perihal: 'Rapat Evaluasi',
      isi_pokok: 'evaluasi semester ganjil',
    });

    const manualBody: TipTapJSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'Naskah Ketikan Manual Operator' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Kalimat ini disunting manual dan dilarang tertimpa.' }],
        },
      ],
    };

    const withStudio = saveStudioDraftToState(s03.state, s03.draft.id, {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: manualBody,
      pageSettings: {
        paperSize: 'f4',
        orientation: 'portrait',
        marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
        headerText: 'Kop Ringkas Halaman',
        footerText: 'Arsip Madrasah',
        showPageNumbers: true,
        pageNumberFormat: 'HALAMAN_DARI_TOTAL',
        repeatTableHeader: true,
      },
      updatedAt: '2026-11-17T10:00:00Z',
    });

    // Ubah settings madrasah setelah draft disimpan
    const modifiedState = {
      ...withStudio.state,
      settings: {
        ...withStudio.state.settings,
        schoolName: 'MTs Cendekia Nusantara Terpadu (Diperbarui)',
        headmasterName: 'Dr. Hj. Nafisah Rahmah, M.Pd.',
      },
    };

    const diffReport = compareDraftSnapshotsWithLiveState(withStudio.draft, modifiedState);
    expect(diffReport.hasChanges).toBe(true);
    expect(diffReport.changedSourceKeys).toContain('settings.madrasah_identity_signatory');

    const adopted = adoptSelectedSourceUpdatesToDraft(
      modifiedState,
      withStudio.draft.id,
      ['settings.madrasah_identity_signatory'],
      '2026-11-17T11:00:00Z'
    );

    const updatedKopSnap = adopted.draft.sourceSnapshots.find(
      (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
    );
    expect((updatedKopSnap?.capturedValue as Record<string, unknown>).schoolName).toBe(
      'MTs Cendekia Nusantara Terpadu (Diperbarui)'
    );
    // Pastikan naskah manual di studio TIDAK tersentuh sedikit pun!
    expect(adopted.draft.studio?.content).toEqual(manualBody);
  });

  it('merender SSR DocumentStudio dengan docImage, pageBreak, tabel kompleks, header/footer, nomor halaman & catatan jujur estimasi halaman', () => {
    const base = createDemoState();
    const tpl = SYSTEM_DOCUMENT_TEMPLATES.find((t) => t.id === 'SYS-TPL-08')!;
    const s03 = saveIntakeDraftToState(base, tpl, {
      documentTitle: 'Uji Kompleks SSR',
      documentDate: '2026-11-18',
      instansi_tujuan: 'Kemenag Kabupaten',
      perihal: 'Laporan Tahunan',
      isi_pokok: 'penyampaian laporan pembagian tugas 115 baris',
    });

    const logo = getTestSafeLogoUrl();
    const persisted = saveStudioDraftToState(s03.state, s03.draft.id, {
      schemaVersion: 1,
      editorStatus: 'IN_PROGRESS',
      content: build115RowComplexSkContent(logo),
      pageSettings: {
        paperSize: 'f4',
        orientation: 'landscape',
        marginsMm: { top: 20, right: 20, bottom: 20, left: 25 },
        headerText: 'Header Dokumen Kompleks 115 Baris',
        footerText: 'Footer Resmi SIGNAL',
        showPageNumbers: true,
        pageNumberFormat: 'HALAMAN_DARI_TOTAL',
        repeatTableHeader: true,
      },
      updatedAt: '2026-11-17T10:30:00Z',
    });

    const html = renderToStaticMarkup(
      createElement(DocumentStudio, {
        state: persisted.state,
        draft: persisted.draft,
        onPersistStudioState: () => {},
        onBackToIntake: () => {},
        onBackToCenter: () => {},
      })
    );

    expect(html).toContain('Page Break');
    expect(html).toContain('Logo/Gambar');
    expect(html).toContain('Header Dokumen Kompleks 115 Baris');
    expect(html).toContain('Footer Resmi SIGNAL');
    expect(html).toContain('Halaman 1 / ~');
    expect(html).toContain('Pemisah Halaman Manual (Page Break)');
    expect(html).toContain('data-doc-image="true"');
    expect(html).toContain('Guru Uji 115');
    expect(html).toContain('estimasi jumlah halaman');
  });
});
