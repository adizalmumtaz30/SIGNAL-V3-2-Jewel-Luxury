import type {
  AppState,
  Teacher,
  TeacherAssignment,
  TeacherAssignmentSource,
  TeacherAssignmentStatus,
  TeacherAssignmentType,
} from './types';

export interface TeacherAssignmentValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const GENERIC_ROLE_LABELS = new Set([
  '',
  'guru',
  'guru mapel',
  'guru mata pelajaran',
  'pengajar',
  'tenaga pendidik',
  'pendidik',
]);

const VALID_ASSIGNMENT_TYPES = new Set<TeacherAssignmentType>([
  'TEACHING',
  'HOMEROOM',
  'ADDITIONAL_DUTY',
  'COMMITTEE',
  'COORDINATOR',
  'TRAINING',
  'OTHER',
]);

const VALID_ASSIGNMENT_STATUSES = new Set<TeacherAssignmentStatus>([
  'DRAFT',
  'ACTIVE',
  'COMPLETED',
  'CANCELLED',
]);

const VALID_ASSIGNMENT_SOURCES = new Set<TeacherAssignmentSource>([
  'LEGACY_MIGRATION',
  'MANUAL',
  'PUBLISHED_SCHEDULE',
  'IMPORTED',
]);

export function normalizeRoleText(value: string | undefined | null): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isGenericRoleTitle(roleTitle: string | undefined | null): boolean {
  const normalized = normalizeRoleText(roleTitle);
  return GENERIC_ROLE_LABELS.has(normalized);
}

