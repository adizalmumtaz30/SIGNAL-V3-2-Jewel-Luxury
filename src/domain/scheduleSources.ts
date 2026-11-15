import type {
  AppState,
  Day,
  ScheduleEntry,
  ScheduleVersion,
  Teacher,
  TeacherAssignment,
} from './types';
import { jpToAstronomical } from './time';
import { buildScheduleFingerprint } from './validator';

export type WorkloadSourceMode = 'PUBLISHED' | 'DRAFT' | 'REQUIREMENTS';

export const MISSING_HISTORICAL_METADATA_LABEL = 'Tidak tercatat pada versi lama';

export interface ScheduleVersionMetadataSummary {
  id: string;
  versionNumber: number;
  label: string;
  createdAt: string;
  fingerprint: string;
  entryCount: number;
  actualEntryLength: number;
  academicYearText: string;
  semesterText: string;
  isHistoricalPeriodMissing: boolean;
}

export interface VerifiedScheduleVersion {
  version: ScheduleVersion;
  computedFingerprint: string;
  isFingerprintValid: boolean;
  isEntryCountValid: boolean;
  isValidForOfficialUse: boolean;
  integrityIssues: string[];
  metadata: ScheduleVersionMetadataSummary;
}

export interface TeacherWorkloadStat {
  teacher: Teacher;
  totalJP: number;
  astroHours: number;
  astroMinutes: number;
  maxWeeklyJP: number;
  percentage: number;
  dayDist: Record<Day, number>;
  singleBlocks: number;
  doubleBlocks: number;
  tripleBlocks: number;
  totalSessions: number;
  classesTaught: string[];
  subjectsTaught: string[];
  isOverloaded: boolean;
  isUnderloaded: boolean;
}

export interface TeacherRequirementPlanStat {
  teacher: Teacher;
  plannedJP: number;
  astroHours: number;
  astroMinutes: number;
  maxWeeklyJP: number;
  percentage: number;
  classesPlanned: string[];
  subjectsPlanned: string[];
  requirementRowsCount: number;
  isOverloaded: boolean;
  isUnplanned: boolean;
}

export interface AdministrativeAssignmentSummary {
  totalActive: number;
  totalAll: number;
  nonTeachingActiveCount: number;
  teachingRecordCount: number;
}

export interface WorkloadSourceResolution {
  mode: WorkloadSourceMode;
  entries: ScheduleEntry[];
  selectedVersion: VerifiedScheduleVersion | null;
  availableVersions: VerifiedScheduleVersion[];
  validVersionsCount: number;
  canUseAsOfficialSKBasis: boolean;
  hasUnpublishedDraft: boolean;
  statusTone: 'official' | 'draft' | 'planning' | 'error' | 'empty';
  statusBannerTitle: string;
  statusBannerMessage: string;
  pdfExportAllowed: boolean;
  pdfExportBlockedReason: string | null;
}

/**
 * Verifies a single ScheduleVersion strictly against its entries and metadata without consulting AppSettings.
 */
export function verifyScheduleVersion(version: ScheduleVersion): VerifiedScheduleVersion {
  const entries = Array.isArray(version.entries) ? version.entries : [];
  const computedFingerprint = buildScheduleFingerprint(entries);
  const isFingerprintValid =
    typeof version.fingerprint === 'string' &&
    version.fingerprint.trim().toLowerCase() === computedFingerprint.toLowerCase();
  const isEntryCountValid =
    typeof version.entryCount === 'number' && version.entryCount === entries.length;

  const integrityIssues: string[] = [];
  if (!isFingerprintValid) {
    integrityIssues.push(
      `Fingerprint tidak cocok (tercatat: ${version.fingerprint || 'kosong'}, terhitung: ${computedFingerprint}).`
    );
  }
  if (!isEntryCountValid) {
    integrityIssues.push(
      `Jumlah entri tidak cocok (tercatat: ${version.entryCount}, aktual: ${entries.length}).`
    );
  }
  if (entries.length === 0) {
    integrityIssues.push('Versi jadwal tidak memiliki entri slot pelajaran (0 entri).');
  }

  const academicYearRaw =
    typeof version.academicYear === 'string' ? version.academicYear.trim() : '';
  const semesterRaw =
    version.semester === 'Ganjil' || version.semester === 'Genap' ? version.semester : '';

  const isHistoricalPeriodMissing = !academicYearRaw || !semesterRaw;

  return {
    version,
    computedFingerprint,
    isFingerprintValid,
    isEntryCountValid,
    isValidForOfficialUse: isFingerprintValid && isEntryCountValid && entries.length > 0,
    integrityIssues,
    metadata: {
      id: version.id,
      versionNumber: version.version,
      label: version.label,
      createdAt: version.createdAt,
      fingerprint: version.fingerprint,
      entryCount: version.entryCount,
      actualEntryLength: entries.length,
      academicYearText: academicYearRaw || MISSING_HISTORICAL_METADATA_LABEL,
      semesterText: semesterRaw || MISSING_HISTORICAL_METADATA_LABEL,
      isHistoricalPeriodMissing,
    },
  };
}

