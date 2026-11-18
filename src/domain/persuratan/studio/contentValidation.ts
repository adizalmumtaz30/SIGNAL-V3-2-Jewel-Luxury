import DOMPurify from 'dompurify';
import {
  PAPER_DIMENSIONS_MM,
  STUDIO_MARGIN_MAX_MM,
  STUDIO_MARGIN_MIN_MM,
  type DocumentStudioPageSettings,
  type StudioOrientation,
  type StudioPaperSize,
  type TipTapJSONContent,
  type TipTapJSONMark,
  type TipTapJSONNode,
} from './types';

export const STUDIO_SCHEMA_VERSION = 1 as const;
export const STUDIO_MAX_TREE_DEPTH = 24;
export const STUDIO_MAX_NODES = 10_000;
export const STUDIO_MAX_TEXT_NODE_LENGTH = 50_000;
export const STUDIO_MAX_TOTAL_TEXT_LENGTH = 500_000;
export const STUDIO_MAX_IMAGE_DATA_URL_LENGTH = 700_000;

export const ALLOWED_STUDIO_NODE_TYPES = new Set<string>([
  'doc',
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'text',
  'hardBreak',
  'horizontalRule',
  'pageBreak',
  'docImage',
]);

export const ALLOWED_STUDIO_MARKS = new Set<string>(['bold', 'italic', 'underline']);
export const ALLOWED_TEXT_ALIGNS = new Set<string>(['left', 'center', 'right', 'justify']);
export const ALLOWED_VERTICAL_ALIGNS = new Set<string>(['top', 'middle', 'bottom']);
export const ALLOWED_IMAGE_ALIGNS = new Set<string>(['left', 'center', 'right']);

const SAFE_IMAGE_DATA_URL_REGEX =
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;

export function isSafeInlineImageDataUrl(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const trimmed = src.trim();
  if (trimmed.length === 0 || trimmed.length > STUDIO_MAX_IMAGE_DATA_URL_LENGTH) {
    return false;
  }
  return SAFE_IMAGE_DATA_URL_REGEX.test(trimmed);
}

/**
 * Validasi magic bytes file gambar raster aman (PNG, JPEG, WEBP) untuk penyisipan di S04.
 */
