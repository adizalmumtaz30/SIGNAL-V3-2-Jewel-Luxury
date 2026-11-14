import type { AttendanceRecord, AttendanceStatus, Teacher } from './types';

export interface TeacherMonthlyRecapRow {
  no: number;
  teacher: Teacher;
  hadirOnly: number;
  dinas: number;
  /** Gabungan HADIR + DINAS_LUAR sesuai standar presensi aktif bertugas */
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  totalRecorded: number;
  hasData: boolean;
  rate: number;
  predikat: string;
}

export interface MonthlyAttendanceRecapSummary {
  rows: TeacherMonthlyRecapRow[];
  recordedDaysCount: number;
  teachersWithRecordsCount: number;
  overallAvgRate: number;
  overallPredikat: string;
  sumHadirAll: number;
  sumSakitAll: number;
  sumIzinAll: number;
  sumAlpaAll: number;
}

export function getAttendancePredikat(rate: number, hasData: boolean): string {
  if (!hasData) return 'Belum Tercatat';
  if (rate >= 95) return 'Sangat Baik';
  if (rate >= 85) return 'Baik';
  if (rate >= 75) return 'Cukup';
  return 'Perlu Pembinaan';
}

export function getOverallAttendancePredikat(avgRate: number, hasAnyData: boolean): string {
  if (!hasAnyData) return 'Belum Ada Data';
  if (avgRate >= 95) return 'Sangat Baik (A)';
  if (avgRate >= 85) return 'Baik (B)';
  if (avgRate >= 75) return 'Cukup (C)';
  return 'Perlu Pembinaan';
}

/**
 * Menghitung rekapitulasi kehadiran guru per bulan langsung dari data riil `state.attendance`.
 * - Setiap pasangan (teacherId, date) dideduplikasi (entri terakhir menang) agar tidak double-count.
 * - Persentase kehadiran dihitung dari total hari tercatat masing-masing guru:
 *   `Hadir / (Hadir + Sakit + Izin + Alpa) * 100`, sehingga guru yang baru ditambahkan
 *   atau mulai tercatat belakangan dengan 0 ketidakhadiran tetap akurat 100%.
 */
export function computeMonthlyAttendanceRecap(
  attendanceList: AttendanceRecord[],
  teachers: Teacher[],
  monthYear: string,
): MonthlyAttendanceRecapSummary {
  const teacherIdSet = new Set(teachers.map((t) => t.id));
  const monthRecordsForTeachers = attendanceList.filter(
    (att) => att.date.startsWith(monthYear) && teacherIdSet.has(att.teacherId),
  );

  const distinctDates = new Set<string>();
  const byTeacherDate = new Map<string, Map<string, AttendanceRecord>>();

  for (const rec of monthRecordsForTeachers) {
    distinctDates.add(rec.date);
    let dateMap = byTeacherDate.get(rec.teacherId);
    if (!dateMap) {
      dateMap = new Map<string, AttendanceRecord>();
      byTeacherDate.set(rec.teacherId, dateMap);
    }
    const existing = dateMap.get(rec.date);
    if (!existing || (rec.recordedAt ?? '') >= (existing.recordedAt ?? '')) {
      dateMap.set(rec.date, rec);
    }
  }

  let sumHadirAll = 0;
  let sumSakitAll = 0;
  let sumIzinAll = 0;
  let sumAlpaAll = 0;
  let totalPercentSum = 0;
  let teachersWithRecordsCount = 0;

  const rows: TeacherMonthlyRecapRow[] = teachers.map((teacher, idx) => {
    const teacherMap = byTeacherDate.get(teacher.id);
    const records = teacherMap ? Array.from(teacherMap.values()) : [];

    const hadirOnly = records.filter((r) => r.status === 'HADIR').length;
    const dinas = records.filter((r) => r.status === 'DINAS_LUAR').length;
    const hadir = hadirOnly + dinas;
    const sakit = records.filter((r) => r.status === 'SAKIT').length;
    const izin = records.filter((r) => r.status === 'IZIN').length;
    const alpa = records.filter((r) => r.status === 'ALPA').length;

    sumHadirAll += hadir;
    sumSakitAll += sakit;
    sumIzinAll += izin;
    sumAlpaAll += alpa;

    const totalRecorded = hadir + sakit + izin + alpa;
    const hasData = totalRecorded > 0;
    const rate = hasData
      ? Math.min(100, Math.round((hadir / totalRecorded) * 100))
      : 0;

    if (hasData) {
      totalPercentSum += rate;
      teachersWithRecordsCount++;
    }

    return {
      no: idx + 1,
      teacher,
      hadirOnly,
      dinas,
      hadir,
      sakit,
      izin,
      alpa,
      totalRecorded,
      hasData,
      rate,
      predikat: getAttendancePredikat(rate, hasData),
    };
  });

  const hasAnyRecordedData = teachersWithRecordsCount > 0;
  const overallAvgRate = hasAnyRecordedData
    ? Math.round(totalPercentSum / teachersWithRecordsCount)
    : 0;

  return {
    rows,
    recordedDaysCount: distinctDates.size,
    teachersWithRecordsCount,
    overallAvgRate,
    overallPredikat: getOverallAttendancePredikat(overallAvgRate, hasAnyRecordedData),
    sumHadirAll,
    sumSakitAll,
    sumIzinAll,
    sumAlpaAll,
  };
}