/**
 * Lists all ScheduleVersion items in state.history sorted newest-first, each with verification status.
 */
export function getPublishedScheduleVersions(state: AppState): VerifiedScheduleVersion[] {
  const history = Array.isArray(state.history) ? state.history : [];
  return [...history]
    .map(verifyScheduleVersion)
    .sort((a, b) => {
      if (b.version.version !== a.version.version) {
        return b.version.version - a.version.version;
      }
      const tB = Date.parse(b.version.createdAt ?? '') || 0;
      const tA = Date.parse(a.version.createdAt ?? '') || 0;
      return tB - tA;
    });
}

export function getLatestValidPublishedVersion(state: AppState): VerifiedScheduleVersion | null {
  const versions = getPublishedScheduleVersions(state);
  return versions.find((v) => v.isValidForOfficialUse) ?? null;
}

export function resolveWorkloadSource(
  state: AppState,
  mode: WorkloadSourceMode,
  requestedVersionId?: string | null
): WorkloadSourceResolution {
  const availableVersions = getPublishedScheduleVersions(state);
  const validVersions = availableVersions.filter((v) => v.isValidForOfficialUse);
  const hasUnpublishedDraft = Array.isArray(state.draft);

  if (mode === 'PUBLISHED') {
    const requested = requestedVersionId
      ? availableVersions.find((v) => v.version.id === requestedVersionId) ?? null
      : null;
    const selectedVersion = requested ?? validVersions[0] ?? availableVersions[0] ?? null;

    if (!selectedVersion) {
      const hasLooseActiveSchedule =
        Array.isArray(state.activeSchedule) && state.activeSchedule.length > 0;
      return {
        mode: 'PUBLISHED',
        entries: [],
        selectedVersion: null,
        availableVersions,
        validVersionsCount: validVersions.length,
        canUseAsOfficialSKBasis: false,
        hasUnpublishedDraft,
        statusTone: 'empty',
        statusBannerTitle: 'Belum ada jadwal yang dipublikasikan (ScheduleVersion resmi)',
        statusBannerMessage: hasLooseActiveSchedule
          ? 'Terdapat jadwal aktif kerja lokal tanpa versi terbit resmi di riwayat publikasi. Data ini belum sah dan tidak dapat digunakan sebagai dasar resmi SK; publikasikan jadwal terlebih dahulu.'
          : 'Belum ada versi jadwal yang diterbitkan di riwayat. Publikasikan jadwal yang tervalidasi sebelum memakai rekap ini sebagai dasar resmi SK.',
        pdfExportAllowed: false,
        pdfExportBlockedReason: 'Belum ada ScheduleVersion terbit yang valid untuk dicetak sebagai dokumen resmi.',
      };
    }

    if (!selectedVersion.isValidForOfficialUse) {
      return {
        mode: 'PUBLISHED',
        entries: [],
        selectedVersion,
        availableVersions,
        validVersionsCount: validVersions.length,
        canUseAsOfficialSKBasis: false,
        hasUnpublishedDraft,
        statusTone: 'error',
        statusBannerTitle: `Verifikasi integritas ScheduleVersion v${selectedVersion.version.version} gagal`,
        statusBannerMessage: `${selectedVersion.integrityIssues.join(' ')} Versi ini ditolak dan tidak dapat digunakan sebagai dasar resmi beban mengajar atau SK.`,
        pdfExportAllowed: false,
        pdfExportBlockedReason: 'Versi jadwal terpilih gagal verifikasi integritas fingerprint/jumlah entri.',
      };
    }

    return {
      mode: 'PUBLISHED',
      entries: selectedVersion.version.entries,
      selectedVersion,
      availableVersions,
      validVersionsCount: validVersions.length,
      canUseAsOfficialSKBasis: true,
      hasUnpublishedDraft,
      statusTone: 'official',
      statusBannerTitle: `Sumber Resmi: Jadwal Terbit Versi ${selectedVersion.version.version}`,
      statusBannerMessage: hasUnpublishedDraft
        ? 'Perhatian: terdapat draft jadwal yang belum diterbitkan di editor, namun perhitungan di bawah tetap mengacu strictly pada versi jadwal resmi terpilih.'
        : 'Seluruh beban JP di bawah diambil langsung dari snapshot ScheduleVersion terbit yang telah terverifikasi integritasnya.',
      pdfExportAllowed: true,
      pdfExportBlockedReason: null,
    };
  }

  if (mode === 'DRAFT') {
    const draftEntries = Array.isArray(state.draft)
      ? state.draft
      : validVersions.length === 0 && Array.isArray(state.activeSchedule)
      ? state.activeSchedule
      : [];

    const hasAnyDraft = draftEntries.length > 0;
    return {
      mode: 'DRAFT',
      entries: draftEntries,
      selectedVersion: null,
      availableVersions,
      validVersionsCount: validVersions.length,
      canUseAsOfficialSKBasis: false,
      hasUnpublishedDraft,
      statusTone: hasAnyDraft ? 'draft' : 'empty',
      statusBannerTitle: 'PRATINJAU DRAFT — BELUM DITERBITKAN; BUKAN DASAR SK RESMI',
      statusBannerMessage: hasAnyDraft
        ? 'Data ini merupakan pratinjau rancangan kerja yang belum dipublikasikan sebagai ScheduleVersion resmi. Dokumen PDF dari mode ini ditandai sebagai DRAFT / PRATINJAU.'
        : 'Saat ini tidak ada draft perubahan yang belum diterbitkan. Gunakan mode Jadwal Terbit (Resmi) atau buat perubahan di Jadwal Pelajaran.',
      pdfExportAllowed: hasAnyDraft,
      pdfExportBlockedReason: hasAnyDraft
        ? null
        : 'Belum ada entri pada draft jadwal untuk dicetak sebagai pratinjau.',
    };
  }

  return {
    mode: 'REQUIREMENTS',
    entries: [],
    selectedVersion: null,
    availableVersions,
    validVersionsCount: validVersions.length,
    canUseAsOfficialSKBasis: false,
    hasUnpublishedDraft,
    statusTone: 'planning',
    statusBannerTitle: 'KEBUTUHAN PERENCANAAN — BUKAN JAM MENGAJAR TERJADWAL',
    statusBannerMessage:
      'Angka pada mode ini berasal dari tabel rencana Alokasi Kebutuhan JP (requirements) sebelum dijadwalkan ke slot hari/jam. Bukan jadwal aktif dan tidak boleh dijadikan dasar SK.',
    pdfExportAllowed: false,
    pdfExportBlockedReason: 'Ekspor PDF jadwal guru hanya tersedia untuk Jadwal Terbit (Resmi) atau Pratinjau Draft.',
  };
}

