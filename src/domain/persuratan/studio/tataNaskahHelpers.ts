import type { DocumentIntakeDraft, DocumentKind, TipTapJSONContent, TipTapJSONMark, TipTapJSONNode } from '../types';
import { AUTO_FINALIZATION_NUMBER_TOKENS } from '../finalization/checklist';
import { extractPlainTextAndTokens } from './contentValidation';

const INDONESIAN_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const INDONESIAN_DAYS = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

const BASIC_WORDS = [
  '',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
  'sebelas',
];

/**
 * Mengubah bilangan bulat positif (0..9999) menjadi ejaan terbilang bahasa Indonesia baku.
 * Digunakan untuk pembuka Berita Acara Kemenag ("tanggal dua puluh empat bulan November tahun dua ribu dua puluh enam").
 */
export function numberToIndonesianWords(raw: number): string {
  const n = Math.trunc(raw);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n === 0) return 'nol';
  if (n < 12) return BASIC_WORDS[n];
  if (n < 20) return `${BASIC_WORDS[n - 10]} belas`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const rem = n % 10;
    return rem === 0 ? `${BASIC_WORDS[tens]} puluh` : `${BASIC_WORDS[tens]} puluh ${BASIC_WORDS[rem]}`;
  }
  if (n < 200) {
    const rem = n - 100;
    return rem === 0 ? 'seratus' : `seratus ${numberToIndonesianWords(rem)}`;
  }
  if (n < 1000) {
    const hundreds = Math.floor(n / 100);
    const rem = n % 100;
    return rem === 0
      ? `${BASIC_WORDS[hundreds]} ratus`
      : `${BASIC_WORDS[hundreds]} ratus ${numberToIndonesianWords(rem)}`;
  }
  if (n < 2000) {
    const rem = n - 1000;
    return rem === 0 ? 'seribu' : `seribu ${numberToIndonesianWords(rem)}`;
  }
  if (n < 10000) {
    const thousands = Math.floor(n / 1000);
    const rem = n % 1000;
    return rem === 0
      ? `${BASIC_WORDS[thousands]} ribu`
      : `${BASIC_WORDS[thousands]} ribu ${numberToIndonesianWords(rem)}`;
  }
  return String(n);
}

/**
 * Menghasilkan frasa pembuka tanggal Berita Acara autentik sesuai Tata Naskah Dinas Indonesia:
 * "hari Selasa tanggal dua puluh empat bulan November tahun dua ribu dua puluh enam (24-11-2026)"
 */
export function formatBeritaAcaraOpeningDate(isoDate?: string | null): string {
  const clean = (isoDate ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!match) {
    return clean || 'hari ini';
  }
  const year = Number(match[1]);
  const monthNum = Number(match[2]);
  const day = Number(match[3]);
  if (monthNum < 1 || monthNum > 12 || day < 1 || day > 31) {
    return clean;
  }
  const dt = new Date(Date.UTC(year, monthNum - 1, day));
  const dayName = INDONESIAN_DAYS[dt.getUTCDay()] ?? 'Senin';
  const monthName = INDONESIAN_MONTHS[monthNum - 1] ?? '';
  const dayWords = numberToIndonesianWords(day);
  const yearWords = numberToIndonesianWords(year);
  const ddmmyyyy = `${String(day).padStart(2, '0')}-${String(monthNum).padStart(2, '0')}-${year}`;
  return `hari ${dayName}, tanggal ${dayWords} bulan ${monthName} tahun ${yearWords} (${ddmmyyyy})`;
}

function makeParagraph(
  text: string,
  opts?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: 'left' | 'center' | 'right' | 'justify' }
): TipTapJSONNode {
  const attrs = opts?.align ? { textAlign: opts.align } : undefined;
  if (!text) {
    return { type: 'paragraph', ...(attrs ? { attrs } : {}) };
  }
  const marks: TipTapJSONMark[] = [];
  if (opts?.bold) marks.push({ type: 'bold' });
  if (opts?.italic) marks.push({ type: 'italic' });
  if (opts?.underline) marks.push({ type: 'underline' });
  return {
    type: 'paragraph',
    ...(attrs ? { attrs } : {}),
    content: [
      {
        type: 'text',
        text,
        ...(marks.length > 0 ? { marks } : {}),
      },
    ],
  };
}

