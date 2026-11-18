import type {
  DocumentAttachmentMeta,
  DocumentIntakeDraft,
  DocumentNumberingConfig,
  DocumentRecord,
  DocumentVersion,
} from './persuratan/types';
import type { DocumentTemplate, TemplatePreferences } from './persuratan/templates/types';

export const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'] as const;
export type Day = (typeof DAYS)[number];
export type SlotKind = 'TEACHING' | 'BREAK';
export type ActivityType = 'KBM' | 'UPACARA' | 'ISTIRAHAT' | 'RELIGI' | 'LAINNYA';

export interface SchoolClass {
  id: string;
  name: string;
  level: string;
  isActive: boolean;
}

export interface Teacher {
  id: string;
  code: string;
  name: string;
  subjectIds: string[];
  maxWeeklyJP: number;
  isActive: boolean;
  roleTitle?: string; // Jabatan guru (isi manual, misal: Waka Kurikulum, Guru Mapel, Guru BK, dll)
  nip?: string; // NIP / NPK / NUPTK
  gender?: 'male' | 'female'; // Gender identitas avatar madrasah (male: asatidz/peci, female: ustadzah/jilbab)
  availableDays?: Day[]; // Hari kesiapan mengajar
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  color: string;
  isActive: boolean;
}

export interface Requirement {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  requiredJP: number;
}

export interface PeriodDefinition {
  order: number;
  start: string;
  end: string;
  activityType: ActivityType;
  activityName?: string;
  applicableDays?: Day[];
}

export interface TimeSlot {
  id: string;
  day: Day;
  order: number;
  kind: SlotKind;
  activityType?: ActivityType;
  activityName?: string;
  jpNo?: number;
  label: string;
  start: string;
  end: string;
  active: boolean;
}

export interface ScheduleEntry {
  id: string;
  classId: string;
  subjectId: string;
  teacherId: string;
  day: Day;
  jpNo: number;
}

export type GeneratorStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'INFEASIBLE'
  | 'SEARCH_LIMIT_REACHED'
  | 'INVALID_INPUT'
  | 'CANCELLED'
  | 'FAILED';

export interface ValidationIssue {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  message: string;
  context?: string;
  action?: string;
}

export interface ValidationReport {
  valid: boolean;
  issues: ValidationIssue[];
  hardErrorCount: number;
  warningCount: number;
}

export interface ScheduleCandidate {
  id: string;
  createdAt: string;
  seed: number;
  entries: ScheduleEntry[];
  report: ValidationReport;
  score: number;
  label: string;
  searchNodes: number;
}

export interface ScheduleVersion {
  id: string;
  version: number;
  createdAt: string;
  label: string;
  entryCount: number;
  entries: ScheduleEntry[];
  fingerprint: string;
  validatorVersion: string;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap';
}

export interface AppSettings {
  schoolName: string;
  academicYear: string;
  semester: 'Ganjil' | 'Genap';
  periodMinutes: number; // e.g. 40 minutes per JP
  maxDailyJP: number;
  teachingPeriodsPerDay: number;
  activeDays: Day[];
  breakAfterJP: number[];
  periodDefinitions?: PeriodDefinition[];
  searchLimit: number;
  geminiEnabled: boolean;

  // Identitas Madrasah Lengkap & Terintegrasi Dokumen Resmi:
  ministry?: string; // Kementerian yang menaungi (e.g. "KEMENTERIAN AGAMA REPUBLIK INDONESIA")
  regionalOffice?: string; // Kantor Wilayah / Kankemenag Kab/Kota
  address?: string; // Alamat lengkap jalan & nomor
  city?: string; // Kabupaten / Kota
  postalCode?: string; // Kode Pos
  npsn?: string; // Nomor Pokok Sekolah Nasional (8 digit)
  nsm?: string; // Nomor Statistik Madrasah (12 digit)
  phone?: string; // No yang bisa dihubungi / WhatsApp / Telepon
  email?: string; // Email resmi madrasah
  website?: string; // Situs web resmi madrasah
  logoUrl?: string; // Data URL logo resmi madrasah (PNG base64)
  headmasterName?: string; // Nama Kepala Madrasah
  headmasterNip?: string; // NIP / NPK Kepala Madrasah
  headmasterTitle?: string; // Jabatan Kepala Madrasah (default: "Kepala Madrasah")
  curriculumLeaderName?: string; // Nama Waka Kurikulum / Koordinator
  curriculumLeaderNip?: string; // NIP Waka Kurikulum
  curriculumLeaderTitle?: string; // Jabatan Koordinator (default: "Waka Bidang Kurikulum")
  documentNumbering?: DocumentNumberingConfig; // Aturan penomoran surat resmi otomatis (Tahap 8)
}

export type AttendanceStatus = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPA' | 'DINAS_LUAR';

export interface AttendanceRecord {
  id: string;
  date: string; // 'YYYY-MM-DD'
  teacherId: string;
  status: AttendanceStatus;
  notes?: string;
  recordedAt: string;
}

export interface Holiday {
  id: string;
  date: string; // 'YYYY-MM-DD'
  name: string;
  isRecurringYearly?: boolean;
}

export type TeacherAssignmentType =
  | 'TEACHING'
  | 'HOMEROOM'
  | 'ADDITIONAL_DUTY'
  | 'COMMITTEE'
  | 'COORDINATOR'
  | 'TRAINING'
  | 'OTHER';

export type TeacherAssignmentStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export type TeacherAssignmentSource =
  | 'LEGACY_MIGRATION'
  | 'MANUAL'
  | 'PUBLISHED_SCHEDULE'
  | 'IMPORTED';

export interface TeacherAssignment {
  id: string;
  teacherId: string;
  assignmentType: TeacherAssignmentType;
  title: string;
  description?: string;
  startDate: string | null; // 'YYYY-MM-DD' or null when legacy/unknown
  endDate: string | null; // 'YYYY-MM-DD' or null when ongoing/unknown
  isDateUnknown?: boolean;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap' | null;
  classId?: string | null;
  subjectIds?: string[];
  weeklyJP?: number | null;
  status: TeacherAssignmentStatus;
  sourceType: TeacherAssignmentSource;
  sourceScheduleVersionId?: string | null;
  documentId?: string | null;
  legacyRoleTitle?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  entityType: 'WORKSPACE' | 'SNAPSHOT' | 'TEACHER_ASSIGNMENT' | 'BACKUP' | 'SYSTEM';
  entityId: string;
  action: string;
  actor: string;
  timestamp: string;
  summary: string;
  previousChecksum?: string;
  newChecksum?: string;
}

export interface AppState {
  schemaVersion: number;
  dataMode: 'demo' | 'custom';
  settings: AppSettings;
  classes: SchoolClass[];
  teachers: Teacher[];
  subjects: Subject[];
  requirements: Requirement[];
  slots: TimeSlot[];
  draft: ScheduleEntry[] | null;
  activeSchedule: ScheduleEntry[] | null;
  candidates: ScheduleCandidate[];
  history: ScheduleVersion[];
  lastBackupAt: string | null;
  attendance?: AttendanceRecord[];
  holidays?: Holiday[];
  teacherAssignments?: TeacherAssignment[];
  documents?: DocumentRecord[];
  documentVersions?: DocumentVersion[];
  documentAttachments?: DocumentAttachmentMeta[];
  intakeDrafts?: DocumentIntakeDraft[];
  customTemplates?: DocumentTemplate[];
  templatePreferences?: TemplatePreferences;
}

export interface GenerateResult {
  status: GeneratorStatus;
  candidate?: ScheduleCandidate;
  nodes: number;
  message: string;
}