export function detectRasterImageMimeFromBytes(
  bytes: Uint8Array
): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (!bytes || bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

const FORBIDDEN_ATTR_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
  'style',
  'class',
  'className',
  'onclick',
  'onerror',
  'onload',
  'onmouseover',
  'href',
  'src',
  'dangerouslySetInnerHTML',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getEffectivePaperDimensionsMm(
  paperSize: StudioPaperSize,
  orientation: StudioOrientation
): { widthMm: number; heightMm: number } {
  const base = PAPER_DIMENSIONS_MM[paperSize] ?? PAPER_DIMENSIONS_MM.a4;
  return orientation === 'landscape'
    ? { widthMm: base.heightMm, heightMm: base.widthMm }
    : { widthMm: base.widthMm, heightMm: base.heightMm };
}

export function validateStudioPageSettings(candidate: unknown): {
  valid: boolean;
  error?: string;
  normalized?: DocumentStudioPageSettings;
} {
  if (!isPlainObject(candidate)) {
    return { valid: false, error: 'Pengaturan halaman Document Studio tidak valid.' };
  }

  const paperSize = candidate.paperSize;
  if (paperSize !== 'a4' && paperSize !== 'f4') {
    return { valid: false, error: 'Ukuran kertas hanya mendukung A4 atau F4.' };
  }

  const orientation = candidate.orientation;
  if (orientation !== 'portrait' && orientation !== 'landscape') {
    return { valid: false, error: 'Orientasi kertas harus portrait atau landscape.' };
  }

  const margins = candidate.marginsMm;
  if (!isPlainObject(margins)) {
    return { valid: false, error: 'Pengaturan margin halaman tidak lengkap.' };
  }

  const sides: Array<keyof typeof margins> = ['top', 'right', 'bottom', 'left'];
  const cleanMargins = { top: 20, right: 20, bottom: 20, left: 25 };

  for (const side of sides) {
    const val = margins[side];
    if (typeof val !== 'number' || !Number.isFinite(val)) {
      return { valid: false, error: `Margin ${side} harus berupa angka yang valid.` };
    }
    if (val < STUDIO_MARGIN_MIN_MM || val > STUDIO_MARGIN_MAX_MM) {
      return {
        valid: false,
        error: `Margin ${side} harus berada di rentang ${STUDIO_MARGIN_MIN_MM}–${STUDIO_MARGIN_MAX_MM} mm.`,
      };
    }
    cleanMargins[side as keyof typeof cleanMargins] = Math.round(val * 10) / 10;
  }

  const dims = getEffectivePaperDimensionsMm(paperSize, orientation);
  if (cleanMargins.left + cleanMargins.right >= dims.widthMm - 40) {
    return {
      valid: false,
      error: 'Jumlah margin kiri dan kanan terlalu lebar dibanding lebar kertas.',
    };
  }
  if (cleanMargins.top + cleanMargins.bottom >= dims.heightMm - 60) {
    return {
      valid: false,
      error: 'Jumlah margin atas dan bawah terlalu tinggi dibanding tinggi kertas.',
    };
  }

  const normalized: DocumentStudioPageSettings = {
    paperSize,
    orientation,
    marginsMm: cleanMargins,
  };

  if (candidate.headerText !== undefined) {
    if (typeof candidate.headerText !== 'string' || candidate.headerText.length > 160) {
      return { valid: false, error: 'Teks header halaman maksimal 160 karakter.' };
    }
    normalized.headerText = candidate.headerText;
  }
  if (candidate.footerText !== undefined) {
    if (typeof candidate.footerText !== 'string' || candidate.footerText.length > 160) {
      return { valid: false, error: 'Teks footer halaman maksimal 160 karakter.' };
    }
    normalized.footerText = candidate.footerText;
  }
  if (candidate.showPageNumbers !== undefined) {
    if (typeof candidate.showPageNumbers !== 'boolean') {
      return { valid: false, error: 'Opsi nomor halaman harus boolean.' };
    }
    normalized.showPageNumbers = candidate.showPageNumbers;
  }
  if (candidate.pageNumberFormat !== undefined) {
    if (
      candidate.pageNumberFormat !== 'HALAMAN_DARI_TOTAL' &&
      candidate.pageNumberFormat !== 'HALAMAN_SAJA'
    ) {
      return { valid: false, error: 'Format nomor halaman tidak didukung.' };
    }
    normalized.pageNumberFormat = candidate.pageNumberFormat;
  }
  if (candidate.repeatTableHeader !== undefined) {
    if (typeof candidate.repeatTableHeader !== 'boolean') {
      return { valid: false, error: 'Opsi ulangi header tabel harus boolean.' };
    }
    normalized.repeatTableHeader = candidate.repeatTableHeader;
  }

  return {
    valid: true,
    normalized,
  };
}

function validateNodeAttrs(nodeType: string, attrs: unknown): string | null {
  if (attrs === undefined) return null;
  if (!isPlainObject(attrs)) {
    return `Atribut node "${nodeType}" harus berupa objek.`;
  }

  for (const key of Object.keys(attrs)) {
    if (key === 'src' && nodeType === 'docImage') {
      continue;
    }
    if (FORBIDDEN_ATTR_KEYS.has(key) || key.toLowerCase().startsWith('on')) {
      return `Atribut terlarang "${key}" terdeteksi pada node "${nodeType}".`;
    }
  }

  if (attrs.textAlign !== undefined && attrs.textAlign !== null) {
    if (typeof attrs.textAlign !== 'string' || !ALLOWED_TEXT_ALIGNS.has(attrs.textAlign)) {
      return `Perataan teks "${String(attrs.textAlign)}" tidak diizinkan.`;
    }
  }

  if (nodeType === 'heading' && attrs.level !== undefined) {
    if (attrs.level !== 1 && attrs.level !== 2 && attrs.level !== 3) {
      return 'Level heading hanya mendukung H1, H2, atau H3.';
    }
  }

  if (nodeType === 'orderedList' && attrs.start !== undefined && attrs.start !== null) {
    if (typeof attrs.start !== 'number' || !Number.isInteger(attrs.start) || attrs.start < 1) {
      return 'Atribut start pada orderedList harus bilangan bulat positif.';
    }
  }

  if (nodeType === 'docImage') {
    if (!isSafeInlineImageDataUrl(attrs.src)) {
      return 'Gambar dokumen hanya mengizinkan data URL PNG/JPEG/WEBP berukuran aman.';
    }
    if (attrs.widthMm !== undefined && attrs.widthMm !== null) {
      if (
        typeof attrs.widthMm !== 'number' ||
        !Number.isFinite(attrs.widthMm) ||
        attrs.widthMm < 10 ||
        attrs.widthMm > 180
      ) {
        return 'Lebar gambar dokumen harus berada di rentang 10–180 mm.';
      }
    }
    if (attrs.align !== undefined && attrs.align !== null) {
      if (typeof attrs.align !== 'string' || !ALLOWED_IMAGE_ALIGNS.has(attrs.align)) {
        return 'Perataan gambar hanya mendukung left, center, atau right.';
      }
    }
    if (attrs.alt !== undefined && attrs.alt !== null) {
      if (typeof attrs.alt !== 'string' || attrs.alt.length > 200) {
        return 'Teks alternatif gambar maksimal 200 karakter.';
      }
    }
  }

  if (nodeType === 'table') {
    if (attrs.repeatHeader !== undefined && typeof attrs.repeatHeader !== 'boolean') {
      return 'Atribut repeatHeader tabel harus boolean.';
    }
  }

  if (nodeType === 'tableRow') {
    if (attrs.rowHeightMm !== undefined && attrs.rowHeightMm !== null) {
      if (
        typeof attrs.rowHeightMm !== 'number' ||
        !Number.isFinite(attrs.rowHeightMm) ||
        attrs.rowHeightMm < 5 ||
        attrs.rowHeightMm > 80
      ) {
        return 'Tinggi baris tabel harus berada di rentang 5–80 mm.';
      }
    }
  }

  if (nodeType === 'tableCell' || nodeType === 'tableHeader') {
    if (attrs.colspan !== undefined && attrs.colspan !== null) {
      if (
        typeof attrs.colspan !== 'number' ||
        !Number.isInteger(attrs.colspan) ||
        attrs.colspan < 1 ||
        attrs.colspan > 20
      ) {
        return 'Atribut colspan sel tabel tidak valid.';
      }
    }
    if (attrs.rowspan !== undefined && attrs.rowspan !== null) {
      if (
        typeof attrs.rowspan !== 'number' ||
        !Number.isInteger(attrs.rowspan) ||
        attrs.rowspan < 1 ||
        attrs.rowspan > 50
      ) {
        return 'Atribut rowspan sel tabel tidak valid.';
      }
    }
    if (attrs.colwidth !== undefined && attrs.colwidth !== null) {
      if (
        !Array.isArray(attrs.colwidth) ||
        attrs.colwidth.some((w) => w !== null && (typeof w !== 'number' || !Number.isFinite(w) || w <= 0))
      ) {
        return 'Atribut colwidth sel tabel tidak valid.';
      }
    }
    if (attrs.verticalAlign !== undefined && attrs.verticalAlign !== null) {
      if (typeof attrs.verticalAlign !== 'string' || !ALLOWED_VERTICAL_ALIGNS.has(attrs.verticalAlign)) {
        return `Perataan vertikal sel "${String(attrs.verticalAlign)}" tidak diizinkan.`;
      }
    }
  }

  return null;
}

function validateNodeMarks(marks: unknown): string | null {
  if (marks === undefined) return null;
  if (!Array.isArray(marks)) {
    return 'Daftar mark teks tidak valid.';
  }
  for (const mark of marks) {
    if (!isPlainObject(mark) || typeof mark.type !== 'string') {
      return 'Entri mark teks rusak.';
    }
    if (!ALLOWED_STUDIO_MARKS.has(mark.type)) {
      return `Mark "${mark.type}" tidak diizinkan pada Document Studio S04.`;
    }
    if (mark.attrs !== undefined && !isPlainObject(mark.attrs)) {
      return `Atribut mark "${mark.type}" tidak valid.`;
    }
    if (isPlainObject(mark.attrs)) {
      for (const k of Object.keys(mark.attrs)) {
        if (FORBIDDEN_ATTR_KEYS.has(k) || k.toLowerCase().startsWith('on')) {
          return `Atribut mark terlarang "${k}" terdeteksi.`;
        }
      }
    }
  }
  return null;
}

export function validateTipTapContent(content: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!isPlainObject(content) || content.type !== 'doc' || !Array.isArray(content.content)) {
    return {
      valid: false,
      error: 'Konten naskah Document Studio harus berupa dokumen JSON TipTap bertipe "doc".',
    };
  }

  let totalNodes = 0;
  let totalTextLen = 0;

  const walk = (node: unknown, depth: number): string | null => {
    if (depth > STUDIO_MAX_TREE_DEPTH) {
      return `Kedalaman struktur dokumen melebihi batas aman (${STUDIO_MAX_TREE_DEPTH}).`;
    }
    if (!isPlainObject(node) || typeof node.type !== 'string') {
      return 'Node konten dokumen tidak valid.';
    }
    if (!ALLOWED_STUDIO_NODE_TYPES.has(node.type)) {
      return `Tipe node "${node.type}" tidak diizinkan pada Document Studio.`;
    }

    totalNodes += 1;
    if (totalNodes > STUDIO_MAX_NODES) {
      return `Jumlah node dokumen melebihi batas aman (${STUDIO_MAX_NODES}).`;
    }

    const attrErr = validateNodeAttrs(node.type, node.attrs);
    if (attrErr) return attrErr;

    const marksErr = validateNodeMarks(node.marks);
    if (marksErr) return marksErr;

    if (node.type === 'text') {
      if (typeof node.text !== 'string') {
        return 'Node teks wajib memiliki properti string "text".';
      }
      if (node.text.length > STUDIO_MAX_TEXT_NODE_LENGTH) {
        return `Panjang teks satu node melebihi batas (${STUDIO_MAX_TEXT_NODE_LENGTH} karakter).`;
      }
      totalTextLen += node.text.length;
      if (totalTextLen > STUDIO_MAX_TOTAL_TEXT_LENGTH) {
        return `Total panjang naskah melebihi batas (${STUDIO_MAX_TOTAL_TEXT_LENGTH} karakter).`;
      }
      return null;
    }

    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) {
        return `Properti content pada node "${node.type}" harus berupa array.`;
      }
      for (const child of node.content) {
        const childErr = walk(child, depth + 1);
        if (childErr) return childErr;
      }
    }

    return null;
  };

  const err = walk(content, 0);
  if (err) {
    return { valid: false, error: err };
  }

  return { valid: true };
}