export type SignatoryDelegationMode = 'direct' | 'an' | 'plt';

export interface DelegatedSignatureParams {
  mode: SignatoryDelegationMode;
  city: string;
  dateText: string;
  headTitle: string;
  headName: string;
  headNip?: string | null;
  delegateTitle?: string;
  delegateName?: string;
  delegateNip?: string | null;
  omitTitimangsa?: boolean;
  ditetapkanStyle?: boolean;
  leftTitle?: string;
  leftName?: string;
  leftIdLabel?: string;
}

/**
 * Membangun blok tanda tangan borderless (`tableLayout: 'signature'`) sesuai Tata Naskah Dinas Kemenag:
 * - Mendukung tanda tangan langsung (`Kepala Madrasah,`),
 *   delegasi Atas Nama (`a.n. Kepala Madrasah` + jabatan delegasi),
 *   dan Pelaksana Tugas (`Plt. Kepala Madrasah,`).
 */
export function buildDelegatedSignatureTable(params: DelegatedSignatureParams): TipTapJSONNode {
  const cleanHeadTitle = params.headTitle.replace(/,\s*$/, '').trim() || 'Kepala Madrasah';
  const isAn = params.mode === 'an';
  const isPlt = params.mode === 'plt';

  const signerName =
    isAn && params.delegateName?.trim()
      ? params.delegateName.trim()
      : params.headName.trim() || 'Kepala Madrasah';

  const rawNip = isAn ? params.delegateNip?.trim() ?? '' : params.headNip?.trim() ?? '';
  const formattedNip =
    rawNip && !/^NIP\.?/i.test(rawNip) && !/^NPK\.?/i.test(rawNip)
      ? `NIP. ${rawNip}`
      : rawNip;
  const hasNip = Boolean(formattedNip);

  const rightNodes: TipTapJSONNode[] = [];
  if (params.ditetapkanStyle) {
    rightNodes.push(makeParagraph(`Ditetapkan di : ${params.city}`));
    rightNodes.push(makeParagraph(`Pada tanggal  : ${params.dateText}`));
  } else if (!params.omitTitimangsa) {
    rightNodes.push(makeParagraph(`${params.city}, ${params.dateText}`));
  }

  if (isAn) {
    const delTitle =
      params.delegateTitle?.trim().replace(/,\s*$/, '') || 'Wakil Kepala Bidang Kurikulum';
    rightNodes.push(makeParagraph(`a.n. ${cleanHeadTitle}`));
    rightNodes.push(makeParagraph(`${delTitle},`));
  } else if (isPlt) {
    rightNodes.push(makeParagraph(`Plt. ${cleanHeadTitle},`));
  } else {
    rightNodes.push(makeParagraph(`${cleanHeadTitle},`));
  }

  rightNodes.push(makeParagraph(''));
  rightNodes.push(makeParagraph(''));
  rightNodes.push(makeParagraph(''));
  rightNodes.push(makeParagraph(signerName, { bold: true, underline: !hasNip }));
  if (hasNip) {
    rightNodes.push(makeParagraph(formattedNip));
  }

  let leftNodes: TipTapJSONNode[];
  if (params.leftTitle?.trim()) {
    const lt = params.leftTitle.trim();
    const ln = params.leftName?.trim() || '( .................................... )';
    const lid = params.leftIdLabel?.trim() || '';
    leftNodes = [
      ...(params.omitTitimangsa ? [] : [makeParagraph('')]),
      makeParagraph(lt),
      makeParagraph(''),
      makeParagraph(''),
      makeParagraph(''),
      makeParagraph(ln, { bold: true, underline: !lid }),
      ...(lid ? [makeParagraph(lid)] : []),
    ];
  } else {
    leftNodes = [makeParagraph('')];
  }

  return {
    type: 'table',
    attrs: { tableLayout: 'signature', repeatHeader: false },
    content: [
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', content: leftNodes },
          { type: 'tableCell', content: rightNodes },
        ],
      },
    ],
  };
}

export type StudioTataNaskahSnippetId =
  | 'ttd'
  | 'ttdganda'
  | 'tembusan'
  | 'identitas'
  | 'salam'
  | 'lampiran';

export interface StudioSnippetContext {
  schoolName: string;
  city: string;
  dateText: string;
  headTitle: string;
  headName: string;
  headNip?: string | null;
  documentKind?: DocumentKind;
}