export function aggregateTeacherWorkloadFromEntries(
  teachers: readonly Teacher[],
  entries: readonly ScheduleEntry[],
  activeDays: readonly Day[],
  periodMinutes: number
): TeacherWorkloadStat[] {
  return teachers.map((teacher) => {
    const teacherEntries = entries.filter((e) => e.teacherId === teacher.id);
    const totalJP = teacherEntries.length;
    const astro = jpToAstronomical(totalJP, periodMinutes);

    const dayDist: Record<Day, number> = {
      Senin: 0,
      Selasa: 0,
      Rabu: 0,
      Kamis: 0,
      Jumat: 0,
      Sabtu: 0,
    };
    for (const entry of teacherEntries) {
      if (dayDist[entry.day] !== undefined) {
        dayDist[entry.day] += 1;
      }
    }

    let singleBlocks = 0;
    let doubleBlocks = 0;
    let tripleBlocks = 0;

    for (const day of activeDays) {
      const daySlots = teacherEntries
        .filter((e) => e.day === day)
        .sort((a, b) => a.jpNo - b.jpNo);
      let run = 1;
      for (let i = 0; i < daySlots.length; i++) {
        if (
          i + 1 < daySlots.length &&
          daySlots[i + 1].jpNo === daySlots[i].jpNo + 1 &&
          daySlots[i + 1].classId === daySlots[i].classId
        ) {
          run += 1;
        } else {
          if (run === 1) singleBlocks += 1;
          else if (run === 2) doubleBlocks += 1;
          else if (run >= 3) tripleBlocks += 1;
          run = 1;
        }
      }
    }

    const classesTaught = [...new Set(teacherEntries.map((e) => e.classId))];
    const subjectsTaught = [...new Set(teacherEntries.map((e) => e.subjectId))];
    const isOverloaded = totalJP > teacher.maxWeeklyJP;
    const isUnderloaded = totalJP === 0;

    return {
      teacher,
      totalJP,
      astroHours: astro.hours,
      astroMinutes: astro.minutes,
      maxWeeklyJP: teacher.maxWeeklyJP,
      percentage: Math.round((totalJP / Math.max(1, teacher.maxWeeklyJP)) * 100),
      dayDist,
      singleBlocks,
      doubleBlocks,
      tripleBlocks,
      totalSessions: singleBlocks + doubleBlocks + tripleBlocks,
      classesTaught,
      subjectsTaught,
      isOverloaded,
      isUnderloaded,
    };
  });
}