export function enumerateMonthsInRange(startMonth: string, endMonth: string): string[] {
  const ymRegex = /^(\d{4})-(\d{2})$/;
  const startMatch = ymRegex.exec(startMonth.trim());
  const endMatch = ymRegex.exec(endMonth.trim());
  if (!startMatch && !endMatch) return [];
  if (!startMatch) return [endMonth.trim()];
  if (!endMatch) return [startMonth.trim()];

  let sY = Number(startMatch[1]);
  let sM = Number(startMatch[2]);
  let eY = Number(endMatch[1]);
  let eM = Number(endMatch[2]);

  if (sM < 1 || sM > 12 || eM < 1 || eM > 12) return [startMonth.trim()];

  // Ensure chronological order if user selects end before start
  if (sY > eY || (sY === eY && sM > eM)) {
    [sY, eY] = [eY, sY];
    [sM, eM] = [eM, sM];
  }

  const months: string[] = [];
  let curY = sY;
  let curM = sM;
  let safety = 0;
  while ((curY < eY || (curY === eY && curM <= eM)) && safety < 24) {
    months.push(`${curY}-${String(curM).padStart(2, '0')}`);
    curM += 1;
    if (curM > 12) {
      curM = 1;
      curY += 1;
    }
    safety += 1;
  }
  return months;
}

const MONTHS_FULL_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export function formatMonthShortYear(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym;
  return `${MONTHS_SHORT_ID[m - 1] ?? m} '${String(y).slice(-2)}`;
}

export function formatPeriodRangeLabel(startMonth: string, endMonth?: string): string {
  const months = enumerateMonthsInRange(startMonth, endMonth || startMonth);
  if (months.length === 0) return startMonth;
  if (months.length === 1) {
    const [y, m] = months[0].split('-').map(Number);
    return `${MONTHS_FULL_ID[m - 1] ?? m} ${y}`;
  }
  const [sY, sM] = months[0].split('-').map(Number);
  const [eY, eM] = months[months.length - 1].split('-').map(Number);
  const startLabel = MONTHS_FULL_ID[sM - 1] ?? String(sM);
  const endLabel = MONTHS_FULL_ID[eM - 1] ?? String(eM);
  if (sY === eY) {
    return `${startLabel} – ${endLabel} ${sY} (${months.length} Bulan)`;
  }
  return `${startLabel} ${sY} – ${endLabel} ${eY} (${months.length} Bulan)`;
}

export interface MonthlyBreakdownBucket {
  monthYear: string;
  hadir: number;
  sakit: number;
  izin: number;
  alpa: number;
  totalRecorded: number;
  rate: number;
  hasData: boolean;
}

