import type { TemplatePreviewBlock } from './templates/types';
import type { DocumentStudioState } from './studio/types';

export type {
  DocumentStudioEditorStatus,
  DocumentStudioPageSettings,
  DocumentStudioState,
  LegacyTemplateResolution,
  PlaceholderMappingReport,
  StudioInitialContentResult,
  StudioMarginsMm,
  StudioOrientation,
  StudioPaperSize,
  TipTapJSONContent,
  TipTapJSONMark,
  TipTapJSONNode,
} from './studio/types';

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
 * Metadata dokumen persuratan & arsip untuk S01 dan rujukan intake S03/S04.
 * DocumentVersion dan Blob lampiran ditangani pada Tahap 6–10.
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
  // Rujukan opsional hasil Context Form S03 (Tahap 4) & Document Studio S04 (Tahap 5)
  intakeDraftId?: string | null;
  templateId?: string | null;
  templateVersion?: string | null;
  scheduleVersionId?: string | null;
}

export type DocumentIntakeStatus = 'INTAKE_COMPLETE' | 'READY_FOR_EDITOR';

export type FieldProvenance = 'OPERATOR_INPUT' | 'AUTO_SYSTEM';

export interface SourceSnapshotEntry {
  sourceKey: string;
  sourceLabel: string;
  provenance: FieldProvenance;
  sourceIdentity?: string | null;
  capturedValue: unknown;
  capturedAt: string;
  isDemoData: boolean;
  status: 'VERIFIED' | 'MISSING' | 'UNVERIFIED';
}

export interface TemplateSnapshot {
  templateId: string;
  code: string;
  name: string;
  category: string;
  documentKind: DocumentKind;
  version: string;
  source: 'SYSTEM' | 'MADRASAH' | 'USER';
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: string | null;
  initialPageSettings: {
    paperSize: 'a4' | 'f4';
    orientation: 'portrait' | 'landscape';
    marginsMm: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
  };
  documentHeader: {
    includeKopSurat: boolean;
    title: string;
    numberPlaceholder: string;
  };
  previewBlocks?: TemplatePreviewBlock[];
  capturedAt: string;
}

export interface DocumentIntakeDraft {
  id: string;
  documentId: string;
  templateId: string;
  templateVersion: string;
  intakeStatus: DocumentIntakeStatus;
  title: string;
  subject: string;
  documentDate: string; // 'YYYY-MM-DD'
  counterpartName?: string;
  relatedTeacherIds: string[];
  scheduleVersionId?: string | null;
  scheduleVersionFingerprint?: string | null;
  fieldValues: Record<string, unknown>;
  fieldProvenance: Record<string, FieldProvenance>;
  templateSnapshot: TemplateSnapshot;
  sourceSnapshots: SourceSnapshotEntry[];
  studio?: DocumentStudioState;
  s03EditedAfterStudioAt?: string | null;
  createdAt: string;
  updatedAt: string;
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
