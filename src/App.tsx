import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Clock3,
  Copy,
  Download,
  Edit2,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  HardDrive,
  History,
  Home,
  Info,
  LayoutGrid,
  LoaderCircle,
  LockKeyhole,
  Menu,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  ToggleRight,
  Undo2,
  Upload,
  UserCheck,
  Users,
  WandSparkles,
  X,
  XCircle,
  Award,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from 'lucide-react';
import type {
  AppState,
  Day,
  GeneratorStatus,
  Requirement,
  ScheduleEntry,
  ScheduleVersion,
  SchoolClass,
  Subject,
  Teacher,
  ValidationIssue,
} from './domain/types';
import {
  buildTimeSlots,
  getTimelineRows,
  isSlotBlocked,
  teachingPeriodsForDay,
} from './domain/time';
import { createDemoState } from './domain/seed';
import { generateSchedule } from './domain/generator';
import { buildScheduleFingerprint, validateMasterData, validateSchedule } from './domain/validator';
import {
  exportAppState,
  loadAppState,
  parseBackupFileDetailed,
  restoreWorkspaceSafely,
  saveAppState,
  type BackupParseResult,
} from './storage/db';
import { WorkloadDashboard } from './components/WorkloadDashboard';
import { AttendanceScreen } from './components/AttendanceScreen';
import { PersuratanWorkspace } from './components/persuratan/PersuratanWorkspace';
import { SettingsScreen } from './components/SettingsScreen';
import { QuickValidationModal } from './components/QuickValidationModal';
import { SchedulePdfExportModal } from './components/SchedulePdfExportModal';
import { EntityEditModal, type EntityEditTarget } from './components/EntityEditModal';
import { AiConflictHelper } from './components/AiConflictHelper';
import { InfoNotice } from './components/InfoNotice';
import { MadrasahTeacherAvatar, detectTeacherGender } from './components/MadrasahTeacherAvatar';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { TimeMachineDrawer } from './components/TimeMachineDrawer';
import { InspectorSlideDrawer, type InspectorTarget } from './components/InspectorSlideDrawer';
import { TeacherAssignmentDrawer } from './components/TeacherAssignmentDrawer';
import {
  KpiAnimatedNumber,
  KpiMotionCard,
  MotionModalDialog,
  MotionPageTransition,
  MotionPopover,
  MotionStaggerItem,
} from './components/KpiMotion';
import type { PersuratanLaunchRequest } from './domain/persuratan/types';
import {
  buildSkTeachingLaunchPayload,
  getOfficialScheduleBasisStatus,
} from './domain/persuratan/assignments/teacherIntegration';
import { createSnapshot } from './storage/snapshotEngine';
import { COMMON_TEACHER_POSITIONS } from './utils/madrasahLogo';
import { compactSubjectName, compactTeacherName, getPrintableCellColor } from './utils/pdfExport';
import { groupClassesForMasterMatrix } from './utils/matrixGrouping';

type ScreenId =
  | 'overview'
  | 'schedule'
  | 'workload'
  | 'attendance'
  | 'persuratan'
  | 'generator'
  | 'master'
  | 'requirements'
  | 'validation'
  | 'history'
  | 'backup'
  | 'settings';

const DatabaseIcon: LucideIcon = Activity;

interface NavGroup {
  sectionTitle: string;
  items: Array<{ id: ScreenId; label: string; icon: LucideIcon }>;
}

const navGroups: NavGroup[] = [
  {
    sectionTitle: 'OPERASIONAL UTAMA',
    items: [
      { id: 'overview', label: 'Beranda', icon: Home },
      { id: 'schedule', label: 'Jadwal Pelajaran', icon: CalendarDays },
      { id: 'master', label: 'Data Master', icon: DatabaseIcon },
      { id: 'requirements', label: 'Kebutuhan & Alokasi', icon: BookOpen },
      { id: 'generator', label: 'Generator Jadwal', icon: WandSparkles },
      { id: 'validation', label: 'Validasi & Konflik', icon: ShieldCheck },
      { id: 'workload', label: 'Beban Guru', icon: Users },
      { id: 'attendance', label: 'Presensi Guru', icon: UserCheck },
      { id: 'persuratan', label: 'Persuratan & Arsip', icon: Archive },
    ],
  },
  {
    sectionTitle: 'SISTEM & CADANGAN',
    items: [
      { id: 'history', label: 'Riwayat & Backup', icon: History },
      { id: 'settings', label: 'Pengaturan', icon: Settings2 },
    ],
  },
];

type MasterTab = 'classes' | 'teachers' | 'subjects';
type AddType = 'class' | 'teacher' | 'subject' | null;
interface EditSlotContext { classId: string; day: Day; jpNo: number }
interface ToastData { message: string; kind: 'success' | 'warning' | 'error' | 'info' }

const emptyMasterForm = {
  name: '',
  level: 'VII',
  code: '',
  roleTitle: 'Guru Mapel',
  nip: '',
  gender: 'male' as 'male' | 'female',
  maxWeeklyJP: '24',
  selectedSubjectIds: [] as string[],
  color: '#2f7771',
};
const emptyRequirementForm = { classId: '', subjectId: '', teacherId: '', requiredJP: '4' };

function titleForScreen(screen: ScreenId) {
  const titles: Record<ScreenId, string> = {
    overview: 'Beranda Kerja Operator',
    schedule: 'Jadwal Pelajaran',
    workload: 'Statistik Beban Guru',
    attendance: 'Presensi Guru',
    persuratan: 'Pusat Persuratan & Arsip',
    generator: 'Schedule Generator',
    master: 'Data Master Madrasah',
    requirements: 'Kebutuhan & Alokasi JP',
    validation: 'Validasi & Kepatuhan Aturan',
    history: 'Riwayat Versi & Cadangan Data',
    backup: 'Ekspor & Cadangan Data',
    settings: 'Pengaturan Workspace',
  };
  return titles[screen] || 'SIGNAL';
}

function formatShortDate(dateString: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(dateString));
}
function getEntry(state: AppState, classId: string, day: Day, jpNo: number) {
  const entries = state.draft ?? state.activeSchedule ?? [];
  return entries.find((entry) => entry.classId === classId && entry.day === day && entry.jpNo === jpNo);
}
function getSubject(state: AppState, id: string) { return state.subjects.find((subject) => subject.id === id); }
function getTeacher(state: AppState, id: string) { return state.teachers.find((teacher) => teacher.id === id); }
function getClass(state: AppState, id: string) { return state.classes.find((schoolClass) => schoolClass.id === id); }

