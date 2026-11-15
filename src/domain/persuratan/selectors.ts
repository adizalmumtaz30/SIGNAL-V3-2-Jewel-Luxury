import type { Teacher } from '../types';
import type {
  CorrespondenceFilterState,
  CorrespondenceSortKey,
  CorrespondenceStats,
  DocumentKind,
  DocumentRecord,
  DocumentStatus,
  SortDirection,
} from './types';

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  SURAT_MASUK: 'Surat Masuk',
  SURAT_KELUAR: 'Surat Keluar',
  SK: 'Surat Keputusan (SK)',
  SURAT_TUGAS: 'Surat Tugas',
  UNDANGAN: 'Surat Undangan',
  SURAT_KETERANGAN: 'Surat Keterangan',
  BERITA_ACARA: 'Berita Acara',
  NOTULA: 'Notula Rapat',
  LAPORAN: 'Laporan',
  LAINNYA: 'Lainnya',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  DRAFT: 'Draft',
  RECEIVED: 'Diterima',
  IN_REVIEW: 'Dalam Tinjauan',
  FINAL: 'Final',
  ARCHIVED: 'Diarsipkan',
  CANCELLED: 'Dibatalkan',
};

export const VALID_DOCUMENT_DIRECTIONS = new Set(['INCOMING', 'OUTGOING']);
export const VALID_DOCUMENT_STATUSES = new Set<DocumentStatus>([
  'DRAFT',
  'RECEIVED',
  'IN_REVIEW',
  'FINAL',
  'ARCHIVED',
  'CANCELLED',
]);
export const VALID_DOCUMENT_KINDS = new Set<DocumentKind>([
  'SURAT_MASUK',
  'SURAT_KELUAR',
  'SK',
  'SURAT_TUGAS',
  'UNDANGAN',
  'SURAT_KETERANGAN',
  'BERITA_ACARA',
  'NOTULA',
  'LAPORAN',
  'LAINNYA',
]);

export const DEFAULT_CORRESPONDENCE_FILTERS: CorrespondenceFilterState = {
  tab: 'ALL',
  searchQuery: '',
  directionFilter: 'ALL',
  statusFilter: 'ALL',
  yearFilter: 'ALL',
  dateFrom: '',
  dateTo: '',
  counterpartQuery: '',
};

/**
 * Menghitung statistik aktual untuk 4 kartu S01 berdasarkan koleksi metadata nyata.
 * Setiap kartu menjaga agar id dokumen yang sama tidak pernah dihitung ganda di dalam kartu tersebut.
 * Catatan lintas kartu yang disengaja:
 * - Dokumen OUTGOING berstatus DRAFT terhitung pada Surat Keluar dan Draft.
 * - Dokumen berstatus ARCHIVED tetap dihitung sesuai direction asalnya sekaligus masuk kartu Arsip.
 */
export function computeCorrespondenceStats(documents: DocumentRecord[]): CorrespondenceStats {
  const incomingIds = new Set<string>();
  const outgoingIds = new Set<string>();
  const draftIds = new Set<string>();
  const archivedIds = new Set<string>();
  const totalIds = new Set<string>();

  for (const doc of documents) {
    if (!doc || !doc.id || totalIds.has(doc.id)) continue;
    totalIds.add(doc.id);

    if (doc.direction === 'INCOMING') incomingIds.add(doc.id);
    if (doc.direction === 'OUTGOING') outgoingIds.add(doc.id);
    if (doc.status === 'DRAFT') draftIds.add(doc.id);
    if (doc.status === 'ARCHIVED') archivedIds.add(doc.id);
  }

  return {
    incoming: incomingIds.size,
    outgoing: outgoingIds.size,
    draft: draftIds.size,
    archived: archivedIds.size,
    total: totalIds.size,
  };
}

export function extractDocumentYear(documentDate: string): string | null {
  if (typeof documentDate !== 'string') return null;
  const match = /^(\d{4})-\d{2}-\d{2}$/.exec(documentDate.trim());
  return match ? match[1] : null;
}

export function collectAvailableYears(documents: DocumentRecord[]): string[] {
  const years = new Set<string>();
  for (const doc of documents) {
    const year = extractDocumentYear(doc.documentDate);
    if (year) years.add(year);
  }
  return Array.from(years).sort((a, b) => b.localeCompare(a));
}