export function validateStudioState(candidate: unknown): {
  valid: boolean;
  error?: string;
} {
  if (!isPlainObject(candidate)) {
    return { valid: false, error: 'State Document Studio bukan objek yang valid.' };
  }
  if (candidate.schemaVersion !== STUDIO_SCHEMA_VERSION) {
    return { valid: false, error: 'Versi skema Document Studio tidak didukung.' };
  }
  if (candidate.editorStatus !== 'NOT_STARTED' && candidate.editorStatus !== 'IN_PROGRESS') {
    return { valid: false, error: 'Status editor Document Studio tidak valid.' };
  }
  if (typeof candidate.updatedAt !== 'string' || !candidate.updatedAt.trim()) {
    return { valid: false, error: 'Timestamp updatedAt Document Studio wajib ada.' };
  }

  const pageCheck = validateStudioPageSettings(candidate.pageSettings);
  if (!pageCheck.valid) {
    return { valid: false, error: pageCheck.error };
  }

  const contentCheck = validateTipTapContent(candidate.content);
  if (!contentCheck.valid) {
    return { valid: false, error: contentCheck.error };
  }

  return { valid: true };
}

const ALLOWED_PASTE_TAGS = new Set<string>([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'hr',
]);

const STRIP_WITH_CONTENT_REGEX =
  /<(script|style|iframe|object|embed|svg|math|noscript|template|textarea|title)\b[^>]*>[\s\S]*?<\/\1>/gi;