function downloadTextFile(text: string, fileName: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export default function App() {
  const [workspace, setWorkspace] = useState<AppState | null>(null);
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<ScreenId>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [masterTab, setMasterTab] = useState<MasterTab>('classes');
  const [addType, setAddType] = useState<AddType>(null);
  const [masterForm, setMasterForm] = useState(emptyMasterForm);
  const [masterSearch, setMasterSearch] = useState('');
  const [reqFormOpen, setReqFormOpen] = useState(false);
  const [reqForm, setReqForm] = useState(emptyRequirementForm);
  const [editingSlot, setEditingSlot] = useState<EditSlotContext | null>(null);
  const [editingSubject, setEditingSubject] = useState('');
  const [editingTeacher, setEditingTeacher] = useState('');
  const [customTeacherName, setCustomTeacherName] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGeneratorResult, setLastGeneratorResult] = useState<{ status: GeneratorStatus; message: string; nodes: number } | null>(null);
  const [expandedIssue, setExpandedIssue] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [persuratanDirty, setPersuratanDirty] = useState(false);
  const [persuratanDirtySource, setPersuratanDirtySource] = useState<'intake' | 'studio' | null>(null);
  const [pendingNavScreen, setPendingNavScreen] = useState<ScreenId | null>(null);
  const settingsSaveRef = useRef<(() => void) | null>(null);

  // Quick Validation Modal state
  const [quickValidationOpen, setQuickValidationOpen] = useState(false);

  // PDF Export Modal state
  const [pdfExportOpen, setPdfExportOpen] = useState(false);

  // Entity Edit / Create Modal state
  const [entityModalTarget, setEntityModalTarget] = useState<EntityEditTarget | null>(null);

  // Undo last schedule change
  const [lastMoveHistory, setLastMoveHistory] = useState<{ entries: ScheduleEntry[]; description: string } | null>(null);

  // V5 Sovereign States
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTimeMachineOpen, setIsTimeMachineOpen] = useState(false);
  const [inspectorTarget, setInspectorTarget] = useState<InspectorTarget | null>(null);
  const [teacherAssignmentTargetId, setTeacherAssignmentTargetId] = useState<string | null>(null);
  const [persuratanLaunch, setPersuratanLaunch] = useState<PersuratanLaunchRequest | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<{
    fileName: string;
    result: BackupParseResult;
  } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Global Command Palette listener: Ctrl/Cmd+Shift+P everywhere, Ctrl/Cmd+K outside inputs & Document Studio S04
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isShiftP = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p';
      if (isShiftP) {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
        return;
      }

      const tag = target?.tagName;
      const isTextControl =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        Boolean(target?.isContentEditable) ||
        Boolean(target?.closest('[data-doc-editor="true"]'));

      if (isTextControl) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadAppState().then((loaded) => {
      if (!mounted) return;
      setWorkspace(loaded);
      setSelectedClass(loaded.classes.find((item) => item.isActive)?.id ?? '');
      setReqForm((prev) => ({
        ...prev,
        classId: loaded.classes.find((item) => item.isActive)?.id ?? '',
        subjectId: loaded.subjects[0]?.id ?? '',
        teacherId: loaded.teachers[0]?.id ?? '',
      }));
      setReady(true);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!ready || !workspace) return;
    saveAppState(workspace)
      .then(() => {
        setStorageError(null);
      })
      .catch((error) => {
        console.error('Could not persist SIGNAL data:', error);
        const msg =
          'Penyimpanan lokal browser (IndexedDB) gagal atau tidak tersedia. Segera ekspor backup sebelum menutup.';
        setStorageError(msg);
        setToast({ message: 'Penyimpanan lokal tidak tersedia. Segera ekspor backup sebelum menutup.', kind: 'warning' });
      });
  }, [workspace, ready]);

  const notify = useCallback((message: string, kind: ToastData['kind'] = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const retrySaveWorkspace = useCallback(() => {
    if (!workspace) return;
    saveAppState(workspace)
      .then(() => {
        setStorageError(null);
        notify('Penyimpanan lokal berhasil dipulihkan dan disinkronkan.', 'success');
      })
      .catch((error) => {
        console.error('Retry persist SIGNAL data failed:', error);
        setStorageError(
          'Penyimpanan lokal browser (IndexedDB) masih gagal diakses. Segera ekspor backup sebelum menutup.'
        );
        notify('Penyimpanan lokal masih gagal diakses. Segera ekspor backup.', 'warning');
      });
  }, [workspace, notify]);

  const updateWorkspace = useCallback((updater: (current: AppState) => AppState, markCustom = false) => {
    setWorkspace((current) => {
      if (!current) return current;
      const updated = updater(current);
      return markCustom ? { ...updated, dataMode: 'custom' } : updated;
    });
  }, []);

  const persistWorkspaceNow = useCallback(async (nextState: AppState) => {
    try {
      await saveAppState(nextState);
      setStorageError(null);
      setWorkspace(nextState);
    } catch (error) {
      const msg =
        'Penyimpanan lokal browser (IndexedDB) gagal diakses. Segera ekspor backup sebelum menutup.';
      setStorageError(msg);
      throw error instanceof Error ? error : new Error(msg);
    }
  }, []);

  const currentEntries = workspace?.draft ?? workspace?.activeSchedule ?? [];
  const report = useMemo(() => (workspace ? validateSchedule(workspace, currentEntries, { strictCoverage: true, includeSoftWarnings: true }) : null), [workspace, currentEntries]);
  const masterIssues = useMemo(() => (workspace ? validateMasterData(workspace) : []), [workspace]);
  const activeClassCount = workspace?.classes.filter((item) => item.isActive).length ?? 0;
  const occupiedSlots = currentEntries.length;
  const totalWeeklyCapacity = workspace
    ? workspace.settings.activeDays.reduce((sum, day) => sum + teachingPeriodsForDay(workspace.slots, day).length, 0) * activeClassCount
    : 0;
  const subjectCounts = workspace?.subjects.filter((item) => item.isActive).length ?? 0;
  const activeTeachersCount = workspace?.teachers.filter((item) => item.isActive).length ?? 0;
  const readiness =
    workspace && activeClassCount > 0 && activeTeachersCount > 0 && subjectCounts > 0 && workspace.requirements.length > 0
      ? Math.max(0, Math.min(100, Math.round(100 - masterIssues.filter((item) => item.severity === 'error').length * 12 - (report?.hardErrorCount ?? 0) * 2)))
      : 0;

  const applyNavigation = useCallback((next: ScreenId) => {
    setScreen(next);
    setSidebarOpen(false);
    setAddType(null);
    setReqFormOpen(false);
  }, []);

  const navigate = (next: ScreenId) => {
    if (screen === 'settings' && settingsDirty && next !== 'settings') {
      setPendingNavScreen(next);
      return;
    }
    if (screen === 'persuratan' && persuratanDirty && next !== 'persuratan') {
      setPendingNavScreen(next);
      return;
    }
    applyNavigation(next);
  };

  const launchPersuratan = useCallback(
    (request: PersuratanLaunchRequest) => {
      setPersuratanLaunch(request);
      if (screen !== 'persuratan') {
        if (screen === 'settings' && settingsDirty) {
          setPendingNavScreen('persuratan');
          return;
        }
        applyNavigation('persuratan');
      }
    },
    [screen, settingsDirty, applyNavigation]
  );

  const handleLaunchTeachingSk = useCallback(
    (scheduleVersionId?: string | null) => {
      if (!workspace) return;
      try {
        const req = buildSkTeachingLaunchPayload(workspace, {
          scheduleVersionId: scheduleVersionId ?? null,
        });
        launchPersuratan(req);
      } catch (err) {
        notify(
          err instanceof Error
            ? err.message
            : 'SK Mengajar hanya dapat dibuat dari ScheduleVersion terbit terverifikasi.',
          'warning'
        );
      }
    },
    [workspace, launchPersuratan, notify]
  );

  const handlePeriodConfig = (changes: Partial<AppState['settings']>) => {
    updateWorkspace((current) => {
      const settings = { ...current.settings, ...changes };
      return { ...current, settings, slots: buildTimeSlots(settings) };
    }, true);
    setSettingsSaved(true);
    setSettingsDirty(false);
    notify('Struktur waktu dan kegiatan KBM diperbarui.', 'success');
  };

  // Primary Action: Buat Jadwal in 1-Click
  const handleGenerate = () => {
    if (!workspace) return;
    setIsGenerating(true);
    setLastGeneratorResult({ status: 'RUNNING', message: 'Menyiapkan constraint dan mencari susunan jadwal optimal…', nodes: 0 });

    window.setTimeout(() => {
      const seed = (Date.now() ^ Math.floor(Math.random() * 0xffff)) >>> 0;
      const result = generateSchedule(workspace, seed);
      setLastGeneratorResult({ status: result.status, message: result.message, nodes: result.nodes });
      setIsGenerating(false);

      if (result.status === 'SUCCESS' && result.candidate) {
        createSnapshot(workspace, 'Jadwal Baru Berhasil Disusun', 'auto').catch(console.error);
        updateWorkspace((current) => ({
          ...current,
          candidates: [result.candidate!, ...current.candidates.filter((item) => item.seed !== result.candidate!.seed)].slice(0, 5),
          draft: result.candidate!.entries,
          dataMode: 'custom',
        }));
        notify('Jadwal berhasil disusun dan lolos seluruh hard constraint.', 'success');
        setScreen('schedule');
      } else {
        notify(result.message, result.status === 'INVALID_INPUT' ? 'warning' : 'error');
        if (result.status === 'INVALID_INPUT') {
          setQuickValidationOpen(true);
        }
      }
    }, 80);
  };

  const chooseCandidate = (candidateId: string) => {
    if (!workspace) return;
    const candidate = workspace.candidates.find((item) => item.id === candidateId);
    if (!candidate) return;
    const check = validateSchedule(workspace, candidate.entries, { strictCoverage: true, includeSoftWarnings: true });
    if (!check.valid) {
      notify('Kandidat tidak lolos validasi terbaru; tidak diterapkan.', 'error');
      return;
    }
    updateWorkspace((current) => ({ ...current, draft: candidate.entries, dataMode: 'custom' }));
    notify('Kandidat diterapkan sebagai draft. Jadwal aktif belum berubah.', 'success');
    setScreen('schedule');
  };

  // Drag and Drop Placement with Deterministic Collision Guard (Defense-in-depth)
  const handleDropSlot = (source: { classId: string; day: Day; jpNo: number }, target: { day: Day; jpNo: number }) => {
    if (!workspace) return;
    if (source.day === target.day && source.jpNo === target.jpNo) return;

    // 1. Resolve target slot: MUST be an active TEACHING slot for target day and jpNo
    const validTargetSlot = workspace.slots.find(
      (s) => s.day === target.day && s.kind === 'TEACHING' && s.active && s.jpNo === target.jpNo,
    );
    if (!validTargetSlot) {
      const nonKbmSlot = workspace.slots.find((s) => s.day === target.day && s.kind === 'BREAK');
      notify(
        `Tidak dapat dipindahkan: Target bukan slot KBM aktif${nonKbmSlot ? ` (terdapat kegiatan ${nonKbmSlot.label || nonKbmSlot.activityType})` : ''}.`,
        'error',
      );
      return;
    }

    const currentList = workspace.draft ?? workspace.activeSchedule ?? [];
    const sourceEntry = currentList.find((e) => e.classId === source.classId && e.day === source.day && e.jpNo === source.jpNo);
    if (!sourceEntry) return;

    // 2. Check if moving sourceEntry's teacher to target slot conflicts with another class
    const teacherClash = currentList.find(
      (e) => e.day === target.day && e.jpNo === target.jpNo && e.teacherId === sourceEntry.teacherId && e.classId !== source.classId,
    );
    if (teacherClash) {
      const clashClass = getClass(workspace, teacherClash.classId)?.name || teacherClash.classId;
      const teacherName = getTeacher(workspace, sourceEntry.teacherId)?.name || 'Guru';
      notify(`Bentrok jadwal: ${teacherName} sedang mengajar di Kelas ${clashClass} pada ${target.day} JP ${target.jpNo}.`, 'error');
      return;
    }

    // 3. Check if target slot has an existing entry in the SAME class (SWAP)
    const targetEntry = currentList.find(
      (e) => e.classId === source.classId && e.day === target.day && e.jpNo === target.jpNo,
    );

    if (targetEntry) {
      // Reverse clash check for swapped teacher
      const reverseClash = currentList.find(
        (e) => e.day === source.day && e.jpNo === source.jpNo && e.teacherId === targetEntry.teacherId && e.classId !== source.classId,
      );
      if (reverseClash) {
        const reverseClass = getClass(workspace, reverseClash.classId)?.name || reverseClash.classId;
        const targetTeacherName = getTeacher(workspace, targetEntry.teacherId)?.name || 'Guru';
        notify(`Tidak dapat menukar: ${targetTeacherName} bentrok di Kelas ${reverseClass} pada ${source.day} JP ${source.jpNo}.`, 'error');
        return;
      }

      // Save for Undo
      setLastMoveHistory({ entries: [...currentList], description: `Menukar pelajaran JP ${source.jpNo} dan JP ${target.jpNo}` });

      // Apply swap
      const updated = currentList.map((e) => {
        if (e.id === sourceEntry.id) return { ...e, day: target.day, jpNo: target.jpNo };
        if (e.id === targetEntry.id) return { ...e, day: source.day, jpNo: source.jpNo };
        return e;
      });

      updateWorkspace((current) => ({ ...current, draft: updated }), true);
      notify(`Pelajaran ditukar ke ${target.day} JP ${target.jpNo}. Tersimpan.`, 'success');
      return;
    }

    // Move to empty target slot
    setLastMoveHistory({ entries: [...currentList], description: `Memindahkan pelajaran ke ${target.day} JP ${target.jpNo}` });
    const updated = currentList.map((e) => (e.id === sourceEntry.id ? { ...e, day: target.day, jpNo: target.jpNo } : e));
    updateWorkspace((current) => ({ ...current, draft: updated }), true);
    notify(`Pelajaran dipindahkan ke ${target.day} JP ${target.jpNo}. Tersimpan.`, 'success');
  };

  const handleUndoMove = () => {
    if (!lastMoveHistory || !workspace) return;
    updateWorkspace((current) => ({ ...current, draft: lastMoveHistory.entries }), true);
    notify(`Perubahan dibatalkan: ${lastMoveHistory.description}.`, 'info');
    setLastMoveHistory(null);
  };

  const handleClearSlot = (classId: string, day: Day, jpNo: number) => {
    if (!workspace) return;
    const currentList = workspace.draft ?? workspace.activeSchedule ?? [];
    const targetEntry = currentList.find(
      (e) => e.classId === classId && e.day === day && e.jpNo === jpNo,
    );
    if (!targetEntry) return;

    const sub = getSubject(workspace, targetEntry.subjectId)?.name || 'Pelajaran';
    setLastMoveHistory({
      entries: [...currentList],
      description: `Mengosongkan ${sub} di ${day} JP ${jpNo}`,
    });

    const updated = currentList.filter(
      (e) => !(e.classId === classId && e.day === day && e.jpNo === jpNo),
    );
    updateWorkspace((current) => ({ ...current, draft: updated }), true);
    notify(`${sub} di ${day} JP ${jpNo} telah dikosongkan.`, 'info');
  };

  const handleAssignSlot = (
    classId: string,
    day: Day,
    jpNo: number,
    subjectId: string,
    teacherId: string,
  ) => {
    if (!workspace) return;
    const targetSlot = workspace.slots.find(
      (s) => s.day === day && s.kind === 'TEACHING' && s.active && s.jpNo === jpNo,
    );
    if (!targetSlot) {
      notify(`Slot ${day} JP ${jpNo} bukan slot KBM aktif yang dapat diisi.`, 'warning');
      return;
    }
    const currentList = workspace.draft ?? workspace.activeSchedule ?? [];
    const teacherClash = currentList.find(
      (e) => e.day === day && e.jpNo === jpNo && e.teacherId === teacherId && e.classId !== classId,
    );
    if (teacherClash) {
      const clashClass = getClass(workspace, teacherClash.classId)?.name || teacherClash.classId;
      const tchName = getTeacher(workspace, teacherId)?.name || 'Guru';
      notify(`Bentrok jadwal: ${tchName} sedang mengajar di Kelas ${clashClass} pada ${day} JP ${jpNo}.`, 'error');
      return;
    }

    setLastMoveHistory({
      entries: [...currentList],
      description: `Menempatkan mapel pada ${day} JP ${jpNo}`,
    });

    const without = currentList.filter(
      (e) => !(e.classId === classId && e.day === day && e.jpNo === jpNo),
    );
    const next = [
      ...without,
      {
        id: `MAN-${Date.now().toString(36)}`,
        classId,
        day,
        jpNo,
        subjectId,
        teacherId,
      },
    ];
    updateWorkspace((current) => ({ ...current, draft: next }), true);
    const subName = getSubject(workspace, subjectId)?.name || 'Pelajaran';
    notify(`${subName} berhasil dialokasikan pada ${day} JP ${jpNo}.`, 'success');
  };

  const openSlotEditor = (classId: string, day: Day, jpNo: number) => {
    if (!workspace) return;
    const targetSlot = workspace.slots.find(
      (s) => s.day === day && s.kind === 'TEACHING' && s.active && s.jpNo === jpNo,
    );
    if (!targetSlot) {
      notify(`Slot ${day} JP ${jpNo} bukan slot KBM aktif yang dapat diisi.`, 'warning');
      return;
    }
    const entry = getEntry(workspace, classId, day, jpNo);
    setEditingSlot({ classId, day, jpNo });
    setEditingSubject(entry?.subjectId ?? '');
    setEditingTeacher(entry?.teacherId ?? '');
    setCustomTeacherName('');
  };

  const saveSlotEditor = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !editingSlot) return;
    const { classId, day, jpNo } = editingSlot;

    // Defense-in-depth: Re-verify target slot is an active TEACHING slot
    const targetSlot = workspace.slots.find(
      (s) => s.day === day && s.kind === 'TEACHING' && s.active && s.jpNo === jpNo,
    );
    if (!targetSlot) {
      notify(`Slot ${day} JP ${jpNo} bukan slot KBM aktif yang valid. Perubahan dibatalkan.`, 'error');
      setEditingSlot(null);
      return;
    }

    let targetTeacherId = editingTeacher;
    let nextTeachers = [...workspace.teachers];

    if (editingTeacher === '__NEW_CUSTOM__') {
      if (!customTeacherName.trim()) {
        notify('Mohon masukkan nama guru baru atau guru tamu.', 'warning');
        return;
      }
      const newTeacherId = `TCH-EXT-${Date.now().toString(36)}`;
      const initials = customTeacherName
        .trim()
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .slice(0, 4)
        .toUpperCase();

      const newTeacher: Teacher = {
        id: newTeacherId,
        name: customTeacherName.trim(),
        code: initials || 'GT',
        subjectIds: editingSubject ? [editingSubject] : [],
        maxWeeklyJP: 30,
        isActive: true,
      };
      nextTeachers.push(newTeacher);
      targetTeacherId = newTeacherId;
    } else if (editingTeacher && editingSubject) {
      const tIdx = nextTeachers.findIndex((t) => t.id === editingTeacher);
      if (tIdx >= 0 && !nextTeachers[tIdx].subjectIds.includes(editingSubject)) {
        nextTeachers[tIdx] = {
          ...nextTeachers[tIdx],
          subjectIds: [...nextTeachers[tIdx].subjectIds, editingSubject],
        };
      }
    }

    updateWorkspace((current) => {
      const previous = current.draft ?? current.activeSchedule ?? [];
      const without = previous.filter((entry) => !(entry.classId === classId && entry.day === day && entry.jpNo === jpNo));
      const next = editingSubject && targetTeacherId ? [...without, {
        id: `MAN-${Date.now().toString(36)}`, classId, day, jpNo, subjectId: editingSubject, teacherId: targetTeacherId,
      }] : without;
      return {
        ...current,
        teachers: nextTeachers,
        draft: next,
        dataMode: 'custom',
      };
    }, true);
    setEditingSlot(null);
    setCustomTeacherName('');
    notify('Perubahan jadwal disimpan sebagai draft. Berhasil.', 'success');
  };

  const publishDraft = () => {
    if (!workspace) return;
    const entries = workspace.draft ?? workspace.activeSchedule ?? [];
    const check = validateSchedule(workspace, entries, { strictCoverage: true, includeSoftWarnings: true });
    if (!check.valid) {
      notify(`Publikasi diblokir: ${check.hardErrorCount} pelanggaran aturan wajib masih ditemukan.`, 'error');
      setQuickValidationOpen(true);
      return;
    }
    const nextVersion = (workspace.history[0]?.version ?? 0) + 1;
    const version: ScheduleVersion = {
      id: `VER-${Date.now().toString(36)}`,
      version: nextVersion,
      createdAt: new Date().toISOString(),
      label: `Jadwal ${workspace.settings.academicYear} · ${workspace.settings.semester} · v${nextVersion}`,
      entryCount: entries.length,
      entries: entries.map((entry) => ({ ...entry })),
      fingerprint: buildScheduleFingerprint(entries),
      validatorVersion: 'SIGNAL-validator/1.0.0',
      academicYear: workspace.settings.academicYear,
      semester: workspace.settings.semester,
    };
    updateWorkspace((current) => ({
      ...current,
      activeSchedule: entries.map((entry) => ({ ...entry })),
      draft: null,
      history: [version, ...current.history],
    }));
    notify(`Jadwal diterbitkan sebagai Versi ${nextVersion}. Snapshot tersimpan.`, 'success');
    setScreen('history');
  };

  const restoreVersion = (version: ScheduleVersion) => {
    if (!workspace) return;
    updateWorkspace((current) => ({ ...current, draft: version.entries.map((entry) => ({ ...entry })), dataMode: 'custom' }));
    const check = validateSchedule(workspace, version.entries, { strictCoverage: true, includeSoftWarnings: false });
    notify(check.valid ? `Versi ${version.version} dipulihkan sebagai draft.` : `Versi ${version.version} dimuat ke draft, perlu validasi ulang.`, check.valid ? 'success' : 'warning');
    setScreen('schedule');
  };

  const saveMasterForm = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace || !addType) return;
    if (!masterForm.name.trim()) { notify('Nama tidak boleh kosong.', 'warning'); return; }
    if (addType === 'class') {
      const name = masterForm.name.trim();
      if (workspace.classes.some((item) => item.name.toLowerCase() === name.toLowerCase())) { notify('Nama kelas sudah ada.', 'warning'); return; }
      const newClass = { id: `CLS-${Date.now().toString(36)}`, name, level: masterForm.level, isActive: true };
      updateWorkspace((current) => ({ ...current, classes: [...current.classes, newClass] }), true);
      setSelectedClass(newClass.id);
      notify(`Kelas ${name} ditambahkan.`);
    } else if (addType === 'teacher') {
      if (!masterForm.selectedSubjectIds.length) { notify('Pilih minimal satu kualifikasi mapel.', 'warning'); return; }
      const teacher: Teacher = {
        id: `TCH-${Date.now().toString(36)}`,
        code: masterForm.code.trim() || `T-${workspace.teachers.length + 1}`,
        name: masterForm.name.trim(),
        roleTitle: masterForm.roleTitle.trim() || 'Guru Mapel',
        nip: masterForm.nip.trim() || undefined,
        gender: detectTeacherGender(masterForm.name, masterForm.roleTitle, masterForm.gender),
        subjectIds: masterForm.selectedSubjectIds,
        maxWeeklyJP: Math.max(1, Number(masterForm.maxWeeklyJP) || 24),
        isActive: true,
      };
      updateWorkspace((current) => ({ ...current, teachers: [...current.teachers, teacher] }), true);
      notify(`Guru ${teacher.name} (${teacher.roleTitle}) ditambahkan.`);
    } else {
      const name = masterForm.name.trim();
      if (workspace.subjects.some((item) => item.name.toLowerCase() === name.toLowerCase())) { notify('Nama mapel sudah ada.', 'warning'); return; }
      const subject: Subject = { id: `SUB-${Date.now().toString(36)}`, code: masterForm.code.trim() || `MAP-${workspace.subjects.length + 1}`, name, color: masterForm.color, isActive: true };
      updateWorkspace((current) => ({ ...current, subjects: [...current.subjects, subject] }), true);
      notify(`Mapel ${name} ditambahkan.`);
    }
    setAddType(null); setMasterForm(emptyMasterForm);
  };

  const deleteMaster = (kind: MasterTab, id: string) => {
    if (!workspace) return;
    if (!window.confirm('Hapus item ini? Penempatan atau alokasi terkait juga akan dihapus.')) return;
    updateWorkspace((current) => {
      if (kind === 'classes') {
        return {
          ...current,
          classes: current.classes.filter((item) => item.id !== id),
          requirements: current.requirements.filter((item) => item.classId !== id),
          draft: (current.draft ?? []).filter((item) => item.classId !== id),
          activeSchedule: (current.activeSchedule ?? []).filter((item) => item.classId !== id),
        };
      }
      if (kind === 'teachers') {
        return {
          ...current,
          teachers: current.teachers.filter((item) => item.id !== id),
          requirements: current.requirements.filter((item) => item.teacherId !== id),
          draft: (current.draft ?? []).filter((item) => item.teacherId !== id),
          activeSchedule: (current.activeSchedule ?? []).filter((item) => item.teacherId !== id),
        };
      }
      return {
        ...current,
        subjects: current.subjects.filter((item) => item.id !== id),
        teachers: current.teachers.map((item) => ({ ...item, subjectIds: item.subjectIds.filter((subjectId) => subjectId !== id) })),
        requirements: current.requirements.filter((item) => item.subjectId !== id),
        draft: (current.draft ?? []).filter((item) => item.subjectId !== id),
        activeSchedule: (current.activeSchedule ?? []).filter((item) => item.subjectId !== id),
      };
    }, true);
    notify('Data dan referensi terkait telah diperbarui.', 'info');
  };

  const bulkDeleteMaster = (kind: MasterTab, ids: string[]) => {
    if (!workspace || ids.length === 0) return;
    const idSet = new Set(ids);
    updateWorkspace((current) => {
      if (kind === 'classes') {
        return {
          ...current,
          classes: current.classes.filter((item) => !idSet.has(item.id)),
          requirements: current.requirements.filter((item) => !idSet.has(item.classId)),
          draft: (current.draft ?? []).filter((item) => !idSet.has(item.classId)),
          activeSchedule: (current.activeSchedule ?? []).filter((item) => !idSet.has(item.classId)),
        };
      }
      if (kind === 'teachers') {
        return {
          ...current,
          teachers: current.teachers.filter((item) => !idSet.has(item.id)),
          requirements: current.requirements.filter((item) => !idSet.has(item.teacherId)),
          draft: (current.draft ?? []).filter((item) => !idSet.has(item.teacherId)),
          activeSchedule: (current.activeSchedule ?? []).filter((item) => !idSet.has(item.teacherId)),
        };
      }
      return {
        ...current,
        subjects: current.subjects.filter((item) => !idSet.has(item.id)),
        teachers: current.teachers.map((item) => ({
          ...item,
          subjectIds: item.subjectIds.filter((subjectId) => !idSet.has(subjectId)),
        })),
        requirements: current.requirements.filter((item) => !idSet.has(item.subjectId)),
        draft: (current.draft ?? []).filter((item) => !idSet.has(item.subjectId)),
        activeSchedule: (current.activeSchedule ?? []).filter((item) => !idSet.has(item.subjectId)),
      };
    }, true);
    const label = kind === 'classes' ? 'kelas' : kind === 'teachers' ? 'guru' : 'mata pelajaran';
    notify(`${ids.length} data ${label} terpilih beserta relasinya berhasil dihapus.`, 'info');
  };

  const bulkExportMaster = (kind: MasterTab, ids: string[]) => {
    if (!workspace || ids.length === 0) return;
    const idSet = new Set(ids);
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (kind === 'classes') {
      const selected = workspace.classes.filter((c) => idSet.has(c.id));
      const rows = [['Nama Kelas', 'Tingkat', 'Total JP Terdaftar', 'Jumlah Mapel', 'Status']];
      for (const c of selected) {
        const reqs = workspace.requirements.filter((r) => r.classId === c.id);
        const totalJP = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
        rows.push([`Kelas ${c.name}`, c.level, String(totalJP), String(reqs.length), c.isActive ? 'Aktif' : 'Nonaktif']);
      }
      downloadTextFile(
        '\uFEFF' + rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n'),
        `SIGNAL-master-kelas-terpilih-${dateStamp}.csv`,
        'text/csv;charset=utf-8'
      );
      notify(`${selected.length} data kelas terpilih berhasil diekspor ke CSV.`, 'success');
      return;
    }

    if (kind === 'teachers') {
      const selected = workspace.teachers.filter((t) => idSet.has(t.id));
      const rows = [['Nama Guru', 'Kode', 'NIP/NPK', 'Jabatan', 'Kualifikasi Mapel', 'Beban JP', 'Batas Maksimal JP', 'Status']];
      for (const t of selected) {
        const reqs = workspace.requirements.filter((r) => r.teacherId === t.id);
        const totalJP = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
        const subjectsText = t.subjectIds.map((sid) => getSubject(workspace, sid)?.name ?? sid).join('; ');
        rows.push([
          t.name,
          t.code,
          t.nip ?? '-',
          t.roleTitle ?? 'Guru Mapel',
          subjectsText || '-',
          String(totalJP),
          String(t.maxWeeklyJP || 24),
          t.isActive ? 'Aktif' : 'Nonaktif',
        ]);
      }
      downloadTextFile(
        '\uFEFF' + rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n'),
        `SIGNAL-master-guru-terpilih-${dateStamp}.csv`,
        'text/csv;charset=utf-8'
      );
      notify(`${selected.length} data dewan guru terpilih berhasil diekspor ke CSV.`, 'success');
      return;
    }

    const selected = workspace.subjects.filter((s) => idSet.has(s.id));
    const rows = [['Nama Mata Pelajaran', 'Kode', 'Jumlah Guru Pengampu', 'Daftar Guru', 'Status']];
    for (const s of selected) {
      const qualified = workspace.teachers.filter((t) => t.isActive && t.subjectIds.includes(s.id));
      rows.push([
        s.name,
        s.code,
        String(qualified.length),
        qualified.map((t) => t.name).join('; ') || '-',
        s.isActive ? 'Aktif' : 'Nonaktif',
      ]);
    }
    downloadTextFile(
      '\uFEFF' + rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n'),
      `SIGNAL-master-mapel-terpilih-${dateStamp}.csv`,
      'text/csv;charset=utf-8'
    );
    notify(`${selected.length} data mata pelajaran terpilih berhasil diekspor ke CSV.`, 'success');
  };

  const bulkToggleActiveMaster = (kind: MasterTab, ids: string[], nextActive: boolean) => {
    if (!workspace || ids.length === 0) return;
    const idSet = new Set(ids);
    updateWorkspace((current) => {
      if (kind === 'classes') {
        return {
          ...current,
          classes: current.classes.map((item) =>
            idSet.has(item.id) ? { ...item, isActive: nextActive } : item,
          ),
        };
      }
      if (kind === 'teachers') {
        return {
          ...current,
          teachers: current.teachers.map((item) =>
            idSet.has(item.id) ? { ...item, isActive: nextActive } : item,
          ),
        };
      }
      return {
        ...current,
        subjects: current.subjects.map((item) =>
          idSet.has(item.id) ? { ...item, isActive: nextActive } : item,
        ),
      };
    }, true);
    const label = kind === 'classes' ? 'kelas' : kind === 'teachers' ? 'guru' : 'mata pelajaran';
    notify(
      `${ids.length} data ${label} terpilih berhasil diubah menjadi ${nextActive ? 'Aktif' : 'Nonaktif'}.`,
      'success',
    );
  };

  const saveRequirement = (event: FormEvent) => {
    event.preventDefault();
    if (!workspace) return;
    const requiredJP = Number(reqForm.requiredJP);
    if (!reqForm.classId || !reqForm.subjectId || !reqForm.teacherId || !Number.isInteger(requiredJP) || requiredJP < 1) {
      notify('Kelas, mapel, guru dan alokasi JP wajib diisi dengan benar.', 'warning');
      return;
    }
    const teacher = workspace.teachers.find((item) => item.id === reqForm.teacherId);
    if (!teacher) {
      notify('Pilih guru pengampu yang terdaftar.', 'warning');
      return;
    }
    updateWorkspace((current) => {
      const nextTeachers = current.teachers.map((t) => {
        if (t.id === reqForm.teacherId && !t.subjectIds.includes(reqForm.subjectId)) {
          return { ...t, subjectIds: [...t.subjectIds, reqForm.subjectId] };
        }
        return t;
      });
      const existing = current.requirements.find((item) => item.classId === reqForm.classId && item.subjectId === reqForm.subjectId && item.teacherId === reqForm.teacherId);
      const requirements = existing
        ? current.requirements.map((item) => item.id === existing.id ? { ...item, requiredJP } : item)
        : [...current.requirements, { id: `REQ-${Date.now().toString(36)}`, classId: reqForm.classId, subjectId: reqForm.subjectId, teacherId: reqForm.teacherId, requiredJP }];
      return { ...current, teachers: nextTeachers, requirements, draft: null };
    }, true);
    setReqFormOpen(false);
    notify('Alokasi JP tersimpan. Kualifikasi guru disesuaikan.', 'success');
  };

  const deleteRequirement = (requirement: Requirement) => {
    if (!workspace) return;
    updateWorkspace((current) => ({ ...current, requirements: current.requirements.filter((item) => item.id !== requirement.id), draft: null }), true);
    notify('Alokasi dihapus.', 'info');
  };

  const handleBatchCopyRequirements = (sourceClassId: string, targetClassId: string) => {
    if (!workspace) return;
    const sourceReqs = workspace.requirements.filter((r) => r.classId === sourceClassId);
    if (!sourceReqs.length) {
      notify('Rombel asal belum memiliki alokasi JP untuk disalin.', 'warning');
      return;
    }
    const sourceClassName = workspace.classes.find((c) => c.id === sourceClassId)?.name ?? 'Asal';
    const targetClassName = workspace.classes.find((c) => c.id === targetClassId)?.name ?? 'Tujuan';

    updateWorkspace((current) => {
      const filtered = current.requirements.filter((r) => r.classId !== targetClassId);
      const newReqs: Requirement[] = sourceReqs.map((r, idx) => ({
        ...r,
        id: `REQ-${targetClassId}-${r.subjectId}-${Date.now().toString(36)}-${idx}`,
        classId: targetClassId,
      }));
      return {
        ...current,
        requirements: [...filtered, ...newReqs],
        draft: null,
      };
    }, true);
    notify(`Berhasil menyalin ${sourceReqs.length} alokasi mapel dari Kelas ${sourceClassName} ke Kelas ${targetClassName}.`, 'success');
  };

  const handleSaveClass = (cls: SchoolClass, isNew: boolean) => {
    if (!workspace) return;
    updateWorkspace((curr) => {
      const classes = isNew
        ? [...curr.classes, cls]
        : curr.classes.map((c) => (c.id === cls.id ? cls : c));
      return { ...curr, classes };
    }, true);
    if (isNew) setSelectedClass(cls.id);
    notify(isNew ? `Kelas ${cls.name} ditambahkan.` : `Data Kelas ${cls.name} diperbarui.`, 'success');
  };

  const handleSaveTeacher = (tch: Teacher, isNew: boolean) => {
    if (!workspace) return;
    updateWorkspace((curr) => {
      const teachers = isNew
        ? [...curr.teachers, tch]
        : curr.teachers.map((t) => (t.id === tch.id ? tch : t));
      return { ...curr, teachers };
    }, true);
    notify(isNew ? `Guru ${tch.name} ditambahkan.` : `Data Guru ${tch.name} diperbarui.`, 'success');
  };

  const handleSaveSubject = (sub: Subject, isNew: boolean) => {
    if (!workspace) return;
    updateWorkspace((curr) => {
      const subjects = isNew
        ? [...curr.subjects, sub]
        : curr.subjects.map((s) => (s.id === sub.id ? sub : s));
      return { ...curr, subjects };
    }, true);
    notify(isNew ? `Mapel ${sub.name} ditambahkan.` : `Data Mapel ${sub.name} diperbarui.`, 'success');
  };

  const handleSaveRequirementFromModal = (req: Requirement, isNew: boolean) => {
    if (!workspace) return;
    updateWorkspace((curr) => {
      const requirements = isNew
        ? [...curr.requirements, req]
        : curr.requirements.map((r) => (r.id === req.id ? req : r));
      return { ...curr, requirements, draft: null };
    }, true);
    notify(isNew ? 'Alokasi kebutuhan JP ditambahkan.' : 'Alokasi kebutuhan JP diperbarui.', 'success');
  };

  const backupNow = async () => {
    if (!workspace) return;
    try {
      await exportAppState(workspace);
      updateWorkspace((current) => ({ ...current, lastBackupAt: new Date().toISOString() }));
      notify('File backup JSON berhasil dibuat.', 'success');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Backup gagal dibuat.', 'error');
    }
  };

  const importBackup = async (file?: File) => {
    if (!workspace || !file) return;
    try {
      const parsedResult = await parseBackupFileDetailed(file);
      const check = validateMasterData(parsedResult.state);
      const fatal = check.filter((item) => item.severity === 'error');
      if (fatal.length) {
        notify(`Backup tidak diterapkan: ${fatal[0].title}.`, 'error');
        return;
      }
      setPendingBackupRestore({ fileName: file.name, result: parsedResult });
    } catch (error) {
      notify(error instanceof Error ? error.message : 'File backup tidak dapat dibaca.', 'error');
    }
  };

  const confirmApplyBackupRestore = async () => {
    if (!pendingBackupRestore) return;
    const { fileName, result } = pendingBackupRestore;
    try {
      const restored = await restoreWorkspaceSafely(
        { ...result.state, dataMode: 'custom' },
        result.blobs
      );
      setWorkspace(restored);
      setPendingBackupRestore(null);
      const blobNote =
        result.blobs && result.blobs.length > 0
          ? ` (${result.blobs.length} berkas PDF/lampiran dipulihkan)`
          : '';
      notify(
        result.verification === 'legacy_unverified'
          ? `Backup lama "${fileName}" dipulihkan tanpa verifikasi checksum SHA-256${blobNote}.`
          : `Backup "${fileName}" berhasil diverifikasi SHA-256 dan dipulihkan${blobNote}.`,
        result.verification === 'legacy_unverified' ? 'warning' : 'success'
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Gagal menyimpan pemulihan backup.', 'error');
    }
  };

  const exportScheduleCSV = () => {
    if (!workspace) return;
    const rows = [['Kelas', 'Hari', 'JP KBM', 'Jam Mulai', 'Jam Selesai', 'Mata Pelajaran', 'Guru']];
    for (const entry of currentEntries) {
      const slot = workspace.slots.find((item) => item.day === entry.day && item.kind === 'TEACHING' && item.jpNo === entry.jpNo);
      rows.push([
        getClass(workspace, entry.classId)?.name ?? entry.classId, entry.day, String(entry.jpNo), slot?.start ?? '', slot?.end ?? '',
        getSubject(workspace, entry.subjectId)?.name ?? entry.subjectId, getTeacher(workspace, entry.teacherId)?.name ?? entry.teacherId,
      ]);
    }
    downloadTextFile(rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n'), `SIGNAL-jadwal-${workspace.settings.academicYear.replace('/', '-')}.csv`);
    notify('CSV jadwal berhasil diunduh.', 'success');
  };

  const exportJSONSchedule = () => {
    if (!workspace) return;
    const content = JSON.stringify({
      format: 'SIGNAL-SCHEDULE',
      exportedAt: new Date().toISOString(),
      settings: workspace.settings,
      classes: workspace.classes,
      teachers: workspace.teachers,
      subjects: workspace.subjects,
      entries: currentEntries,
      validation: report,
    }, null, 2);
    downloadTextFile(content, `SIGNAL-jadwal-${workspace.settings.academicYear.replace('/', '-')}.json`, 'application/json');
    notify('Ekspor jadwal JSON siap.', 'success');
  };

  const resetWorkspace = () => {
    const fresh = createDemoState();
    setWorkspace(fresh);
    setSelectedClass(fresh.classes[0]?.id ?? '');
    setSettingsDirty(false);
    setPendingNavScreen(null);
    setScreen('overview');
    notify('Workspace dikembalikan ke dataset demo.', 'success');
  };

  if (!workspace || !ready) return <LoadingScreen />;

  const currentTitle = titleForScreen(screen);
  const selectedClassObj = getClass(workspace, selectedClass) ?? workspace.classes[0];

  return (
    <div className="app-shell">
      <div className={`sidebar-backdrop ${sidebarOpen ? 'is-visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar ${sidebarOpen ? 'is-open' : ''} ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sakala-brand" onClick={() => navigate('overview')} title="SIGNAL — Smart Islamic School Scheduler">
          <div className="v3-brandmark"><img src="/signal-mark.svg" alt="" /></div>
          {!sidebarCollapsed && (
            <div className="sakala-brand-info">
              <h2 className="sakala-brand-title">SIGNAL</h2>
              <span className="sakala-brand-subtitle">MADRASAH OPERATIONS</span>
            </div>
          )}
          <button
            type="button"
            className="sidebar-collapse-toggle"
            aria-label={sidebarCollapsed ? 'Perluas menu' : 'Perkecil menu'}
            onClick={(e) => { e.stopPropagation(); setSidebarCollapsed(!sidebarCollapsed); }}
            title={sidebarCollapsed ? 'Perluas Sidebar' : 'Perkecil Sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={13} /> : <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />}
          </button>
        </div>

        <nav className="sakala-nav" aria-label="Navigasi alur kerja">
          {navGroups.map((group) => (
            <div key={group.sectionTitle} className="sakala-nav-group">
              {!sidebarCollapsed && (
                <div className="sakala-nav-section-title">{group.sectionTitle}</div>
              )}
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`sakala-nav-item ${screen === item.id ? 'active' : ''}`}
                  onClick={() => navigate(item.id)}
                  aria-current={screen === item.id ? 'page' : undefined}
                  title={item.label}
                >
                  <item.icon className="icon" strokeWidth={screen === item.id ? 2.2 : 1.8} />
                  {!sidebarCollapsed && <span>{item.label}</span>}
                  {item.id === 'validation' && report && report.hardErrorCount > 0 && (
                    <span className="sakala-nav-badge">{report.hardErrorCount}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Minimal Quiet Status Footer */}
        <div className={`sidebar-status-footer ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
          <div className="sidebar-status-indicator" title="Penyimpanan lokal aktif di browser ini (Local First)">
            <HardDrive size={14} className="s5-sidebar-db-icon" aria-hidden="true" />
            {!sidebarCollapsed && (
              <div className="sidebar-status-text">
                <span className="sidebar-status-label">Lokal Aktif</span>
                <span className="sidebar-status-meta">TA {workspace.settings.academicYear}</span>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <button
              type="button"
              className="sidebar-quick-settings-btn"
              onClick={() => navigate('settings')}
              title="Buka Pengaturan"
              aria-label="Pengaturan"
            >
              <Settings2 size={14} />
            </button>
          )}
        </div>
      </aside>

      <main className={`main-shell ${sidebarCollapsed ? "main-shell-expanded" : ""}`}>
        <header className="sakala-topbar">
          <div className="sakala-header-greeting s5-topbar-left">
            <button
              className="icon-button mobile-menu-trigger"
              aria-label="Buka menu"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="s5-topbar-inline-brand">
              <h1>{screen === 'overview' ? 'Ringkasan Operasional' : currentTitle}</h1>
              <span className="s5-topbar-sep" aria-hidden="true" />
              <span className="s5-topbar-school-meta" aria-label="Identitas madrasah aktif">
                <strong>{workspace.settings.schoolName}</strong> · TA {workspace.settings.academicYear} ({workspace.settings.semester})
              </span>
            </div>
          </div>

          <div className="sakala-header-controls">
            {/* Global Command Palette Trigger */}
            <button
              className="s5-command-trigger s5-tooltip-bottom"
              onClick={() => setIsCommandPaletteOpen(true)}
              type="button"
              aria-label="Pusat Kendali Cepat"
              data-s5-tooltip="Cari cepat guru, kelas, dokumen & menu (Ctrl+K / Ctrl+Shift+P)"
            >
              <Search size={14} color="#124037" />
              <span>Cari cepat…</span>
              <span className="s5-kbd-shortcut">Ctrl K</span>
            </button>

            {/* Time Machine Vault Trigger */}
            <button
              className="s5-time-machine-btn s5-tooltip-bottom"
              onClick={() => setIsTimeMachineOpen(true)}
              type="button"
              data-s5-tooltip="Riwayat snapshot & pemulihan jadwal"
            >
              <Clock size={13} />
              <span>Time Machine</span>
            </button>

            <span className="s5-topbar-divider" aria-hidden="true" />

            {/* Real-time Validation Indicator (Semantic Icon, Zero Decorative Dot) */}
            <button
              type="button"
              className={`s5-heartbeat-pill s5-tooltip-bottom ${report && report.hardErrorCount > 0 ? 'clash' : 'clean'}`}
              onClick={() => setQuickValidationOpen(true)}
              data-s5-tooltip={report?.hardErrorCount ? `Periksa ${report.hardErrorCount} bentrok jadwal KBM` : 'Jadwal terverifikasi bebas bentrok'}
            >
              {report && report.hardErrorCount > 0 ? <AlertTriangle size={13} /> : <ShieldCheck size={13} />}
              <span className="s5-tnum">{report && report.hardErrorCount > 0 ? `${report.hardErrorCount} Bentrok` : 'Bebas Bentrok'}</span>
            </button>

            {/* Admin Avatar Ring */}
            <button
              type="button"
              className="s5-admin-ring s5-tooltip-bottom"
              onClick={() => navigate('settings')}
              data-s5-tooltip="Pengaturan Identitas Madrasah"
              aria-label="Profil Administrator Madrasah"
            >
              OP
            </button>
          </div>
        </header>

        <div className="content-scroll">
          <div className="page-frame">
            {workspace.dataMode === 'demo' && (
              <div className="demo-banner">
                <div className="demo-banner-icon"><Sparkles size={15} /></div>
                <div>
                  <strong>Anda sedang melihat dataset demonstrasi aktif.</strong>
                  <span>Jadwal dan presensi sudah terverifikasi. Sesuaikan data madrasah Anda sebelum mencetak.</span>
                </div>
                <button onClick={() => navigate('master')}>Sesuaikan Data <ArrowRight size={14} /></button>
                <button className="banner-close" onClick={() => updateWorkspace((current) => ({ ...current, dataMode: 'custom' }))} aria-label="Sembunyikan banner"><X size={14} /></button>
              </div>
            )}

            <MotionPageTransition screenKey={screen}>
            {/* SCREEN 1: BERANDA RINGKAS (OPERATOR WORKSPACE) */}
            {screen === 'overview' && (
              <OperatorOverviewScreen
                state={workspace}
                report={report!}
                masterIssues={masterIssues}
                readiness={readiness}
                occupiedSlots={occupiedSlots}
                totalWeeklyCapacity={totalWeeklyCapacity}
                onNavigate={navigate}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                onOpenPdfModal={() => setPdfExportOpen(true)}
                onOpenValidationModal={() => setQuickValidationOpen(true)}
                onSelectClass={(classId) => {
                  setSelectedClass(classId);
                  navigate('schedule');
                }}
                onLaunchPersuratan={launchPersuratan}
                onLaunchTeachingSk={() => handleLaunchTeachingSk(null)}
              />
            )}

            {/* SCREEN 2: JADWAL PELAJARAN (WITH DRAG & DROP & QUICK VALIDATION) */}
            {screen === 'schedule' && (
              <ScheduleScreen
                state={workspace}
                selectedClass={selectedClassObj?.id ?? ''}
                onSelectClass={setSelectedClass}
                onEditSlot={openSlotEditor}
                onClearSlot={handleClearSlot}
                onAssignSlot={handleAssignSlot}
                onDropSlot={handleDropSlot}
                onGenerate={handleGenerate}
                isGenerating={isGenerating}
                onPublish={publishDraft}
                onExportCSV={exportScheduleCSV}
                onOpenPdfModal={() => setPdfExportOpen(true)}
                onOpenValidationModal={() => setQuickValidationOpen(true)}
                onLaunchTeachingSk={handleLaunchTeachingSk}
                onNavigate={navigate}
                report={report!}
                lastMove={lastMoveHistory}
                onUndoMove={handleUndoMove}
              />
            )}

            {/* SCREEN 3: STATISTIK BEBAN GURU (NEW) */}
            {screen === 'workload' && (
              <WorkloadDashboard
                state={workspace}
                onNavigateToSchedule={() => navigate('schedule')}
                onNavigateToMaster={() => navigate('master')}
                onNavigateToRequirements={() => navigate('requirements')}
                onLaunchTeachingSk={(verId) => handleLaunchTeachingSk(verId)}
              />
            )}

            {/* SCREEN 4: PRESENSI & ABSENSI GURU (NEW) */}
            {screen === 'attendance' && (
              <AttendanceScreen
                state={workspace}
                onUpdateState={updateWorkspace}
                onNotify={notify}
              />
            )}

            {/* SCREEN S01–S05: PUSAT PERSURATAN & ARSIP + GALERI TEMPLATE + FORM DATA AWAL + DOCUMENT STUDIO + FINALISASI */}
            {screen === 'persuratan' && (
              <PersuratanWorkspace
                state={workspace}
                launchRequest={persuratanLaunch}
                storageError={storageError}
                onRetryStorage={retrySaveWorkspace}
                onUpdateState={updateWorkspace}
                onPersistState={persistWorkspaceNow}
                onDirtyChange={(dirty, source) => {
                  setPersuratanDirty(dirty);
                  setPersuratanDirtySource(dirty ? source ?? 'intake' : null);
                }}
                onNavigateToSettings={() => navigate('settings')}
                onNotify={notify}
              />
            )}

            {/* SCREEN 5: GENERATOR SCREEN */}
            {screen === 'generator' && (
              <GeneratorScreen
                state={workspace}
                isGenerating={isGenerating}
                result={lastGeneratorResult}
                onGenerate={handleGenerate}
                onChoose={chooseCandidate}
                onNavigate={navigate}
              />
            )}

            {/* SCREEN 6: DATA MASTER */}
            {screen === 'master' && (
              <MasterScreen
                state={workspace}
                activeTab={masterTab}
                onTabChange={(tab) => { setMasterTab(tab); setAddType(null); }}
                search={masterSearch}
                onSearch={setMasterSearch}
                onAdd={(type) => { setAddType(type); setMasterForm(emptyMasterForm); }}
                addType={addType}
                form={masterForm}
                setForm={setMasterForm}
                onSave={saveMasterForm}
                onCancelAdd={() => setAddType(null)}
                onDelete={deleteMaster}
                onBulkDelete={bulkDeleteMaster}
                onBulkExport={bulkExportMaster}
                onBulkToggleActive={bulkToggleActiveMaster}
                onEditClass={(c) => setEntityModalTarget({ kind: 'class', isNew: false, item: c })}
                onEditTeacher={(t) => setEntityModalTarget({ kind: 'teacher', isNew: false, item: t })}
                onInspectTeacher={(t) => setInspectorTarget({ type: 'teacher', data: t })}
                onOpenTeacherAssignments={(t) => setTeacherAssignmentTargetId(t.id)}
                onEditSubject={(s) => setEntityModalTarget({ kind: 'subject', isNew: false, item: s })}
                onOpenAddModal={(kind) => setEntityModalTarget({ kind, isNew: true })}
                onNavigate={navigate}
              />
            )}

            {/* SCREEN 7: KEBUTUHAN & ALOKASI JP */}
            {screen === 'requirements' && (
              <RequirementsScreen
                state={workspace}
                masterIssues={masterIssues}
                formOpen={reqFormOpen}
                setFormOpen={setReqFormOpen}
                form={reqForm}
                setForm={setReqForm}
                onSave={saveRequirement}
                onDelete={deleteRequirement}
                onGenerate={handleGenerate}
                onNavigate={navigate}
                onEdit={(r) => setEntityModalTarget({ kind: 'requirement', isNew: false, item: r })}
                onOpenAddModal={() => setEntityModalTarget({ kind: 'requirement', isNew: true })}
                onBatchCopyRequirements={handleBatchCopyRequirements}
              />
            )}

            {/* SCREEN 8: VALIDASI & KONFLIK */}
            {screen === 'validation' && (
              <ValidationScreen
                state={workspace}
                report={report!}
                masterIssues={masterIssues}
                expandedIssue={expandedIssue}
                setExpandedIssue={setExpandedIssue}
                onNavigate={navigate}
                onValidate={() => {
                  const newReport = validateSchedule(workspace, workspace.draft ?? workspace.activeSchedule ?? [], { strictCoverage: true, includeSoftWarnings: true });
                  notify(newReport.valid ? 'Validasi selesai: jadwal bebas pelanggaran.' : `Validasi selesai: ditemukan ${newReport.hardErrorCount} pelanggaran wajib.`, newReport.valid ? 'success' : 'warning');
                }}
              />
            )}

            {/* SCREEN 9: RIWAYAT VERSI */}
            {screen === 'history' && (
              <HistoryScreen
                state={workspace}
                onRestore={restoreVersion}
                onNavigate={navigate}
              />
            )}

            {/* SCREEN 10: EKSPOR & BACKUP */}
            {screen === 'backup' && (
              <BackupScreen
                state={workspace}
                onBackup={backupNow}
                onImport={importBackup}
                onExportCSV={exportScheduleCSV}
                onExportJSON={exportJSONSchedule}
              />
            )}

            {/* SCREEN 11: PENGATURAN HARI AKTIF & JAM KEGIATAN */}
            {screen === 'settings' && (
              <SettingsScreen
                state={workspace}
                onSettingsChange={handlePeriodConfig}
                onReset={resetWorkspace}
                onNotify={notify}
                saved={settingsSaved}
                onDirtyChange={setSettingsDirty}
                onRegisterSave={(fn) => {
                  settingsSaveRef.current = fn;
                }}
              />
            )}
            </MotionPageTransition>
          </div>

          <footer className="app-footer">
            <div className="s5-footer-left">
              <span>© 2026 SIGNAL Academic Studio</span>
              <span className="s5-footer-sep" aria-hidden="true">·</span>
              <span>Sistem Informasi Penjadwalan &amp; Presensi Madrasah</span>
            </div>
            <div className="s5-footer-right">
              <span>Penyimpanan lokal aktif di browser</span>
              <span className="s5-footer-sep" aria-hidden="true">·</span>
              <span>Built for clarity, designed for calm</span>
            </div>
          </footer>
        </div>
      </main>

      {/* Manual Slot Editor Modal */}
      {editingSlot && (() => {
        const slotKbmDef = workspace.slots.find(
          (s) => s.day === editingSlot.day && s.kind === 'TEACHING' && s.active && s.jpNo === editingSlot.jpNo
        );
        const activeSched = workspace.draft ?? workspace.activeSchedule ?? [];
        const teacherConflict = editingTeacher && editingTeacher !== '__NEW_CUSTOM__'
          ? activeSched.find(
              (e: ScheduleEntry) => e.day === editingSlot.day && e.jpNo === editingSlot.jpNo && e.teacherId === editingTeacher && e.classId !== editingSlot.classId
            )
          : null;
        const conflictClass = teacherConflict ? getClass(workspace, teacherConflict.classId) : null;

        return (
        <Modal
          title="Penempatan Pelajaran Jam KBM"
          subtitle={`Kelas ${getClass(workspace, editingSlot.classId)?.name ?? ''} · ${editingSlot.day} · JP ke-${editingSlot.jpNo}`}
          onClose={() => setEditingSlot(null)}
          icon={CalendarDays}
        >
          <div style={{ padding: '14px 20px 0 20px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#edf6f2',
                borderRadius: '10px',
                border: '1.5px solid #c2ded0',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={16} color="#16483f" />
                <div>
                  <strong style={{ color: '#103f3e', fontSize: '13px', display: 'block' }}>
                    Alokasi Jam KBM: {slotKbmDef ? `${slotKbmDef.start} – ${slotKbmDef.end} WIB` : `JP ${editingSlot.jpNo}`}
                  </strong>
                  <span style={{ color: '#4a6b62', fontSize: '11px' }}>
                    Hari {editingSlot.day} · JP ke-{editingSlot.jpNo} (Durasi {workspace.settings.periodMinutes || 40} menit/JP)
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: '#1f6952',
                  background: '#d4eedf',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  letterSpacing: '0.04em',
                }}
              >
                ✓ JAM KBM AKTIF
              </span>
            </div>

            {teacherConflict && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 12px',
                  background: '#fdf2f0',
                  border: '1px solid #f9ccc6',
                  borderRadius: '8px',
                  color: '#a03c30',
                  fontSize: '11.5px',
                  marginTop: '10px',
                }}
              >
                <AlertTriangle size={15} color="#b24c3d" style={{ flexShrink: 0 }} />
                <span>
                  <strong>Peringatan Bentrok:</strong> Guru ini sudah terjadwal mengajar di <strong>Kelas {conflictClass?.name || 'Lain'}</strong> pada Jam KBM yang sama ({editingSlot.day}, JP {editingSlot.jpNo} {slotKbmDef ? `· ${slotKbmDef.start}–${slotKbmDef.end}` : ''}).
                </span>
              </div>
            )}
          </div>
          <form className="modal-form" onSubmit={saveSlotEditor}>
            <div className="field-group">
              <label>Mata pelajaran</label>
              <select
                value={editingSubject}
                onChange={(e) => {
                  setEditingSubject(e.target.value);
                  const firstTeacher = workspace.teachers.find((teacher) => teacher.isActive && teacher.subjectIds.includes(e.target.value));
                  setEditingTeacher(firstTeacher?.id ?? '');
                }}
              >
                <option value="">— Kosongkan slot —</option>
                {workspace.subjects.filter((subject) => subject.isActive).map((subject) => (
                  <option key={subject.id} value={subject.id}>{subject.name}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label>Guru pengampu</label>
              <select
                value={editingTeacher}
                onChange={(e) => setEditingTeacher(e.target.value)}
                disabled={!editingSubject}
              >
                <option value="">Pilih guru</option>
                <option value="__NEW_CUSTOM__">+ Input Guru Baru / Tamu / Pengganti (Luar Master)</option>
                {workspace.teachers.filter((teacher) => teacher.isActive && editingSubject && teacher.subjectIds.includes(editingSubject)).length > 0 && (
                  <optgroup label="Guru Sesuai Kualifikasi Mapel">
                    {workspace.teachers
                      .filter((teacher) => teacher.isActive && editingSubject && teacher.subjectIds.includes(editingSubject))
                      .map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.code})</option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="Semua Guru Terdaftar Lainnya (Lintas Mapel)">
                  {workspace.teachers
                    .filter((teacher) => !editingSubject || !teacher.subjectIds.includes(editingSubject))
                    .map((teacher) => (
                      <option key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.code})</option>
                    ))}
                </optgroup>
              </select>
            </div>

            {editingTeacher === '__NEW_CUSTOM__' && (
              <div className="field-group" style={{ background: '#f3f8f5', padding: '12px', borderRadius: '8px', border: '1px solid #bed6c7', marginTop: '6px' }}>
                <label style={{ color: '#16483f' }}>Nama Guru Baru / Tamu / Pengganti</label>
                <input
                  type="text"
                  required
                  placeholder="Misal: Ustadz M. Syamsul Huda, S.Pd.I (Guru Tamu)"
                  value={customTeacherName}
                  onChange={(e) => setCustomTeacherName(e.target.value)}
                  autoFocus
                />
                <small style={{ color: '#27594e' }}>
                  Guru ini akan otomatis didaftarkan dan dapat langsung dijadwalkan.
                </small>
              </div>
            )}
            <div className="modal-note">
              <ShieldCheck size={16} />
              <span>Perubahan ditaruh ke draft. Validator deterministik langsung memeriksa bentrok dan kelengkapan.</span>
            </div>
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={() => setEditingSlot(null)}>Batal</button>
              <button className="button button-primary" type="submit"><Save size={15} /> Simpan Draft</button>
            </div>
          </form>
        </Modal>
        );
      })()}

      {/* Quick Validation Report Modal */}
      <QuickValidationModal
        state={workspace}
        report={report!}
        masterIssues={masterIssues}
        isOpen={quickValidationOpen}
        onClose={() => setQuickValidationOpen(false)}
        onNavigateToSlot={(classId) => {
          setSelectedClass(classId);
          navigate('schedule');
        }}
        onNavigateToScreen={(s) => navigate(s as ScreenId)}
        onRevalidate={() => {
          notify('Validasi jadwal selesai diperiksa.', 'info');
        }}
      />

      {/* PDF Export Modal */}
      <SchedulePdfExportModal
        state={workspace}
        selectedClassId={selectedClass}
        isOpen={pdfExportOpen}
        onClose={() => setPdfExportOpen(false)}
        onNotify={notify}
      />

      {/* Consolidated Entity Edit Modal (Every deletable entity is editable) */}
      <EntityEditModal
        isOpen={Boolean(entityModalTarget)}
        target={entityModalTarget}
        state={workspace}
        onClose={() => setEntityModalTarget(null)}
        onSaveClass={handleSaveClass}
        onSaveTeacher={handleSaveTeacher}
        onSaveSubject={handleSaveSubject}
        onSaveRequirement={handleSaveRequirementFromModal}
      />

      {/* V5 Command Palette (Ctrl + K) */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        state={workspace}
        onNavigate={(targetScreen) => {
          navigate(targetScreen);
        }}
        onLaunchPersuratan={launchPersuratan}
        onLaunchTeachingSk={() => handleLaunchTeachingSk(null)}
        onSelectTeacher={(tch) => {
          setInspectorTarget({ type: 'teacher', data: tch });
        }}
        onSelectClass={(clsId) => {
          setSelectedClass(clsId);
          navigate('schedule');
        }}
        onOpenValidation={() => setQuickValidationOpen(true)}
        onOpenTimeMachine={() => setIsTimeMachineOpen(true)}
        onOpenExportPdf={() => setPdfExportOpen(true)}
      />

      {/* V5 Time Machine Vault Drawer */}
      <TimeMachineDrawer
        isOpen={isTimeMachineOpen}
        onClose={() => setIsTimeMachineOpen(false)}
        currentState={workspace}
        onStateRestored={(newState) => {
          setWorkspace({ ...newState, dataMode: 'custom' });
        }}
        onNotify={notify}
      />

      {/* V5 Slide-Over Inspector Drawer */}
      <InspectorSlideDrawer
        isOpen={Boolean(inspectorTarget)}
        onClose={() => setInspectorTarget(null)}
        target={inspectorTarget}
        state={workspace}
        onSaveTeacher={(updatedTeacher) => {
          handleSaveTeacher(updatedTeacher, false);
          setInspectorTarget(null);
        }}
        onSaveClass={(updatedClass) => {
          handleSaveClass(updatedClass, false);
          setInspectorTarget(null);
        }}
        onSaveSubject={(updatedSubject) => {
          handleSaveSubject(updatedSubject, false);
          setInspectorTarget(null);
        }}
        onNotify={notify}
      />

      {/* Tahap 9: Teacher Assignments & Linked Correspondence Drawer */}
      <TeacherAssignmentDrawer
        isOpen={Boolean(teacherAssignmentTargetId)}
        teacher={
          teacherAssignmentTargetId
            ? workspace.teachers.find((t) => t.id === teacherAssignmentTargetId) ?? null
            : null
        }
        state={workspace}
        onClose={() => setTeacherAssignmentTargetId(null)}
        onUpdateState={(updater) => updateWorkspace(updater, true)}
        onLaunchPersuratan={launchPersuratan}
        onNotify={notify}
      />

      {/* Unsaved Settings / S03 Intake Changes Guard Modal */}
      {pendingNavScreen && (
        <Modal
          title="Perubahan Belum Disimpan"
          subtitle={
            screen === 'persuratan'
              ? persuratanDirtySource === 'studio'
                ? 'Document Studio (S04) memiliki suntingan naskah yang belum disimpan sebagai draft.'
                : 'Form Data Awal (S03) memiliki isian yang belum disimpan sebagai draft.'
              : 'Pengaturan workspace memiliki suntingan yang belum diterapkan.'
          }
          icon={AlertTriangle}
          onClose={() => setPendingNavScreen(null)}
        >
          <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--s5-ink-secondary)' }}>
              {screen === 'persuratan'
                ? persuratanDirtySource === 'studio'
                  ? `Anda hendak berpindah ke menu ${titleForScreen(pendingNavScreen)}. Kembali ke Document Studio (S04) untuk menyimpan naskah draft, atau abaikan perubahan tersebut.`
                  : `Anda hendak berpindah ke menu ${titleForScreen(pendingNavScreen)}. Kembali ke Form Data Awal untuk menyimpan draft, atau abaikan isian sementara tersebut.`
                : `Anda hendak berpindah ke menu ${titleForScreen(pendingNavScreen)}. Simpan perubahan pengaturan terlebih dahulu atau abaikan agar perubahan dikembalikan seperti semula.`}
            </p>
            <div className="modal-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setPendingNavScreen(null)}
              >
                {screen === 'persuratan'
                  ? persuratanDirtySource === 'studio'
                    ? 'Kembali ke Editor S04'
                    : 'Lanjutkan Mengisi Form'
                  : 'Tetap di Pengaturan'}
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => {
                  const target = pendingNavScreen;
                  setSettingsDirty(false);
                  setPersuratanDirty(false);
                  setPersuratanDirtySource(null);
                  setPendingNavScreen(null);
                  applyNavigation(target);
                }}
              >
                Abaikan Perubahan
              </button>
              {screen === 'settings' && (
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    const target = pendingNavScreen;
                    settingsSaveRef.current?.();
                    setSettingsDirty(false);
                    setPendingNavScreen(null);
                    applyNavigation(target);
                  }}
                >
                  <Save size={14} />
                  <span>Simpan &amp; Lanjutkan</span>
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Backup Restore Verification & Confirmation Modal */}
      {pendingBackupRestore && (
        <Modal
          title={
            pendingBackupRestore.result.verification === 'legacy_unverified'
              ? 'Peringatan: Backup Lama Tanpa Checksum SHA-256'
              : 'Konfirmasi Pemulihan Backup Terverifikasi SHA-256'
          }
          subtitle={`Berkas: ${pendingBackupRestore.fileName}`}
          icon={AlertTriangle}
          onClose={() => setPendingBackupRestore(null)}
        >
          <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background:
                  pendingBackupRestore.result.verification === 'legacy_unverified' ? '#FEF3C7' : '#ECFDF5',
                border: `1px solid ${
                  pendingBackupRestore.result.verification === 'legacy_unverified' ? '#F59E0B' : '#A7F3D0'
                }`,
                color:
                  pendingBackupRestore.result.verification === 'legacy_unverified' ? '#92400E' : '#065F46',
                fontSize: '12.5px',
                lineHeight: 1.5,
              }}
            >
              {pendingBackupRestore.result.verification === 'legacy_unverified'
                ? pendingBackupRestore.result.warnings[0]
                : 'Checksum SHA-256 cocok. Checksum memverifikasi keutuhan berkas dari kerusakan atau perubahan, bukan enkripsi maupun tanda tangan digital.'}
            </div>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--s5-ink-secondary)' }}>
              Data lokal saat ini akan diganti dengan cadangan berisi{' '}
              <strong>{pendingBackupRestore.result.state.classes.length} kelas</strong>,{' '}
              <strong>{pendingBackupRestore.result.state.teachers.length} guru</strong>,{' '}
              <strong>{pendingBackupRestore.result.state.subjects.length} mapel</strong>, dan{' '}
              <strong>{pendingBackupRestore.result.state.teacherAssignments?.length ?? 0} penugasan guru</strong>.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setPendingBackupRestore(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="button button-primary"
                onClick={confirmApplyBackupRestore}
              >
                {pendingBackupRestore.result.verification === 'legacy_unverified'
                  ? 'Tetap Pulihkan (Unverified)'
                  : 'Pulihkan Sekarang'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sovereign Haute Joaillerie Luxury Toast */}
      {toast && (
        <div className="s5-luxury-toast-container" role="status">
          <div key={`${toast.kind}-${toast.message}`} className={`s5-luxury-toast ${toast.kind}`}>
            <div className="s5-luxury-toast-icon">
              {toast.kind === 'success' ? (
                <CheckCircle2 size={16} />
              ) : toast.kind === 'error' ? (
                <XCircle size={16} />
              ) : toast.kind === 'warning' ? (
                <AlertTriangle size={16} />
              ) : (
                <Activity size={16} />
              )}
            </div>
            <span>{toast.message}</span>
            <button
              type="button"
              className="s5-luxury-toast-dismiss"
              onClick={() => setToast(null)}
              aria-label="Tutup notifikasi"
            >
              <X size={13} />
            </button>
            <div className="s5-luxury-toast-drain" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-emblem"><img src="/signal-mark.svg" alt="" /></div>
      <div className="loading-line" />
      <h1>SIGNAL</h1>
      <p>Menyiapkan ruang kerja madrasah Anda…</p>
    </div>
  );
}

function PageHeading({ kicker, title, description, actions }: { kicker: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="s5-page-header">
      <div>
        <div className="s5-page-kicker">{kicker}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <h1 className="s5-page-title">{title}</h1>
          {description && <InfoNotice text={description} />}
        </div>
        {description && <p className="s5-page-subtitle">{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </div>
  );
}

function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  onClick,
  disabled,
  type = 'button',
  className = '',
  title,
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger' | 'hero-ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  title?: string;
}) {
  const sizeClass = size === 'sm' ? 'button-sm' : size === 'lg' ? 'button-lg' : '';
  const iconSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;
  return (
    <button
      type={type}
      disabled={disabled}
      title={title}
      className={`button button-${variant} ${sizeClass} ${className}`.trim()}
      onClick={onClick}
    >
      {Icon && <Icon size={iconSize} className="btn-icon" />}
      <span className="btn-label">{children}</span>
    </button>
  );
}

function Card({ children, className = '', title, eyebrow, action }: { children: ReactNode; className?: string; title?: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <section className={`surface-card s5-card-luxury ${className}`}>
      {(title || eyebrow || action) && (
        <div className="card-heading">
          <div>
            {eyebrow && <div className="card-eyebrow">{eyebrow}</div>}
            {title && <h3>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function StatusPill({
  status,
  children,
  icon: CustomIcon,
  className = '',
}: {
  status: 'success' | 'warning' | 'danger' | 'neutral' | 'info';
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const Icon = CustomIcon || (
    status === 'success' ? CheckCircle2 :
    status === 'warning' ? AlertTriangle :
    status === 'danger' ? XCircle :
    status === 'info' ? Info :
    Activity
  );
  return (
    <span className={`status-pill status-${status} ${className}`.trim()} role="status">
      <Icon size={12} className="status-pill-icon" aria-hidden="true" />
      <span className="status-pill-text">{children}</span>
    </span>
  );
}

function EmptyState({ icon: Icon = CircleHelp, title, description, action }: { icon?: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={25} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

function Modal({ title, subtitle, icon: Icon, children, onClose }: { title: string; subtitle: string; icon: LucideIcon; children: ReactNode; onClose: () => void }) {
  return (
    <MotionModalDialog
      ariaLabel={title}
      onBackdropMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="modal-head">
        <div className="modal-title-icon"><Icon size={20} /></div>
        <div><h2>{title}</h2><p>{subtitle}</p></div>
        <button className="icon-button" onClick={onClose} aria-label="Tutup dialog"><X size={17} /></button>
      </div>
      {children}
    </MotionModalDialog>
  );
}

function TablePagination({
  totalItems,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  totalItems: number;
  page: number;
  pageSize: number;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}) {
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : pageSize === 0 ? 1 : (page - 1) * pageSize + 1;
  const to = pageSize === 0 ? totalItems : Math.min(page * pageSize, totalItems);

  return (
    <div className="table-pagination">
      <div className="pagination-left">
        <span>Menampilkan <strong>{from}–{to}</strong> dari <strong>{totalItems}</strong> baris</span>
        <div className="pagination-size-select">
          <span>Baris:</span>
          <select
            className="page-select"
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={0}>Semua</option>
          </select>
        </div>
      </div>
      <div className="pagination-right">
        <button
          className="page-btn"
          disabled={page <= 1 || pageSize === 0}
          onClick={() => onPageChange(page - 1)}
          title="Halaman sebelumnya"
        >
          ‹
        </button>
        <span style={{ fontSize: '11.5px', fontWeight: 600, padding: '0 6px' }}>
          Hal {page} / {totalPages}
        </span>
        <button
          className="page-btn"
          disabled={page >= totalPages || pageSize === 0}
          onClick={() => onPageChange(page + 1)}
          title="Halaman berikutnya"
        >
          ›
        </button>
      </div>
    </div>
  );
}

/**
 * SECTION B: BERANDA RINGKAS (OPERATOR CENTER)
 * SAKALA V2 Modern / SIGNAL Warm Ivory & Mocha Architectural Aesthetic
 */
export function OperatorOverviewScreen({
  state,
  report,
  masterIssues,
  readiness,
  occupiedSlots,
  totalWeeklyCapacity,
  onNavigate,
  onGenerate,
  isGenerating,
  onOpenPdfModal,
  onOpenValidationModal,
  onSelectClass,
  onLaunchPersuratan,
  onLaunchTeachingSk,
}: {
  state: AppState;
  report: ReturnType<typeof validateSchedule>;
  masterIssues: ValidationIssue[];
  readiness: number;
  occupiedSlots: number;
  totalWeeklyCapacity: number;
  onNavigate: (screen: ScreenId) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onOpenPdfModal: () => void;
  onOpenValidationModal: () => void;
  onSelectClass?: (classId: string) => void;
  onLaunchPersuratan?: (request: PersuratanLaunchRequest) => void;
  onLaunchTeachingSk?: () => void;
}) {
  const activeClasses = state.classes.filter((c) => c.isActive);
  const activeTeachers = state.teachers.filter((t) => t.isActive);
  const classCount = activeClasses.length;
  const teacherCount = activeTeachers.length;
  const totalErrors = masterIssues.filter((i) => i.severity === 'error').length + report.hardErrorCount;
  const capacityPercent = totalWeeklyCapacity > 0 ? Math.round((occupiedSlots / totalWeeklyCapacity) * 100) : 0;

  const missingReqClassCount = activeClasses.filter(
    (c) => !state.requirements.some((r) => r.classId === c.id),
  ).length;
  const allocationStepDone = classCount > 0 && missingReqClassCount === 0;
  const validationStepDone = totalErrors === 0 && occupiedSlots > 0;
  const scheduleEntries = state.draft ?? state.activeSchedule ?? [];
  const publishedReady = !state.draft && !!state.activeSchedule?.length;
  const avgTeacherJP = teacherCount > 0 ? (occupiedSlots / teacherCount).toFixed(1) : '0';

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayPresentCount = (state.attendance ?? []).filter(
    (a) => a.date === todayIso && a.status === 'HADIR',
  ).length;
  const todayRecordedCount = (state.attendance ?? []).filter((a) => a.date === todayIso).length;

  // Real Persuratan & Arsip summary metrics (zero fabricated numbers)
  const documents = state.documents ?? [];
  const draftDocsCount = documents.filter((d) => d.status === 'DRAFT' || d.status === 'IN_REVIEW').length;
  const finalDocsCount = documents.filter((d) => d.status === 'FINAL' || d.status === 'REVISED').length;
  const archivedDocsCount = documents.filter((d) => d.status === 'ARCHIVED').length;
  const customTemplatesCount = (state.customTemplates ?? []).filter((t) => t.status !== 'ARCHIVED').length;
  const attachmentsCount = (state.documentAttachments ?? []).length;
  const skBasis = getOfficialScheduleBasisStatus(state);
  const recentDocuments = [...documents]
    .sort((a, b) => (b.updatedAt || b.documentDate || '').localeCompare(a.updatedAt || a.documentDate || ''))
    .slice(0, 3);

  const openPersuratanView = (request: PersuratanLaunchRequest) => {
    if (onLaunchPersuratan) {
      onLaunchPersuratan(request);
    } else {
      onNavigate('persuratan');
    }
  };

  const openClassEditor = (classId: string) => {
    if (onSelectClass) onSelectClass(classId);
    else onNavigate('schedule');
  };

  return (
    <div className="overview-page-wrapper">
      {/* 1. GRAND ATELIER OPERATIONAL HERO WITH RADIAL READINESS DIAL */}
      <section className="hero" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', zIndex: 2, flex: '1 1 500px' }}>
          <div className="kicker">
            STATUS JADWAL · SEMESTER {state.settings.semester.toUpperCase()} {state.settings.academicYear}
          </div>
          <h3>
            {report.valid && occupiedSlots > 0
              ? 'Jadwal Siap Diperiksa & Diterbitkan'
              : totalErrors > 0
              ? `Terdapat ${totalErrors} Bentrok Jadwal Perlu Diperbaiki`
              : 'Lengkapi Alokasi JP & Susun Jadwal'}
          </h3>
          <p>
            {report.valid && occupiedSlots > 0
              ? `Seluruh aturan wajib terpenuhi (${occupiedSlots} JP teralokasi, 0 bentrok). Periksa matriks kelas atau cetak dokumen resmi.`
              : totalErrors > 0
              ? `Ditemukan pelanggaran aturan KBM atau bentrok guru. Tinjau daftar konflik sebelum menerbitkan jadwal.`
              : `Tetapkan kebutuhan JP per rombel terlebih dahulu, lalu jalankan penyusunan otomatis.`}
          </p>
          <div className="actions">
            {totalErrors > 0 ? (
              <>
                <button type="button" className="btn gold" onClick={() => onNavigate('validation')}>
                  <span>Periksa Konflik</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
                <button
                  type="button"
                  className="btn hero-ghost"
                  onClick={onGenerate}
                  disabled={isGenerating}
                >
                  <WandSparkles size={15} />
                  <span>{isGenerating ? 'Menyusun…' : 'Susun Ulang Otomatis'}</span>
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn gold" onClick={() => onNavigate('schedule')}>
                  <span>Buka Matriks Jadwal</span>
                  <span aria-hidden="true">&rarr;</span>
                </button>
                <button
                  type="button"
                  className="btn hero-ghost"
                  onClick={onOpenPdfModal}
                >
                  <FileText size={15} />
                  <span>Cetak Dokumen PDF</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sovereign Radial Readiness Dial */}
        <div className="s5-readiness-dial-wrap" style={{ position: 'relative', zIndex: 2 }}>
          <div style={{ position: 'relative', width: 92, height: 92, display: 'grid', placeItems: 'center' }}>
            <svg width="92" height="92" className="s5-dial-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" stroke="#CCD8D2" strokeWidth="9" fill="transparent" opacity="0.28" />
              <circle
                cx="50"
                cy="50"
                r="40"
                stroke={readiness >= 90 ? '#E5C378' : readiness >= 70 ? '#529E72' : '#E05D52'}
                strokeWidth="9"
                fill="transparent"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (Math.max(0, Math.min(100, readiness)) / 100) * 251.2}
                strokeLinecap="round"
                style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.16, 1, 0.3, 1)' }}
              />
            </svg>
            <div style={{ position: 'absolute', textAlign: 'center' }}>
              <span className="s5-tnum" style={{ fontSize: '20px', fontWeight: 700, color: '#FFFFFF', display: 'block', lineHeight: 1 }}>
                {readiness}%
              </span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: 'rgba(255,255,255,0.78)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                KESIAPAN
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#E5C378', letterSpacing: '0.06em' }}>
              AUDIT KBM DETERMINISTIK
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: '#FFFFFF' }}>
              {totalErrors === 0 ? 'Kepatuhan 100% Lolos' : `${totalErrors} Konflik Terdeteksi`}
            </div>
            <div className="s5-tnum" style={{ fontSize: '12px', color: 'rgba(255,255,255,0.82)' }}>
              {occupiedSlots} dari {totalWeeklyCapacity} JP · {classCount} rombel aktif
            </div>
          </div>
        </div>
      </section>

      {/* 2. 4-KPI JEWEL METRIC STRIP */}
      <div className="stats">
        <KpiMotionCard
          className="stat stat-card"
          index={0}
          onClick={() => onNavigate('master')}
          style={{ cursor: 'pointer', '--accent': '#B39A68' } as React.CSSProperties}
        >
          <div className="label">ROMBEL AKTIF</div>
          <div className="value s5-tnum">
            <KpiAnimatedNumber value={classCount} />
          </div>
          <div className="foot">Seluruh kelas terdaftar</div>
        </KpiMotionCard>

        <KpiMotionCard
          className="stat stat-card"
          index={1}
          onClick={() => onNavigate('schedule')}
          style={{ cursor: 'pointer', '--accent': '#2D8066' } as React.CSSProperties}
        >
          <div className="label">ALOKASI KBM</div>
          <div className="value s5-tnum">
            <KpiAnimatedNumber value={capacityPercent} suffix="%" />
          </div>
          <div className="foot">{occupiedSlots} / {totalWeeklyCapacity} JP terjadwal</div>
        </KpiMotionCard>

        <KpiMotionCard
          className="stat stat-card"
          index={2}
          onClick={() => onOpenValidationModal()}
          style={{ cursor: 'pointer', '--accent': '#334F70' } as React.CSSProperties}
        >
          <div className="label">KONFLIK KERAS</div>
          <div className="value s5-tnum">
            <KpiAnimatedNumber value={totalErrors} />
          </div>
          <div className="foot">{totalErrors === 0 ? 'Bebas bentrok aturan wajib' : 'Klik untuk tinjau bentrok'}</div>
        </KpiMotionCard>

        <KpiMotionCard
          className="stat stat-card"
          index={3}
          onClick={() => onNavigate('workload')}
          style={{ cursor: 'pointer', '--accent': '#927D98' } as React.CSSProperties}
        >
          <div className="label">DEWAN GURU AKTIF</div>
          <div className="value s5-tnum">
            <KpiAnimatedNumber value={teacherCount} />
          </div>
          <div className="foot">Rata-rata {avgTeacherJP} JP / guru</div>
        </KpiMotionCard>
      </div>

      {/* 3. UNIFIED FULL-WIDTH BENTO SPLIT: DIRECT-LAUNCH ROMBEL TABLE + OBSIDIAN WORKFLOW */}
      <div className="s5-overview-split">
        {/* Left: Consolidated Rombel Matrix & Operational Pulse */}
        <div className="panel s5-overview-rombel-panel">
          <div>
            <div className="panel-head" style={{ marginBottom: '14px' }}>
              <div>
                <div className="s5-panel-kicker">PELUNCURAN CEPAT &amp; PROGRESS ROMBEL</div>
                <div className="panel-title">Kesiapan Matriks per Kelas</div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Button variant="secondary" size="sm" icon={BookOpen} onClick={() => onNavigate('requirements')}>
                  Kebutuhan JP
                </Button>
                <Button variant="primary" size="sm" icon={CalendarDays} onClick={() => onNavigate('schedule')}>
                  Matriks Lengkap
                </Button>
              </div>
            </div>

            <div className="s5-rombel-table-wrap">
              <table className="s5-rombel-table">
                <thead>
                  <tr>
                    <th style={{ width: '44px' }}>#</th>
                    <th>KELAS &amp; TINGKAT</th>
                    <th>ALOKASI JP</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>AKSES LANGSUNG</th>
                  </tr>
                </thead>
                <tbody>
                  {activeClasses.map((cls, idx) => {
                    const reqs = state.requirements.filter((r) => r.classId === cls.id);
                    const totalReq = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
                    const classEntries = scheduleEntries.filter((e) => e.classId === cls.id);
                    const fillPct = totalReq > 0 ? Math.min(100, Math.round((classEntries.length / totalReq) * 100)) : 0;
                    const isComplete = totalReq > 0 && classEntries.length >= totalReq;

                    return (
                      <tr
                        key={cls.id}
                        onClick={() => openClassEditor(cls.id)}
                        title={`Klik untuk membuka jadwal Kelas ${cls.name}`}
                      >
                        <td className="s5-tnum" style={{ color: 'var(--s5-ink-tertiary)', fontWeight: 600 }}>
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td>
                          <div className="s5-rombel-name-cell">
                            <strong>Kelas {cls.name}</strong>
                            <span className="s5-rombel-level-meta">· Tingkat {cls.level}</span>
                          </div>
                        </td>
                        <td>
                          <div className="s5-jp-progress-cell">
                            <div className="s5-jp-meter-track" aria-hidden="true">
                              <div
                                className={`s5-jp-meter-fill ${isComplete ? 'is-done' : 'is-partial'}`}
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                            <span className="s5-tnum" style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--s5-ink-primary)', whiteSpace: 'nowrap' }}>
                              {classEntries.length} / {totalReq || '—'} JP
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`s5-status-inline ${isComplete ? 'is-good' : 'is-warn'}`}>
                            <span className="s5-status-dot-static" aria-hidden="true" />
                            {isComplete ? 'Lengkap' : totalReq === 0 ? 'Belum Dialokasi' : 'Perlu Cek'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="s5-row-launch-link">
                            Buka Jadwal <ArrowRight size={13} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Operational Cross-Core Quick Strip */}
          <div className="s5-pulse-footer">
            <button type="button" className="s5-pulse-item" onClick={() => onNavigate('attendance')}>
              <div>
                <small>Presensi Guru Hari Ini</small>
                <strong className="s5-tnum">
                  {todayRecordedCount > 0 ? `${todayPresentCount} / ${teacherCount} Hadir` : 'Belum dicatat hari ini'}
                </strong>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--s5-ink-tertiary)', flexShrink: 0 }} />
            </button>

            <button type="button" className="s5-pulse-item" onClick={() => onNavigate('workload')}>
              <div>
                <small>Distribusi Beban Guru</small>
                <strong className="s5-tnum">{avgTeacherJP} JP rata-rata</strong>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--s5-ink-tertiary)', flexShrink: 0 }} />
            </button>

            <button type="button" className="s5-pulse-item" onClick={() => onNavigate('history')}>
              <div>
                <small>Riwayat &amp; Snapshot</small>
                <strong className="s5-tnum">{state.history.length} versi tersimpan</strong>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--s5-ink-tertiary)', flexShrink: 0 }} />
            </button>
          </div>
        </div>

        {/* Right: Langkah Berikutnya (Fixed Obsidian-Emerald Atelier Card) */}
        <div className="panel dark s5-priority-panel">
          <div>
            <div className="panel-head" style={{ marginBottom: '14px' }}>
              <div>
                <div className="s5-panel-kicker">PANDUAN OPERASIONAL</div>
                <div className="panel-title">Langkah Berikutnya</div>
              </div>
              <span className="s5-priority-badge">3 TAHAP</span>
            </div>

            <div className="s5-priority-list">
              <button type="button" className="s5-priority-step" onClick={() => onNavigate('requirements')}>
                <span className={`s5-priority-num ${allocationStepDone ? 'is-done' : 'is-pending'}`}>
                  {allocationStepDone ? <Check size={14} /> : '01'}
                </span>
                <span className="s5-priority-copy">
                  <strong>Lengkapi Alokasi JP</strong>
                  <small>
                    {missingReqClassCount > 0
                      ? `${missingReqClassCount} rombel belum memiliki target JP`
                      : `Target ${classCount} rombel aktif sudah tercatat`}
                  </small>
                </span>
                <ChevronRight size={15} style={{ color: 'rgba(229, 195, 120, 0.75)', flexShrink: 0 }} />
              </button>

              <button type="button" className="s5-priority-step" onClick={() => onNavigate('validation')}>
                <span className={`s5-priority-num ${validationStepDone ? 'is-done' : 'is-pending'}`}>
                  {validationStepDone ? <Check size={14} /> : '02'}
                </span>
                <span className="s5-priority-copy">
                  <strong>Audit Validasi Aturan</strong>
                  <small>
                    {totalErrors === 0
                      ? 'Seluruh aturan wajib terpenuhi (0 bentrok)'
                      : `${totalErrors} pelanggaran wajib perlu diselesaikan`}
                  </small>
                </span>
                <ChevronRight size={15} style={{ color: 'rgba(229, 195, 120, 0.75)', flexShrink: 0 }} />
              </button>

              <button type="button" className="s5-priority-step" onClick={onOpenPdfModal}>
                <span className={`s5-priority-num ${publishedReady ? 'is-done' : 'is-pending'}`}>
                  {publishedReady ? <Check size={14} /> : '03'}
                </span>
                <span className="s5-priority-copy">
                  <strong>Terbitkan &amp; Cetak Resmi</strong>
                  <small>
                    {publishedReady ? 'Jadwal aktif siap diunduh ke PDF' : 'Terbitkan draft & ekspor PDF madrasah'}
                  </small>
                </span>
                <ChevronRight size={15} style={{ color: 'rgba(229, 195, 120, 0.75)', flexShrink: 0 }} />
              </button>
            </div>
          </div>

          <div className="s5-priority-actions">
            <button type="button" className="s5-btn-obsidian-gold" onClick={() => onNavigate('generator')}>
              <WandSparkles size={15} />
              Buka Generator Jadwal &rarr;
            </button>
            <button type="button" className="s5-btn-obsidian-ghost" onClick={() => onNavigate('validation')}>
              <ShieldCheck size={15} />
              Tinjau Validasi &amp; Konflik
            </button>
          </div>
        </div>
      </div>

      {/* 4. PANEL RINGKASAN BERANDA: TINDAKAN ADMINISTRASI & PERSURATAN */}
      <section
        className="panel s5-admin-persuratan-panel"
        aria-label="Ringkasan Persuratan dan Arsip Madrasah"
      >
        <div className="s5-admin-persuratan-head">
          <div>
            <div className="s5-panel-kicker">ADMINISTRASI &amp; PERSURATAN MADRASAH</div>
            <div className="panel-title">Ringkasan Persuratan &amp; Arsip</div>
          </div>
          <div className="s5-admin-persuratan-actions">
            <Button
              variant="secondary"
              size="sm"
              icon={SlidersHorizontal}
              onClick={() => openPersuratanView({ view: 'template-manager', nonce: Date.now() })}
            >
              Kelola Template
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Archive}
              onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
            >
              Pusat Persuratan &amp; Arsip
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => openPersuratanView({ view: 'templates', nonce: Date.now() })}
            >
              Buat Surat Baru
            </Button>
          </div>
        </div>

        <div className="s5-admin-persuratan-metrics">
          <button
            type="button"
            className="s5-admin-metric-card"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <span className="s5-admin-metric-label">Draft Aktif</span>
            <span className="s5-admin-metric-value s5-tnum">{draftDocsCount}</span>
            <span className="s5-admin-metric-sub">
              {draftDocsCount > 0 ? 'Siap dilanjutkan di Document Studio' : 'Belum ada draft berjalan'}
            </span>
          </button>

          <button
            type="button"
            className="s5-admin-metric-card"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <span className="s5-admin-metric-label">Dokumen Final</span>
            <span className="s5-admin-metric-value s5-tnum">{finalDocsCount}</span>
            <span className="s5-admin-metric-sub">
              {finalDocsCount > 0 ? 'Bernomor resmi & snapshot terkunci' : 'Belum ada dokumen disahkan'}
            </span>
          </button>

          <button
            type="button"
            className="s5-admin-metric-card"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <span className="s5-admin-metric-label">Arsip &amp; Lampiran</span>
            <span className="s5-admin-metric-value s5-tnum">{archivedDocsCount}</span>
            <span className="s5-admin-metric-sub s5-tnum">
              {attachmentsCount} lampiran terverifikasi tersimpan
            </span>
          </button>

          <button
            type="button"
            className="s5-admin-metric-card"
            onClick={() => openPersuratanView({ view: 'template-manager', nonce: Date.now() })}
          >
            <span className="s5-admin-metric-label">Template Madrasah</span>
            <span className="s5-admin-metric-value s5-tnum">{customTemplatesCount}</span>
            <span className="s5-admin-metric-sub">
              + 30 template resmi bawaan SIGNAL
            </span>
          </button>
        </div>

        {/* Status Kesiapan SK Pembagian Tugas Mengajar (Berdasarkan ScheduleVersion Resmi) */}
        <div className={`s5-admin-sk-strip ${skBasis.allowed ? '' : 'is-locked'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {skBasis.allowed ? (
              <Award size={18} color="#124037" aria-hidden="true" style={{ flexShrink: 0 }} />
            ) : (
              <LockKeyhole size={18} color="#8E7035" aria-hidden="true" style={{ flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B2923' }}>
                SK Pembagian Tugas Mengajar (SYS-TPL-03)
              </div>
              <div style={{ fontSize: '12px', color: '#4B635D' }}>
                {skBasis.allowed
                  ? `Sumber resmi aktif: ${skBasis.selectedVersion?.version.label ?? skBasis.selectedVersion?.version.id} · ${skBasis.validVersionsCount} versi jadwal terverifikasi.`
                  : skBasis.blockedReason ?? 'Terbitkan dan verifikasi jadwal terlebih dahulu agar SK Mengajar bersumber dari data resmi.'}
              </div>
            </div>
          </div>
          {skBasis.allowed ? (
            <Button
              variant="secondary"
              size="sm"
              icon={FileCheck2}
              onClick={() => {
                if (onLaunchTeachingSk) {
                  onLaunchTeachingSk();
                } else {
                  openPersuratanView({ view: 'templates', nonce: Date.now() });
                }
              }}
            >
              Buat SK Mengajar
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={CalendarDays}
              onClick={() => onNavigate('schedule')}
            >
              Terbitkan Jadwal
            </Button>
          )}
        </div>

        {/* Daftar Dokumen Terbaru (Real Data Only) */}
        {recentDocuments.length > 0 ? (
          <div className="s5-admin-recent-list">
            {recentDocuments.map((doc) => {
              const isDraft = doc.status === 'DRAFT' && Boolean(doc.intakeDraftId);
              return (
                <button
                  key={doc.id}
                  type="button"
                  className="s5-admin-recent-row"
                  onClick={() => {
                    if (isDraft && doc.intakeDraftId) {
                      openPersuratanView({
                        view: 'studio',
                        draftId: doc.intakeDraftId,
                        documentId: doc.id,
                        templateId: doc.templateId ?? null,
                        nonce: Date.now(),
                      });
                    } else {
                      openPersuratanView({
                        view: 'detail',
                        documentId: doc.id,
                        versionId: doc.currentVersionId ?? null,
                        nonce: Date.now(),
                      });
                    }
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#0B2923',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {doc.title}
                    </div>
                    <div
                      className="s5-tnum"
                      style={{
                        fontSize: '11.5px',
                        color: '#4B635D',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {doc.documentNumber ?? 'Draft Belum Bernomor'} · {doc.status}
                    </div>
                  </div>
                  <ArrowRight size={14} color="#4B635D" aria-hidden="true" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        ) : (
          <div
            style={{
              fontSize: '12.5px',
              color: '#4B635D',
              padding: '8px 12px',
              borderRadius: '10px',
              background: '#F9FBF9',
              border: '0.75px dashed #CDD9D3',
            }}
          >
            Belum ada dokumen persuratan tersimpan pada workspace ini. Klik <strong>Buat Surat Baru</strong> untuk memilih dari 30 template resmi madrasah.
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * SCHEDULE SCREEN (WITH DRAG & DROP AND BUTTONS)
 */
function ScheduleScreen({
  state,
  selectedClass,
  onSelectClass,
  onEditSlot,
  onClearSlot,
  onAssignSlot,
  onDropSlot,
  onGenerate,
  isGenerating,
  onPublish,
  onExportCSV,
  onOpenPdfModal,
  onOpenValidationModal,
  onLaunchTeachingSk,
  onNavigate,
  report,
  lastMove,
  onUndoMove,
}: {
  state: AppState;
  selectedClass: string;
  onSelectClass: (value: string) => void;
  onEditSlot: (classId: string, day: Day, jpNo: number) => void;
  onClearSlot?: (classId: string, day: Day, jpNo: number) => void;
  onAssignSlot?: (classId: string, day: Day, jpNo: number, subjectId: string, teacherId: string) => void;
  onDropSlot: (source: { classId: string; day: Day; jpNo: number }, target: { day: Day; jpNo: number }) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onPublish: () => void;
  onExportCSV: () => void;
  onOpenPdfModal: () => void;
  onOpenValidationModal: () => void;
  onLaunchTeachingSk?: (scheduleVersionId?: string | null) => void;
  onNavigate: (screen: ScreenId) => void;
  report: ReturnType<typeof validateSchedule>;
  lastMove: { entries: ScheduleEntry[]; description: string } | null;
  onUndoMove: () => void;
}) {
  const [draggedSlot, setDraggedSlot] = useState<{ classId: string; day: Day; jpNo: number } | null>(null);
  const [draggedUnplaced, setDraggedUnplaced] = useState<{ subjectId: string; teacherId: string } | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ classId?: string; day: Day; jpNo: number } | null>(null);
  const [hoveredCoordinate, setHoveredCoordinate] = useState<{ day: Day; jpNo: number } | null>(null);
  const [cellMenu, setCellMenu] = useState<{ classId: string; day: Day; jpNo: number; x: number; y: number } | null>(null);

  // View mode switcher: 'all' (Matriks Seluruh Kelas) vs 'single' (Editor Per-Kelas)
  const [viewMode, setViewMode] = useState<'all' | 'single'>('all');
  const [filterTeacherId, setFilterTeacherId] = useState<string>('');
  const [filterSubjectId, setFilterSubjectId] = useState<string>('');
  const [colorizeCells, setColorizeCells] = useState<boolean>(true);
  const [compactLabels, setCompactLabels] = useState<boolean>(true);
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterRombelRow, setFilterRombelRow] = useState<string>('all');
  const [density, setDensity] = useState<'compact' | 'standard' | 'comfortable'>(() => {
    try {
      const saved = localStorage.getItem('signal_schedule_density');
      if (saved === 'compact' || saved === 'standard' || saved === 'comfortable') return saved;
    } catch {}
    return 'standard';
  });

  const handleDensityChange = (d: 'compact' | 'standard' | 'comfortable') => {
    setDensity(d);
    try {
      localStorage.setItem('signal_schedule_density', d);
    } catch {}
  };

  // State for consolidated toolbars (Fase 1: Decluttering)
  const [exportMenuOpen, setExportMenuOpen] = useState<boolean>(false);
  const [viewOptionsOpen, setViewOptionsOpen] = useState<boolean>(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const viewOptionsRef = useRef<HTMLDivElement>(null);

  // Close dropdown menus on click outside
  useEffect(() => {
    if (!exportMenuOpen && !viewOptionsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target as Node)) {
        setViewOptionsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [exportMenuOpen, viewOptionsOpen]);

  // Close context menu on outside click or scroll
  useEffect(() => {
    if (!cellMenu) return;
    const handleClose = () => setCellMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('scroll', handleClose, true);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('scroll', handleClose, true);
    };
  }, [cellMenu]);

  // Live Conflict HUD & Pre-drop Validation Status
  const getDropPreviewStatus = useCallback((
    targetClassId: string,
    targetDay: Day,
    targetJpNo: number,
  ): { status: 'safe' | 'conflict' | 'swap' | 'blocked'; message: string } => {
    const currentList = state.draft ?? state.activeSchedule ?? [];

    const validSlot = state.slots.find(
      (s) => s.day === targetDay && s.kind === 'TEACHING' && s.active && s.jpNo === targetJpNo,
    );
    if (!validSlot) {
      return { status: 'blocked', message: 'Bukan jam KBM aktif (Terkunci)' };
    }

    if (draggedUnplaced) {
      const clash = currentList.find(
        (e) =>
          e.day === targetDay &&
          e.jpNo === targetJpNo &&
          e.teacherId === draggedUnplaced.teacherId &&
          e.classId !== targetClassId,
      );
      if (clash) {
        const clsName = getClass(state, clash.classId)?.name || clash.classId;
        const tch = getTeacher(state, draggedUnplaced.teacherId)?.name || 'Guru';
        return { status: 'conflict', message: `⚠️ Bentrok: ${tch} di Kelas ${clsName}` };
      }
      const targetEntry = currentList.find(
        (e) => e.classId === targetClassId && e.day === targetDay && e.jpNo === targetJpNo,
      );
      if (targetEntry) {
        return { status: 'swap', message: 'Gantikan slot terisi' };
      }
      return { status: 'safe', message: '✓ Bebas bentrok (Siap ditempatkan)' };
    }

    if (!draggedSlot) return { status: 'safe', message: '' };

    if (draggedSlot.classId === targetClassId && draggedSlot.day === targetDay && draggedSlot.jpNo === targetJpNo) {
      return { status: 'blocked', message: 'Posisi saat ini' };
    }

    const sourceEntry = currentList.find(
      (e) =>
        e.classId === draggedSlot.classId &&
        e.day === draggedSlot.day &&
        e.jpNo === draggedSlot.jpNo,
    );
    if (!sourceEntry) return { status: 'blocked', message: 'Slot sumber kosong' };

    const teacherClash = currentList.find(
      (e) =>
        e.day === targetDay &&
        e.jpNo === targetJpNo &&
        e.teacherId === sourceEntry.teacherId &&
        e.classId !== targetClassId,
    );
    if (teacherClash) {
      const clashClass = getClass(state, teacherClash.classId)?.name || teacherClash.classId;
      const tch = getTeacher(state, sourceEntry.teacherId)?.name || 'Guru';
      return { status: 'conflict', message: `⚠️ Bentrok: ${tch} di Kelas ${clashClass}` };
    }

    const targetEntry = currentList.find(
      (e) => e.classId === targetClassId && e.day === targetDay && e.jpNo === targetJpNo,
    );
    if (targetEntry) {
      const reverseClash = currentList.find(
        (e) =>
          e.day === draggedSlot.day &&
          e.jpNo === draggedSlot.jpNo &&
          e.teacherId === targetEntry.teacherId &&
          e.classId !== targetClassId,
      );
      if (reverseClash) {
        const revClass = getClass(state, reverseClash.classId)?.name || reverseClash.classId;
        const targetTch = getTeacher(state, targetEntry.teacherId)?.name || 'Guru';
        return {
          status: 'conflict',
          message: `⚠️ Bentrok: ${targetTch} di Kelas ${revClass}`,
        };
      }
      const targetSub = getSubject(state, targetEntry.subjectId)?.code || 'Mapel';
      return { status: 'swap', message: `⇄ Siap ditukar dengan [${targetSub}]` };
    }

    return { status: 'safe', message: '✓ Bebas bentrok (Siap dipindahkan)' };
  }, [state, draggedSlot, draggedUnplaced]);

  // Unplaced requirements for the active class in single-class mode
  const unplacedList = useMemo(() => {
    if (!selectedClass) return [];
    const currentList = state.draft ?? state.activeSchedule ?? [];
    const classReqs = state.requirements.filter((r) => r.classId === selectedClass);
    return classReqs
      .map((r) => {
        const allocatedCount = currentList.filter(
          (e) => e.classId === selectedClass && e.subjectId === r.subjectId,
        ).length;
        const remaining = Math.max(0, r.requiredJP - allocatedCount);
        const subject = getSubject(state, r.subjectId);
        const teacher = getTeacher(state, r.teacherId);
        return {
          requirementId: r.id,
          subjectId: r.subjectId,
          teacherId: r.teacherId,
          subjectName: subject?.name || 'Mapel',
          subjectCode: subject?.code || 'MAPEL',
          subjectColor: subject?.color || '#24635e',
          teacherName: teacher?.name || 'Guru',
          teacherCode: teacher?.code || '—',
          requiredJP: r.requiredJP,
          allocatedCount,
          remaining,
        };
      })
      .filter((item) => item.remaining > 0);
  }, [state, selectedClass]);

  const hasEntries = !!(state.draft?.length || state.activeSchedule?.length);
  const activeDays = state.settings.activeDays;
  const timelineRows = useMemo(
    () => getTimelineRows(state.slots, state.settings.teachingPeriodsPerDay),
    [state.slots, state.settings.teachingPeriodsPerDay],
  );
  const published = !state.draft && !!state.activeSchedule?.length;
  const activeClasses = useMemo(() => state.classes.filter((c) => c.isActive), [state.classes]);
  const activeTeachers = useMemo(() => state.teachers.filter((t) => t.isActive), [state.teachers]);

  const scheduleEntries = state.draft ?? state.activeSchedule ?? [];
  const periodMinutes = state.settings.periodMinutes ?? 40;
  const totalAllocatedJp = scheduleEntries.length;
  const totalAstroHours = ((totalAllocatedJp * periodMinutes) / 60).toFixed(1);
  const targetRequiredJp = state.requirements.reduce((sum, r) => sum + r.requiredJP, 0);

  // Group classes by section into rows (Baris 1 - Kelompok A: VII-A, VIII-A, IX-A; Baris 2 - Kelompok B: VII-B, VIII-B, IX-B)
  const rombelRows = useMemo(() => groupClassesForMasterMatrix(activeClasses), [activeClasses]);
  const uniqueLevels = useMemo(
    () => Array.from(new Set(activeClasses.map((c) => c.level).filter(Boolean))).sort(),
    [activeClasses],
  );
  const visibleRombelRows = useMemo(() => {
    return rombelRows
      .filter((row) => filterRombelRow === 'all' || row.sectionKey === filterRombelRow)
      .map((row) => ({
        ...row,
        classes: row.classes.filter((cls) => filterLevel === 'all' || cls.level === filterLevel),
      }))
      .filter((row) => row.classes.length > 0);
  }, [rombelRows, filterRombelRow, filterLevel]);

  return (
    <>
      <PageHeading
        kicker="SCHEDULE WORKSPACE"
        title="Jadwal Pelajaran"
        description="Tinjau matriks jadwal seluruh madrasah sekaligus atau kelola detail alokasi per kelas dengan validator deterministik."
        actions={
          <div className="page-heading-actions">
            {lastMove && (
              <Button variant="secondary" icon={Undo2} onClick={onUndoMove} title="Batalkan perpindahan terakhir">
                Urungkan
              </Button>
            )}
            {/* Consolidated Ekspor Dropdown (Fase 1) */}
            <div style={{ position: 'relative' }} ref={exportMenuRef}>
              <Button
                variant="secondary"
                icon={Download}
                onClick={() => setExportMenuOpen((v) => !v)}
                title="Opsi ekspor dokumen jadwal (PDF & CSV)"
              >
                Ekspor <ChevronDown size={14} style={{ marginLeft: 2, transform: exportMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </Button>
              <MotionPopover isOpen={exportMenuOpen} className="schedule-export-menu-dropdown">
                <button
                  type="button"
                  className="export-dropdown-item"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onOpenPdfModal();
                  }}
                >
                  <FileText size={16} style={{ color: '#166534', flexShrink: 0 }} />
                  <div>
                    <div className="export-item-title">Cetak &amp; Ekspor PDF</div>
                    <div className="export-item-desc">Jadwal Induk, Semua Kelas A4, Per Kelas &amp; Per Guru</div>
                  </div>
                </button>
                <button
                  type="button"
                  className="export-dropdown-item"
                  onClick={() => {
                    setExportMenuOpen(false);
                    onExportCSV();
                  }}
                >
                  <FileSpreadsheet size={16} style={{ color: '#0f766e', flexShrink: 0 }} />
                  <div>
                    <div className="export-item-title">Unduh Data CSV</div>
                    <div className="export-item-desc">Format spreadsheet (.csv) siap olah</div>
                  </div>
                </button>
              </MotionPopover>
            </div>
            {onLaunchTeachingSk && (() => {
              const skBasis = getOfficialScheduleBasisStatus(state);
              return (
                <Button
                  variant="secondary"
                  icon={FileCheck2}
                  disabled={!skBasis.allowed}
                  onClick={() => onLaunchTeachingSk(skBasis.selectedVersion?.version.id ?? null)}
                  title={
                    skBasis.allowed && skBasis.selectedVersion
                      ? `Buat SK Pembagian Tugas Mengajar dari ScheduleVersion v${skBasis.selectedVersion.version.version}`
                      : skBasis.blockedReason ?? 'Terbitkan jadwal resmi terlebih dahulu sebelum membuat SK.'
                  }
                >
                  Buat SK Mengajar
                </Button>
              );
            })()}
            <Button icon={WandSparkles} onClick={onGenerate} disabled={isGenerating}>
              {isGenerating ? 'Menyusun…' : 'Generate Jadwal'}
            </Button>
          </div>
        }
      />

      {/* Main Mode Switcher & Consolidated Toolbar (Fase 1) */}
      <div className="toolbar-card" style={{ flexWrap: 'wrap', gap: '12px' }}>
        {/* View Switcher Segmented Control */}
        <div className="schedule-view-switcher">
          <button
            type="button"
            className={`view-switch-btn ${viewMode === 'all' ? 'active' : ''}`}
            onClick={() => setViewMode('all')}
            title="Tampilan matriks terpadu semua kelas dalam satu layar"
          >
            <LayoutGrid size={15} />
            <span>Matriks Seluruh Kelas</span>
          </button>
          <button
            type="button"
            className={`view-switch-btn ${viewMode === 'single' ? 'active' : ''}`}
            onClick={() => setViewMode('single')}
            title="Tampilan detail per kelas dengan drag-and-drop"
          >
            <GraduationCap size={15} />
            <span>Editor Per-Kelas</span>
          </button>
        </div>

        {viewMode === 'single' && (
          <>
            <div className="toolbar-divider" />
            <div className="class-selector-wrap">
              <label htmlFor="schedule-class">PILIH KELAS</label>
              <div className="select-with-icon">
                <GraduationCap size={16} />
                <select
                  id="schedule-class"
                  value={selectedClass}
                  onChange={(e) => onSelectClass(e.target.value)}
                >
                  <option value="">Pilih kelas</option>
                  {activeClasses.map((item) => (
                    <option key={item.id} value={item.id}>
                      Kelas {item.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>
            </div>
          </>
        )}

        <div className="toolbar-divider" />

        {/* Interactive Clickable Status Badge (Eliminates redundant "Periksa Jadwal" button) */}
        <button
          type="button"
          className={`interactive-status-badge ${
            state.draft ? (report.valid ? 'is-valid' : 'is-warning') : published ? 'is-published' : 'is-neutral'
          }`}
          onClick={onOpenValidationModal}
          title="Klik untuk membuka audit & detail validasi bentrok jadwal"
        >
          <ShieldCheck size={14} className="status-badge-icon" />
          <span className="status-badge-text">
            {state.draft
              ? report.valid
                ? 'Draft Valid · Bebas Bentrok'
                : `${report.hardErrorCount} Bentrok Perlu Diperbaiki`
              : published
              ? `Published · v${state.history[0]?.version ?? '1'}`
              : 'Belum Dibuat'}
          </span>
          <span className="status-badge-action">Audit &amp; Detail ↗</span>
        </button>

        {/* Consolidated Right-Side Toolbar Actions: Tampilan + Terbitkan Jadwal */}
        <div className="schedule-toolbar-actions">
          {/* Consolidated Tampilan & Kerapatan Popover */}
          <div style={{ position: 'relative' }} ref={viewOptionsRef}>
            <button
              type="button"
              className={`button button-secondary ${viewOptionsOpen ? 'is-active' : ''}`}
              onClick={() => setViewOptionsOpen((v) => !v)}
              title="Sesuaikan kerapatan baris, zoom, dan warna jadwal"
            >
              <SlidersHorizontal size={14} />
              <span>Tampilan</span>
              <ChevronDown
                size={13}
                style={{
                  transform: viewOptionsOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                }}
              />
            </button>

            <MotionPopover isOpen={viewOptionsOpen} className="view-options-popover">
              <div>
                <div className="view-popover-title">Kerapatan Baris Tabel</div>
                <div
                  className="density-button-group"
                  style={{
                    display: 'flex',
                    width: '100%',
                    background: '#edf3ef',
                    padding: '3px',
                    borderRadius: '8px',
                    gap: '3px',
                  }}
                >
                  <button
                    type="button"
                    className={`density-btn ${density === 'compact' ? 'active' : ''}`}
                    style={{ flex: 1, textAlign: 'center' }}
                    onClick={() => handleDensityChange('compact')}
                    title="Kompak: hemat ruang untuk layar kecil atau banyak rombel"
                  >
                    Kompak
                  </button>
                  <button
                    type="button"
                    className={`density-btn ${density === 'standard' ? 'active' : ''}`}
                    style={{ flex: 1, textAlign: 'center' }}
                    onClick={() => handleDensityChange('standard')}
                    title="Standar: kerapatan proporsional default"
                  >
                    Standar
                  </button>
                  <button
                    type="button"
                    className={`density-btn ${density === 'comfortable' ? 'active' : ''}`}
                    style={{ flex: 1, textAlign: 'center' }}
                    onClick={() => handleDensityChange('comfortable')}
                    title="Lega: ruang baca longgar dan santai"
                  >
                    Lega
                  </button>
                </div>
              </div>

              {viewMode === 'all' && (
                <>
                  <div className="view-popover-divider" />
                  <div>
                    <div className="view-popover-title">Skala Zoom Matriks</div>
                    <div
                      className="matrix-zoom-controls"
                      style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}
                    >
                      <button
                        type="button"
                        className="matrix-zoom-btn"
                        style={{ flex: 1 }}
                        onClick={() => setZoomLevel((z) => Math.max(50, z - 10))}
                        title="Perkecil (-10%)"
                      >
                        <ZoomOut size={13} />
                      </button>
                      <button
                        type="button"
                        className="matrix-zoom-btn zoom-text"
                        style={{ flex: 1.5 }}
                        onClick={() => setZoomLevel(100)}
                        title="Reset ke 100%"
                      >
                        {zoomLevel}%
                      </button>
                      <button
                        type="button"
                        className="matrix-zoom-btn"
                        style={{ flex: 1 }}
                        onClick={() => setZoomLevel((z) => Math.min(150, z + 10))}
                        title="Perbesar (+10%)"
                      >
                        <ZoomIn size={13} />
                      </button>
                      <button
                        type="button"
                        className="matrix-zoom-btn"
                        style={{ flex: 1 }}
                        onClick={() => setZoomLevel(100)}
                        title="Reset Zoom"
                      >
                        <RotateCcw size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="view-popover-divider" />
                  <div>
                    <div className="view-popover-title">Format Visual</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <label className="master-toggle-label">
                        <input
                          type="checkbox"
                          checked={colorizeCells}
                          onChange={(e) => setColorizeCells(e.target.checked)}
                        />
                        <span>Warnai latar sel mapel</span>
                      </label>
                      <label className="master-toggle-label">
                        <input
                          type="checkbox"
                          checked={compactLabels}
                          onChange={(e) => setCompactLabels(e.target.checked)}
                        />
                        <span>Singkatkan nama guru &amp; mapel</span>
                      </label>
                    </div>
                  </div>
                </>
              )}
            </MotionPopover>
          </div>

          <Button onClick={onPublish} disabled={!hasEntries || !report.valid}>
            <Check size={15} /> Terbitkan Jadwal
          </Button>
        </div>
      </div>

      <div className={`schedule-workspace density-${density}`}>
        {/* ========================================================================= */}
        {/* MODE 1: MATRIKS SELURUH KELAS TERPADU (MASTER TIMETABLE VIEW)             */}
        {/* ========================================================================= */}
        {viewMode === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Master Timetable Clean Filter Bar */}
          <div className="matrix-controls-bar">
            {/* Filter controls */}
            <div className="matrix-filter-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Filter size={13} style={{ color: '#52776d' }} />
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#31544d', letterSpacing: '0.04em' }}>
                  FILTER:
                </span>
              </div>

              {/* Tingkat filter */}
              <select
                className="master-filter-select"
                value={filterLevel}
                onChange={(e) => setFilterLevel(e.target.value)}
                title="Saring berdasarkan tingkatan kelas"
              >
                <option value="all">Semua Tingkat ({uniqueLevels.join(', ') || 'Semua'})</option>
                {uniqueLevels.map((lvl) => (
                  <option key={lvl} value={lvl}>
                    Tingkat {lvl}
                  </option>
                ))}
              </select>

              {/* Kelompok Rombel filter */}
              <select
                className="master-filter-select"
                value={filterRombelRow}
                onChange={(e) => setFilterRombelRow(e.target.value)}
                title="Saring kelompok rombel paralel"
              >
                <option value="all">Semua Kelompok ({rombelRows.length} Baris)</option>
                {rombelRows.map((r) => (
                  <option key={r.sectionKey} value={r.sectionKey}>
                    {r.label}
                  </option>
                ))}
              </select>

              {/* Teacher filter */}
              <select
                className="master-filter-select"
                value={filterTeacherId}
                onChange={(e) => setFilterTeacherId(e.target.value)}
                title="Sorot guru pada seluruh blok kelas"
              >
                <option value="">Semua Guru</option>
                {activeTeachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.code})
                  </option>
                ))}
              </select>

              {/* Subject filter */}
              <select
                className="master-filter-select"
                value={filterSubjectId}
                onChange={(e) => setFilterSubjectId(e.target.value)}
                title="Sorot mata pelajaran pada seluruh blok kelas"
              >
                <option value="">Semua Mapel</option>
                {state.subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>

              {(filterLevel !== 'all' || filterRombelRow !== 'all' || filterTeacherId || filterSubjectId) && (
                <button
                  type="button"
                  className="button button-sm matrix-reset-filter-btn"
                  onClick={() => {
                    setFilterLevel('all');
                    setFilterRombelRow('all');
                    setFilterTeacherId('');
                    setFilterSubjectId('');
                  }}
                >
                  <RotateCcw size={13} />
                  <span>Reset Filter</span>
                </button>
              )}
            </div>

            {/* Compact Metric Summary */}
            <div className="matrix-action-group">
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '4px 10px',
                  background: '#edf4f1',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#16483f',
                  fontWeight: 700,
                }}
              >
                <span>{activeClasses.length} Rombel</span>
                <span style={{ opacity: 0.35 }}>•</span>
                <span>
                  {totalAllocatedJp} / {targetRequiredJp > 0 ? targetRequiredJp : totalAllocatedJp} JP ({totalAstroHours} Jam)
                </span>
              </div>
            </div>
          </div>

          {/* Master Timetable Multi-Row Horizontal Track Workspace */}
          <div
            className="master-matrix-workspace"
            style={{
              transform: zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
              transformOrigin: 'top left',
              width: zoomLevel !== 100 ? `${(100 / (zoomLevel / 100)).toFixed(2)}%` : '100%',
            }}
          >
            {visibleRombelRows.length === 0 ? (
              <div className="surface-card" style={{ padding: '36px', textAlign: 'center', color: '#687a75' }}>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600 }}>
                  Tidak ada kelas yang sesuai dengan filter yang dipilih.
                </p>
                <button
                  type="button"
                  className="button button-quiet"
                  style={{ marginTop: '12px' }}
                  onClick={() => {
                    setFilterLevel('all');
                    setFilterRombelRow('all');
                  }}
                >
                  Tampilkan Semua Kelas
                </button>
              </div>
            ) : (
              visibleRombelRows.map((row) => (
                <div key={row.rowId} className="master-matrix-row-container">
                  {/* Row Header: Kelompok A, B, etc. */}
                  <div className="master-matrix-row-header">
                    <div className="row-title-area">
                      <span className="row-badge">PARALEL</span>
                      <h3 className="row-title">{row.label}</h3>
                      <span className="row-count">
                        ({row.classes.length} Kelas Berdampingan:{' '}
                        {row.classes.map((c) => c.name).join(' | ')})
                      </span>
                    </div>
                    <div className="row-legend-hint">
                      Senin &ndash; {activeDays[activeDays.length - 1]} &bull; Disusun horizontal per tingkat
                    </div>
                  </div>

                  {/* Horizontal Track of Complete Weekly Class Blocks */}
                  <div className="master-matrix-horizontal-track">
                    {row.classes.map((cls) => {
                      const classEntries = scheduleEntries.filter((e) => e.classId === cls.id);
                      const classReqJp = state.requirements
                        .filter((r) => r.classId === cls.id)
                        .reduce((sum, r) => sum + r.requiredJP, 0);

                      return (
                        <div key={cls.id} className="master-class-weekly-block">
                          {/* Class Block Header */}
                          <div className="master-class-block-header">
                            <div className="class-identity">
                              <h4 className="class-name">Kelas {cls.name}</h4>
                              <span className="class-level-tag">Tingkat {cls.level}</span>
                            </div>
                            <div className="class-stats">
                              <span className="jp-counter">
                                {classEntries.length} / {classReqJp > 0 ? classReqJp : classEntries.length} JP
                              </span>
                              <button
                                type="button"
                                className="editor-shortcut-btn"
                                onClick={() => {
                                  onSelectClass(cls.id);
                                  setViewMode('single');
                                }}
                                title={`Buka Kelas ${cls.name} di Editor Per-Kelas`}
                              >
                                <Edit2 size={11} /> Editor
                              </button>
                            </div>
                          </div>

                          {/* Complete Weekly Schedule Table for this Class */}
                          <table className="master-class-weekly-table">
                            <thead>
                              <tr>
                                <th className="col-time-th">JP / WAKTU</th>
                                {activeDays.map((day) => (
                                  <th
                                    key={day}
                                    className={hoveredCoordinate?.day === day ? 'ruler-col-active' : ''}
                                  >
                                    {day}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {timelineRows.map((tRow) => {
                                const timeStr = `${tRow.start}-${tRow.end}`;
                                if (!tRow.isKbm) {
                                  return (
                                    <tr key={`agenda-${tRow.order}`}>
                                      <th className="jp-row-header non-kbm">
                                        <strong>{tRow.defaultLabel}</strong>
                                        <small>{timeStr}</small>
                                      </th>
                                      {activeDays.map((day) => {
                                        const slotDef = state.slots.find(
                                          (s) => s.day === day && s.order === tRow.order,
                                        );
                                        const actType = (slotDef?.activityType || tRow.activityType || '').toLowerCase();
                                        const actClass = actType.includes('upacara')
                                          ? 'upacara'
                                          : actType.includes('religi') || actType.includes('sholat')
                                          ? 'religi'
                                          : actType.includes('istirahat')
                                          ? 'istirahat'
                                          : 'lainnya';
                                        const label = slotDef?.activityName || slotDef?.label || tRow.defaultLabel;
                                        return (
                                          <td key={day}>
                                            <div
                                              className={`master-non-kbm-slot ${actClass}`}
                                              title={`${label} (${day}, ${timeStr} WIB): Non-KBM / Terkunci`}
                                            >
                                              <LockKeyhole size={10} style={{ display: 'inline', marginRight: 3, verticalAlign: -1 }} />
                                              {label}
                                            </div>
                                          </td>
                                        );
                                      })}
                                    </tr>
                                  );
                                }

                                const jpNo = tRow.jpNo!;
                                return (
                                  <tr key={jpNo}>
                                    <th
                                      className={`jp-row-header ${hoveredCoordinate?.jpNo === jpNo ? 'ruler-row-active' : ''}`}
                                    >
                                      <strong>JP {String(jpNo).padStart(2, '0')}</strong>
                                      <small>{timeStr}</small>
                                    </th>

                                    {activeDays.map((day) => {
                                      const slotDef = state.slots.find(
                                        (s) => s.day === day && s.kind === 'TEACHING' && s.jpNo === jpNo,
                                      );
                                      const blocked = isSlotBlocked(slotDef);
                                      const isCrosshair =
                                        hoveredCoordinate?.day === day &&
                                        hoveredCoordinate?.jpNo === jpNo;
                                      const isOver =
                                        dragOverTarget?.classId === cls.id &&
                                        dragOverTarget?.day === day &&
                                        dragOverTarget?.jpNo === jpNo;
                                      const preview = isOver ? getDropPreviewStatus(cls.id, day, jpNo) : null;

                                      if (blocked) {
                                        const isOutOfKbm = !slotDef;
                                        const actType = (slotDef?.activityType || '').toLowerCase();
                                        const actClass = actType.includes('upacara')
                                          ? 'upacara'
                                          : actType.includes('religi') || actType.includes('sholat')
                                          ? 'religi'
                                          : actType.includes('istirahat')
                                          ? 'istirahat'
                                          : 'lainnya';

                                        return (
                                          <td
                                            key={day}
                                            className={isCrosshair ? 'ruler-crosshair-active' : ''}
                                            onMouseEnter={() => setHoveredCoordinate({ day, jpNo })}
                                            onMouseLeave={() => setHoveredCoordinate(null)}
                                          >
                                            <div
                                              className={`master-non-kbm-slot ${actClass} ${isOutOfKbm ? 'out-of-kbm' : ''}`}
                                              title={isOutOfKbm ? `Di Luar Jam KBM (${day}, JP ${jpNo})` : `${slotDef?.activityName || slotDef?.activityType} (${day}, ${slotDef?.start}-${slotDef?.end} WIB)`}
                                            >
                                              {isOutOfKbm ? 'Selesai' : (slotDef?.activityName || slotDef?.activityType || 'NON-KBM')}
                                            </div>
                                          </td>
                                        );
                                      }

                                      const entry = getEntry(state, cls.id, day, jpNo);

                                      if (!entry) {
                                        return (
                                          <td
                                            key={day}
                                            className={isCrosshair ? 'ruler-crosshair-active' : ''}
                                            style={{ position: 'relative' }}
                                            onMouseEnter={() => setHoveredCoordinate({ day, jpNo })}
                                            onMouseLeave={() => setHoveredCoordinate(null)}
                                            onDragOver={(e) => {
                                              if (draggedSlot?.classId === cls.id || draggedUnplaced) {
                                                e.preventDefault();
                                                setDragOverTarget({ classId: cls.id, day, jpNo });
                                              }
                                            }}
                                            onDragLeave={() => {
                                              if (dragOverTarget?.classId === cls.id && dragOverTarget?.day === day && dragOverTarget?.jpNo === jpNo) {
                                                setDragOverTarget(null);
                                              }
                                            }}
                                            onDrop={(e) => {
                                              e.preventDefault();
                                              setDragOverTarget(null);
                                              if (draggedSlot && draggedSlot.classId === cls.id) {
                                                onDropSlot(draggedSlot, { day, jpNo });
                                                setDraggedSlot(null);
                                              } else if (draggedUnplaced && onAssignSlot) {
                                                onAssignSlot(cls.id, day, jpNo, draggedUnplaced.subjectId, draggedUnplaced.teacherId);
                                                setDraggedUnplaced(null);
                                              }
                                            }}
                                          >
                                            {isOver && preview && (
                                              <div className={`drag-hud-overlay drag-hud-${preview.status}`}>
                                                <span className="drag-hud-badge">{preview.message}</span>
                                              </div>
                                            )}
                                            <button
                                              type="button"
                                              className="master-empty-slot"
                                              onClick={() => onEditSlot(cls.id, day, jpNo)}
                                              title={`Klik untuk mengisi jadwal Kelas ${cls.name} pada ${day}, JP ${jpNo}`}
                                            >
                                              <span>+ Isi</span>
                                            </button>
                                          </td>
                                        );
                                      }

                                      const subject = getSubject(state, entry.subjectId);
                                      const teacher = getTeacher(state, entry.teacherId);

                                      const isHighlighted =
                                        (filterTeacherId && entry.teacherId === filterTeacherId) ||
                                        (filterSubjectId && entry.subjectId === filterSubjectId);

                                      let cellBg = '#f5f9f6';
                                      let cellBorder = '#d7e2da';
                                      let cellText = '#173637';

                                      if (colorizeCells && subject?.color) {
                                        const { bg, text } = getPrintableCellColor(subject.color);
                                        cellBg = `rgb(${bg.join(',')})`;
                                        cellBorder = `rgb(${text.map((v) => Math.min(220, v + 80)).join(',')})`;
                                        cellText = `rgb(${text.join(',')})`;
                                      }

                                      const subjLabel = compactLabels
                                        ? compactSubjectName(subject?.name || '', subject?.code)
                                        : subject?.name || 'Mapel';

                                      const teacherLabel = compactLabels
                                        ? compactTeacherName(teacher?.name || '', teacher?.code)
                                        : teacher?.name || '—';

                                      return (
                                        <td
                                          key={day}
                                          className={isCrosshair ? 'ruler-crosshair-active' : ''}
                                          style={{ position: 'relative' }}
                                          onMouseEnter={() => setHoveredCoordinate({ day, jpNo })}
                                          onMouseLeave={() => setHoveredCoordinate(null)}
                                          onDragOver={(e) => {
                                            if (draggedSlot?.classId === cls.id || draggedUnplaced) {
                                              e.preventDefault();
                                              setDragOverTarget({ classId: cls.id, day, jpNo });
                                            }
                                          }}
                                          onDragLeave={() => {
                                            if (dragOverTarget?.classId === cls.id && dragOverTarget?.day === day && dragOverTarget?.jpNo === jpNo) {
                                              setDragOverTarget(null);
                                            }
                                          }}
                                          onDrop={(e) => {
                                            e.preventDefault();
                                            setDragOverTarget(null);
                                            if (draggedSlot && draggedSlot.classId === cls.id) {
                                              onDropSlot(draggedSlot, { day, jpNo });
                                              setDraggedSlot(null);
                                            } else if (draggedUnplaced && onAssignSlot) {
                                              onAssignSlot(cls.id, day, jpNo, draggedUnplaced.subjectId, draggedUnplaced.teacherId);
                                              setDraggedUnplaced(null);
                                            }
                                          }}
                                        >
                                          {isOver && preview && (
                                            <div className={`drag-hud-overlay drag-hud-${preview.status}`}>
                                              <span className="drag-hud-badge">{preview.message}</span>
                                            </div>
                                          )}
                                          <div
                                            role="button"
                                            tabIndex={0}
                                            draggable={true}
                                            onDragStart={() => {
                                              setDraggedSlot({ classId: cls.id, day, jpNo });
                                            }}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                onEditSlot(cls.id, day, jpNo);
                                              }
                                            }}
                                            className={`master-slot-btn ${isHighlighted ? 'is-highlighted' : ''}`}
                                            onClick={() => onEditSlot(cls.id, day, jpNo)}
                                            style={{
                                              background: cellBg,
                                              borderColor: isHighlighted ? '#bc945e' : cellBorder,
                                              color: cellText,
                                              position: 'relative',
                                            }}
                                            title={`${subject?.name || 'Mapel'} (${teacher?.name || 'Guru'})\nKelas ${cls.name} · ${day}, JP ${jpNo} (${timeStr})\nKlik untuk mengedit atau drag untuk memindahkan alokasi`}
                                          >
                                            <button
                                              type="button"
                                              className="quick-cell-trigger"
                                              title="Menu Cepat Slot"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                const rect = e.currentTarget.getBoundingClientRect();
                                                setCellMenu({
                                                  classId: cls.id,
                                                  day,
                                                  jpNo,
                                                  x: Math.min(window.innerWidth - 220, rect.left),
                                                  y: Math.min(window.innerHeight - 200, rect.bottom + 4),
                                                });
                                              }}
                                            >
                                              <MoreHorizontal size={11} />
                                            </button>
                                            <div className="master-slot-subject">{subjLabel}</div>
                                            <div className="master-slot-teacher">
                                              {teacher?.code && <span className="teacher-code-badge">{teacher.code}</span>}
                                              <span className="teacher-name-text">{teacherLabel}</span>
                                            </div>
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Master View Legend (Fase 2: Clean & Minimal) */}
          <div className="schedule-legend-row" style={{ marginTop: '6px' }}>
            <span>
              <i className="legend-dot dot-teal" /> KBM Terisi
            </span>
            <span>
              <i className="legend-dot dot-ivory" /> Slot Kosong
            </span>
            <span>
              <span
                style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  background: '#fef8e7',
                  border: '1px dashed #e6c884',
                  borderRadius: '2px',
                  verticalAlign: 'middle',
                  marginRight: '5px',
                }}
              />
              Non-KBM
            </span>
            <span className="legend-spacer" />
            <button className="text-link" onClick={onOpenValidationModal}>
              Laporan Validasi <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: EDITOR DETAIL PER-KELAS (DRAG & DROP ANTAR-SLOT)                  */}
      {/* ========================================================================= */}
      {viewMode === 'single' && (
        <>
          {!selectedClass ? (
            <EmptyState
              icon={GraduationCap}
              title="Pilih kelas untuk melihat jadwal"
              description="Pilih kelas melalui dropdown di atas atau tambahkan kelas baru pada Data Master."
              action={<Button onClick={() => onNavigate('master')}>Buka Data Master</Button>}
            />
          ) : (
            <>
              <div className="schedule-summary-row">
                <div className="schedule-selected-class">
                  <div className="class-monogram">{getClass(state, selectedClass)?.name.slice(0, 2)}</div>
                  <div>
                    <strong>Kelas {getClass(state, selectedClass)?.name}</strong>
                    <span>{state.settings.schoolName} · T.A. {state.settings.academicYear} ({state.settings.semester})</span>
                  </div>
                </div>
                <div className="schedule-summary-metric">
                  <span>Alokasi terisi</span>
                  <strong>
                    {(state.draft ?? state.activeSchedule ?? []).filter((e) => e.classId === selectedClass).length} <small>JP</small>
                  </strong>
                </div>
                <div className="schedule-summary-metric">
                  <span>Target Kebutuhan</span>
                  <strong>
                    {state.requirements.filter((item) => item.classId === selectedClass).reduce((sum, item) => sum + item.requiredJP, 0)} <small>JP</small>
                  </strong>
                </div>
                <div className="schedule-summary-metric">
                  <span>Kepatuhan JP</span>
                  {(() => {
                    const filled = (state.draft ?? state.activeSchedule ?? []).filter((e) => e.classId === selectedClass).length;
                    const target = state.requirements.filter((item) => item.classId === selectedClass).reduce((sum, item) => sum + item.requiredJP, 0);
                    const diff = filled - target;
                    return (
                      <strong style={{ color: diff === 0 ? '#1f6952' : '#b24c3d' }}>
                        {diff === 0 ? '100% Pas' : diff > 0 ? `+${diff} JP` : `${diff} JP`}
                      </strong>
                    );
                  })()}
                </div>
                <div className="schedule-summary-metric">
                  <span>Hari Aktif</span>
                  <strong>{activeDays.length} <small>hari</small></strong>
                </div>
              </div>

              {/* Interactive Drag-and-Drop Schedule Table */}
              <div className="schedule-table-wrap">
                <table className="schedule-table">
                  <thead>
                    <tr>
                      <th className="schedule-time-column">
                        <span>WAKTU</span>
                        <small>JP KBM</small>
                      </th>
                      {activeDays.map((day) => (
                        <th
                          key={day}
                          className={hoveredCoordinate?.day === day ? 'ruler-col-active' : ''}
                        >
                          <span>{day}</span>
                          <small>{day.slice(0, 3).toUpperCase()}</small>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {timelineRows.map((tRow) => {
                      if (!tRow.isKbm) {
                        return (
                          <tr key={`agenda-${tRow.order}`}>
                            <th
                              className="period-heading non-kbm-heading"
                              title={`Non-KBM: ${tRow.defaultLabel} (${tRow.start} – ${tRow.end} WIB)`}
                            >
                              <span style={{ fontSize: '10.5px', padding: '1px 6px', background: '#dcece3', color: '#114438', borderRadius: '4px', fontWeight: 700 }}>NON-KBM</span>
                              <small style={{ fontWeight: 600, color: '#1b564b', marginTop: '2px' }}>
                                {tRow.start} – {tRow.end}
                              </small>
                            </th>
                            {activeDays.map((day) => {
                              const slotDef = state.slots.find((s) => s.day === day && s.order === tRow.order);
                              const actType = (slotDef?.activityType || tRow.activityType || '').toUpperCase();
                              const label = slotDef?.activityName || slotDef?.label || tRow.defaultLabel;
                              const isUpacara = actType === 'UPACARA';
                              const isReligi = actType === 'RELIGI';

                              return (
                                <td key={`${day}-${tRow.order}`} className="non-kbm-cell-wrap">
                                  <div
                                    className={`non-kbm-card ${isUpacara ? 'is-upacara' : isReligi ? 'is-religi' : 'is-istirahat'}`}
                                    title={`${label} (${day}, ${slotDef?.start || tRow.start}–${slotDef?.end || tRow.end} WIB): Terkunci Permanen (Non-KBM)`}
                                  >
                                    <LockKeyhole size={11} style={{ opacity: 0.75, flexShrink: 0 }} />
                                    <span>{label}</span>
                                    <span style={{ opacity: 0.75, fontSize: '11px' }}>
                                      ({slotDef?.start || tRow.start}–{slotDef?.end || tRow.end})
                                    </span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }

                      const jpNo = tRow.jpNo!;
                      const refSlot = state.slots.find((slot) => slot.kind === 'TEACHING' && slot.active && slot.jpNo === jpNo);
                      return (
                      <tr key={jpNo}>
                        <th
                          className={`period-heading ${hoveredCoordinate?.jpNo === jpNo ? 'ruler-row-active' : ''}`}
                          title={`Jam KBM JP ${jpNo}: ${refSlot ? `${refSlot.start} – ${refSlot.end} WIB` : '—'}`}
                        >
                          <span>JP {String(jpNo).padStart(2, '0')}</span>
                          <small style={{ fontWeight: 700, color: '#16483f' }}>
                            {refSlot ? `${refSlot.start} – ${refSlot.end}` : '—'}
                          </small>
                        </th>
                        {activeDays.map((day) => {
                          const entry = getEntry(state, selectedClass, day, jpNo);
                          const subject = entry ? getSubject(state, entry.subjectId) : undefined;
                          const teacher = entry ? getTeacher(state, entry.teacherId) : undefined;

                          // Check if slot is blocked by non-KBM activity
                          const slotDef = state.slots.find((s) => s.day === day && s.kind === 'TEACHING' && s.jpNo === jpNo);
                          const blocked = isSlotBlocked(slotDef);
                          const isCrosshair = hoveredCoordinate?.day === day && hoveredCoordinate?.jpNo === jpNo;
                          const isOver = dragOverTarget?.day === day && dragOverTarget?.jpNo === jpNo;
                          const preview = isOver ? getDropPreviewStatus(selectedClass, day, jpNo) : null;

                          const isOutOfKbm = !slotDef;
                          return (
                            <td
                              key={`${day}-${jpNo}`}
                              className={isCrosshair ? 'ruler-crosshair-active' : ''}
                              style={{ position: 'relative' }}
                              onMouseEnter={() => setHoveredCoordinate({ day, jpNo })}
                              onMouseLeave={() => setHoveredCoordinate(null)}
                              onDragOver={(e) => {
                                if (blocked) return;
                                e.preventDefault();
                                setDragOverTarget({ day, jpNo });
                              }}
                              onDragLeave={() => {
                                if (dragOverTarget?.day === day && dragOverTarget?.jpNo === jpNo) {
                                  setDragOverTarget(null);
                                }
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                setDragOverTarget(null);
                                if (blocked) return;
                                if (draggedSlot) {
                                  onDropSlot(draggedSlot, { day, jpNo });
                                  setDraggedSlot(null);
                                } else if (draggedUnplaced && onAssignSlot) {
                                  onAssignSlot(selectedClass, day, jpNo, draggedUnplaced.subjectId, draggedUnplaced.teacherId);
                                  setDraggedUnplaced(null);
                                }
                              }}
                            >
                              {isOver && preview && !blocked && (
                                <div className={`drag-hud-overlay drag-hud-${preview.status}`}>
                                  <span className="drag-hud-badge">{preview.message}</span>
                                </div>
                              )}
                              <div
                                role="button"
                                tabIndex={blocked ? -1 : 0}
                                draggable={!blocked && !!entry}
                                onDragStart={() => {
                                  if (entry && !blocked) {
                                    setDraggedSlot({ classId: selectedClass, day, jpNo });
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (!blocked && (e.key === 'Enter' || e.key === ' ')) {
                                    e.preventDefault();
                                    onEditSlot(selectedClass, day, jpNo);
                                  }
                                }}
                                className={`schedule-cell ${entry ? 'has-entry' : 'is-empty'} ${blocked ? 'is-blocked' : ''}`}
                                style={{
                                  ...(entry && subject ? ({ '--subject-color': subject.color } as React.CSSProperties) : {}),
                                  cursor: blocked ? 'not-allowed' : undefined,
                                  position: 'relative',
                                }}
                                onClick={() => {
                                  if (!blocked) {
                                    onEditSlot(selectedClass, day, jpNo);
                                  }
                                }}
                                title={
                                  blocked
                                    ? (isOutOfKbm ? `Di luar jam KBM ${day}` : `${slotDef?.activityName || slotDef?.activityType || 'Non-KBM'} (${slotDef?.start}–${slotDef?.end} WIB): Terkunci`)
                                    : entry
                                    ? `Tarik untuk memindahkan: ${subject?.name} (${teacher?.name}) · Jam KBM ${slotDef?.start}–${slotDef?.end}`
                                    : `Klik untuk menambah pelajaran pada ${day}, JP ${jpNo} (${slotDef?.start}–${slotDef?.end} WIB)`
                                }
                              >
                                {entry ? (
                                  <>
                                    <button
                                      type="button"
                                      className="quick-cell-trigger"
                                      title="Menu Cepat Slot"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        setCellMenu({
                                          classId: selectedClass,
                                          day,
                                          jpNo,
                                          x: Math.min(window.innerWidth - 220, rect.left),
                                          y: Math.min(window.innerHeight - 200, rect.bottom + 4),
                                        });
                                      }}
                                    >
                                      <MoreHorizontal size={11} />
                                    </button>
                                    <div className="cell-top-meta">
                                      <span className="cell-subject-code">{subject?.code ?? 'MAPEL'}</span>
                                    </div>
                                    <strong className="cell-subject-title">{subject?.name ?? 'Mapel'}</strong>
                                    <div className="cell-teacher-row">
                                      {teacher?.code && <span className="teacher-code-badge">{teacher.code}</span>}
                                      <span className="teacher-name-text">{teacher?.name ?? 'Guru belum tersedia'}</span>
                                    </div>
                                  </>
                                ) : (
                                  <span className="empty-cell-hint">
                                    {blocked ? (
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                        <LockKeyhole size={11} /> {isOutOfKbm ? 'Selesai KBM' : (slotDef?.activityName || slotDef?.activityType)}
                                      </span>
                                    ) : (
                                      <span>+ Isi Mapel</span>
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Single Class Legend (Fase 2: Clean & Minimal) */}
              <div className="schedule-legend-row">
                <span><i className="legend-dot dot-teal" /> Mapel Terisi</span>
                <span><i className="legend-dot dot-ivory" /> Slot Kosong</span>
                <span><LockKeyhole size={12} style={{ verticalAlign: -2, color: '#16483f' }} /> Non-KBM Terkunci</span>
                <span className="legend-spacer" />
                <button className="text-link" onClick={onOpenValidationModal}>
                  Laporan Validasi <ArrowRight size={13} />
                </button>
              </div>

              {/* Bank Kebutuhan Mapel (Unplaced Curriculum Bank Dock) */}
              <div className="unplaced-bank-dock">
                <div className="unplaced-dock-header">
                  <div className="unplaced-dock-title">
                    <BookOpen size={16} color="#154236" />
                    <strong>Bank Kebutuhan Jam Kurikulum</strong>
                    <span>{unplacedList.length} Mapel Belum Lengkap</span>
                  </div>
                </div>

                {unplacedList.length === 0 ? (
                  <div className="unplaced-complete-banner">
                    <CheckCircle2 size={16} />
                    <span>Seluruh alokasi kebutuhan kurikulum untuk kelas ini telah lengkap terpenuhi (100%).</span>
                  </div>
                ) : (
                  <div className="unplaced-cards-grid">
                    {unplacedList.map((item) => (
                      <div
                        key={item.requirementId}
                        className="unplaced-card"
                        style={{ '--subject-color': item.subjectColor } as React.CSSProperties}
                        draggable={true}
                        onDragStart={() => {
                          setDraggedUnplaced({ subjectId: item.subjectId, teacherId: item.teacherId });
                        }}
                        onDragEnd={() => {
                          setDraggedUnplaced(null);
                        }}
                        title={`Tarik untuk mengalokasikan ${item.subjectName} (${item.teacherName}) ke slot kosong`}
                      >
                        <div className="unplaced-card-meta">
                          <span className="unplaced-card-sub">{item.subjectName}</span>
                          <span className="unplaced-card-tch">
                            <span className="teacher-code-badge">{item.teacherCode}</span>
                            {item.teacherName}
                          </span>
                        </div>
                        <span className="unplaced-card-badge">Sisa {item.remaining} JP</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Floating Quick Cell Context Popover */}
      {cellMenu && (
        <div
          className="quick-cell-popover"
          style={{ top: cellMenu.y, left: cellMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="quick-menu-header">
            <strong>Aksi Cepat Slot</strong>
            <small>{cellMenu.day}, JP {cellMenu.jpNo}</small>
          </div>
          <button
            type="button"
            className="quick-menu-item"
            onClick={() => {
              onEditSlot(cellMenu.classId, cellMenu.day, cellMenu.jpNo);
              setCellMenu(null);
            }}
          >
            <Pencil size={13} /> Edit Detail Lengkap
          </button>
          <button
            type="button"
            className="quick-menu-item"
            onClick={() => {
              const entry = getEntry(state, cellMenu.classId, cellMenu.day, cellMenu.jpNo);
              if (entry) setFilterTeacherId(entry.teacherId);
              setCellMenu(null);
            }}
          >
            <Search size={13} /> Sorot Guru Ini
          </button>
          {onClearSlot && (
            <button
              type="button"
              className="quick-menu-item danger"
              onClick={() => {
                onClearSlot(cellMenu.classId, cellMenu.day, cellMenu.jpNo);
                setCellMenu(null);
              }}
            >
              <Trash2 size={13} /> Kosongkan Jam Ini
            </button>
          )}
        </div>
      )}
      </div>
    </>
  );
}



/**
 * GENERATOR SCREEN
 */
function GeneratorScreen({
  state,
  isGenerating,
  result,
  onGenerate,
  onChoose,
  onNavigate: _onNavigate,
}: {
  state: AppState;
  isGenerating: boolean;
  result: { status: GeneratorStatus; message: string; nodes: number } | null;
  onGenerate: () => void;
  onChoose: (id: string) => void;
  onNavigate?: (screen: ScreenId) => void;
}) {
  const statuses: Record<GeneratorStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'info' }> = {
    QUEUED: { label: 'Menunggu', tone: 'neutral' },
    RUNNING: { label: 'Mencari kandidat', tone: 'info' },
    SUCCESS: { label: 'Berhasil', tone: 'success' },
    INFEASIBLE: { label: 'Tidak feasible', tone: 'danger' },
    SEARCH_LIMIT_REACHED: { label: 'Batas pencarian tercapai', tone: 'warning' },
    INVALID_INPUT: { label: 'Data belum lengkap', tone: 'warning' },
    CANCELLED: { label: 'Dibatalkan', tone: 'neutral' },
    FAILED: { label: 'Gagal', tone: 'danger' },
  };

  const allJP = state.requirements.reduce((sum, item) => sum + item.requiredJP, 0);

  return (
    <>
      <PageHeading
        kicker="DETERMINISTIC ENGINE"
        title="Schedule Generator"
        description={`Mesin pencarian otomatis yang mematuhi seluruh hard constraint alokasi (${allJP} JP total kebutuhan) dan ketersediaan guru.`}
        actions={
          <Button icon={WandSparkles} onClick={onGenerate} disabled={isGenerating}>
            {isGenerating ? 'Sedang mencari…' : 'Jalankan Generator'}
          </Button>
        }
      />

      {/* Solver & Capacity KPI Metrics */}
      <div className="generator-metrics">
        <KpiMotionCard index={0}>
          <span>TARGET ALOKASI JP</span>
          <strong>
            <KpiAnimatedNumber value={allJP} suffix=" JP" />
          </strong>
          <small>{state.requirements.length} Mata Pelajaran Siswa</small>
        </KpiMotionCard>
        <KpiMotionCard index={1}>
          <span>KAPASITAS SLOT MURNI</span>
          <strong>
            <KpiAnimatedNumber
              value={
                state.settings.activeDays.reduce((sum, day) => sum + teachingPeriodsForDay(state.slots, day).length, 0) *
                state.classes.filter((c) => c.isActive).length
              }
              suffix=" JP"
            />
          </strong>
          <small>{state.classes.filter((c) => c.isActive).length} Rombel KBM Terdaftar</small>
        </KpiMotionCard>
        <KpiMotionCard index={2}>
          <span>KANDIDAT TERSIMPAN</span>
          <strong>
            <KpiAnimatedNumber value={state.candidates.length} />
          </strong>
          <small>Variasi Solusi Teruji</small>
        </KpiMotionCard>
        <KpiMotionCard index={3}>
          <span>STATUS SOLVER</span>
          <strong
            style={{
              color: isGenerating ? '#1f6850' : result?.status === 'SUCCESS' ? '#1f6850' : '#876123',
            }}
          >
            {isGenerating ? (
              'Mencari...'
            ) : result?.status === 'SUCCESS' ? (
              <KpiAnimatedNumber value={100} suffix="% Lolos" />
            ) : result ? (
              statuses[result.status].label
            ) : (
              'Siap Dijalankan'
            )}
          </strong>
          <small>Constraint Engine Deterministik</small>
        </KpiMotionCard>
      </div>

      {/* Combinatorial Solver Radar Feedback */}
      {isGenerating && (
        <div className="s5-solver-radar-wrap">
          <div className="s5-radar-pulse">
            <Sparkles size={18} style={{ color: '#124037' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '13.5px', color: '#0B2923' }}>
                Deterministic Backtracking Solver Sedang Bekerja
              </strong>
              <span className="s5-tnum" style={{ fontSize: '11px', background: '#E1E8E4', padding: '2px 8px', borderRadius: '4px', fontWeight: 700, color: '#124037' }}>
                Backtracking CSP · LRN Heuristics
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#556663' }}>
              Mengeksplorasi pohon kombinatorial ruang pencarian, memverifikasi ketersediaan hari guru, batasan beban harian, dan slot khusus madrasah tanpa bentrok.
            </p>
          </div>
        </div>
      )}

      <div className="dashboard-grid generator-main-grid">
        <Card eyebrow="CONSTRAINT SEARCH" title="Hasil Penyusunan Jadwal">
          <div className="result-status-top">
            <div className="result-status-icon">
              {isGenerating ? (
                <LoaderCircle className="spinning" size={22} />
              ) : result?.status === 'SUCCESS' ? (
                <CheckCircle2 size={22} />
              ) : result?.status && ['INFEASIBLE', 'FAILED'].includes(result.status) ? (
                <XCircle size={22} />
              ) : (
                <WandSparkles size={22} />
              )}
            </div>
            <div>
              <strong>{isGenerating ? 'Searching candidates…' : result ? statuses[result.status].label : 'Belum ada pencarian baru'}</strong>
              <span>{isGenerating ? 'Memeriksa slot, alokasi, dan bentrok lintas kelas.' : result?.message ?? 'Klik tombol di atas untuk menyusun jadwal.'}</span>
            </div>
          </div>

          {result && (
            <div className="result-stats">
              <div><span>Search nodes</span><strong>{result.nodes.toLocaleString('id-ID')}</strong></div>
              <div><span>Status</span><StatusPill status={statuses[result.status].tone}>{statuses[result.status].label}</StatusPill></div>
            </div>
          )}

          <div className="result-disclaimer">
            <ShieldCheck size={16} />
            <span>Hasil berstatus <strong>SUCCESS</strong> lolos seluruh aturan validasi keras sebelum disimpan ke draft.</span>
          </div>
        </Card>

        <Card eyebrow="CANDIDATE HISTORY" title="Kandidat Tersimpan">
          {!state.candidates.length ? (
            <EmptyState icon={WandSparkles} title="Belum ada kandidat" description="Kandidat valid akan muncul di sini." />
          ) : (
            <div className="candidate-table-wrap">
              <table className="data-table candidate-table">
                <thead>
                  <tr>
                    <th>Kandidat</th>
                    <th>Coverage</th>
                    <th>Skor</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {state.candidates.map((cand) => (
                    <tr key={cand.id}>
                      <td>
                        <strong>{cand.label}</strong>
                        <small style={{ display: 'block', color: '#526861' }}>{cand.entries.length} penempatan</small>
                      </td>
                      <td>
                        <StatusPill status={cand.report.valid ? 'success' : 'danger'}>
                          {cand.report.valid ? '100% Lolos' : `${cand.report.hardErrorCount} Isu`}
                        </StatusPill>
                      </td>
                      <td><strong>{cand.score}</strong></td>
                      <td>
                        <Button variant="secondary" onClick={() => onChoose(cand.id)}>Terapkan</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function getRoleBadgeVariant(roleTitle?: string): 'curriculum' | 'bk' | 'wali' | 'regular' {
  if (!roleTitle) return 'regular';
  const lower = roleTitle.toLowerCase();
  if (lower.includes('kurikulum') || lower.includes('kepala') || lower.includes('waka')) return 'curriculum';
  if (lower.includes('bk') || lower.includes('konseling')) return 'bk';
  if (lower.includes('wali')) return 'wali';
  return 'regular';
}

/**
 * MASTER DATA SCREEN
 */
function MasterScreen({
  state,
  activeTab,
  onTabChange,
  search,
  onSearch,
  onAdd,
  addType,
  form,
  setForm,
  onSave,
  onCancelAdd,
  onDelete,
  onBulkDelete,
  onBulkExport,
  onBulkToggleActive,
  onEditClass,
  onEditTeacher,
  onEditSubject,
  onInspectTeacher,
  onOpenTeacherAssignments,
  onOpenAddModal,
  onNavigate,
}: {
  state: AppState;
  activeTab: MasterTab;
  onTabChange: (tab: MasterTab) => void;
  search: string;
  onSearch: (value: string) => void;
  onAdd: (type: Exclude<AddType, null>) => void;
  addType: AddType;
  form: typeof emptyMasterForm;
  setForm: (value: typeof emptyMasterForm) => void;
  onSave: (event: FormEvent) => void;
  onCancelAdd: () => void;
  onDelete: (kind: MasterTab, id: string) => void;
  onBulkDelete?: (kind: MasterTab, ids: string[]) => void;
  onBulkExport?: (kind: MasterTab, ids: string[]) => void;
  onBulkToggleActive?: (kind: MasterTab, ids: string[], nextActive: boolean) => void;
  onEditClass: (c: SchoolClass) => void;
  onEditTeacher: (t: Teacher) => void;
  onEditSubject: (s: Subject) => void;
  onInspectTeacher?: (t: Teacher) => void;
  onOpenTeacherAssignments?: (t: Teacher) => void;
  onOpenAddModal?: (kind: 'class' | 'teacher' | 'subject') => void;
  onNavigate?: (screen: ScreenId) => void;
}) {
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const [filterPreset, setFilterPreset] = useState<string>('all');
  const [openKebabId, setOpenKebabId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmBulkStatus, setConfirmBulkStatus] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPage(1);
  }, [activeTab, search, filterPreset]);

  useEffect(() => {
    setFilterPreset('all');
    setSelectedIds([]);
    setConfirmBulkDelete(false);
    setConfirmBulkStatus(false);
  }, [activeTab]);

  useEffect(() => {
    const handleDocClick = () => setOpenKebabId(null);
    window.addEventListener('click', handleDocClick);
    return () => window.removeEventListener('click', handleDocClick);
  }, []);

  // Keyboard shortcut listener: '/' to focus local table search (keeps Ctrl+K free for Command Palette), 'N' to add
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const isInput =
        activeEl?.tagName === 'INPUT' ||
        activeEl?.tagName === 'TEXTAREA' ||
        activeEl?.tagName === 'SELECT' ||
        Boolean(activeEl?.isContentEditable);

      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (!isInput && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        if (onOpenAddModal) {
          onOpenAddModal(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject');
        } else {
          onAdd(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, onOpenAddModal, onAdd]);

  // Derived rich metrics
  const activeClasses = useMemo(() => state.classes.filter((c) => c.isActive), [state.classes]);
  const activeTeachers = useMemo(() => state.teachers.filter((t) => t.isActive), [state.teachers]);
  const activeSubjects = useMemo(() => state.subjects.filter((s) => s.isActive), [state.subjects]);
  const totalAssignedJP = useMemo(() => state.requirements.reduce((sum, r) => sum + r.requiredJP, 0), [state.requirements]);
  const avgTeacherJP = activeTeachers.length > 0 ? (totalAssignedJP / activeTeachers.length).toFixed(1) : '0';
  const teacherClassRatio = activeClasses.length > 0 ? (activeTeachers.length / activeClasses.length).toFixed(1) : '0';
  const classesVII = useMemo(() => state.classes.filter((c) => c.level === 'VII').length, [state.classes]);
  const classesVIII = useMemo(() => state.classes.filter((c) => c.level === 'VIII').length, [state.classes]);
  const classesIX = useMemo(() => state.classes.filter((c) => c.level === 'IX').length, [state.classes]);
  const missingTeachersInSubjects = useMemo(
    () => state.subjects.filter((s) => !state.teachers.some((t) => t.isActive && t.subjectIds.includes(s.id))).length,
    [state.subjects, state.teachers]
  );
  const classesWithoutRequirements = useMemo(
    () => state.classes.filter((c) => !state.requirements.some((r) => r.classId === c.id)).length,
    [state.classes, state.requirements]
  );

  const integrityScore = useMemo(() => {
    if (state.classes.length === 0 || state.teachers.length === 0 || state.subjects.length === 0) return 0;
    if (missingTeachersInSubjects === 0 && classesWithoutRequirements === 0) return 100;
    return Math.max(70, 100 - missingTeachersInSubjects * 6 - classesWithoutRequirements * 4);
  }, [state.classes, state.teachers, state.subjects, missingTeachersInSubjects, classesWithoutRequirements]);

  const filteredClasses = useMemo(() => {
    return state.classes.filter((item) => {
      const matchSearch = `${item.name} ${item.level}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterPreset === 'active') return item.isActive;
      if (filterPreset === 'inactive') return !item.isActive;
      if (filterPreset === 'vii') return item.level === 'VII';
      if (filterPreset === 'viii') return item.level === 'VIII';
      if (filterPreset === 'ix') return item.level === 'IX';
      return true;
    });
  }, [state.classes, search, filterPreset]);

  const filteredTeachers = useMemo(() => {
    return state.teachers.filter((item) => {
      const matchSearch = `${item.name} ${item.code} ${item.nip || ''} ${item.roleTitle || ''}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterPreset === 'active') return item.isActive;
      if (filterPreset === 'inactive') return !item.isActive;

      const teacherReqs = state.requirements.filter((r) => r.teacherId === item.id);
      const assignedJP = teacherReqs.reduce((sum, r) => sum + r.requiredJP, 0);
      const maxJP = item.maxWeeklyJP || 24;

      if (filterPreset === 'overload') return assignedJP > maxJP;
      if (filterPreset === 'optimal') return assignedJP >= 20 && assignedJP <= maxJP;
      if (filterPreset === 'zero') return assignedJP === 0;
      return true;
    });
  }, [state.teachers, state.requirements, search, filterPreset]);

  const filteredSubjects = useMemo(() => {
    return state.subjects.filter((item) => {
      const matchSearch = `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterPreset === 'active') return item.isActive;
      if (filterPreset === 'inactive') return !item.isActive;

      const hasTeacher = state.teachers.some((t) => t.isActive && t.subjectIds.includes(item.id));
      if (filterPreset === 'has-teacher') return hasTeacher;
      if (filterPreset === 'no-teacher') return !hasTeacher;
      return true;
    });
  }, [state.subjects, state.teachers, search, filterPreset]);

  const currentList = activeTab === 'classes' ? filteredClasses : activeTab === 'teachers' ? filteredTeachers : filteredSubjects;
  const paginatedList = pageSize === 0 ? currentList : currentList.slice((page - 1) * pageSize, page * pageSize);

  const allTabIdsSet = useMemo(() => {
    if (activeTab === 'classes') return new Set(state.classes.map((c) => c.id));
    if (activeTab === 'teachers') return new Set(state.teachers.map((t) => t.id));
    return new Set(state.subjects.map((s) => s.id));
  }, [activeTab, state.classes, state.teachers, state.subjects]);

  const validSelectedIds = useMemo(
    () => selectedIds.filter((id) => allTabIdsSet.has(id)),
    [selectedIds, allTabIdsSet]
  );
  const selectedSet = useMemo(() => new Set(validSelectedIds), [validSelectedIds]);

  const pageIds = useMemo(() => paginatedList.map((item) => item.id), [paginatedList]);
  const selectedOnPageCount = useMemo(
    () => pageIds.filter((id) => selectedSet.has(id)).length,
    [pageIds, selectedSet]
  );
  const isAllPageSelected = pageIds.length > 0 && selectedOnPageCount === pageIds.length;
  const isSomePageSelected = selectedOnPageCount > 0 && selectedOnPageCount < pageIds.length;

  const toggleSelectOne = (id: string) => {
    setConfirmBulkDelete(false);
    setConfirmBulkStatus(false);
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const toggleSelectPage = () => {
    setConfirmBulkDelete(false);
    setConfirmBulkStatus(false);
    if (isAllPageSelected) {
      const pageSet = new Set(pageIds);
      setSelectedIds((prev) => prev.filter((id) => !pageSet.has(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
    }
  };

  const selectAllFiltered = () => {
    setConfirmBulkDelete(false);
    setConfirmBulkStatus(false);
    setSelectedIds(currentList.map((item) => item.id));
  };

  const clearSelection = () => {
    setConfirmBulkDelete(false);
    setConfirmBulkStatus(false);
    setSelectedIds([]);
  };

  const tabEntityLabel = activeTab === 'classes' ? 'Kelas' : activeTab === 'teachers' ? 'Guru' : 'Mapel';

  return (
    <>
      {/* 2026 Executive Prestige Hero Banner */}
      <section className="master-prestige-hero" aria-label="Madrasah Master Data Executive Banner">
        <svg className="master-hero-ornament" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
          <circle cx="100" cy="100" r="92" strokeDasharray="3 3" opacity="0.6" />
          <circle cx="100" cy="100" r="70" />
          <circle cx="100" cy="100" r="46" strokeDasharray="2 2" />
          <rect x="35" y="35" width="130" height="130" transform="rotate(0 100 100)" />
          <rect x="35" y="35" width="130" height="130" transform="rotate(45 100 100)" />
          <rect x="52" y="52" width="96" height="96" transform="rotate(22.5 100 100)" opacity="0.5" />
          <rect x="52" y="52" width="96" height="96" transform="rotate(67.5 100 100)" opacity="0.5" />
          <polygon points="100,20 120,80 180,100 120,120 100,180 80,120 20,100 80,80" opacity="0.4" />
        </svg>
        <div className="master-hero-glow" aria-hidden="true" />
        <div className="master-hero-shimmer" aria-hidden="true" />

        <div className="master-hero-content">
          <div className="master-hero-left">
            <div className="master-hero-kicker">
              <Award size={13} className="hero-kicker-icon" />
              <span>BASIS DATA MASTER · STANDAR EMIS &amp; SIMPATIKA</span>
            </div>
            <h1 className="master-hero-title">Data Master Madrasah</h1>
            <p className="master-hero-desc">
              Kelola data rombel, dewan guru, dan mata pelajaran sebagai fondasi penjadwalan presisi.
            </p>
            <div className="master-hero-meta-strip">
              <span className="master-hero-meta-item s5-tnum">
                <Clock3 size={13} /> TA {state.settings.academicYear} ({state.settings.semester})
              </span>
              <span className="master-hero-meta-dot" />
              <span className="master-hero-meta-item s5-tnum">
                <CheckCircle2 size={13} /> {activeClasses.length} Rombel · {activeTeachers.length} Guru
              </span>
              <span className="master-hero-meta-dot" />
              <span className="master-hero-meta-item s5-tnum">
                <ShieldCheck size={13} /> Kesiapan: {integrityScore}%
              </span>
            </div>
          </div>

          <div className="master-hero-actions">
            <button
              type="button"
              className="master-hero-primary-btn"
              onClick={() =>
                onOpenAddModal
                  ? onOpenAddModal(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject')
                  : onAdd(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject')
              }
              title={`Tambah ${activeTab === 'classes' ? 'Kelas' : activeTab === 'teachers' ? 'Guru' : 'Mapel'} baru`}
            >
              <Plus size={16} />
              <span>Tambah {activeTab === 'classes' ? 'Kelas' : activeTab === 'teachers' ? 'Guru' : 'Mapel'}</span>
              <kbd className="hero-kbd-badge">N</kbd>
            </button>

            {onNavigate && (
              <>
                <button
                  type="button"
                  className="master-hero-secondary-btn"
                  onClick={() => onNavigate('workload')}
                  title="Lihat matriks analisis beban kerja guru"
                >
                  <Activity size={15} />
                  <span>Matriks Beban</span>
                </button>
                <button
                  type="button"
                  className="master-hero-secondary-btn"
                  onClick={() => onNavigate('validation')}
                  title="Periksa validasi dan kelengkapan jadwal"
                >
                  <FileCheck2 size={15} />
                  <span>Validasi</span>
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* 2026 Executive Glass Metric Cards */}
      <div className="master-prestige-metric-grid" role="region" aria-label="Ringkasan Statistik Master">
        {/* Card 1: Teachers */}
        <KpiMotionCard className="prestige-metric-card stat-card" index={0}>
          <div className="prestige-card-top">
            <div className="prestige-icon-badge emerald">
              <Users size={18} />
            </div>
            <span className="prestige-card-tag">{teacherClassRatio}x Rasio Kelas</span>
          </div>
          <div>
            <div className="prestige-val-row">
              <span className="prestige-val s5-tnum">
                <KpiAnimatedNumber value={activeTeachers.length} />
              </span>
              <span className="prestige-subval">/ {state.teachers.length} terdata</span>
            </div>
            <span className="prestige-card-lbl">Dewan Asatidz &amp; Guru</span>
          </div>
          <div className="prestige-card-foot">
            <span>Rata-rata: {avgTeacherJP} JP/minggu</span>
            <span style={{ fontWeight: 700, color: '#0d5f47' }}>Aktif</span>
          </div>
          <div className="prestige-spark-bar">
            <div
              className="prestige-spark-fill"
              style={{
                width: `${Math.min(100, Math.round((Number(avgTeacherJP) / 24) * 100))}%`,
                background: '#15803d',
              }}
            />
          </div>
        </KpiMotionCard>

        {/* Card 2: Classes */}
        <KpiMotionCard className="prestige-metric-card stat-card" index={1}>
          <div className="prestige-card-top">
            <div className="prestige-icon-badge teal">
              <GraduationCap size={18} />
            </div>
            <span className="prestige-card-tag">Tingkat VII–IX</span>
          </div>
          <div>
            <div className="prestige-val-row">
              <span className="prestige-val s5-tnum">
                <KpiAnimatedNumber value={activeClasses.length} />
              </span>
              <span className="prestige-subval">Rombel Aktif</span>
            </div>
            <span className="prestige-card-lbl">Rombongan Belajar</span>
          </div>
          <div className="prestige-card-foot">
            <span>VII: {classesVII} · VIII: {classesVIII} · IX: {classesIX}</span>
            <span style={{ fontWeight: 700, color: '#0e6b72' }}>{totalAssignedJP} JP</span>
          </div>
          <div className="prestige-spark-bar">
            <div
              className="prestige-spark-fill"
              style={{
                width: `${Math.min(100, Math.round((activeClasses.length / (state.classes.length || 1)) * 100))}%`,
                background: '#0e6b72',
              }}
            />
          </div>
        </KpiMotionCard>

        {/* Card 3: Subjects */}
        <KpiMotionCard className="prestige-metric-card stat-card" index={2}>
          <div className="prestige-card-top">
            <div className="prestige-icon-badge amber">
              <BookOpen size={18} />
            </div>
            <span className="prestige-card-tag">Kemenag &amp; Nasional</span>
          </div>
          <div>
            <div className="prestige-val-row">
              <span className="prestige-val s5-tnum">
                <KpiAnimatedNumber value={activeSubjects.length} />
              </span>
              <span className="prestige-subval">Mapel Aktif</span>
            </div>
            <span className="prestige-card-lbl">Struktur Kurikulum</span>
          </div>
          <div className="prestige-card-foot">
            <span>{missingTeachersInSubjects === 0 ? 'Semua mapel terampu' : `${missingTeachersInSubjects} mapel belum ada guru`}</span>
            <span style={{ fontWeight: 700, color: missingTeachersInSubjects === 0 ? '#15803d' : '#b45309' }}>
              {missingTeachersInSubjects === 0 ? 'Lengkap' : 'Perlu Guru'}
            </span>
          </div>
          <div className="prestige-spark-bar">
            <div
              className="prestige-spark-fill"
              style={{
                width: `${Math.min(100, Math.round(((activeSubjects.length - missingTeachersInSubjects) / (activeSubjects.length || 1)) * 100))}%`,
                background: '#b45309',
              }}
            />
          </div>
        </KpiMotionCard>

        {/* Card 4: Integrity */}
        <KpiMotionCard className="prestige-metric-card stat-card" index={3}>
          <div className="prestige-card-top">
            <div className="prestige-icon-badge jade">
              <ShieldCheck size={18} />
            </div>
            <span
              className="prestige-card-tag"
              style={{
                color: integrityScore === 100 ? '#166534' : '#b45309',
                background: integrityScore === 100 ? '#edf7ea' : '#fef6e7',
                borderColor: integrityScore === 100 ? '#c2e5bc' : '#f9deab',
              }}
            >
              {integrityScore === 100 ? 'Siap Generate' : 'Perlu Input'}
            </span>
          </div>
          <div>
            <div className="prestige-val-row">
              <span className="prestige-val s5-tnum" style={{ color: integrityScore === 100 ? '#166534' : '#0e2e26' }}>
                <KpiAnimatedNumber value={integrityScore} suffix="%" />
              </span>
              <span className="prestige-subval">Skor Kesiapan</span>
            </div>
            <span className="prestige-card-lbl">Integritas Basis Data</span>
          </div>
          <div className="prestige-card-foot">
            <span>
              {integrityScore === 100
                ? 'Validasi master terpenuhi'
                : `${missingTeachersInSubjects + classesWithoutRequirements} catatan kelengkapan`}
            </span>
            <span style={{ fontWeight: 700, color: integrityScore === 100 ? '#15803d' : '#b45309' }}>
              {integrityScore === 100 ? '100% Valid' : 'Warning'}
            </span>
          </div>
          <div className="prestige-spark-bar">
            <div
              className="prestige-spark-fill"
              style={{
                width: `${integrityScore}%`,
                background: integrityScore === 100 ? '#166534' : '#d97706',
              }}
            />
          </div>
        </KpiMotionCard>
      </div>

      <Card
        className="master-data-card"
        action={
          <div className="master-toolbar-row">
            <div className="segmented-tabs" role="tablist" aria-label="Kategori Data Master">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'classes'}
                className={activeTab === 'classes' ? 'active' : ''}
                onClick={() => onTabChange('classes')}
              >
                <span className="master-tab-btn-content">
                  <GraduationCap size={14} className="master-tab-icon" />
                  <span>Kelas</span>
                  <span className="tab-count">{state.classes.length}</span>
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'teachers'}
                className={activeTab === 'teachers' ? 'active' : ''}
                onClick={() => onTabChange('teachers')}
              >
                <span className="master-tab-btn-content">
                  <Users size={14} className="master-tab-icon" />
                  <span>Dewan Guru</span>
                  <span className="tab-count">{state.teachers.length}</span>
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'subjects'}
                className={activeTab === 'subjects' ? 'active' : ''}
                onClick={() => onTabChange('subjects')}
              >
                <span className="master-tab-btn-content">
                  <BookOpen size={14} className="master-tab-icon" />
                  <span>Mata Pelajaran</span>
                  <span className="tab-count">{state.subjects.length}</span>
                </span>
              </button>
            </div>
            <div className="master-toolbar-search-wrap">
              <div className="table-search">
                <Search size={15} />
                <input
                  ref={searchInputRef}
                  value={search}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder={`Cari ${activeTab === 'classes' ? 'nama kelas' : activeTab === 'teachers' ? 'guru / NIP / kode' : 'mata pelajaran'}…`}
                />
                {search && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => onSearch('')}
                    title="Hapus pencarian"
                    aria-label="Hapus kata kunci pencarian"
                  >
                    <X size={14} />
                  </button>
                )}
                <span className="search-shortcut-hint" title="Tekan / untuk mencari di Data Master">
                  /
                </span>
              </div>
            </div>
          </div>
        }
      >
        {/* Master Filter Presets Row */}
        <div className="master-filter-presets-row" role="group" aria-label="Filter Preset Data Master">
          <span className="master-filter-label">Filter:</span>
          <button
            type="button"
            className={`master-filter-chip ${filterPreset === 'all' ? 'active' : ''}`}
            onClick={() => setFilterPreset('all')}
          >
            Semua ({activeTab === 'classes' ? state.classes.length : activeTab === 'teachers' ? state.teachers.length : state.subjects.length})
          </button>
          <button
            type="button"
            className={`master-filter-chip ${filterPreset === 'active' ? 'active' : ''}`}
            onClick={() => setFilterPreset('active')}
          >
            Hanya Aktif
          </button>

          {activeTab === 'classes' && (
            <>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'vii' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'vii' ? 'all' : 'vii')}
              >
                Kelas VII ({state.classes.filter((c) => c.level === 'VII').length})
              </button>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'viii' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'viii' ? 'all' : 'viii')}
              >
                Kelas VIII ({state.classes.filter((c) => c.level === 'VIII').length})
              </button>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'ix' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'ix' ? 'all' : 'ix')}
              >
                Kelas IX ({state.classes.filter((c) => c.level === 'IX').length})
              </button>
            </>
          )}

          {activeTab === 'teachers' && (
            <>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'optimal' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'optimal' ? 'all' : 'optimal')}
              >
                Beban Optimal (20–24 JP)
              </button>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'overload' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'overload' ? 'all' : 'overload')}
              >
                Overload (&gt;24 JP)
              </button>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'zero' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'zero' ? 'all' : 'zero')}
              >
                Belum Ada JP (0 JP)
              </button>
            </>
          )}

          {activeTab === 'subjects' && (
            <>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'has-teacher' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'has-teacher' ? 'all' : 'has-teacher')}
              >
                Ada Guru Pengampu
              </button>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'no-teacher' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'no-teacher' ? 'all' : 'no-teacher')}
              >
                Belum Ada Guru ({missingTeachersInSubjects})
              </button>
            </>
          )}
        </div>

        {addType && (
          <form className="inline-create-form" onSubmit={onSave}>
            <div className="inline-create-title">
              <div className="inline-create-icon"><Plus size={17} /></div>
              <div>
                <strong>Tambah {addType === 'class' ? 'Kelas Baru' : addType === 'teacher' ? 'Guru Baru' : 'Mapel Baru'}</strong>
                <span>Tersimpan secara lokal di browser Anda.</span>
              </div>
              <button className="icon-button" type="button" onClick={onCancelAdd}><X size={16} /></button>
            </div>
            <div className="form-grid-two">
              <div className="field-group">
                <label>{addType === 'class' ? 'Nama Kelas' : addType === 'teacher' ? 'Nama Guru' : 'Nama Mapel'}</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Masukkan nama..." />
              </div>
              {addType === 'class' ? (
                <div className="field-group">
                  <label>Tingkat</label>
                  <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })}>
                    <option>VII</option><option>VIII</option><option>IX</option>
                  </select>
                </div>
              ) : (
                <div className="field-group">
                  <label>Kode</label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Contoh: T-10 atau MAT" />
                </div>
              )}
            </div>

            {addType === 'teacher' && (
              <>
                <div className="form-grid-two">
                  <div className="field-group">
                    <label>Jabatan Guru (Isi Manual / Rekomendasi)</label>
                    <input
                      value={form.roleTitle}
                      onChange={(e) => setForm({ ...form, roleTitle: e.target.value })}
                      placeholder="Misal: Waka Kurikulum, Guru Mapel, Guru BK..."
                    />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
                      {COMMON_TEACHER_POSITIONS.slice(0, 7).map((pos) => (
                        <button
                          key={pos}
                          type="button"
                          onClick={() => setForm({ ...form, roleTitle: pos })}
                          style={{
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: '5px',
                            border: form.roleTitle === pos ? '1px solid #16483f' : '1px solid #d4d7cc',
                            background: form.roleTitle === pos ? '#e6f0ed' : '#ffffff',
                            color: form.roleTitle === pos ? '#0b3435' : '#435e58',
                            cursor: 'pointer',
                          }}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field-group">
                    <label>NIP / NPK / NUPTK</label>
                    <input
                      value={form.nip}
                      onChange={(e) => setForm({ ...form, nip: e.target.value })}
                      placeholder="Contoh: 19820514 200801 1 005 atau tanda (-)"
                    />
                    <small>Dicantumkan di bawah nama guru pada seluruh berkas resmi.</small>
                  </div>
                </div>

                <div className="field-group">
                  <label>Identitas &amp; Profil Avatar Madrasah</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, gender: 'male' })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: form.gender !== 'female' ? '1.5px solid #16483f' : '1px solid #d4d7cc',
                        background: form.gender !== 'female' ? '#e6f0ed' : '#ffffff',
                        color: form.gender !== 'female' ? '#0b3435' : '#435e58',
                        fontWeight: form.gender !== 'female' ? 700 : 500,
                        cursor: 'pointer',
                        fontSize: '11.5px',
                      }}
                    >
                      <span>👳‍♂️ Asatidz (Songkok / Peci)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, gender: 'female' })}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        border: form.gender === 'female' ? '1.5px solid #16483f' : '1px solid #d4d7cc',
                        background: form.gender === 'female' ? '#e6f0ed' : '#ffffff',
                        color: form.gender === 'female' ? '#0b3435' : '#435e58',
                        fontWeight: form.gender === 'female' ? 700 : 500,
                        cursor: 'pointer',
                        fontSize: '11.5px',
                      }}
                    >
                      <span>🧕 Ustadzah (Hijab / Jilbab Formal)</span>
                    </button>
                  </div>
                </div>

                <div className="field-group">
                  <label>Kualifikasi Mapel yang Diampu</label>
                  <div className="qualification-check-grid">
                    {state.subjects.map((sub) => (
                      <label key={sub.id} className={`qualification-check ${form.selectedSubjectIds.includes(sub.id) ? 'checked' : ''}`}>
                        <input
                          type="checkbox"
                          checked={form.selectedSubjectIds.includes(sub.id)}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              selectedSubjectIds: e.target.checked
                                ? [...form.selectedSubjectIds, sub.id]
                                : form.selectedSubjectIds.filter((id) => id !== sub.id),
                            })
                          }
                        />
                        <span className="tiny-subject-dot" style={{ background: sub.color }} />
                        {sub.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="field-group narrow-field">
                  <label>Batas Maksimum Mengajar (JP/minggu)</label>
                  <input type="number" min="1" max="50" value={form.maxWeeklyJP} onChange={(e) => setForm({ ...form, maxWeeklyJP: e.target.value })} />
                </div>
              </>
            )}
            <div className="inline-form-actions">
              <Button variant="secondary" onClick={onCancelAdd}>Batal</Button>
              <Button type="submit" icon={Save}>Simpan</Button>
            </div>
          </form>
        )}

        {/* Classes Table */}
        {activeTab === 'classes' && paginatedList.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="s5-checkbox-col">
                    <label className="s5-checkbox-label" title={isAllPageSelected ? 'Batal pilih halaman ini' : 'Pilih semua di halaman ini'}>
                      <input
                        type="checkbox"
                        className="s5-checkbox-input"
                        checked={isAllPageSelected}
                        onChange={toggleSelectPage}
                        aria-label="Pilih semua kelas di halaman ini"
                      />
                      <span className={`s5-checkbox-box ${isSomePageSelected ? 'indeterminate' : ''}`}>
                        {isAllPageSelected ? <Check size={12} strokeWidth={3} /> : isSomePageSelected ? <Minus size={12} strokeWidth={3} /> : null}
                      </span>
                    </label>
                  </th>
                  <th>Rombongan Belajar</th>
                  <th>Tingkat</th>
                  <th>Alokasi Kebutuhan JP</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedList as SchoolClass[]).map((c) => {
                  const reqs = state.requirements.filter((r) => r.classId === c.id);
                  const total = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
                  const lvlClass = c.level.toLowerCase() as 'vii' | 'viii' | 'ix';
                  const isSelected = selectedSet.has(c.id);
                  return (
                    <tr key={c.id} className={isSelected ? 's5-row-selected' : undefined}>
                      <td className="s5-checkbox-col">
                        <label className="s5-checkbox-label" onClick={(e) => e.stopPropagation()} title={`Pilih Kelas ${c.name}`}>
                          <input
                            type="checkbox"
                            className="s5-checkbox-input"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(c.id)}
                            aria-label={`Pilih Kelas ${c.name}`}
                          />
                          <span className="s5-checkbox-box">
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </span>
                        </label>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <GraduationCap size={16} style={{ color: '#0e5f47', flexShrink: 0 }} />
                          <strong style={{ color: '#0e2b24', fontSize: '13px' }}>Kelas {c.name}</strong>
                        </div>
                      </td>
                      <td>
                        <span className={`class-level-badge ${lvlClass || 'vii'}`}>
                          {c.level}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <strong className="s5-tnum" style={{ color: '#0e2e26' }}>{total} JP</strong>
                          <span style={{ fontSize: '11px', color: '#5f7c72' }}>({reqs.length} mapel)</span>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={c.isActive ? 'success' : 'neutral'}>
                          {c.isActive ? 'Aktif' : 'Nonaktif'}
                        </StatusPill>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="s5-action-dock" style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="s5-dock-btn primary"
                            onClick={() => onEditClass(c)}
                            title="Edit data kelas"
                          >
                            <Edit2 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="s5-dock-btn"
                            onClick={() => onDelete('classes', c.id)}
                            title="Hapus kelas"
                            style={{ color: '#8F2D24' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Teachers Table */}
        {activeTab === 'teachers' && paginatedList.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="s5-checkbox-col">
                    <label className="s5-checkbox-label" title={isAllPageSelected ? 'Batal pilih halaman ini' : 'Pilih semua di halaman ini'}>
                      <input
                        type="checkbox"
                        className="s5-checkbox-input"
                        checked={isAllPageSelected}
                        onChange={toggleSelectPage}
                        aria-label="Pilih semua guru di halaman ini"
                      />
                      <span className={`s5-checkbox-box ${isSomePageSelected ? 'indeterminate' : ''}`}>
                        {isAllPageSelected ? <Check size={12} strokeWidth={3} /> : isSomePageSelected ? <Minus size={12} strokeWidth={3} /> : null}
                      </span>
                    </label>
                  </th>
                  <th>Dewan Asatidz &amp; Guru</th>
                  <th>Jabatan</th>
                  <th>Kode</th>
                  <th>Kualifikasi Mapel</th>
                  <th>Beban Jam Mengajar (JP)</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedList as Teacher[]).map((t) => {
                  const teacherReqs = state.requirements.filter((r) => r.teacherId === t.id);
                  const totalAssignedJP = teacherReqs.reduce((sum, r) => sum + r.requiredJP, 0);
                  const maxJP = t.maxWeeklyJP || 24;
                  const pct = Math.round((totalAssignedJP / maxJP) * 100);
                  const isOverload = totalAssignedJP > maxJP;
                  const isOptimal = totalAssignedJP >= 20 && totalAssignedJP <= maxJP;
                  const roleVariant = getRoleBadgeVariant(t.roleTitle);
                  const isSelected = selectedSet.has(t.id);

                  return (
                    <tr key={t.id} className={isSelected ? 's5-row-selected' : undefined}>
                      <td className="s5-checkbox-col">
                        <label className="s5-checkbox-label" onClick={(e) => e.stopPropagation()} title={`Pilih ${t.name}`}>
                          <input
                            type="checkbox"
                            className="s5-checkbox-input"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(t.id)}
                            aria-label={`Pilih ${t.name}`}
                          />
                          <span className="s5-checkbox-box">
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </span>
                        </label>
                      </td>
                      <td>
                        <div className="teacher-avatar-cell">
                          <MadrasahTeacherAvatar teacher={t} size={42} showStatusDot={true} />
                          <div className="teacher-meta-col">
                            <strong className="teacher-name-text">{t.name}</strong>
                            <span className="teacher-nip-text">
                              {t.nip ? `NIP. ${t.nip}` : `KODE: ${t.code}`}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`prestige-role-tag ${roleVariant}`}>
                          {t.roleTitle || 'Guru Mapel'}
                        </span>
                      </td>
                      <td><span className="code-pill">{t.code}</span></td>
                      <td>
                        <div className="tag-list">
                          {t.subjectIds.slice(0, 3).map((sid) => {
                            const sub = getSubject(state, sid);
                            return sub ? (
                              <span key={sid} className="subject-tag" title={sub.name}>
                                <i style={{ background: sub.color }} />
                                {sub.code}
                              </span>
                            ) : null;
                          })}
                          {t.subjectIds.length > 3 && (
                            <span
                              className="subject-tag-more"
                              title={t.subjectIds
                                .slice(3)
                                .map((sid) => getSubject(state, sid)?.name)
                                .filter(Boolean)
                                .join(', ')}
                            >
                              +{t.subjectIds.length - 3}
                            </span>
                          )}
                          {t.subjectIds.length === 0 && (
                            <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>
                              Belum diatur
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div
                          className="prestige-workload-cell"
                          onClick={() => onNavigate && onNavigate('workload')}
                          title={onNavigate ? 'Klik untuk analisis beban kerja mengajar' : undefined}
                        >
                          <div className="workload-gauge-top">
                            <span className="workload-jp-val" style={{ color: isOverload ? '#b24c3d' : '#14382f' }}>
                              <strong>{totalAssignedJP}</strong>/{maxJP}{' '}
                              <small style={{ color: '#526861', fontSize: '11px' }}>JP</small>
                            </span>
                            <span className={`workload-pct-badge ${isOverload ? 'overload' : isOptimal ? 'optimal' : 'normal'}`}>
                              {pct}%
                            </span>
                          </div>
                          <div className="workload-gauge-bar">
                            <div
                              className="workload-gauge-fill"
                              style={{
                                width: `${Math.min(100, pct)}%`,
                                background: isOverload ? '#dc2626' : isOptimal ? '#166534' : '#1f6a5b',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusPill status={t.isActive ? 'success' : 'neutral'}>
                          {t.isActive ? 'Aktif' : 'Nonaktif'}
                        </StatusPill>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="s5-action-dock" style={{ position: 'relative' }}>
                          <button
                            type="button"
                            className="s5-dock-btn primary"
                            onClick={() => (onInspectTeacher ? onInspectTeacher(t) : onEditTeacher(t))}
                            title="Inspeksi data & jadwal pendidik (Laci Samping V5)"
                          >
                            <Pencil size={13} />
                            <span>Inspeksi</span>
                          </button>
                          <button
                            type="button"
                            className="s5-dock-btn kebab"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenKebabId(openKebabId === t.id ? null : t.id);
                            }}
                            title="Opsi Lanjutan"
                          >
                            <MoreHorizontal size={14} />
                          </button>

                          {openKebabId === t.id && (
                            <div className="s5-popover-menu" onClick={(e) => e.stopPropagation()}>
                              {onOpenTeacherAssignments && (
                                <button
                                  type="button"
                                  className="s5-menu-item"
                                  onClick={() => {
                                    setOpenKebabId(null);
                                    onOpenTeacherAssignments(t);
                                  }}
                                >
                                  <Award size={13} />
                                  <span>Penugasan &amp; Dokumen</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="s5-menu-item"
                                onClick={() => {
                                  setOpenKebabId(null);
                                  onEditTeacher(t);
                                }}
                              >
                                <Edit2 size={13} />
                                <span>Edit Lengkap (Modal)</span>
                              </button>
                              {onNavigate && (
                                <button
                                  type="button"
                                  className="s5-menu-item"
                                  onClick={() => {
                                    setOpenKebabId(null);
                                    onNavigate('workload');
                                  }}
                                >
                                  <LayoutGrid size={13} />
                                  <span>Analisis Beban JP</span>
                                </button>
                              )}
                              <button
                                type="button"
                                className="s5-menu-item danger"
                                onClick={() => {
                                  setOpenKebabId(null);
                                  onDelete('teachers', t.id);
                                }}
                              >
                                <Trash2 size={13} />
                                <span>Hapus Guru</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Subjects Table */}
        {activeTab === 'subjects' && paginatedList.length > 0 && (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="s5-checkbox-col">
                    <label className="s5-checkbox-label" title={isAllPageSelected ? 'Batal pilih halaman ini' : 'Pilih semua di halaman ini'}>
                      <input
                        type="checkbox"
                        className="s5-checkbox-input"
                        checked={isAllPageSelected}
                        onChange={toggleSelectPage}
                        aria-label="Pilih semua mapel di halaman ini"
                      />
                      <span className={`s5-checkbox-box ${isSomePageSelected ? 'indeterminate' : ''}`}>
                        {isAllPageSelected ? <Check size={12} strokeWidth={3} /> : isSomePageSelected ? <Minus size={12} strokeWidth={3} /> : null}
                      </span>
                    </label>
                  </th>
                  <th>Mata Pelajaran</th>
                  <th>Kode</th>
                  <th>Guru Pengampu Berkualifikasi</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {(paginatedList as Subject[]).map((s) => {
                  const teachers = state.teachers.filter((t) => t.isActive && t.subjectIds.includes(s.id));
                  const isSelected = selectedSet.has(s.id);
                  return (
                    <tr key={s.id} className={isSelected ? 's5-row-selected' : undefined}>
                      <td className="s5-checkbox-col">
                        <label className="s5-checkbox-label" onClick={(e) => e.stopPropagation()} title={`Pilih ${s.name}`}>
                          <input
                            type="checkbox"
                            className="s5-checkbox-input"
                            checked={isSelected}
                            onChange={() => toggleSelectOne(s.id)}
                            aria-label={`Pilih ${s.name}`}
                          />
                          <span className="s5-checkbox-box">
                            {isSelected && <Check size={12} strokeWidth={3} />}
                          </span>
                        </label>
                      </td>
                      <td>
                        <div className="subject-jewel-cell">
                          <span className="subject-jewel-swatch" style={{ background: s.color }} />
                          <strong className="subject-jewel-name">{s.name}</strong>
                        </div>
                      </td>
                      <td><span className="code-pill">{s.code}</span></td>
                      <td>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 600,
                            color: teachers.length > 0 ? '#16483f' : '#b45309',
                          }}
                          title={teachers.map((t) => t.name).join(', ') || 'Belum ada guru yang mengampu mapel ini'}
                        >
                          {teachers.length > 0 ? `${teachers.length} Guru Pengampu` : 'Belum Ada Guru'}
                        </span>
                      </td>
                      <td>
                        <StatusPill status={s.isActive ? 'success' : 'neutral'}>
                          {s.isActive ? 'Aktif' : 'Nonaktif'}
                        </StatusPill>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="s5-action-dock" style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="s5-dock-btn primary"
                            onClick={() => onEditSubject(s)}
                            title="Edit mata pelajaran"
                          >
                            <Edit2 size={13} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="s5-dock-btn"
                            onClick={() => onDelete('subjects', s.id)}
                            title="Hapus mapel"
                            style={{ color: '#8F2D24' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Bespoke Madrasah Empty State */}
        {paginatedList.length === 0 && (
          <div className="master-empty-state" role="status" aria-live="polite">
            <svg className="master-empty-illustration" viewBox="0 0 160 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="25" y="15" width="110" height="90" rx="8" fill="#f0f7f3" stroke="#bce0ce" strokeWidth="1.5" />
              <path d="M40 35H120M40 50H100M40 65H110M40 80H80" stroke="#a3c9b7" strokeWidth="2" strokeLinecap="round" />
              <circle cx="108" cy="78" r="18" fill="#ffffff" stroke="#16a34a" strokeWidth="2" />
              <path d="M121 91L135 105" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
              <path d="M102 78L106 82L115 73" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polygon points="80,10 83,16 90,16 85,20 87,26 80,22 73,26 75,20 70,16 77,16" fill="#f1cf68" />
            </svg>
            <h3 className="master-empty-title">
              {search || filterPreset !== 'all'
                ? 'Tidak Ada Data yang Cocok'
                : `Belum Ada Data ${activeTab === 'classes' ? 'Kelas' : activeTab === 'teachers' ? 'Guru' : 'Mapel'}`}
            </h3>
            <p className="master-empty-desc">
              {search || filterPreset !== 'all'
                ? `Pencarian "${search}" atau filter yang diterapkan tidak menemukan entitas ${activeTab === 'classes' ? 'kelas' : activeTab === 'teachers' ? 'guru' : 'mapel'}.`
                : `Mulai dengan menambahkan data master ${activeTab === 'classes' ? 'kelas' : activeTab === 'teachers' ? 'guru' : 'mapel'} pertama untuk madrasah Anda.`}
            </p>
            {search || filterPreset !== 'all' ? (
              <button
                type="button"
                className="master-empty-reset-btn"
                onClick={() => {
                  onSearch('');
                  setFilterPreset('all');
                }}
              >
                <RotateCcw size={14} />
                <span>Reset Filter &amp; Pencarian</span>
              </button>
            ) : (
              <Button
                icon={Plus}
                onClick={() =>
                  onOpenAddModal
                    ? onOpenAddModal(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject')
                    : onAdd(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject')
                }
              >
                Tambah {activeTab === 'classes' ? 'Kelas' : activeTab === 'teachers' ? 'Guru' : 'Mapel'}
              </Button>
            )}
          </div>
        )}

        {currentList.length > 0 && (
          <TablePagination
            totalItems={currentList.length}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </Card>

      {/* Floating Bulk Action Toolbar for Master Data Selection */}
      {validSelectedIds.length > 0 && (
        <div className="s5-bulk-floating-bar" role="region" aria-label="Toolbar Tindakan Massal Data Master">
          <div className="s5-bulk-selection-meta">
            <span className="s5-bulk-count-badge s5-tnum">{validSelectedIds.length}</span>
            <span className="s5-bulk-label">{tabEntityLabel} Terpilih</span>
            {currentList.length > validSelectedIds.length && (
              <button
                type="button"
                className="s5-bulk-select-all-link"
                onClick={selectAllFiltered}
              >
                Pilih Semua ({currentList.length})
              </button>
            )}
          </div>

          <div className="s5-bulk-divider" aria-hidden="true" />

          <div className="s5-bulk-actions">
            {!confirmBulkDelete && !confirmBulkStatus ? (
              <>
                {onBulkToggleActive && (
                  <button
                    type="button"
                    className="s5-bulk-btn status"
                    onClick={() => setConfirmBulkStatus(true)}
                    title={`Ubah status aktif ${validSelectedIds.length} ${tabEntityLabel} terpilih`}
                  >
                    <ToggleRight size={14} />
                    <span>Ubah Status Aktif</span>
                  </button>
                )}
                {onBulkExport && (
                  <button
                    type="button"
                    className="s5-bulk-btn export"
                    onClick={() => onBulkExport(activeTab, validSelectedIds)}
                    title={`Ekspor ${validSelectedIds.length} ${tabEntityLabel} terpilih ke CSV`}
                  >
                    <Download size={14} />
                    <span>Ekspor CSV Terpilih</span>
                  </button>
                )}
                {onBulkDelete && (
                  <button
                    type="button"
                    className="s5-bulk-btn danger"
                    onClick={() => setConfirmBulkDelete(true)}
                    title={`Hapus ${validSelectedIds.length} ${tabEntityLabel} terpilih`}
                  >
                    <Trash2 size={14} />
                    <span>Hapus Terpilih</span>
                  </button>
                )}
              </>
            ) : confirmBulkStatus ? (
              <>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#E5C378', marginRight: '2px' }}>
                  Status {validSelectedIds.length} {tabEntityLabel}:
                </span>
                <button
                  type="button"
                  className="s5-bulk-btn activate"
                  onClick={() => {
                    onBulkToggleActive?.(activeTab, validSelectedIds, true);
                    clearSelection();
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>Aktifkan</span>
                </button>
                <button
                  type="button"
                  className="s5-bulk-btn deactivate"
                  onClick={() => {
                    onBulkToggleActive?.(activeTab, validSelectedIds, false);
                    clearSelection();
                  }}
                >
                  <XCircle size={14} />
                  <span>Nonaktifkan</span>
                </button>
                <button
                  type="button"
                  className="s5-bulk-btn subtle"
                  onClick={() => setConfirmBulkStatus(false)}
                >
                  Batal
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#FCA5A5', marginRight: '2px' }}>
                  Hapus {validSelectedIds.length} {tabEntityLabel}?
                </span>
                <button
                  type="button"
                  className="s5-bulk-btn confirm-danger"
                  onClick={() => {
                    onBulkDelete?.(activeTab, validSelectedIds);
                    clearSelection();
                  }}
                >
                  <Check size={14} />
                  <span>Ya, Hapus</span>
                </button>
                <button
                  type="button"
                  className="s5-bulk-btn subtle"
                  onClick={() => setConfirmBulkDelete(false)}
                >
                  Batal
                </button>
              </>
            )}
          </div>

          <button
            type="button"
            className="s5-bulk-close"
            onClick={clearSelection}
            title="Batalkan semua pilihan"
            aria-label="Batalkan pilihan"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </>
  );
}

/**
 * REQUIREMENTS & ALLOCATIONS SCREEN
 */
function RequirementsScreen({
  state,
  masterIssues,
  formOpen,
  setFormOpen,
  form,
  setForm,
  onSave,
  onDelete,
  onGenerate,
  onNavigate: _onNavigate,
  onEdit,
  onOpenAddModal,
  onBatchCopyRequirements,
}: {
  state: AppState;
  masterIssues?: ValidationIssue[];
  formOpen: boolean;
  setFormOpen: (value: boolean) => void;
  form: typeof emptyRequirementForm;
  setForm: (value: typeof emptyRequirementForm) => void;
  onSave: (event: FormEvent) => void;
  onDelete: (requirement: Requirement) => void;
  onGenerate: () => void;
  onNavigate?: (screen: ScreenId) => void;
  onEdit?: (r: Requirement) => void;
  onOpenAddModal?: () => void;
  onBatchCopyRequirements?: (sourceClassId: string, targetClassId: string) => void;
}) {
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [onlyIssuesFilter, setOnlyIssuesFilter] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reqPageSize, setReqPageSize] = useState<number>(10);
  const [reqPage, setReqPage] = useState<number>(1);

  // Template Copy Modal State
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceClassId, setCopySourceClassId] = useState<string>(() => state.classes[0]?.id ?? '');
  const [copyTargetClassId, setCopyTargetClassId] = useState<string>(() => state.classes[1]?.id ?? state.classes[0]?.id ?? '');

  useEffect(() => {
    setReqPage(1);
  }, [selectedClassFilter, onlyIssuesFilter, searchQuery]);

  // 1. Calculate Total Weekly Slots per Class
  const totalWeeklySlots = useMemo(() => {
    return state.settings.activeDays.reduce(
      (sum, day) => sum + teachingPeriodsForDay(state.slots, day).length,
      0
    );
  }, [state.settings.activeDays, state.slots]);

  const totalJP = state.requirements.reduce((sum, item) => sum + item.requiredJP, 0);

  // 2. Real-Time Class Capacity Metrics
  const classCapacityStats = useMemo(() => {
    return state.classes
      .filter((c) => c.isActive)
      .map((cls) => {
        const classReqs = state.requirements.filter((r) => r.classId === cls.id);
        const allocatedJP = classReqs.reduce((sum, r) => sum + r.requiredJP, 0);
        const diff = allocatedJP - totalWeeklySlots;
        const isExact = diff === 0;
        const isOver = diff > 0;
        const isUnder = diff < 0;
        return {
          cls,
          allocatedJP,
          diff,
          isExact,
          isOver,
          isUnder,
          reqCount: classReqs.length,
        };
      });
  }, [state.classes, state.requirements, totalWeeklySlots]);

  // 3. Real-Time Teacher Workload Metrics
  const teacherWorkloadStats = useMemo(() => {
    const map = new Map<string, { totalJP: number; maxJP: number; isOver: boolean; isFull: boolean; pct: number }>();
    for (const t of state.teachers) {
      const reqs = state.requirements.filter((r) => r.teacherId === t.id);
      const teacherTotalJP = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
      const maxJP = t.maxWeeklyJP || 24;
      map.set(t.id, {
        totalJP: teacherTotalJP,
        maxJP,
        isOver: teacherTotalJP > maxJP,
        isFull: teacherTotalJP === maxJP,
        pct: Math.round((teacherTotalJP / maxJP) * 100),
      });
    }
    return map;
  }, [state.teachers, state.requirements]);

  // 4. Real-Time Data Master Issues
  const liveIssues = useMemo(() => {
    return masterIssues ?? validateMasterData(state);
  }, [masterIssues, state]);

  const criticalIssues = useMemo(() => liveIssues.filter((i) => i.severity === 'error'), [liveIssues]);
  const warningIssues = useMemo(() => liveIssues.filter((i) => i.severity === 'warning'), [liveIssues]);

  // Filtered Requirements
  const filteredRequirements = useMemo(() => {
    return state.requirements.filter((r) => {
      if (selectedClassFilter !== 'ALL' && r.classId !== selectedClassFilter) return false;

      const tStat = teacherWorkloadStats.get(r.teacherId);
      const cStat = classCapacityStats.find((c) => c.cls.id === r.classId);

      if (onlyIssuesFilter) {
        const hasIssue = tStat?.isOver || cStat?.isOver || cStat?.isUnder;
        if (!hasIssue) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const clsName = getClass(state, r.classId)?.name.toLowerCase() ?? '';
        const subName = getSubject(state, r.subjectId)?.name.toLowerCase() ?? '';
        const tchName = getTeacher(state, r.teacherId)?.name.toLowerCase() ?? '';
        if (!clsName.includes(q) && !subName.includes(q) && !tchName.includes(q)) return false;
      }

      return true;
    });
  }, [state, selectedClassFilter, onlyIssuesFilter, searchQuery, teacherWorkloadStats, classCapacityStats]);

  // Inline Form Simulation Calculations
  const simTeacher = state.teachers.find((t) => t.id === form.teacherId);
  const simClass = state.classes.find((c) => c.id === form.classId);
  const simSubject = state.subjects.find((s) => s.id === form.subjectId);
  const simJP = Number(form.requiredJP) || 0;

  const currentTeacherJP = state.requirements
    .filter((r) => r.teacherId === form.teacherId)
    .reduce((sum, r) => sum + r.requiredJP, 0);
  const nextTeacherJP = currentTeacherJP + simJP;
  const simTeacherMax = simTeacher?.maxWeeklyJP || 24;
  const isSimTeacherOver = nextTeacherJP > simTeacherMax;

  const currentClassJP = state.requirements
    .filter((r) => r.classId === form.classId)
    .reduce((sum, r) => sum + r.requiredJP, 0);
  const nextClassJP = currentClassJP + simJP;
  const isSimClassOver = nextClassJP > totalWeeklySlots;
  const isSimClassExact = nextClassJP === totalWeeklySlots;

  const isFormTeacherQualified = simTeacher && form.subjectId ? simTeacher.subjectIds.includes(form.subjectId) : false;

  return (
    <>
      <PageHeading
        kicker="CURRICULUM PLANNING & MASTER VALIDATION"
        title="Kebutuhan &amp; Alokasi JP"
        description={`Tetapkan alokasi jam pelajaran mingguan untuk tiap kelas (${totalJP} JP terdaftar) dan pantau kepatuhan data master secara langsung.`}
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              icon={Copy}
              onClick={() => setCopyModalOpen(true)}
            >
              Salin Alokasi Rombel
            </Button>
            <Button
              variant={criticalIssues.length > 0 ? 'secondary' : 'primary'}
              icon={WandSparkles}
              onClick={onGenerate}
            >
              Susun Jadwal Otomatis
            </Button>
            <Button
              icon={Plus}
              onClick={() => (onOpenAddModal ? onOpenAddModal() : setFormOpen(!formOpen))}
            >
              Tambah Alokasi
            </Button>
          </div>
        }
      />

      {/* MODAL SALIN ALOKASI ROMBEL (TEMPLATE) */}
      {copyModalOpen && (
        <div className="s5-drawer-overlay" style={{ display: 'grid', placeItems: 'center' }}>
          <div
            className="surface-card"
            style={{
              width: '460px',
              maxWidth: '92vw',
              padding: '24px',
              boxShadow: 'var(--s5-shadow-floating)',
              borderRadius: '14px',
              animation: 's5MenuFadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#C5A059', letterSpacing: '0.05em' }}>
                  TEMPLATE COPY ENGINE
                </span>
                <h3 style={{ margin: '2px 0 0', fontSize: '16px', fontWeight: 700, color: '#0B2923' }}>
                  Salin Alokasi Kurikulum Rombel
                </h3>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setCopyModalOpen(false)}
                aria-label="Tutup modal"
              >
                <X size={16} />
              </button>
            </div>

            <p style={{ fontSize: '12px', color: '#556663', marginBottom: '18px', lineHeight: 1.5 }}>
              Duplikasi seluruh alokasi mapel dan jam mengajar dari kelas sumber ke kelas tujuan. Sangat ideal untuk kelas paralel (contoh: 7A ke 7B).
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#0B2923', marginBottom: '6px' }}>
                  Rombel Asal (Sumber Template)
                </label>
                <select
                  value={copySourceClassId}
                  onChange={(e) => setCopySourceClassId(e.target.value)}
                  className="input-select"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                >
                  {state.classes.filter(c => c.isActive).map((c) => {
                    const reqCount = state.requirements.filter(r => r.classId === c.id).length;
                    const totalJp = state.requirements.filter(r => r.classId === c.id).reduce((s, r) => s + r.requiredJP, 0);
                    return (
                      <option key={c.id} value={c.id}>
                        Kelas {c.name} ({reqCount} mapel · {totalJp} JP)
                      </option>
                    );
                  })}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11.5px', fontWeight: 700, color: '#0B2923', marginBottom: '6px' }}>
                  Rombel Tujuan (Akan Diisi)
                </label>
                <select
                  value={copyTargetClassId}
                  onChange={(e) => setCopyTargetClassId(e.target.value)}
                  className="input-select"
                  style={{ width: '100%', height: '38px', borderRadius: '8px' }}
                >
                  {state.classes.filter(c => c.isActive).map((c) => (
                    <option key={c.id} value={c.id} disabled={c.id === copySourceClassId}>
                      Kelas {c.name} {c.id === copySourceClassId ? '(Kelas Asal)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ padding: '10px 14px', background: '#F8FAF7', borderRadius: '8px', border: '0.75px solid #CCD8D2', fontSize: '11.5px', color: '#556663' }}>
                <strong style={{ color: '#124037' }}>Catatan Operasional:</strong> Alokasi kelas tujuan sebelumnya akan digantikan secara presisi dengan alokasi baru dari kelas asal.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <Button variant="secondary" onClick={() => setCopyModalOpen(false)}>
                Batal
              </Button>
              <Button
                variant="primary"
                icon={Copy}
                disabled={!copySourceClassId || !copyTargetClassId || copySourceClassId === copyTargetClassId}
                onClick={() => {
                  if (onBatchCopyRequirements) {
                    onBatchCopyRequirements(copySourceClassId, copyTargetClassId);
                  }
                  setCopyModalOpen(false);
                }}
              >
                Terapkan Salinan Alokasi &rarr;
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Requirements & Capacity KPI Grid */}
      <div className="requirements-metric-grid">
        <KpiMotionCard className="req-metric" index={0}>
          <div className="req-metric-mark">
            <BookOpen size={18} />
          </div>
          <div className="req-metric-copy">
            <span>TOTAL KEBUTUHAN</span>
            <strong>
              <KpiAnimatedNumber value={totalJP} suffix=" JP" />
            </strong>
            <small>{state.requirements.length} Alokasi Mapel Terdata</small>
          </div>
        </KpiMotionCard>

        <KpiMotionCard className="req-metric" index={1}>
          <div className="req-metric-mark blue">
            <Clock size={18} />
          </div>
          <div className="req-metric-copy">
            <span>KAPASITAS KBM</span>
            <strong>
              <KpiAnimatedNumber value={totalWeeklySlots * state.classes.filter((c) => c.isActive).length} suffix=" JP" />
            </strong>
            <small>{totalWeeklySlots} JP per Rombel / Pekan</small>
          </div>
        </KpiMotionCard>

        <KpiMotionCard className="req-metric" index={2}>
          <div className="req-metric-mark amber">
            <TrendingUp size={18} />
          </div>
          <div className="req-metric-copy">
            <span>KESEIMBANGAN ALOKASI</span>
            <strong
              style={{
                color: totalJP === totalWeeklySlots * state.classes.filter((c) => c.isActive).length ? '#1f6850' : '#b24c3d',
              }}
            >
              {totalJP === totalWeeklySlots * state.classes.filter((c) => c.isActive).length ? (
                <KpiAnimatedNumber value={100} suffix="% Pas" />
              ) : totalJP > totalWeeklySlots * state.classes.filter((c) => c.isActive).length ? (
                <>
                  Surplus +<KpiAnimatedNumber value={totalJP - totalWeeklySlots * state.classes.filter((c) => c.isActive).length} suffix=" JP" />
                </>
              ) : (
                <>
                  Kurang <KpiAnimatedNumber value={totalWeeklySlots * state.classes.filter((c) => c.isActive).length - totalJP} suffix=" JP" />
                </>
              )}
            </strong>
            <small>
              {totalJP === totalWeeklySlots * state.classes.filter((c) => c.isActive).length
                ? 'Seluruh slot KBM terisi pas'
                : 'Perlu diselaraskan dengan JP KBM'}
            </small>
          </div>
        </KpiMotionCard>

        <KpiMotionCard className="req-metric" index={3}>
          <div className="req-metric-mark violet">
            <CheckCircle2 size={18} />
          </div>
          <div className="req-metric-copy">
            <span>ROMBEL TUNTAS</span>
            <strong>
              <KpiAnimatedNumber value={classCapacityStats.filter((c) => c.isExact).length} /> / {classCapacityStats.length}
            </strong>
            <small>
              {classCapacityStats.filter((c) => !c.isExact).length === 0
                ? 'Semua rombel tepat kapasitas'
                : `${classCapacityStats.filter((c) => !c.isExact).length} rombel butuh penyesuaian`}
            </small>
          </div>
        </KpiMotionCard>
      </div>

      {/* Live Issue Context Notice (Calm & Compact) */}
      {liveIssues.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', background: '#fefce8', border: '1px solid #fef08a', borderRadius: '10px', marginTop: '14px', fontSize: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#854d0e' }}>
            <AlertTriangle size={15} />
            <span>Terdeteksi <strong>{criticalIssues.length} isu kritis</strong> dan <strong>{warningIssues.length} peringatan</strong> alokasi JP.</span>
          </div>
          <button
            type="button"
            className="button button-quiet"
            style={{ height: '28px', fontSize: '11.5px' }}
            onClick={() => setOnlyIssuesFilter(!onlyIssuesFilter)}
          >
            {onlyIssuesFilter ? 'Tampilkan Semua Alokasi' : 'Saring Hanya Isu'}
          </button>
        </div>
      )}

      {/* 3. INLINE FORM WITH REAL-TIME SIMULATION */}
      {formOpen && (
        <Card eyebrow="NEW ALLOCATION" title="Tambah Alokasi JP">
          <form className="requirement-form-grid" onSubmit={onSave}>
            <div className="field-group">
              <label>Kelas</label>
              <select required value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                <option value="">Pilih kelas</option>
                {state.classes.filter((c) => c.isActive).map((c) => (
                  <option key={c.id} value={c.id}>Kelas {c.name}</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label>Mata Pelajaran</label>
              <select
                required
                value={form.subjectId}
                onChange={(e) => {
                  const sid = e.target.value;
                  const t = state.teachers.find((tch) => tch.isActive && tch.subjectIds.includes(sid));
                  setForm({ ...form, subjectId: sid, teacherId: t?.id ?? '' });
                }}
              >
                <option value="">Pilih mapel</option>
                {state.subjects.filter((s) => s.isActive).map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>
            <div className="field-group">
              <label>Guru Pengampu</label>
              <select required value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">Pilih guru</option>
                {state.teachers.filter((t) => t.isActive && form.subjectId && t.subjectIds.includes(form.subjectId)).length > 0 && (
                  <optgroup label="Guru Sesuai Kualifikasi Mapel">
                    {state.teachers
                      .filter((t) => t.isActive && form.subjectId && t.subjectIds.includes(form.subjectId))
                      .map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                      ))}
                  </optgroup>
                )}
                <optgroup label="Semua Guru Terdaftar Lainnya (Lintas Mapel)">
                  {state.teachers
                    .filter((t) => !form.subjectId || !t.subjectIds.includes(form.subjectId))
                    .map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.code})</option>
                    ))}
                </optgroup>
              </select>
            </div>
            <div className="field-group">
              <label>Alokasi (JP/minggu)</label>
              <input required type="number" min="1" max="50" value={form.requiredJP} onChange={(e) => setForm({ ...form, requiredJP: e.target.value })} />
            </div>
            <div className="requirement-form-actions">
              <Button type="submit" icon={Save}>Simpan Alokasi</Button>
            </div>
          </form>

          {/* Real-Time Live Form Simulation Card */}
          {form.classId && form.teacherId && (
            <div
              style={{
                marginTop: '14px',
                padding: '12px 14px',
                background: '#f4f8f5',
                borderRadius: '9px',
                border: '1px solid #c9ded2',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: '#274b43' }}>Simulasi Kapasitas Kelas {simClass?.name}:</span>
                  <strong style={{ color: isSimClassOver ? '#b24c3d' : isSimClassExact ? '#1f6952' : '#173637' }}>
                    {nextClassJP} / {totalWeeklySlots} JP
                  </strong>
                </div>
                <div style={{ height: '5px', background: '#e0e7e3', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, (nextClassJP / (totalWeeklySlots || 1)) * 100)}%`,
                      height: '100%',
                      background: isSimClassOver ? '#b24c3d' : isSimClassExact ? '#1f6952' : '#2563eb',
                    }}
                  />
                </div>
                <small style={{ color: isSimClassOver ? '#b24c3d' : '#556663', marginTop: '3px', display: 'block' }}>
                  {isSimClassOver
                    ? `⚠️ Alokasi melebihi kapasitas kelas (${nextClassJP - totalWeeklySlots} JP kelebihan)`
                    : isSimClassExact
                    ? '✓ Tepat memenuhi kapasitas mingguan'
                    : `Sisa ${totalWeeklySlots - nextClassJP} slot JP`}
                </small>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                  <span style={{ color: '#274b43' }}>Simulasi Beban Guru {simTeacher?.name}:</span>
                  <strong style={{ color: isSimTeacherOver ? '#b24c3d' : '#173637' }}>
                    {nextTeacherJP} / {simTeacherMax} JP
                  </strong>
                </div>
                <div style={{ height: '5px', background: '#e0e7e3', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${Math.min(100, (nextTeacherJP / (simTeacherMax || 1)) * 100)}%`,
                      height: '100%',
                      background: isSimTeacherOver ? '#b24c3d' : nextTeacherJP === simTeacherMax ? '#1f6952' : '#2563eb',
                    }}
                  />
                </div>
                <small style={{ color: isSimTeacherOver ? '#b24c3d' : '#556663', marginTop: '3px', display: 'block' }}>
                  {isSimTeacherOver
                    ? `⚠️ Beban guru melebihi batas maksimum (+${nextTeacherJP - simTeacherMax} JP)`
                    : `${Math.round((nextTeacherJP / simTeacherMax) * 100)}% dari batas maksimum guru`}
                </small>
              </div>

              {!isFormTeacherQualified && simSubject && (
                <div style={{ gridColumn: '1 / -1', fontSize: '11px', color: '#16483f' }}>
                  ℹ Guru {simTeacher?.name} belum memiliki kualifikasi {simSubject.name}; sistem akan otomatis menyinkronkannya ke Data Master saat disimpan.
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* 4. TOOLBAR & FILTER CONTROLS */}
      <div className="toolbar-card" style={{ marginTop: '16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '200px' }}>
          <Search size={15} style={{ color: '#556663' }} />
          <input
            type="text"
            placeholder="Cari kelas, mapel, atau guru..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ border: 0, outline: 'none', background: 'transparent', width: '100%', fontSize: '12.5px' }}
          />
          {searchQuery && (
            <button className="icon-button" onClick={() => setSearchQuery('')} style={{ height: '24px', width: '24px' }}>
              <X size={13} />
            </button>
          )}
        </div>

        <div className="toolbar-divider" />

        <div className="class-selector-wrap" style={{ minWidth: '160px' }}>
          <div className="select-with-icon">
            <GraduationCap size={14} />
            <select
              value={selectedClassFilter}
              onChange={(e) => setSelectedClassFilter(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: 600, color: '#16483f' }}
            >
              <option value="ALL">Semua Rombel ({classCapacityStats.length})</option>
              {classCapacityStats.map((c) => (
                <option key={c.cls.id} value={c.cls.id}>
                  Kelas {c.cls.name} ({c.allocatedJP}/{totalWeeklySlots} JP)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-divider" />

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#556663', fontWeight: 700 }}>
            Menampilkan {filteredRequirements.length} dari {state.requirements.length} Alokasi
          </span>
          {onlyIssuesFilter && (
            <span style={{ fontSize: '11px', background: '#fdf0ee', color: '#b24c3d', padding: '2px 7px', borderRadius: '4px', fontWeight: 600 }}>
              Filter Isu Aktif
            </span>
          )}
        </div>
      </div>

      {/* 5. REQUIREMENTS TABLE WITH LIVE DATA MASTER STATUS */}
      <div className="data-table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Kelas &amp; Kapasitas</th>
              <th>Mata Pelajaran</th>
              <th>Guru Pengampu &amp; Status Beban</th>
              <th>Alokasi JP</th>
              <th style={{ textAlign: 'right' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {!filteredRequirements.length ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '32px 16px', color: '#526861' }}>
                  Tidak ada data alokasi yang sesuai dengan filter yang dipilih.
                </td>
              </tr>
            ) : (
              (reqPageSize === 0 ? filteredRequirements : filteredRequirements.slice((reqPage - 1) * reqPageSize, reqPage * reqPageSize)).map((r) => {
                const cls = getClass(state, r.classId);
                const sub = getSubject(state, r.subjectId);
                const tch = getTeacher(state, r.teacherId);
                const tStat = tch ? teacherWorkloadStats.get(tch.id) : undefined;
                const cStat = classCapacityStats.find((c) => c.cls.id === r.classId);
                const isTchOver = tStat?.isOver ?? false;
                const isClsOver = cStat?.isOver ?? false;
                const isClsUnder = cStat?.isUnder ?? false;

                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <strong>Kelas {cls?.name}</strong>
                        <span style={{ fontSize: '11.5px', color: isClsOver ? '#b24c3d' : isClsUnder ? '#9c6f28' : '#1f6952', fontWeight: 600 }}>
                          {cStat?.allocatedJP ?? 0} / {totalWeeklySlots} JP
                          {isClsOver && ' (Kelebihan)'}
                          {isClsUnder && ` (Kurang ${Math.abs(cStat?.diff ?? 0)} JP)`}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <span className="subject-color-swatch" style={{ background: sub?.color, width: '6px', height: '24px', borderRadius: '3px' }} />
                        <div>
                          <strong style={{ fontSize: '13px' }}>{sub?.name}</strong>
                          <span style={{ fontSize: '11px', color: '#526861', display: 'block' }}>Kode: {sub?.code}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        <strong style={{ fontSize: '13px' }}>{tch?.name}</strong>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 600,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: isTchOver ? '#fdf0ee' : tStat?.isFull ? '#e8f5ee' : '#f0f4f8',
                              color: isTchOver ? '#b24c3d' : tStat?.isFull ? '#1f6952' : '#2563eb',
                            }}
                          >
                            Beban: {tStat?.totalJP ?? 0} / {tStat?.maxJP ?? 24} JP
                            {isTchOver && ` ⚠️ Overload (+${(tStat?.totalJP ?? 0) - (tStat?.maxJP ?? 24)} JP)`}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                        <strong style={{ fontSize: '14px', color: '#173637' }}>{r.requiredJP}</strong>
                        <span style={{ fontSize: '11px', color: '#556663' }}>JP/minggu</span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="s5-action-dock" style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                        {onEdit && (
                          <button
                            type="button"
                            className="s5-dock-btn primary"
                            onClick={() => onEdit(r)}
                            title="Edit alokasi kebutuhan"
                          >
                            <Edit2 size={13} />
                            <span>Edit</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="s5-dock-btn"
                          onClick={() => onDelete(r)}
                          title="Hapus alokasi"
                          style={{ color: '#8F2D24' }}
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
        <TablePagination
          totalItems={filteredRequirements.length}
          page={reqPage}
          pageSize={reqPageSize}
          onPageChange={setReqPage}
          onPageSizeChange={setReqPageSize}
        />
      </div>
    </>
  );
}

/**
 * VALIDATION SCREEN
 */
function ValidationScreen({
  state,
  report,
  masterIssues,
  expandedIssue: _expandedIssue,
  setExpandedIssue: _setExpandedIssue,
  onNavigate,
  onValidate,
}: {
  state: AppState;
  report: ReturnType<typeof validateSchedule>;
  masterIssues: ValidationIssue[];
  expandedIssue: string | null;
  setExpandedIssue: (id: string | null) => void;
  onNavigate?: (screen: ScreenId) => void;
  onValidate: () => void;
}) {
  const combined = [...masterIssues, ...report.issues];
  const hardErrors = combined.filter((i) => i.severity === 'error');

  return (
    <>
      <PageHeading
        kicker="RULE COMPLIANCE"
        title="Validasi &amp; Konflik Jadwal"
        description="Validator deterministik memastikan jadwal 100% mematuhi aturan keras sebelum diterbitkan."
        actions={
          <Button icon={RefreshCw} onClick={onValidate}>
            Uji Ulang Jadwal
          </Button>
        }
      />

      <div className={`validation-banner ${hardErrors.length ? 'validation-banner-warning' : 'validation-banner-good'}`}>
        <div className="validation-banner-mark">
          {hardErrors.length ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
        </div>
        <div>
          <h2>{hardErrors.length ? 'Terdapat Pelanggaran Aturan Wajib' : 'Jadwal Memenuhi Seluruh Aturan Wajib'}</h2>
          <p>{hardErrors.length ? 'Perbaiki bentrok sebelum menerbitkan jadwal.' : 'Tidak ada konflik guru atau bentrok kelas.'}</p>
        </div>
        <div className="validation-banner-count">
          <strong>{hardErrors.length}</strong>
          <span>HARD ERRORS</span>
        </div>
      </div>

      {/* Real-Time Compliance & Audit KPI Grid */}
      <div className="validation-summary-grid">
        <KpiMotionCard index={0}>
          <div className="validation-summary-icon teal">
            <ShieldCheck size={20} />
          </div>
          <div>
            <span>SKOR KEPATUHAN</span>
            <strong>
              <KpiAnimatedNumber
                value={Math.max(0, Math.min(100, 100 - hardErrors.length * 25 - (combined.length - hardErrors.length) * 5))}
                suffix="%"
              />
            </strong>
            <small>{hardErrors.length === 0 ? 'Lolos Semua Aturan' : `${hardErrors.length} Pelanggaran Wajib`}</small>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={1}>
          <div className="validation-summary-icon error">
            <XCircle size={20} />
          </div>
          <div>
            <span>KONFLIK KERAS</span>
            <strong style={{ color: hardErrors.length > 0 ? '#b42318' : '#1f6850' }}>
              <KpiAnimatedNumber value={hardErrors.length} />
            </strong>
            <small>{hardErrors.length === 0 ? 'Nihil Bentrok' : 'Wajib Diselesaikan'}</small>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={2}>
          <div className="validation-summary-icon warning">
            <AlertTriangle size={20} />
          </div>
          <div>
            <span>PERINGATAN LEMAH</span>
            <strong style={{ color: combined.length - hardErrors.length > 0 ? '#876123' : '#1f6850' }}>
              <KpiAnimatedNumber value={combined.length - hardErrors.length} />
            </strong>
            <small>Saran Distribusi &amp; Beban</small>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={3}>
          <div className="validation-summary-icon info">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <span>STATUS KELAYAKAN</span>
            <strong style={{ color: hardErrors.length === 0 ? '#1f6850' : '#b42318' }}>
              {hardErrors.length === 0 ? 'SIAP TERBIT' : 'DITAHAN'}
            </strong>
            <small>{hardErrors.length === 0 ? 'Jadwal Siap Edar' : 'Selesaikan Konflik'}</small>
          </div>
        </KpiMotionCard>
      </div>

      {/* AI Conflict Helper Integration */}
      {state.settings.geminiEnabled && (
        <AiConflictHelper
          issues={combined}
          geminiEnabledInSettings={state.settings.geminiEnabled}
          onNavigateToScreen={onNavigate as any}
        />
      )}

      {combined.length === 0 ? (
        <div className="surface-card" style={{ marginTop: '16px', padding: '32px 24px', textAlign: 'center', background: '#f5faf7', border: '1.5px solid #d1fae5' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#d1fae5', color: '#065f46', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
            <CheckCircle2 size={26} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: '17px', color: '#065f46', fontWeight: 700 }}>
            Audit Kepatuhan: 100% Bebas Bentrok
          </h3>
          <p style={{ margin: '0 0 16px', color: '#16483f', fontSize: '13px', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
            Seluruh jadwal KBM, kuota mingguan rombel, batas beban guru, dan slot khusus (Upacara/Religi/Istirahat) telah diverifikasi secara deterministik tanpa konflik.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            {onNavigate && (
              <Button onClick={() => onNavigate('schedule')} icon={CalendarDays}>
                Buka Matriks Jadwal
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="issue-list" style={{ marginTop: '16px' }}>
          {combined.map((issue, idx) => (
            <MotionStaggerItem
              key={issue.id}
              index={idx}
              className="s5-smart-swap-card"
              style={{
                borderColor: issue.severity === 'error' ? 'rgba(143, 45, 36, 0.4)' : 'rgba(197, 160, 89, 0.5)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: issue.severity === 'error' ? 'var(--s5-status-danger-bg)' : '#FBF7EE',
                    color: issue.severity === 'error' ? 'var(--s5-status-danger)' : 'var(--s5-gold-metallic)',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                    marginTop: '2px',
                  }}
                >
                  {issue.severity === 'error' ? <XCircle size={18} /> : <AlertTriangle size={18} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '13.5px', color: '#0B2923' }}>{issue.title}</strong>
                    <span className="s5-issue-code-label">· {issue.code}</span>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#556663', lineHeight: 1.45 }}>
                    {issue.message}
                  </p>
                  {issue.context && (
                    <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '11px', color: '#8F2D24', fontWeight: 600 }}>
                      Konteks: {issue.context}
                    </span>
                  )}
                </div>
              </div>
              {onNavigate && (
                <div style={{ flexShrink: 0 }}>
                  <Button variant="secondary" size="sm" onClick={() => onNavigate('schedule')}>
                    Atasi di Jadwal &rarr;
                  </Button>
                </div>
              )}
            </MotionStaggerItem>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * HISTORY SCREEN
 */
function HistoryScreen({ state, onRestore, onNavigate }: { state: AppState; onRestore: (version: ScheduleVersion) => void; onNavigate: (screen: ScreenId) => void }) {
  return (
    <>
      <PageHeading
        kicker="VERSION CONTROL"
        title="Riwayat Versi &amp; Cadangan Data"
        description="Snapshot jadwal resmi dan pencadangan data madrasah tersimpan secara lokal. Anda dapat memulihkan versi sebelumnya kapan saja."
        actions={<Button variant="secondary" icon={CalendarDays} onClick={() => onNavigate('schedule')}>Buka Jadwal</Button>}
      />

      <div className="version-timeline">
        {state.history.map((version, idx) => (
          <MotionStaggerItem key={version.id} index={idx} className="version-row">
            <div className="timeline-track">
              <div className={`timeline-dot ${idx === 0 ? 'current' : ''}`}>{idx === 0 ? <Check size={13} /> : <span />}</div>
            </div>
            <div className="version-main">
              <div className="version-title-row">
                <div>
                  <div className="version-kicker">{idx === 0 ? 'ACTIVE VERSION' : `ARCHIVE · VERSI ${version.version}`}</div>
                  <h3>{version.label}</h3>
                </div>
                <div className="version-actions">
                  {idx === 0 && <StatusPill status="success">Aktif</StatusPill>}
                  <Button variant="secondary" icon={RefreshCw} onClick={() => onRestore(version)}>Pulihkan ke Draft</Button>
                </div>
              </div>
              <div className="version-meta">
                <span><Clock3 size={13} /> {formatShortDate(version.createdAt)}</span>
                <span><CalendarDays size={13} /> {version.entryCount} Penempatan</span>
              </div>
            </div>
          </MotionStaggerItem>
        ))}
      </div>
    </>
  );
}

/**
 * BACKUP SCREEN
 */
function BackupScreen({
  state,
  onBackup,
  onImport,
  onExportCSV,
  onExportJSON,
}: {
  state: AppState;
  onBackup: () => void;
  onImport: (file?: File) => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
}) {
  return (
    <>
      <PageHeading
        kicker="DATA PORTABILITY"
        title="Ekspor &amp; Backup Data"
        description={`Seluruh data ${state.settings.schoolName} tersimpan di browser Anda. Ekspor backup secara teratur untuk keamanan.`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" icon={Download} onClick={onExportJSON}>Ekspor JSON</Button>
            <Button icon={Download} onClick={onBackup}>Download Backup JSON</Button>
          </div>
        }
      />

      <div className="s5-backup-bento-grid">
        <KpiMotionCard index={0} className="backup-action-card">
          <div className="backup-action-icon json"><FileCheck2 size={21} /></div>
          <div className="backup-action-copy">
            <div className="backup-action-kicker">FULL WORKSPACE SNAPSHOT</div>
            <h3>Backup Penuh JSON</h3>
            <p>Cadangkan seluruh data master, alokasi kebutuhan, presensi, hari libur, dan jadwal ke file aman.</p>
            <Button icon={Download} onClick={onBackup}>Download Backup JSON</Button>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={1} className="backup-action-card">
          <div className="backup-action-icon csv"><FileSpreadsheet size={21} /></div>
          <div className="backup-action-copy">
            <div className="backup-action-kicker">SPREADSHEET EXPORT</div>
            <h3>Ekspor Jadwal CSV</h3>
            <p>Ekspor susunan jadwal ke format tabel CSV untuk dibuka di Microsoft Excel atau Google Sheets.</p>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={onExportCSV}>Ekspor CSV</Button>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={2} className="backup-action-card">
          <div className="backup-action-icon json"><Upload size={21} /></div>
          <div className="backup-action-copy">
            <div className="backup-action-kicker">RESTORE FROM BACKUP</div>
            <h3>Pulihkan Data Backup</h3>
            <p>Pilih file JSON hasil cadangan sebelumnya untuk memulihkan seluruh data madrasah.</p>
            <label className="button button-secondary file-pick-button">
              <Upload size={15} /> Pilih File JSON
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onImport(f);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
        </KpiMotionCard>
      </div>
    </>
  );
}
