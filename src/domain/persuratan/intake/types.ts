import type {
  DocumentIntakeDraft,
  DocumentRecord,
  FieldProvenance,
  SourceSnapshotEntry,
} from '../types';
import type { DocumentTemplate } from '../templates/types';

export type IntakeControlType =
  | 'teacher_multi_select'
  | 'teacher_single_select'
  | 'class_single_select'
  | 'subject_single_select'
  | 'schedule_version'
  | 'date_range'
  | 'date'
  | 'number'
  | 'select'
  | 'textarea'
  | 'text'
  | 'auto_system';

export interface IntakeControlDefinition {
  key: string;
  label: string;
  controlType: IntakeControlType;
  provenance: FieldProvenance;
  required: boolean;
  placeholder?: string;
  helperText?: string;
  sourceHint?: string;
  options?: Array<{ value: string; label: string }>;
  autoSourceKey?: 'kop_madrasah' | 'schedule_workload';
  startKey?: string;
  endKey?: string;
  startLabel?: string;
  endLabel?: string;
  minItems?: number;
}

export interface IntakeTemplateSchema {
  baseTemplateId: string;
  templateId: string;
  templateName: string;
  supportsAttachmentNotice: boolean;
  attachmentNoticeText?: string;
  controls: IntakeControlDefinition[];
}

export interface ResolvedKopSystemData {
  schoolName: string;
  ministry: string;
  regionalOffice: string;
  legalDecree?: string;
  accreditation?: string;
  nsm?: string;
  npsn?: string;
  address: string;
  city: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
  kopMode?: 'structured' | 'image';
  kopImageUrl?: string;
  academicYear: string;
  semester: string;
  signatoryTitle: string;
  signatoryName: string;
  signatoryNip: string;
  hasSchoolIdentity: boolean;
  hasSignatory: boolean;
  isComplete: boolean;
  isDemoData: boolean;
}

export interface ScheduleWorkloadSnapshotItem {
  teacherId: string;
  teacherName: string;
  totalJP: number;
  classesCount: number;
}

export interface ResolvedScheduleVersionSummary {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  academicYearText: string;
  semesterText: string;
  fingerprint: string;
  entryCount: number;
  isValidForOfficialUse: boolean;
  teacherWorkloads: ScheduleWorkloadSnapshotItem[];
}

export interface ResolvedSystemAutoData {
  kop: ResolvedKopSystemData;
  verifiedScheduleVersions: ResolvedScheduleVersionSummary[];
  invalidScheduleVersionCount: number;
  hasLooseActiveScheduleWithoutVersion: boolean;
  hasUnpublishedDraft: boolean;
  activeTeachersCount: number;
  inactiveTeachersCount: number;
  activeAssignmentsCount: number;
  isDemoData: boolean;
}

export interface IntakeFormValues {
  documentTitle?: string;
  documentDate?: string;
  [key: string]: unknown;
}

export interface IntakeValidationError {
  fieldKey: string;
  fieldId: string;
  label: string;
  message: string;
}

export interface IntakeValidationResult {
  valid: boolean;
  errors: IntakeValidationError[];
  fieldErrors: Record<string, string>;
  resolvedAutoData: ResolvedSystemAutoData;
}

export interface SaveIntakeDraftResult {
  state: import('../../types').AppState;
  draft: DocumentIntakeDraft;
  documentRecord: DocumentRecord;
  isUpdate: boolean;
  template: DocumentTemplate;
  sourceSnapshots: SourceSnapshotEntry[];
}
