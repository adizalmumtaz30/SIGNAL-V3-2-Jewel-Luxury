import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  AlertTriangle,
  Award,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Clock3,
  FileText,
  GripVertical,
  Layers,
  LockKeyhole,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Users,
  WandSparkles,
  X,
} from 'lucide-react';
import type { ActivityType, AppState, Day, PeriodDefinition } from '../domain/types';
import { DAYS } from '../domain/types';
import { MotionModalDialog } from './KpiMotion';
import {
  clockToMinutes,
  createDefaultPeriodDefinitions,
  toClock,
} from '../domain/time';
import {
  getDefaultMadrasahLogo,
  preloadOfficialKopAssets,
  processKopBannerUpload,
  processLogoUpload,
  subscribeOfficialKopAssets,
} from '../utils/madrasahLogo';
import {
  DEFAULT_MADRASAH_IDENTITY,
  OFFICIAL_KOP_ASSET_PATH,
  type KopRenderMode,
} from '../domain/kopIdentity';
import { LivePreviewViewport } from './LivePreviewViewport';
import { OfficialKopSuratPreview } from './OfficialKopSuratPreview';
import {
  DEFAULT_NUMBERING_PATTERN,
  normalizeDocumentNumberingConfig,
} from '../domain/persuratan/finalization/numberingEngine';
import type { NumberingResetMode } from '../domain/persuratan/types';

export interface SettingsScreenProps {
  state: AppState;
  onSettingsChange: (changes: Partial<AppState['settings']>) => void;
  onApplyWeeklyLimitToAllTeachers?: (limit: number) => void;
  onReset: () => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
  saved: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onRegisterSave?: (fn: (() => void) | null) => void;
}

type SettingsTab = 'time' | 'general' | 'ai';

interface SlotDiagnostic {
  kind: 'overlap' | 'gap' | 'invalid';
  diffMinutes: number;
  label: string;
}

const CATEGORY_META: Record<
  ActivityType,
  {
    label: string;
    shortLabel: string;
    dotColor: string;
    text: string;
    description: string;
  }
> = {
  KBM: {
    label: 'Belajar Mengajar (KBM)',
    shortLabel: 'KBM',
    dotColor: '#1B5E43',
    text: '#14523B',
    description: 'Slot tatap muka mapel dan acuan beban mengajar guru.',
  },
  ISTIRAHAT: {
    label: 'Istirahat',
    shortLabel: 'Istirahat',
    dotColor: '#B57D1E',
    text: '#7F5612',
    description: 'Jeda istirahat, otomatis terkunci dari penempatan mapel.',
  },
  UPACARA: {
    label: 'Upacara Bendera',
    shortLabel: 'Upacara',
    dotColor: '#A63A2E',
    text: '#8F2D24',
    description: 'Upacara bendera atau apel pagi madrasah.',
  },
  RELIGI: {
    label: 'Religi / Dhuha',
    shortLabel: 'Religi',
    dotColor: '#6A3D9A',
    text: '#582F84',
    description: 'Sholat dhuha, tadarus, atau dzuhur berjamaah.',
  },
  LAINNYA: {
    label: 'Kegiatan Lain',
    shortLabel: 'Lainnya',
    dotColor: '#4E635D',
    text: '#384B45',
    description: 'Literasi, pembinaan wali kelas, atau agenda khusus.',
  },
};

const NON_KBM_OPTIONS: {
  type: ActivityType;
  label: string;
  defaultMins: number;
  defaultName: string;
}[] = [
  { type: 'ISTIRAHAT', label: 'Istirahat (20 mnt)', defaultMins: 20, defaultName: 'Istirahat' },
  { type: 'UPACARA', label: 'Upacara Bendera (40 mnt)', defaultMins: 40, defaultName: 'Upacara Bendera' },
  {
    type: 'RELIGI',
    label: 'Religi / Dhuha (30 mnt)',
    defaultMins: 30,
    defaultName: 'Sholat Dhuha / Tadarus',
  },
  {
    type: 'LAINNYA',
    label: 'Kegiatan Lain (30 mnt)',
    defaultMins: 30,
    defaultName: 'Pembinaan Karakter',
  },
];

function formatDisplayDateId(): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}

function getDefaultDefsFromSettings(settings: AppState['settings']): PeriodDefinition[] {
  return (
    settings.periodDefinitions ??
    createDefaultPeriodDefinitions(
      settings.teachingPeriodsPerDay ?? 8,
      settings.breakAfterJP ?? [2, 5],
      settings.periodMinutes ?? 40,
    )
  );
}

/**
 * Re-numbers `order` and sequentially aligns slots starting AFTER `anchorIndex`.
 * When `anchorIndex === -1`, aligns all slots from index 0 using slot[0].start (or 07:00).
 */
function alignSequentialSlots(
  list: PeriodDefinition[],
  anchorIndex = -1,
  fallbackDur = 40,
): PeriodDefinition[] {
  if (list.length === 0) return list;
  const result = list.map((item, idx) => ({ ...item, order: idx + 1 }));
  let cursor =
    anchorIndex >= 0
      ? clockToMinutes(result[anchorIndex].end)
      : clockToMinutes(result[0].start || '07:00');

  const startFrom = anchorIndex >= 0 ? anchorIndex + 1 : 0;
  for (let i = startFrom; i < result.length; i++) {
    const curDur = Math.max(5, clockToMinutes(result[i].end) - clockToMinutes(result[i].start) || fallbackDur);
    result[i] = {
      ...result[i],
      start: toClock(cursor),
      end: toClock(cursor + curDur),
    };
    cursor += curDur;
  }
  return result;
}