export function aggregateTeacherWorkloadFromRequirements(
  teachers: readonly Teacher[],
  state: AppState,
  filters?: { classId?: string; subjectId?: string }
): TeacherRequirementPlanStat[] {
  const periodMinutes = state.settings.periodMinutes ?? 40;
  const filteredReqs = state.requirements.filter((r) => {
    if (filters?.classId && filters.classId !== 'all' && r.classId !== filters.classId) {
      return false;
    }
    if (filters?.subjectId && filters.subjectId !== 'all' && r.subjectId !== filters.subjectId) {
      return false;
    }
    return true;
  });

  return teachers.map((teacher) => {
    const reqs = filteredReqs.filter((r) => r.teacherId === teacher.id);
    const plannedJP = reqs.reduce((sum, r) => sum + (Number(r.requiredJP) || 0), 0);
    const astro = jpToAstronomical(plannedJP, periodMinutes);
    return {
      teacher,
      plannedJP,
      astroHours: astro.hours,
      astroMinutes: astro.minutes,
      maxWeeklyJP: teacher.maxWeeklyJP,
      percentage: Math.round((plannedJP / Math.max(1, teacher.maxWeeklyJP)) * 100),
      classesPlanned: [...new Set(reqs.map((r) => r.classId))],
      subjectsPlanned: [...new Set(reqs.map((r) => r.subjectId))],
      requirementRowsCount: reqs.length,
      isOverloaded: plannedJP > teacher.maxWeeklyJP,
      isUnplanned: plannedJP === 0,
    };
  });
}

export function summarizeAdministrativeAssignments(
  assignments: readonly TeacherAssignment[] | undefined
): AdministrativeAssignmentSummary {
  const list = Array.isArray(assignments) ? assignments : [];
  const active = list.filter((a) => a.status === 'ACTIVE');
  return {
    totalActive: active.length,
    totalAll: list.length,
    nonTeachingActiveCount: active.filter((a) => a.assignmentType !== 'TEACHING').length,
    teachingRecordCount: list.filter((a) => a.assignmentType === 'TEACHING').length,
  };
}

export function formatVersionDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso || '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