/**
 * Menghasilkan node TipTap siap-sisip untuk Slash Command & menu Sisipkan Tata Naskah Dinas di Document Studio.
 */
export function buildStudioSnippetNodes(
  snippetId: StudioTataNaskahSnippetId,
  ctx: StudioSnippetContext
): TipTapJSONNode[] {
  if (snippetId === 'ttd') {
    return [
      buildDelegatedSignatureTable({
        mode: 'direct',
        city: ctx.city,
        dateText: ctx.dateText,
        headTitle: ctx.headTitle,
        headName: ctx.headName,
        headNip: ctx.headNip,
      }),
    ];
  }

  if (snippetId === 'ttdganda') {
    return [
      buildDelegatedSignatureTable({
        mode: 'direct',
        city: ctx.city,
        dateText: ctx.dateText,
        headTitle: ctx.headTitle,
        headName: ctx.headName,
        headNip: ctx.headNip,
        leftTitle: 'Mengetahui / Pihak Kedua,',
        leftName: '( Nama Pejabat / Pihak Terkait )',
      }),
    ];
  }

  if (snippetId === 'tembusan') {
    return [
      makeParagraph('Tembusan:', { bold: true }),
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [
          {
            type: 'listItem',
            content: [makeParagraph('Ketua Yayasan / Pimpinan Lembaga')],
          },
          {
            type: 'listItem',
            content: [makeParagraph('Pengawas Madrasah Kantor Kementerian Agama setempat')],
          },
          {
            type: 'listItem',
            content: [makeParagraph('Arsip')],
          },
        ],
      },
    ];
  }

  if (snippetId === 'identitas') {
    return [
      {
        type: 'table',
        attrs: { tableLayout: 'meta', repeatHeader: false },
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [makeParagraph('Nama')] },
              { type: 'tableCell', content: [makeParagraph(':')] },
              { type: 'tableCell', content: [makeParagraph('Nama Lengkap')] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [makeParagraph('Jabatan / Peran')] },
              { type: 'tableCell', content: [makeParagraph(':')] },
              { type: 'tableCell', content: [makeParagraph('Pendidik / Pegawai')] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [makeParagraph('Unit Kerja')] },
              { type: 'tableCell', content: [makeParagraph(':')] },
              { type: 'tableCell', content: [makeParagraph(ctx.schoolName)] },
            ],
          },
        ],
      },
    ];
  }

  if (snippetId === 'salam') {
    return [
      makeParagraph('Assalamu’alaikum warahmatullahi wabarakatuh.', { italic: true }),
      makeParagraph(''),
      makeParagraph('Wassalamu’alaikum warahmatullahi wabarakatuh.', { italic: true }),
    ];
  }

  // 'lampiran'
  const numberToken = ctx.documentKind === 'SK' ? '{{NOMOR_SK}}' : '{{NOMOR_SURAT}}';
  return [
    { type: 'pageBreak' },
    {
      type: 'table',
      attrs: { tableLayout: 'meta', repeatHeader: false },
      content: [
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [makeParagraph('Lampiran')] },
            { type: 'tableCell', content: [makeParagraph(':')] },
            { type: 'tableCell', content: [makeParagraph(`Surat / Keputusan Kepala ${ctx.schoolName}`)] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [makeParagraph('Nomor')] },
            { type: 'tableCell', content: [makeParagraph(':')] },
            { type: 'tableCell', content: [makeParagraph(numberToken)] },
          ],
        },
        {
          type: 'tableRow',
          content: [
            { type: 'tableCell', content: [makeParagraph('Tanggal')] },
            { type: 'tableCell', content: [makeParagraph(':')] },
            { type: 'tableCell', content: [makeParagraph(ctx.dateText)] },
          ],
        },
      ],
    },
    makeParagraph(''),
    {
      type: 'heading',
      attrs: { level: 2, textAlign: 'center' },
      content: [{ type: 'text', text: 'DAFTAR LAMPIRAN DOKUMEN RESMI' }],
    },
  ];
}

export interface TataNaskahAuditItem {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  fixSnippet?: StudioTataNaskahSnippetId | null;
}

export interface TataNaskahAuditReport {
  score: number;
  passedCount: number;
  totalCount: number;
  items: TataNaskahAuditItem[];
}