export function isValidIsoDate(value: string | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function inferAssignmentTypeFromTitle(title: string): TeacherAssignmentType {
  const lower = normalizeRoleText(title);
  if (!lower) return 'OTHER';
  if (lower.includes('wali kelas')) return 'HOMEROOM';
  if (lower.includes('panitia') || lower.includes('tim ')) return 'COMMITTEE';
  if (lower.includes('diklat') || lower.includes('pelatihan') || lower.includes('workshop')) return 'TRAINING';
  if (lower.includes('koordinator')) return 'COORDINATOR';
  if (
    lower.includes('waka') ||
    lower.includes('wakil kepala') ||
    lower.includes('kepala ') ||
    lower.includes('pembina') ||
    lower.includes('guru bk') ||
    lower.includes('bimbingan konseling') ||
    lower.includes('bendahara') ||
    lower.includes('sekretaris')
  ) {
    return 'ADDITIONAL_DUTY';
  }
  if (lower.includes('guru mapel') || lower.includes('guru mata pelajaran') || lower.includes('mengajar')) {
    return 'TEACHING';
  }
  return 'OTHER';
}

export function validateTeacherAssignment(
  assignment: TeacherAssignment,
  teachers: Teacher[],
  existingAssignments: TeacherAssignment[] = []
): TeacherAssignmentValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!assignment || typeof assignment !== 'object') {
    return { valid: false, errors: ['Objek penugasan guru tidak valid.'], warnings: [] };
  }

  if (typeof assignment.id !== 'string' || !assignment.id.trim()) {
    errors.push('ID penugasan guru wajib diisi.');
  }

  if (typeof assignment.teacherId !== 'string' || !assignment.teacherId.trim()) {
    errors.push('ID guru pada penugasan wajib diisi.');
  } else {
    const teacher = teachers.find((t) => t.id === assignment.teacherId);
    if (!teacher) {
      errors.push('Guru terkait tidak ditemukan dalam Data Master.');
    } else if (!teacher.isActive && assignment.status === 'ACTIVE') {
      warnings.push('Guru berstatus nonaktif, namun penugasan masih bertanda ACTIVE.');
    }
  }

  if (typeof assignment.title !== 'string' || !assignment.title.trim()) {
    errors.push('Judul atau nama jabatan penugasan wajib diisi.');
  }

  if (!VALID_ASSIGNMENT_TYPES.has(assignment.assignmentType)) {
    errors.push('Jenis penugasan guru tidak dikenali.');
  }

  if (!VALID_ASSIGNMENT_STATUSES.has(assignment.status)) {
    errors.push('Status penugasan guru tidak valid.');
  }

  if (!VALID_ASSIGNMENT_SOURCES.has(assignment.sourceType)) {
    errors.push('Sumber penugasan guru tidak valid.');
  }

  if (assignment.startDate !== null && !isValidIsoDate(assignment.startDate)) {
    errors.push('Format tanggal mulai penugasan tidak valid (gunakan YYYY-MM-DD atau null).');
  }

  if (assignment.endDate !== null && !isValidIsoDate(assignment.endDate)) {
    errors.push('Format tanggal selesai penugasan tidak valid (gunakan YYYY-MM-DD atau null).');
  }

  if (
    assignment.startDate &&
    assignment.endDate &&
    isValidIsoDate(assignment.startDate) &&
    isValidIsoDate(assignment.endDate) &&
    assignment.endDate < assignment.startDate
  ) {
    errors.push('Tanggal selesai penugasan tidak boleh lebih awal dari tanggal mulai.');
  }

  if (assignment.weeklyJP !== undefined && assignment.weeklyJP !== null) {
    if (typeof assignment.weeklyJP !== 'number' || !Number.isFinite(assignment.weeklyJP) || assignment.weeklyJP < 0) {
      errors.push('Beban JP mingguan pada penugasan harus berupa angka nol atau positif.');
    }
  }

  if (assignment.startDate && assignment.status === 'ACTIVE') {
    const overlapping = existingAssignments.some(
      (other) =>
        other.id !== assignment.id &&
        other.teacherId === assignment.teacherId &&
        other.status === 'ACTIVE' &&
        normalizeRoleText(other.title) === normalizeRoleText(assignment.title) &&
        datesOverlap(other.startDate, other.endDate, assignment.startDate, assignment.endDate)
    );
    if (overlapping) {
      warnings.push('Guru ini memiliki penugasan aktif lain dengan judul sama pada rentang tanggal yang beririsan.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function datesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  if (!aStart || !bStart) return true;
  const effAEnd = aEnd ?? '9999-12-31';
  const effBEnd = bEnd ?? '9999-12-31';
  return aStart <= effBEnd && bStart <= effAEnd;
}

export function normalizeTeacherAssignment(
  raw: Partial<TeacherAssignment> & Pick<TeacherAssignment, 'id' | 'teacherId' | 'title'>,
  fallbackTimestamp: string = new Date().toISOString()
): TeacherAssignment {
  const title = raw.title.trim();
  const startDate = raw.startDate === undefined ? null : raw.startDate;
  const endDate = raw.endDate === undefined ? null : raw.endDate;
  const isDateUnknown = raw.isDateUnknown ?? (startDate === null && endDate === null);
  const createdAt = typeof raw.createdAt === 'string' && raw.createdAt ? raw.createdAt : fallbackTimestamp;
  const updatedAt = typeof raw.updatedAt === 'string' && raw.updatedAt ? raw.updatedAt : createdAt;

  return {
    id: raw.id.trim(),
    teacherId: raw.teacherId.trim(),
    assignmentType:
      raw.assignmentType && VALID_ASSIGNMENT_TYPES.has(raw.assignmentType)
        ? raw.assignmentType
        : inferAssignmentTypeFromTitle(title),
    title,
    ...(raw.description ? { description: raw.description } : {}),
    startDate,
    endDate,
    isDateUnknown,
    ...(raw.academicYear ? { academicYear: raw.academicYear } : {}),
    ...(raw.semester !== undefined ? { semester: raw.semester } : {}),
    ...(raw.classId !== undefined ? { classId: raw.classId } : {}),
    ...(Array.isArray(raw.subjectIds) ? { subjectIds: [...raw.subjectIds] } : {}),
    ...(raw.weeklyJP !== undefined ? { weeklyJP: raw.weeklyJP } : {}),
    status:
      raw.status && VALID_ASSIGNMENT_STATUSES.has(raw.status)
        ? raw.status
        : 'ACTIVE',
    sourceType:
      raw.sourceType && VALID_ASSIGNMENT_SOURCES.has(raw.sourceType)
        ? raw.sourceType
        : 'MANUAL',
    ...(raw.sourceScheduleVersionId !== undefined
      ? { sourceScheduleVersionId: raw.sourceScheduleVersionId }
      : {}),
    ...(raw.documentId !== undefined ? { documentId: raw.documentId } : {}),
    ...(raw.legacyRoleTitle ? { legacyRoleTitle: raw.legacyRoleTitle } : {}),
    ...(raw.notes ? { notes: raw.notes } : {}),
    createdAt,
    updatedAt,
  };
}

/**
 * Non-destructive & idempotent migration from legacy Teacher.roleTitle into TeacherAssignment[].
 * - Generic roles like "Guru Mapel" are NOT promoted as structural/additional assignments.
 * - Explicit non-generic roles become TeacherAssignment records with startDate: null, endDate: null, isDateUnknown: true.
 * - Existing Teacher.roleTitle values are preserved untouched for legacy tables/PDFs.
 */
export function migrateLegacyRoleTitlesToAssignments(
  state: AppState,
  timestamp: string = new Date().toISOString()
): TeacherAssignment[] {
  const existingRaw = Array.isArray(state.teacherAssignments) ? state.teacherAssignments : [];
  const result: TeacherAssignment[] = [];
  const seenIds = new Set<string>();

  for (const item of existingRaw) {
    if (!item || typeof item !== 'object') continue;
    if (typeof item.id !== 'string' || !item.id.trim()) continue;
    if (typeof item.teacherId !== 'string' || !item.teacherId.trim()) continue;
    if (typeof item.title !== 'string' || !item.title.trim()) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    result.push(normalizeTeacherAssignment(item, timestamp));
  }

  for (const teacher of state.teachers ?? []) {
    if (!teacher || !teacher.id) continue;
    const rawRole = typeof teacher.roleTitle === 'string' ? teacher.roleTitle.trim() : '';
    if (!rawRole || isGenericRoleTitle(rawRole)) continue;

    const deterministicId = `TA-LEGACY-${teacher.id}`;
    if (seenIds.has(deterministicId)) continue;

    const alreadyHasMatching = result.some(
      (a) =>
        a.teacherId === teacher.id &&
        (a.legacyRoleTitle === rawRole || normalizeRoleText(a.title) === normalizeRoleText(rawRole))
    );
    if (alreadyHasMatching) continue;

    seenIds.add(deterministicId);
    result.push({
      id: deterministicId,
      teacherId: teacher.id,
      assignmentType: inferAssignmentTypeFromTitle(rawRole),
      title: rawRole,
      startDate: null,
      endDate: null,
      isDateUnknown: true,
      ...(state.settings?.academicYear ? { academicYear: state.settings.academicYear } : {}),
      semester: state.settings?.semester ?? null,
      status: teacher.isActive === false ? 'COMPLETED' : 'ACTIVE',
      sourceType: 'LEGACY_MIGRATION',
      legacyRoleTitle: rawRole,
      notes: 'Dimigrasikan secara non-destruktif dari roleTitle lama; tanggal efektif (TMT) belum tercatat.',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  return result;
}