export interface TeacherRangeRecapRow extends TeacherMonthlyRecapRow {
  monthlyBreakdown: Record<string, MonthlyBreakdownBucket>;
}

export interface MonthOverviewBucket {
  monthYear: string;
  label: string;
  shortLabel: string;
  recordedDaysCount: number;
  overallAvgRate: number;
}

export interface RangeAttendanceRecapSummary {
  startMonth: string;
  endMonth: string;
  months: string[];
  isMultiMonth: boolean;
  periodLabel: string;
  monthSummaries: MonthOverviewBucket[];
  rows: TeacherRangeRecapRow[];
  recordedDaysCount: number;
  teachersWithRecordsCount: number;
  overallAvgRate: number;
  overallPredikat: string;
  sumHadirAll: number;
  sumSakitAll: number;
  sumIzinAll: number;
  sumAlpaAll: number;
}

/**
 * Menghitung rekapitulasi kehadiran guru untuk 1 bulan atau rentang beberapa bulan sekaligus
 * (`startMonth` s.d. `endMonth`, inklusif) langsung dari data riil `state.attendance`.
 * - Setiap pasangan `(teacherId, date)` dideduplikasi agar bebas double-count.
 * - Jika rentang hanya 1 bulan, hasilnya identik 100% dengan `computeMonthlyAttendanceRecap`.
 */
export function computeRangeAttendanceRecap(
  attendanceList: AttendanceRecord[],
  teachers: Teacher[],
  startMonth: string,
  endMonth?: string,
): RangeAttendanceRecapSummary {
  const months = enumerateMonthsInRange(startMonth, endMonth || startMonth);
  const normalizedStart = months[0] ?? startMonth;
  const normalizedEnd = months[months.length - 1] ?? startMonth;
  const monthSet = new Set(months);
  const teacherIdSet = new Set(teachers.map((t) => t.id));

  const rangeRecords = attendanceList.filter((att) => {
    if (!teacherIdSet.has(att.teacherId)) return false;
    const ym = att.date.slice(0, 7);
    return monthSet.has(ym);
  });

  const distinctDates = new Set<string>();
  const byTeacherDate = new Map<string, Map<string, AttendanceRecord>>();

  for (const rec of rangeRecords) {
    distinctDates.add(rec.date);
    let dateMap = byTeacherDate.get(rec.teacherId);
    if (!dateMap) {
      dateMap = new Map<string, AttendanceRecord>();
      byTeacherDate.set(rec.teacherId, dateMap);
    }
    const existing = dateMap.get(rec.date);
    if (!existing || (rec.recordedAt ?? '') >= (existing.recordedAt ?? '')) {
      dateMap.set(rec.date, rec);
    }
  }

  let sumHadirAll = 0;
  let sumSakitAll = 0;
  let sumIzinAll = 0;
  let sumAlpaAll = 0;
  let totalPercentSum = 0;
  let teachersWithRecordsCount = 0;

  const rows: TeacherRangeRecapRow[] = teachers.map((teacher, idx) => {
    const teacherMap = byTeacherDate.get(teacher.id);
    const records = teacherMap ? Array.from(teacherMap.values()) : [];

    const hadirOnly = records.filter((r) => r.status === 'HADIR').length;
    const dinas = records.filter((r) => r.status === 'DINAS_LUAR').length;
    const hadir = hadirOnly + dinas;
    const sakit = records.filter((r) => r.status === 'SAKIT').length;
    const izin = records.filter((r) => r.status === 'IZIN').length;
    const alpa = records.filter((r) => r.status === 'ALPA').length;

    sumHadirAll += hadir;
    sumSakitAll += sakit;
    sumIzinAll += izin;
    sumAlpaAll += alpa;

    const totalRecorded = hadir + sakit + izin + alpa;
    const hasData = totalRecorded > 0;
    const rate = hasData
      ? Math.min(100, Math.round((hadir / totalRecorded) * 100))
      : 0;

    if (hasData) {
      totalPercentSum += rate;
      teachersWithRecordsCount++;
    }

    const monthlyBreakdown: Record<string, MonthlyBreakdownBucket> = {};
    for (const ym of months) {
      const mRecs = records.filter((r) => r.date.startsWith(ym));
      const mHadir = mRecs.filter((r) => r.status === 'HADIR' || r.status === 'DINAS_LUAR').length;
      const mSakit = mRecs.filter((r) => r.status === 'SAKIT').length;
      const mIzin = mRecs.filter((r) => r.status === 'IZIN').length;
      const mAlpa = mRecs.filter((r) => r.status === 'ALPA').length;
      const mTotal = mHadir + mSakit + mIzin + mAlpa;
      const mHasData = mTotal > 0;
      const mRate = mHasData ? Math.min(100, Math.round((mHadir / mTotal) * 100)) : 0;
      monthlyBreakdown[ym] = {
        monthYear: ym,
        hadir: mHadir,
        sakit: mSakit,
        izin: mIzin,
        alpa: mAlpa,
        totalRecorded: mTotal,
        rate: mRate,
        hasData: mHasData,
      };
    }

    return {
      no: idx + 1,
      teacher,
      hadirOnly,
      dinas,
      hadir,
      sakit,
      izin,
      alpa,
      totalRecorded,
      hasData,
      rate,
      predikat: getAttendancePredikat(rate, hasData),
      monthlyBreakdown,
    };
  });

  const monthSummaries: MonthOverviewBucket[] = months.map((ym) => {
    const mSummary = computeMonthlyAttendanceRecap(attendanceList, teachers, ym);
    const [y, m] = ym.split('-').map(Number);
    return {
      monthYear: ym,
      label: `${MONTHS_FULL_ID[m - 1] ?? m} ${y}`,
      shortLabel: formatMonthShortYear(ym),
      recordedDaysCount: mSummary.recordedDaysCount,
      overallAvgRate: mSummary.overallAvgRate,
    };
  });

  const hasAnyRecordedData = teachersWithRecordsCount > 0;
  const overallAvgRate = hasAnyRecordedData
    ? Math.round(totalPercentSum / teachersWithRecordsCount)
    : 0;

  return {
    startMonth: normalizedStart,
    endMonth: normalizedEnd,
    months,
    isMultiMonth: months.length > 1,
    periodLabel: formatPeriodRangeLabel(normalizedStart, normalizedEnd),
    monthSummaries,
    rows,
    recordedDaysCount: distinctDates.size,
    teachersWithRecordsCount,
    overallAvgRate,
    overallPredikat: getOverallAttendancePredikat(overallAvgRate, hasAnyRecordedData),
    sumHadirAll,
    sumSakitAll,
    sumIzinAll,
    sumAlpaAll,
  };
}

