import type { AppState, Day, ScheduleEntry, ScheduleScoreBreakdown, ValidationIssue, ValidationReport } from './types';
import { DAYS } from './types';
import { segmentsFromBreaks, teachingPeriodsForDay } from './time';

function stableIssueId(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const makeIssue = (
  code: string,
  severity: ValidationIssue['severity'],
  title: string,
  message: string,
  context?: string,
  action?: string,
  targetScreen?: ValidationIssue['targetScreen'],
  targetSlot?: ValidationIssue['targetSlot'],
): ValidationIssue => ({
  id: `${code}-${stableIssueId([code, severity, title, message, context ?? '', action ?? ''].join('|'))}`,
  code,
  severity,
  title,
  message,
  context,
  action,
  targetScreen,
  targetSlot,
});

export interface ValidateOptions {
  strictCoverage?: boolean;
  includeSoftWarnings?: boolean;
}

export function validateSchedule(state: AppState, entries: ScheduleEntry[], options: ValidateOptions = {}): ValidationReport {
  const strictCoverage = options.strictCoverage ?? true;
  const includeSoftWarnings = options.includeSoftWarnings ?? true;
  const issues: ValidationIssue[] = [];
  const activeClasses = new Set(state.classes.filter((item) => item.isActive).map((item) => item.id));
  const activeTeachers = new Map(state.teachers.filter((item) => item.isActive).map((item) => [item.id, item]));
  const activeSubjects = new Map(state.subjects.filter((item) => item.isActive).map((item) => [item.id, item]));
  const periodsByDay = new Map<Day, Set<number>>();
  for (const day of state.settings.activeDays) {
    periodsByDay.set(day, new Set(teachingPeriodsForDay(state.slots, day)));
  }

  const classSlot = new Map<string, ScheduleEntry>();
  const teacherSlot = new Map<string, ScheduleEntry>();
  const subjectTeacherCounts = new Map<string, number>();
  const subjectClassCounts = new Map<string, number>();
  const teacherWeeklyCounts = new Map<string, number>();
  const teacherDistinctSubjects = new Map<string, Set<string>>();
  const entriesByClassDay = new Map<string, ScheduleEntry[]>();

  for (const entry of entries) {
    const subjSet = teacherDistinctSubjects.get(entry.teacherId) ?? new Set<string>();
    subjSet.add(entry.subjectId);
    teacherDistinctSubjects.set(entry.teacherId, subjSet);

    const schoolClass = state.classes.find((item) => item.id === entry.classId);
    const teacher = activeTeachers.get(entry.teacherId);
    const subject = activeSubjects.get(entry.subjectId);
    if (!schoolClass || !activeClasses.has(entry.classId)) {
      issues.push(makeIssue('HC-UNKNOWN-CLASS', 'error', 'Kelas tidak tersedia', 'Ada penempatan yang merujuk kelas yang tidak ada atau nonaktif.', `${entry.day} · JP ${entry.jpNo}`, 'Periksa data kelas dan hapus penempatan yatim.', 'master'));
      continue;
    }
    if (!teacher) {
      issues.push(makeIssue('HC-UNKNOWN-TEACHER', 'error', 'Guru tidak tersedia', 'Ada penempatan yang merujuk guru yang tidak ada atau nonaktif.', `${schoolClass.name} · ${entry.day} · JP ${entry.jpNo}`, 'Pilih guru aktif lalu validasi ulang.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
      continue;
    }
    if (!subject) {
      issues.push(makeIssue('HC-UNKNOWN-SUBJECT', 'error', 'Mata pelajaran tidak tersedia', 'Ada penempatan yang merujuk mapel yang tidak ada atau nonaktif.', `${schoolClass.name} · ${entry.day} · JP ${entry.jpNo}`, 'Pilih mapel aktif lalu validasi ulang.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
      continue;
    }
    if (!state.settings.activeDays.includes(entry.day) || !periodsByDay.get(entry.day)?.has(entry.jpNo)) {
      issues.push(makeIssue('HC-INVALID-SLOT', 'error', 'Slot di luar struktur KBM', `JP ${entry.jpNo} tidak aktif pada ${entry.day}.`, `${schoolClass.name} · ${subject.name}`, 'Pindahkan pelajaran ke slot KBM aktif.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
      continue;
    }
    if (teacher.availableDays && teacher.availableDays.length > 0 && !teacher.availableDays.includes(entry.day)) {
      issues.push(makeIssue('HC-TEACHER-UNAVAILABLE-DAY', 'error', 'Guru tidak tersedia di hari tersebut', `${teacher.name} diatur tidak siap mengajar pada hari ${entry.day}.`, `${schoolClass.name} · ${entry.day} · JP ${entry.jpNo}`, 'Pindahkan ke hari tersedia guru atau perbarui Hari Siap Mengajar di Data Master.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
    }
    if (entry.jpNo > state.settings.maxDailyJP) {
      issues.push(makeIssue('HC-DAILY-LIMIT', 'error', 'Batas JP harian terlampaui', `Penempatan berada pada JP ${entry.jpNo}, di atas batas ${state.settings.maxDailyJP} JP/hari.`, `${schoolClass.name} · ${entry.day}`, 'Ubah struktur atau atur ulang pelajaran.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
    }
    if (!teacher.subjectIds.includes(entry.subjectId)) {
      issues.push(makeIssue('HC-TEACHER-QUALIFICATION', 'error', 'Kualifikasi guru tidak sesuai', `${teacher.name} belum memiliki kualifikasi untuk ${subject.name}.`, `${schoolClass.name} · ${entry.day} · JP ${entry.jpNo}`, 'Perbaiki alokasi atau tambahkan kualifikasi mapel pada Data Guru.', 'master', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
    }

    const slotKey = `${entry.classId}|${entry.day}|${entry.jpNo}`;
    if (classSlot.has(slotKey)) {
      const other = classSlot.get(slotKey)!;
      const otherSubjectName = activeSubjects.get(other.subjectId)?.name ?? other.subjectId;
      issues.push(makeIssue('HC-CLASS-COLLISION', 'error', 'Kelas mendapat dua pelajaran', `Pada JP yang sama, kelas ${schoolClass.name} memiliki lebih dari satu penempatan.`, `${entry.day} · JP ${entry.jpNo} · ${otherSubjectName} / ${subject.name}`, 'Sisakan satu pelajaran untuk slot tersebut.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
    } else classSlot.set(slotKey, entry);

    const teacherKey = `${entry.teacherId}|${entry.day}|${entry.jpNo}`;
    if (teacherSlot.has(teacherKey)) {
      const other = teacherSlot.get(teacherKey)!;
      const otherClass = state.classes.find((item) => item.id === other.classId)?.name ?? other.classId;
      issues.push(makeIssue('HC-TEACHER-COLLISION', 'error', 'Guru bentrok jam mengajar', `${teacher.name} ditempatkan di dua kelas pada waktu yang sama.`, `${entry.day} · JP ${entry.jpNo} · Kelas ${otherClass} & ${schoolClass.name}`, 'Pindahkan salah satu penempatan ke slot lain.', 'schedule', { classId: entry.classId, day: entry.day, jpNo: entry.jpNo }));
    } else teacherSlot.set(teacherKey, entry);

    const cstKey = `${entry.classId}|${entry.subjectId}|${entry.teacherId}`;
    subjectTeacherCounts.set(cstKey, (subjectTeacherCounts.get(cstKey) ?? 0) + 1);
    const csKey = `${entry.classId}|${entry.subjectId}`;
    subjectClassCounts.set(csKey, (subjectClassCounts.get(csKey) ?? 0) + 1);
    teacherWeeklyCounts.set(entry.teacherId, (teacherWeeklyCounts.get(entry.teacherId) ?? 0) + 1);
    const dayKey = `${entry.classId}|${entry.day}`;
    const dayEntries = entriesByClassDay.get(dayKey) ?? [];
    dayEntries.push(entry);
    entriesByClassDay.set(dayKey, dayEntries);
  }

  for (const [teacherId, count] of teacherWeeklyCounts) {
    const teacher = activeTeachers.get(teacherId);
    const teacherMaxWeekly = teacher ? (teacher.maxWeeklyJP > 0 ? teacher.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24)) : 24;
    if (teacher && count > teacherMaxWeekly) {
      issues.push(makeIssue('HC-TEACHER-WEEKLY-LIMIT', 'error', 'Beban guru melebihi batas', `${teacher.name} mendapat ${count} JP, sedangkan batas mingguan ${teacherMaxWeekly} JP.`, 'Beban seluruh mapel dijumlahkan per guru.', 'Kurangi atau distribusikan alokasi JP, atau sesuaikan batas JP guru.', 'requirements'));
    }
  }

  const maxPeriods = Math.max(0, ...state.settings.activeDays.map((day) => Math.max(0, ...[...(periodsByDay.get(day) ?? [])])));
  const segments = segmentsFromBreaks(maxPeriods, state.settings.breakAfterJP);
  for (const [key, dayEntries] of entriesByClassDay) {
    const [classId, day] = key.split('|') as [string, Day];
    const schoolClass = state.classes.find((item) => item.id === classId);
    const entryAtJP = new Map(dayEntries.map((entry) => [entry.jpNo, entry]));
    const sequence: Array<ScheduleEntry | undefined> = [];
    for (let jp = 1; jp <= maxPeriods; jp++) sequence.push(entryAtJP.get(jp));

    // Hard rule: only one run of exactly three consecutive JP of a subject per class/day.
    const tripleRuns: Array<{ subjectId: string; start: number; end: number }> = [];
    let cursor = 0;
    while (cursor < sequence.length) {
      const current = sequence[cursor];
      if (!current) { cursor += 1; continue; }
      let end = cursor;
      while (end + 1 < sequence.length && sequence[end + 1]?.subjectId === current.subjectId) end += 1;
      const runLength = end - cursor + 1;
      if (runLength >= 3) tripleRuns.push({ subjectId: current.subjectId, start: cursor + 1, end: end + 1 });
      cursor = end + 1;
    }
    const seenRuns = new Set<string>();
    for (const run of tripleRuns) {
      const subject = activeSubjects.get(run.subjectId);
      if (run.end - run.start + 1 > 3) {
        issues.push(makeIssue('HC-SUBJECT-BLOCK-OVERFLOW', 'error', 'Blok mata pelajaran terlalu panjang', `${subject?.name ?? 'Mapel'} berlangsung ${run.end - run.start + 1} JP berturut-turut di ${schoolClass?.name ?? classId}.`, `${day} · JP ${run.start}–${run.end}`, 'Pecah rangkaian menjadi blok maksimal 2–3 JP.', 'schedule', { classId, day, jpNo: run.start }));
      }
      const keyRun = `${run.subjectId}|${run.start}|${run.end}`;
      if (!seenRuns.has(keyRun)) seenRuns.add(keyRun);
    }
    if (tripleRuns.length > 1) {
      issues.push(makeIssue('HC-THREE-JP-BLOCK-LIMIT', 'error', 'Batas blok 3 JP terlampaui', `${schoolClass?.name ?? classId} memiliki lebih dari satu blok mapel 3 JP berturut-turut pada hari ${day}.`, tripleRuns.map((run) => `${activeSubjects.get(run.subjectId)?.name ?? run.subjectId} JP ${run.start}–${run.end}`).join('; '), 'Pertahankan maksimal satu blok tiga JP per kelas per hari.', 'schedule', { classId, day, jpNo: tripleRuns[1]?.start ?? 1 }));
    }

    if (includeSoftWarnings) {
      const hasDouble = sequence.some((entry, index) => !!entry && !!sequence[index + 1] && entry.subjectId === sequence[index + 1]?.subjectId);
      if (dayEntries.length > 0 && !hasDouble) {
        issues.push(makeIssue('SC-NO-DOUBLE-BLOCK', 'warning', 'Preferensi blok 2 JP belum terpenuhi', `${schoolClass?.name ?? classId} belum memiliki pasangan 2 JP mapel yang berurutan pada ${day}.`, `${schoolClass?.name ?? classId} · ${day}`, 'Bila memungkinkan, gabungkan dua JP mapel yang sama tanpa melanggar aturan wajib jadwal.', 'schedule', { classId, day, jpNo: dayEntries[0]?.jpNo ?? 1 }));
      }
    }
  }

  // Multisubject-teacher sequence around breaks; checks teachers actually teaching >1 distinct subject.
  const activeTeachersList = [...activeTeachers.values()];
  for (const schoolClass of state.classes.filter((item) => item.isActive)) {
    for (const day of state.settings.activeDays) {
      const byJP = new Map<number, ScheduleEntry>();
      for (const entry of entries) if (entry.classId === schoolClass.id && entry.day === day) byJP.set(entry.jpNo, entry);
      for (let segmentIndex = 0; segmentIndex < segments.length - 1; segmentIndex++) {
        const before = segments[segmentIndex];
        const after = segments[segmentIndex + 1];
        if (!before?.length || !after?.length) continue;
        const beforeEnd = before[before.length - 1];
        const afterStart = after[0];
        const endEntry = byJP.get(beforeEnd);
        if (!endEntry) continue;
        const teacher = activeTeachersList.find((item) => item.id === endEntry.teacherId);
        const taughtSubjectsCount = teacher ? (teacherDistinctSubjects.get(teacher.id)?.size ?? 0) : 0;
        if (!teacher || taughtSubjectsCount <= 1) continue;
        let runBefore = 0;
        for (let jp = beforeEnd; jp >= before[0]; jp--) {
          if (byJP.get(jp)?.teacherId !== teacher.id) break;
          runBefore += 1;
        }
        if (runBefore < 1 || runBefore > 3) continue;
        let runAfter = 0;
        for (let jp = afterStart; jp <= after[after.length - 1]; jp++) {
          if (byJP.get(jp)?.teacherId !== teacher.id) break;
          runAfter += 1;
        }
        const maxAfter = ({ 1: 3, 2: 2, 3: 1 } as Record<number, number>)[runBefore];
        if (runAfter > maxAfter) {
          issues.push(makeIssue('HC-MULTISUBJECT-POST-BREAK', 'error', 'Aturan guru multimapel setelah istirahat', `${teacher.name} mengajar ${runBefore} JP berturut-turut sebelum istirahat dan ${runAfter} JP setelahnya; batas setelah istirahat adalah ${maxAfter} JP.`, `${schoolClass.name} · ${day} · jeda setelah JP ${beforeEnd}`, 'Ubah susunan pelajaran pada sisi sebelum atau sesudah istirahat.', 'schedule', { classId: schoolClass.id, day, jpNo: afterStart }));
        }
      }
    }
  }

  // Requirement matching. For draft editing, gaps are warnings; strict validation blocks publish.
  const expectedKeys = new Set<string>();
  const coveredClassSubjectKeys = new Set<string>();
  for (const requirement of state.requirements) {
    const key = `${requirement.classId}|${requirement.subjectId}|${requirement.teacherId}`;
    const csKey = `${requirement.classId}|${requirement.subjectId}`;
    expectedKeys.add(key);
    const expected = requirement.requiredJP;
    const actual = subjectTeacherCounts.get(key) ?? 0;
    if (actual !== expected) {
      const severity = strictCoverage ? 'error' : 'warning';
      coveredClassSubjectKeys.add(csKey);
      const clsName = state.classes.find((item) => item.id === requirement.classId)?.name ?? requirement.classId;
      const subName = state.subjects.find((item) => item.id === requirement.subjectId)?.name ?? requirement.subjectId;
      issues.push(makeIssue('HC-REQUIREMENT-COVERAGE', severity, actual < expected ? 'Alokasi JP belum terpenuhi' : 'Alokasi JP berlebih', `${clsName} · ${subName}: ${actual} dari ${expected} JP dialokasikan kepada guru ini.`, `Kelas ${clsName} · ${subName}`, 'Jalankan ulang penyusun jadwal otomatis, atau lengkapi slot kelas secara manual.', 'schedule'));
    }
  }
  for (const [key, actual] of subjectTeacherCounts) {
    if (!expectedKeys.has(key) && actual > 0) {
      const [cId, sId] = key.split('|');
      const clsName = state.classes.find((item) => item.id === cId)?.name ?? cId;
      const subName = state.subjects.find((item) => item.id === sId)?.name ?? sId;
      issues.push(makeIssue('HC-UNALLOCATED-ENTRY', 'error', 'Penempatan tanpa alokasi', 'Jadwal memuat penempatan guru-mapel yang tidak tercatat dalam alokasi kebutuhan JP.', `${clsName} · ${subName} (${actual} JP)`, 'Tambahkan alokasi yang benar di Kebutuhan & Alokasi JP atau kosongkan slot tersebut.', 'requirements'));
    }
  }

  // Each class-subject total is checked too, guarding accidental duplicate split allocations.
  const checkedClassSubjects = new Set<string>();
  for (const requirement of state.requirements) {
    const key = `${requirement.classId}|${requirement.subjectId}`;
    if (checkedClassSubjects.has(key)) continue;
    checkedClassSubjects.add(key);
    const expected = state.requirements.filter((item) => item.classId === requirement.classId && item.subjectId === requirement.subjectId).reduce((sum, item) => sum + item.requiredJP, 0);
    const actual = subjectClassCounts.get(key) ?? 0;
    if (strictCoverage && actual !== expected && !coveredClassSubjectKeys.has(key)) {
      const clsName = state.classes.find((item) => item.id === requirement.classId)?.name ?? requirement.classId;
      const subName = state.subjects.find((item) => item.id === requirement.subjectId)?.name ?? requirement.subjectId;
      issues.push(makeIssue('HC-SUBJECT-COVERAGE', 'error', 'Kebutuhan mapel belum terpenuhi', `${clsName} · ${subName}: ${actual} dari ${expected} JP.`, `Kelas ${clsName} · ${subName}`, 'Lengkapi alokasi JP mata pelajaran ini.', 'requirements'));
    }
  }

  const hardErrorCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  return { valid: hardErrorCount === 0, issues, hardErrorCount, warningCount };
}

export function validateMasterData(state: AppState): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const activeClasses = state.classes.filter((item) => item.isActive);
  if (activeClasses.length > 36) {
    issues.push(makeIssue('DATA-CLASS-LIMIT', 'warning', 'Jumlah kelas sangat besar', `Terdapat ${activeClasses.length} kelas aktif; proses penyusunan otomatis mungkin memerlukan batas pencarian lebih tinggi.`, undefined, 'Naikkan Batas Pencarian di Pengaturan bila diperlukan.', 'settings'));
  }
  if (!activeClasses.length) issues.push(makeIssue('DATA-NO-CLASSES', 'error', 'Belum ada kelas aktif', 'Tambahkan setidaknya satu kelas aktif sebelum membuat jadwal.', undefined, 'Buka Data Master → Tab Kelas untuk mengaktifkan rombel.', 'master'));
  if (!state.settings.activeDays.length) issues.push(makeIssue('DATA-NO-DAYS', 'error', 'Belum ada hari aktif', 'Pilih minimal satu hari KBM.', undefined, 'Aktifkan hari belajar di Pengaturan Workspace.', 'settings'));
  const totalSlots = state.settings.activeDays.reduce((sum, day) => sum + teachingPeriodsForDay(state.slots, day).length, 0);
  for (const schoolClass of activeClasses) {
    const weeklyDemand = state.requirements.filter((item) => item.classId === schoolClass.id).reduce((sum, item) => sum + item.requiredJP, 0);
    if (weeklyDemand > totalSlots) {
      issues.push(makeIssue('DATA-CLASS-DEMAND-CAPACITY', 'error', 'Kebutuhan JP melebihi kapasitas', `Kelas ${schoolClass.name} membutuhkan ${weeklyDemand} JP, tetapi kapasitas mingguan hanya ${totalSlots} slot.`, `Kelas ${schoolClass.name}`, 'Kurangi alokasi JP kelas ini atau tambah jam KBM di Pengaturan.', 'requirements'));
    }
    if (weeklyDemand === 0) {
      issues.push(makeIssue('DATA-CLASS-NO-DEMAND', 'warning', `${schoolClass.name} belum memiliki kebutuhan JP`, 'Tambahkan kebutuhan JP per mata pelajaran sebelum membuat jadwal.', `Kelas ${schoolClass.name}`, 'Buka Kebutuhan & Alokasi JP untuk mengisi mapel kelas ini.', 'requirements'));
    }
  }
  const teachers = new Map(state.teachers.filter((item) => item.isActive).map((item) => [item.id, item]));
  for (const requirement of state.requirements) {
    const teacher = teachers.get(requirement.teacherId);
    const subject = state.subjects.find((item) => item.id === requirement.subjectId && item.isActive);
    const schoolClass = state.classes.find((item) => item.id === requirement.classId && item.isActive);
    if (!teacher || !subject || !schoolClass) {
      issues.push(makeIssue('DATA-INVALID-REQUIREMENT-REFERENCE', 'error', 'Referensi alokasi tidak valid', 'Satu kebutuhan JP merujuk kelas, guru, atau mapel yang tidak aktif/tersedia.', requirement.id, 'Perbarui atau hapus baris alokasi yang merujuk data nonaktif.', 'requirements'));
    } else if (!teacher.subjectIds.includes(subject.id)) {
      issues.push(makeIssue('DATA-UNQUALIFIED-ALLOCATION', 'error', 'Guru tidak berkualifikasi', `${teacher.name} dialokasikan ke ${subject.name}, tetapi kualifikasi belum dicatat.`, `Kelas ${schoolClass.name} · ${subject.name}`, 'Tambahkan kualifikasi mapel pada profil guru atau ganti pengampu.', 'master'));
    }
    if (!Number.isInteger(requirement.requiredJP) || requirement.requiredJP < 1) {
      issues.push(makeIssue('DATA-INVALID-JP', 'error', 'Alokasi JP tidak valid', 'Jumlah JP harus bilangan bulat minimal 1.', requirement.id, 'Perbaiki jumlah JP menjadi minimal 1.', 'requirements'));
    }
  }
  const expectedWeeklyLoad = new Map<string, number>();
  for (const requirement of state.requirements) expectedWeeklyLoad.set(requirement.teacherId, (expectedWeeklyLoad.get(requirement.teacherId) ?? 0) + requirement.requiredJP);
  for (const [teacherId, load] of expectedWeeklyLoad) {
    const teacher = teachers.get(teacherId);
    const teacherMaxWeekly = teacher ? (teacher.maxWeeklyJP > 0 ? teacher.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24)) : 24;
    if (teacher && load > teacherMaxWeekly) {
      issues.push(makeIssue('DATA-TEACHER-LOAD-OVER', 'error', 'Beban alokasi guru terlalu tinggi', `${teacher.name} dialokasikan ${load} JP/minggu; batas yang ditetapkan ${teacherMaxWeekly} JP.`, `${teacher.name} (${load}/${teacherMaxWeekly} JP)`, 'Kurangi alokasi mapel guru ini atau naikkan batas kuota JP.', 'requirements'));
    }
    if (teacher && teacher.availableDays && teacher.availableDays.length > 0) {
      const effectiveDays = teacher.availableDays.filter((d) => state.settings.activeDays.includes(d));
      const availableTeacherSlots = effectiveDays.reduce(
        (sum, d) => sum + teachingPeriodsForDay(state.slots, d).filter((jp) => jp <= state.settings.maxDailyJP).length,
        0,
      );
      if (effectiveDays.length === 0) {
        issues.push(makeIssue('DATA-TEACHER-UNAVAILABLE-DAYS', 'error', 'Hari siap mengajar guru kosong', `${teacher.name} memiliki ${load} JP alokasi namun hari siap mengajarnya tidak cocok dengan hari KBM aktif.`, teacher.name, 'Centang minimal satu hari aktif pada profil guru di Data Master.', 'master'));
      } else if (load > availableTeacherSlots) {
        issues.push(makeIssue('DATA-TEACHER-DAY-CAPACITY', 'error', 'Slot hari mengajar guru tidak cukup', `${teacher.name} mendapat ${load} JP, tetapi slot pada hari siap mengajarnya (${effectiveDays.join(', ')}) hanya ${availableTeacherSlots} JP.`, teacher.name, 'Tambah hari siap mengajar guru atau pindahkan sebagian JP ke guru lain.', 'master'));
      }
    }
  }
  return issues;
}

export function scoreScheduleDetailed(state: AppState, entries: ScheduleEntry[]): ScheduleScoreBreakdown {
  const base = 1000;
  let doubleBlockCount = 0;
  let sameDayPenalty = 0;
  let freeSlotPenalty = 0;

  const byClassDay = new Map<string, ScheduleEntry[]>();
  const activePeriodsByDay = new Map(state.settings.activeDays.map((day) => [day, teachingPeriodsForDay(state.slots, day)]));
  for (const entry of entries) {
    const key = `${entry.classId}|${entry.day}`;
    const arr = byClassDay.get(key) ?? [];
    arr.push(entry);
    byClassDay.set(key, arr);
  }
  for (const [key, list] of byClassDay) {
    const day = key.split('|')[1] as Day;
    const periods = activePeriodsByDay.get(day) ?? [];
    const byJP = new Map(list.map((entry) => [entry.jpNo, entry]));
    for (const jp of periods) {
      const current = byJP.get(jp);
      const next = byJP.get(jp + 1);
      if (periods.includes(jp + 1) && current && next && current.subjectId === next.subjectId) {
        doubleBlockCount += 1;
      }
    }
    const dayCounts = new Map<string, number>();
    for (const entry of list) dayCounts.set(entry.subjectId, (dayCounts.get(entry.subjectId) ?? 0) + 1);
    const max = Math.max(0, ...dayCounts.values());
    sameDayPenalty += Math.max(0, max - 2) * 2;
    const free = Math.max(0, periods.length - list.length);
    freeSlotPenalty += free * 0.5;
  }

  const doubleBlockBonus = doubleBlockCount * 4;
  const total = Math.round(base + doubleBlockBonus - sameDayPenalty - freeSlotPenalty);
  return {
    base,
    doubleBlockBonus,
    doubleBlockCount,
    sameDayPenalty: Math.round(sameDayPenalty * 10) / 10,
    freeSlotPenalty: Math.round(freeSlotPenalty * 10) / 10,
    total,
  };
}

export function scoreSchedule(state: AppState, entries: ScheduleEntry[]): number {
  return scoreScheduleDetailed(state, entries).total;
}

export function buildScheduleFingerprint(entries: ScheduleEntry[]): string {
  const canonical = [...entries]
    .map(({ classId, subjectId, teacherId, day, jpNo }) => `${classId}:${day}:${jpNo}:${subjectId}:${teacherId}`)
    .sort()
    .join('|');
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function dayDisplay(day: string): string {
  return DAYS.includes(day as Day) ? day : day;
}