function hasTableLayout(nodes: TipTapJSONNode[], layout: string): boolean {
  for (const n of nodes) {
    if (n.type === 'table' && n.attrs?.tableLayout === layout) return true;
    if (Array.isArray(n.content) && hasTableLayout(n.content, layout)) return true;
  }
  return false;
}

/**
 * Audit deterministik Tata Naskah Dinas Kemenag (0 ms, tanpa AI eksternal).
 * Membantu operator TU memastikan surat sudah tampak autentik, bersih dari sisa template,
 * dan siap cetak sebelum disahkan.
 */
export function evaluateTataNaskahAuthenticity(params: {
  content: TipTapJSONContent;
  includeKopSurat: boolean;
  draft?: DocumentIntakeDraft | null;
  signatoryName?: string | null;
}): TataNaskahAuditReport {
  const { content, includeKopSurat, draft, signatoryName } = params;
  const { plainText, unresolvedTokens } = extractPlainTextAndTokens(content);
  const manualTokens = unresolvedTokens.filter((t) => !AUTO_FINALIZATION_NUMBER_TOKENS.has(t));
  const hasUnfilledMarker = /\[Belum diisi\]/i.test(plainText);

  const hasHeaderOrTitle =
    hasTableLayout(content.content ?? [], 'letter_header') ||
    (content.content ?? []).some((n) => n.type === 'heading') ||
    /NOMOR\s*:/i.test(plainText);

  const hasSignatureBlock =
    hasTableLayout(content.content ?? [], 'signature') ||
    (Boolean(signatoryName?.trim()) && plainText.includes(signatoryName!.trim()));

  const hasRawAiDots = /\s·\s/.test(plainText);
  const wordCount = plainText.trim() ? plainText.trim().split(/\s+/).length : 0;

  const isBlankCanvas = draft?.templateId === 'SYS-TPL-30';
  const items: TataNaskahAuditItem[] = [
    {
      id: 'kop',
      label: 'Kop Surat Resmi',
      passed: isBlankCanvas ? true : includeKopSurat,
      detail: includeKopSurat
        ? 'Kop resmi madrasah aktif & terintegrasi pada cetakan.'
        : isBlankCanvas
          ? 'Kanvas bebas (Kop opsional).'
          : 'Kop surat nonaktif.',
      fixSnippet: null,
    },
    {
      id: 'clean_tokens',
      label: 'Bebas Placeholder Mentah',
      passed: !hasUnfilledMarker && manualTokens.length === 0,
      detail:
        !hasUnfilledMarker && manualTokens.length === 0
          ? 'Tidak ada teks [Belum diisi] atau variabel kosong tertinggal.'
          : `Masih terdapat ${manualTokens.length} token manual atau tanda [Belum diisi].`,
      fixSnippet: null,
    },
    {
      id: 'structure',
      label: 'Struktur Kepala / Judul Naskah',
      passed: hasHeaderOrTitle,
      detail: hasHeaderOrTitle
        ? 'Struktur nomor/judul tata naskah dinas terdeteksi rapi.'
        : 'Belum ada judul resmi atau blok Nomor/Lampiran/Hal.',
      fixSnippet: null,
    },
    {
      id: 'signature',
      label: 'Blok Tanda Tangan Resmi',
      passed: hasSignatureBlock,
      detail: hasSignatureBlock
        ? 'Blok pengesahan tanda tangan di kolom kanan tersedia.'
        : 'Belum ada blok tanda tangan resmi pada naskah.',
      fixSnippet: 'ttd',
    },
    {
      id: 'editorial',
      label: 'Kerapian Bahasa & Format',
      passed: wordCount >= 18 && !hasRawAiDots,
      detail:
        wordCount < 18
          ? 'Isi naskah masih sangat singkat; lengkapi batang tubuh surat.'
          : hasRawAiDots
            ? 'Terdapat tanda titik tengah (·) non-baku di naskah; rapikan jika perlu.'
            : 'Batang tubuh naskah ringkas, bersih, dan baku.',
      fixSnippet: null,
    },
  ];

  const passedCount = items.filter((i) => i.passed).length;
  const score = Math.round((passedCount / items.length) * 100);
  return {
    score,
    passedCount,
    totalCount: items.length,
    items,
  };
}
