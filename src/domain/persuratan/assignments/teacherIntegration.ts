import type {
  AppState,
  Teacher,
  TeacherAssignment,
  TeacherAssignmentStatus,
  TeacherAssignmentType,
} from '../../types';
import {
  aggregateTeacherWorkloadFromEntries,
  getPublishedScheduleVersions,
  verifyScheduleVersion,
  type TeacherWorkloadStat,
  type VerifiedScheduleVersion,
} from '../../scheduleSources';
import {
  normalizeTeacherAssignment,
  validateTeacherAssignment,
} from '../../teacherAssignments';
import type {
  DocumentIntakeDraft,
  DocumentRecord,
  DocumentVersion,
  PersuratanLaunchRequest,
} from '../types';
import { getIntakeSchemaForTemplate } from '../intake/schemaRegistry';
import { collectAllTemplates } from '../templates/selectors';

function deepClone<T>(val: T): T {
  return JSON.parse(JSON.stringify(val)) as T;
}

export interface OfficialScheduleBasisStatus {
  allowed: boolean;
  selectedVersion: VerifiedScheduleVersion | null;
  availableVerifiedVersions: VerifiedScheduleVersion[];
  validVersionsCount: number;
  hasUnpublishedDraft: boolean;
  hasLooseActiveSchedule: boolean;
  blockedReason: string | null;
}

/**
 * Evaluates whether an official teaching assignment SK (SYS-TPL-03) can be created
 * strictly from a published & integrity-verified ScheduleVersion.
 * Draft schedules, loose activeSchedule arrays without a ScheduleVersion,
 * planning requirements, or tampered/empty versions are strictly rejected.
 */
export function getOfficialScheduleBasisStatus(
  state: AppState,
  requestedVersionId?: string | null
): OfficialScheduleBasisStatus {
  const allVersions = getPublishedScheduleVersions(state);
  const validVersions = allVersions.filter((v) => v.isValidForOfficialUse);
  const hasUnpublishedDraft = Array.isArray(state.draft) && state.draft.length > 0;
  const hasLooseActiveSchedule =
    Array.isArray(state.activeSchedule) && state.activeSchedule.length > 0;

  if (requestedVersionId) {
    const requested = allVersions.find((v) => v.version.id === requestedVersionId);
    if (!requested) {
      return {
        allowed: false,
        selectedVersion: null,
        availableVerifiedVersions: validVersions,
        validVersionsCount: validVersions.length,
        hasUnpublishedDraft,
        hasLooseActiveSchedule,
        blockedReason: `ScheduleVersion "${requestedVersionId}" tidak ditemukan dalam riwayat jadwal terbit resmi.`,
      };
    }
    const reVerified = verifyScheduleVersion(requested.version);
    if (!reVerified.isValidForOfficialUse) {
      return {
        allowed: false,
        selectedVersion: reVerified,
        availableVerifiedVersions: validVersions,
        validVersionsCount: validVersions.length,
        hasUnpublishedDraft,
        hasLooseActiveSchedule,
        blockedReason: `ScheduleVersion v${reVerified.version.version} gagal verifikasi integritas: ${reVerified.integrityIssues.join(' ')}`,
      };
    }
    return {
      allowed: true,
      selectedVersion: reVerified,
      availableVerifiedVersions: validVersions,
      validVersionsCount: validVersions.length,
      hasUnpublishedDraft,
      hasLooseActiveSchedule,
      blockedReason: null,
    };
  }

  const latestValid = validVersions[0] ?? null;
  if (!latestValid) {
    const blockedReason = hasUnpublishedDraft
      ? 'Jadwal masih berupa Draft kerja yang belum diterbitkan. Terbitkan Jadwal terlebih dahulu menjadi ScheduleVersion resmi sebelum membuat SK Mengajar.'
      : hasLooseActiveSchedule
      ? 'Jadwal aktif lokal tidak memiliki snapshot ScheduleVersion terbit resmi. Terbitkan Jadwal agar memiliki fingerprint terverifikasi.'
      : 'Belum ada ScheduleVersion jadwal terbit yang valid. Publikasikan jadwal terlebih dahulu sebelum menerbitkan SK Pembagian Tugas Mengajar.';

    return {
      allowed: false,
      selectedVersion: null,
      availableVerifiedVersions: validVersions,
      validVersionsCount: 0,
      hasUnpublishedDraft,
      hasLooseActiveSchedule,
      blockedReason,
    };
  }

  return {
    allowed: true,
    selectedVersion: latestValid,
    availableVerifiedVersions: validVersions,
    validVersionsCount: validVersions.length,
    hasUnpublishedDraft,
    hasLooseActiveSchedule,
    blockedReason: null,
  };
}

