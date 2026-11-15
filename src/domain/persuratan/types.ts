export type DocumentDirection = 'INCOMING' | 'OUTGOING';

export type DocumentStatus =
  | 'DRAFT'
  | 'RECEIVED'
  | 'IN_REVIEW'
  | 'FINAL'
  | 'ARCHIVED'
  | 'CANCELLED';

export type DocumentKind =
  | 'SURAT_MASUK'
  | 'SURAT_KELUAR'
  | 'SK'
  | 'SURAT_TUGAS'
  | 'UNDANGAN'
  | 'SURAT_KETERANGAN'
  | 'BERITA_ACARA'
  | 'NOTULA'
  | 'LAPORAN'
  | 'LAINNYA';

/**
 * Metadata minimum dokumen persuratan & arsip untuk S01.
 * Konten rich-text, DocumentVersion, template body, dan Blob lampiran
 * sengaja belum disimpan di tahap ini (akan ditangani pada Tahap 3–10).
 */
export interface DocumentRecord {
  id: string;
  direction: DocumentDirection;
  documentType: DocumentKind;
  documentNumber: string | null;
  title: string;
  subject: string;
  documentDate: string; // Format ISO 'YYYY-MM-DD'
  counterpartName?: string;
  status: DocumentStatus;
  relatedTeacherIds?: string[];
  tags?: string[];
  createdAt: string; // ISO 8601 timestamp
  updatedAt: string; // ISO 8601 timestamp
  archivedAt: string | null;
}

export type CorrespondenceTab = 'ALL' | 'INCOMING' | 'OUTGOING' | 'ARCHIVED';

export type CorrespondenceSortKey =
  | 'documentNumber'
  | 'title'
  | 'documentType'
  | 'documentDate'
  | 'status';

export type SortDirection = 'asc' | 'desc';

export interface CorrespondenceFilterState {
  tab: CorrespondenceTab;
  searchQuery: string;
  directionFilter: 'ALL' | DocumentDirection;
  statusFilter: 'ALL' | DocumentStatus;
  yearFilter: 'ALL' | string;
  dateFrom: string;
  dateTo: string;
  counterpartQuery: string;
}

export interface CorrespondenceStats {
  /** Seluruh dokumen dengan direction === 'INCOMING'. */
  incoming: number;
  /** Seluruh dokumen dengan direction === 'OUTGOING'. */
  outgoing: number;
  /** Seluruh dokumen dengan status === 'DRAFT'. */
  draft: number;
  /** Seluruh dokumen dengan status === 'ARCHIVED'. */
  archived: number;
  /** Total unik seluruh dokumen dalam koleksi. */
  total: number;
}
