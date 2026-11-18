import type { TipTapJSONContent, TipTapJSONNode } from './types';

export interface DocumentOutlineItem {
  id: string;
  level: 1 | 2 | 3;
  text: string;
  /** Indeks urutan heading ke-N di level top/nested dokumen untuk pencocokan posisi ProseMirror */
  headingIndex: number;
}

export interface DocumentStructureSummary {
  headings: DocumentOutlineItem[];
  paragraphCount: number;
  tableCount: number;
  listCount: number;
}

function collectNodeText(node: TipTapJSONNode): string {
  if (node.type === 'text' && typeof node.text === 'string') {
    return node.text;
  }
  if (!Array.isArray(node.content)) return '';
  return node.content.map(collectNodeText).join('');
}

/**
 * Mengekstrak daftar heading (H1–H3) dan ringkasan blok struktur dari dokumen JSON TipTap S04.
 */
export function extractDocumentOutline(doc: TipTapJSONContent): DocumentStructureSummary {
  const headings: DocumentOutlineItem[] = [];
  let paragraphCount = 0;
  let tableCount = 0;
  let listCount = 0;
  let headingSeq = 0;

  const walk = (nodes: TipTapJSONNode[], insideTableOrList = false) => {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;

      if (node.type === 'heading') {
        const rawLevel = node.attrs?.level;
        const level: 1 | 2 | 3 = rawLevel === 1 || rawLevel === 2 || rawLevel === 3 ? rawLevel : 2;
        const cleanText = collectNodeText(node).replace(/\s+/g, ' ').trim();
        headings.push({
          id: `heading-${headingSeq}`,
          level,
          text: cleanText || '(Judul kosong)',
          headingIndex: headingSeq,
        });
        headingSeq += 1;
      } else if (node.type === 'paragraph') {
        if (!insideTableOrList) {
          const text = collectNodeText(node).trim();
          if (text.length > 0) paragraphCount += 1;
        }
      } else if (node.type === 'table') {
        tableCount += 1;
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        listCount += 1;
      }

      if (Array.isArray(node.content) && node.type !== 'heading') {
        const nextInside =
          insideTableOrList ||
          node.type === 'table' ||
          node.type === 'bulletList' ||
          node.type === 'orderedList';
        walk(node.content, nextInside);
      }
    }
  };

  if (Array.isArray(doc?.content)) {
    walk(doc.content);
  }

  return {
    headings,
    paragraphCount,
    tableCount,
    listCount,
  };
}

export type StudioSaveIndicatorMode =
  | 'new'
  | 'dirty'
  | 'autosaving'
  | 'saving'
  | 'saved_auto'
  | 'saved_manual'
  | 'error';

export function formatStudioTimeShort(isoTimestamp: string | null): string {
  if (!isoTimestamp) return '';
  const dt = new Date(isoTimestamp);
  if (Number.isNaN(dt.getTime())) return '';
  return new Intl.DateTimeFormat('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(dt);
}

export function getStudioSaveStatusLabel(
  mode: StudioSaveIndicatorMode,
  lastSavedAt: string | null
): string {
  const timeText = formatStudioTimeShort(lastSavedAt);
  switch (mode) {
    case 'error':
      return 'Gagal menyimpan — periksa penyimpanan';
    case 'autosaving':
      return 'Menyimpan otomatis…';
    case 'saving':
      return 'Menyimpan draft…';
    case 'dirty':
      return 'Perubahan belum disimpan';
    case 'saved_auto':
      return timeText ? `Tersimpan otomatis · ${timeText}` : 'Tersimpan otomatis';
    case 'saved_manual':
      return timeText ? `Tersimpan lokal · ${timeText}` : 'Tersimpan lokal';
    case 'new':
    default:
      return timeText ? `Tersimpan lokal · ${timeText}` : 'Draft Baru';
  }
}