/**
 * Menerapkan presensi massal pada rentang [startDate .. endDate] untuk guru sasaran.
 * Membersihkan catatan lama di seluruh rentang [startDate .. endDate] (termasuk tanggal merah/libur
 * yang sebelumnya mungkin sempat tercatat) sebelum menulis `effectiveDates`, sehingga seluruh
 * guru sasaran memiliki jumlah hari tercatat yang seragam dan bebas data yatim.
 */
export function applyMassAttendanceRecords(params: {
  existingAttendance: AttendanceRecord[];
  targetTeacherIds: string[];
  startDate: string;
  endDate: string;
  effectiveDates: string[];
  status: AttendanceStatus;
  notes: string;
  recordedAt: string;
}): AttendanceRecord[] {
  const {
    existingAttendance,
    targetTeacherIds,
    startDate,
    endDate,
    effectiveDates,
    status,
    notes,
    recordedAt,
  } = params;

  const teacherSet = new Set(targetTeacherIds);
  const remaining = existingAttendance.filter(
    (a) => !(teacherSet.has(a.teacherId) && a.date >= startDate && a.date <= endDate),
  );

  const added: AttendanceRecord[] = [];
  for (const d of effectiveDates) {
    for (const tId of targetTeacherIds) {
      added.push({
        id: `ATT-${d}-${tId}`,
        date: d,
        teacherId: tId,
        status,
        notes,
        recordedAt,
      });
    }
  }

  return [...remaining, ...added];
}