export function getRelatedTeacherNames(
  teacherIds: string[] | undefined,
  teachers: Teacher[]
): string[] {
  if (!Array.isArray(teacherIds) || teacherIds.length === 0) return [];
  const map = new Map(teachers.map((t) => [t.id, t.name]));
  const names: string[] = [];
  for (const id of teacherIds) {
    const name = map.get(id);
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

export function filterCorrespondenceDocuments(
  documents: DocumentRecord[],
  filters: CorrespondenceFilterState,
  teachers: Teacher[]
): DocumentRecord[] {
  const q = filters.searchQuery.trim().toLowerCase();
  const cpQ = filters.counterpartQuery.trim().toLowerCase();
  const teacherById = new Map(teachers.map((t) => [t.id, t]));

  return documents.filter((doc) => {
    // 1. Tab filter
    if (filters.tab === 'INCOMING' && doc.direction !== 'INCOMING') return false;
    if (filters.tab === 'OUTGOING' && doc.direction !== 'OUTGOING') return false;
    if (filters.tab === 'ARCHIVED' && doc.status !== 'ARCHIVED') return false;

    // 2. Explicit direction filter
    if (filters.directionFilter !== 'ALL' && doc.direction !== filters.directionFilter) {
      return false;
    }

    // 3. Status filter
    if (filters.statusFilter !== 'ALL' && doc.status !== filters.statusFilter) {
      return false;
    }

    // 4. Year filter
    if (filters.yearFilter !== 'ALL') {
      const year = extractDocumentYear(doc.documentDate);
      if (year !== filters.yearFilter) return false;
    }

    // 5. Date range filter
    if (filters.dateFrom && doc.documentDate < filters.dateFrom) return false;
    if (filters.dateTo && doc.documentDate > filters.dateTo) return false;

    // 6. Counterpart filter
    if (cpQ) {
      const counterpartText = (doc.counterpartName ?? '').toLowerCase();
      if (!counterpartText.includes(cpQ)) return false;
    }

    // 7. Search query across nomor, ID, judul, perihal, pihak terkait, tags, dan nama guru (tanpa NIP)
    if (q) {
      const teacherNames = (doc.relatedTeacherIds ?? [])
        .map((id) => teacherById.get(id)?.name ?? '')
        .filter(Boolean)
        .join(' ');

      const haystack = [
        doc.documentNumber ?? '',
        doc.id,
        doc.title,
        doc.subject,
        doc.counterpartName ?? '',
        (doc.tags ?? []).join(' '),
        teacherNames,
      ]
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

const STATUS_SORT_ORDER: Record<DocumentStatus, number> = {
  DRAFT: 1,
  RECEIVED: 2,
  IN_REVIEW: 3,
  FINAL: 4,
  ARCHIVED: 5,
  CANCELLED: 6,
};

export function sortCorrespondenceDocuments(
  documents: DocumentRecord[],
  sortKey: CorrespondenceSortKey,
  direction: SortDirection
): DocumentRecord[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...documents].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'documentNumber': {
        const numA = (a.documentNumber ?? a.id).toLowerCase();
        const numB = (b.documentNumber ?? b.id).toLowerCase();
        cmp = numA.localeCompare(numB, 'id');
        break;
      }
      case 'title':
        cmp = a.title.localeCompare(b.title, 'id');
        break;
      case 'documentType':
        cmp = DOCUMENT_KIND_LABELS[a.documentType].localeCompare(
          DOCUMENT_KIND_LABELS[b.documentType],
          'id'
        );
        break;
      case 'status':
        cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
        break;
      case 'documentDate':
      default:
        cmp = a.documentDate.localeCompare(b.documentDate);
        if (cmp === 0) {
          cmp = a.updatedAt.localeCompare(b.updatedAt);
        }
        break;
    }
    if (cmp === 0) {
      return a.id.localeCompare(b.id) * factor;
    }
    return cmp * factor;
  });
}

export function paginateCorrespondenceDocuments<T>(
  items: T[],
  page: number,
  pageSize: number
): {
  rows: T[];
  totalItems: number;
  totalPages: number;
  currentPage: number;
  startIndex: number;
  endIndex: number;
} {
  const safePageSize = pageSize > 0 ? pageSize : 10;
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const startZero = (currentPage - 1) * safePageSize;
  const rows = items.slice(startZero, startZero + safePageSize);
  const startIndex = totalItems === 0 ? 0 : startZero + 1;
  const endIndex = startZero + rows.length;

  return {
    rows,
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex,
  };
}

export function formatIndonesianDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '—';
  const [y, m, d] = isoDate.split('-').map(Number);
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
    'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
  ];
  return `${String(d).padStart(2, '0')} ${months[(m - 1) % 12]} ${y}`;
}