export function SettingsScreen({
  state,
  onSettingsChange,
  onApplyWeeklyLimitToAllTeachers,
  onReset,
  onNotify,
  saved,
  onDirtyChange,
  onRegisterSave,
}: SettingsScreenProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('time');
  const [schoolName, setSchoolName] = useState(state.settings.schoolName);
  const [academicYear, setAcademicYear] = useState(state.settings.academicYear);
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(state.settings.semester);
  const [periodMinutes, setPeriodMinutes] = useState(String(state.settings.periodMinutes ?? 40));
  const [maxWeeklyJP, setMaxWeeklyJP] = useState(String(state.settings.maxWeeklyJP ?? 24));
  const [searchLimit, setSearchLimit] = useState(String(state.settings.searchLimit ?? 65000));
  const [activeDays, setActiveDays] = useState<Day[]>(state.settings.activeDays);
  const [geminiEnabled, setGeminiEnabled] = useState(state.settings.geminiEnabled);
  const [previewDay, setPreviewDay] = useState<Day>(state.settings.activeDays[0] || 'Senin');
  const [autoCascade, setAutoCascade] = useState(true);

  const [nonKbmMenuOpen, setNonKbmMenuOpen] = useState(false);
  const nonKbmMenuRef = useRef<HTMLDivElement | null>(null);

  const [insertMenuState, setInsertMenuState] = useState<{
    idx: number;
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const headerRef = useRef<HTMLElement | null>(null);

  // Madrasah Profile & Document Integration
  const [ministry, setMinistry] = useState(
    state.settings.ministry ?? DEFAULT_MADRASAH_IDENTITY.ministry,
  );
  const [regionalOffice, setRegionalOffice] = useState(
    state.settings.regionalOffice ?? DEFAULT_MADRASAH_IDENTITY.regionalOffice,
  );
  const [legalDecree, setLegalDecree] = useState(
    state.settings.legalDecree ?? DEFAULT_MADRASAH_IDENTITY.legalDecree,
  );
  const [accreditation, setAccreditation] = useState(
    state.settings.accreditation ?? DEFAULT_MADRASAH_IDENTITY.accreditation,
  );
  const [address, setAddress] = useState(
    state.settings.address ?? DEFAULT_MADRASAH_IDENTITY.address,
  );
  const [city, setCity] = useState(state.settings.city ?? DEFAULT_MADRASAH_IDENTITY.city);
  const [postalCode, setPostalCode] = useState(
    state.settings.postalCode ?? DEFAULT_MADRASAH_IDENTITY.postalCode,
  );
  const [npsn, setNpsn] = useState(state.settings.npsn ?? DEFAULT_MADRASAH_IDENTITY.npsn);
  const [nsm, setNsm] = useState(state.settings.nsm ?? DEFAULT_MADRASAH_IDENTITY.nsm);
  const [phone, setPhone] = useState(state.settings.phone ?? DEFAULT_MADRASAH_IDENTITY.phone);
  const [email, setEmail] = useState(state.settings.email ?? DEFAULT_MADRASAH_IDENTITY.email);
  const [website, setWebsite] = useState(
    state.settings.website ?? DEFAULT_MADRASAH_IDENTITY.website,
  );
  const [logoUrl, setLogoUrl] = useState<string>(state.settings.logoUrl ?? '');
  const [logoError, setLogoError] = useState<string | null>(null);
  const [kopMode, setKopMode] = useState<KopRenderMode>(
    state.settings.kopMode ?? DEFAULT_MADRASAH_IDENTITY.kopMode,
  );
  const [kopImageUrl, setKopImageUrl] = useState<string>(
    state.settings.kopImageUrl ?? DEFAULT_MADRASAH_IDENTITY.kopImageUrl,
  );
  const [kopBannerError, setKopBannerError] = useState<string | null>(null);
  const [, setKopAssetTick] = useState(0);

  // Official Signatories
  const [headmasterName, setHeadmasterName] = useState(
    state.settings.headmasterName ?? 'H. Ahmad Fauzi, S.Ag., M.Pd.I.',
  );
  const [headmasterNip, setHeadmasterNip] = useState(
    state.settings.headmasterNip ?? '19750812 200212 1 003',
  );
  const [headmasterTitle, setHeadmasterTitle] = useState(
    state.settings.headmasterTitle ?? 'Kepala Madrasah',
  );
  const [curriculumLeaderName, setCurriculumLeaderName] = useState(
    state.settings.curriculumLeaderName ?? 'Siti Aminah, S.Pd.I., M.Pd.',
  );
  const [curriculumLeaderNip, setCurriculumLeaderNip] = useState(
    state.settings.curriculumLeaderNip ?? '19820315 200901 2 008',
  );
  const [curriculumLeaderTitle, setCurriculumLeaderTitle] = useState(
    state.settings.curriculumLeaderTitle ?? 'Waka Bidang Kurikulum',
  );

  const initialNumbering = normalizeDocumentNumberingConfig(
    state.settings.documentNumbering,
    state.settings,
  );
  const [numberingMadrasahCode, setNumberingMadrasahCode] = useState(
    initialNumbering.madrasahCode,
  );
  const [numberingPattern, setNumberingPattern] = useState(initialNumbering.formatPattern);
  const [numberingPadding, setNumberingPadding] = useState(initialNumbering.seqPadding);
  const [numberingResetMode, setNumberingResetMode] = useState<NumberingResetMode>(
    initialNumbering.resetMode,
  );

  const [definitions, setDefinitions] = useState<PeriodDefinition[]>(() =>
    getDefaultDefsFromSettings(state.settings),
  );

  const syncFromSettings = (nextSettings: AppState['settings']) => {
    setSchoolName(nextSettings.schoolName);
    setAcademicYear(nextSettings.academicYear);
    setSemester(nextSettings.semester);
    setPeriodMinutes(String(nextSettings.periodMinutes ?? 40));
    setMaxWeeklyJP(String(nextSettings.maxWeeklyJP ?? 24));
    setSearchLimit(String(nextSettings.searchLimit ?? 65000));
    setActiveDays(nextSettings.activeDays);
    setGeminiEnabled(nextSettings.geminiEnabled);
    setPreviewDay(nextSettings.activeDays[0] || 'Senin');
    setMinistry(nextSettings.ministry ?? DEFAULT_MADRASAH_IDENTITY.ministry);
    setRegionalOffice(
      nextSettings.regionalOffice ?? DEFAULT_MADRASAH_IDENTITY.regionalOffice,
    );
    setLegalDecree(nextSettings.legalDecree ?? DEFAULT_MADRASAH_IDENTITY.legalDecree);
    setAccreditation(nextSettings.accreditation ?? DEFAULT_MADRASAH_IDENTITY.accreditation);
    setAddress(nextSettings.address ?? DEFAULT_MADRASAH_IDENTITY.address);
    setCity(nextSettings.city ?? DEFAULT_MADRASAH_IDENTITY.city);
    setPostalCode(nextSettings.postalCode ?? DEFAULT_MADRASAH_IDENTITY.postalCode);
    setNpsn(nextSettings.npsn ?? DEFAULT_MADRASAH_IDENTITY.npsn);
    setNsm(nextSettings.nsm ?? DEFAULT_MADRASAH_IDENTITY.nsm);
    setPhone(nextSettings.phone ?? DEFAULT_MADRASAH_IDENTITY.phone);
    setEmail(nextSettings.email ?? DEFAULT_MADRASAH_IDENTITY.email);
    setWebsite(nextSettings.website ?? DEFAULT_MADRASAH_IDENTITY.website);
    setLogoUrl(nextSettings.logoUrl ?? '');
    setLogoError(null);
    setKopMode(nextSettings.kopMode ?? DEFAULT_MADRASAH_IDENTITY.kopMode);
    setKopImageUrl(nextSettings.kopImageUrl ?? DEFAULT_MADRASAH_IDENTITY.kopImageUrl);
    setKopBannerError(null);
    setHeadmasterName(nextSettings.headmasterName ?? 'H. Ahmad Fauzi, S.Ag., M.Pd.I.');
    setHeadmasterNip(nextSettings.headmasterNip ?? '19750812 200212 1 003');
    setHeadmasterTitle(nextSettings.headmasterTitle ?? 'Kepala Madrasah');
    setCurriculumLeaderName(nextSettings.curriculumLeaderName ?? 'Siti Aminah, S.Pd.I., M.Pd.');
    setCurriculumLeaderNip(nextSettings.curriculumLeaderNip ?? '19820315 200901 2 008');
    setCurriculumLeaderTitle(nextSettings.curriculumLeaderTitle ?? 'Waka Bidang Kurikulum');
    const syncedNum = normalizeDocumentNumberingConfig(
      nextSettings.documentNumbering,
      nextSettings,
    );
    setNumberingMadrasahCode(syncedNum.madrasahCode);
    setNumberingPattern(syncedNum.formatPattern);
    setNumberingPadding(syncedNum.seqPadding);
    setNumberingResetMode(syncedNum.resetMode);
    setDefinitions(getDefaultDefsFromSettings(nextSettings));
  };

  useEffect(() => {
    syncFromSettings(state.settings);
  }, [state.settings]);

  useEffect(() => {
    void preloadOfficialKopAssets();
    return subscribeOfficialKopAssets(() => {
      setKopAssetTick((n) => n + 1);
    });
  }, []);

  // Observe luxury header visibility so Floating Save Bar appears only when header is scrolled out
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const scrollRoot = el.closest('.content-scroll') as HTMLElement | null;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsHeaderVisible(entry.isIntersecting);
        }
      },
      {
        root: scrollRoot || null,
        threshold: 0.05,
      },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nonKbmMenuOpen && !insertMenuState) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (nonKbmMenuOpen && nonKbmMenuRef.current && target && !nonKbmMenuRef.current.contains(target)) {
        setNonKbmMenuOpen(false);
      }
      if (
        insertMenuState &&
        target &&
        !target.closest('.s5-row-insert-wrap') &&
        !target.closest('.s5-row-insert-menu')
      ) {
        setInsertMenuState(null);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setNonKbmMenuOpen(false);
        setInsertMenuState(null);
      }
    };
    const handleScrollClose = () => {
      if (insertMenuState) setInsertMenuState(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    window.addEventListener('scroll', handleScrollClose, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
      window.removeEventListener('scroll', handleScrollClose, true);
    };
  }, [nonKbmMenuOpen, insertMenuState]);

  // Handlers
  const handleToggleDay = (day: Day) => {
    if (activeDays.includes(day)) {
      if (activeDays.length <= 1) {
        onNotify('Minimal harus ada 1 hari KBM aktif dalam sepekan.', 'warning');
        return;
      }
      const next = activeDays.filter((d) => d !== day);
      setActiveDays(next);
      if (previewDay === day && next[0]) {
        setPreviewDay(next[0]);
      }
    } else {
      const ordered = DAYS.filter((d) => d === day || activeDays.includes(d));
      setActiveDays(ordered);
    }
  };

  const handleApplyDayPreset = (preset: '5days' | '6days') => {
    const next: Day[] =
      preset === '5days'
        ? ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']
        : ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    setActiveDays(next);
    if (!next.includes(previewDay)) {
      setPreviewDay('Senin');
    }
    onNotify(
      preset === '5days'
        ? 'Hari aktif disetel ke 5 hari kerja (Senin–Jumat).'
        : 'Hari aktif disetel ke 6 hari KBM (Senin–Sabtu).',
      'info',
    );
  };

  const handleUpdateDef = (
    index: number,
    changes: Partial<PeriodDefinition>,
    cascadeAfter = false,
  ) => {
    const updated = [...definitions];
    updated[index] = { ...updated[index], ...changes };
    if (cascadeAfter && autoCascade) {
      setDefinitions(alignSequentialSlots(updated, index, Number(periodMinutes) || 40));
    } else {
      setDefinitions(updated);
    }
  };

  const handleDurationChange = (index: number, newMinutes: number) => {
    const safeDur = Math.max(5, Math.min(180, newMinutes || 40));
    const def = definitions[index];
    const startMins = clockToMinutes(def.start);
    const newEnd = toClock(startMins + safeDur);
    handleUpdateDef(index, { end: newEnd }, true);
  };

  const handleStartTimeChange = (index: number, newStart: string) => {
    const def = definitions[index];
    const currentDur = Math.max(5, clockToMinutes(def.end) - clockToMinutes(def.start));
    const startMins = clockToMinutes(newStart);
    const newEnd = toClock(startMins + currentDur);
    handleUpdateDef(index, { start: newStart, end: newEnd }, true);
  };

  const handleEndTimeChange = (index: number, newEnd: string) => {
    handleUpdateDef(index, { end: newEnd }, true);
  };

  const handleMoveSlot = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= definitions.length) return;
    const updated = [...definitions];
    const temp = updated[index];
    updated[index] = updated[target];
    updated[target] = temp;
    if (autoCascade) {
      setDefinitions(alignSequentialSlots(updated, -1, Number(periodMinutes) || 40));
    } else {
      setDefinitions(updated.map((item, idx) => ({ ...item, order: idx + 1 })));
    }
  };

  const handleDropReorder = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx || fromIdx < 0 || toIdx < 0 || fromIdx >= definitions.length || toIdx >= definitions.length) {
      return;
    }
    const anchorStart = definitions[0]?.start || '07:00';
    const updated = [...definitions];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    if (autoCascade) {
      updated[0] = {
        ...updated[0],
        start: anchorStart,
        end: toClock(
          clockToMinutes(anchorStart) +
            Math.max(5, clockToMinutes(updated[0].end) - clockToMinutes(updated[0].start)),
        ),
      };
      setDefinitions(alignSequentialSlots(updated, -1, Number(periodMinutes) || 40));
    } else {
      setDefinitions(updated.map((item, idx) => ({ ...item, order: idx + 1 })));
    }
    onNotify(`Urutan slot #${fromIdx + 1} dipindahkan ke posisi #${toIdx + 1}.`, 'info');
  };

  const handleAddSlot = (
    activityType: ActivityType = 'KBM',
    customMinutes?: number,
    customName?: string,
    applicableDays?: Day[],
  ) => {
    const last = definitions[definitions.length - 1];
    const order = definitions.length + 1;
    const startMins = last ? clockToMinutes(last.end) : 7 * 60;
    const dur =
      customMinutes ??
      (activityType === 'KBM' ? Number(periodMinutes) || 40 : activityType === 'ISTIRAHAT' ? 20 : 30);
    const endMins = startMins + dur;

    setDefinitions([
      ...definitions,
      {
        order,
        start: toClock(startMins),
        end: toClock(endMins),
        activityType,
        activityName:
          customName ||
          (activityType === 'ISTIRAHAT'
            ? 'Istirahat'
            : activityType === 'UPACARA'
            ? 'Upacara Bendera'
            : activityType === 'RELIGI'
            ? 'Sholat Dhuha / Tadarus'
            : ''),
        applicableDays: applicableDays ?? (activityType === 'UPACARA' ? ['Senin'] : undefined),
      },
    ]);
    setNonKbmMenuOpen(false);
    onNotify(`Slot ${CATEGORY_META[activityType].shortLabel} ditambahkan ke urutan #${order}.`, 'info');
  };

  const handleInsertBelow = (
    idx: number,
    activityType: ActivityType,
    customMinutes?: number,
    customName?: string,
  ) => {
    const anchor = definitions[idx];
    const startMins = anchor ? clockToMinutes(anchor.end) : 7 * 60;
    const dur =
      customMinutes ??
      (activityType === 'KBM' ? Number(periodMinutes) || 40 : activityType === 'ISTIRAHAT' ? 20 : 30);
    const newSlot: PeriodDefinition = {
      order: idx + 2,
      start: toClock(startMins),
      end: toClock(startMins + dur),
      activityType,
      activityName:
        customName ||
        (activityType === 'ISTIRAHAT'
          ? 'Istirahat'
          : activityType === 'UPACARA'
          ? 'Upacara Bendera'
          : activityType === 'RELIGI'
          ? 'Sholat Dhuha / Tadarus'
          : ''),
      applicableDays: activityType === 'UPACARA' ? ['Senin'] : undefined,
    };

    const nextList = [
      ...definitions.slice(0, idx + 1),
      newSlot,
      ...definitions.slice(idx + 1),
    ];

    if (autoCascade) {
      setDefinitions(alignSequentialSlots(nextList, idx + 1, Number(periodMinutes) || 40));
    } else {
      setDefinitions(nextList.map((item, i) => ({ ...item, order: i + 1 })));
    }
    setInsertMenuState(null);
    onNotify(`Slot ${CATEGORY_META[activityType].shortLabel} disisipkan di bawah baris #${idx + 1}.`, 'info');
  };

  const handleCascadeSequentialTimes = (baseMinutes?: number, silent = false) => {
    if (!definitions.length) return;
    const kbmDur = baseMinutes ?? (Number(periodMinutes) || 40);
    const firstStart = clockToMinutes(definitions[0].start || '07:00');
    let cursor = firstStart;

    const updated = definitions.map((def, idx) => {
      let dur = Math.max(5, clockToMinutes(def.end) - clockToMinutes(def.start));
      if (def.activityType === 'KBM') {
        dur = kbmDur;
      }
      const start = toClock(cursor);
      const end = toClock(cursor + dur);
      cursor += dur;
      return {
        ...def,
        order: idx + 1,
        start,
        end,
      };
    });
    setDefinitions(updated);
    if (!silent) {
      onNotify(`Seluruh ${updated.length} slot jam disinkronkan berurutan (${kbmDur} mnt/JP).`, 'success');
    }
  };

  const handleFixRowAt = (idx: number) => {
    const updated = [...definitions];
    const target = updated[idx];
    if (!target) return;
    const curStart = clockToMinutes(target.start);
    const curEnd = clockToMinutes(target.end);
    const curDur = curEnd > curStart ? curEnd - curStart : (target.activityType === 'KBM' ? safeMinutes : 20);

    if (idx === 0) {
      updated[0] = {
        ...target,
        end: toClock(curStart + curDur),
      };
    } else {
      const prevEnd = clockToMinutes(updated[idx - 1].end);
      updated[idx] = {
        ...target,
        start: toClock(prevEnd),
        end: toClock(prevEnd + curDur),
      };
    }
    setDefinitions(alignSequentialSlots(updated, idx, safeMinutes));
    onNotify(`Slot #${idx + 1} dan baris setelahnya dirapikan berurutan.`, 'success');
  };

  const handleQuickDurationPreset = (mins: number) => {
    setPeriodMinutes(String(mins));
    handleCascadeSequentialTimes(mins, true);
    onNotify(`Durasi standar diatur ke ${mins} menit/JP dan slot KBM disinkronkan.`, 'success');
  };

  const handleStepPeriodMinutes = (delta: number) => {
    const next = Math.max(20, Math.min(90, (Number(periodMinutes) || 40) + delta));
    setPeriodMinutes(String(next));
    handleCascadeSequentialTimes(next, true);
  };

  const commitTypedPeriodMinutes = (forceNotify = true) => {
    const raw = Number(periodMinutes);
    const clamped = Math.max(20, Math.min(90, Number.isNaN(raw) || raw <= 0 ? 40 : Math.round(raw)));
    setPeriodMinutes(String(clamped));
    const differs = definitions.some(
      (d) => d.activityType === 'KBM' && Math.max(0, clockToMinutes(d.end) - clockToMinutes(d.start)) !== clamped,
    );
    if (differs || String(raw) !== String(clamped)) {
      handleCascadeSequentialTimes(clamped, true);
      if (forceNotify && differs) {
        onNotify(`Durasi standar ${clamped} menit/JP diterapkan ke seluruh slot KBM.`, 'success');
      }
    }
  };

  const handleLoadStandardTemplate = () => {
    const dur = Number(periodMinutes) || 40;
    setDefinitions(createDefaultPeriodDefinitions(8, [2, 5], dur));
    onNotify(`Template Standar 8 JP (${dur} mnt/JP) dimuat.`, 'success');
  };

  const handleLoadFullDayTemplate = () => {
    const dur = Number(periodMinutes) || 40;
    let cursor = 7 * 60;
    const defs: PeriodDefinition[] = [
      {
        order: 1,
        start: toClock(cursor),
        end: toClock(cursor + 40),
        activityType: 'UPACARA',
        activityName: 'Upacara Bendera',
        applicableDays: ['Senin'],
      },
    ];
    cursor += 40;
    for (let i = 1; i <= 9; i++) {
      defs.push({
        order: defs.length + 1,
        start: toClock(cursor),
        end: toClock(cursor + dur),
        activityType: 'KBM',
      });
      cursor += dur;
      if (i === 3) {
        defs.push({
          order: defs.length + 1,
          start: toClock(cursor),
          end: toClock(cursor + 20),
          activityType: 'ISTIRAHAT',
          activityName: 'Istirahat Pagi',
        });
        cursor += 20;
      } else if (i === 6) {
        defs.push({
          order: defs.length + 1,
          start: toClock(cursor),
          end: toClock(cursor + 40),
          activityType: 'RELIGI',
          activityName: 'Sholat Dhuhur Berjamaah',
        });
        cursor += 40;
      }
    }
    setDefinitions(defs);
    onNotify('Template Full Day (Upacara + 9 JP + Istirahat + Dhuhur) dimuat.', 'success');
  };

  const handleDeleteSlot = (index: number) => {
    if (definitions.length <= 1) return;
    const removed = definitions[index];
    const filtered = definitions.filter((_, i) => i !== index);
    if (autoCascade) {
      setDefinitions(alignSequentialSlots(filtered, Math.max(-1, index - 1), Number(periodMinutes) || 40));
    } else {
      setDefinitions(filtered.map((def, idx) => ({ ...def, order: idx + 1 })));
    }
    onNotify(`Slot #${removed.order} (${CATEGORY_META[removed.activityType].shortLabel}) dihapus.`, 'info');
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setLogoError(null);
      const dataUrl = await processLogoUpload(file);
      setLogoUrl(dataUrl);
      onNotify('Logo madrasah dimuat. Klik Simpan Pengaturan untuk menetapkan.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses berkas logo.';
      setLogoError(msg);
      onNotify(msg, 'error');
    }
  };

  const handleResetLogo = () => {
    setLogoUrl('');
    setLogoError(null);
    onNotify('Logo dikembalikan ke lambang resmi MTs Daruttafsir Al-Husaini.', 'info');
  };

  const handleKopBannerUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setKopBannerError(null);
      const dataUrl = await processKopBannerUpload(file);
      setKopImageUrl(dataUrl);
      setKopMode('image');
      onNotify('Gambar Kop Surat penuh dimuat. Klik Simpan Pengaturan untuk menerapkan.', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal memproses berkas gambar kop surat.';
      setKopBannerError(msg);
      onNotify(msg, 'error');
    }
  };

  const handleResetKopBanner = () => {
    setKopImageUrl(OFFICIAL_KOP_ASSET_PATH);
    setKopBannerError(null);
    onNotify('Gambar kop surat dikembalikan ke Kop Resmi MTs Daruttafsir Al-Husaini.', 'info');
  };

  const handleApplyOfficialTemplate = () => {
    setSchoolName(DEFAULT_MADRASAH_IDENTITY.schoolName);
    setMinistry(DEFAULT_MADRASAH_IDENTITY.ministry);
    setRegionalOffice(DEFAULT_MADRASAH_IDENTITY.regionalOffice);
    setLegalDecree(DEFAULT_MADRASAH_IDENTITY.legalDecree);
    setAccreditation(DEFAULT_MADRASAH_IDENTITY.accreditation);
    setNsm(DEFAULT_MADRASAH_IDENTITY.nsm);
    setNpsn(DEFAULT_MADRASAH_IDENTITY.npsn);
    setAddress(DEFAULT_MADRASAH_IDENTITY.address);
    setCity(DEFAULT_MADRASAH_IDENTITY.city);
    setPostalCode(DEFAULT_MADRASAH_IDENTITY.postalCode);
    setPhone(DEFAULT_MADRASAH_IDENTITY.phone);
    setEmail(DEFAULT_MADRASAH_IDENTITY.email);
    setWebsite(DEFAULT_MADRASAH_IDENTITY.website);
    setLogoUrl('');
    setKopMode(DEFAULT_MADRASAH_IDENTITY.kopMode);
    setKopImageUrl(DEFAULT_MADRASAH_IDENTITY.kopImageUrl);
    onNotify('Template identitas & Kop Resmi MTs Daruttafsir Al-Husaini diterapkan. Klik Simpan untuk mengunci.', 'success');
  };

  const handleSave = () => {
    const kbmCount = definitions.filter((d) => d.activityType === 'KBM').length;
    const safeMinVal = Math.max(20, Math.min(90, Number(periodMinutes) || 40));
    const safeMaxWeeklyVal = Math.max(1, Math.min(80, Math.round(Number(maxWeeklyJP) || 24)));
    const safeSearchLimitVal = Math.max(1500, Math.min(100000, Math.round(Number(searchLimit) || 65000)));
    setPeriodMinutes(String(safeMinVal));
    setMaxWeeklyJP(String(safeMaxWeeklyVal));
    setSearchLimit(String(safeSearchLimitVal));
    onSettingsChange({
      schoolName: schoolName.trim() || DEFAULT_MADRASAH_IDENTITY.schoolName,
      ministry: ministry.trim(),
      regionalOffice: regionalOffice.trim(),
      legalDecree: legalDecree.trim(),
      accreditation: accreditation.trim(),
      address: address.trim() || DEFAULT_MADRASAH_IDENTITY.address,
      city: city.trim() || DEFAULT_MADRASAH_IDENTITY.city,
      postalCode: postalCode.trim(),
      npsn: npsn.trim(),
      nsm: nsm.trim(),
      phone: phone.trim(),
      email: email.trim(),
      website: website.trim(),
      logoUrl: logoUrl.trim() || undefined,
      kopMode,
      kopImageUrl: kopImageUrl.trim() || OFFICIAL_KOP_ASSET_PATH,
      headmasterName: headmasterName.trim() || 'H. Ahmad Fauzi, S.Ag., M.Pd.I.',
      headmasterNip: headmasterNip.trim() || '19750812 200212 1 003',
      headmasterTitle: headmasterTitle.trim() || 'Kepala Madrasah',
      curriculumLeaderName: curriculumLeaderName.trim() || 'Siti Aminah, S.Pd.I., M.Pd.',
      curriculumLeaderNip: curriculumLeaderNip.trim() || '19820315 200901 2 008',
      curriculumLeaderTitle: curriculumLeaderTitle.trim() || 'Waka Bidang Kurikulum',
      academicYear: academicYear.trim() || '2026/2027',
      semester,
      periodMinutes: safeMinVal,
      maxWeeklyJP: safeMaxWeeklyVal,
      searchLimit: safeSearchLimitVal,
      activeDays,
      teachingPeriodsPerDay: Math.max(1, kbmCount),
      periodDefinitions: definitions,
      geminiEnabled,
      documentNumbering: normalizeDocumentNumberingConfig(
        {
          enabled: true,
          madrasahCode: numberingMadrasahCode.trim() || 'MTs.DA',
          formatPattern: numberingPattern.trim() || DEFAULT_NUMBERING_PATTERN,
          seqPadding: numberingPadding,
          resetMode: numberingResetMode,
        },
        state.settings,
      ),
    });
  };

  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  useEffect(() => {
    onRegisterSave?.(() => handleSaveRef.current());
    return () => {
      onRegisterSave?.(null);
    };
  }, [onRegisterSave]);

  const handleDiscardChanges = () => {
    syncFromSettings(state.settings);
    onNotify('Perubahan yang belum disimpan dikembalikan.', 'info');
  };

  const isDirty = useMemo(() => {
    const s = state.settings;
    const savedDefs = getDefaultDefsFromSettings(s);
    if (schoolName !== s.schoolName) return true;
    if (academicYear !== s.academicYear) return true;
    if (semester !== s.semester) return true;
    if (periodMinutes !== String(s.periodMinutes ?? 40)) return true;
    if (maxWeeklyJP !== String(s.maxWeeklyJP ?? 24)) return true;
    if (searchLimit !== String(s.searchLimit ?? 65000)) return true;
    if (geminiEnabled !== s.geminiEnabled) return true;
    if (JSON.stringify(activeDays) !== JSON.stringify(s.activeDays)) return true;
    if (JSON.stringify(definitions) !== JSON.stringify(savedDefs)) return true;
    if (ministry !== (s.ministry ?? DEFAULT_MADRASAH_IDENTITY.ministry)) return true;
    if (regionalOffice !== (s.regionalOffice ?? DEFAULT_MADRASAH_IDENTITY.regionalOffice))
      return true;
    if (legalDecree !== (s.legalDecree ?? DEFAULT_MADRASAH_IDENTITY.legalDecree)) return true;
    if (accreditation !== (s.accreditation ?? DEFAULT_MADRASAH_IDENTITY.accreditation)) return true;
    if (address !== (s.address ?? DEFAULT_MADRASAH_IDENTITY.address)) return true;
    if (city !== (s.city ?? DEFAULT_MADRASAH_IDENTITY.city)) return true;
    if (postalCode !== (s.postalCode ?? DEFAULT_MADRASAH_IDENTITY.postalCode)) return true;
    if (npsn !== (s.npsn ?? DEFAULT_MADRASAH_IDENTITY.npsn)) return true;
    if (nsm !== (s.nsm ?? DEFAULT_MADRASAH_IDENTITY.nsm)) return true;
    if (phone !== (s.phone ?? DEFAULT_MADRASAH_IDENTITY.phone)) return true;
    if (email !== (s.email ?? DEFAULT_MADRASAH_IDENTITY.email)) return true;
    if (website !== (s.website ?? DEFAULT_MADRASAH_IDENTITY.website)) return true;
    if (logoUrl !== (s.logoUrl ?? '')) return true;
    if (kopMode !== (s.kopMode ?? DEFAULT_MADRASAH_IDENTITY.kopMode)) return true;
    if (kopImageUrl !== (s.kopImageUrl ?? DEFAULT_MADRASAH_IDENTITY.kopImageUrl)) return true;
    if (headmasterName !== (s.headmasterName ?? 'H. Ahmad Fauzi, S.Ag., M.Pd.I.')) return true;
    if (headmasterNip !== (s.headmasterNip ?? '19750812 200212 1 003')) return true;
    if (headmasterTitle !== (s.headmasterTitle ?? 'Kepala Madrasah')) return true;
    if (curriculumLeaderName !== (s.curriculumLeaderName ?? 'Siti Aminah, S.Pd.I., M.Pd.'))
      return true;
    if (curriculumLeaderNip !== (s.curriculumLeaderNip ?? '19820315 200901 2 008')) return true;
    if (curriculumLeaderTitle !== (s.curriculumLeaderTitle ?? 'Waka Bidang Kurikulum')) return true;
    const savedNum = normalizeDocumentNumberingConfig(s.documentNumbering, s);
    if (numberingMadrasahCode !== savedNum.madrasahCode) return true;
    if (numberingPattern !== savedNum.formatPattern) return true;
    if (numberingPadding !== savedNum.seqPadding) return true;
    if (numberingResetMode !== savedNum.resetMode) return true;
    return false;
  }, [
    schoolName,
    academicYear,
    semester,
    periodMinutes,
    maxWeeklyJP,
    searchLimit,
    geminiEnabled,
    activeDays,
    definitions,
    ministry,
    regionalOffice,
    legalDecree,
    accreditation,
    address,
    city,
    postalCode,
    npsn,
    nsm,
    phone,
    email,
    website,
    logoUrl,
    kopMode,
    kopImageUrl,
    headmasterName,
    headmasterNip,
    headmasterTitle,
    curriculumLeaderName,
    curriculumLeaderNip,
    curriculumLeaderTitle,
    numberingMadrasahCode,
    numberingPattern,
    numberingPadding,
    numberingResetMode,
    state.settings,
  ]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  const safeMinutes = Math.max(20, Math.min(90, Number(periodMinutes) || 40));
  const safeMaxWeeklyJP = Math.max(1, Math.min(80, Math.round(Number(maxWeeklyJP) || (state.settings.maxWeeklyJP ?? 24))));

  const typedMinutes = Number(periodMinutes);
  const needsMinutesApply = useMemo(() => {
    if (Number.isNaN(typedMinutes) || typedMinutes < 20 || typedMinutes > 90) return false;
    return definitions.some(
      (d) =>
        d.activityType === 'KBM' &&
        Math.max(0, clockToMinutes(d.end) - clockToMinutes(d.start)) !== typedMinutes,
    );
  }, [definitions, typedMinutes]);

  const slotDiagnostics = useMemo(() => {
    const byIndex: (SlotDiagnostic | null)[] = definitions.map((def, idx) => {
      const startMins = clockToMinutes(def.start);
      const endMins = clockToMinutes(def.end);
      if (endMins <= startMins) {
        return {
          kind: 'invalid',
          diffMinutes: startMins - endMins,
          label: 'Jam selesai harus setelah jam mulai',
        };
      }
      if (idx > 0) {
        const prevEndMins = clockToMinutes(definitions[idx - 1].end);
        if (startMins < prevEndMins) {
          const diff = prevEndMins - startMins;
          return {
            kind: 'overlap',
            diffMinutes: diff,
            label: `Tabrakan ${diff} mnt`,
          };
        }
        if (startMins > prevEndMins) {
          const diff = startMins - prevEndMins;
          return {
            kind: 'gap',
            diffMinutes: diff,
            label: `Celah ${diff} mnt`,
          };
        }
      }
      return null;
    });

    const overlapCount = byIndex.filter((d) => d?.kind === 'overlap' || d?.kind === 'invalid').length;
    const gapCount = byIndex.filter((d) => d?.kind === 'gap').length;
    return { byIndex, overlapCount, gapCount };
  }, [definitions]);

  const liveStats = useMemo(() => {
    let weeklyKbm = 0;
    for (const day of activeDays) {
      const daySlots = definitions.filter(
        (d) =>
          d.activityType === 'KBM' &&
          (!d.applicableDays || d.applicableDays.length === 0 || d.applicableDays.includes(day)),
      );
      weeklyKbm += daySlots.length;
    }

    const kbmCount = definitions.filter((d) => d.activityType === 'KBM').length;
    const nonKbmCount = definitions.length - kbmCount;
    const totalKbmMinsPerDay = definitions
      .filter((d) => d.activityType === 'KBM')
      .reduce((acc, d) => acc + Math.max(0, clockToMinutes(d.end) - clockToMinutes(d.start)), 0);
    const totalNonKbmMinsPerDay = definitions
      .filter((d) => d.activityType !== 'KBM')
      .reduce((acc, d) => acc + Math.max(0, clockToMinutes(d.end) - clockToMinutes(d.start)), 0);
    const totalDayMins = Math.max(1, totalKbmMinsPerDay + totalNonKbmMinsPerDay);
    const kbmSharePct = Math.round((totalKbmMinsPerDay / totalDayMins) * 100);
    const weeklyAstroHours = ((weeklyKbm * safeMinutes) / 60).toFixed(1);
    const dailySpan = `${definitions[0]?.start ?? '07:00'} – ${definitions[definitions.length - 1]?.end ?? '13:00'}`;

    return {
      weeklyKbm,
      kbmCount,
      nonKbmCount,
      kbmSharePct,
      weeklyAstroHours,
      dailySpan,
      totalKbmMinsPerDay,
      totalNonKbmMinsPerDay,
    };
  }, [activeDays, definitions, safeMinutes]);

  const impactStats = useMemo(() => {
    const activeClassesCount = state.classes.filter((c) => c.isActive).length;
    const activeTeachersCount = state.teachers.filter((t) => t.isActive).length;
    const activeEntriesCount = (state.draft ?? state.activeSchedule ?? []).length;
    const savedDefs = getDefaultDefsFromSettings(state.settings);
    let savedWeeklyKbm = 0;
    for (const day of state.settings.activeDays) {
      savedWeeklyKbm += savedDefs.filter(
        (d) =>
          d.activityType === 'KBM' &&
          (!d.applicableDays || d.applicableDays.length === 0 || d.applicableDays.includes(day)),
      ).length;
    }
    return {
      activeClassesCount,
      activeTeachersCount,
      activeEntriesCount,
      savedWeeklyKbm,
      weeklyDelta: liveStats.weeklyKbm - savedWeeklyKbm,
    };
  }, [state.classes, state.teachers, state.draft, state.activeSchedule, state.settings, liveStats.weeklyKbm]);

  const previewDaySlots = useMemo(() => {
    return definitions.filter(
      (d) =>
        !d.applicableDays || d.applicableDays.length === 0 || d.applicableDays.includes(previewDay),
    );
  }, [definitions, previewDay]);

  const previewDayTotalMinutes = useMemo(() => {
    return Math.max(
      1,
      previewDaySlots.reduce(
        (sum, s) => sum + Math.max(5, clockToMinutes(s.end) - clockToMinutes(s.start)),
        0,
      ),
    );
  }, [previewDaySlots]);

  let runningRowKbm = 0;

  return (
    <div className="s5-settings-screen">
      {/* A. Sovereign Atelier Luxury Header (Refined Porcelain & Champagne Gold) */}
      <header ref={headerRef} className="s5-settings-lux-header">
        <svg className="s5-settings-lux-ornament" viewBox="0 0 180 180" fill="none" aria-hidden="true">
          <g stroke="currentColor" strokeWidth="1.1">
            <rect x="42" y="42" width="96" height="96" rx="6" />
            <rect x="42" y="42" width="96" height="96" rx="6" transform="rotate(45 90 90)" />
            <circle cx="90" cy="90" r="34" />
            <circle cx="90" cy="90" r="62" strokeDasharray="3 4" />
          </g>
        </svg>

        <div className="s5-settings-lux-copy">
          <h2 className="s5-settings-title">Pengaturan Workspace</h2>
          <p className="s5-settings-subtitle s5-tnum">
            <span>{schoolName || 'Madrasah'}</span>
            <span aria-hidden="true">·</span>
            <span>T.A. {academicYear}</span>
            <span aria-hidden="true">·</span>
            <span>Semester {semester}</span>
          </p>
        </div>

        <div className="s5-settings-header-actions">
          <span className={`s5-sync-state ${isDirty ? 'is-dirty' : ''}`}>
            {isDirty ? 'Perubahan belum disimpan' : saved ? 'Tersimpan' : 'Tersinkronisasi'}
          </span>

          {isDirty && (
            <button
              type="button"
              className="button button-quiet"
              onClick={handleDiscardChanges}
              data-s5-tooltip="Batalkan perubahan terakhir"
            >
              <RotateCcw size={14} />
              <span>Kembalikan</span>
            </button>
          )}

          <button
            type="button"
            className="button button-primary s5-lux-save-btn"
            onClick={handleSave}
          >
            <Save size={14} />
            <span>Simpan Pengaturan</span>
          </button>
        </div>
      </header>

      {/* B. Sovereign Segmented Tabs + Quiet Live Readout */}
      <div className="s5-settings-nav-bar">
        <div className="s5-segmented-nav" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`s5-segmented-btn ${activeTab === 'time' ? 'active' : ''}`}
            onClick={() => setActiveTab('time')}
          >
            <Clock size={14} />
            <span>Hari &amp; Jam Kegiatan</span>
          </button>
          <button
            type="button"
            className={`s5-segmented-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <Building2 size={14} />
            <span>Identitas &amp; Kop Surat</span>
          </button>
          <button
            type="button"
            className={`s5-segmented-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Sparkles size={14} />
            <span>AI &amp; Sistem</span>
          </button>
        </div>

        <div className="s5-settings-live-strip s5-tnum">
          <span>{activeDays.length} Hari Aktif</span>
          <span aria-hidden="true">·</span>
          <span>{liveStats.weeklyKbm} JP/Pekan</span>
          <span aria-hidden="true">·</span>
          <span>{safeMinutes} Menit/JP</span>
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: HARI & JAM KEGIATAN                                          */}
      {/* =================================================================== */}
      {activeTab === 'time' && (
        <div className="s5-settings-layout s5-settings-tab-body">
          <div className="s5-settings-main">
            {/* 1. Hari KBM Aktif */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest">
                    <CalendarDays size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Hari KBM Aktif</h3>
                    <p className="s5-calm-panel-desc s5-tnum">
                      {activeDays.length} hari efektif belajar per pekan
                    </p>
                  </div>
                </div>

                <div className="s5-inline-segment">
                  <button
                    type="button"
                    className={`s5-seg-btn ${activeDays.length === 5 && !activeDays.includes('Sabtu') ? 'is-active' : ''}`}
                    onClick={() => handleApplyDayPreset('5days')}
                  >
                    5 Hari (Sen–Jum)
                  </button>
                  <button
                    type="button"
                    className={`s5-seg-btn ${activeDays.length === 6 ? 'is-active' : ''}`}
                    onClick={() => handleApplyDayPreset('6days')}
                  >
                    6 Hari (Sen–Sab)
                  </button>
                </div>
              </div>

              <div className="s5-day-row">
                {DAYS.map((day) => {
                  const selected = activeDays.includes(day);
                  return (
                    <label
                      key={day}
                      className={`s5-day-tile ${selected ? 'is-selected' : ''}`}
                      data-s5-tooltip={selected ? `Nonaktifkan ${day}` : `Aktifkan ${day}`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => handleToggleDay(day)}
                      />
                      <span>{day}</span>
                      <span className={`s5-day-jewel ${selected ? 'is-selected' : ''}`}>
                        {selected ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* 1B. Aturan Beban Mengajar Maksimal (JP/Minggu) */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest">
                    <Users size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Aturan Batas Beban Mengajar (JP/Minggu)</h3>
                    <p className="s5-calm-panel-desc s5-tnum">
                      Batas acuan guru baru, validasi konflik, dan filter beban (standar Kemenag 24 JP, dapat diisi manual 1–80 JP)
                    </p>
                  </div>
                </div>
              </div>

              <div className="s5-duration-bar" style={{ marginBottom: 0 }}>
                <div className="s5-duration-bar-left">
                  <span className="s5-duration-label">Batas Maksimal / Pekan</span>
                  <div className="s5-minute-stepper">
                    <button
                      type="button"
                      className="s5-stepper-btn"
                      onClick={() => setMaxWeeklyJP(String(Math.max(1, safeMaxWeeklyJP - 1)))}
                      aria-label="Kurangi 1 JP"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min="1"
                      max="80"
                      value={maxWeeklyJP}
                      onChange={(e) => setMaxWeeklyJP(e.target.value)}
                      onBlur={() => {
                        const parsed = Math.round(Number(maxWeeklyJP));
                        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 80) {
                          setMaxWeeklyJP(String(state.settings.maxWeeklyJP ?? 24));
                          onNotify('Batas beban JP harus antara 1 sampai 80 JP/minggu.', 'warning');
                        } else {
                          setMaxWeeklyJP(String(parsed));
                        }
                      }}
                      className="s5-tnum"
                      aria-label="Batas maksimal JP per minggu"
                    />
                    <span className="s5-minute-unit">JP</span>
                    <button
                      type="button"
                      className="s5-stepper-btn"
                      onClick={() => setMaxWeeklyJP(String(Math.min(80, safeMaxWeeklyJP + 1)))}
                      aria-label="Tambah 1 JP"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="s5-inline-segment">
                    {[18, 24, 30, 36].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`s5-seg-btn ${Number(maxWeeklyJP) === preset ? 'is-active' : ''}`}
                        onClick={() => setMaxWeeklyJP(String(preset))}
                      >
                        {preset} JP{preset === 24 ? ' Standar' : ''}
                      </button>
                    ))}
                  </div>
                </div>

                {onApplyWeeklyLimitToAllTeachers && (
                  <div className="s5-duration-bar-right">
                    <button
                      type="button"
                      className="s5-apply-kbm-btn s5-tnum"
                      onClick={() => {
                        const parsed = Math.round(Number(maxWeeklyJP));
                        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 80) {
                          onNotify('Masukkan angka batas JP valid antara 1 sampai 80 sebelum menerapkan.', 'warning');
                          return;
                        }
                        setMaxWeeklyJP(String(parsed));
                        onApplyWeeklyLimitToAllTeachers(parsed);
                      }}
                      data-s5-tooltip="Simpan standar batas JP ini dan perbarui batas seluruh guru aktif sekaligus"
                    >
                      <Check size={12} strokeWidth={2.6} />
                      <span>Terapkan {safeMaxWeeklyJP} JP ke Semua Guru</span>
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* 2. Durasi & Susunan Jam Kegiatan */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest gold">
                    <Clock3 size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Durasi &amp; Susunan Jam Kegiatan</h3>
                    <p className="s5-calm-panel-desc s5-tnum">
                      {liveStats.kbmCount} JP KBM · {liveStats.nonKbmCount} Non-KBM · Rentang {liveStats.dailySpan}
                    </p>
                  </div>
                </div>

                <div className="s5-calm-actions">
                  <div className="s5-inline-segment" data-s5-tooltip="Muat susunan jam standar">
                    <button
                      type="button"
                      className="s5-seg-btn"
                      onClick={handleLoadStandardTemplate}
                    >
                      Template 8 JP
                    </button>
                    <button
                      type="button"
                      className="s5-seg-btn"
                      onClick={handleLoadFullDayTemplate}
                    >
                      Full Day
                    </button>
                  </div>

                  <div className="s5-dropdown-wrap" ref={nonKbmMenuRef}>
                    <button
                      type="button"
                      className="button button-sm button-secondary"
                      onClick={() => setNonKbmMenuOpen((v) => !v)}
                    >
                      <Plus size={14} />
                      <span>Non-KBM</span>
                      <ChevronDown size={13} />
                    </button>

                    {nonKbmMenuOpen && (
                      <div className="s5-dropdown-menu" role="menu">
                        {NON_KBM_OPTIONS.map((item) => {
                          const meta = CATEGORY_META[item.type];
                          return (
                            <button
                              key={item.type}
                              type="button"
                              role="menuitem"
                              className="s5-dropdown-item"
                              onClick={() =>
                                handleAddSlot(item.type, item.defaultMins, item.defaultName)
                              }
                            >
                              <span
                                className="s5-legend-dot"
                                style={{ backgroundColor: meta.dotColor }}
                                aria-hidden="true"
                              />
                              <span>{item.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="button button-sm button-primary"
                    onClick={() => handleAddSlot('KBM')}
                  >
                    <Plus size={14} />
                    <span>Jam KBM</span>
                  </button>
                </div>
              </div>

              {/* Precision Duration Ribbon + Auto-geser + Single Sinkronkan Jam */}
              <div className="s5-duration-bar">
                <div className="s5-duration-bar-left">
                  <span className="s5-duration-label">Durasi Standar 1 JP</span>
                  <div className="s5-minute-stepper">
                    <button
                      type="button"
                      className="s5-stepper-btn"
                      onClick={() => handleStepPeriodMinutes(-5)}
                      aria-label="Kurangi 5 menit"
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      type="number"
                      min="20"
                      max="90"
                      value={periodMinutes}
                      onChange={(e) => setPeriodMinutes(e.target.value)}
                      onBlur={() => commitTypedPeriodMinutes(true)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="s5-tnum"
                      aria-label="Durasi standar per JP dalam menit"
                    />
                    <span className="s5-minute-unit">mnt</span>
                    <button
                      type="button"
                      className="s5-stepper-btn"
                      onClick={() => handleStepPeriodMinutes(5)}
                      aria-label="Tambah 5 menit"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="s5-inline-segment">
                    <button
                      type="button"
                      className={`s5-seg-btn ${Number(periodMinutes) === 35 ? 'is-active' : ''}`}
                      onClick={() => handleQuickDurationPreset(35)}
                    >
                      35m MI
                    </button>
                    <button
                      type="button"
                      className={`s5-seg-btn ${Number(periodMinutes) === 40 ? 'is-active' : ''}`}
                      onClick={() => handleQuickDurationPreset(40)}
                    >
                      40m MTs
                    </button>
                    <button
                      type="button"
                      className={`s5-seg-btn ${Number(periodMinutes) === 45 ? 'is-active' : ''}`}
                      onClick={() => handleQuickDurationPreset(45)}
                    >
                      45m MA
                    </button>
                  </div>

                  {needsMinutesApply && (
                    <button
                      type="button"
                      className="s5-apply-kbm-btn s5-tnum"
                      onClick={() => commitTypedPeriodMinutes(true)}
                    >
                      <Check size={12} strokeWidth={2.6} />
                      <span>Terapkan {typedMinutes}m ke semua KBM</span>
                    </button>
                  )}
                </div>

                <div className="s5-duration-bar-right">
                  <button
                    type="button"
                    className={`s5-auto-cascade-btn ${autoCascade ? 'is-on' : ''}`}
                    onClick={() => {
                      const next = !autoCascade;
                      setAutoCascade(next);
                      onNotify(
                        next
                          ? 'Mode Auto-geser aktif: baris di bawahnya otomatis menyesuaikan jam.'
                          : 'Mode Auto-geser nonaktif: jam tiap baris dapat diatur bebas.',
                        'info',
                      );
                    }}
                    aria-pressed={autoCascade}
                    data-s5-tooltip="Otomatis geser jam baris setelahnya saat Anda mengubah durasi atau urutan"
                  >
                    <WandSparkles size={13} />
                    <span>Auto-geser: {autoCascade ? 'Aktif' : 'Manual'}</span>
                  </button>

                  <button
                    type="button"
                    className="s5-ghost-action"
                    onClick={() => handleCascadeSequentialTimes()}
                    data-s5-tooltip="Urutkan seluruh jam mulai dan selesai secara berurutan tanpa celah"
                  >
                    <RefreshCw size={13} />
                    <span>Sinkronkan Jam</span>
                  </button>
                </div>
              </div>

              {/* Luxury Slots Table */}
              <div className="s5-calm-table-wrap" ref={tableWrapRef}>
                <table className="data-table s5-calm-table s5-slots-table">
                  <thead>
                    <tr>
                      <th style={{ width: '112px' }}>Urutan</th>
                      <th style={{ width: '104px' }}>Mulai</th>
                      <th style={{ width: '82px', textAlign: 'center' }}>Durasi</th>
                      <th style={{ width: '100px' }}>Selesai</th>
                      <th style={{ width: '195px' }}>Kategori</th>
                      <th style={{ width: '140px' }}>Hari Berlaku</th>
                      <th>Keterangan</th>
                      <th style={{ width: '74px', textAlign: 'center' }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {definitions.map((def, idx) => {
                      const startMins = clockToMinutes(def.start);
                      const endMins = clockToMinutes(def.end);
                      const currentDur = Math.max(0, endMins - startMins);
                      const isKbm = def.activityType === 'KBM';
                      if (isKbm) runningRowKbm += 1;
                      const cat = CATEGORY_META[def.activityType];
                      const diag = slotDiagnostics.byIndex[idx];
                      const isDragging = dragIdx === idx;
                      const isDropTarget = dragOverIdx === idx && dragIdx !== null && dragIdx !== idx;

                      return (
                        <tr
                          key={`${idx}-${def.order}`}
                          draggable={insertMenuState === null}
                          onDragStart={(e) => {
                            const tag = (e.target as HTMLElement | null)?.tagName;
                            if (tag && ['INPUT', 'SELECT', 'BUTTON'].includes(tag)) {
                              e.preventDefault();
                              return;
                            }
                            setDragIdx(idx);
                            e.dataTransfer.effectAllowed = 'move';
                            e.dataTransfer.setData('text/plain', String(idx));
                          }}
                          onDragOver={(e) => {
                            if (dragIdx === null) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            if (dragOverIdx !== idx) {
                              setDragOverIdx(idx);
                            }
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (dragIdx !== null && dragIdx !== idx) {
                              handleDropReorder(dragIdx, idx);
                            }
                            setDragIdx(null);
                            setDragOverIdx(null);
                          }}
                          onDragEnd={() => {
                            setDragIdx(null);
                            setDragOverIdx(null);
                          }}
                          className={[
                            !isKbm ? 'is-nonkbm' : '',
                            diag?.kind === 'overlap' || diag?.kind === 'invalid' ? 'is-overlap-row' : '',
                            diag?.kind === 'gap' ? 'is-gap-row' : '',
                            isDragging ? 'is-dragging-row' : '',
                            isDropTarget ? 'is-drop-target-row' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td>
                            <div className="s5-slot-order-cell">
                              <span
                                className="s5-drag-grip"
                                title="Seret baris untuk mengubah urutan"
                                aria-hidden="true"
                              >
                                <GripVertical size={13} />
                              </span>

                              <div className="s5-slot-order-stack">
                                <span className="s5-tnum s5-slot-num">{def.order}</span>
                                <span
                                  className={`s5-slot-role-tag s5-tnum ${
                                    isKbm ? 'is-kbm' : 'is-nonkbm'
                                  }`}
                                >
                                  {isKbm ? `JP ${runningRowKbm}` : 'Non-KBM'}
                                </span>
                              </div>

                              <div className="s5-order-arrows">
                                <button
                                  type="button"
                                  className="s5-order-btn"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveSlot(idx, 'up')}
                                  aria-label="Naikkan urutan"
                                >
                                  <ChevronUp size={11} />
                                </button>
                                <button
                                  type="button"
                                  className="s5-order-btn"
                                  disabled={idx === definitions.length - 1}
                                  onClick={() => handleMoveSlot(idx, 'down')}
                                  aria-label="Turunkan urutan"
                                >
                                  <ChevronDown size={11} />
                                </button>
                              </div>
                            </div>
                          </td>

                          <td>
                            <input
                              type="time"
                              value={def.start}
                              onChange={(e) => handleStartTimeChange(idx, e.target.value)}
                              className="s5-table-input s5-tnum"
                              aria-label={`Jam mulai slot ${def.order}`}
                            />
                            {diag && (
                              <div className={`s5-row-diag is-${diag.kind} s5-tnum`}>
                                <AlertTriangle size={11} aria-hidden="true" />
                                <span>{diag.label}</span>
                                <button
                                  type="button"
                                  className="s5-diag-fix-btn"
                                  onClick={() => handleFixRowAt(idx)}
                                >
                                  Rapikan
                                </button>
                              </div>
                            )}
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <div className="s5-dur-cell">
                              <input
                                type="number"
                                min="5"
                                max="180"
                                step="5"
                                value={currentDur || ''}
                                onChange={(e) => handleDurationChange(idx, Number(e.target.value))}
                                className="s5-table-dur-input s5-tnum"
                                aria-label={`Durasi slot ${def.order} dalam menit`}
                              />
                              <span className="s5-dur-unit">m</span>
                            </div>
                          </td>

                          <td>
                            <input
                              type="time"
                              value={def.end}
                              onChange={(e) => handleEndTimeChange(idx, e.target.value)}
                              className="s5-table-input s5-tnum"
                              aria-label={`Jam selesai slot ${def.order}`}
                            />
                          </td>

                          <td>
                            <div className="s5-cat-select-wrap">
                              <span
                                className="s5-cat-dot"
                                style={{ backgroundColor: cat.dotColor }}
                                aria-hidden="true"
                              />
                              <select
                                value={def.activityType}
                                onChange={(e) => {
                                  const newType = e.target.value as ActivityType;
                                  const changes: Partial<PeriodDefinition> = {
                                    activityType: newType,
                                  };
                                  if (
                                    newType === 'ISTIRAHAT' &&
                                    (!def.activityName || def.activityName === 'Jam Pelajaran KBM')
                                  ) {
                                    changes.activityName = 'Istirahat';
                                  } else if (newType === 'UPACARA') {
                                    changes.activityName = 'Upacara Bendera';
                                    changes.applicableDays = ['Senin'];
                                  } else if (
                                    newType === 'RELIGI' &&
                                    (!def.activityName || def.activityName === 'Jam Pelajaran KBM')
                                  ) {
                                    changes.activityName = 'Sholat Dhuha / Tadarus';
                                  } else if (newType === 'KBM' && def.activityName === 'Istirahat') {
                                    changes.activityName = '';
                                  }
                                  handleUpdateDef(idx, changes, false);
                                }}
                                className="s5-table-select"
                                style={{ color: cat.text }}
                              >
                                <option value="KBM">Belajar Mengajar (KBM)</option>
                                <option value="UPACARA">Upacara Bendera</option>
                                <option value="ISTIRAHAT">Istirahat</option>
                                <option value="RELIGI">Religi / Dhuha</option>
                                <option value="LAINNYA">Kegiatan Lain</option>
                              </select>
                            </div>
                          </td>

                          <td>
                            <select
                              value={
                                !def.applicableDays || def.applicableDays.length === 0
                                  ? 'ALL'
                                  : def.applicableDays.length === 1 &&
                                    def.applicableDays[0] === 'Senin'
                                  ? 'SENIN'
                                  : def.applicableDays.length === 1 &&
                                    def.applicableDays[0] === 'Jumat'
                                  ? 'JUMAT'
                                  : def.applicableDays.length === 1 &&
                                    def.applicableDays[0] === 'Sabtu'
                                  ? 'SABTU'
                                  : def.applicableDays.length === 4 &&
                                    def.applicableDays.includes('Senin') &&
                                    def.applicableDays.includes('Kamis')
                                  ? 'SENIN_KAMIS'
                                  : 'ALL'
                              }
                              onChange={(e) => {
                                const val = e.target.value;
                                let days: Day[] | undefined = undefined;
                                if (val === 'SENIN') days = ['Senin'];
                                else if (val === 'JUMAT') days = ['Jumat'];
                                else if (val === 'SABTU') days = ['Sabtu'];
                                else if (val === 'SENIN_KAMIS')
                                  days = ['Senin', 'Selasa', 'Rabu', 'Kamis'];
                                handleUpdateDef(idx, { applicableDays: days }, false);
                              }}
                              className="s5-table-select"
                            >
                              <option value="ALL">Semua Hari Aktif</option>
                              <option value="SENIN">Hanya Senin</option>
                              <option value="JUMAT">Hanya Jumat</option>
                              <option value="SENIN_KAMIS">Senin — Kamis</option>
                              <option value="SABTU">Hanya Sabtu</option>
                            </select>
                          </td>

                          <td>
                            <input
                              type="text"
                              placeholder={
                                def.activityType === 'KBM'
                                  ? 'Jam Pelajaran KBM'
                                  : def.activityType === 'UPACARA'
                                  ? 'Upacara Bendera'
                                  : def.activityType === 'ISTIRAHAT'
                                  ? 'Istirahat'
                                  : def.activityType === 'RELIGI'
                                  ? 'Sholat Dhuha / Tadarus'
                                  : 'Nama kegiatan...'
                              }
                              value={def.activityName || ''}
                              onChange={(e) =>
                                handleUpdateDef(idx, { activityName: e.target.value }, false)
                              }
                              className="s5-calm-note-input"
                            />
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <div className="s5-row-actions-group">
                              <div className="s5-row-insert-wrap">
                                <button
                                  type="button"
                                  className={`s5-slot-insert-btn ${insertMenuState?.idx === idx ? 'is-open' : ''}`}
                                  onClick={(e) => {
                                    if (insertMenuState?.idx === idx) {
                                      setInsertMenuState(null);
                                      return;
                                    }
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const openUp = rect.bottom + 240 > window.innerHeight;
                                    setInsertMenuState({
                                      idx,
                                      top: openUp ? rect.top - 6 : rect.bottom + 6,
                                      left: Math.max(12, rect.right - 220),
                                      openUp,
                                    });
                                  }}
                                  aria-label={`Sisipkan baris di bawah slot ${def.order}`}
                                  data-s5-tooltip="Sisipkan di bawah"
                                >
                                  <Plus size={14} />
                                </button>
                              </div>

                              <button
                                type="button"
                                className="s5-slot-delete-btn"
                                onClick={() => handleDeleteSlot(idx)}
                                disabled={definitions.length <= 1}
                                aria-label={`Hapus slot ${def.order}`}
                                data-s5-tooltip="Hapus slot ini"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Subtle Composition Meter Bar */}
              <div className="s5-lux-composition-strip">
                <div className="s5-footbar-composition" aria-hidden="true">
                  <div
                    className="s5-footbar-seg hadir"
                    style={{ width: `${liveStats.kbmSharePct}%` }}
                  />
                  <div
                    className="s5-footbar-seg permit"
                    style={{ width: `${100 - liveStats.kbmSharePct}%` }}
                  />
                </div>
                <div className="s5-lux-composition-meta s5-tnum">
                  <span>
                    Porsi belajar efektif <strong>{liveStats.kbmSharePct}%</strong> ({liveStats.totalKbmMinsPerDay} mnt KBM · {liveStats.totalNonKbmMinsPerDay} mnt jeda)
                  </span>
                </div>
              </div>
            </section>

            {/* 3. Pratinjau Jadwal Harian */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest">
                    <Layers size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Pratinjau Jadwal Harian</h3>
                    <p className="s5-calm-panel-desc s5-tnum">
                      {activeDays.includes(previewDay)
                        ? `${previewDaySlots.filter((d) => d.activityType === 'KBM').length} JP KBM · ${previewDaySlots[0]?.start ?? '07:00'}–${previewDaySlots[previewDaySlots.length - 1]?.end ?? '13:00'}`
                        : `Hari ${previewDay} diliburkan`}
                    </p>
                  </div>
                </div>

                <div className="s5-inline-segment">
                  {DAYS.map((day) => {
                    const isActive = activeDays.includes(day);
                    const isSelected = previewDay === day;
                    return (
                      <button
                        key={day}
                        type="button"
                        className={`s5-seg-btn ${isSelected ? 'is-active' : ''}`}
                        onClick={() => setPreviewDay(day)}
                        style={!isActive && !isSelected ? { opacity: 0.5 } : undefined}
                      >
                        {day.slice(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {!activeDays.includes(previewDay) ? (
                <div className="s5-calm-empty">
                  Hari {previewDay} tidak diaktifkan untuk KBM. Aktifkan di panel Hari KBM Aktif bila dibutuhkan.
                </div>
              ) : (
                (() => {
                  let runningJp = 0;
                  return (
                    <div>
                      <div className="s5-timeline-spectrum" aria-label="Proporsi waktu harian">
                        {previewDaySlots.map((slot, sIdx) => {
                          const dur = Math.max(
                            5,
                            clockToMinutes(slot.end) - clockToMinutes(slot.start),
                          );
                          const widthPct = (dur / previewDayTotalMinutes) * 100;
                          const cat = CATEGORY_META[slot.activityType];
                          return (
                            <div
                              key={sIdx}
                              className="s5-spectrum-segment"
                              style={{
                                width: `${widthPct}%`,
                                backgroundColor: cat.dotColor,
                                opacity: slot.activityType === 'KBM' ? 0.92 : 0.65,
                              }}
                              data-s5-tooltip={`${slot.start}–${slot.end} · ${
                                slot.activityType === 'KBM'
                                  ? 'KBM'
                                  : slot.activityName || cat.shortLabel
                              } (${dur} mnt)`}
                            />
                          );
                        })}
                      </div>

                      <div className="s5-agenda-list">
                        {previewDaySlots.map((slot, sIdx) => {
                          const isKbm = slot.activityType === 'KBM';
                          if (isKbm) runningJp += 1;
                          const cat = CATEGORY_META[slot.activityType];
                          const dur = Math.max(
                            0,
                            clockToMinutes(slot.end) - clockToMinutes(slot.start),
                          );

                          return (
                            <div key={sIdx} className="s5-agenda-row">
                              <span
                                className="s5-legend-dot"
                                style={{ backgroundColor: cat.dotColor }}
                                aria-hidden="true"
                              />
                              <span className="s5-agenda-time s5-tnum">
                                {slot.start}–{slot.end}
                              </span>
                              <span
                                className="s5-agenda-tag s5-tnum"
                                style={{ color: cat.text }}
                              >
                                {isKbm ? `JP ${runningJp}` : cat.shortLabel}
                              </span>
                              <span className="s5-agenda-name">
                                {isKbm
                                  ? slot.activityName || 'Belajar Mengajar (KBM)'
                                  : slot.activityName || cat.label}
                              </span>
                              <span className="s5-agenda-dur s5-tnum">
                                {!isKbm && <LockKeyhole size={11} aria-hidden="true" />}
                                <span>{dur} mnt</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()
              )}
            </section>
          </div>

          {/* Sticky Right Summary Column (Obsidian-Gold Atelier Card + Impact Info) */}
          <aside className="s5-settings-aside is-sticky">
            <section className="s5-lux-panel s5-lux-summary-card">
              <div className="s5-lux-summary-head">
                <div>
                  <h3 className="s5-calm-panel-title">Ringkasan &amp; Konversi JP</h3>
                  <p className="s5-calm-panel-desc s5-tnum">
                    Standar {safeMinutes} menit ({(safeMinutes / 60).toFixed(2)} jam/JP)
                  </p>
                </div>
                <div className="s5-panel-crest gold">
                  <Clock size={15} />
                </div>
              </div>

              <div className="s5-clean-kv s5-tnum">
                <div className="s5-clean-kv-row">
                  <span>Jam KBM / hari</span>
                  <strong>{liveStats.kbmCount} JP ({liveStats.totalKbmMinsPerDay} mnt)</strong>
                </div>
                <div className="s5-clean-kv-row">
                  <span>Sesi Non-KBM / hari</span>
                  <strong>{liveStats.nonKbmCount} sesi ({liveStats.totalNonKbmMinsPerDay} mnt)</strong>
                </div>
                <div className="s5-clean-kv-row">
                  <span>Hari aktif</span>
                  <strong>{activeDays.length} Hari</strong>
                </div>
                <div className="s5-clean-kv-row">
                  <span>Jam operasional</span>
                  <strong>{liveStats.dailySpan}</strong>
                </div>
                <div className="s5-clean-kv-row">
                  <span>Batas beban guru / pekan</span>
                  <strong>Maks. {safeMaxWeeklyJP} JP</strong>
                </div>
              </div>

              <div className="s5-lux-total-inset s5-tnum">
                <span>Kapasitas kelas / pekan</span>
                <strong>
                  {liveStats.weeklyKbm} JP · {liveStats.weeklyAstroHours} Jam
                </strong>
              </div>

              {/* Impact Info Box (Replaces duplicate Sinkronkan Jam button) */}
              <div className="s5-impact-box">
                <div className="s5-impact-head">
                  <Users size={14} color="#124037" />
                  <span>Dampak Struktur Jam</span>
                </div>
                <p className="s5-impact-copy s5-tnum">
                  Berlaku langsung untuk <strong>{impactStats.activeClassesCount} kelas aktif</strong>,{' '}
                  <strong>{impactStats.activeTeachersCount} guru pengampu</strong>, dan{' '}
                  <strong>{impactStats.activeEntriesCount} sesi terjadwal</strong>.
                </p>

                {slotDiagnostics.overlapCount > 0 && (
                  <div className="s5-impact-alert is-danger s5-tnum">
                    <AlertTriangle size={13} />
                    <span>
                      {slotDiagnostics.overlapCount} baris memiliki tabrakan waktu — klik Rapikan atau Sinkronkan Jam.
                    </span>
                  </div>
                )}

                {slotDiagnostics.overlapCount === 0 && slotDiagnostics.gapCount > 0 && (
                  <div className="s5-impact-alert is-warn s5-tnum">
                    <AlertTriangle size={13} />
                    <span>{slotDiagnostics.gapCount} celah waktu ditemukan antar slot jam.</span>
                  </div>
                )}

                {impactStats.weeklyDelta !== 0 && (
                  <div className="s5-impact-alert is-info s5-tnum">
                    <span>
                      Kapasitas mingguan berubah{' '}
                      <strong>
                        {impactStats.savedWeeklyKbm} → {liveStats.weeklyKbm} JP
                      </strong>{' '}
                      ({impactStats.weeklyDelta > 0 ? `+${impactStats.weeklyDelta}` : impactStats.weeklyDelta} JP/kelas).
                    </span>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: IDENTITAS & KOP SURAT                                        */}
      {/* =================================================================== */}
      {activeTab === 'general' && (
        <div className="s5-settings-layout s5-settings-tab-body">
          <div className="s5-settings-main">
            {/* 1. Identitas & Legalitas Madrasah */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest">
                    <Building2 size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Identitas &amp; Legalitas Kop Surat</h3>
                    <p className="s5-calm-panel-desc">Terintegrasi otomatis ke seluruh dokumen PDF, Jadwal, Presensi, dan Persuratan.</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="button button-quiet"
                  onClick={handleApplyOfficialTemplate}
                  title="Kembalikan seluruh baris identitas ke Kop Resmi MTs Daruttafsir Al-Husaini"
                  style={{ fontSize: '12px', gap: '5px' }}
                >
                  <RotateCcw size={13} />
                  <span>Reset Kop Resmi</span>
                </button>
              </div>

              <div className="s5-settings-form-grid">
                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-school">Nama Satuan Pendidikan / Madrasah</label>
                  <input
                    id="id-school"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.schoolName}
                  />
                </div>

                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-ministry">Yayasan / Lembaga yang Menaungi</label>
                  <input
                    id="id-ministry"
                    value={ministry}
                    onChange={(e) => setMinistry(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.ministry}
                  />
                </div>

                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-regional">Akte Notaris / SK Pendirian</label>
                  <input
                    id="id-regional"
                    value={regionalOffice}
                    onChange={(e) => setRegionalOffice(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.regionalOffice}
                  />
                </div>

                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-decree">Keputusan Menkumham / SK Legalitas</label>
                  <input
                    id="id-decree"
                    value={legalDecree}
                    onChange={(e) => setLegalDecree(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.legalDecree}
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-nsm">Nomor Statistik Madrasah (NSM)</label>
                  <input
                    id="id-nsm"
                    className="s5-tnum"
                    value={nsm}
                    onChange={(e) => setNsm(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.nsm}
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-npsn">NPSN</label>
                  <input
                    id="id-npsn"
                    className="s5-tnum"
                    value={npsn}
                    onChange={(e) => setNpsn(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.npsn}
                  />
                </div>

                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-accreditation">Status Akreditasi</label>
                  <input
                    id="id-accreditation"
                    value={accreditation}
                    onChange={(e) => setAccreditation(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.accreditation}
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-year">Tahun Ajaran</label>
                  <input
                    id="id-year"
                    className="s5-tnum"
                    value={academicYear}
                    onChange={(e) => setAcademicYear(e.target.value)}
                    placeholder="2026/2027"
                  />
                </div>

                <div className="s5-form-field">
                  <label>Semester Aktif</label>
                  <div className="s5-inline-segment s5-semester-seg">
                    <button
                      type="button"
                      className={`s5-seg-btn ${semester === 'Ganjil' ? 'is-active' : ''}`}
                      onClick={() => setSemester('Ganjil')}
                    >
                      Ganjil
                    </button>
                    <button
                      type="button"
                      className={`s5-seg-btn ${semester === 'Genap' ? 'is-active' : ''}`}
                      onClick={() => setSemester('Genap')}
                    >
                      Genap
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 2. Domisili & Kontak */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest gold">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Domisili &amp; Kontak</h3>
                    <p className="s5-calm-panel-desc">Ditampilkan pada pita alamat kop surat dan titimangsa kota pengesahan.</p>
                  </div>
                </div>
              </div>

              <div className="s5-settings-form-grid">
                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-address">Alamat Lengkap</label>
                  <input
                    id="id-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.address}
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-city">Kota / Kabupaten (Titimangsa)</label>
                  <input
                    id="id-city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.city}
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-postal">Kode Pos (Opsional)</label>
                  <input
                    id="id-postal"
                    className="s5-tnum"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="16518"
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-phone">Telepon</label>
                  <input
                    id="id-phone"
                    className="s5-tnum"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={DEFAULT_MADRASAH_IDENTITY.phone}
                  />
                </div>

                <div className="s5-form-field">
                  <label htmlFor="id-email">Email Madrasah (Opsional)</label>
                  <input
                    id="id-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="mts.daruttafsir@sch.id"
                  />
                </div>

                <div className="s5-form-field s5-span-2">
                  <label htmlFor="id-website">Website / Portal (Opsional)</label>
                  <input
                    id="id-website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="www.mtsdaruttafsir.sch.id"
                  />
                </div>
              </div>
            </section>

            {/* 3. Pejabat Pengesah Dokumen Resmi */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Pejabat Pengesah Dokumen Resmi</h3>
                    <p className="s5-calm-panel-desc">Blok tanda tangan pengesahan pada cetak PDF jadwal &amp; presensi.</p>
                  </div>
                </div>
              </div>

              <div className="s5-signatory-split">
                <div className="s5-signatory-pane">
                  <div className="s5-signatory-pane-title">
                    <Award size={14} color="#9A6B21" />
                    <span>Pejabat 1 · Kepala Madrasah</span>
                  </div>

                  <div className="s5-form-field">
                    <label htmlFor="sig-hm-title">Jabatan</label>
                    <input
                      id="sig-hm-title"
                      value={headmasterTitle}
                      onChange={(e) => setHeadmasterTitle(e.target.value)}
                      placeholder="Kepala Madrasah"
                    />
                  </div>

                  <div className="s5-form-field">
                    <label htmlFor="sig-hm-name">Nama Lengkap &amp; Gelar</label>
                    <input
                      id="sig-hm-name"
                      value={headmasterName}
                      onChange={(e) => setHeadmasterName(e.target.value)}
                      placeholder="H. Ahmad Fauzi, S.Ag., M.Pd.I."
                    />
                  </div>

                  <div className="s5-form-field">
                    <label htmlFor="sig-hm-nip">NIP / NPK</label>
                    <input
                      id="sig-hm-nip"
                      className="s5-tnum"
                      value={headmasterNip}
                      onChange={(e) => setHeadmasterNip(e.target.value)}
                      placeholder="19750812 200212 1 003"
                    />
                  </div>
                </div>

                <div className="s5-signatory-pane">
                  <div className="s5-signatory-pane-title">
                    <ShieldCheck size={14} color="#124037" />
                    <span>Pejabat 2 · Waka Kurikulum</span>
                  </div>

                  <div className="s5-form-field">
                    <label htmlFor="sig-wk-title">Jabatan</label>
                    <input
                      id="sig-wk-title"
                      value={curriculumLeaderTitle}
                      onChange={(e) => setCurriculumLeaderTitle(e.target.value)}
                      placeholder="Waka Bidang Kurikulum"
                    />
                  </div>

                  <div className="s5-form-field">
                    <label htmlFor="sig-wk-name">Nama Lengkap &amp; Gelar</label>
                    <input
                      id="sig-wk-name"
                      value={curriculumLeaderName}
                      onChange={(e) => setCurriculumLeaderName(e.target.value)}
                      placeholder="Siti Aminah, S.Pd.I., M.Pd."
                    />
                  </div>

                  <div className="s5-form-field">
                    <label htmlFor="sig-wk-nip">NIP / NPK</label>
                    <input
                      id="sig-wk-nip"
                      className="s5-tnum"
                      value={curriculumLeaderNip}
                      onChange={(e) => setCurriculumLeaderNip(e.target.value)}
                      placeholder="19820315 200901 2 008"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* 4. Aturan Penomoran Surat Otomatis Persuratan S05 */}
            <section className="s5-lux-panel">
              <div className="s5-calm-panel-head">
                <div className="s5-panel-title-group">
                  <div className="s5-panel-crest">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="s5-calm-panel-title">Aturan Penomoran Surat Otomatis</h3>
                    <p className="s5-calm-panel-desc">
                      Format nomor urut resmi saat finalisasi dokumen persuratan &amp; SK.
                    </p>
                  </div>
                </div>
              </div>

              <div className="s5-form-grid">
                <div className="s5-form-field">
                  <label htmlFor="num-madrasah-code">Kode Singkatan Madrasah</label>
                  <input
                    id="num-madrasah-code"
                    value={numberingMadrasahCode}
                    onChange={(e) => setNumberingMadrasahCode(e.target.value)}
                    placeholder="MTs.DAH"
                  />
                </div>
                <div className="s5-form-field">
                  <label htmlFor="num-reset-mode">Periode Reset Urutan</label>
                  <select
                    id="num-reset-mode"
                    value={numberingResetMode}
                    onChange={(e) => setNumberingResetMode(e.target.value as NumberingResetMode)}
                  >
                    <option value="YEARLY">Reset per Tahun</option>
                    <option value="MONTHLY">Reset per Bulan</option>
                    <option value="CONTINUOUS">Berlanjut (Tanpa Reset)</option>
                  </select>
                </div>
                <div className="s5-form-field">
                  <label htmlFor="num-seq-padding">Digit Angka Urut</label>
                  <select
                    id="num-seq-padding"
                    value={numberingPadding}
                    onChange={(e) => setNumberingPadding(Number(e.target.value) || 3)}
                  >
                    <option value={2}>2 digit (01)</option>
                    <option value={3}>3 digit (001)</option>
                    <option value={4}>4 digit (0001)</option>
                  </select>
                </div>
                <div className="s5-form-field s5-span-2">
                  <label htmlFor="num-pattern">Pola Format Nomor</label>
                  <input
                    id="num-pattern"
                    className="s5-tnum"
                    value={numberingPattern}
                    onChange={(e) => setNumberingPattern(e.target.value)}
                    placeholder={DEFAULT_NUMBERING_PATTERN}
                  />
                </div>
              </div>
            </section>
          </div>

          {/* Right Sticky Preview Column */}
          <aside className="s5-settings-aside is-sticky">
            <section className="s5-lux-panel">
              <h3 className="s5-calm-panel-title" style={{ marginBottom: '10px' }}>
                Logo &amp; Mode Kop Surat
              </h3>

              <div className="s5-inline-segment" style={{ width: '100%', marginBottom: '12px' }}>
                <button
                  type="button"
                  className={`s5-seg-btn ${kopMode === 'structured' ? 'is-active' : ''}`}
                  onClick={() => setKopMode('structured')}
                  style={{ flex: 1 }}
                >
                  Kop Terstruktur
                </button>
                <button
                  type="button"
                  className={`s5-seg-btn ${kopMode === 'image' ? 'is-active' : ''}`}
                  onClick={() => setKopMode('image')}
                  style={{ flex: 1 }}
                >
                  Gambar Penuh
                </button>
              </div>

              {kopMode === 'structured' ? (
                <>
                  <div className="s5-emblem-row">
                    <div className="s5-emblem-ring">
                      <img src={logoUrl || getDefaultMadrasahLogo()} alt="Logo Madrasah" />
                    </div>
                    <div className="s5-emblem-copy">
                      <strong>
                        {logoUrl ? 'Logo Kustom Aktif' : 'Lambang Resmi MTs Daruttafsir Al-Husaini'}
                      </strong>
                      <span>Teks kop dapat diedit langsung; logo otomatis tampil di semua PDF.</span>
                    </div>
                  </div>

                  <div className="s5-emblem-actions">
                    <label
                      className="button button-secondary"
                      style={{ flex: 1, justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <Upload size={14} />
                      <span>Ganti Logo</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {logoUrl && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={handleResetLogo}
                      >
                        <RotateCcw size={14} />
                        <span>Reset</span>
                      </button>
                    )}
                  </div>

                  {logoError && <div className="s5-emblem-error">{logoError}</div>}
                </>
              ) : (
                <>
                  <div
                    style={{
                      border: '0.75px solid #D5E0DA',
                      borderRadius: '10px',
                      padding: '8px',
                      background: '#FFFFFF',
                      marginBottom: '10px',
                    }}
                  >
                    <img
                      src={kopImageUrl || OFFICIAL_KOP_ASSET_PATH}
                      alt="Banner Kop Surat Resmi"
                      style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '4px' }}
                    />
                  </div>
                  <div className="s5-emblem-actions">
                    <label
                      className="button button-secondary"
                      style={{ flex: 1, justifyContent: 'center', cursor: 'pointer' }}
                    >
                      <Upload size={14} />
                      <span>Unggah Gambar Kop</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleKopBannerUpload}
                        style={{ display: 'none' }}
                      />
                    </label>

                    {kopImageUrl !== OFFICIAL_KOP_ASSET_PATH && (
                      <button
                        type="button"
                        className="button button-quiet"
                        onClick={handleResetKopBanner}
                      >
                        <RotateCcw size={14} />
                        <span>Bawaan</span>
                      </button>
                    )}
                  </div>
                  {kopBannerError && <div className="s5-emblem-error">{kopBannerError}</div>}
                </>
              )}
            </section>

            <section className="s5-lux-panel">
              <LivePreviewViewport
                title="Pratinjau Kop Surat Resmi"
                metaText="A4 · Portrait (210 × 297 mm)"
                paperWidthMm={210}
                paperHeightMm={297}
                compactMaxHeight={380}
                paperStyle={{ padding: '16mm 18mm' }}
                headerActions={<FileText size={15} color="#526861" aria-hidden="true" />}
                ariaLabel="Pratinjau langsung Kop Surat Resmi Madrasah"
              >
                <OfficialKopSuratPreview
                  settings={state.settings}
                  overrides={{
                    schoolName,
                    ministry,
                    regionalOffice,
                    legalDecree,
                    accreditation,
                    nsm,
                    npsn,
                    address,
                    city,
                    postalCode,
                    phone,
                    email,
                    website,
                    logoUrl: logoUrl || undefined,
                    kopMode,
                    kopImageUrl,
                  }}
                  variant="full"
                />

                <div style={{ textAlign: 'center', padding: '14px 0 16px' }}>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0b3435',
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    JADWAL PELAJARAN SEMESTER {semester.toUpperCase()}
                  </div>
                  <div
                    className="s5-tnum"
                    style={{ fontSize: '12px', color: '#435e58', fontWeight: 600, marginTop: '3px' }}
                  >
                    TAHUN AJARAN {academicYear}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: '14px',
                    paddingTop: '12px',
                    borderTop: '1px dashed #d9e2dc',
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px',
                    fontSize: '12px',
                    color: '#435e58',
                    lineHeight: 1.5,
                  }}
                >
                  <div>
                    <div>Mengetahui,</div>
                    <div style={{ fontWeight: 600, color: '#0b3435' }}>
                      {curriculumLeaderTitle || 'Waka Bidang Kurikulum'}
                    </div>
                    <div style={{ height: '32px' }} />
                    <div style={{ fontWeight: 700, textDecoration: 'underline', color: '#0b3435' }}>
                      {curriculumLeaderName || '—'}
                    </div>
                    <div className="s5-tnum">
                      {curriculumLeaderNip && !/^[.\-\s]+$/.test(curriculumLeaderNip)
                        ? `NIP. ${curriculumLeaderNip}`
                        : 'NIP. —'}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div>
                      {city || 'Madrasah'}, {formatDisplayDateId()}
                    </div>
                    <div style={{ fontWeight: 600, color: '#0b3435' }}>
                      {headmasterTitle || 'Kepala Madrasah'}
                    </div>
                    <div style={{ height: '32px' }} />
                    <div style={{ fontWeight: 700, textDecoration: 'underline', color: '#0b3435' }}>
                      {headmasterName || '—'}
                    </div>
                    <div className="s5-tnum">
                      {headmasterNip && !/^[.\-\s]+$/.test(headmasterNip)
                        ? `NIP. ${headmasterNip}`
                        : 'NIP. —'}
                    </div>
                  </div>
                </div>
              </LivePreviewViewport>
            </section>
          </aside>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: AI & SISTEM                                                  */}
      {/* =================================================================== */}
      {activeTab === 'ai' && (
        <div className="s5-settings-layout s5-settings-tab-body">
          <div className="s5-settings-main">
            <section className="s5-lux-panel">
              <div className="s5-ai-clean-row">
                <div className="s5-panel-title-group" style={{ alignItems: 'flex-start' }}>
                  <div className="s5-panel-crest gold" style={{ width: '40px', height: '40px' }}>
                    <Sparkles size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="s5-calm-panel-title">Asisten Penjelasan Konflik Jadwal (Gemini)</h3>
                    <p className="s5-calm-panel-desc" style={{ marginTop: '4px', lineHeight: 1.55 }}>
                      Memberikan ringkasan solusi konflik jadwal secara opsional. Validator deterministik tetap menjadi penentu tunggal saat publikasi jadwal, tanpa API key di sisi browser.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`toggle-switch ${geminiEnabled ? 'is-on' : ''}`}
                  role="switch"
                  aria-checked={geminiEnabled}
                  aria-label="Aktifkan Asisten Gemini AI"
                  onClick={() => setGeminiEnabled(!geminiEnabled)}
                >
                  <span />
                </button>
              </div>
            </section>

            <section className="s5-lux-panel" style={{ marginTop: '14px' }}>
              <div className="s5-calm-panel-head" style={{ marginBottom: '12px' }}>
                <div>
                  <h3 className="s5-calm-panel-title">Batas Langkah Penyusun Jadwal</h3>
                  <p className="s5-calm-panel-desc" style={{ marginTop: '3px' }}>
                    Menentukan kedalaman pencarian kombinasi saat Generator Jadwal otomatis berjalan (rentang aman 1.500 – 100.000 langkah).
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    min={1500}
                    max={100000}
                    step={500}
                    value={searchLimit}
                    onChange={(e) => setSearchLimit(e.target.value)}
                    aria-label="Batas langkah pencarian penyusun jadwal"
                    className="s5-tnum"
                    style={{
                      width: '130px',
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #C5D3CC',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#0B2923',
                      background: '#FFFFFF',
                    }}
                  />
                  <span style={{ fontSize: '12px', color: '#526861', fontWeight: 600 }}>kombinasi</span>
                </div>

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Cepat (15.000)', value: '15000' },
                    { label: 'Standar (65.000)', value: '65000' },
                    { label: 'Mendalam (100.000)', value: '100000' },
                  ].map((preset) => {
                    const isActivePreset = String(Number(searchLimit) || 0) === preset.value;
                    return (
                      <button
                        key={preset.value}
                        type="button"
                        className={`filter-tab-btn ${isActivePreset ? 'active' : ''}`}
                        onClick={() => setSearchLimit(preset.value)}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="s5-system-divider">
              <span>Administrasi Sistem</span>
            </div>

            <section className="s5-calm-reset-box">
              <div>
                <strong>Reset Workspace ke Dataset Demo</strong>
                <span>
                  Mengembalikan seluruh jadwal, data kelas/guru, presensi, dan identitas madrasah di browser ini ke data simulasi awal.
                </span>
              </div>
              <button
                type="button"
                className="button button-sm button-danger"
                onClick={() => setResetModalOpen(true)}
              >
                <RotateCcw size={13} />
                <span>Reset ke Demo</span>
              </button>
            </section>
          </div>
        </div>
      )}

      {/* Slim Haute Joaillerie Floating Save Bar — Only visible when Top Header is scrolled out */}
      {isDirty && !isHeaderVisible && (
        <div className="s5-floating-save-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Save size={15} color="#E5C378" />
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#FFFFFF' }}>
              Ada perubahan yang belum disimpan
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="button button-sm button-quiet"
              style={{ color: 'rgba(255,255,255,0.8)', borderColor: 'rgba(255,255,255,0.2)' }}
              onClick={handleDiscardChanges}
            >
              Kembalikan
            </button>
            <button
              type="button"
              className="button button-sm button-primary"
              onClick={handleSave}
              style={{ background: '#C5A059', color: '#0B2923', borderColor: '#E5C378' }}
            >
              <Save size={13} />
              <span>Simpan Pengaturan</span>
            </button>
          </div>
        </div>
      )}

      {/* In-App Reset Workspace Confirmation Modal */}
      {resetModalOpen && (
        <MotionModalDialog
          ariaLabel="Konfirmasi Reset Workspace"
          onBackdropMouseDown={(e) => {
            if (e.target === e.currentTarget) setResetModalOpen(false);
          }}
        >
            <div className="modal-head">
              <div className="modal-title-icon" style={{ background: '#FBEAE8', color: '#A63A2E' }}>
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2>Reset Workspace ke Demo?</h2>
                <p>Tindakan ini akan mengganti seluruh data lokal browser saat ini.</p>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setResetModalOpen(false)}
                aria-label="Tutup dialog konfirmasi"
              >
                <X size={17} />
              </button>
            </div>

            <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="s5-reset-warning-box">
                <p>Data yang akan dikembalikan ke setelan demo awal:</p>
                <ul>
                  <li>Susunan jam kegiatan, hari KBM aktif, dan identitas kop surat</li>
                  <li>Data master kelas, guru, mata pelajaran, dan alokasi JP</li>
                  <li>Jadwal aktif, draft jadwal, dan catatan presensi guru</li>
                </ul>
              </div>

              <div className="modal-actions" style={{ justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setResetModalOpen(false)}
                >
                  Batal
                </button>
                <button
                  type="button"
                  className="button button-danger"
                  onClick={() => {
                    setResetModalOpen(false);
                    onReset();
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Ya, Reset ke Demo</span>
                </button>
              </div>
            </div>
        </MotionModalDialog>
      )}
      {/* Fixed Viewport Row Insert-Below Menu (never clipped by table scroll) */}
      {insertMenuState && (
        <div
          className={`s5-row-insert-menu ${insertMenuState.openUp ? 'is-up' : ''}`}
          role="menu"
          style={{
            top: `${insertMenuState.top}px`,
            left: `${insertMenuState.left}px`,
          }}
        >
          <div className="s5-row-insert-title">
            Sisipkan di bawah #{definitions[insertMenuState.idx]?.order ?? insertMenuState.idx + 1}
          </div>
          <button
            type="button"
            role="menuitem"
            className="s5-dropdown-item"
            onClick={() => handleInsertBelow(insertMenuState.idx, 'KBM', safeMinutes)}
          >
            <span
              className="s5-legend-dot"
              style={{ backgroundColor: CATEGORY_META.KBM.dotColor }}
              aria-hidden="true"
            />
            <span>Jam KBM ({safeMinutes} mnt)</span>
          </button>
          {NON_KBM_OPTIONS.map((item) => (
            <button
              key={item.type}
              type="button"
              role="menuitem"
              className="s5-dropdown-item"
              onClick={() =>
                handleInsertBelow(
                  insertMenuState.idx,
                  item.type,
                  item.defaultMins,
                  item.defaultName,
                )
              }
            >
              <span
                className="s5-legend-dot"
                style={{ backgroundColor: CATEGORY_META[item.type].dotColor }}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