const SELF_CLOSING_DANGEROUS_REGEX =
  /<(script|style|iframe|object|embed|svg|link|meta|base|img|input|button)\b[^>]*\/?>/gi;

function sanitizeHtmlAllowlistOnly(html: string): string {
  // 1. Remove dangerous tags completely including inner contents
  let cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(STRIP_WITH_CONTENT_REGEX, '')
    .replace(SELF_CLOSING_DANGEROUS_REGEX, '');

  // 2. Replace any remaining tags selectively: keep only safe semantic tags & colspan/rowspan
  cleaned = cleaned.replace(/<\/?([a-zA-Z0-9:-]+)([^>]*)>/g, (full, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    const isClosing = full.startsWith('</');
    if (!ALLOWED_PASTE_TAGS.has(tag)) {
      // Unwrap span/div/font/o:p/etc. cleanly
      return tag === 'div' && isClosing ? '<br>' : '';
    }
    if (isClosing) {
      return tag === 'br' || tag === 'hr' ? '' : `</${tag}>`;
    }
    if (tag === 'br' || tag === 'hr') {
      return `<${tag}>`;
    }
    if (tag === 'td' || tag === 'th') {
      const colspanMatch = rawAttrs.match(/\bcolspan\s*=\s*["']?(\d{1,2})["']?/i);
      const rowspanMatch = rawAttrs.match(/\browspan\s*=\s*["']?(\d{1,2})["']?/i);
      const kept: string[] = [];
      if (colspanMatch && Number(colspanMatch[1]) > 1) {
        kept.push(`colspan="${Math.min(20, Number(colspanMatch[1]))}"`);
      }
      if (rowspanMatch && Number(rowspanMatch[1]) > 1) {
        kept.push(`rowspan="${Math.min(50, Number(rowspanMatch[1]))}"`);
      }
      return kept.length > 0 ? `<${tag} ${kept.join(' ')}>` : `<${tag}>`;
    }
    return `<${tag}>`;
  });

  // 3. Neutralize any lingering javascript:/vbscript: protocol strings in text fallback
  cleaned = cleaned.replace(/(?:javascript|vbscript|data:text\/html)\s*:/gi, '');

  return cleaned.trim();
}

/**
 * Sanitasi HTML paste (Word/Google Docs/web) secara aman:
 * - Menghapus <script>, <iframe>, <style>, event handler on*, javascript:, dan atribut Word/style inline.
 * - Menggunakan DOMPurify di lingkungan browser serta filter allowlist deterministik di semua runtime.
 */
export function sanitizePastedHtml(rawHtml: string): string {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    return '';
  }

  let candidate = rawHtml;
  const purifier = DOMPurify as unknown as {
    sanitize?: (dirty: string, cfg?: Record<string, unknown>) => string;
  };

  if (typeof window !== 'undefined' && typeof purifier?.sanitize === 'function') {
    candidate = purifier.sanitize(rawHtml, {
      ALLOWED_TAGS: Array.from(ALLOWED_PASTE_TAGS),
      ALLOWED_ATTR: ['colspan', 'rowspan'],
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'svg', 'form', 'input', 'img'],
      FORBID_ATTR: ['style', 'class', 'id', 'href', 'src'],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
    });
  }

  return sanitizeHtmlAllowlistOnly(candidate);
}

export function extractPlainTextAndTokens(doc: TipTapJSONContent): {
  plainText: string;
  unresolvedTokens: string[];
  hasMeaningfulText: boolean;
} {
  const chunks: string[] = [];
  const walk = (node: TipTapJSONNode) => {
    if (node.type === 'text' && typeof node.text === 'string') {
      chunks.push(node.text);
    } else if (node.type === 'hardBreak') {
      chunks.push('\n');
    } else if (Array.isArray(node.content)) {
      for (const child of node.content) {
        walk(child);
      }
      if (
        node.type === 'paragraph' ||
        node.type === 'heading' ||
        node.type === 'listItem' ||
        node.type === 'tableRow'
      ) {
        chunks.push('\n');
      }
    }
  };

  for (const child of doc.content) {
    walk(child);
  }

  const plainText = chunks.join('').replace(/\n{3,}/g, '\n\n').trim();
  const tokens = new Set<string>();
  for (const match of plainText.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)) {
    tokens.add(match[1]);
  }

  return {
    plainText,
    unresolvedTokens: Array.from(tokens),
    hasMeaningfulText: plainText.length > 0,
  };
}

export function normalizeMarks(marks?: TipTapJSONMark[]): TipTapJSONMark[] | undefined {
  if (!marks || marks.length === 0) return undefined;
  const clean = marks.filter((m) => ALLOWED_STUDIO_MARKS.has(m.type)).map((m) => ({ type: m.type }));
  return clean.length > 0 ? clean : undefined;
}
