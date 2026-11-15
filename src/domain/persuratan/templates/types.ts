import type { DocumentKind } from '../types';

export type TemplateCategory =
  | 'PENUGASAN'
  | 'KORESPONDENSI'
  | 'KETERANGAN'
  | 'BERITA_ACARA'
  | 'NOTULA_LAPORAN'
  | 'ADMINISTRASI';

export type TemplateCollection =
  | 'ALL'
  | 'FAVORITES'
  | 'RECENT'
  | 'MADRASAH'
  | 'SYSTEM';

export type TemplateSource = 'SYSTEM' | 'MADRASAH' | 'USER';

export type TemplateStatus = 'ACTIVE' | 'ARCHIVED';

export type TemplatePaperSize = 'a4' | 'f4';

export type TemplateOrientation = 'portrait' | 'landscape';

export interface TemplatePageSettings {
  paperSize: TemplatePaperSize;
  orientation: TemplateOrientation;
  marginsMm: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
}

export interface TemplateFieldDefinition {
  key: string;
  label: string;
  kind: 'AUTO_SYSTEM' | 'OPERATOR_INPUT';
  required: boolean;
  sourceHint?: string;
}

export type TemplatePreviewBlock =
  | {
      type: 'heading';
      text: string;
      align?: 'left' | 'center';
    }
  | {
      type: 'meta_grid';
      rows: Array<{ label: string; value: string }>;
    }
  | {
      type: 'paragraph';
      text: string;
    }
  | {
      type: 'list';
      ordered?: boolean;
      items: string[];
    }
  | {
      type: 'table';
      columns: string[];
      sampleRows: string[][];
    }
  | {
      type: 'signature';
      leftTitle?: string;
      leftName?: string;
      rightTitle: string;
      rightName: string;
      rightIdLabel?: string;
    };

export interface DocumentTemplate {
  id: string;
  code: string;
  catalogOrder: number;
  name: string;
  category: TemplateCategory;
  description: string;
  purpose: string;
  documentKind: DocumentKind;
  version: string;
  status: TemplateStatus;
  source: TemplateSource;
  isReadOnly: boolean;
  sourceTemplateId?: string | null;
  sourceTemplateVersion?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  autoDataSources: string[];
  requiredInputs: string[];
  fields: TemplateFieldDefinition[];
  initialPageSettings: TemplatePageSettings;
  documentHeader: {
    includeKopSurat: boolean;
    title: string;
    numberPlaceholder: string;
  };
  previewBlocks: TemplatePreviewBlock[];
  legalNotice?: string;
}

export interface RecentTemplateUsage {
  templateId: string;
  usedAt: string;
}

export interface TemplatePreferences {
  favoriteTemplateIds: string[];
  recentTemplates: RecentTemplateUsage[];
  selectedTemplateId: string | null;
}

export interface TemplateFilterCriteria {
  category: 'ALL' | TemplateCategory;
  collection: TemplateCollection;
  searchQuery: string;
}

export interface CategoryMetadata {
  id: TemplateCategory;
  label: string;
  shortLabel: string;
  description: string;
}
