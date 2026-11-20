import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  BookOpen,
  Calendar,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Edit2,
  Minus,
  Plus,
  Save,
  Search,
  Sparkles,
  ToggleRight,
  Trash2,
  UserCheck,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState, AttendanceRecord, AttendanceStatus, Day, Holiday } from '../domain/types';
import {
  AVAILABLE_HOLIDAY_YEARS,
  computeEffectiveAttendanceDates,
  getOfficialEventByDate,
  getOfficialEventsForMonth,
  getOfficialEventsForYear,
  isOfficialRedDate,
  type OfficialCalendarEvent,
  type OfficialHolidayCategory,
} from '../domain/indonesianHolidays';
import {
  applyMassAttendanceRecords,
  computeRangeAttendanceRecap,
} from '../domain/attendanceRecap';
import { motion, useReducedMotion } from 'framer-motion';
import { AttendancePdfExportModal } from './AttendancePdfExportModal';
import { MadrasahTeacherAvatar } from './MadrasahTeacherAvatar';
import { KpiAnimatedNumber, KpiMotionCard } from './KpiMotion';

interface AttendanceScreenProps {
  state: AppState;
  onUpdateState: (updater: (prev: AppState) => AppState) => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
}

type AttendanceTab = 'daily' | 'monthly' | 'teacher' | 'recap' | 'holidays';
type CatalogFilter = 'ALL' | OfficialHolidayCategory;

const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; short: string; color: string; bg: string; border: string }
> = {
  HADIR: { label: 'Hadir', short: 'H', color: '#1B5E43', bg: '#E8F5EE', border: '#B8E3CD' },
  DINAS_LUAR: { label: 'Dinas Luar', short: 'DL', color: '#5D478B', bg: '#F3EFFA', border: '#D7C7ED' },
  IZIN: { label: 'Izin', short: 'I', color: '#9C6F28', bg: '#FBF4E8', border: '#EBD8B6' },
  SAKIT: { label: 'Sakit', short: 'S', color: '#36648B', bg: '#EDF4F9', border: '#C3DBED' },
  ALPA: { label: 'Alpa', short: 'A', color: '#A63A2E', bg: '#FDF0EE', border: '#F7C8C1' },
};

const QUICK_STATUS_ORDER: AttendanceStatus[] = ['HADIR', 'DINAS_LUAR', 'IZIN', 'SAKIT', 'ALPA'];

const SHORT_MONTHS_ID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
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

function getPaginationItems(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const items: (number | 'ellipsis')[] = [1];
  if (currentPage > 3) items.push('ellipsis');
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let p = start; p <= end; p++) items.push(p);
  if (currentPage < totalPages - 2) items.push('ellipsis');
  items.push(totalPages);
  return items;
}

