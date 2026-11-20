import type { DocumentTemplate, TemplatePreviewBlock } from '../templates/types';

export type DocumentStudioEditorStatus = 'NOT_STARTED' | 'IN_PROGRESS';

export type StudioPaperSize = 'a4' | 'f4';
export type StudioOrientation = 'portrait' | 'landscape';

export interface StudioMarginsMm {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type StudioPageNumberFormat = 'HALAMAN_DARI_TOTAL' | 'HALAMAN_SAJA';

export interface DocumentStudioPageSettings {
  paperSize: StudioPaperSize;
  orientation: StudioOrientation;
  marginsMm: StudioMarginsMm;
  headerText?: string;
  footerText?: string;
  showPageNumbers?: boolean;
  pageNumberFormat?: StudioPageNumberFormat;
  repeatTableHeader?: boolean;
}

export interface TipTapJSONMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapJSONNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: TipTapJSONMark[];
  content?: TipTapJSONNode[];
}

export interface TipTapJSONContent {
  type: 'doc';
  content: TipTapJSONNode[];
}

export interface DocumentStudioState {
  schemaVersion: 1;
  editorStatus: DocumentStudioEditorStatus;
  content: TipTapJSONContent;
  pageSettings: DocumentStudioPageSettings;
  updatedAt: string;
}

export interface PlaceholderMappingReport {
  resolvedTokens: string[];
  unresolvedTokens: string[];
}

export type LegacyTemplateResolutionStatus =
  | 'FROZEN_SNAPSHOT'
  | 'ACTIVE_MATCH'
  | 'VERSION_MISMATCH'
  | 'NOT_FOUND';

export interface LegacyTemplateResolution {
  status: LegacyTemplateResolutionStatus;
  previewBlocks: TemplatePreviewBlock[];
  templateName: string;
  snapshotVersion: string;
  activeVersion?: string | null;
  matchedTemplate?: DocumentTemplate | null;
  requiresConfirmation: boolean;
  notice?: string;
}

export interface StudioInitialContentResult {
  content: TipTapJSONContent;
  pageSettings: DocumentStudioPageSettings;
  placeholderReport: PlaceholderMappingReport;
  resolution: LegacyTemplateResolution;
  includeKopSurat: boolean;
}

export const PAPER_DIMENSIONS_MM: Record<
  StudioPaperSize,
  { widthMm: number; heightMm: number; label: string }
> = {
  a4: { widthMm: 210, heightMm: 297, label: 'A4 (210 × 297 mm)' },
  f4: { widthMm: 215, heightMm: 330, label: 'F4 / Folio (215 × 330 mm)' },
};

export const STUDIO_MARGIN_MIN_MM = 5;
export const STUDIO_MARGIN_MAX_MM = 50;