/**
 * Guarded launcher for SK Pembagian Tugas Mengajar (SYS-TPL-03).
 * Refuses draft schedules, requirements plans, or invalid ScheduleVersion records.
 */
export function buildSkTeachingLaunchPayload(
  state: AppState,
  options?: {
    scheduleVersionId?: string | null;
    nonce?: number;
    todayIso?: string;
  }
): PersuratanLaunchRequest {
  const status = getOfficialScheduleBasisStatus(state, options?.scheduleVersionId);
  if (!status.allowed || !status.selectedVersion) {
    throw new Error(
      status.blockedReason ??
        'Tidak dapat membuat SK Pembagian Tugas Mengajar tanpa ScheduleVersion terbit yang terverifikasi.'
    );
  }

  const ver = status.selectedVersion.version;
  const today = options?.todayIso ?? new Date().toISOString().slice(0, 10);
  const ay = ver.academicYear || state.settings.academicYear;
  const sem = ver.semester || state.settings.semester;

  return {
    nonce: options?.nonce ?? Date.now(),
    view: 'intake',
    templateId: 'SYS-TPL-03',
    draftId: null,
    documentId: null,
    versionId: null,
    prefillValues: {
      schedule_version_id: ver.id,
      tanggal_penetapan: today,
      documentDate: today,
      documentTitle: `SK Pembagian Tugas Mengajar TA ${ay} (${sem}) — v${ver.version}`,
      dasar_hukum: `Jadwal Pelajaran Resmi Terbit Versi ${ver.version} (${ver.id}) Tahun Ajaran ${ay} Semester ${sem}.`,
    },
  };
}

export interface TeacherOperationalProfile {
  teacher: Teacher;
  assignments: TeacherAssignment[];
  linkedDocuments: DocumentRecord[];
  officialWorkload: TeacherWorkloadStat | null;
  officialVersion: VerifiedScheduleVersion | null;
  hasUnpublishedDraft: boolean;
}

const ASSIGNMENT_STATUS_RANK: Record<TeacherAssignmentStatus, number> = {
  ACTIVE: 0,
  DRAFT: 1,
  COMPLETED: 2,
  CANCELLED: 3,
};

/**
 * Collects a teacher's operational assignments, verified official workload from published
 * ScheduleVersion (never from draft/requirements), and linked correspondence documents.
 */