function formatLocalDate(dateStr: string) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatCompactDate(dateStr: string) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${Number(d)} ${SHORT_MONTHS_ID[Number(m) - 1] ?? m}`;
}

function getLocalIsoDate(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getLocalYearMonth(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getMonthRangeBounds(ym: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}$/.test(ym)) return null;
  const [yNum, mNum] = ym.split('-').map(Number);
  if (!yNum || !mNum || mNum < 1 || mNum > 12) return null;
  const lastDay = new Date(yNum, mNum, 0).getDate();
  return {
    start: `${ym}-01`,
    end: `${ym}-${String(lastDay).padStart(2, '0')}`,
  };
}

function shiftIsoDate(dateStr: string, deltaDays: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const utc = new Date(Date.UTC(y, m - 1, d + deltaDays));
  const yy = utc.getUTCFullYear();
  const mm = String(utc.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(utc.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function getCategoryLabel(category: OfficialHolidayCategory): string {
  if (category === 'NASIONAL') return 'Libur Nasional';
  if (category === 'CUTI_BERSAMA') return 'Cuti Bersama';
  return 'Kaldik Kemenag RI';
}

function csvCellValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function downloadAttendanceCsv(rows: string[][], fileName: string) {
  const csvBody = '\uFEFF' + rows.map((row) => row.map((cell) => csvCellValue(cell)).join(',')).join('\r\n');
  const blob = new Blob([csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function AttendanceScreen({ state, onUpdateState, onNotify }: AttendanceScreenProps) {
  const [activeTab, setActiveTab] = useState<AttendanceTab>('daily');
  const [currentDate, setCurrentDate] = useState(() => getLocalIsoDate());
  const [currentMonth, setCurrentMonth] = useState(() => getLocalYearMonth());
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>(() => state.teachers[0]?.id ?? '');
  const [recapSelectedTeachers, setRecapSelectedTeachers] = useState<string[]>(() =>
    state.teachers.filter((t) => t.isActive !== false).map((t) => t.id),
  );
  const [pdfModalOpen, setPdfModalOpen] = useState(false);

  // Daily Mass Entry Working State
  const [dailyEntries, setDailyEntries] = useState<
    Record<string, { status: AttendanceStatus; notes: string }>
  >({});
  const [dailyInitializedDate, setDailyInitializedDate] = useState<string>('');
  const [dailySearch, setDailySearch] = useState('');
  const [dailyStatusFilter, setDailyStatusFilter] = useState<string>('all');
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyPageSize, setDailyPageSize] = useState<number>(10);

  // Mass Monthly Entry Working State
  const [massMonthStatus, setMassMonthStatus] = useState<AttendanceStatus>('HADIR');
  const [massMonthTarget, setMassMonthTarget] = useState<'all' | 'selected'>('all');
  const [massMonthSelectedTeachers, setMassMonthSelectedTeachers] = useState<string[]>([]);
  const [massMonthStartDate, setMassMonthStartDate] = useState(() => `${getLocalYearMonth()}-01`);
  const [massMonthEndDate, setMassMonthEndDate] = useState(() => {
    const ym = getLocalYearMonth();
    return getMonthRangeBounds(ym)?.end ?? `${ym}-28`;
  });
  const [autoSkipNationalHolidays, setAutoSkipNationalHolidays] = useState(true);
  const [autoSkipCutiBersama, setAutoSkipCutiBersama] = useState(true);
  const [autoSkipKaldikMadrasah, setAutoSkipKaldikMadrasah] = useState(true);

  // Teacher Ledger Working State
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(15);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'workdays' | 'leaves'>('all');

  // Recap Working State (Supports 1 Bulan & Rentang Multi-Bulan)
  const [recapMode, setRecapMode] = useState<'single' | 'range'>('single');
  const [recapEndMonth, setRecapEndMonth] = useState<string>(() => getLocalYearMonth());
  const [recapSearch, setRecapSearch] = useState('');
  const [recapSortKey, setRecapSortKey] = useState<'no' | 'name' | 'rate' | 'hadir'>('no');
  const [recapSortOrder, setRecapSortOrder] = useState<'asc' | 'desc'>('asc');
  const [recapPage, setRecapPage] = useState(1);
  const [recapPageSize, setRecapPageSize] = useState<number>(10);

  // Holiday Form & Official Calendar Catalog State
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null);
  const [holidaySearch, setHolidaySearch] = useState('');
  const [holidayPage, setHolidayPage] = useState(1);
  const [holidayPageSize, setHolidayPageSize] = useState<number>(6);
  const [catalogYear, setCatalogYear] = useState<number>(() => {
    const curY = new Date().getFullYear();
    return AVAILABLE_HOLIDAY_YEARS.includes(curY as (typeof AVAILABLE_HOLIDAY_YEARS)[number])
      ? curY
      : 2026;
  });
  const [catalogFilter, setCatalogFilter] = useState<CatalogFilter>('ALL');
  const [catalogMonth, setCatalogMonth] = useState<number | 'ALL'>('ALL');

  // Bulk Row Selection States Across Presensi Tables
  const [dailySelectedIds, setDailySelectedIds] = useState<string[]>([]);
  const [ledgerSelectedDates, setLedgerSelectedDates] = useState<string[]>([]);
  const [holidaySelectedIds, setHolidaySelectedIds] = useState<string[]>([]);
  const [recapBulkEngaged, setRecapBulkEngaged] = useState(false);
  const [attBulkConfirmDelete, setAttBulkConfirmDelete] = useState(false);
  const [attBulkStatusMode, setAttBulkStatusMode] = useState(false);

  const activeTeachers = useMemo(
    () => state.teachers.filter((t) => t.isActive !== false),
    [state.teachers],
  );
  const holidays = useMemo(() => state.holidays ?? [], [state.holidays]);
  const attendanceList = useMemo(() => state.attendance ?? [], [state.attendance]);

  const switchTabSafe = (nextTab: AttendanceTab) => {
    setActiveTab(nextTab);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
  };

  const handleToggleRecapSort = (key: 'no' | 'name' | 'rate' | 'hadir') => {
    if (recapSortKey === key) {
      setRecapSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setRecapSortKey(key);
      setRecapSortOrder('asc');
    }
  };

  // Automatically include newly added active teachers across recap, mass-selection, and individual picker
  const prevActiveTeacherIdsRef = useRef<string[]>(activeTeachers.map((t) => t.id));
  useEffect(() => {
    const currentIds = activeTeachers.map((t) => t.id);
    const currentSet = new Set(currentIds);
    const prevIds = prevActiveTeacherIdsRef.current;
    const prevSet = new Set(prevIds);
    const newlyAddedIds = currentIds.filter((id) => !prevSet.has(id));

    if (newlyAddedIds.length > 0 || prevIds.some((id) => !currentSet.has(id))) {
      setRecapSelectedTeachers((prev) =>
        Array.from(new Set([...prev.filter((id) => currentSet.has(id)), ...newlyAddedIds])),
      );
      setMassMonthSelectedTeachers((prev) => {
        if (prev.length === 0) return prev;
        const validPrev = prev.filter((id) => currentSet.has(id));
        const hadAllPrevious = prevIds.length > 0 && prevIds.every((id) => prev.includes(id));
        return hadAllPrevious ? Array.from(new Set([...validPrev, ...newlyAddedIds])) : validPrev;
      });
    }

    if (currentIds.length > 0 && !currentIds.includes(selectedTeacherId)) {
      setSelectedTeacherId(currentIds[0]);
    }

    prevActiveTeacherIdsRef.current = currentIds;
  }, [activeTeachers, selectedTeacherId]);

  // Sync daily entries whenever date, attendance records, or active teachers change
  useEffect(() => {
    const existingForDate = attendanceList.filter((a) => a.date === currentDate);
    if (dailyInitializedDate !== currentDate) {
      const map: Record<string, { status: AttendanceStatus; notes: string }> = {};
      for (const t of activeTeachers) {
        const match = existingForDate.find((e) => e.teacherId === t.id);
        map[t.id] = {
          status: match?.status ?? 'HADIR',
          notes: match?.notes ?? '',
        };
      }
      setDailyEntries(map);
      setDailyInitializedDate(currentDate);
      return;
    }

    // Ensure any newly added teacher or updated attendance records are reflected immediately
    setDailyEntries((prev) => {
      let changed = false;
      const next: Record<string, { status: AttendanceStatus; notes: string }> = { ...prev };
      for (const t of activeTeachers) {
        const match = existingForDate.find((e) => e.teacherId === t.id);
        if (!next[t.id]) {
          next[t.id] = {
            status: match?.status ?? 'HADIR',
            notes: match?.notes ?? '',
          };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [currentDate, dailyInitializedDate, attendanceList, activeTeachers]);

  // Toggle official calendar event in 1 click (add if absent, remove if already registered)
  const handleQuickToggleOfficialEvent = (event: OfficialCalendarEvent) => {
    const existing = holidays.find((h) => h.date === event.date);
    if (existing) {
      if (editingHolidayId === existing.id) {
        setEditingHolidayId(null);
        setNewHolidayDate('');
        setNewHolidayName('');
      }
      onUpdateState((prev) => ({
        ...prev,
        holidays: (prev.holidays ?? []).filter((h) => h.id !== existing.id),
      }));
      onNotify(`"${existing.name}" (${formatCompactDate(existing.date)}) dihapus dari daftar libur.`, 'info');
      return;
    }

    const holiday: Holiday = {
      id: `HOL-${event.date}-${Date.now().toString(36)}`,
      date: event.date,
      name: event.name,
    };
    onUpdateState((prev) => ({
      ...prev,
      holidays: [...(prev.holidays ?? []), holiday].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    onNotify(`"${event.name}" (${formatCompactDate(event.date)}) ditambahkan ke kalender libur.`, 'success');
  };

  // Batch add all unadded red dates for selected year or month
  const handleBatchImportHolidays = (eventsToImport: OfficialCalendarEvent[], label: string) => {
    const existingDates = new Set(holidays.map((h) => h.date));
    const toAdd = eventsToImport.filter((ev) => !existingDates.has(ev.date));

    if (toAdd.length === 0) {
      onNotify(`Seluruh tanggal merah ${label} sudah terdaftar.`, 'info');
      return;
    }

    onUpdateState((prev) => {
      const prevList = prev.holidays ?? [];
      const existingSet = new Set(prevList.map((h) => h.date));
      const newItems: Holiday[] = toAdd
        .filter((ev) => !existingSet.has(ev.date))
        .map((ev, idx) => ({
          id: `HOL-${ev.date}-${idx}-${Date.now().toString(36)}`,
          date: ev.date,
          name: ev.name,
        }));
      return {
        ...prev,
        holidays: [...prevList, ...newItems].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
    onNotify(`${toAdd.length} Tanggal Merah (${label}) berhasil ditambahkan otomatis.`, 'success');
  };

  // 1. Save Daily Mass Attendance
  const handleSaveDaily = () => {
    const nowIso = new Date().toISOString();
    onUpdateState((prev) => {
      const prevActiveTeachers = prev.teachers.filter((t) => t.isActive !== false);
      const currentList = prev.attendance ?? [];
      const withoutCurrentDate = currentList.filter((a) => a.date !== currentDate);
      const newRecords: AttendanceRecord[] = prevActiveTeachers.map((teacher) => {
        const entry = dailyEntries[teacher.id] ?? { status: 'HADIR', notes: '' };
        return {
          id: `ATT-${currentDate}-${teacher.id}`,
          date: currentDate,
          teacherId: teacher.id,
          status: entry.status,
          notes: entry.notes,
          recordedAt: nowIso,
        };
      });
      return {
        ...prev,
        attendance: [...withoutCurrentDate, ...newRecords],
      };
    });
    onNotify(`Presensi harian ${formatLocalDate(currentDate)} berhasil disimpan.`, 'success');
  };

  const handleSetAllPresent = () => {
    const updated = { ...dailyEntries };
    for (const t of activeTeachers) {
      updated[t.id] = { ...(updated[t.id] ?? { notes: '' }), status: 'HADIR' };
    }
    setDailyEntries(updated);
    onNotify('Seluruh guru disetel Hadir untuk tanggal aktif.', 'info');
  };

  const handleSetAllPresentAndSave = () => {
    const updated: Record<string, { status: AttendanceStatus; notes: string }> = { ...dailyEntries };
    for (const t of activeTeachers) {
      updated[t.id] = { notes: updated[t.id]?.notes ?? '', status: 'HADIR' };
    }
    setDailyEntries(updated);

    const nowIso = new Date().toISOString();
    onUpdateState((prev) => {
      const prevActiveTeachers = prev.teachers.filter((t) => t.isActive !== false);
      const currentList = prev.attendance ?? [];
      const withoutCurrentDate = currentList.filter((a) => a.date !== currentDate);
      const newRecords: AttendanceRecord[] = prevActiveTeachers.map((teacher) => ({
        id: `ATT-${currentDate}-${teacher.id}`,
        date: currentDate,
        teacherId: teacher.id,
        status: 'HADIR',
        notes: updated[teacher.id]?.notes ?? '',
        recordedAt: nowIso,
      }));
      return {
        ...prev,
        attendance: [...withoutCurrentDate, ...newRecords],
      };
    });
    onNotify(`Seluruh ${activeTeachers.length} guru ditandai Hadir & disimpan (${formatLocalDate(currentDate)}).`, 'success');
  };

  const applyMassMonthRange = (ym: string) => {
    const bounds = getMonthRangeBounds(ym);
    if (!bounds) return;
    setCurrentMonth(ym);
    setMassMonthStartDate(bounds.start);
    setMassMonthEndDate(bounds.end);
  };

  const applyMassPreset = (preset: 'month' | 'week' | 'fortnight') => {
    if (preset === 'month') {
      const targetMonth =
        /^\d{4}-\d{2}/.test(massMonthStartDate) ? massMonthStartDate.slice(0, 7) : currentMonth;
      applyMassMonthRange(targetMonth);
      return;
    }
    const baseDate = currentDate;
    const delta = preset === 'week' ? -6 : -13;
    setMassMonthStartDate(shiftIsoDate(baseDate, delta));
    setMassMonthEndDate(baseDate);
  };

  const activeMassPreset = useMemo(() => {
    const ym = massMonthStartDate.slice(0, 7);
    const bounds = getMonthRangeBounds(ym);
    if (bounds && massMonthStartDate === bounds.start && massMonthEndDate === bounds.end) {
      return 'month';
    }
    if (massMonthEndDate === currentDate && massMonthStartDate === shiftIsoDate(currentDate, -6)) {
      return 'week';
    }
    if (massMonthEndDate === currentDate && massMonthStartDate === shiftIsoDate(currentDate, -13)) {
      return 'fortnight';
    }
    return 'custom';
  }, [massMonthStartDate, massMonthEndDate, currentDate]);

  // Live preview of Mass Monthly Date Range (auto-skipping Sundays, registered holidays, & official National + Kaldik holidays)
  const massPreview = useMemo(
    () =>
      computeEffectiveAttendanceDates({
        startDate: massMonthStartDate,
        endDate: massMonthEndDate,
        registeredHolidays: holidays,
        includeOfficialRedDates: autoSkipNationalHolidays,
        includeCutiBersama: autoSkipCutiBersama,
        includeKaldikLibur: autoSkipKaldikMadrasah,
      }),
    [
      massMonthStartDate,
      massMonthEndDate,
      holidays,
      autoSkipNationalHolidays,
      autoSkipCutiBersama,
      autoSkipKaldikMadrasah,
    ],
  );

  // Build calendar cells for Visual Range Mosaic (up to 45 days in range)
  const massRangeMosaic = useMemo(() => {
    if (!massMonthStartDate || !massMonthEndDate || massMonthStartDate > massMonthEndDate) return [];
    const [sy, sm, sd] = massMonthStartDate.split('-').map(Number);
    const [ey, em, ed] = massMonthEndDate.split('-').map(Number);
    if (!sy || !sm || !sd || !ey || !em || !ed) return [];

    const skippedOfficialMap = new Map(
      massPreview.skippedOfficialHolidays.map((h) => [h.date, h]),
    );
    const skippedRegMap = new Map(
      massPreview.skippedRegisteredHolidays.map((h) => [h.date, h]),
    );
    const sundaySet = new Set(massPreview.skippedSundays);

    const cells: Array<{
      dateStr: string;
      dayNum: number;
      kind: 'effective' | 'sunday' | 'holiday' | 'kemenag';
      tooltip: string;
    }> = [];

    const cursor = new Date(Date.UTC(sy, sm - 1, sd));
    const endUtc = new Date(Date.UTC(ey, em - 1, ed));
    while (cursor.getTime() <= endUtc.getTime() && cells.length < 45) {
      const yy = cursor.getUTCFullYear();
      const mm = String(cursor.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(cursor.getUTCDate()).padStart(2, '0');
      const dateStr = `${yy}-${mm}-${dd}`;
      const off = skippedOfficialMap.get(dateStr);
      const reg = skippedRegMap.get(dateStr);

      if (sundaySet.has(dateStr)) {
        cells.push({
          dateStr,
          dayNum: Number(dd),
          kind: 'sunday',
          tooltip: `${formatCompactDate(dateStr)} · Minggu (Libur)`,
        });
      } else if (reg) {
        cells.push({
          dateStr,
          dayNum: Number(dd),
          kind: 'holiday',
          tooltip: `${formatCompactDate(dateStr)} · ${reg.name}`,
        });
      } else if (off) {
        cells.push({
          dateStr,
          dayNum: Number(dd),
          kind: off.category === 'KALDIK_KEMENAG' ? 'kemenag' : 'holiday',
          tooltip: `${formatCompactDate(dateStr)} · ${off.name}`,
        });
      } else {
        cells.push({
          dateStr,
          dayNum: Number(dd),
          kind: 'effective',
          tooltip: `${formatCompactDate(dateStr)} · Hari Efektif KBM`,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return cells;
  }, [massMonthStartDate, massMonthEndDate, massPreview]);

  // 2. Save Mass Monthly Attendance (always resolves latest active teachers inside state updater)
  const handleSaveMassMonthly = () => {
    if (!massMonthStartDate || !massMonthEndDate || massMonthStartDate > massMonthEndDate) {
      onNotify('Rentang tanggal tidak valid. Pastikan tanggal mulai tidak melewati tanggal akhir.', 'warning');
      return;
    }

    const activeIdSet = new Set(activeTeachers.map((t) => t.id));
    const selectedTargetTeachers =
      massMonthTarget === 'all'
        ? activeTeachers.map((t) => t.id)
        : massMonthSelectedTeachers.filter((id) => activeIdSet.has(id));

    if (!selectedTargetTeachers.length) {
      onNotify('Pilih setidaknya satu guru sasaran terlebih dahulu.', 'warning');
      return;
    }

    const dates = massPreview.effectiveDates;
    if (dates.length === 0) {
      onNotify('Tidak ada hari KBM efektif dalam rentang tanggal tersebut.', 'warning');
      return;
    }

    const nowIso = new Date().toISOString();
    const noteText = `Input massal ${STATUS_CONFIG[massMonthStatus].label}`;

    onUpdateState((prev) => {
      const resolvedTeachers =
        massMonthTarget === 'all'
          ? prev.teachers.filter((t) => t.isActive !== false).map((t) => t.id)
          : selectedTargetTeachers;

      return {
        ...prev,
        attendance: applyMassAttendanceRecords({
          existingAttendance: prev.attendance ?? [],
          targetTeacherIds: resolvedTeachers,
          startDate: massMonthStartDate,
          endDate: massMonthEndDate,
          effectiveDates: dates,
          status: massMonthStatus,
          notes: noteText,
          recordedAt: nowIso,
        }),
      };
    });

    // Sync Daily tab entries immediately if currentDate falls inside the applied range
    if (dates.includes(currentDate)) {
      setDailyEntries((prev) => {
        const next = { ...prev };
        for (const tId of selectedTargetTeachers) {
          next[tId] = { status: massMonthStatus, notes: noteText };
        }
        return next;
      });
    }

    // Align active month view if applied month differs
    const appliedMonthPrefix = dates[0]?.slice(0, 7);
    if (appliedMonthPrefix && appliedMonthPrefix !== currentMonth) {
      setCurrentMonth(appliedMonthPrefix);
    }

    const skippedHolidaysCount =
      massPreview.skippedRegisteredHolidays.length + massPreview.skippedOfficialHolidays.length;
    onNotify(
      `Presensi ${STATUS_CONFIG[massMonthStatus].label} diterapkan untuk ${selectedTargetTeachers.length} guru pada ${dates.length} hari efektif` +
        (skippedHolidaysCount > 0 ? ` (${skippedHolidaysCount} tanggal merah otomatis dilewati).` : '.'),
      'success',
    );
  };

  // 3. Direct 1-click Single Teacher Day Status Set
  const handleSetSingleTeacherDay = (dateStr: string, status: AttendanceStatus) => {
    onUpdateState((prev) => {
      const list = (prev.attendance ?? []).filter(
        (a) => !(a.date === dateStr && a.teacherId === selectedTeacherId),
      );
      return {
        ...prev,
        attendance: [
          ...list,
          {
            id: `ATT-${dateStr}-${selectedTeacherId}`,
            date: dateStr,
            teacherId: selectedTeacherId,
            status,
            recordedAt: new Date().toISOString(),
          },
        ],
      };
    });
    if (dateStr === currentDate && selectedTeacherId) {
      setDailyEntries((prev) => ({
        ...prev,
        [selectedTeacherId]: { notes: prev[selectedTeacherId]?.notes ?? '', status },
      }));
    }
  };

  // 4. Monthly Statistics Calculation
  const [currentYearNum, currentMonthNum] = useMemo(() => {
    const [yStr, mStr] = currentMonth.split('-');
    return [Number(yStr), Number(mStr)];
  }, [currentMonth]);

  const daysInCurrentMonth = useMemo(() => {
    return new Date(currentYearNum, currentMonthNum, 0).getDate();
  }, [currentYearNum, currentMonthNum]);

  const effectiveDaysInMonth = useMemo(() => {
    let count = 0;
    const activeDays = state.settings.activeDays;
    const dayNames: Day[] = ['Minggu' as Day, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const curDate = new Date(currentYearNum, currentMonthNum - 1, d);
      const dayName = dayNames[curDate.getDay()];
      const dateStr = `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isHol = holidays.some((h) => h.date === dateStr);
      const isOfficialRed = Boolean(
        isOfficialRedDate(dateStr, { includeCutiBersama: true, includeKaldikLibur: true }),
      );
      if (curDate.getDay() !== 0 && activeDays.includes(dayName) && !isHol && !isOfficialRed) {
        count++;
      }
    }
    return count > 0 ? count : 24;
  }, [currentYearNum, currentMonthNum, daysInCurrentMonth, holidays, state.settings.activeDays]);

  const holidaysInMonth = useMemo(() => {
    const registered = holidays.filter((h) => h.date.startsWith(currentMonth));
    const official = getOfficialEventsForMonth(currentMonth).filter((e) => e.isRedDate);
    const seen = new Set(registered.map((h) => h.date));
    return [...registered, ...official.filter((o) => !seen.has(o.date))];
  }, [holidays, currentMonth]);

  // Official red dates in active month that haven't been imported to state.holidays yet
  const activeViewMonth = activeTab === 'daily' ? currentDate.slice(0, 7) : currentMonth;
  const unaddedOfficialRedDatesInMonth = useMemo(() => {
    const registeredDates = new Set(holidays.map((h) => h.date));
    return getOfficialEventsForMonth(activeViewMonth).filter(
      (ev) => ev.isRedDate && !registeredDates.has(ev.date),
    );
  }, [activeViewMonth, holidays]);

  // Unadded official red dates in selected catalog year/month for instant 1-click chips inside Tab Hari Libur
  const quickSuggestOfficialEvents = useMemo(() => {
    const registeredDates = new Set(holidays.map((h) => h.date));
    const pool = getOfficialEventsForYear(catalogYear).filter(
      (ev) => ev.isRedDate && !registeredDates.has(ev.date),
    );
    if (catalogMonth !== 'ALL') {
      const mStr = String(catalogMonth).padStart(2, '0');
      const monthMatches = pool.filter((ev) => ev.date.slice(5, 7) === mStr);
      if (monthMatches.length > 0) return monthMatches.slice(0, 3);
    }
    return pool.slice(0, 3);
  }, [catalogYear, catalogMonth, holidays]);

  // Recap Data Calculation across ALL activeTeachers (single month OR multi-month range)
  const recapSummaryAll = useMemo(
    () =>
      computeRangeAttendanceRecap(
        attendanceList,
        activeTeachers,
        currentMonth,
        recapMode === 'range' ? recapEndMonth : undefined,
      ),
    [attendanceList, activeTeachers, currentMonth, recapMode, recapEndMonth],
  );

  const effectiveRecapDays = useMemo(() => {
    if (!recapSummaryAll.isMultiMonth) return effectiveDaysInMonth;
    const activeDays = state.settings.activeDays;
    const dayNames: Day[] = ['Minggu' as Day, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    let total = 0;
    for (const ym of recapSummaryAll.months) {
      const [yNum, mNum] = ym.split('-').map(Number);
      if (!yNum || !mNum) continue;
      const daysInM = new Date(yNum, mNum, 0).getDate();
      let monthCount = 0;
      for (let d = 1; d <= daysInM; d++) {
        const curDate = new Date(yNum, mNum - 1, d);
        const dayName = dayNames[curDate.getDay()];
        const dateStr = `${yNum}-${String(mNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const isHol = holidays.some((h) => h.date === dateStr);
        const isOfficialRed = Boolean(
          isOfficialRedDate(dateStr, { includeCutiBersama: true, includeKaldikLibur: true }),
        );
        if (curDate.getDay() !== 0 && activeDays.includes(dayName) && !isHol && !isOfficialRed) {
          monthCount++;
        }
      }
      total += monthCount > 0 ? monthCount : 24;
    }
    return total;
  }, [recapSummaryAll.isMultiMonth, recapSummaryAll.months, effectiveDaysInMonth, state.settings.activeDays, holidays]);

  const recapDataAll = useMemo(() => {
    return recapSummaryAll.rows.map((r) => ({
      no: r.no,
      teacher: r.teacher,
      hadir: r.hadirOnly,
      izin: r.izin,
      sakit: r.sakit,
      alpa: r.alpa,
      dinas: r.dinas,
      total: r.totalRecorded,
      hasData: r.hasData,
      rate: r.rate,
      predikat: r.predikat,
      monthlyBreakdown: r.monthlyBreakdown,
    }));
  }, [recapSummaryAll]);

  const selectedRecapSet = useMemo(() => new Set(recapSelectedTeachers), [recapSelectedTeachers]);

  const overallAvgRate = useMemo(() => {
    const selectedRowsWithData = recapDataAll.filter(
      (r) => selectedRecapSet.has(r.teacher.id) && r.hasData,
    );
    if (selectedRowsWithData.length === 0) return 0;
    const sum = selectedRowsWithData.reduce((acc, r) => acc + r.rate, 0);
    return Math.round(sum / selectedRowsWithData.length);
  }, [recapDataAll, selectedRecapSet]);

  // Contextual Daily Statistics
  const dailyPresentCount = useMemo(() => {
    return activeTeachers.filter((t) => (dailyEntries[t.id]?.status ?? 'HADIR') === 'HADIR').length;
  }, [activeTeachers, dailyEntries]);

  const dailyPermitCount = useMemo(() => {
    return activeTeachers.filter((t) =>
      ['IZIN', 'SAKIT', 'DINAS_LUAR'].includes(dailyEntries[t.id]?.status),
    ).length;
  }, [activeTeachers, dailyEntries]);

  const dailyAbsentCount = useMemo(() => {
    return activeTeachers.filter((t) => dailyEntries[t.id]?.status === 'ALPA').length;
  }, [activeTeachers, dailyEntries]);

  const dailyAttendanceRate = useMemo(() => {
    return activeTeachers.length > 0
      ? Math.round((dailyPresentCount / activeTeachers.length) * 100)
      : 100;
  }, [dailyPresentCount, activeTeachers]);

  // 5. Add / Edit / Delete Holiday
  const handleSaveHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName.trim()) {
      onNotify('Tanggal dan nama hari libur harus diisi.', 'warning');
      return;
    }
    if (editingHolidayId) {
      onUpdateState((prev) => ({
        ...prev,
        holidays: (prev.holidays ?? [])
          .map((h) =>
            h.id === editingHolidayId
              ? { ...h, date: newHolidayDate, name: newHolidayName.trim() }
              : h,
          )
          .sort((a, b) => a.date.localeCompare(b.date)),
      }));
      setEditingHolidayId(null);
      setNewHolidayDate('');
      setNewHolidayName('');
      onNotify('Hari libur berhasil diperbarui.', 'success');
      return;
    }
    if (holidays.some((h) => h.date === newHolidayDate)) {
      onNotify('Tanggal ini sudah terdaftar dalam kalender libur madrasah.', 'warning');
      return;
    }
    const holiday: Holiday = {
      id: `HOL-${Date.now().toString(36)}`,
      date: newHolidayDate,
      name: newHolidayName.trim(),
    };
    onUpdateState((prev) => ({
      ...prev,
      holidays: [...(prev.holidays ?? []), holiday].sort((a, b) => a.date.localeCompare(b.date)),
    }));
    setNewHolidayDate('');
    setNewHolidayName('');
    onNotify(`Hari libur "${holiday.name}" ditambahkan.`, 'success');
  };

  const handleHolidayDatePickerChange = (dateVal: string) => {
    setNewHolidayDate(dateVal);
    if (!editingHolidayId && dateVal) {
      const match = getOfficialEventByDate(dateVal);
      if (match && !newHolidayName.trim()) {
        setNewHolidayName(match.name);
      }
    }
  };

  const handleStartEditHoliday = (hol: Holiday) => {
    setEditingHolidayId(hol.id);
    setNewHolidayDate(hol.date);
    setNewHolidayName(hol.name);
  };

  const handleCancelEditHoliday = () => {
    setEditingHolidayId(null);
    setNewHolidayDate('');
    setNewHolidayName('');
  };

  const handleDeleteHoliday = (id: string) => {
    if (editingHolidayId === id) {
      handleCancelEditHoliday();
    }
    onUpdateState((prev) => ({
      ...prev,
      holidays: (prev.holidays ?? []).filter((h) => h.id !== id),
    }));
    onNotify('Hari libur dihapus.', 'info');
  };

  const isCurrentDateHoliday = holidays.find((h) => h.date === currentDate);
  const officialCurrentDateEvent = useMemo(() => getOfficialEventByDate(currentDate), [currentDate]);
  const isCurrentDateSunday = useMemo(() => {
    if (!currentDate) return false;
    const [y, m, d] = currentDate.split('-').map(Number);
    return new Date(y, m - 1, d).getDay() === 0;
  }, [currentDate]);
  const recordedForDateSet = useMemo(
    () => new Set(attendanceList.filter((a) => a.date === currentDate).map((a) => a.teacherId)),
    [attendanceList, currentDate],
  );
  const isDateRecorded = recordedForDateSet.size > 0;
  const unrecordedTeachersCount = useMemo(
    () => activeTeachers.filter((t) => !recordedForDateSet.has(t.id)).length,
    [activeTeachers, recordedForDateSet],
  );

  // Filtered & Paginated Daily Teachers
  const filteredDailyTeachers = useMemo(() => {
    return activeTeachers.filter((t) => {
      if (dailySearch.trim()) {
        const query = dailySearch.toLowerCase();
        const matchName = t.name.toLowerCase().includes(query);
        const matchCode = t.code.toLowerCase().includes(query);
        if (!matchName && !matchCode) return false;
      }
      if (dailyStatusFilter !== 'all') {
        const entry = dailyEntries[t.id] ?? { status: 'HADIR' };
        if (dailyStatusFilter === 'PERMIT') {
          if (!['DINAS_LUAR', 'IZIN', 'SAKIT'].includes(entry.status)) return false;
        } else if (entry.status !== dailyStatusFilter) {
          return false;
        }
      }
      return true;
    });
  }, [activeTeachers, dailySearch, dailyStatusFilter, dailyEntries]);

  const totalDailyPages = Math.max(
    1,
    Math.ceil(filteredDailyTeachers.length / (dailyPageSize || 1)),
  );
  const safeDailyPage = Math.min(dailyPage, totalDailyPages);

  const paginatedDailyTeachers = useMemo(() => {
    if (dailyPageSize <= 0) return filteredDailyTeachers;
    const start = (safeDailyPage - 1) * dailyPageSize;
    return filteredDailyTeachers.slice(start, start + dailyPageSize);
  }, [filteredDailyTeachers, safeDailyPage, dailyPageSize]);

  // Full 30-day Mosaic & Filtered Ledger Rows for Tab "Per Guru"
  const teacherMonthDays = useMemo(() => {
    const list: Array<{
      dayNum: number;
      dateStr: string;
      dayName: string;
      isSunday: boolean;
      hol: Holiday | undefined;
      officialHol: OfficialCalendarEvent | undefined;
      record: AttendanceRecord | undefined;
      cfg: (typeof STATUS_CONFIG)[AttendanceStatus] | null;
    }> = [];
    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${currentYearNum}-${String(currentMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const curDate = new Date(currentYearNum, currentMonthNum - 1, d);
      const dayName = new Intl.DateTimeFormat('id-ID', { weekday: 'long' }).format(curDate);
      const isSunday = curDate.getDay() === 0;
      const hol = holidays.find((h) => h.date === dateStr);
      const officialHol = isOfficialRedDate(dateStr, {
        includeCutiBersama: true,
        includeKaldikLibur: true,
      });
      const record = attendanceList.find(
        (a) => a.teacherId === selectedTeacherId && a.date === dateStr,
      );
      list.push({
        dayNum: d,
        dateStr,
        dayName,
        isSunday,
        hol,
        officialHol,
        record,
        cfg: record ? STATUS_CONFIG[record.status] : null,
      });
    }
    return list;
  }, [daysInCurrentMonth, currentYearNum, currentMonthNum, holidays, attendanceList, selectedTeacherId]);

  const ledgerRows = useMemo(() => {
    return teacherMonthDays.filter((item) => {
      const isRed = Boolean(item.hol || item.officialHol);
      if (ledgerFilter === 'workdays' && (item.isSunday || isRed)) return false;
      if (ledgerFilter === 'leaves' && !item.isSunday && !isRed) return false;
      return true;
    });
  }, [teacherMonthDays, ledgerFilter]);

  const totalLedgerPages = Math.max(1, Math.ceil(ledgerRows.length / (ledgerPageSize || 1)));
  const safeLedgerPage = Math.min(ledgerPage, totalLedgerPages);
  const paginatedLedgerRows = useMemo(() => {
    if (ledgerPageSize <= 0) return ledgerRows;
    const start = (safeLedgerPage - 1) * ledgerPageSize;
    return ledgerRows.slice(start, start + ledgerPageSize);
  }, [ledgerRows, safeLedgerPage, ledgerPageSize]);

  // Filtered & Paginated Recap Rows
  const sortedRecapRows = useMemo(() => {
    let rows = [...recapDataAll];
    if (recapSearch.trim()) {
      const q = recapSearch.toLowerCase();
      rows = rows.filter(
        (r) => r.teacher.name.toLowerCase().includes(q) || r.teacher.code.toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      let diff = 0;
      if (recapSortKey === 'no') diff = a.no - b.no;
      else if (recapSortKey === 'name') diff = a.teacher.name.localeCompare(b.teacher.name);
      else if (recapSortKey === 'rate') diff = a.rate - b.rate;
      else if (recapSortKey === 'hadir') diff = a.hadir - b.hadir;
      return recapSortOrder === 'asc' ? diff : -diff;
    });
    return rows;
  }, [recapDataAll, recapSearch, recapSortKey, recapSortOrder]);

  const totalRecapPages = Math.max(1, Math.ceil(sortedRecapRows.length / (recapPageSize || 1)));
  const safeRecapPage = Math.min(recapPage, totalRecapPages);

  const paginatedRecapRows = useMemo(() => {
    if (recapPageSize <= 0) return sortedRecapRows;
    const start = (safeRecapPage - 1) * recapPageSize;
    return sortedRecapRows.slice(start, start + recapPageSize);
  }, [sortedRecapRows, safeRecapPage, recapPageSize]);

  const validRecapSelectedIds = useMemo(() => {
    const validSet = new Set(activeTeachers.map((t) => t.id));
    return recapSelectedTeachers.filter((id) => validSet.has(id));
  }, [activeTeachers, recapSelectedTeachers]);

  const allVisibleRecapSelected =
    paginatedRecapRows.length > 0 &&
    paginatedRecapRows.every((r) => selectedRecapSet.has(r.teacher.id));
  const someVisibleRecapSelected =
    paginatedRecapRows.some((r) => selectedRecapSet.has(r.teacher.id)) && !allVisibleRecapSelected;

  const toggleAllVisibleRecap = () => {
    setRecapBulkEngaged(true);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    if (allVisibleRecapSelected) {
      const visibleIds = new Set(paginatedRecapRows.map((r) => r.teacher.id));
      setRecapSelectedTeachers((prev) => prev.filter((id) => !visibleIds.has(id)));
    } else {
      setRecapSelectedTeachers((prev) => {
        const next = new Set(prev);
        for (const r of paginatedRecapRows) next.add(r.teacher.id);
        return Array.from(next);
      });
    }
  };

  const toggleSingleRecapTeacher = (id: string) => {
    setRecapBulkEngaged(true);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    setRecapSelectedTeachers((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id],
    );
  };

  // --- Daily Table Bulk Selection & Handlers ---
  const validDailySelectedIds = useMemo(() => {
    const activeIdSet = new Set(activeTeachers.map((t) => t.id));
    return dailySelectedIds.filter((id) => activeIdSet.has(id));
  }, [activeTeachers, dailySelectedIds]);
  const dailySelectedSet = useMemo(() => new Set(validDailySelectedIds), [validDailySelectedIds]);
  const isAllDailyPageSelected =
    paginatedDailyTeachers.length > 0 &&
    paginatedDailyTeachers.every((t) => dailySelectedSet.has(t.id));
  const isSomeDailyPageSelected =
    paginatedDailyTeachers.some((t) => dailySelectedSet.has(t.id)) && !isAllDailyPageSelected;

  const toggleDailySelectPage = () => {
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    const pageIds = paginatedDailyTeachers.map((t) => t.id);
    if (isAllDailyPageSelected) {
      const pageSet = new Set(pageIds);
      setDailySelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setDailySelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleDailySelectOne = (id: string) => {
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    setDailySelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleDailyBulkStatus = (status: AttendanceStatus) => {
    if (validDailySelectedIds.length === 0) return;
    const idSet = new Set(validDailySelectedIds);
    const nextEntries = { ...dailyEntries };
    for (const id of validDailySelectedIds) {
      nextEntries[id] = { ...(nextEntries[id] ?? { status: 'HADIR', notes: '' }), status };
    }
    setDailyEntries(nextEntries);
    onUpdateState((prev) => {
      const remaining = (prev.attendance ?? []).filter(
        (a) => !(a.date === currentDate && idSet.has(a.teacherId)),
      );
      const updatedRecords: AttendanceRecord[] = validDailySelectedIds.map((teacherId) => ({
        id: `ATT-${currentDate}-${teacherId}`,
        date: currentDate,
        teacherId,
        status,
        notes: nextEntries[teacherId]?.notes ?? '',
        recordedAt: new Date().toISOString(),
      }));
      return { ...prev, attendance: [...remaining, ...updatedRecords] };
    });
    onNotify(
      `Status ${validDailySelectedIds.length} pendidik terpilih diubah ke "${STATUS_CONFIG[status].label}" (${formatCompactDate(currentDate)}).`,
      'success',
    );
    setDailySelectedIds([]);
    setAttBulkStatusMode(false);
    setAttBulkConfirmDelete(false);
  };

  const handleDailyBulkExportCsv = () => {
    if (validDailySelectedIds.length === 0) return;
    const selectedList = activeTeachers.filter((t) => dailySelectedSet.has(t.id));
    const rows: string[][] = [
      ['No', 'Kode', 'Nama Pendidik', 'NIP/NPK', 'Jabatan', 'Tanggal', 'Status', 'Catatan'],
    ];
    selectedList.forEach((t, idx) => {
      const entry = dailyEntries[t.id] ?? { status: 'HADIR' as AttendanceStatus, notes: '' };
      rows.push([
        String(idx + 1),
        t.code,
        t.name,
        t.nip ?? '-',
        t.roleTitle ?? 'Guru Mapel',
        currentDate,
        STATUS_CONFIG[entry.status].label,
        entry.notes || '-',
      ]);
    });
    downloadAttendanceCsv(rows, `SIGNAL-presensi-harian-${currentDate}-terpilih.csv`);
    onNotify(`${selectedList.length} data presensi harian terpilih berhasil diekspor ke CSV.`, 'success');
  };

  const handleDailyBulkDelete = () => {
    if (validDailySelectedIds.length === 0) return;
    const idSet = new Set(validDailySelectedIds);
    const nextEntries = { ...dailyEntries };
    for (const id of validDailySelectedIds) {
      nextEntries[id] = { status: 'HADIR', notes: '' };
    }
    setDailyEntries(nextEntries);
    onUpdateState((prev) => ({
      ...prev,
      attendance: (prev.attendance ?? []).filter(
        (a) => !(a.date === currentDate && idSet.has(a.teacherId)),
      ),
    }));
    onNotify(
      `Catatan presensi ${validDailySelectedIds.length} pendidik pada ${formatCompactDate(currentDate)} berhasil dihapus.`,
      'info',
    );
    setDailySelectedIds([]);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
  };

  // --- Teacher Ledger Bulk Selection & Handlers ---
  const validLedgerSelectedDates = useMemo(() => {
    const validSet = new Set(ledgerRows.map((r) => r.dateStr));
    return ledgerSelectedDates.filter((d) => validSet.has(d));
  }, [ledgerRows, ledgerSelectedDates]);
  const ledgerSelectedSet = useMemo(() => new Set(validLedgerSelectedDates), [validLedgerSelectedDates]);
  const isAllLedgerPageSelected =
    paginatedLedgerRows.length > 0 &&
    paginatedLedgerRows.every((r) => ledgerSelectedSet.has(r.dateStr));
  const isSomeLedgerPageSelected =
    paginatedLedgerRows.some((r) => ledgerSelectedSet.has(r.dateStr)) && !isAllLedgerPageSelected;

  const toggleLedgerSelectPage = () => {
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    const pageDates = paginatedLedgerRows.map((r) => r.dateStr);
    if (isAllLedgerPageSelected) {
      const pageSet = new Set(pageDates);
      setLedgerSelectedDates((prev) => prev.filter((d) => !pageSet.has(d)));
    } else {
      setLedgerSelectedDates((prev) => Array.from(new Set([...prev, ...pageDates])));
    }
  };

  const toggleLedgerSelectOne = (dateStr: string) => {
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    setLedgerSelectedDates((prev) =>
      prev.includes(dateStr) ? prev.filter((d) => d !== dateStr) : [...prev, dateStr],
    );
  };

  const handleLedgerBulkStatus = (status: AttendanceStatus) => {
    if (validLedgerSelectedDates.length === 0 || !selectedTeacherId) return;
    const dateSet = new Set(validLedgerSelectedDates);
    onUpdateState((prev) => {
      const remaining = (prev.attendance ?? []).filter(
        (a) => !(a.teacherId === selectedTeacherId && dateSet.has(a.date)),
      );
      const added: AttendanceRecord[] = validLedgerSelectedDates.map((d) => ({
        id: `ATT-${d}-${selectedTeacherId}`,
        date: d,
        teacherId: selectedTeacherId,
        status,
        recordedAt: new Date().toISOString(),
      }));
      return { ...prev, attendance: [...remaining, ...added] };
    });
    onNotify(
      `Status ${validLedgerSelectedDates.length} tanggal terpilih diubah menjadi "${STATUS_CONFIG[status].label}".`,
      'success',
    );
    setLedgerSelectedDates([]);
    setAttBulkStatusMode(false);
    setAttBulkConfirmDelete(false);
  };

  const handleLedgerBulkExportCsv = () => {
    if (validLedgerSelectedDates.length === 0) return;
    const rowsSelected = ledgerRows.filter((r) => ledgerSelectedSet.has(r.dateStr));
    const rows: string[][] = [
      ['Tanggal', 'Hari', 'Keterangan Kalender', 'Pendidik', 'Status', 'Catatan'],
    ];
    for (const item of rowsSelected) {
      rows.push([
        item.dateStr,
        item.dayName,
        item.hol?.name || item.officialHol?.name || (item.isSunday ? 'Hari Minggu' : 'Hari KBM'),
        selectedTeacherObj?.name ?? '-',
        item.cfg?.label ?? (item.isSunday || item.hol || item.officialHol ? 'Libur' : 'Belum diisi'),
        item.record?.notes ?? '-',
      ]);
    }
    const safeCode = selectedTeacherObj?.code || 'guru';
    downloadAttendanceCsv(rows, `SIGNAL-ledger-${safeCode}-${currentMonth}-terpilih.csv`);
    onNotify(`${rowsSelected.length} baris riwayat presensi terpilih berhasil diekspor ke CSV.`, 'success');
  };

  const handleLedgerBulkDelete = () => {
    if (validLedgerSelectedDates.length === 0 || !selectedTeacherId) return;
    const dateSet = new Set(validLedgerSelectedDates);
    onUpdateState((prev) => ({
      ...prev,
      attendance: (prev.attendance ?? []).filter(
        (a) => !(a.teacherId === selectedTeacherId && dateSet.has(a.date)),
      ),
    }));
    onNotify(
      `${validLedgerSelectedDates.length} catatan presensi terpilih berhasil dihapus.`,
      'info',
    );
    setLedgerSelectedDates([]);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
  };

  // --- Recap Bulk Actions (Status Aktif Guru, Ekspor CSV Terpilih, Hapus Catatan Bulan Terpilih) ---
  const handleRecapBulkToggleActive = (nextActive: boolean) => {
    if (validRecapSelectedIds.length === 0) return;
    const idSet = new Set(validRecapSelectedIds);
    onUpdateState((prev) => ({
      ...prev,
      teachers: prev.teachers.map((t) => (idSet.has(t.id) ? { ...t, isActive: nextActive } : t)),
    }));
    onNotify(
      `Status ${validRecapSelectedIds.length} pendidik terpilih diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`,
      'success',
    );
    setRecapBulkEngaged(false);
    setAttBulkStatusMode(false);
    setAttBulkConfirmDelete(false);
  };

  const handleRecapBulkExportCsv = () => {
    if (validRecapSelectedIds.length === 0) return;
    const idSet = new Set(validRecapSelectedIds);
    const rowsSelected = sortedRecapRows.filter((r) => idSet.has(r.teacher.id));
    const extraMonthHeaders = recapSummaryAll.isMultiMonth
      ? recapSummaryAll.monthSummaries.map((m) => `${m.shortLabel} (%)`)
      : [];
    const rows: string[][] = [
      [
        'No',
        'Kode',
        'Nama Pendidik',
        'NIP/NPK',
        ...extraMonthHeaders,
        'Hadir',
        'Dinas Luar',
        'Sakit',
        'Izin',
        'Alpa',
        'H+DL',
        'Target Hari',
        'Kehadiran (%)',
      ],
    ];
    rowsSelected.forEach((r) => {
      const monthCells = recapSummaryAll.isMultiMonth
        ? recapSummaryAll.monthSummaries.map((m) => {
            const b = r.monthlyBreakdown[m.monthYear];
            return b?.hasData ? `${b.rate}%` : '-';
          })
        : [];
      rows.push([
        String(r.no),
        r.teacher.code,
        r.teacher.name,
        r.teacher.nip ?? '-',
        ...monthCells,
        String(r.hadir),
        String(r.dinas),
        String(r.sakit),
        String(r.izin),
        String(r.alpa),
        String(r.hadir + r.dinas),
        String(effectiveRecapDays),
        `${r.rate}%`,
      ]);
    });
    const periodSlug = recapSummaryAll.isMultiMonth
      ? `${recapSummaryAll.startMonth}_sd_${recapSummaryAll.endMonth}`
      : currentMonth;
    downloadAttendanceCsv(rows, `SIGNAL-rekap-presensi-${periodSlug}-terpilih.csv`);
    onNotify(`${rowsSelected.length} data rekap pendidik terpilih berhasil diekspor ke CSV.`, 'success');
  };

  const handleRecapBulkDelete = () => {
    if (validRecapSelectedIds.length === 0) return;
    const idSet = new Set(validRecapSelectedIds);
    const monthSet = new Set(recapSummaryAll.months);
    onUpdateState((prev) => ({
      ...prev,
      attendance: (prev.attendance ?? []).filter(
        (a) => !(monthSet.has(a.date.slice(0, 7)) && idSet.has(a.teacherId)),
      ),
    }));
    onNotify(
      `Catatan presensi periode ${recapSummaryAll.periodLabel} untuk ${validRecapSelectedIds.length} pendidik terpilih berhasil dihapus.`,
      'info',
    );
    setRecapBulkEngaged(false);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
  };

  // Filtered & Paginated Registered Holidays
  const filteredHolidays = useMemo(() => {
    let list = holidays;
    if (catalogMonth !== 'ALL') {
      const ymPrefix = `${catalogYear}-${String(catalogMonth).padStart(2, '0')}`;
      const monthMatches = list.filter((h) => h.date.startsWith(ymPrefix));
      // Only filter registered holidays if searching isn't set AND user clicked a month? Keep all if search is active, or show all filtered cleanly
      if (!holidaySearch.trim() && monthMatches.length > 0) {
        list = monthMatches;
      }
    }
    if (!holidaySearch.trim()) return list;
    const q = holidaySearch.toLowerCase();
    return holidays.filter((h) => h.name.toLowerCase().includes(q) || h.date.includes(q));
  }, [holidays, holidaySearch, catalogMonth, catalogYear]);

  const totalHolidayPages = Math.max(
    1,
    Math.ceil(filteredHolidays.length / (holidayPageSize || 1)),
  );
  const safeHolidayPage = Math.min(holidayPage, totalHolidayPages);

  const paginatedHolidays = useMemo(() => {
    if (holidayPageSize <= 0) return filteredHolidays;
    const start = (safeHolidayPage - 1) * holidayPageSize;
    return filteredHolidays.slice(start, start + holidayPageSize);
  }, [filteredHolidays, safeHolidayPage, holidayPageSize]);

  // --- Holiday Table Bulk Selection & Handlers ---
  const validHolidaySelectedIds = useMemo(() => {
    const holSet = new Set(holidays.map((h) => h.id));
    return holidaySelectedIds.filter((id) => holSet.has(id));
  }, [holidays, holidaySelectedIds]);
  const holidaySelectedSet = useMemo(() => new Set(validHolidaySelectedIds), [validHolidaySelectedIds]);
  const isAllHolidayPageSelected =
    paginatedHolidays.length > 0 &&
    paginatedHolidays.every((h) => holidaySelectedSet.has(h.id));
  const isSomeHolidayPageSelected =
    paginatedHolidays.some((h) => holidaySelectedSet.has(h.id)) && !isAllHolidayPageSelected;

  const toggleHolidaySelectPage = () => {
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    const pageIds = paginatedHolidays.map((h) => h.id);
    if (isAllHolidayPageSelected) {
      const pageSet = new Set(pageIds);
      setHolidaySelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setHolidaySelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const toggleHolidaySelectOne = (id: string) => {
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
    setHolidaySelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleHolidayBulkExportCsv = () => {
    if (validHolidaySelectedIds.length === 0) return;
    const selectedList = holidays.filter((h) => holidaySelectedSet.has(h.id));
    const rows: string[][] = [['Tanggal', 'Hari', 'Nama Hari Libur']];
    for (const h of selectedList) {
      rows.push([h.date, formatLocalDate(h.date), h.name]);
    }
    downloadAttendanceCsv(rows, `SIGNAL-hari-libur-terpilih-${catalogYear}.csv`);
    onNotify(`${selectedList.length} hari libur terpilih berhasil diekspor ke CSV.`, 'success');
  };

  const handleHolidayBulkDelete = () => {
    if (validHolidaySelectedIds.length === 0) return;
    const idSet = new Set(validHolidaySelectedIds);
    if (editingHolidayId && idSet.has(editingHolidayId)) {
      handleCancelEditHoliday();
    }
    onUpdateState((prev) => ({
      ...prev,
      holidays: (prev.holidays ?? []).filter((h) => !idSet.has(h.id)),
    }));
    onNotify(`${validHolidaySelectedIds.length} hari libur terpilih berhasil dihapus.`, 'info');
    setHolidaySelectedIds([]);
    setAttBulkConfirmDelete(false);
    setAttBulkStatusMode(false);
  };

  // Month event counts for the 12-month quick-jump strip
  const catalogMonthCounts = useMemo(() => {
    const counts = Array(12).fill(0) as number[];
    const allForYear = getOfficialEventsForYear(catalogYear).filter((e) =>
      catalogFilter === 'ALL' ? true : e.category === catalogFilter,
    );
    for (const ev of allForYear) {
      const mIdx = Number(ev.date.slice(5, 7)) - 1;
      if (mIdx >= 0 && mIdx < 12) counts[mIdx]++;
    }
    return counts;
  }, [catalogYear, catalogFilter]);

  // Official Calendar Catalog for Selected Year, Category & Month
  const catalogEvents = useMemo(() => {
    let events = getOfficialEventsForYear(catalogYear);
    if (catalogFilter !== 'ALL') {
      events = events.filter((e) => e.category === catalogFilter);
    }
    if (catalogMonth !== 'ALL') {
      const mStr = String(catalogMonth).padStart(2, '0');
      events = events.filter((e) => e.date.slice(5, 7) === mStr);
    }
    return events;
  }, [catalogYear, catalogFilter, catalogMonth]);

  const groupedCatalogEvents = useMemo(() => {
    const groups = new Map<string, OfficialCalendarEvent[]>();
    for (const ev of catalogEvents) {
      const ym = ev.date.slice(0, 7);
      const bucket = groups.get(ym);
      if (bucket) bucket.push(ev);
      else groups.set(ym, [ev]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [catalogEvents]);

  const unaddedCatalogEventsInYear = useMemo(() => {
    const registeredSet = new Set(holidays.map((h) => h.date));
    return getOfficialEventsForYear(catalogYear).filter(
      (e) => e.isRedDate && e.category === 'NASIONAL' && !registeredSet.has(e.date),
    );
  }, [catalogYear, holidays]);

  const detectedOfficialManualDate = useMemo(
    () => (newHolidayDate ? getOfficialEventByDate(newHolidayDate) : undefined),
    [newHolidayDate],
  );

  const selectedTeacherObj = useMemo(
    () => activeTeachers.find((t) => t.id === selectedTeacherId) ?? activeTeachers[0],
    [activeTeachers, selectedTeacherId],
  );

  const selectedTeacherMonthSummary = useMemo(() => {
    const recs = attendanceList.filter(
      (a) => a.teacherId === selectedTeacherId && a.date.startsWith(currentMonth),
    );
    return {
      hadir: recs.filter((r) => r.status === 'HADIR').length,
      dinas: recs.filter((r) => r.status === 'DINAS_LUAR').length,
      izin: recs.filter((r) => r.status === 'IZIN').length,
      sakit: recs.filter((r) => r.status === 'SAKIT').length,
      alpa: recs.filter((r) => r.status === 'ALPA').length,
    };
  }, [attendanceList, selectedTeacherId, currentMonth]);

  // Composition ratios for Luxury Footbar hairline strip
  const dailyTotal = Math.max(1, activeTeachers.length);
  const dailyHadirPct = (dailyPresentCount / dailyTotal) * 100;
  const dailyPermitPct = (dailyPermitCount / dailyTotal) * 100;
  const dailyAlpaPct = (dailyAbsentCount / dailyTotal) * 100;

  const teacherTotalDays = Math.max(
    1,
    selectedTeacherMonthSummary.hadir +
      selectedTeacherMonthSummary.dinas +
      selectedTeacherMonthSummary.izin +
      selectedTeacherMonthSummary.sakit +
      selectedTeacherMonthSummary.alpa,
  );
  const teacherHadirPct =
    ((selectedTeacherMonthSummary.hadir + selectedTeacherMonthSummary.dinas) / teacherTotalDays) *
    100;
  const teacherPermitPct =
    ((selectedTeacherMonthSummary.izin + selectedTeacherMonthSummary.sakit) / teacherTotalDays) *
    100;
  const teacherAlpaPct = (selectedTeacherMonthSummary.alpa / teacherTotalDays) * 100;

  const shouldReduceMotion = useReducedMotion();

  // SVG Ring progress math
  const ringPercent = activeTab === 'daily' ? dailyAttendanceRate : overallAvgRate;
  const ringRadius = 18;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - Math.min(100, Math.max(0, ringPercent)) / 100);

  return (
    <div className="attendance-screen">
      {/* A. Sovereign Executive Command Hero Bar + Bespoke Neo-Heritage Geometric Crest */}
      <div className="s5-att-hero-bar">
        <svg
          className="s5-att-hero-ornament"
          viewBox="0 0 180 180"
          fill="none"
          aria-hidden="true"
        >
          <g stroke="currentColor" strokeWidth="1.2">
            <rect x="42" y="42" width="96" height="96" rx="4" />
            <rect x="42" y="42" width="96" height="96" rx="4" transform="rotate(45 90 90)" />
            <circle cx="90" cy="90" r="34" />
            <circle cx="90" cy="90" r="62" strokeDasharray="4 4" />
          </g>
        </svg>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <div className="s5-page-kicker">PRESENSI PENDIDIK &amp; KALENDER KEMENAG RI</div>
          <h2 className="s5-page-title">Presensi Guru</h2>
          <p className="s5-page-subtitle">
            Catat kehadiran harian, presensi massal anti-tanggal merah, dan sinkronisasi kalender resmi Kemenag.
          </p>
        </div>

        <div
          className="page-actions"
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            gap: '10px',
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setActiveTab('holidays');
              setHolidayPage(1);
            }}
            data-s5-tooltip="Lihat daftar otomatis Tanggal Merah 2025–2028 & Kaldik Kemenag"
            style={{ height: '40px', padding: '0 15px', borderRadius: '10px' }}
          >
            <CalendarCheck2 size={15} />
            <span>Kalender Kemenag</span>
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => setPdfModalOpen(true)}
            data-s5-tooltip="Cetak laporan resmi rekap kehadiran A4 / F4"
            style={{ height: '40px', padding: '0 18px', borderRadius: '10px', fontSize: '12.5px' }}
          >
            <Download size={15} />
            <span>Ekspor PDF Resmi</span>
          </button>
        </div>
      </div>

      {/* B. Bespoke Luxury Metric Bento Cards */}
      <div className="s5-att-kpi-grid">
        {activeTab === 'daily' ? (
          <>
            <KpiMotionCard key="att-daily-0" className="s5-att-kpi-card" index={0}>
              <div>
                <div className="s5-att-kpi-label">Guru Hadir Hari Ini</div>
                <div className="s5-att-kpi-value s5-tnum">
                  <KpiAnimatedNumber value={dailyPresentCount} />{' '}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#526861' }}>
                    / {activeTeachers.length}
                  </span>
                </div>
                <div className="s5-att-kpi-sub">{formatCompactDate(currentDate)}</div>
              </div>
              <div className="s5-att-kpi-icon emerald">
                <UserCheck size={20} />
              </div>
            </KpiMotionCard>

            <KpiMotionCard key="att-daily-1" className="s5-att-kpi-card" index={1}>
              <div>
                <div className="s5-att-kpi-label">Tingkat Kehadiran</div>
                <div
                  className="s5-att-kpi-value s5-tnum"
                  style={{
                    color:
                      dailyAttendanceRate >= 90
                        ? '#1B5E43'
                        : dailyAttendanceRate >= 75
                        ? '#9C6F28'
                        : '#A63A2E',
                  }}
                >
                  <KpiAnimatedNumber value={dailyAttendanceRate} suffix="%" />
                </div>
                <div className="s5-att-kpi-sub">Rasio kehadiran aktif</div>
              </div>
              <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
                <circle cx="23" cy="23" r={ringRadius} fill="none" stroke="#E5ECE8" strokeWidth="4.5" />
                <motion.circle
                  cx="23"
                  cy="23"
                  r={ringRadius}
                  fill="none"
                  stroke={
                    dailyAttendanceRate >= 90
                      ? '#1B5E43'
                      : dailyAttendanceRate >= 75
                      ? '#C5A059'
                      : '#A63A2E'
                  }
                  strokeWidth="4.5"
                  strokeDasharray={ringCircumference}
                  strokeLinecap="round"
                  transform="rotate(-90 23 23)"
                  initial={shouldReduceMotion ? false : { strokeDashoffset: ringCircumference }}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
            </KpiMotionCard>

            <KpiMotionCard key="att-daily-2" className="s5-att-kpi-card" index={2}>
              <div>
                <div className="s5-att-kpi-label">Dinas Luar / Izin / Sakit</div>
                <div className="s5-att-kpi-value s5-tnum" style={{ color: '#9A6B21' }}>
                  <KpiAnimatedNumber value={dailyPermitCount} />
                </div>
                <div className="s5-att-kpi-sub">Pendidik dengan keterangan</div>
              </div>
              <div className="s5-att-kpi-icon gold">
                <BookOpen size={20} />
              </div>
            </KpiMotionCard>

            <KpiMotionCard key="att-daily-3" className="s5-att-kpi-card" index={3}>
              <div>
                <div className="s5-att-kpi-label">Tanpa Keterangan (Alpa)</div>
                <div
                  className="s5-att-kpi-value s5-tnum"
                  style={{ color: dailyAbsentCount > 0 ? '#A63A2E' : '#1B5E43' }}
                >
                  <KpiAnimatedNumber value={dailyAbsentCount} />
                </div>
                <div className="s5-att-kpi-sub">
                  {dailyAbsentCount === 0 ? 'Tertib seluruh pendidik' : 'Perlu tindak lanjut'}
                </div>
              </div>
              <div className={`s5-att-kpi-icon ${dailyAbsentCount > 0 ? 'rose' : 'emerald'}`}>
                {dailyAbsentCount > 0 ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
              </div>
            </KpiMotionCard>
          </>
        ) : (
          <>
            <KpiMotionCard key="att-recap-0" className="s5-att-kpi-card" index={0}>
              <div>
                <div className="s5-att-kpi-label">Pendidik Terpilih</div>
                <div className="s5-att-kpi-value s5-tnum">
                  <KpiAnimatedNumber value={recapSelectedTeachers.length} />{' '}
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#526861' }}>
                    / {activeTeachers.length}
                  </span>
                </div>
                <div className="s5-att-kpi-sub">Siap direkap &amp; ekspor PDF</div>
              </div>
              <div className="s5-att-kpi-icon slate">
                <Users size={20} />
              </div>
            </KpiMotionCard>

            <KpiMotionCard key="att-recap-1" className="s5-att-kpi-card" index={1}>
              <div>
                <div className="s5-att-kpi-label">Hari Efektif KBM</div>
                <div className="s5-att-kpi-value s5-tnum" style={{ color: '#1B5E43' }}>
                  <KpiAnimatedNumber value={effectiveDaysInMonth} />
                </div>
                <div className="s5-att-kpi-sub">Periode {currentMonth}</div>
              </div>
              <div className="s5-att-kpi-icon emerald">
                <CalendarDays size={20} />
              </div>
            </KpiMotionCard>

            <KpiMotionCard key="att-recap-2" className="s5-att-kpi-card" index={2}>
              <div>
                <div className="s5-att-kpi-label">Rata-rata Kehadiran</div>
                <div
                  className="s5-att-kpi-value s5-tnum"
                  style={{
                    color:
                      overallAvgRate >= 90
                        ? '#1B5E43'
                        : overallAvgRate >= 75
                        ? '#9C6F28'
                        : '#A63A2E',
                  }}
                >
                  <KpiAnimatedNumber value={overallAvgRate} suffix="%" />
                </div>
                <div className="s5-att-kpi-sub">Akumulasi pendidik terpilih</div>
              </div>
              <svg width="46" height="46" viewBox="0 0 46 46" aria-hidden="true">
                <circle cx="23" cy="23" r={ringRadius} fill="none" stroke="#E5ECE8" strokeWidth="4.5" />
                <motion.circle
                  cx="23"
                  cy="23"
                  r={ringRadius}
                  fill="none"
                  stroke={
                    overallAvgRate >= 90 ? '#1B5E43' : overallAvgRate >= 75 ? '#C5A059' : '#A63A2E'
                  }
                  strokeWidth="4.5"
                  strokeDasharray={ringCircumference}
                  strokeLinecap="round"
                  transform="rotate(-90 23 23)"
                  initial={shouldReduceMotion ? false : { strokeDashoffset: ringCircumference }}
                  animate={{ strokeDashoffset: ringOffset }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.68, ease: [0.16, 1, 0.3, 1] }}
                />
              </svg>
            </KpiMotionCard>

            <KpiMotionCard key="att-recap-3" className="s5-att-kpi-card" index={3}>
              <div>
                <div className="s5-att-kpi-label">Tanggal Merah Bulan Ini</div>
                <div className="s5-att-kpi-value s5-tnum" style={{ color: '#9A6B21' }}>
                  <KpiAnimatedNumber value={holidaysInMonth.length} />
                </div>
                <div className="s5-att-kpi-sub">Libur madrasah &amp; nasional</div>
              </div>
              <div className="s5-att-kpi-icon gold">
                <Calendar size={20} />
              </div>
            </KpiMotionCard>
          </>
        )}
      </div>

      {/* C. Sub-navigasi Tugas (Segmented Navigation) */}
      <div className="s5-segmented-nav" style={{ marginBottom: 0 }}>
        <button
          type="button"
          className={`s5-segmented-btn ${activeTab === 'daily' ? 'active' : ''}`}
          onClick={() => {
            switchTabSafe('daily');
            setDailyPage(1);
          }}
        >
          <CalendarDays size={14} />
          <span>Harian</span>
        </button>
        <button
          type="button"
          className={`s5-segmented-btn ${activeTab === 'monthly' ? 'active' : ''}`}
          onClick={() => switchTabSafe('monthly')}
        >
          <Calendar size={14} />
          <span>Massal Bulanan</span>
        </button>
        <button
          type="button"
          className={`s5-segmented-btn ${activeTab === 'teacher' ? 'active' : ''}`}
          onClick={() => {
            switchTabSafe('teacher');
            setLedgerPage(1);
          }}
        >
          <Users size={14} />
          <span>Per Guru</span>
        </button>
        <button
          type="button"
          className={`s5-segmented-btn ${activeTab === 'recap' ? 'active' : ''}`}
          onClick={() => {
            switchTabSafe('recap');
            setRecapPage(1);
          }}
        >
          <UserCheck size={14} />
          <span>Rekap &amp; PDF</span>
        </button>
        <button
          type="button"
          className={`s5-segmented-btn ${activeTab === 'holidays' ? 'active' : ''}`}
          onClick={() => {
            switchTabSafe('holidays');
            setHolidayPage(1);
          }}
        >
          <Clock size={14} />
          <span className="s5-tnum">Hari Libur ({holidays.length})</span>
        </button>
      </div>

      {/* Proactive Smart National Holiday & Kaldik Kemenag Banner (with direct 1-click chips) */}
      {unaddedOfficialRedDatesInMonth.length > 0 && activeTab !== 'holidays' && (
        <div className="s5-holiday-alert-banner kemenag">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: '260px' }}>
            <div className="s5-att-kpi-icon gold" style={{ width: '38px', height: '38px' }}>
              <BellRing size={17} />
            </div>
            <div>
              <strong style={{ fontSize: '13px', color: '#5F4311', display: 'block' }}>
                Pemberitahuan Tanggal Merah ({activeViewMonth}): {unaddedOfficialRedDatesInMonth.length} Libur Resmi belum didaftarkan
              </strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                {unaddedOfficialRedDatesInMonth.slice(0, 3).map((ev) => (
                  <button
                    key={ev.date}
                    type="button"
                    className="s5-quick-red-chip"
                    onClick={() => handleQuickToggleOfficialEvent(ev)}
                    data-s5-tooltip={`${ev.decree} · Klik untuk menambahkan langsung`}
                  >
                    <Plus size={12} />
                    <span>
                      {formatCompactDate(ev.date)} · {ev.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={() =>
                handleBatchImportHolidays(
                  unaddedOfficialRedDatesInMonth,
                  `Bulan ${activeViewMonth}`,
                )
              }
              style={{ height: '34px', fontSize: '12px' }}
            >
              <CheckCircle2 size={14} /> Tambah Semua ({unaddedOfficialRedDatesInMonth.length})
            </button>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setCatalogYear(Number(activeViewMonth.slice(0, 4)) || 2026);
                setCatalogMonth(Number(activeViewMonth.slice(5, 7)) || 'ALL');
                setActiveTab('holidays');
              }}
              style={{ height: '34px', fontSize: '12px' }}
            >
              Buka Katalog
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: INPUT HARIAN                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'daily' && (
        <div className="s5-att-panel">
          <div className="s5-att-panel-header">
            <div>
              <div className="s5-page-kicker">PRESENSI HARIAN</div>
              <h3 style={{ margin: '3px 0 0', fontSize: '17px', color: '#0B2923', fontWeight: 700 }}>
                Pencatatan Kehadiran Pendidik
              </h3>
            </div>
            <button
              type="button"
              className="button button-secondary"
              onClick={handleSetAllPresent}
              data-s5-tooltip="Setel seluruh pendidik aktif menjadi Hadir"
              style={{ height: '38px' }}
            >
              <CheckCircle2 size={14} /> Set Semua Hadir
            </button>
          </div>

          {/* Contextual Date Stepper & Quick Filter Toolbar */}
          <div className="s5-att-toolbar">
            <div className="s5-field-chip">
              <label htmlFor="daily-date">Tanggal</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <button
                  type="button"
                  className="s5-date-stepper-btn"
                  onClick={() => {
                    setCurrentDate(shiftIsoDate(currentDate, -1));
                    setDailyPage(1);
                  }}
                  data-s5-tooltip="Hari sebelumnya"
                  aria-label="Hari sebelumnya"
                >
                  <ChevronLeft size={15} />
                </button>
                <div className="s5-input-shell">
                  <CalendarDays size={14} color="#124037" />
                  <input
                    id="daily-date"
                    type="date"
                    value={currentDate}
                    onChange={(e) => {
                      setCurrentDate(e.target.value);
                      setDailyPage(1);
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="s5-date-stepper-btn"
                  onClick={() => {
                    setCurrentDate(shiftIsoDate(currentDate, 1));
                    setDailyPage(1);
                  }}
                  data-s5-tooltip="Hari berikutnya"
                  aria-label="Hari berikutnya"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>

            <div className="s5-field-chip" style={{ flex: 1, minWidth: '180px', maxWidth: '250px' }}>
              <label htmlFor="daily-search">Cari Guru</label>
              <div className="s5-input-shell" style={{ width: '100%' }}>
                <Search size={14} color="#687E77" />
                <input
                  id="daily-search"
                  type="text"
                  placeholder="Nama atau kode…"
                  value={dailySearch}
                  onChange={(e) => {
                    setDailySearch(e.target.value);
                    setDailyPage(1);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="s5-field-chip">
              <label>Filter Cepat</label>
              <div className="s5-status-segmented" role="group" aria-label="Filter status kehadiran">
                {(
                  [
                    { id: 'all', label: `Semua (${activeTeachers.length})` },
                    { id: 'HADIR', label: `Hadir (${dailyPresentCount})` },
                    { id: 'PERMIT', label: `DL/I/S (${dailyPermitCount})` },
                    { id: 'ALPA', label: `Alpa (${dailyAbsentCount})` },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`s5-status-chip ${dailyStatusFilter === item.id ? 'is-active HADIR' : ''}`}
                    style={{ padding: '0 10px', whiteSpace: 'nowrap' }}
                    onClick={() => {
                      setDailyStatusFilter(item.id);
                      setDailyPage(1);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="toolbar-spacer" />

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0B2923' }}>
                {formatLocalDate(currentDate)}
              </div>
              <div className="s5-tnum" style={{ fontSize: '11px', color: '#526861' }}>
                Menampilkan {filteredDailyTeachers.length} dari {activeTeachers.length} pendidik
              </div>
            </div>
          </div>

          {/* Red-Date / Official Holiday / Sunday Alert on Current Date */}
          {(isCurrentDateHoliday ||
            (officialCurrentDateEvent && officialCurrentDateEvent.isRedDate) ||
            isCurrentDateSunday) && (
            <div className="s5-holiday-alert-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div className="s5-att-kpi-icon rose" style={{ width: '38px', height: '38px' }}>
                  <Calendar size={17} />
                </div>
                <div>
                  <strong style={{ fontSize: '13px', color: '#8F2D24', display: 'block' }}>
                    {isCurrentDateHoliday
                      ? `Hari Libur Terdaftar: ${isCurrentDateHoliday.name}`
                      : officialCurrentDateEvent
                      ? `Tanggal Merah (${getCategoryLabel(officialCurrentDateEvent.category)}): ${officialCurrentDateEvent.name}`
                      : 'Hari Minggu — Libur Akhir Pekan'}
                  </strong>
                  <span style={{ fontSize: '11.5px', color: '#7D3C36' }}>
                    {isCurrentDateHoliday
                      ? 'Tanggal ini otomatis dikecualikan pada rekap KBM efektif.'
                      : officialCurrentDateEvent
                      ? `Terdeteksi dari ${officialCurrentDateEvent.decree}.`
                      : 'Tidak ada jadwal KBM reguler pada hari Ahad.'}
                  </span>
                </div>
              </div>
              {officialCurrentDateEvent && !isCurrentDateHoliday && (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => handleQuickToggleOfficialEvent(officialCurrentDateEvent)}
                  style={{ height: '34px', fontSize: '12px' }}
                >
                  <Plus size={14} /> Daftarkan Libur Ini
                </button>
              )}
            </div>
          )}

          {/* Calm Notice When Date Has No Saved Records OR Newly Added Unrecorded Teachers */}
          {(!isDateRecorded || unrecordedTeachersCount > 0) &&
            !isCurrentDateHoliday &&
            !(officialCurrentDateEvent && officialCurrentDateEvent.isRedDate) &&
            !isCurrentDateSunday && (
              <div className="s5-holiday-alert-banner calm">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className="s5-att-kpi-icon emerald" style={{ width: '36px', height: '36px' }}>
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <strong style={{ fontSize: '13px', color: '#0B2923', display: 'block' }}>
                      {!isDateRecorded
                        ? 'Presensi tanggal ini belum tersimpan'
                        : `${unrecordedTeachersCount} pendidik baru belum tercatat pada tanggal ini`}
                    </strong>
                    <span style={{ fontSize: '11.5px', color: '#2F443E' }}>
                      Klik status cepat (H / DL / I / S / A) pada tabel atau simpan langsung seluruh guru hadir.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleSetAllPresentAndSave}
                  style={{ height: '36px', fontSize: '12px' }}
                >
                  <CheckCircle2 size={14} /> Tandai Semua Hadir &amp; Simpan
                </button>
              </div>
            )}

          {/* Dedicated Figma Pro Daily Attendance Table (.s5-daily-table) */}
          <div className="s5-daily-table-wrap">
            <table className="data-table s5-daily-table">
              <thead>
                <tr>
                  <th className="s5-checkbox-col">
                    <label
                      className="s5-checkbox-label"
                      title={isAllDailyPageSelected ? 'Batal pilih halaman ini' : 'Pilih semua di halaman ini'}
                    >
                      <input
                        type="checkbox"
                        className="s5-checkbox-input"
                        checked={isAllDailyPageSelected}
                        onChange={toggleDailySelectPage}
                        aria-label="Pilih semua pendidik di halaman ini"
                      />
                      <span className={`s5-checkbox-box ${isSomeDailyPageSelected ? 'indeterminate' : ''}`}>
                        {isAllDailyPageSelected ? (
                          <Check size={12} strokeWidth={3} />
                        ) : isSomeDailyPageSelected ? (
                          <Minus size={12} strokeWidth={3} />
                        ) : null}
                      </span>
                    </label>
                  </th>
                  <th style={{ width: '52px', textAlign: 'center' }}>No</th>
                  <th style={{ width: '88px', textAlign: 'center' }}>Kode</th>
                  <th>Pendidik</th>
                  <th style={{ width: '250px', textAlign: 'center' }}>Status Kehadiran (1-Klik)</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {paginatedDailyTeachers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '32px', color: '#526861' }}>
                      Tidak ada pendidik yang cocok dengan filter aktif.
                    </td>
                  </tr>
                ) : (
                  paginatedDailyTeachers.map((teacher, index) => {
                    const entry = dailyEntries[teacher.id] ?? { status: 'HADIR', notes: '' };
                    const globalIdx =
                      (safeDailyPage - 1) * (dailyPageSize || filteredDailyTeachers.length) +
                      index +
                      1;
                    const rowStateClass =
                      entry.status === 'ALPA'
                        ? 'is-alpa'
                        : entry.status !== 'HADIR'
                        ? 'is-non-present'
                        : '';
                    const isSelected = dailySelectedSet.has(teacher.id);
                    return (
                      <tr
                        key={teacher.id}
                        className={`s5-daily-row ${rowStateClass} ${isSelected ? 's5-row-selected' : ''}`}
                      >
                        <td className="s5-checkbox-col">
                          <label className="s5-checkbox-label" title={`Pilih ${teacher.name}`}>
                            <input
                              type="checkbox"
                              className="s5-checkbox-input"
                              checked={isSelected}
                              onChange={() => toggleDailySelectOne(teacher.id)}
                              aria-label={`Pilih ${teacher.name}`}
                            />
                            <span className="s5-checkbox-box">
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </span>
                          </label>
                        </td>
                        <td
                          className="s5-tnum"
                          style={{ textAlign: 'center', color: '#526861', fontSize: '11.5px' }}
                        >
                          {globalIdx}
                        </td>
                        <td
                          className="s5-tnum"
                          style={{
                            textAlign: 'center',
                            fontWeight: 700,
                            color: '#124037',
                            fontSize: '12px',
                          }}
                        >
                          {teacher.code}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <MadrasahTeacherAvatar teacher={teacher} size={34} showStatusDot={false} />
                            <div>
                              <strong style={{ fontSize: '13px', color: '#0F201C', display: 'block' }}>
                                {teacher.name}
                              </strong>
                              <span style={{ fontSize: '11px', color: '#526861' }}>
                                {teacher.roleTitle || 'Guru Mapel'}
                                {teacher.nip ? ` · NIP. ${teacher.nip}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div
                            className="s5-status-segmented"
                            role="group"
                            aria-label={`Status ${teacher.name}`}
                          >
                            {QUICK_STATUS_ORDER.map((statusKey) => {
                              const cfg = STATUS_CONFIG[statusKey];
                              const isActive = entry.status === statusKey;
                              return (
                                <button
                                  key={statusKey}
                                  type="button"
                                  className={`s5-status-chip ${statusKey} ${isActive ? 'is-active' : ''}`}
                                  onClick={() =>
                                    setDailyEntries({
                                      ...dailyEntries,
                                      [teacher.id]: { ...entry, status: statusKey },
                                    })
                                  }
                                  data-s5-tooltip={cfg.label}
                                  aria-label={`${cfg.label} untuk ${teacher.name}`}
                                  aria-pressed={isActive}
                                >
                                  {cfg.short}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            className="s5-daily-note-input"
                            placeholder="Catatan opsional…"
                            value={entry.notes}
                            onChange={(e) =>
                              setDailyEntries({
                                ...dailyEntries,
                                [teacher.id]: { ...entry, notes: e.target.value },
                              })
                            }
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Luxury Architectural Footbar (.s5-att-footbar) */}
          <div className="s5-att-footbar">
            <div className="s5-footbar-composition" aria-hidden="true">
              <div className="s5-footbar-seg hadir" style={{ width: `${dailyHadirPct}%` }} />
              <div className="s5-footbar-seg permit" style={{ width: `${dailyPermitPct}%` }} />
              <div className="s5-footbar-seg alpa" style={{ width: `${dailyAlpaPct}%` }} />
            </div>

            <div className="s5-att-footbar-row">
              <div className="s5-footbar-meta">
                <select
                  aria-label="Jumlah baris tabel harian"
                  className="s5-footbar-select"
                  value={dailyPageSize}
                  onChange={(e) => {
                    setDailyPageSize(Number(e.target.value));
                    setDailyPage(1);
                  }}
                >
                  <option value={10}>10 Baris</option>
                  <option value={20}>20 Baris</option>
                  <option value={25}>25 Baris</option>
                  <option value={0}>Semua ({filteredDailyTeachers.length})</option>
                </select>
                <span className="s5-tnum">
                  Hadir <strong style={{ color: '#1B5E43' }}>{dailyPresentCount}</strong> · Ket.{' '}
                  <strong style={{ color: '#9C6F28' }}>{dailyPermitCount}</strong> · Alpa{' '}
                  <strong style={{ color: dailyAbsentCount > 0 ? '#A63A2E' : undefined }}>
                    {dailyAbsentCount}
                  </strong>
                </span>
              </div>

              <div className="s5-footbar-actions">
                {dailyPageSize > 0 && totalDailyPages > 1 && (
                  <div className="s5-pagination-group" aria-label="Navigasi halaman tabel harian">
                    <button
                      type="button"
                      className="s5-page-btn"
                      disabled={safeDailyPage <= 1}
                      onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                      aria-label="Halaman sebelumnya"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {getPaginationItems(safeDailyPage, totalDailyPages).map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`d-ell-${idx}`} style={{ padding: '0 4px', color: '#8A9B95' }}>
                          …
                        </span>
                      ) : (
                        <button
                          key={`d-pg-${item}`}
                          type="button"
                          className={`s5-page-btn s5-tnum ${safeDailyPage === item ? 'is-active' : ''}`}
                          onClick={() => setDailyPage(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      className="s5-page-btn"
                      disabled={safeDailyPage >= totalDailyPages}
                      onClick={() => setDailyPage((p) => Math.min(totalDailyPages, p + 1))}
                      aria-label="Halaman berikutnya"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="button button-primary"
                  onClick={handleSaveDaily}
                  style={{ height: '36px', padding: '0 16px', fontSize: '12.5px' }}
                >
                  <Save size={14} /> Simpan Presensi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: INPUT MASSAL BULANAN (AUTO-SKIP TANGGAL MERAH & KALDIK KEMENAG)    */}
      {/* ========================================================================= */}
      {activeTab === 'monthly' && (
        <div className="s5-att-panel">
          <div className="s5-att-panel-header">
            <div>
              <div className="s5-page-kicker">PRESENSI MASSAL BULANAN</div>
              <h3 style={{ margin: '3px 0 0', fontSize: '17px', color: '#0B2923', fontWeight: 700 }}>
                Terapkan Status Kehadiran Rentang Tanggal
              </h3>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <div className="s5-input-shell" style={{ height: '34px' }}>
                <Calendar size={14} color="#124037" />
                <input
                  id="mass-month-quick"
                  aria-label="Pilih bulan penuh untuk input massal"
                  type="month"
                  value={massMonthStartDate.slice(0, 7)}
                  onChange={(e) => applyMassMonthRange(e.target.value)}
                />
              </div>

              <div className="s5-status-segmented" role="group" aria-label="Preset rentang tanggal">
                <button
                  type="button"
                  className={`s5-status-chip ${activeMassPreset === 'week' ? 'is-active HADIR' : ''}`}
                  style={{ padding: '0 10px' }}
                  onClick={() => applyMassPreset('week')}
                >
                  7 Hari
                </button>
                <button
                  type="button"
                  className={`s5-status-chip ${activeMassPreset === 'fortnight' ? 'is-active HADIR' : ''}`}
                  style={{ padding: '0 10px' }}
                  onClick={() => applyMassPreset('fortnight')}
                >
                  14 Hari
                </button>
                <button
                  type="button"
                  className={`s5-status-chip ${activeMassPreset === 'month' ? 'is-active HADIR' : ''}`}
                  style={{ padding: '0 10px' }}
                  onClick={() => applyMassPreset('month')}
                >
                  Bulan Penuh
                </button>
              </div>
            </div>
          </div>

          {/* Clean Form Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '14px',
              padding: '16px',
              background: '#F8FAF8',
              border: '0.75px solid #DCE5E0',
              borderRadius: '14px',
            }}
          >
            <div className="s5-field-chip">
              <label htmlFor="mass-status">Status Diterapkan</label>
              <div className="s5-input-shell">
                <select
                  id="mass-status"
                  value={massMonthStatus}
                  onChange={(e) => setMassMonthStatus(e.target.value as AttendanceStatus)}
                  style={{ width: '100%' }}
                >
                  <option value="HADIR">Hadir (H)</option>
                  <option value="DINAS_LUAR">Dinas Luar (DL)</option>
                  <option value="IZIN">Izin (I)</option>
                  <option value="SAKIT">Sakit (S)</option>
                  <option value="ALPA">Alpa (A)</option>
                </select>
              </div>
            </div>

            <div className="s5-field-chip">
              <label htmlFor="mass-target">Sasaran Pendidik</label>
              <div className="s5-input-shell">
                <select
                  id="mass-target"
                  value={massMonthTarget}
                  onChange={(e) => {
                    const nextTarget = e.target.value as 'all' | 'selected';
                    setMassMonthTarget(nextTarget);
                    if (nextTarget === 'selected' && massMonthSelectedTeachers.length === 0) {
                      setMassMonthSelectedTeachers(activeTeachers.map((t) => t.id));
                    }
                  }}
                  style={{ width: '100%' }}
                >
                  <option value="all">Seluruh Guru Aktif ({activeTeachers.length})</option>
                  <option value="selected">Guru Pilihan ({massMonthSelectedTeachers.length})</option>
                </select>
              </div>
            </div>

            <div className="s5-field-chip">
              <label htmlFor="mass-start">Mulai Tanggal</label>
              <div className="s5-input-shell">
                <input
                  id="mass-start"
                  type="date"
                  value={massMonthStartDate}
                  onChange={(e) => setMassMonthStartDate(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="s5-field-chip">
              <label htmlFor="mass-end">Sampai Tanggal</label>
              <div className="s5-input-shell">
                <input
                  id="mass-end"
                  type="date"
                  value={massMonthEndDate}
                  onChange={(e) => setMassMonthEndDate(e.target.value)}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>

          {/* 3 Automatic Red-Date Exclusion Switches */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '18px',
              marginTop: '14px',
              paddingLeft: '4px',
            }}
          >
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#0F201C',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoSkipNationalHolidays}
                onChange={(e) => setAutoSkipNationalHolidays(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#124037' }}
              />
              <span>Kecualikan Libur Nasional (SKB 3 Menteri)</span>
            </label>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#2F443E',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoSkipCutiBersama}
                disabled={!autoSkipNationalHolidays}
                onChange={(e) => setAutoSkipCutiBersama(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#124037' }}
              />
              <span>Kecualikan Cuti Bersama</span>
            </label>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12.5px',
                fontWeight: 600,
                color: '#2F443E',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={autoSkipKaldikMadrasah}
                disabled={!autoSkipNationalHolidays}
                onChange={(e) => setAutoSkipKaldikMadrasah(e.target.checked)}
                style={{ width: '16px', height: '16px', accentColor: '#124037' }}
              />
              <span>Kecualikan Libur Kaldik Kemenag RI</span>
            </label>
          </div>

          {/* Live Date Range Preview & Visual Mosaic Calendar Strip */}
          <div className="s5-mass-preview-box">
            <div className="s5-mass-stat-row">
              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#526861',
                  }}
                >
                  Hari Efektif Diisi
                </div>
                <strong className="s5-tnum" style={{ fontSize: '20px', fontWeight: 700, color: '#1B5E43' }}>
                  {massPreview.effectiveDates.length} Hari KBM
                </strong>
              </div>

              <div className="s5-topbar-divider" style={{ height: '30px' }} />

              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#526861',
                  }}
                >
                  Minggu Dilewati
                </div>
                <strong className="s5-tnum" style={{ fontSize: '16px', fontWeight: 700, color: '#2F443E' }}>
                  {massPreview.skippedSundays.length} Hari
                </strong>
              </div>

              <div>
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: '#526861',
                  }}
                >
                  Tanggal Merah Dikecualikan
                </div>
                <strong className="s5-tnum" style={{ fontSize: '16px', fontWeight: 700, color: '#A63A2E' }}>
                  {massPreview.skippedRegisteredHolidays.length +
                    massPreview.skippedOfficialHolidays.length}{' '}
                  Hari
                </strong>
              </div>
            </div>

            {massRangeMosaic.length > 0 && (
              <div className="s5-range-mosaic" aria-label="Peta hari efektif rentang tanggal">
                {massRangeMosaic.map((cell) => (
                  <span
                    key={cell.dateStr}
                    className={`s5-mosaic-cell s5-tnum ${cell.kind}`}
                    data-s5-tooltip={cell.tooltip}
                  >
                    {cell.dayNum}
                  </span>
                ))}
              </div>
            )}

            {(massPreview.skippedRegisteredHolidays.length > 0 ||
              massPreview.skippedOfficialHolidays.length > 0) && (
              <div className="s5-excluded-date-list">
                {massPreview.skippedRegisteredHolidays.map((h) => (
                  <span key={`reg-${h.date}`} className="s5-excluded-date-item">
                    {formatCompactDate(h.date)} · {h.name}
                  </span>
                ))}
                {massPreview.skippedOfficialHolidays.map((h) => (
                  <span key={`off-${h.date}`} className="s5-excluded-date-item">
                    {formatCompactDate(h.date)} · {h.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Teacher Checklist when target is 'selected' */}
          {massMonthTarget === 'selected' && (
            <div style={{ marginTop: '16px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#2F443E',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Pilih Guru Sasaran ({massMonthSelectedTeachers.length} terpilih)
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="button button-quiet"
                    style={{ fontSize: '11.5px', padding: '4px 8px' }}
                    onClick={() => setMassMonthSelectedTeachers(activeTeachers.map((t) => t.id))}
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    style={{ fontSize: '11.5px', padding: '4px 8px' }}
                    onClick={() => setMassMonthSelectedTeachers([])}
                  >
                    Reset
                  </button>
                </div>
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                  gap: '8px',
                  maxHeight: '165px',
                  overflowY: 'auto',
                  border: '0.75px solid #D5E0DA',
                  padding: '12px',
                  borderRadius: '12px',
                  background: '#FFFFFF',
                }}
              >
                {activeTeachers.map((teacher) => (
                  <label
                    key={teacher.id}
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={massMonthSelectedTeachers.includes(teacher.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setMassMonthSelectedTeachers([...massMonthSelectedTeachers, teacher.id]);
                        } else {
                          setMassMonthSelectedTeachers(
                            massMonthSelectedTeachers.filter((id) => id !== teacher.id),
                          );
                        }
                      }}
                    />
                    <span>
                      {teacher.name} <span style={{ color: '#526861' }}>({teacher.code})</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Mass Monthly Luxury Footbar */}
          <div className="s5-att-footbar">
            <div className="s5-att-footbar-row">
              <div className="s5-footbar-meta s5-tnum">
                <span>
                  Sasaran:{' '}
                  <strong>
                    {massMonthTarget === 'all'
                      ? activeTeachers.length
                      : massMonthSelectedTeachers.length}{' '}
                    Guru
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Hari KBM Efektif:{' '}
                  <strong style={{ color: '#1B5E43' }}>{massPreview.effectiveDates.length} hari</strong>
                </span>
                <span>·</span>
                <span>
                  Dilewati:{' '}
                  <strong style={{ color: '#A63A2E' }}>
                    {massPreview.skippedSundays.length +
                      massPreview.skippedRegisteredHolidays.length +
                      massPreview.skippedOfficialHolidays.length}{' '}
                    hari
                  </strong>
                </span>
              </div>

              <button
                type="button"
                className="button button-primary"
                onClick={handleSaveMassMonthly}
                style={{ height: '38px', padding: '0 20px', fontSize: '12.5px' }}
              >
                <Check size={15} /> Terapkan Presensi ({massPreview.effectiveDates.length} Hari Efektif)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: PER GURU (INDIVIDUAL LEDGER + 30-DAY MOSAIC + 1-CLICK INLINE)      */}
      {/* ========================================================================= */}
      {activeTab === 'teacher' && (
        <div className="s5-att-panel">
          <div className="s5-att-panel-header">
            <div>
              <div className="s5-page-kicker">LEDGER INDIVIDUAL</div>
              <h3 style={{ margin: '3px 0 0', fontSize: '17px', color: '#0B2923', fontWeight: 700 }}>
                Riwayat Kalender Presensi per Pendidik
              </h3>
            </div>
            {selectedTeacherObj && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <MadrasahTeacherAvatar teacher={selectedTeacherObj} size={36} showStatusDot={false} />
                <div>
                  <strong style={{ fontSize: '13px', color: '#0B2923', display: 'block' }}>
                    {selectedTeacherObj.name}
                  </strong>
                  <span className="s5-tnum" style={{ fontSize: '11.5px', color: '#526861' }}>
                    H: {selectedTeacherMonthSummary.hadir} · DL: {selectedTeacherMonthSummary.dinas} · I:{' '}
                    {selectedTeacherMonthSummary.izin} · S: {selectedTeacherMonthSummary.sakit} · A:{' '}
                    {selectedTeacherMonthSummary.alpa}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Contextual Toolbar */}
          <div className="s5-att-toolbar">
            <div className="s5-field-chip" style={{ minWidth: '210px' }}>
              <label htmlFor="teacher-picker">Pilih Pendidik</label>
              <div className="s5-input-shell">
                <Users size={14} color="#124037" />
                <select
                  id="teacher-picker"
                  value={selectedTeacherId}
                  onChange={(e) => {
                    setSelectedTeacherId(e.target.value);
                    setLedgerPage(1);
                  }}
                  style={{ width: '100%' }}
                >
                  {activeTeachers.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="s5-field-chip">
              <label htmlFor="month-picker">Bulan &amp; Tahun</label>
              <div className="s5-input-shell">
                <Calendar size={14} color="#124037" />
                <input
                  id="month-picker"
                  type="month"
                  value={currentMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCurrentMonth(val);
                    setLedgerPage(1);
                    if (/^\d{4}-\d{2}$/.test(val)) {
                      const [yNum, mNum] = val.split('-').map(Number);
                      const lastDay = new Date(yNum, mNum, 0).getDate();
                      setMassMonthStartDate(`${val}-01`);
                      setMassMonthEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                    }
                  }}
                />
              </div>
            </div>

            <div className="s5-field-chip">
              <label htmlFor="ledger-filter">Filter Tanggal</label>
              <div className="s5-input-shell">
                <select
                  id="ledger-filter"
                  value={ledgerFilter}
                  onChange={(e) => {
                    setLedgerFilter(e.target.value as 'all' | 'workdays' | 'leaves');
                    setLedgerPage(1);
                  }}
                >
                  <option value="all">Semua Tanggal</option>
                  <option value="workdays">Hari Efektif KBM</option>
                  <option value="leaves">Libur &amp; Tanggal Merah</option>
                </select>
              </div>
            </div>
          </div>

          {/* 30-Day Mini Attendance Mosaic */}
          <div className="s5-teacher-mosaic" aria-label="Ringkasan visual presensi bulan aktif">
            <span
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#2F443E',
                marginRight: '6px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Pola {currentMonth}:
            </span>
            {teacherMonthDays.map((d) => {
              const isHol = d.isSunday || Boolean(d.hol || d.officialHol);
              const cls = d.record ? d.record.status : isHol ? 'LIBUR' : '';
              const tip = d.record
                ? `${formatCompactDate(d.dateStr)} · ${STATUS_CONFIG[d.record.status].label}`
                : isHol
                ? `${formatCompactDate(d.dateStr)} · ${d.hol?.name || d.officialHol?.name || 'Hari Minggu'}`
                : `${formatCompactDate(d.dateStr)} · Belum diisi`;
              return (
                <span key={d.dateStr} className={`s5-teacher-mosaic-dot s5-tnum ${cls}`} data-s5-tooltip={tip}>
                  {d.dayNum}
                </span>
              );
            })}
          </div>

          {/* Interactive Date Ledger Table */}
          <div className="data-table-wrap s5-figma-table-wrap">
            <table className="data-table s5-figma-table">
              <thead>
                <tr>
                  <th className="s5-checkbox-col">
                    <label
                      className="s5-checkbox-label"
                      title={isAllLedgerPageSelected ? 'Batal pilih halaman ini' : 'Pilih semua tanggal di halaman ini'}
                    >
                      <input
                        type="checkbox"
                        className="s5-checkbox-input"
                        checked={isAllLedgerPageSelected}
                        onChange={toggleLedgerSelectPage}
                        aria-label="Pilih semua tanggal di halaman ini"
                      />
                      <span className={`s5-checkbox-box ${isSomeLedgerPageSelected ? 'indeterminate' : ''}`}>
                        {isAllLedgerPageSelected ? (
                          <Check size={12} strokeWidth={3} />
                        ) : isSomeLedgerPageSelected ? (
                          <Minus size={12} strokeWidth={3} />
                        ) : null}
                      </span>
                    </label>
                  </th>
                  <th style={{ width: '120px' }}>Tanggal</th>
                  <th style={{ width: '230px' }}>Hari / Keterangan Kalender</th>
                  <th style={{ width: '130px', textAlign: 'center' }}>Status</th>
                  <th>Catatan</th>
                  <th style={{ width: '215px', textAlign: 'center' }}>Ubah Cepat (1-Klik)</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLedgerRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '28px', color: '#526861' }}>
                      Tidak ada tanggal sesuai filter yang dipilih.
                    </td>
                  </tr>
                ) : (
                  paginatedLedgerRows.map((item) => {
                    const isRed = Boolean(item.hol || item.officialHol);
                    const rowClass = isRed ? 's5-row-holiday' : item.isSunday ? 's5-row-sunday' : '';
                    const isSelected = ledgerSelectedSet.has(item.dateStr);
                    return (
                      <tr
                        key={item.dateStr}
                        className={`${rowClass} ${isSelected ? 's5-row-selected' : ''}`.trim()}
                      >
                        <td className="s5-checkbox-col">
                          <label className="s5-checkbox-label" title={`Pilih tanggal ${item.dateStr}`}>
                            <input
                              type="checkbox"
                              className="s5-checkbox-input"
                              checked={isSelected}
                              onChange={() => toggleLedgerSelectOne(item.dateStr)}
                              aria-label={`Pilih tanggal ${item.dateStr}`}
                            />
                            <span className="s5-checkbox-box">
                              {isSelected && <Check size={12} strokeWidth={3} />}
                            </span>
                          </label>
                        </td>
                        <td className="s5-tnum" style={{ fontWeight: 700, color: '#0F201C' }}>
                          {item.dateStr}
                        </td>
                        <td>
                          <span
                            style={{
                              fontWeight: item.isSunday || isRed ? 700 : 500,
                              color: item.isSunday || isRed ? '#A63A2E' : '#274744',
                            }}
                          >
                            {item.dayName}
                          </span>
                          {(item.hol || item.officialHol) && (
                            <span style={{ display: 'block', fontSize: '11px', color: '#A63A2E', fontWeight: 600 }}>
                              {item.hol?.name || item.officialHol?.name}
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {item.record ? (
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: '7px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: item.cfg?.bg,
                                color: item.cfg?.color,
                                border: `0.75px solid ${item.cfg?.border}`,
                              }}
                            >
                              {item.cfg?.label}
                            </span>
                          ) : item.isSunday || isRed ? (
                            <span style={{ fontSize: '11.5px', color: '#9C4238', fontWeight: 600 }}>
                              Libur
                            </span>
                          ) : (
                            <span style={{ fontSize: '11.5px', color: '#788B85' }}>Belum diisi</span>
                          )}
                        </td>
                        <td style={{ fontSize: '12px', color: '#526861' }}>
                          {item.record?.notes || '—'}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div className="s5-status-segmented" role="group" aria-label={`Status ${item.dateStr}`}>
                            {QUICK_STATUS_ORDER.map((statusKey) => {
                              const cfg = STATUS_CONFIG[statusKey];
                              const active = item.record?.status === statusKey;
                              return (
                                <button
                                  key={statusKey}
                                  type="button"
                                  className={`s5-status-chip compact ${statusKey} ${active ? 'is-active' : ''}`}
                                  onClick={() => handleSetSingleTeacherDay(item.dateStr, statusKey)}
                                  data-s5-tooltip={`${cfg.label} (${item.dateStr})`}
                                  aria-label={`Set ${cfg.label} tanggal ${item.dateStr}`}
                                >
                                  {cfg.short}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Ledger Architectural Footbar (.s5-att-footbar) */}
          <div className="s5-att-footbar">
            <div className="s5-footbar-composition" aria-hidden="true">
              <div className="s5-footbar-seg hadir" style={{ width: `${teacherHadirPct}%` }} />
              <div className="s5-footbar-seg permit" style={{ width: `${teacherPermitPct}%` }} />
              <div className="s5-footbar-seg alpa" style={{ width: `${teacherAlpaPct}%` }} />
            </div>

            <div className="s5-att-footbar-row">
              <div className="s5-footbar-meta">
                <select
                  aria-label="Jumlah baris kalender pendidik"
                  className="s5-footbar-select"
                  value={ledgerPageSize}
                  onChange={(e) => {
                    setLedgerPageSize(Number(e.target.value));
                    setLedgerPage(1);
                  }}
                >
                  <option value={10}>10 Baris</option>
                  <option value={15}>15 Baris</option>
                  <option value={0}>Semua ({ledgerRows.length})</option>
                </select>
                <span className="s5-tnum">
                  H: <strong>{selectedTeacherMonthSummary.hadir}</strong> · DL:{' '}
                  <strong>{selectedTeacherMonthSummary.dinas}</strong> · I/S:{' '}
                  <strong>{selectedTeacherMonthSummary.izin + selectedTeacherMonthSummary.sakit}</strong> · A:{' '}
                  <strong>{selectedTeacherMonthSummary.alpa}</strong>
                </span>
              </div>

              {ledgerPageSize > 0 && totalLedgerPages > 1 && (
                <div className="s5-pagination-group" aria-label="Navigasi halaman ledger guru">
                  <button
                    type="button"
                    className="s5-page-btn"
                    disabled={safeLedgerPage <= 1}
                    onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                    aria-label="Halaman sebelumnya"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {getPaginationItems(safeLedgerPage, totalLedgerPages).map((item, idx) =>
                    item === 'ellipsis' ? (
                      <span key={`l-ell-${idx}`} style={{ padding: '0 4px', color: '#8A9B95' }}>
                        …
                      </span>
                    ) : (
                      <button
                        key={`l-pg-${item}`}
                        type="button"
                        className={`s5-page-btn s5-tnum ${safeLedgerPage === item ? 'is-active' : ''}`}
                        onClick={() => setLedgerPage(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                  <button
                    type="button"
                    className="s5-page-btn"
                    disabled={safeLedgerPage >= totalLedgerPages}
                    onClick={() => setLedgerPage((p) => Math.min(totalLedgerPages, p + 1))}
                    aria-label="Halaman berikutnya"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: REKAP BULANAN & EKSPOR PDF RESMI (CHECKBOX SYNC KE PDF)            */}
      {/* ========================================================================= */}
      {activeTab === 'recap' && (
        <div className="s5-att-panel">
          <div className="s5-att-panel-header">
            <div>
              <div className="s5-page-kicker">REKAPITULASI &amp; DOKUMEN RESMI</div>
              <h3 style={{ margin: '3px 0 0', fontSize: '17px', color: '#0B2923', fontWeight: 700 }}>
                {recapSummaryAll.isMultiMonth
                  ? `Rekap Kehadiran Multi-Bulan · ${recapSummaryAll.periodLabel}`
                  : `Rekap Persentase Kehadiran · ${recapSummaryAll.periodLabel}`}
              </h3>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'inline-flex',
                  padding: '3px',
                  borderRadius: '9px',
                  background: '#EAF0EC',
                  border: '0.75px solid #D0DDD6',
                  gap: '3px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setRecapMode('single');
                    setRecapPage(1);
                  }}
                  className={`s5-studio-preset-btn ${recapMode === 'single' ? 'is-active' : ''}`}
                  style={{ height: '28px', border: 'none' }}
                >
                  1 Bulan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRecapMode('range');
                    if (recapEndMonth <= currentMonth) {
                      const [y, m] = currentMonth.split('-').map(Number);
                      const nextM = Math.min(12, (m || 1) + 2);
                      setRecapEndMonth(`${y || new Date().getFullYear()}-${String(nextM).padStart(2, '0')}`);
                    }
                    setRecapPage(1);
                  }}
                  className={`s5-studio-preset-btn ${recapMode === 'range' ? 'is-active' : ''}`}
                  style={{ height: '28px', border: 'none' }}
                >
                  Multi-Bulan
                </button>
              </div>

              <button
                type="button"
                className="s5-studio-preset-btn"
                style={{ height: '30px' }}
                onClick={() => {
                  const yr = currentYearNum || new Date().getFullYear();
                  setRecapMode('range');
                  setCurrentMonth(`${yr}-07`);
                  setRecapEndMonth(`${yr}-12`);
                  setRecapPage(1);
                }}
                title="Pilih rentang Semester Ganjil (Juli – Desember)"
              >
                Jul–Des
              </button>
              <button
                type="button"
                className="s5-studio-preset-btn"
                style={{ height: '30px' }}
                onClick={() => {
                  const yr = currentYearNum || new Date().getFullYear();
                  setRecapMode('range');
                  setCurrentMonth(`${yr}-01`);
                  setRecapEndMonth(`${yr}-06`);
                  setRecapPage(1);
                }}
                title="Pilih rentang Semester Genap (Januari – Juni)"
              >
                Jan–Jun
              </button>

              <span className="s5-tnum" style={{ fontSize: '12px', color: '#526861', marginLeft: '4px' }}>
                <strong>{recapSelectedTeachers.length}</strong> guru terpilih untuk PDF
              </span>
            </div>
          </div>

          {/* Contextual Month / Range & Teacher Filter Toolbar */}
          <div className="s5-att-toolbar">
            <div className="s5-field-chip">
              <label htmlFor="recap-month">{recapMode === 'range' ? 'Dari Bulan' : 'Bulan Rekap'}</label>
              <div className="s5-input-shell">
                <Calendar size={14} color="#124037" />
                <input
                  id="recap-month"
                  type="month"
                  value={currentMonth}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCurrentMonth(val);
                    setRecapPage(1);
                    if (/^\d{4}-\d{2}$/.test(val)) {
                      const [yNum, mNum] = val.split('-').map(Number);
                      const lastDay = new Date(yNum, mNum, 0).getDate();
                      setMassMonthStartDate(`${val}-01`);
                      setMassMonthEndDate(`${val}-${String(lastDay).padStart(2, '0')}`);
                    }
                  }}
                />
              </div>
            </div>

            {recapMode === 'range' && (
              <div className="s5-field-chip">
                <label htmlFor="recap-end-month">Sampai Bulan</label>
                <div className="s5-input-shell">
                  <Calendar size={14} color="#124037" />
                  <input
                    id="recap-end-month"
                    type="month"
                    value={recapEndMonth}
                    onChange={(e) => {
                      setRecapEndMonth(e.target.value);
                      setRecapPage(1);
                    }}
                  />
                </div>
              </div>
            )}

            <div className="s5-field-chip" style={{ flex: 1, minWidth: '180px', maxWidth: '280px' }}>
              <label htmlFor="recap-search">Cari Guru</label>
              <div className="s5-input-shell" style={{ width: '100%' }}>
                <Search size={14} color="#687E77" />
                <input
                  id="recap-search"
                  type="text"
                  placeholder="Ketik nama atau kode guru…"
                  value={recapSearch}
                  onChange={(e) => {
                    setRecapSearch(e.target.value);
                    setRecapPage(1);
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            <div className="toolbar-spacer" />

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                className="button button-quiet"
                style={{ height: '34px', fontSize: '12px' }}
                onClick={() => {
                  setRecapSelectedTeachers(activeTeachers.map((t) => t.id));
                  setRecapBulkEngaged(true);
                  setAttBulkConfirmDelete(false);
                  setAttBulkStatusMode(false);
                }}
              >
                Pilih Semua ({activeTeachers.length})
              </button>
              <button
                type="button"
                className="button button-quiet"
                style={{ height: '34px', fontSize: '12px', color: '#A63A2E' }}
                onClick={() => {
                  setRecapSelectedTeachers([]);
                  setRecapBulkEngaged(false);
                  setAttBulkConfirmDelete(false);
                  setAttBulkStatusMode(false);
                }}
              >
                Kosongkan
              </button>
            </div>
          </div>

          {recapSummaryAll.isMultiMonth && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
                padding: '10px 14px',
                borderRadius: '11px',
                background: '#F4F8F5',
                border: '0.75px solid #D5E2DB',
                marginBottom: '12px',
              }}
            >
              <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#124037', marginRight: '4px' }}>
                Ringkasan Per Bulan:
              </span>
              {recapSummaryAll.monthSummaries.map((mb) => (
                <span
                  key={mb.monthYear}
                  className="s5-tnum"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 10px',
                    borderRadius: '8px',
                    background: '#FFFFFF',
                    border: `0.75px solid ${mb.recordedDaysCount > 0 ? '#BFD8CC' : '#DCE2DE'}`,
                    fontSize: '11.5px',
                    color: '#0F201C',
                  }}
                >
                  <strong style={{ color: '#124037' }}>{mb.shortLabel}</strong>
                  <span style={{ color: '#526861' }}>
                    {mb.recordedDaysCount > 0 ? `${mb.recordedDaysCount} hr` : 'kosong'}
                  </span>
                  <strong style={{ color: mb.recordedDaysCount > 0 ? '#1B5E43' : '#687E77' }}>
                    {mb.recordedDaysCount > 0 ? `${mb.overallAvgRate}%` : '—'}
                  </strong>
                </span>
              ))}
            </div>
          )}

          {/* Recap Summary Table with Figma Pro Checkboxes */}
          <div className="data-table-wrap s5-figma-table-wrap">
            <table className="data-table s5-figma-table">
              <thead>
                <tr>
                  <th className="s5-checkbox-col">
                    <label
                      className="s5-checkbox-label"
                      title={allVisibleRecapSelected ? 'Batal pilih halaman ini' : 'Pilih semua guru di halaman ini'}
                    >
                      <input
                        type="checkbox"
                        className="s5-checkbox-input"
                        checked={allVisibleRecapSelected}
                        onChange={toggleAllVisibleRecap}
                        aria-label="Pilih semua guru rekap"
                      />
                      <span className={`s5-checkbox-box ${someVisibleRecapSelected ? 'indeterminate' : ''}`}>
                        {allVisibleRecapSelected ? (
                          <Check size={12} strokeWidth={3} />
                        ) : someVisibleRecapSelected ? (
                          <Minus size={12} strokeWidth={3} />
                        ) : null}
                      </span>
                    </label>
                  </th>
                  <th
                    onClick={() => handleToggleRecapSort('no')}
                    style={{ width: '48px', textAlign: 'center', cursor: 'pointer' }}
                  >
                    No {recapSortKey === 'no' ? (recapSortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ width: '76px', textAlign: 'center' }}>Kode</th>
                  <th onClick={() => handleToggleRecapSort('name')} style={{ cursor: 'pointer' }}>
                    Pendidik {recapSortKey === 'name' ? (recapSortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th
                    onClick={() => handleToggleRecapSort('hadir')}
                    style={{ width: '64px', textAlign: 'center', cursor: 'pointer' }}
                  >
                    H {recapSortKey === 'hadir' ? (recapSortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ width: '60px', textAlign: 'center' }}>DL</th>
                  <th style={{ width: '56px', textAlign: 'center' }}>S</th>
                  <th style={{ width: '56px', textAlign: 'center' }}>I</th>
                  <th style={{ width: '56px', textAlign: 'center' }}>A</th>
                  <th style={{ width: '82px', textAlign: 'center' }}>H + DL</th>
                  <th style={{ width: '72px', textAlign: 'center' }}>Target</th>
                  <th
                    onClick={() => handleToggleRecapSort('rate')}
                    style={{ width: '126px', textAlign: 'center', cursor: 'pointer' }}
                  >
                    Kehadiran {recapSortKey === 'rate' ? (recapSortOrder === 'asc' ? '▲' : '▼') : ''}
                  </th>
                  <th style={{ width: '116px', textAlign: 'center' }}>Predikat</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRecapRows.length === 0 ? (
                  <tr>
                    <td colSpan={13} style={{ textAlign: 'center', padding: '28px', color: '#526861' }}>
                      Tidak ada data guru untuk pencarian aktif.
                    </td>
                  </tr>
                ) : (
                  paginatedRecapRows.map((r) => {
                    const isChecked = selectedRecapSet.has(r.teacher.id);
                    const totalPresent = r.hadir + r.dinas;
                    const predikat = r.predikat;
                    let predikatColor = '#1B5E43';
                    if (!r.hasData) {
                      predikatColor = '#687E77';
                    } else if (r.rate < 75) {
                      predikatColor = '#A63A2E';
                    } else if (r.rate < 85) {
                      predikatColor = '#9C6F28';
                    } else if (r.rate < 95) {
                      predikatColor = '#2F7771';
                    }
                    return (
                      <tr
                        key={r.teacher.id}
                        className={isChecked ? 's5-row-selected' : ''}
                        style={{ opacity: isChecked ? 1 : 0.62 }}
                      >
                        <td className="s5-checkbox-col">
                          <label className="s5-checkbox-label" title={`Pilih ${r.teacher.name}`}>
                            <input
                              type="checkbox"
                              className="s5-checkbox-input"
                              checked={isChecked}
                              onChange={() => toggleSingleRecapTeacher(r.teacher.id)}
                              aria-label={`Pilih ${r.teacher.name} untuk tindakan massal dan PDF`}
                            />
                            <span className="s5-checkbox-box">
                              {isChecked && <Check size={12} strokeWidth={3} />}
                            </span>
                          </label>
                        </td>
                        <td
                          className="s5-tnum"
                          style={{ textAlign: 'center', color: '#526861', fontSize: '11.5px' }}
                        >
                          {r.no}
                        </td>
                        <td
                          className="s5-tnum"
                          style={{ textAlign: 'center', fontWeight: 700, color: '#124037' }}
                        >
                          {r.teacher.code}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <MadrasahTeacherAvatar teacher={r.teacher} size={32} showStatusDot={false} />
                            <div>
                              <strong style={{ fontSize: '12.5px', color: '#0F201C', display: 'block' }}>
                                {r.teacher.name}
                              </strong>
                              <span style={{ fontSize: '11px', color: '#526861' }}>
                                {r.teacher.roleTitle || 'Guru Mapel'}
                                {r.teacher.nip ? ` · NIP. ${r.teacher.nip}` : ''}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td
                          className="s5-tnum"
                          style={{ textAlign: 'center', fontWeight: 700, color: '#1B5E43' }}
                        >
                          {r.hadir}
                        </td>
                        <td
                          className="s5-tnum"
                          style={{ textAlign: 'center', fontWeight: 600, color: '#5D478B' }}
                        >
                          {r.dinas}
                        </td>
                        <td className="s5-tnum" style={{ textAlign: 'center', color: '#36648B' }}>
                          {r.sakit}
                        </td>
                        <td className="s5-tnum" style={{ textAlign: 'center', color: '#9C6F28' }}>
                          {r.izin}
                        </td>
                        <td
                          className="s5-tnum"
                          style={{
                            textAlign: 'center',
                            color: r.alpa > 0 ? '#A63A2E' : '#526861',
                            fontWeight: r.alpa > 0 ? 700 : 400,
                          }}
                        >
                          {r.alpa}
                        </td>
                        <td
                          className="s5-tnum"
                          style={{ textAlign: 'center', fontWeight: 700, color: '#0B2923' }}
                        >
                          {totalPresent}
                        </td>
                        <td className="s5-tnum" style={{ textAlign: 'center', color: '#526861' }}>
                          {effectiveRecapDays}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {r.hasData ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <span className="s5-rate-bar-track">
                                <span
                                  className="s5-rate-bar-fill"
                                  style={{ width: `${r.rate}%`, background: predikatColor }}
                                />
                              </span>
                              <strong className="s5-tnum" style={{ fontSize: '12px', color: predikatColor }}>
                                {r.rate}%
                              </strong>
                            </div>
                          ) : (
                            <span className="s5-tnum" style={{ fontSize: '12px', color: '#687E77' }}>
                              —
                            </span>
                          )}
                        </td>
                        <td
                          style={{
                            textAlign: 'center',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color: predikatColor,
                          }}
                        >
                          {predikat}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Recap Architectural Footbar (.s5-att-footbar) */}
          <div className="s5-att-footbar">
            <div className="s5-footbar-composition" aria-hidden="true">
              <div className="s5-footbar-seg hadir" style={{ width: `${overallAvgRate}%` }} />
            </div>

            <div className="s5-att-footbar-row">
              <div className="s5-footbar-meta">
                <select
                  aria-label="Jumlah baris tabel rekap"
                  className="s5-footbar-select"
                  value={recapPageSize}
                  onChange={(e) => {
                    setRecapPageSize(Number(e.target.value));
                    setRecapPage(1);
                  }}
                >
                  <option value={10}>10 Baris</option>
                  <option value={20}>20 Baris</option>
                  <option value={25}>25 Baris</option>
                  <option value={0}>Semua ({sortedRecapRows.length})</option>
                </select>
                <span className="s5-tnum">
                  <strong>{recapSelectedTeachers.length}</strong> terpilih · Rata-rata kehadiran{' '}
                  <strong>{overallAvgRate}%</strong>
                </span>
              </div>

              <div className="s5-footbar-actions">
                {recapPageSize > 0 && totalRecapPages > 1 && (
                  <div className="s5-pagination-group" aria-label="Navigasi halaman tabel rekap">
                    <button
                      type="button"
                      className="s5-page-btn"
                      disabled={safeRecapPage <= 1}
                      onClick={() => setRecapPage((p) => Math.max(1, p - 1))}
                      aria-label="Halaman sebelumnya"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {getPaginationItems(safeRecapPage, totalRecapPages).map((item, idx) =>
                      item === 'ellipsis' ? (
                        <span key={`r-ell-${idx}`} style={{ padding: '0 4px', color: '#8A9B95' }}>
                          …
                        </span>
                      ) : (
                        <button
                          key={`r-pg-${item}`}
                          type="button"
                          className={`s5-page-btn s5-tnum ${safeRecapPage === item ? 'is-active' : ''}`}
                          onClick={() => setRecapPage(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      className="s5-page-btn"
                      disabled={safeRecapPage >= totalRecapPages}
                      onClick={() => setRecapPage((p) => Math.min(totalRecapPages, p + 1))}
                      aria-label="Halaman berikutnya"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => setPdfModalOpen(true)}
                  disabled={recapSelectedTeachers.length === 0}
                  style={{ height: '36px', padding: '0 16px', fontSize: '12.5px' }}
                >
                  <Download size={14} /> Ekspor PDF ({recapSelectedTeachers.length} Guru)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: DUAL-PANE ZERO-SCROLL HARI LIBUR & KALDIK KEMENAG RI               */}
      {/* ========================================================================= */}
      {activeTab === 'holidays' && (
        <div className="s5-att-panel">
          <div className="s5-att-panel-header">
            <div>
              <div className="s5-page-kicker">KALENDER RESMI NASIONAL &amp; KEMENAG RI</div>
              <h3 style={{ margin: '3px 0 0', fontSize: '17px', color: '#0B2923', fontWeight: 700 }}>
                Daftar Tanggal Merah, Cuti Bersama &amp; Libur Madrasah
              </h3>
            </div>
            <button
              type="button"
              className="button button-primary"
              onClick={() =>
                handleBatchImportHolidays(
                  unaddedCatalogEventsInYear,
                  `Nasional ${catalogYear}`,
                )
              }
              disabled={unaddedCatalogEventsInYear.length === 0}
              style={{ height: '38px', fontSize: '12px' }}
            >
              <Plus size={14} />
              {unaddedCatalogEventsInYear.length > 0
                ? `Sinkronkan Nasional ${catalogYear} (${unaddedCatalogEventsInYear.length})`
                : `Nasional ${catalogYear} Lengkap`}
            </button>
          </div>

          {/* Single-Row Top Controls (Year 2025–2028 + Category) */}
          <div className="s5-holidays-topbar">
            <div className="s5-status-segmented" role="group" aria-label="Pilih tahun kalender">
              {AVAILABLE_HOLIDAY_YEARS.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`s5-status-chip s5-tnum ${catalogYear === y ? 'is-active HADIR' : ''}`}
                  onClick={() => {
                    setCatalogYear(y);
                    setHolidayPage(1);
                  }}
                >
                  {y}
                </button>
              ))}
            </div>

            <div className="s5-status-segmented" role="group" aria-label="Filter kategori libur">
              {(
                [
                  { id: 'ALL', label: 'Semua' },
                  { id: 'NASIONAL', label: 'Libur Nasional' },
                  { id: 'CUTI_BERSAMA', label: 'Cuti Bersama' },
                  { id: 'KALDIK_KEMENAG', label: 'Kaldik Kemenag' },
                ] as const
              ).map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  className={`s5-status-chip ${catalogFilter === cat.id ? 'is-active HADIR' : ''}`}
                  style={{ padding: '0 10px', whiteSpace: 'nowrap' }}
                  onClick={() => setCatalogFilter(cat.id)}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* 12-Month Instant Quick-Jump Strip (Zero Scroll Across 12 Months) */}
          <div className="s5-month-strip" role="group" aria-label="Lompat cepat bulan">
            <button
              type="button"
              className={`s5-month-pill ${catalogMonth === 'ALL' ? 'is-active' : ''}`}
              onClick={() => {
                setCatalogMonth('ALL');
                setHolidayPage(1);
              }}
            >
              Semua Bulan
            </button>
            {SHORT_MONTHS_ID.map((mLabel, mIdx) => {
              const monthNum = mIdx + 1;
              const cnt = catalogMonthCounts[mIdx] ?? 0;
              const isActive = catalogMonth === monthNum;
              return (
                <button
                  key={mLabel}
                  type="button"
                  className={`s5-month-pill ${isActive ? 'is-active' : ''}`}
                  onClick={() => {
                    setCatalogMonth(monthNum);
                    setHolidayPage(1);
                  }}
                >
                  <span>{mLabel}</span>
                  {cnt > 0 && <span className="s5-month-pill-count s5-tnum">({cnt})</span>}
                </button>
              );
            })}
          </div>

          {/* Dual-Pane Zero-Scroll Split Workspace */}
          <div className="s5-holidays-split">
            {/* LEFT PANE: Compact Official SKB 3 Menteri & Kaldik Kemenag 1-Click Catalog */}
            <div>
              <div className="s5-holidays-pane-head">
                <strong style={{ fontSize: '13px', color: '#0B2923' }}>
                  Tanggal Merah Otomatis {catalogYear}
                  {catalogMonth !== 'ALL' ? ` · ${MONTHS_FULL_ID[catalogMonth - 1]}` : ''}
                </strong>
                <span className="s5-tnum" style={{ fontSize: '11.5px', color: '#526861' }}>
                  {catalogEvents.length} agenda · 1-klik Tambah / Lepas
                </span>
              </div>

              <div className="s5-kaldik-scroll">
                {groupedCatalogEvents.length === 0 ? (
                  <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: '12px', color: '#526861' }}>
                    Tidak ada agenda libur resmi pada bulan ini. Pilih bulan lain atau &ldquo;Semua Bulan&rdquo;.
                  </div>
                ) : (
                  groupedCatalogEvents.map(([ym, events]) => {
                    const monthIndex = Number(ym.slice(5, 7)) - 1;
                    const monthTitle = `${MONTHS_FULL_ID[monthIndex] ?? ym} ${ym.slice(0, 4)}`;
                    return (
                      <div key={ym}>
                        <div className="s5-kaldik-month-label">{monthTitle}</div>
                        {events.map((ev) => {
                          const isRegistered = holidays.some((h) => h.date === ev.date);
                          const [, mStr, dStr] = ev.date.split('-');
                          const monthShort = SHORT_MONTHS_ID[Number(mStr) - 1] ?? mStr;
                          const boxType =
                            ev.category === 'KALDIK_KEMENAG'
                              ? 'kemenag'
                              : ev.category === 'CUTI_BERSAMA'
                              ? 'cuti'
                              : '';
                          return (
                            <div
                              key={`${ev.date}-${ev.category}`}
                              className={`s5-kaldik-row ${isRegistered ? 'is-registered' : ''}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                <div className={`s5-kaldik-datebox ${boxType}`}>
                                  <span className="s5-kaldik-day s5-tnum">{Number(dStr)}</span>
                                  <span className="s5-kaldik-mon">{monthShort}</span>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                  <strong
                                    style={{
                                      fontSize: '12.5px',
                                      color: '#0F201C',
                                      display: 'block',
                                      lineHeight: 1.25,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                  >
                                    {ev.name}
                                  </strong>
                                  <span
                                    style={{ fontSize: '11px', color: '#526861' }}
                                    data-s5-tooltip={ev.decree}
                                  >
                                    {getCategoryLabel(ev.category)}
                                    {ev.isRedDate ? ' · Tanggal Merah' : ' · Agenda Madrasah'}
                                  </span>
                                </div>
                              </div>

                              <button
                                type="button"
                                className={`button ${isRegistered ? 'button-quiet' : 'button-secondary'}`}
                                onClick={() => handleQuickToggleOfficialEvent(ev)}
                                data-s5-tooltip={
                                  isRegistered
                                    ? 'Klik untuk melepas dari daftar libur madrasah'
                                    : 'Klik untuk menambahkan ke libur madrasah'
                                }
                                style={{
                                  height: '30px',
                                  padding: '0 10px',
                                  fontSize: '11.5px',
                                  flexShrink: 0,
                                  color: isRegistered ? '#1B5E43' : undefined,
                                }}
                              >
                                {isRegistered ? (
                                  <>
                                    <Check size={13} /> Aktif
                                  </>
                                ) : (
                                  <>
                                    <Plus size={13} /> Tambah
                                  </>
                                )}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* RIGHT PANE: Compact Form + Instant Official Red-Date Suggestions + Registered Table + Footbar */}
            <div>
              <div className="s5-holidays-pane-head">
                <strong style={{ fontSize: '13px', color: '#0B2923' }}>
                  Kalender Libur Madrasah Terdaftar
                </strong>
                <span className="s5-tnum" style={{ fontSize: '11.5px', color: '#526861' }}>
                  {filteredHolidays.length} tanggal tersimpan
                </span>
              </div>

              {/* Compact 1-Row Inline Add / Edit Form */}
              <form
                onSubmit={handleSaveHoliday}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  padding: '10px 12px',
                  background: '#F8FAF8',
                  border: '0.75px solid #D5E0DA',
                  borderRadius: '12px',
                  marginBottom: '8px',
                }}
              >
                <div className="s5-field-chip">
                  <label htmlFor="manual-hol-date">Tanggal</label>
                  <div className="s5-input-shell" style={{ height: '34px' }}>
                    <input
                      id="manual-hol-date"
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => handleHolidayDatePickerChange(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="s5-field-chip" style={{ flex: 1, minWidth: '160px' }}>
                  <label htmlFor="manual-hol-name">Keterangan Hari Libur</label>
                  <div className="s5-input-shell" style={{ width: '100%', height: '34px' }}>
                    <input
                      id="manual-hol-name"
                      type="text"
                      placeholder="Contoh: Milad Madrasah…"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      style={{ width: '100%' }}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="submit"
                    className="button button-primary"
                    style={{ height: '34px', padding: '0 13px', fontSize: '12px' }}
                  >
                    {editingHolidayId ? <Save size={14} /> : <Plus size={14} />}
                    {editingHolidayId ? 'Simpan' : 'Tambah'}
                  </button>
                  {editingHolidayId && (
                    <button
                      type="button"
                      className="button button-quiet"
                      onClick={handleCancelEditHoliday}
                      style={{ height: '34px', padding: '0 10px' }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </form>

              {/* Auto-Suggested Official Dates Right Inside Form Area (1-Click Fill/Add) */}
              {detectedOfficialManualDate && !editingHolidayId ? (
                <div
                  className="s5-holiday-alert-banner calm"
                  style={{ marginBottom: '8px', padding: '8px 12px' }}
                >
                  <span style={{ fontSize: '11.5px', color: '#124037', fontWeight: 600 }}>
                    {formatCompactDate(detectedOfficialManualDate.date)}:{' '}
                    <strong>{detectedOfficialManualDate.name}</strong>
                  </span>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setNewHolidayName(detectedOfficialManualDate.name)}
                    style={{ height: '26px', fontSize: '11px' }}
                  >
                    Pakai Nama Resmi
                  </button>
                </div>
              ) : (
                quickSuggestOfficialEvents.length > 0 &&
                !editingHolidayId && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flexWrap: 'wrap',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '11px', fontWeight: 600, color: '#526861' }}>
                      Tambah cepat:
                    </span>
                    {quickSuggestOfficialEvents.map((ev) => (
                      <button
                        key={ev.date}
                        type="button"
                        className="s5-quick-red-chip"
                        onClick={() => handleQuickToggleOfficialEvent(ev)}
                      >
                        <Plus size={11} />
                        <span>
                          {formatCompactDate(ev.date)} · {ev.name.split('(')[0].trim()}
                        </span>
                      </button>
                    ))}
                  </div>
                )
              )}

              {/* Compact Search Bar */}
              <div className="s5-att-toolbar" style={{ padding: '7px 10px', marginBottom: '8px' }}>
                <div className="s5-field-chip" style={{ flex: 1 }}>
                  <div className="s5-input-shell" style={{ width: '100%', height: '32px' }}>
                    <Search size={14} color="#687E77" />
                    <input
                      id="hol-search"
                      aria-label="Cari hari libur terdaftar"
                      type="text"
                      placeholder="Cari tanggal atau nama hari libur…"
                      value={holidaySearch}
                      onChange={(e) => {
                        setHolidaySearch(e.target.value);
                        setHolidayPage(1);
                      }}
                      style={{ width: '100%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Registered Holiday Figma Pro Table (Fixed Compact Height = Zero Outer Scroll) */}
              <div className="data-table-wrap s5-figma-table-wrap s5-holiday-table-scroll">
                <table className="data-table s5-figma-table">
                  <thead>
                    <tr>
                      <th className="s5-checkbox-col">
                        <label
                          className="s5-checkbox-label"
                          title={isAllHolidayPageSelected ? 'Batal pilih halaman ini' : 'Pilih semua di halaman ini'}
                        >
                          <input
                            type="checkbox"
                            className="s5-checkbox-input"
                            checked={isAllHolidayPageSelected}
                            onChange={toggleHolidaySelectPage}
                            aria-label="Pilih semua hari libur di halaman ini"
                          />
                          <span className={`s5-checkbox-box ${isSomeHolidayPageSelected ? 'indeterminate' : ''}`}>
                            {isAllHolidayPageSelected ? (
                              <Check size={12} strokeWidth={3} />
                            ) : isSomeHolidayPageSelected ? (
                              <Minus size={12} strokeWidth={3} />
                            ) : null}
                          </span>
                        </label>
                      </th>
                      <th style={{ width: '44px', textAlign: 'center' }}>No</th>
                      <th style={{ width: '110px' }}>Tanggal</th>
                      <th>Nama Hari Libur</th>
                      <th style={{ width: '88px', textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHolidays.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: '#526861' }}>
                          Belum ada hari libur terdaftar. Klik + Tambah di sebelah kiri.
                        </td>
                      </tr>
                    ) : (
                      paginatedHolidays.map((hol, idx) => {
                        const globalIdx =
                          (safeHolidayPage - 1) * (holidayPageSize || filteredHolidays.length) +
                          idx +
                          1;
                        const isSelected = holidaySelectedSet.has(hol.id);
                        return (
                          <tr key={hol.id} className={isSelected ? 's5-row-selected' : undefined}>
                            <td className="s5-checkbox-col">
                              <label className="s5-checkbox-label" title={`Pilih ${hol.name}`}>
                                <input
                                  type="checkbox"
                                  className="s5-checkbox-input"
                                  checked={isSelected}
                                  onChange={() => toggleHolidaySelectOne(hol.id)}
                                  aria-label={`Pilih ${hol.name}`}
                                />
                                <span className="s5-checkbox-box">
                                  {isSelected && <Check size={12} strokeWidth={3} />}
                                </span>
                              </label>
                            </td>
                            <td
                              className="s5-tnum"
                              style={{ textAlign: 'center', color: '#526861', fontSize: '11.5px' }}
                            >
                              {globalIdx}
                            </td>
                            <td className="s5-tnum" style={{ fontWeight: 700, color: '#A63A2E' }}>
                              {hol.date}
                            </td>
                            <td style={{ fontWeight: 600, color: '#0F201C' }}>{hol.name}</td>
                            <td style={{ textAlign: 'center' }}>
                              <div className="s5-action-dock">
                                <button
                                  type="button"
                                  className="s5-dock-btn primary"
                                  onClick={() => handleStartEditHoliday(hol)}
                                  data-s5-tooltip="Edit hari libur"
                                  aria-label={`Edit ${hol.name}`}
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="s5-dock-btn"
                                  style={{ color: '#A63A2E' }}
                                  onClick={() => handleDeleteHoliday(hol.id)}
                                  data-s5-tooltip="Hapus hari libur"
                                  aria-label={`Hapus ${hol.name}`}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Holiday Footbar (.s5-att-footbar) */}
              <div className="s5-att-footbar">
                <div className="s5-att-footbar-row">
                  <div className="s5-footbar-meta">
                    <select
                      aria-label="Jumlah baris tabel hari libur"
                      className="s5-footbar-select"
                      value={holidayPageSize}
                      onChange={(e) => {
                        setHolidayPageSize(Number(e.target.value));
                        setHolidayPage(1);
                      }}
                    >
                      <option value={6}>6 Baris</option>
                      <option value={10}>10 Baris</option>
                      <option value={20}>20 Baris</option>
                      <option value={0}>Semua ({filteredHolidays.length})</option>
                    </select>
                    <span className="s5-tnum">{filteredHolidays.length} hari libur</span>
                  </div>

                  {holidayPageSize > 0 && totalHolidayPages > 1 && (
                    <div className="s5-pagination-group" aria-label="Navigasi halaman hari libur">
                      <button
                        type="button"
                        className="s5-page-btn"
                        disabled={safeHolidayPage <= 1}
                        onClick={() => setHolidayPage((p) => Math.max(1, p - 1))}
                        aria-label="Halaman sebelumnya"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      {getPaginationItems(safeHolidayPage, totalHolidayPages).map((item, idx) =>
                        item === 'ellipsis' ? (
                          <span key={`h-ell-${idx}`} style={{ padding: '0 4px', color: '#8A9B95' }}>
                            …
                          </span>
                        ) : (
                          <button
                            key={`h-pg-${item}`}
                            type="button"
                            className={`s5-page-btn s5-tnum ${safeHolidayPage === item ? 'is-active' : ''}`}
                            onClick={() => setHolidayPage(item)}
                          >
                            {item}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        className="s5-page-btn"
                        disabled={safeHolidayPage >= totalHolidayPages}
                        onClick={() => setHolidayPage((p) => Math.min(totalHolidayPages, p + 1))}
                        aria-label="Halaman berikutnya"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Action Toolbar for Presensi Guru Tables */}
      {(() => {
        const showDaily = activeTab === 'daily' && validDailySelectedIds.length > 0;
        const showLedger = activeTab === 'teacher' && validLedgerSelectedDates.length > 0;
        const showRecap = activeTab === 'recap' && recapBulkEngaged && validRecapSelectedIds.length > 0;
        const showHolidays = activeTab === 'holidays' && validHolidaySelectedIds.length > 0;
        if (!showDaily && !showLedger && !showRecap && !showHolidays) return null;

        const selectedCount = showDaily
          ? validDailySelectedIds.length
          : showLedger
          ? validLedgerSelectedDates.length
          : showRecap
          ? validRecapSelectedIds.length
          : validHolidaySelectedIds.length;

        const totalAvailableCount = showDaily
          ? filteredDailyTeachers.length
          : showLedger
          ? ledgerRows.length
          : showRecap
          ? sortedRecapRows.length
          : filteredHolidays.length;

        const entityLabel = showDaily
          ? 'Pendidik'
          : showLedger
          ? 'Tanggal'
          : showRecap
          ? 'Pendidik'
          : 'Hari Libur';

        const handleSelectAllScope = () => {
          setAttBulkConfirmDelete(false);
          setAttBulkStatusMode(false);
          if (showDaily) setDailySelectedIds(filteredDailyTeachers.map((t) => t.id));
          else if (showLedger) setLedgerSelectedDates(ledgerRows.map((r) => r.dateStr));
          else if (showRecap) setRecapSelectedTeachers(sortedRecapRows.map((r) => r.teacher.id));
          else if (showHolidays) setHolidaySelectedIds(filteredHolidays.map((h) => h.id));
        };

        const handleCloseBar = () => {
          setAttBulkConfirmDelete(false);
          setAttBulkStatusMode(false);
          if (showDaily) setDailySelectedIds([]);
          else if (showLedger) setLedgerSelectedDates([]);
          else if (showRecap) setRecapBulkEngaged(false);
          else if (showHolidays) setHolidaySelectedIds([]);
        };

        return (
          <div className="s5-bulk-floating-bar" role="region" aria-label="Toolbar Tindakan Massal Presensi Guru">
            <div className="s5-bulk-selection-meta">
              <span className="s5-bulk-count-badge s5-tnum">{selectedCount}</span>
              <span className="s5-bulk-label">{entityLabel} Terpilih</span>
              {totalAvailableCount > selectedCount && (
                <button type="button" className="s5-bulk-select-all-link" onClick={handleSelectAllScope}>
                  Pilih Semua ({totalAvailableCount})
                </button>
              )}
            </div>

            <div className="s5-bulk-divider" aria-hidden="true" />

            <div className="s5-bulk-actions">
              {!attBulkConfirmDelete && !attBulkStatusMode ? (
                <>
                  {(showDaily || showLedger || showRecap) && (
                    <button
                      type="button"
                      className="s5-bulk-btn status"
                      onClick={() => setAttBulkStatusMode(true)}
                      title={
                        showRecap
                          ? `Ubah status aktif ${selectedCount} pendidik terpilih`
                          : `Ubah status kehadiran ${selectedCount} ${entityLabel.toLowerCase()} terpilih`
                      }
                    >
                      <ToggleRight size={14} />
                      <span>{showRecap ? 'Ubah Status Aktif' : 'Ubah Status'}</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="s5-bulk-btn export"
                    onClick={() => {
                      if (showDaily) handleDailyBulkExportCsv();
                      else if (showLedger) handleLedgerBulkExportCsv();
                      else if (showRecap) handleRecapBulkExportCsv();
                      else if (showHolidays) handleHolidayBulkExportCsv();
                    }}
                    title={`Ekspor ${selectedCount} ${entityLabel.toLowerCase()} terpilih ke CSV`}
                  >
                    <Download size={14} />
                    <span>Ekspor CSV Terpilih</span>
                  </button>

                  <button
                    type="button"
                    className="s5-bulk-btn danger"
                    onClick={() => setAttBulkConfirmDelete(true)}
                    title={`Hapus data ${selectedCount} ${entityLabel.toLowerCase()} terpilih`}
                  >
                    <Trash2 size={14} />
                    <span>Hapus Terpilih</span>
                  </button>
                </>
              ) : attBulkStatusMode ? (
                showRecap ? (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#E5C378', marginRight: '2px' }}>
                      Status {selectedCount} Pendidik:
                    </span>
                    <button
                      type="button"
                      className="s5-bulk-btn activate"
                      onClick={() => handleRecapBulkToggleActive(true)}
                    >
                      <CheckCircle2 size={14} />
                      <span>Aktifkan</span>
                    </button>
                    <button
                      type="button"
                      className="s5-bulk-btn deactivate"
                      onClick={() => handleRecapBulkToggleActive(false)}
                    >
                      <XCircle size={14} />
                      <span>Nonaktifkan</span>
                    </button>
                    <button
                      type="button"
                      className="s5-bulk-btn subtle"
                      onClick={() => setAttBulkStatusMode(false)}
                    >
                      Batal
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#E5C378', marginRight: '2px' }}>
                      Set {selectedCount} {entityLabel}:
                    </span>
                    {QUICK_STATUS_ORDER.map((statusKey) => (
                      <button
                        key={statusKey}
                        type="button"
                        className={`s5-bulk-btn att-${statusKey}`}
                        onClick={() => {
                          if (showDaily) handleDailyBulkStatus(statusKey);
                          else if (showLedger) handleLedgerBulkStatus(statusKey);
                        }}
                      >
                        <span>{STATUS_CONFIG[statusKey].label}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      className="s5-bulk-btn subtle"
                      onClick={() => setAttBulkStatusMode(false)}
                    >
                      Batal
                    </button>
                  </>
                )
              ) : (
                <>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#FCA5A5', marginRight: '2px' }}>
                    {showRecap
                      ? `Hapus presensi ${recapSummaryAll.periodLabel} (${selectedCount} guru)?`
                      : `Hapus ${selectedCount} ${entityLabel}?`}
                  </span>
                  <button
                    type="button"
                    className="s5-bulk-btn confirm-danger"
                    onClick={() => {
                      if (showDaily) handleDailyBulkDelete();
                      else if (showLedger) handleLedgerBulkDelete();
                      else if (showRecap) handleRecapBulkDelete();
                      else if (showHolidays) handleHolidayBulkDelete();
                    }}
                  >
                    <Check size={14} />
                    <span>Ya, Hapus</span>
                  </button>
                  <button
                    type="button"
                    className="s5-bulk-btn subtle"
                    onClick={() => setAttBulkConfirmDelete(false)}
                  >
                    Batal
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              className="s5-bulk-close"
              onClick={handleCloseBar}
              title={showRecap ? 'Tutup bilah tindakan' : 'Batalkan pilihan'}
              aria-label={showRecap ? 'Tutup bilah tindakan' : 'Batalkan pilihan'}
            >
              <X size={15} />
            </button>
          </div>
        );
      })()}

      {/* Ekspor PDF Studio Modal (Synced with Selected Recap Teachers & Month Range) */}
      {pdfModalOpen && (
        <AttendancePdfExportModal
          state={state}
          isOpen={pdfModalOpen}
          initialMonth={recapMode === 'range' ? recapSummaryAll.startMonth : currentMonth}
          initialEndMonth={recapMode === 'range' ? recapSummaryAll.endMonth : undefined}
          initialSelectedTeacherIds={validRecapSelectedIds}
          onClose={() => setPdfModalOpen(false)}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