export function getTeacherOperationalProfile(
  state: AppState,
  teacherId: string
): TeacherOperationalProfile | null {
  const teacher = (state.teachers ?? []).find((t) => t.id === teacherId);
  if (!teacher) return null;

  const assignments = (state.teacherAssignments ?? [])
    .filter((a) => a.teacherId === teacherId)
    .sort((a, b) => {
      const rankDiff = ASSIGNMENT_STATUS_RANK[a.status] - ASSIGNMENT_STATUS_RANK[b.status];
      if (rankDiff !== 0) return rankDiff;
      return b.updatedAt.localeCompare(a.updatedAt);
    });

  const linkedDocIdsFromAssignments = new Set(
    assignments.map((a) => a.documentId).filter((id): id is string => Boolean(id))
  );

  const linkedDocuments = (state.documents ?? [])
    .filter(
      (doc) =>
        (Array.isArray(doc.relatedTeacherIds) && doc.relatedTeacherIds.includes(teacherId)) ||
        linkedDocIdsFromAssignments.has(doc.id)
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const basis = getOfficialScheduleBasisStatus(state);
  let officialWorkload: TeacherWorkloadStat | null = null;
  if (basis.allowed && basis.selectedVersion) {
    const activeDays = state.settings.activeDays;
    const periodMinutes = state.settings.periodMinutes ?? 40;
    const stats = aggregateTeacherWorkloadFromEntries(
      [teacher],
      basis.selectedVersion.version.entries,
      activeDays,
      periodMinutes
    );
    officialWorkload = stats[0] ?? null;
  }

  return {
    teacher,
    assignments,
    linkedDocuments,
    officialWorkload,
    officialVersion: basis.selectedVersion,
    hasUnpublishedDraft: basis.hasUnpublishedDraft,
  };
}

export interface UpsertTeacherAssignmentInput {
  id?: string;
  teacherId: string;
  title: string;
  assignmentType?: TeacherAssignmentType;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  academicYear?: string;
  semester?: 'Ganjil' | 'Genap' | null;
  classId?: string | null;
  subjectIds?: string[];
  weeklyJP?: number | null;
  status?: TeacherAssignmentStatus;
  notes?: string;
  documentId?: string | null;
}

/**
 * Creates or updates a TeacherAssignment in AppState cleanly without touching
 * or overwriting any correspondence document snapshots or S04 prose.
 */
export function upsertTeacherAssignmentInState(
  state: AppState,
  input: UpsertTeacherAssignmentInput,
  timestamp: string = new Date().toISOString()
): { state: AppState; assignment: TeacherAssignment; warnings: string[] } {
  const existing = Array.isArray(state.teacherAssignments) ? state.teacherAssignments : [];
  const prev = input.id ? existing.find((a) => a.id === input.id) : undefined;
  const targetId =
    input.id?.trim() ||
    `TA-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 5)
      .toUpperCase()}`;

  const normalized = normalizeTeacherAssignment(
    {
      ...prev,
      ...input,
      id: targetId,
      teacherId: input.teacherId,
      title: input.title,
      academicYear: input.academicYear ?? prev?.academicYear ?? state.settings.academicYear,
      semester:
        input.semester !== undefined
          ? input.semester
          : prev?.semester ?? state.settings.semester,
      sourceType: prev?.sourceType ?? 'MANUAL',
      createdAt: prev?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
    timestamp
  );

  const check = validateTeacherAssignment(normalized, state.teachers, existing);
  if (!check.valid) {
    throw new Error(check.errors[0] ?? 'Data penugasan guru tidak valid.');
  }

  const nextAssignments = prev
    ? existing.map((a) => (a.id === normalized.id ? normalized : a))
    : [normalized, ...existing];

  return {
    state: {
      ...state,
      teacherAssignments: nextAssignments,
    },
    assignment: normalized,
    warnings: check.warnings,
  };
}

/**
 * Updates the status of an existing TeacherAssignment without modifying any linked documents.
 */
export function updateTeacherAssignmentStatusInState(
  state: AppState,
  assignmentId: string,
  status: TeacherAssignmentStatus,
  timestamp: string = new Date().toISOString()
): { state: AppState; assignment: TeacherAssignment } {
  const existing = Array.isArray(state.teacherAssignments) ? state.teacherAssignments : [];
  const target = existing.find((a) => a.id === assignmentId);
  if (!target) {
    throw new Error('Data penugasan guru tidak ditemukan.');
  }
  const updated: TeacherAssignment = {
    ...target,
    status,
    updatedAt: timestamp,
  };
  return {
    state: {
      ...state,
      teacherAssignments: existing.map((a) => (a.id === assignmentId ? updated : a)),
    },
    assignment: updated,
  };
}

/**
 * Builds a Persuratan launch request for creating an official document linked to a specific teacher
 * (and optionally a specific TeacherAssignment). Never injects NIP into form values.
 */
export function buildTeacherDocumentLaunchPayload(
  state: AppState,
  params: {
    teacherId: string;
    templateId: string;
    assignmentId?: string | null;
    nonce?: number;
    todayIso?: string;
  }
): PersuratanLaunchRequest {
  const teacher = (state.teachers ?? []).find((t) => t.id === params.teacherId);
  if (!teacher) {
    throw new Error('Guru tidak ditemukan pada Data Master.');
  }
  if (!teacher.isActive) {
    throw new Error(`Guru "${teacher.name}" berstatus nonaktif dan tidak dapat diberi penugasan baru.`);
  }

  const allTemplates = collectAllTemplates(state.customTemplates ?? []);
  const template = allTemplates.find((t) => t.id === params.templateId);
  if (!template) {
    throw new Error(`Template surat "${params.templateId}" tidak ditemukan.`);
  }

  // Enforce strict official ScheduleVersion gate for SK Mengajar
  if (template.id === 'SYS-TPL-03' || template.sourceTemplateId === 'SYS-TPL-03') {
    const skLaunch = buildSkTeachingLaunchPayload(state, {
      nonce: params.nonce,
      todayIso: params.todayIso,
    });
    return {
      ...skLaunch,
      templateId: template.id,
      linkedAssignmentId: params.assignmentId ?? null,
    };
  }

  const assignment = params.assignmentId
    ? (state.teacherAssignments ?? []).find((a) => a.id === params.assignmentId) ?? null
    : null;

  const schema = getIntakeSchemaForTemplate(template);
  const today = params.todayIso ?? new Date().toISOString().slice(0, 10);
  const prefillValues: Record<string, unknown> = {
    documentDate: today,
  };

  for (const ctrl of schema.controls) {
    if (ctrl.controlType === 'teacher_multi_select') {
      prefillValues[ctrl.key] = [teacher.id];
    } else if (ctrl.controlType === 'teacher_single_select') {
      prefillValues[ctrl.key] = teacher.id;
    }
  }

  if (assignment) {
    prefillValues.documentTitle = `${template.name} — ${teacher.name} (${assignment.title})`;
    if (schema.controls.some((c) => c.key === 'nama_kegiatan')) {
      prefillValues.nama_kegiatan = assignment.title;
    }
    if (schema.controls.some((c) => c.key === 'uraian_tugas')) {
      prefillValues.uraian_tugas = assignment.description?.trim() || assignment.title;
    }
    if (schema.controls.some((c) => c.key === 'agenda')) {
      prefillValues.agenda = assignment.description?.trim() || assignment.title;
    }
    if (schema.controls.some((c) => c.key === 'nama_kepanitiaan')) {
      prefillValues.nama_kepanitiaan = assignment.title;
    }
    if (assignment.startDate && schema.controls.some((c) => c.key === 'tanggal_mulai')) {
      prefillValues.tanggal_mulai = assignment.startDate;
      prefillValues.tanggal_selesai = assignment.endDate ?? assignment.startDate;
    }
    if (assignment.startDate && schema.controls.some((c) => c.key === 'tanggal_dinas')) {
      prefillValues.tanggal_dinas = assignment.startDate;
    }
    if (schema.controls.some((c) => c.key === 'tmt_berlaku')) {
      prefillValues.tmt_berlaku = assignment.startDate || today;
    }
    if (schema.controls.some((c) => c.key === 'tanggal_penetapan')) {
      prefillValues.tanggal_penetapan = today;
    }
  } else {
    prefillValues.documentTitle = `${template.name} — ${teacher.name}`;
    if (schema.controls.some((c) => c.key === 'tmt_berlaku')) {
      prefillValues.tmt_berlaku = today;
    }
    if (schema.controls.some((c) => c.key === 'tanggal_penetapan')) {
      prefillValues.tanggal_penetapan = today;
    }
  }

  return {
    nonce: params.nonce ?? Date.now(),
    view: 'intake',
    templateId: template.id,
    draftId: null,
    documentId: null,
    versionId: null,
    prefillValues,
    linkedAssignmentId: assignment?.id ?? null,
  };
}

/**
 * Links finalized official correspondence (SK / Surat Tugas / linked assignment documents)
 * to TeacherAssignment records on finalization commit.
 * Purely additive/non-destructive: preserves manual TeacherAssignment rows and never edits S04 content.
 */
export function syncTeacherAssignmentsOnFinalize(
  state: AppState,
  params: {
    draft: DocumentIntakeDraft;
    documentRecord: DocumentRecord;
    documentVersion: DocumentVersion;
    timestamp?: string;
  }
): AppState {
  const { draft, documentRecord, documentVersion } = params;
  const now = params.timestamp ?? documentVersion.finalizedAt ?? new Date().toISOString();
  const existingAssignments = Array.isArray(state.teacherAssignments)
    ? state.teacherAssignments
    : [];
  let nextAssignments = existingAssignments.map((a) => deepClone(a));

  const linkedAssignmentId =
    draft.linkedAssignmentId ?? documentRecord.linkedAssignmentId ?? null;

  // 1. Direct linked assignment reference -> attach documentId provenance
  if (linkedAssignmentId) {
    nextAssignments = nextAssignments.map((a) =>
      a.id === linkedAssignmentId
        ? {
            ...a,
            documentId: documentRecord.id,
            updatedAt: now,
          }
        : a
    );
  }

  // 2. Finalized SK Pembagian Tugas Mengajar backed by verified published ScheduleVersion
  const baseTplId =
    draft.templateSnapshot.sourceTemplateId ?? draft.templateSnapshot.templateId;
  const isSkMengajar =
    baseTplId === 'SYS-TPL-03' || documentRecord.documentType === 'SK';

  if (isSkMengajar && documentVersion.scheduleVersionId) {
    const matchedVer = (state.history ?? []).find(
      (v) => v.id === documentVersion.scheduleVersionId
    );
    if (matchedVer) {
      const verified = verifyScheduleVersion(matchedVer);
      if (verified.isValidForOfficialUse) {
        const subjectNameById = new Map(state.subjects.map((s) => [s.id, s.name]));
        const stats = aggregateTeacherWorkloadFromEntries(
          state.teachers.filter((t) => t.isActive),
          verified.version.entries,
          state.settings.activeDays,
          state.settings.periodMinutes ?? 40
        );

        for (const stat of stats) {
          if (stat.totalJP <= 0) continue;
          const detId = `TA-SK-${documentRecord.id}-${stat.teacher.id}`;
          const subjectLabels = stat.subjectsTaught
            .map((sid) => subjectNameById.get(sid) ?? sid)
            .slice(0, 3)
            .join(', ');
          const title = subjectLabels
            ? `Pembagian Tugas Mengajar (${subjectLabels})`
            : 'Pembagian Tugas Mengajar Resmi';

          const existingIdx = nextAssignments.findIndex((a) => a.id === detId);
          const payload: TeacherAssignment = normalizeTeacherAssignment(
            {
              id: detId,
              teacherId: stat.teacher.id,
              assignmentType: 'TEACHING',
              title,
              description: `Ditugaskan melalui ${documentVersion.documentNumber} berdasarkan ScheduleVersion v${verified.version.version}.`,
              startDate: documentVersion.documentDate,
              endDate: null,
              isDateUnknown: false,
              academicYear: verified.version.academicYear || state.settings.academicYear,
              semester: verified.version.semester ?? state.settings.semester,
              subjectIds: [...stat.subjectsTaught],
              weeklyJP: stat.totalJP,
              status: 'ACTIVE',
              sourceType: 'PUBLISHED_SCHEDULE',
              sourceScheduleVersionId: verified.version.id,
              documentId: documentRecord.id,
              notes: `Beban resmi ${stat.totalJP} JP/pekan (${documentVersion.documentNumber}).`,
              createdAt: now,
              updatedAt: now,
            },
            now
          );

          if (existingIdx >= 0) {
            nextAssignments[existingIdx] = payload;
          } else {
            nextAssignments.push(payload);
          }
        }
      }
    }
  }

  return {
    ...state,
    teacherAssignments: nextAssignments,
  };
}
