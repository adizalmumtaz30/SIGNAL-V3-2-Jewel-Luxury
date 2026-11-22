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
  Database,
  Download,
  Edit2,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
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
  GenerateResult,
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
import {
  buildScheduleFingerprint,
  scoreScheduleDetailed,
  validateMasterData,
  validateSchedule,
} from './domain/validator';
import {
  formatValidationCategoryLabel,
  getActionLabelForIssue,
  getTargetScreenForIssue,
  getValidationCategoryGroup,
} from './domain/validationLabels';
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
import { MadrasahTeacherAvatar, detectTeacherGender } from './components/MadrasahTeacherAvatar';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { TimeMachineDrawer } from './components/TimeMachineDrawer';
import { InspectorSlideDrawer, type InspectorTarget } from './components/InspectorSlideDrawer';
import { TeacherAssignmentDrawer } from './components/TeacherAssignmentDrawer';
import { SovereignSidebar, type SovereignSidebarGroup } from './components/SovereignSidebar';
import { UnifiedPagination } from './components/UnifiedPagination';
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

const DatabaseIcon: LucideIcon = Database;

interface NavGroup {
  sectionTitle: string;
  items: Array<{ id: ScreenId; label: string; icon: LucideIcon }>;
}

const navGroups: NavGroup[] = [
  {
    sectionTitle: 'PERENCANAAN & MASTER',
    items: [
      { id: 'overview', label: 'Beranda', icon: Home },
      { id: 'master', label: 'Data Master', icon: DatabaseIcon },
      { id: 'requirements', label: 'Kebutuhan & Alokasi', icon: BookOpen },
      { id: 'generator', label: 'Generator Jadwal', icon: WandSparkles },
    ],
  },
  {
    sectionTitle: 'OPERASIONAL & VALIDASI',
    items: [
      { id: 'schedule', label: 'Jadwal Pelajaran', icon: CalendarDays },
      { id: 'validation', label: 'Validasi & Konflik', icon: ShieldCheck },
      { id: 'workload', label: 'Beban Guru', icon: Users },
      { id: 'attendance', label: 'Presensi Guru', icon: UserCheck },
    ],
  },
  {
    sectionTitle: 'TATA NASKAH & SISTEM',
    items: [
      { id: 'persuratan', label: 'Persuratan & Arsip', icon: Archive },
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

function titleForScreen(screen: ScreenId) {
  const titles: Record<ScreenId, string> = {
    overview: 'Beranda Kerja Operator',
    schedule: 'Jadwal Pelajaran',
    workload: 'Statistik Beban Guru',
    attendance: 'Presensi Guru',
    persuratan: 'Pusat Persuratan & Arsip',
    generator: 'Penyusun Jadwal Otomatis',
    master: 'Data Master Madrasah',
    requirements: 'Kebutuhan & Alokasi JP',
    validation: 'Validasi & Kepatuhan Aturan',
    history: 'Riwayat Versi & Cadangan Data',
    backup: 'Ekspor & Cadangan Data',
    settings: 'Pengaturan Workspace',
  };
  return titles[screen] || 'SAKALA';
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
  const [editingSlot, setEditingSlot] = useState<EditSlotContext | null>(null);
  const [editingSubject, setEditingSubject] = useState('');
  const [editingTeacher, setEditingTeacher] = useState('');
  const [customTeacherName, setCustomTeacherName] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [highlightedSlot, setHighlightedSlot] = useState<{ classId: string; day: Day; jpNo: number } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatorNodesProgress, setGeneratorNodesProgress] = useState(0);
  const generatorWorkerRef = useRef<Worker | null>(null);
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
    if (!sidebarOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSidebarOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [sidebarOpen]);

  useEffect(() => {
    return () => {
      if (generatorWorkerRef.current) {
        generatorWorkerRef.current.terminate();
        generatorWorkerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadAppState().then((loaded) => {
      if (!mounted) return;
      setWorkspace(loaded);
      setSelectedClass(loaded.classes.find((item) => item.isActive)?.id ?? '');
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
        console.error('Could not persist SAKALA data:', error);
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
        console.error('Retry persist SAKALA data failed:', error);
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
    if (next !== 'schedule') {
      setHighlightedSlot(null);
    }
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
            : 'SK Mengajar hanya dapat dibuat dari Jadwal Terbit Resmi terverifikasi.',
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
    notify('Struktur waktu dan aturan beban mengajar diperbarui.', 'success');
  };

  const handleApplyWeeklyLimitToAllTeachers = (limit: number) => {
    const safeLimit = Math.max(1, Math.min(80, Math.round(limit)));
    updateWorkspace((current) => ({
      ...current,
      settings: { ...current.settings, maxWeeklyJP: safeLimit },
      teachers: current.teachers.map((t) => ({ ...t, maxWeeklyJP: safeLimit })),
    }), true);
    setSettingsSaved(true);
    setSettingsDirty(false);
    notify(`Batas maksimal ${safeLimit} JP/minggu diterapkan ke pengaturan & seluruh dewan guru.`, 'success');
  };

  // Primary Action: Buat Jadwal in 1-Click (runs in dedicated Web Worker when available)
  const handleGenerate = (options?: { seed?: number; overrideLimit?: number; stayOnGenerator?: boolean }) => {
    if (!workspace) return;
    if (generatorWorkerRef.current) {
      generatorWorkerRef.current.terminate();
      generatorWorkerRef.current = null;
    }

    const seed =
      typeof options?.seed === 'number' && Number.isFinite(options.seed)
        ? (options.seed >>> 0)
        : ((Date.now() ^ Math.floor(Math.random() * 0xffff)) >>> 0);

    setIsGenerating(true);
    setGeneratorNodesProgress(0);
    setLastGeneratorResult({ status: 'RUNNING', message: 'Menyiapkan aturan jadwal dan menyusun kombinasi optimal…', nodes: 0 });

    const applyGenerateResult = (result: GenerateResult) => {
      setLastGeneratorResult({ status: result.status, message: result.message, nodes: result.nodes });
      setGeneratorNodesProgress(result.nodes);
      setIsGenerating(false);

      if (result.status === 'SUCCESS' && result.candidate) {
        createSnapshot(workspace, 'Jadwal Baru Berhasil Disusun', 'auto').catch(console.error);
        updateWorkspace((current) => ({
          ...current,
          candidates: [result.candidate!, ...current.candidates.filter((item) => item.seed !== result.candidate!.seed)].slice(0, 6),
          draft: result.candidate!.entries,
          dataMode: 'custom',
        }));
        notify('Jadwal berhasil disusun dan bebas seluruh bentrok wajib.', 'success');
        if (!options?.stayOnGenerator) {
          setScreen('schedule');
        }
      } else if (result.status !== 'CANCELLED') {
        notify(result.message, result.status === 'INVALID_INPUT' ? 'warning' : 'error');
        if (result.status === 'INVALID_INPUT' && screen !== 'generator') {
          setQuickValidationOpen(true);
        }
      }
    };

    if (typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('./domain/generator.worker.ts', import.meta.url), { type: 'module' });
        generatorWorkerRef.current = worker;
        worker.onmessage = (
          event: MessageEvent<{ type: 'progress'; nodes: number } | { type: 'result'; result: GenerateResult }>,
        ) => {
          if (event.data.type === 'progress') {
            setGeneratorNodesProgress(event.data.nodes);
          } else if (event.data.type === 'result') {
            worker.terminate();
            if (generatorWorkerRef.current === worker) generatorWorkerRef.current = null;
            applyGenerateResult(event.data.result);
          }
        };
        worker.onerror = () => {
          worker.terminate();
          if (generatorWorkerRef.current === worker) generatorWorkerRef.current = null;
          const fallbackResult = generateSchedule(workspace, seed, { overrideLimit: options?.overrideLimit });
          applyGenerateResult(fallbackResult);
        };
        worker.postMessage({ state: workspace, seed, overrideLimit: options?.overrideLimit });
        return;
      } catch {
        // Graceful fallback to main thread timer if worker fails to instantiate
      }
    }

    window.setTimeout(() => {
      const result = generateSchedule(workspace, seed, { overrideLimit: options?.overrideLimit });
      applyGenerateResult(result);
    }, 60);
  };

  const handleCancelGenerate = () => {
    if (generatorWorkerRef.current) {
      generatorWorkerRef.current.terminate();
      generatorWorkerRef.current = null;
    }
    setIsGenerating(false);
    setLastGeneratorResult((prev) => ({
      status: 'CANCELLED',
      message: 'Penyusunan jadwal dibatalkan oleh operator.',
      nodes: generatorNodesProgress || prev?.nodes || 0,
    }));
    notify('Penyusunan jadwal dihentikan.', 'info');
  };

  const handleDeleteCandidate = (candidateId: string) => {
    if (!workspace) return;
    updateWorkspace((current) => ({
      ...current,
      candidates: current.candidates.filter((item) => item.id !== candidateId),
    }), true);
    notify('Kandidat jadwal dihapus dari riwayat.', 'info');
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
        maxWeeklyJP: workspace.settings.maxWeeklyJP ?? 24,
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
      validatorVersion: 'SAKALA-validator/1.0.0',
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
      const parsedMaxJP = Number(masterForm.maxWeeklyJP);
      if (!Number.isInteger(parsedMaxJP) || parsedMaxJP < 1 || parsedMaxJP > 80) {
        notify('Batas maksimum mengajar harus antara 1 sampai 80 JP/minggu.', 'warning');
        return;
      }
      const teacher: Teacher = {
        id: `TCH-${Date.now().toString(36)}`,
        code: masterForm.code.trim() || `T-${workspace.teachers.length + 1}`,
        name: masterForm.name.trim(),
        roleTitle: masterForm.roleTitle.trim() || 'Guru Mapel',
        nip: masterForm.nip.trim() || undefined,
        gender: detectTeacherGender(masterForm.name, masterForm.roleTitle, masterForm.gender),
        subjectIds: masterForm.selectedSubjectIds,
        maxWeeklyJP: parsedMaxJP,
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
        `SAKALA-master-kelas-terpilih-${dateStamp}.csv`,
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
          String(t.maxWeeklyJP && t.maxWeeklyJP > 0 ? t.maxWeeklyJP : (workspace.settings.maxWeeklyJP ?? 24)),
          t.isActive ? 'Aktif' : 'Nonaktif',
        ]);
      }
      downloadTextFile(
        '\uFEFF' + rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n'),
        `SAKALA-master-guru-terpilih-${dateStamp}.csv`,
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
      `SAKALA-master-mapel-terpilih-${dateStamp}.csv`,
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

  const handleInlineUpdateRequirementJP = (reqId: string, nextJP: number) => {
    if (!workspace) return;
    const safeJP = Math.max(1, Math.min(50, Math.round(nextJP)));
    updateWorkspace((current) => ({
      ...current,
      requirements: current.requirements.map((item) =>
        item.id === reqId ? { ...item, requiredJP: safeJP } : item,
      ),
      draft: null,
    }), true);
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
      const nextTeachers = curr.teachers.map((t) => {
        if (t.id === req.teacherId && !t.subjectIds.includes(req.subjectId)) {
          return { ...t, subjectIds: [...t.subjectIds, req.subjectId] };
        }
        return t;
      });
      const requirements = isNew
        ? [...curr.requirements, req]
        : curr.requirements.map((r) => (r.id === req.id ? req : r));
      return { ...curr, teachers: nextTeachers, requirements, draft: null };
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
    downloadTextFile(rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\r\n'), `SAKALA-jadwal-${workspace.settings.academicYear.replace('/', '-')}.csv`);
    notify('CSV jadwal berhasil diunduh.', 'success');
  };

  const exportJSONSchedule = () => {
    if (!workspace) return;
    const content = JSON.stringify({
      format: 'SAKALA-SCHEDULE',
      exportedAt: new Date().toISOString(),
      settings: workspace.settings,
      classes: workspace.classes,
      teachers: workspace.teachers,
      subjects: workspace.subjects,
      entries: currentEntries,
      validation: report,
    }, null, 2);
    downloadTextFile(content, `SAKALA-jadwal-${workspace.settings.academicYear.replace('/', '-')}.json`, 'application/json');
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
  const effectiveCollapsed = sidebarCollapsed && !sidebarOpen;
  const documentCount = (workspace.documents ?? []).length;
  const activeScheduleCount = workspace.activeSchedule?.length ?? 0;
  const scheduleReady = Boolean(
    activeScheduleCount > 0 && (!report || report.hardErrorCount === 0)
  );
  const sidebarGroups: SovereignSidebarGroup[] = navGroups.map((group) => ({
    sectionTitle: group.sectionTitle,
    items: group.items.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon,
      badgeCount: item.id === 'validation' ? report?.hardErrorCount ?? 0 : undefined,
      statusHint:
        item.id === 'schedule'
          ? scheduleReady
            ? `${activeScheduleCount} slot aktif`
            : `${activeScheduleCount} slot draft`
          : item.id === 'persuratan'
            ? `${documentCount} dokumen`
            : item.id === 'history'
              ? `${workspace.history.length} versi tersimpan`
              : undefined,
    })),
  }));

  return (
    <div className="app-shell">
      <SovereignSidebar
        activeScreen={screen}
        navGroups={sidebarGroups}
        sidebarOpen={sidebarOpen}
        sidebarCollapsed={sidebarCollapsed}
        schoolName={workspace.settings.schoolName || 'Madrasah'}
        academicYear={workspace.settings.academicYear}
        semester={workspace.settings.semester}
        historyCount={workspace.history.length}
        documentCount={documentCount}
        scheduleReady={scheduleReady}
        onNavigate={(id) => navigate(id as ScreenId)}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        onCloseMobile={() => setSidebarOpen(false)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onClickVault={() => {
          navigate('history');
          notify(
            `Vault lokal aktif · ${workspace.history.length} versi jadwal & ${documentCount} arsip tersimpan aman di browser.`,
            'success'
          );
        }}
      />

      <main className={`main-shell ${effectiveCollapsed ? 'main-shell-expanded' : ''}`}>
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

            {/* Riwayat Versi & Cadangan Trigger */}
            <button
              className="s5-time-machine-btn s5-tooltip-bottom"
              onClick={() => setIsTimeMachineOpen(true)}
              type="button"
              data-s5-tooltip="Riwayat versi & pemulihan jadwal"
            >
              <Clock size={13} />
              <span>Riwayat Versi</span>
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
              data-s5-tooltip="Operator Madrasah · Pengaturan Identitas"
              aria-label="Profil Operator Madrasah"
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
                onGenerate={() => handleGenerate()}
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
                highlightedSlot={highlightedSlot}
                onClearHighlightedSlot={() => setHighlightedSlot(null)}
                onEditSlot={openSlotEditor}
                onClearSlot={handleClearSlot}
                onAssignSlot={handleAssignSlot}
                onDropSlot={handleDropSlot}
                onGenerate={() => handleGenerate()}
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
                nodesProgress={generatorNodesProgress}
                result={lastGeneratorResult}
                onGenerate={handleGenerate}
                onCancel={handleCancelGenerate}
                onChoose={chooseCandidate}
                onDeleteCandidate={handleDeleteCandidate}
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
                onAdd={(type) => {
                  setAddType(type);
                  setMasterForm({
                    ...emptyMasterForm,
                    maxWeeklyJP: String(workspace.settings.maxWeeklyJP ?? 24),
                  });
                }}
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
                onUpdateRequirementJP={handleInlineUpdateRequirementJP}
                onDelete={deleteRequirement}
                onGenerate={() => handleGenerate()}
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
                onNavigateToSlot={(classId, day, jpNo) => {
                  setSelectedClass(classId);
                  setHighlightedSlot({ classId, day, jpNo });
                  navigate('schedule');
                }}
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
                onApplyWeeklyLimitToAllTeachers={handleApplyWeeklyLimitToAllTeachers}
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
              <span>© 2026 SAKALA Academic Studio</span>
              <span className="s5-footer-sep" aria-hidden="true">·</span>
              <span>Sistem Informasi Penjadwalan &amp; Presensi Madrasah</span>
            </div>
            <div className="s5-footer-right">
              <span>Penyimpanan lokal aktif di browser</span>
              <span className="s5-footer-sep" aria-hidden="true">·</span>
              <span>Dirancang untuk ketertiban administrasi madrasah</span>
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
        onNavigateToSlot={(classId, day, jpNo) => {
          setSelectedClass(classId);
          setHighlightedSlot({ classId, day, jpNo });
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
                ? 'Editor Naskah memiliki suntingan surat yang belum disimpan sebagai draf.'
                : 'Formulir Data Awal memiliki isian yang belum disimpan sebagai draf.'
              : 'Pengaturan ruang kerja memiliki suntingan yang belum diterapkan.'
          }
          icon={AlertTriangle}
          onClose={() => setPendingNavScreen(null)}
        >
          <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--s5-ink-secondary)' }}>
              {screen === 'persuratan'
                ? persuratanDirtySource === 'studio'
                  ? `Anda hendak berpindah ke menu ${titleForScreen(pendingNavScreen)}. Kembali ke Editor Naskah untuk menyimpan draf, atau abaikan perubahan tersebut.`
                  : `Anda hendak berpindah ke menu ${titleForScreen(pendingNavScreen)}. Kembali ke Formulir Data Awal untuk menyimpan draf, atau abaikan isian sementara tersebut.`
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
                    ? 'Kembali ke Editor Naskah'
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
                  ? 'Tetap Pulihkan (Tanpa Verifikasi)'
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
      <div className="loading-emblem"><img src="/sakala-mark.png" alt="Logo SAKALA" /></div>
      <div className="loading-line" />
      <h1>SAKALA</h1>
      <p>Menyiapkan ruang kerja madrasah Anda…</p>
    </div>
  );
}

function PageHeading({ kicker, title, description, actions }: { kicker: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="s5-page-header">
      <div className="s5-page-header-copy">
        <div className="s5-page-kicker">{kicker}</div>
        <h1 className="s5-page-title">{title}</h1>
        {description && <p className="s5-page-subtitle">{description}</p>}
      </div>
      {actions && <div className="page-heading-actions">{actions}</div>}
    </header>
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
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.78)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                KESIAPAN
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#E5C378', letterSpacing: '0.06em' }}>
              KESIAPAN JADWAL MADRASAH
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

      {/* 2. 4-KPI JEWEL METRIC STRIP (Diselaraskan dengan Beban Guru) */}
      <div className="stat-grid">
        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-teal"
          index={0}
          onClick={() => onNavigate('master')}
        >
          <div className="stat-top">
            <span>Rombel Aktif</span>
            <div className="stat-icon" aria-hidden="true">
              <GraduationCap size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={classCount} />
            </strong>
            <span className="stat-unit">Rombel</span>
          </div>
          <div className="stat-sub">Seluruh kelas terdaftar</div>
        </KpiMotionCard>

        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-sand"
          index={1}
          onClick={() => onNavigate('schedule')}
        >
          <div className="stat-top">
            <span>Alokasi KBM</span>
            <div className="stat-icon" aria-hidden="true">
              <BookOpen size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={capacityPercent} suffix="%" />
            </strong>
            <span className="stat-unit">terisi</span>
          </div>
          <div className="stat-sub">{occupiedSlots} / {totalWeeklyCapacity} JP terjadwal</div>
        </KpiMotionCard>

        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-blue"
          index={2}
          onClick={() => onOpenValidationModal()}
        >
          <div className="stat-top">
            <span>Konflik Keras</span>
            <div className="stat-icon" aria-hidden="true">
              {totalErrors > 0 ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={totalErrors} />
            </strong>
            <span className="stat-unit">Temuan</span>
          </div>
          <div className="stat-sub">{totalErrors === 0 ? 'Bebas bentrok aturan wajib' : 'Klik untuk tinjau bentrok'}</div>
        </KpiMotionCard>

        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-rose"
          index={3}
          onClick={() => onNavigate('workload')}
        >
          <div className="stat-top">
            <span>Dewan Guru Aktif</span>
            <div className="stat-icon" aria-hidden="true">
              <Users size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={teacherCount} />
            </strong>
            <span className="stat-unit">Guru</span>
          </div>
          <div className="stat-sub">Rata-rata {avgTeacherJP} JP / guru</div>
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

        <div className="stat-grid">
          <KpiMotionCard
            as="button"
            type="button"
            index={0}
            className="stat-card stat-card-interactive tone-teal"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <div className="stat-top">
              <span>Draft Aktif</span>
              <div className="stat-icon" aria-hidden="true">
                <FileText size={17} />
              </div>
            </div>
            <div className="stat-value-row">
              <strong>
                <KpiAnimatedNumber value={draftDocsCount} />
              </strong>
              <span className="stat-unit">draf</span>
            </div>
            <div className="stat-sub">
              {draftDocsCount > 0 ? 'Siap dilanjutkan di Editor Naskah' : 'Belum ada draf berjalan'}
            </div>
          </KpiMotionCard>

          <KpiMotionCard
            as="button"
            type="button"
            index={1}
            className="stat-card stat-card-interactive tone-sand"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <div className="stat-top">
              <span>Dokumen Final</span>
              <div className="stat-icon" aria-hidden="true">
                <FileCheck2 size={17} />
              </div>
            </div>
            <div className="stat-value-row">
              <strong>
                <KpiAnimatedNumber value={finalDocsCount} />
              </strong>
              <span className="stat-unit">naskah</span>
            </div>
            <div className="stat-sub">
              {finalDocsCount > 0 ? 'Bernomor resmi & salinan terkunci' : 'Belum ada dokumen disahkan'}
            </div>
          </KpiMotionCard>

          <KpiMotionCard
            as="button"
            type="button"
            index={2}
            className="stat-card stat-card-interactive tone-blue"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <div className="stat-top">
              <span>Arsip &amp; Lampiran</span>
              <div className="stat-icon" aria-hidden="true">
                <Archive size={17} />
              </div>
            </div>
            <div className="stat-value-row">
              <strong>
                <KpiAnimatedNumber value={archivedDocsCount} />
              </strong>
              <span className="stat-unit">arsip</span>
            </div>
            <div className="stat-sub">{attachmentsCount} lampiran terverifikasi tersimpan</div>
          </KpiMotionCard>

          <KpiMotionCard
            as="button"
            type="button"
            index={3}
            className="stat-card stat-card-interactive tone-rose"
            onClick={() => openPersuratanView({ view: 'template-manager', nonce: Date.now() })}
          >
            <div className="stat-top">
              <span>Template Madrasah</span>
              <div className="stat-icon" aria-hidden="true">
                <LayoutGrid size={17} />
              </div>
            </div>
            <div className="stat-value-row">
              <strong>
                <KpiAnimatedNumber value={customTemplatesCount} />
              </strong>
              <span className="stat-unit">kustom</span>
            </div>
            <div className="stat-sub">+ 30 template resmi bawaan SAKALA</div>
          </KpiMotionCard>
        </div>

        {/* Status Kesiapan SK Pembagian Tugas Mengajar */}
        <div className={`s5-admin-sk-strip ${skBasis.allowed ? '' : 'is-locked'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {skBasis.allowed ? (
              <Award size={18} color="#124037" aria-hidden="true" style={{ flexShrink: 0 }} />
            ) : (
              <LockKeyhole size={18} color="#8E7035" aria-hidden="true" style={{ flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B2923' }}>
                SK Pembagian Tugas Mengajar
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
  highlightedSlot,
  onClearHighlightedSlot,
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
  highlightedSlot?: { classId: string; day: Day; jpNo: number } | null;
  onClearHighlightedSlot?: () => void;
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

  useEffect(() => {
    if (!highlightedSlot) return;
    setViewMode('single');
    if (highlightedSlot.classId) {
      onSelectClass(highlightedSlot.classId);
    }
    const timer = window.setTimeout(() => {
      const el = document.querySelector(
        `[data-slot-key="${highlightedSlot.classId}|${highlightedSlot.day}|${highlightedSlot.jpNo}"]`,
      );
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }, 90);
    return () => window.clearTimeout(timer);
  }, [highlightedSlot, onSelectClass]);
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
        kicker="MANAJEMEN JADWAL"
        title="Jadwal Pelajaran"
        description="Tinjau matriks jadwal seluruh madrasah sekaligus atau kelola detail alokasi per kelas dengan pemeriksaan bentrok otomatis."
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
                      ? `Buat SK Pembagian Tugas Mengajar dari Jadwal Resmi v${skBasis.selectedVersion.version.version}`
                      : skBasis.blockedReason ?? 'Terbitkan jadwal resmi terlebih dahulu sebelum membuat SK.'
                  }
                >
                  Buat SK Mengajar
                </Button>
              );
            })()}
            <Button icon={WandSparkles} onClick={onGenerate} disabled={isGenerating}>
              {isGenerating ? 'Menyusun…' : 'Susun Jadwal Otomatis'}
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
                ? 'Draf Valid · Bebas Bentrok'
                : `${report.hardErrorCount} Bentrok Perlu Diperbaiki`
              : published
              ? `Terbit · v${state.history[0]?.version ?? '1'}`
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

              {highlightedSlot && highlightedSlot.classId === selectedClass && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    flexWrap: 'wrap',
                    padding: '10px 14px',
                    marginBottom: '12px',
                    borderRadius: '10px',
                    background: '#FFFBEB',
                    border: '1px solid #F3D999',
                    color: '#78350F',
                    fontSize: '12.5px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertTriangle size={15} color="#B45309" />
                    <span>
                      Menyorot slot sasaran hasil validasi: <strong>Kelas {getClass(state, selectedClass)?.name}</strong> ·{' '}
                      <strong>{highlightedSlot.day}</strong> · <strong>JP {String(highlightedSlot.jpNo).padStart(2, '0')}</strong>. Klik sel tersorot untuk mengedit atau menukar posisi.
                    </span>
                  </div>
                  {onClearHighlightedSlot && (
                    <button
                      type="button"
                      className="button button-sm button-secondary"
                      onClick={onClearHighlightedSlot}
                    >
                      Tutup Sorotan
                    </button>
                  )}
                </div>
              )}

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
                              <span style={{ fontSize: '11px', padding: '1px 6px', background: '#dcece3', color: '#114438', borderRadius: '4px', fontWeight: 700 }}>NON-KBM</span>
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
                                data-slot-key={`${selectedClass}|${day}|${jpNo}`}
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
                                className={`schedule-cell ${entry ? 'has-entry' : 'is-empty'} ${blocked ? 'is-blocked' : ''} ${
                                  highlightedSlot?.classId === selectedClass &&
                                  highlightedSlot?.day === day &&
                                  highlightedSlot?.jpNo === jpNo
                                    ? 'schedule-cell-target-highlight'
                                    : ''
                                }`}
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
  nodesProgress,
  result,
  onGenerate,
  onCancel,
  onChoose,
  onDeleteCandidate,
  onNavigate,
}: {
  state: AppState;
  isGenerating: boolean;
  nodesProgress: number;
  result: { status: GeneratorStatus; message: string; nodes: number } | null;
  onGenerate: (options?: { seed?: number; overrideLimit?: number; stayOnGenerator?: boolean }) => void;
  onCancel: () => void;
  onChoose: (id: string) => void;
  onDeleteCandidate: (id: string) => void;
  onNavigate?: (screen: ScreenId) => void;
}) {
  const [seedInput, setSeedInput] = useState<string>('');
  const [searchLimitOverride, setSearchLimitOverride] = useState<number>(() =>
    Math.max(1500, Math.min(100000, state.settings.searchLimit ?? 65000)),
  );
  const [autoOpenSchedule, setAutoOpenSchedule] = useState<boolean>(false);

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

  const activeClassesCount = state.classes.filter((c) => c.isActive).length;
  const totalSlotsCapacity = useMemo(
    () =>
      state.settings.activeDays.reduce((sum, day) => sum + teachingPeriodsForDay(state.slots, day).length, 0) *
      activeClassesCount,
    [state.settings.activeDays, state.slots, activeClassesCount],
  );
  const allJP = state.requirements.reduce((sum, item) => sum + item.requiredJP, 0);
  const uniqueSubjectCount = useMemo(
    () => new Set(state.requirements.map((item) => item.subjectId)).size,
    [state.requirements],
  );

  const preflightIssues = useMemo(() => validateMasterData(state), [state]);
  const preflightErrors = useMemo(
    () => preflightIssues.filter((issue) => issue.severity === 'error'),
    [preflightIssues],
  );
  const preflightWarnings = useMemo(
    () => preflightIssues.filter((issue) => issue.severity === 'warning'),
    [preflightIssues],
  );

  const currentDraftFingerprint = useMemo(
    () => buildScheduleFingerprint(state.draft ?? state.activeSchedule ?? []),
    [state.draft, state.activeSchedule],
  );

  const triggerGenerateWithOptions = () => {
    const trimmedSeed = seedInput.trim();
    const parsedSeed = trimmedSeed && /^\d+$/.test(trimmedSeed) ? Number(trimmedSeed) : undefined;
    onGenerate({
      seed: parsedSeed,
      overrideLimit: searchLimitOverride,
      stayOnGenerator: !autoOpenSchedule,
    });
  };

  return (
    <>
      <PageHeading
        kicker="MESIN PENYUSUNAN PRESISI"
        title="Penyusun Jadwal Otomatis"
        description={`Menyusun jadwal secara otomatis dengan mematuhi seluruh aturan wajib alokasi (${allJP} JP total kebutuhan) dan ketersediaan hari guru.`}
        actions={
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {isGenerating ? (
              <Button variant="secondary" icon={X} onClick={onCancel}>
                Batalkan Proses
              </Button>
            ) : null}
            <Button
              icon={WandSparkles}
              onClick={triggerGenerateWithOptions}
              disabled={isGenerating || preflightErrors.length > 0}
            >
              {isGenerating ? 'Sedang menyusun…' : 'Susun Jadwal Otomatis'}
            </Button>
          </div>
        }
      />

      {/* Solver & Capacity KPI Metrics (Diselaraskan dengan Beban Guru) */}
      <div className="stat-grid">
        <KpiMotionCard index={0} className="stat-card tone-teal">
          <div className="stat-top">
            <span>Target Alokasi JP</span>
            <div className="stat-icon" aria-hidden="true">
              <BookOpen size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={allJP} />
            </strong>
            <span className="stat-unit">JP</span>
          </div>
          <div className="stat-sub">{uniqueSubjectCount} Mapel · {state.requirements.length} Alokasi</div>
        </KpiMotionCard>

        <KpiMotionCard index={1} className="stat-card tone-sand">
          <div className="stat-top">
            <span>Kapasitas Slot Murni</span>
            <div className="stat-icon" aria-hidden="true">
              <Clock size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={totalSlotsCapacity} />
            </strong>
            <span className="stat-unit">JP</span>
          </div>
          <div className="stat-sub">{activeClassesCount} Rombel KBM Aktif</div>
        </KpiMotionCard>

        <KpiMotionCard index={2} className="stat-card tone-blue">
          <div className="stat-top">
            <span>Kandidat Tersimpan</span>
            <div className="stat-icon" aria-hidden="true">
              <Sparkles size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={state.candidates.length} />
            </strong>
            <span className="stat-unit">solusi</span>
          </div>
          <div className="stat-sub">Variasi Solusi Teruji</div>
        </KpiMotionCard>

        <KpiMotionCard index={3} className="stat-card tone-rose">
          <div className="stat-top">
            <span>Status Penyusunan</span>
            <div className="stat-icon" aria-hidden="true">
              {isGenerating ? (
                <WandSparkles size={17} />
              ) : result?.status === 'SUCCESS' ? (
                <ShieldCheck size={17} />
              ) : preflightErrors.length > 0 || result?.status === 'FAILED' || result?.status === 'INFEASIBLE' ? (
                <AlertTriangle size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              {isGenerating ? (
                'Menyusun…'
              ) : result?.status === 'SUCCESS' ? (
                <KpiAnimatedNumber value={100} suffix="%" />
              ) : result ? (
                statuses[result.status].label
              ) : preflightErrors.length > 0 ? (
                `${preflightErrors.length} Syarat`
              ) : (
                'Siap'
              )}
            </strong>
            {result?.status === 'SUCCESS' && !isGenerating && (
              <span className="stat-unit">Lolos</span>
            )}
          </div>
          <div className="stat-sub">
            {isGenerating
              ? `${nodesProgress.toLocaleString('id-ID')} kombinasi diperiksa`
              : preflightErrors.length > 0 && !result
              ? 'Perlu penyesuaian prasyarat data'
              : 'Mesin Kepatuhan Aturan Jadwal'}
          </div>
        </KpiMotionCard>
      </div>

      {/* Pre-Flight Readiness & Solver Parameter Controls */}
      <div className="surface-card" style={{ padding: '16px 20px', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                display: 'grid',
                placeItems: 'center',
                background: preflightErrors.length > 0 ? '#FDE8E5' : '#E1F4EA',
                color: preflightErrors.length > 0 ? '#9E2A21' : '#166534',
              }}
            >
              {preflightErrors.length > 0 ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
            </div>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#0B2923', display: 'block' }}>
                {preflightErrors.length > 0
                  ? `Prasyarat Belum Lengkap (${preflightErrors.length} Masalah Kritis)`
                  : 'Pemeriksaan Prasyarat Data Master & Alokasi Lolos'}
              </strong>
              <span style={{ fontSize: '12px', color: '#526861' }}>
                {preflightErrors.length > 0
                  ? preflightErrors[0].message
                  : preflightWarnings.length > 0
                  ? `Data utama siap disusun; terdapat ${preflightWarnings.length} catatan optimalisasi ringan.`
                  : 'Seluruh kapasitas kelas, kualifikasi guru, hari siap mengajar, dan beban JP memenuhi syarat.'}
              </span>
            </div>
          </div>

          {preflightErrors.length > 0 && onNavigate && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate(getTargetScreenForIssue(preflightErrors[0]))}
              >
                {getActionLabelForIssue(preflightErrors[0])} →
              </Button>
            </div>
          )}
        </div>

        <div style={{ height: '1px', background: '#E4ECE7' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="gen-depth" style={{ fontSize: '12px', fontWeight: 600, color: '#274744', margin: 0 }}>
                Kedalaman Pencarian:
              </label>
              <select
                id="gen-depth"
                className="s5-toolbar-select"
                value={searchLimitOverride}
                disabled={isGenerating}
                onChange={(e) => setSearchLimitOverride(Number(e.target.value))}
                style={{ minWidth: '175px' }}
              >
                <option value={15000}>Cepat (15.000 langkah)</option>
                <option value={65000}>Standar (65.000 langkah)</option>
                <option value={100000}>Mendalam (100.000 langkah)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="gen-seed" style={{ fontSize: '12px', fontWeight: 600, color: '#274744', margin: 0 }}>
                Seed Variasi:
              </label>
              <input
                id="gen-seed"
                type="text"
                inputMode="numeric"
                placeholder="Acak otomatis"
                value={seedInput}
                disabled={isGenerating}
                onChange={(e) => setSeedInput(e.target.value.replace(/[^\d]/g, ''))}
                className="s5-tnum"
                style={{
                  width: '132px',
                  height: '36px',
                  padding: '0 10px',
                  borderRadius: '8px',
                  border: '1px solid #C8D7D0',
                  fontSize: '12.5px',
                  color: '#0B2923',
                  background: '#FFFFFF',
                }}
              />
            </div>
          </div>

          <label className="master-toggle-label" style={{ fontSize: '12px', color: '#274744' }}>
            <input
              type="checkbox"
              checked={autoOpenSchedule}
              onChange={(e) => setAutoOpenSchedule(e.target.checked)}
            />
            <span>Otomatis buka Matriks Jadwal setelah selesai</span>
          </label>
        </div>
      </div>

      {/* Combinatorial Solver Radar Feedback */}
      {isGenerating && (
        <div className="s5-solver-radar-wrap">
          <div className="s5-radar-pulse">
            <Sparkles size={18} style={{ color: '#124037' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '13.5px', color: '#0B2923' }}>
                Mesin Penyusun Jadwal Sedang Bekerja
              </strong>
              <span className="s5-tnum" style={{ fontSize: '11.5px', background: '#E1E8E4', padding: '2px 9px', borderRadius: '6px', fontWeight: 600, color: '#124037' }}>
                {nodesProgress.toLocaleString('id-ID')} kombinasi diperiksa
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#556663' }}>
              Memeriksa kombinasi ruang jadwal, ketersediaan hari mengajar guru, batas beban harian, serta slot khusus madrasah bebas bentrok di latar belakang.
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={X} onClick={onCancel}>
            Batalkan
          </Button>
        </div>
      )}

      <div className="dashboard-grid generator-main-grid">
        <Card eyebrow="PROSES PENYUSUNAN" title="Hasil Penyusunan Jadwal">
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
            <div style={{ flex: 1 }}>
              <strong>{isGenerating ? 'Menyusun variasi jadwal…' : result ? statuses[result.status].label : 'Belum ada penyusunan baru'}</strong>
              <span>{isGenerating ? 'Memeriksa slot, alokasi, dan bentrok lintas kelas.' : result?.message ?? 'Klik tombol Susun Jadwal Otomatis untuk memulai.'}</span>
            </div>
          </div>

          {result && (
            <div className="result-stats">
              <div>
                <span>Kombinasi Diperiksa</span>
                <strong className="s5-tnum">{(isGenerating ? nodesProgress : result.nodes).toLocaleString('id-ID')}</strong>
              </div>
              <div>
                <span>Status</span>
                <StatusPill status={statuses[result.status].tone}>{statuses[result.status].label}</StatusPill>
              </div>
            </div>
          )}

          {result?.status === 'SUCCESS' && onNavigate && (
            <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <Button icon={CalendarDays} onClick={() => onNavigate('schedule')}>
                Buka Matriks Jadwal →
              </Button>
              <Button variant="secondary" icon={ShieldCheck} onClick={() => onNavigate('validation')}>
                Lihat Audit Validasi
              </Button>
            </div>
          )}

          {(result?.status === 'INFEASIBLE' || result?.status === 'SEARCH_LIMIT_REACHED') && onNavigate && (
            <div style={{ marginBottom: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {result.status === 'SEARCH_LIMIT_REACHED' && searchLimitOverride < 100000 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setSearchLimitOverride(100000);
                    onGenerate({ overrideLimit: 100000, stayOnGenerator: !autoOpenSchedule });
                  }}
                >
                  Coba Lagi dengan Mode Mendalam (100.000)
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => onNavigate('requirements')}>
                Tinjau Kebutuhan &amp; Alokasi JP →
              </Button>
            </div>
          )}

          <div className="result-disclaimer">
            <ShieldCheck size={16} />
            <span>Hasil berstatus <strong>BERHASIL</strong> telah lolos seluruh aturan wajib bebas bentrok sebelum disimpan ke draf.</span>
          </div>
        </Card>

        <Card eyebrow="RIWAYAT KANDIDAT" title="Kandidat Tersimpan">
          {!state.candidates.length ? (
            <EmptyState icon={WandSparkles} title="Belum ada kandidat" description="Kandidat jadwal yang lolos seluruh aturan wajib akan tersimpan di sini untuk dibandingkan." />
          ) : (
            <div className="candidate-table-wrap">
              <table className="data-table candidate-table">
                <thead>
                  <tr>
                    <th>Kandidat</th>
                    <th>Kualitas &amp; Blok</th>
                    <th>Skor</th>
                    <th style={{ textAlign: 'right' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {state.candidates.map((cand) => {
                    const breakdown = cand.scoreBreakdown ?? scoreScheduleDetailed(state, cand.entries);
                    const isActiveDraft =
                      cand.entries.length > 0 &&
                      buildScheduleFingerprint(cand.entries) === currentDraftFingerprint;
                    return (
                      <tr key={cand.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong>{cand.label}</strong>
                            {isActiveDraft && <StatusPill status="success">Aktif di Draf</StatusPill>}
                          </div>
                          <small style={{ display: 'block', color: '#526861', marginTop: '2px' }}>
                            {cand.entries.length} penempatan · {cand.searchNodes.toLocaleString('id-ID')} langkah
                          </small>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <StatusPill status={cand.report.valid ? 'success' : 'danger'}>
                              {cand.report.valid ? '100% Lolos' : `${cand.report.hardErrorCount} Isu`}
                            </StatusPill>
                            <span style={{ fontSize: '11px', color: '#526861' }}>
                              +{breakdown.doubleBlockCount} blok 2JP
                              {breakdown.sameDayPenalty > 0 ? ` · -${breakdown.sameDayPenalty} tumpuk` : ''}
                              {breakdown.freeSlotPenalty > 0 ? ` · -${breakdown.freeSlotPenalty} kosong` : ''}
                            </span>
                          </div>
                        </td>
                        <td>
                          <strong className="s5-tnum">{cand.score}</strong>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="s5-action-dock" style={{ display: 'inline-flex', justifyContent: 'flex-end' }}>
                            <button
                              type="button"
                              className="s5-dock-btn primary"
                              onClick={() => onChoose(cand.id)}
                              disabled={isActiveDraft}
                              title={isActiveDraft ? 'Kandidat ini sudah aktif di draf' : 'Terapkan kandidat ke draf jadwal'}
                            >
                              {isActiveDraft ? 'Aktif' : 'Terapkan'}
                            </button>
                            <button
                              type="button"
                              className="s5-dock-btn"
                              onClick={() => onDeleteCandidate(cand.id)}
                              title="Hapus kandidat dari riwayat"
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

  const globalMaxJP =
    state.settings.maxWeeklyJP && state.settings.maxWeeklyJP > 0 ? state.settings.maxWeeklyJP : 24;
  const globalOptimalMin = Math.max(1, Math.round(globalMaxJP * 0.8));

  const filteredTeachers = useMemo(() => {
    return state.teachers.filter((item) => {
      const matchSearch = `${item.name} ${item.code} ${item.nip || ''} ${item.roleTitle || ''}`.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (filterPreset === 'active') return item.isActive;
      if (filterPreset === 'inactive') return !item.isActive;

      const teacherReqs = state.requirements.filter((r) => r.teacherId === item.id);
      const assignedJP = teacherReqs.reduce((sum, r) => sum + r.requiredJP, 0);
      const maxJP = item.maxWeeklyJP && item.maxWeeklyJP > 0 ? item.maxWeeklyJP : globalMaxJP;
      const optimalMin = Math.max(1, Math.round(maxJP * 0.8));

      if (filterPreset === 'overload') return assignedJP > maxJP;
      if (filterPreset === 'optimal') return assignedJP >= optimalMin && assignedJP <= maxJP;
      if (filterPreset === 'zero') return assignedJP === 0;
      return true;
    });
  }, [state.teachers, state.requirements, search, filterPreset, globalMaxJP]);

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
      {/* Tier 2 Porcelain Editorial Header */}
      <section className="master-prestige-hero" aria-label="Header Data Master Madrasah">
        <div className="master-hero-content">
          <div className="master-hero-left">
            <div className="master-hero-kicker">
              <span className="s5-page-kicker-text">BASIS DATA MASTER · MANAJEMEN MADRASAH</span>
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

      {/* Metric Cards Grid (Diselaraskan dengan Beban Guru) */}
      <div className="stat-grid" role="region" aria-label="Ringkasan Statistik Master">
        <KpiMotionCard className="stat-card tone-teal" index={0}>
          <div className="stat-top">
            <span>Dewan Asatidz &amp; Guru</span>
            <div className="stat-icon" aria-hidden="true">
              <Users size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={activeTeachers.length} />
            </strong>
            <span className="stat-unit">/ {state.teachers.length} terdata</span>
          </div>
          <div className="stat-sub">
            Rata-rata {avgTeacherJP} JP/mgg · {teacherClassRatio}x rasio kelas (maks {globalMaxJP} JP)
          </div>
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-sand" index={1}>
          <div className="stat-top">
            <span>Rombongan Belajar</span>
            <div className="stat-icon" aria-hidden="true">
              <GraduationCap size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={activeClasses.length} />
            </strong>
            <span className="stat-unit">Rombel · {totalAssignedJP} JP</span>
          </div>
          <div className="stat-sub">
            VII: {classesVII} · VIII: {classesVIII} · IX: {classesIX}
          </div>
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-blue" index={2}>
          <div className="stat-top">
            <span>Struktur Kurikulum</span>
            <div className="stat-icon" aria-hidden="true">
              <BookOpen size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={activeSubjects.length} />
            </strong>
            <span className="stat-unit">Mapel Aktif</span>
          </div>
          <div className="stat-sub">
            {missingTeachersInSubjects === 0
              ? 'Semua mata pelajaran terampu'
              : `${missingTeachersInSubjects} mapel belum ada guru`}
          </div>
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-rose" index={3}>
          <div className="stat-top">
            <span>Integritas Basis Data</span>
            <div className="stat-icon" aria-hidden="true">
              {integrityScore === 100 ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={integrityScore} suffix="%" />
            </strong>
            <span className="stat-unit">{integrityScore === 100 ? 'Valid' : 'Perlu Lengkapi'}</span>
          </div>
          <div className="stat-sub">
            {integrityScore === 100
              ? 'Validasi master terpenuhi'
              : `${missingTeachersInSubjects + classesWithoutRequirements} catatan kelengkapan`}
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
                {search ? (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => onSearch('')}
                    title="Hapus pencarian"
                    aria-label="Hapus kata kunci pencarian"
                  >
                    <X size={14} />
                  </button>
                ) : (
                  <span className="search-shortcut-hint" title="Tekan / untuk mencari di Data Master">
                    /
                  </span>
                )}
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
                Beban Optimal ({globalOptimalMin}–{globalMaxJP} JP)
              </button>
              <button
                type="button"
                className={`master-filter-chip ${filterPreset === 'overload' ? 'active' : ''}`}
                onClick={() => setFilterPreset(filterPreset === 'overload' ? 'all' : 'overload')}
              >
                Beban Berlebih (&gt; Batas Guru)
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
                  <input type="number" min="1" max="80" value={form.maxWeeklyJP} onChange={(e) => setForm({ ...form, maxWeeklyJP: e.target.value })} />
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
                  const maxJP = t.maxWeeklyJP && t.maxWeeklyJP > 0 ? t.maxWeeklyJP : globalMaxJP;
                  const pct = Math.round((totalAssignedJP / maxJP) * 100);
                  const isOverload = totalAssignedJP > maxJP;
                  const optimalMin = Math.max(1, Math.round(maxJP * 0.8));
                  const isOptimal = totalAssignedJP >= optimalMin && totalAssignedJP <= maxJP;
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
                            title="Lihat rincian data & jadwal guru"
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
                                <span>Edit Data Lengkap</span>
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
          <UnifiedPagination
            totalItems={currentList.length}
            page={page}
            pageSize={pageSize}
            pageSizeOptions={[10, 20, 25, 50]}
            allowShowAll
            itemLabel={activeTab === 'classes' ? 'rombel' : activeTab === 'teachers' ? 'guru' : 'mapel'}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
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
  onUpdateRequirementJP,
  onDelete,
  onGenerate,
  onNavigate,
  onEdit,
  onOpenAddModal,
  onBatchCopyRequirements,
}: {
  state: AppState;
  masterIssues?: ValidationIssue[];
  onUpdateRequirementJP: (reqId: string, nextJP: number) => void;
  onDelete: (requirement: Requirement) => void;
  onGenerate: () => void;
  onNavigate?: (screen: ScreenId) => void;
  onEdit?: (r: Requirement) => void;
  onOpenAddModal?: () => void;
  onBatchCopyRequirements?: (sourceClassId: string, targetClassId: string) => void;
}) {
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');
  const [selectedTeacherFilter, setSelectedTeacherFilter] = useState<string>('ALL');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'class' | 'subject' | 'teacher' | 'jp-desc'>('class');
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
  }, [selectedClassFilter, selectedTeacherFilter, selectedSubjectFilter, sortBy, onlyIssuesFilter, searchQuery]);

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
        return {
          cls,
          allocatedJP,
          diff,
          isExact: diff === 0,
          isOver: diff > 0,
          isUnder: diff < 0,
          reqCount: classReqs.length,
        };
      });
  }, [state.classes, state.requirements, totalWeeklySlots]);

  const defaultMaxWeeklyJP =
    state.settings.maxWeeklyJP && state.settings.maxWeeklyJP > 0 ? state.settings.maxWeeklyJP : 24;

  // 3. Real-Time Teacher Workload Metrics
  const teacherWorkloadStats = useMemo(() => {
    const map = new Map<string, { totalJP: number; maxJP: number; isOver: boolean; isFull: boolean; pct: number }>();
    for (const t of state.teachers) {
      const reqs = state.requirements.filter((r) => r.teacherId === t.id);
      const teacherTotalJP = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
      const maxJP = t.maxWeeklyJP && t.maxWeeklyJP > 0 ? t.maxWeeklyJP : defaultMaxWeeklyJP;
      map.set(t.id, {
        totalJP: teacherTotalJP,
        maxJP,
        isOver: teacherTotalJP > maxJP,
        isFull: teacherTotalJP === maxJP,
        pct: Math.round((teacherTotalJP / maxJP) * 100),
      });
    }
    return map;
  }, [state.teachers, state.requirements, defaultMaxWeeklyJP]);

  // Combine split-teacher allocations per (classId, subjectId)
  const classSubjectTotals = useMemo(() => {
    const map = new Map<string, { totalJP: number; count: number }>();
    for (const r of state.requirements) {
      const key = `${r.classId}|${r.subjectId}`;
      const existing = map.get(key) ?? { totalJP: 0, count: 0 };
      map.set(key, { totalJP: existing.totalJP + r.requiredJP, count: existing.count + 1 });
    }
    return map;
  }, [state.requirements]);

  // 4. Real-Time Data Master Issues
  const liveIssues = useMemo(() => {
    return masterIssues ?? validateMasterData(state);
  }, [masterIssues, state]);

  const criticalIssues = useMemo(() => liveIssues.filter((i) => i.severity === 'error'), [liveIssues]);
  const warningIssues = useMemo(() => liveIssues.filter((i) => i.severity === 'warning'), [liveIssues]);

  // Filtered & Sorted Requirements
  const filteredRequirements = useMemo(() => {
    const filtered = state.requirements.filter((r) => {
      if (selectedClassFilter !== 'ALL' && r.classId !== selectedClassFilter) return false;
      if (selectedTeacherFilter !== 'ALL' && r.teacherId !== selectedTeacherFilter) return false;
      if (selectedSubjectFilter !== 'ALL' && r.subjectId !== selectedSubjectFilter) return false;

      const tStat = teacherWorkloadStats.get(r.teacherId);
      const cStat = classCapacityStats.find((c) => c.cls.id === r.classId);
      const tch = getTeacher(state, r.teacherId);
      const isQualified = Boolean(tch?.subjectIds.includes(r.subjectId));

      if (onlyIssuesFilter) {
        const hasIssue = Boolean(tStat?.isOver || cStat?.isOver || cStat?.isUnder || !isQualified);
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

    return [...filtered].sort((a, b) => {
      if (sortBy === 'jp-desc') return b.requiredJP - a.requiredJP;
      if (sortBy === 'subject') {
        return (getSubject(state, a.subjectId)?.name ?? '').localeCompare(getSubject(state, b.subjectId)?.name ?? '', 'id');
      }
      if (sortBy === 'teacher') {
        return (getTeacher(state, a.teacherId)?.name ?? '').localeCompare(getTeacher(state, b.teacherId)?.name ?? '', 'id');
      }
      const clsCmp = (getClass(state, a.classId)?.name ?? '').localeCompare(getClass(state, b.classId)?.name ?? '', 'id');
      if (clsCmp !== 0) return clsCmp;
      return (getSubject(state, a.subjectId)?.name ?? '').localeCompare(getSubject(state, b.subjectId)?.name ?? '', 'id');
    });
  }, [
    state,
    selectedClassFilter,
    selectedTeacherFilter,
    selectedSubjectFilter,
    sortBy,
    onlyIssuesFilter,
    searchQuery,
    teacherWorkloadStats,
    classCapacityStats,
  ]);

  const activeClassesCount = state.classes.filter((c) => c.isActive).length;
  const totalCapacityJP = totalWeeklySlots * activeClassesCount;
  const balanceExact = totalJP === totalCapacityJP;
  const balanceSurplus = totalJP > totalCapacityJP;
  const incompleteClassCount = classCapacityStats.filter((c) => !c.isExact).length;

  return (
    <>
      <PageHeading
        kicker="PERENCANAAN KURIKULUM & VALIDASI"
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
              onClick={() => (criticalIssues.length > 0 && onNavigate ? onNavigate('generator') : onGenerate())}
            >
              Susun Jadwal Otomatis
            </Button>
            <Button
              icon={Plus}
              onClick={() => onOpenAddModal?.()}
            >
              Tambah Alokasi
            </Button>
          </div>
        }
      />

      {/* MODAL SALIN ALOKASI ROMBEL */}
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
                <span style={{ fontSize: '11px', fontWeight: 600, color: '#92400E', letterSpacing: '0.05em' }}>
                  SALIN ALOKASI PARALEL
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
                  {state.classes.filter((c) => c.isActive).map((c) => {
                    const reqCount = state.requirements.filter((r) => r.classId === c.id).length;
                    const totalJp = state.requirements.filter((r) => r.classId === c.id).reduce((s, r) => s + r.requiredJP, 0);
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
                  {state.classes.filter((c) => c.isActive).map((c) => (
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
                Terapkan Salinan Alokasi →
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Real-Time Requirements & Capacity KPI Grid (Diselaraskan dengan Beban Guru) */}
      <div className="stat-grid">
        <KpiMotionCard className="stat-card tone-teal" index={0}>
          <div className="stat-top">
            <span>Total Kebutuhan JP</span>
            <div className="stat-icon" aria-hidden="true">
              <BookOpen size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={totalJP} />
            </strong>
            <span className="stat-unit">JP</span>
          </div>
          <div className="stat-sub">{state.requirements.length} alokasi mapel terdata</div>
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-sand" index={1}>
          <div className="stat-top">
            <span>Kapasitas KBM</span>
            <div className="stat-icon" aria-hidden="true">
              <Clock size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={totalCapacityJP} />
            </strong>
            <span className="stat-unit">JP</span>
          </div>
          <div className="stat-sub">{totalWeeklySlots} JP per rombel / pekan</div>
        </KpiMotionCard>

        <KpiMotionCard
          className="stat-card tone-blue"
          index={2}
        >
          <div className="stat-top">
            <span>Keseimbangan Alokasi</span>
            <div className="stat-icon" aria-hidden="true">
              <TrendingUp size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              {balanceExact ? (
                <KpiAnimatedNumber value={100} suffix="%" />
              ) : balanceSurplus ? (
                <>
                  +<KpiAnimatedNumber value={totalJP - totalCapacityJP} />
                </>
              ) : (
                <>
                  -<KpiAnimatedNumber value={totalCapacityJP - totalJP} />
                </>
              )}
            </strong>
            <span className="stat-unit">
              {balanceExact ? 'Pas' : balanceSurplus ? 'JP surplus' : 'JP kurang'}
            </span>
          </div>
          <div className="stat-sub">
            {balanceExact ? 'Seluruh slot KBM terisi pas' : 'Perlu diselaraskan dengan JP KBM'}
          </div>
        </KpiMotionCard>

        <KpiMotionCard
          className="stat-card tone-rose"
          index={3}
        >
          <div className="stat-top">
            <span>Rombel Tuntas</span>
            <div className="stat-icon" aria-hidden="true">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={classCapacityStats.filter((c) => c.isExact).length} />
            </strong>
            <span className="stat-unit">/ {classCapacityStats.length} rombel</span>
          </div>
          <div className="stat-sub">
            {incompleteClassCount === 0
              ? 'Semua rombel tepat kapasitas'
              : `${incompleteClassCount} rombel butuh penyesuaian`}
          </div>
        </KpiMotionCard>
      </div>

      {/* Live Issue Context Notice */}
      {liveIssues.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
            padding: '10px 16px',
            background: '#FFFDF5',
            border: '1px solid #EAD39C',
            borderRadius: '10px',
            marginTop: '14px',
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#78350F' }}>
            <AlertTriangle size={15} color="#B45309" />
            <span>
              Terdeteksi <strong>{criticalIssues.length} isu kritis</strong> dan <strong>{warningIssues.length} peringatan</strong> data master &amp; alokasi JP.
            </span>
          </div>
          <button
            type="button"
            className="button button-sm button-secondary"
            onClick={() => setOnlyIssuesFilter((v) => !v)}
          >
            {onlyIssuesFilter ? 'Tampilkan Semua Alokasi' : 'Saring Hanya Bermasalah'}
          </button>
        </div>
      )}

      {/* 4. TOOLBAR & FILTER CONTROLS */}
      <div className="toolbar-card" style={{ marginTop: '14px', marginBottom: '14px', gap: '10px', flexWrap: 'wrap' }}>
        <div className="table-search s5-toolbar-search" style={{ flex: 1, minWidth: '210px' }}>
          <Search size={15} />
          <input
            type="text"
            aria-label="Cari kelas, mata pelajaran, atau guru"
            placeholder="Cari kelas, mapel, atau guru…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Hapus kata kunci"
              title="Hapus pencarian"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <select
          aria-label="Filter berdasarkan rombongan belajar"
          className="s5-toolbar-select"
          value={selectedClassFilter}
          onChange={(e) => setSelectedClassFilter(e.target.value)}
          style={{ minWidth: '175px' }}
        >
          <option value="ALL">Semua Rombel ({classCapacityStats.length})</option>
          {classCapacityStats.map((c) => (
            <option key={c.cls.id} value={c.cls.id}>
              Kelas {c.cls.name} ({c.allocatedJP}/{totalWeeklySlots} JP)
            </option>
          ))}
        </select>

        <select
          aria-label="Filter berdasarkan guru pengampu"
          className="s5-toolbar-select"
          value={selectedTeacherFilter}
          onChange={(e) => setSelectedTeacherFilter(e.target.value)}
          style={{ minWidth: '165px' }}
        >
          <option value="ALL">Semua Guru</option>
          {state.teachers
            .filter((t) => t.isActive)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
        </select>

        <select
          aria-label="Filter berdasarkan mata pelajaran"
          className="s5-toolbar-select"
          value={selectedSubjectFilter}
          onChange={(e) => setSelectedSubjectFilter(e.target.value)}
          style={{ minWidth: '165px' }}
        >
          <option value="ALL">Semua Mapel</option>
          {state.subjects
            .filter((s) => s.isActive)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>

        <select
          aria-label="Urutkan tabel alokasi"
          className="s5-toolbar-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'class' | 'subject' | 'teacher' | 'jp-desc')}
          style={{ minWidth: '150px' }}
        >
          <option value="class">Urut: Per Kelas</option>
          <option value="subject">Urut: Per Mapel</option>
          <option value="teacher">Urut: Per Guru</option>
          <option value="jp-desc">Urut: JP Terbanyak</option>
        </select>

        <button
          type="button"
          className={`filter-tab-btn ${onlyIssuesFilter ? 'active' : ''}`}
          onClick={() => setOnlyIssuesFilter((v) => !v)}
          title="Tampilkan hanya alokasi yang memiliki isu kapasitas atau beban guru"
        >
          <Filter size={12} />
          <span>Hanya Bermasalah</span>
        </button>

        <span className="s5-tnum" style={{ fontSize: '11.5px', color: '#526861', fontWeight: 600, marginLeft: 'auto' }}>
          Menampilkan {filteredRequirements.length} dari {state.requirements.length} alokasi
        </span>
      </div>

      {/* 5. REQUIREMENTS TABLE WITH INLINE STEPPER & LIVE DATA MASTER STATUS */}
      <div className="surface-card" style={{ padding: 0, overflow: 'hidden' }}>
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
                (reqPageSize === 0
                  ? filteredRequirements
                  : filteredRequirements.slice((reqPage - 1) * reqPageSize, reqPage * reqPageSize)
                ).map((r) => {
                  const cls = getClass(state, r.classId);
                  const sub = getSubject(state, r.subjectId);
                  const tch = getTeacher(state, r.teacherId);
                  const tStat = tch ? teacherWorkloadStats.get(tch.id) : undefined;
                  const cStat = classCapacityStats.find((c) => c.cls.id === r.classId);
                  const isTchOver = tStat?.isOver ?? false;
                  const isClsOver = cStat?.isOver ?? false;
                  const isClsUnder = cStat?.isUnder ?? false;
                  const isQualified = Boolean(tch?.subjectIds.includes(r.subjectId));
                  const splitMeta = classSubjectTotals.get(`${r.classId}|${r.subjectId}`);

                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong>Kelas {cls?.name}</strong>
                          <span
                            className="s5-tnum"
                            style={{
                              fontSize: '11.5px',
                              color: isClsOver ? '#9E2A21' : isClsUnder ? '#92400E' : '#166534',
                              fontWeight: 600,
                            }}
                          >
                            {cStat?.allocatedJP ?? 0} / {totalWeeklySlots} JP
                            {isClsOver && ' (Kelebihan)'}
                            {isClsUnder && ` (Kurang ${Math.abs(cStat?.diff ?? 0)} JP)`}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="subject-color-swatch" style={{ background: sub?.color, width: '6px', height: '24px', borderRadius: '3px', flexShrink: 0 }} />
                          <div>
                            <strong style={{ fontSize: '13px' }}>{sub?.name}</strong>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '11px', color: '#526861' }}>Kode: {sub?.code}</span>
                              {splitMeta && splitMeta.count > 1 && (
                                <span
                                  style={{
                                    fontSize: '11px',
                                    color: '#92400E',
                                    background: '#FEF3C7',
                                    padding: '1px 6px',
                                    borderRadius: '4px',
                                    fontWeight: 600,
                                  }}
                                  title="Mapel ini diampu lebih dari 1 guru di kelas yang sama"
                                >
                                  Gabungan: {splitMeta.totalJP} JP
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <strong style={{ fontSize: '13px' }}>{tch?.name}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span
                              className="s5-tnum"
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                padding: '2px 7px',
                                borderRadius: '4px',
                                background: isTchOver ? '#FDE8E5' : tStat?.isFull ? '#E1F4EA' : '#EDF3F8',
                                color: isTchOver ? '#9E2A21' : tStat?.isFull ? '#166534' : '#1E4E6D',
                              }}
                            >
                              Beban: {tStat?.totalJP ?? 0} / {tStat?.maxJP ?? defaultMaxWeeklyJP} JP
                              {isTchOver && ` (Lebih ${(tStat?.totalJP ?? 0) - (tStat?.maxJP ?? defaultMaxWeeklyJP)} JP)`}
                            </span>
                            {!isQualified && (
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: '4px',
                                  background: '#FDE8E5',
                                  color: '#9E2A21',
                                }}
                              >
                                Kualifikasi mapel belum tercatat
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <div className="s5-req-stepper">
                            <button
                              type="button"
                              aria-label={`Kurangi JP ${sub?.name}`}
                              disabled={r.requiredJP <= 1}
                              onClick={() => onUpdateRequirementJP(r.id, r.requiredJP - 1)}
                            >
                              <Minus size={12} />
                            </button>
                            <strong>{r.requiredJP}</strong>
                            <button
                              type="button"
                              aria-label={`Tambah JP ${sub?.name}`}
                              disabled={r.requiredJP >= 50}
                              onClick={() => onUpdateRequirementJP(r.id, r.requiredJP + 1)}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                          <span style={{ fontSize: '11.5px', color: '#526861' }}>JP/mgg</span>
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
          <UnifiedPagination
            totalItems={filteredRequirements.length}
            page={reqPage}
            pageSize={reqPageSize}
            pageSizeOptions={[10, 20, 25, 50]}
            allowShowAll
            itemLabel="alokasi"
            onPageChange={setReqPage}
            onPageSizeChange={(size) => {
              setReqPageSize(size);
              setPageResetIfNeeded(setReqPage);
            }}
          />
        </div>
      </div>
    </>
  );
}

function setPageResetIfNeeded(setter: (page: number) => void) {
  setter(1);
}

/**
 * VALIDATION SCREEN
 */
function ValidationScreen({
  state,
  report,
  masterIssues,
  expandedIssue,
  setExpandedIssue,
  onNavigate,
  onNavigateToSlot,
  onValidate,
}: {
  state: AppState;
  report: ReturnType<typeof validateSchedule>;
  masterIssues: ValidationIssue[];
  expandedIssue: string | null;
  setExpandedIssue: (id: string | null) => void;
  onNavigate?: (screen: ScreenId) => void;
  onNavigateToSlot?: (classId: string, day: Day, jpNo: number) => void;
  onValidate: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'teacher' | 'class' | 'time' | 'allocation'>('all');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'error' | 'warning'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const combined = useMemo(() => [...masterIssues, ...report.issues], [masterIssues, report.issues]);
  const hardErrors = useMemo(() => combined.filter((i) => i.severity === 'error'), [combined]);
  const warningCount = combined.length - hardErrors.length;
  const complianceScore = Math.max(0, 100 - hardErrors.length * 20 - Math.min(15, warningCount * 2));

  const categoryCounts = useMemo(() => {
    const counts = { all: combined.length, teacher: 0, class: 0, time: 0, allocation: 0 };
    for (const issue of combined) {
      counts[getValidationCategoryGroup(issue)] += 1;
    }
    return counts;
  }, [combined]);

  const visibleIssues = useMemo(() => {
    return combined.filter((issue) => {
      if (categoryFilter !== 'all' && getValidationCategoryGroup(issue) !== categoryFilter) return false;
      if (severityFilter !== 'all' && issue.severity !== severityFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const label = formatValidationCategoryLabel(issue.code).toLowerCase();
        const hay = `${issue.title} ${issue.message} ${issue.context ?? ''} ${label}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [combined, categoryFilter, severityFilter, searchQuery]);

  return (
    <>
      <PageHeading
        kicker="KEPATUHAN ATURAN JADWAL"
        title="Validasi &amp; Konflik Jadwal"
        description="Sistem pemeriksaan otomatis memastikan jadwal 100% bebas bentrok aturan wajib sebelum diterbitkan."
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
          <p>{hardErrors.length ? 'Perbaiki seluruh bentrok aturan wajib sebelum menerbitkan jadwal resmi.' : 'Tidak ada konflik guru, bentrok kelas, atau ketidaksesuaian alokasi.'}</p>
        </div>
        <div className="validation-banner-count">
          <strong className="s5-tnum">{hardErrors.length}</strong>
          <span>BENTROK WAJIB</span>
        </div>
      </div>

      {/* Real-Time Compliance & Audit KPI Grid (Diselaraskan dengan Beban Guru) */}
      <div className="stat-grid">
        <KpiMotionCard index={0} className="stat-card tone-teal">
          <div className="stat-top">
            <span>Skor Kepatuhan</span>
            <div className="stat-icon" aria-hidden="true">
              <ShieldCheck size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={complianceScore} suffix="%" />
            </strong>
            <span className="stat-unit">kepatuhan</span>
          </div>
          <div className="stat-sub">
            {hardErrors.length === 0 ? 'Lolos semua aturan wajib' : `${hardErrors.length} pelanggaran wajib`}
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={1} className="stat-card tone-sand">
          <div className="stat-top">
            <span>Bentrok Wajib</span>
            <div className="stat-icon" aria-hidden="true">
              <XCircle size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={hardErrors.length} />
            </strong>
            <span className="stat-unit">temuan</span>
          </div>
          <div className="stat-sub">
            {hardErrors.length === 0 ? 'Nihil bentrok aturan wajib' : 'Wajib diselesaikan sebelum terbit'}
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={2} className="stat-card tone-blue">
          <div className="stat-top">
            <span>Saran Optimalisasi</span>
            <div className="stat-icon" aria-hidden="true">
              <AlertTriangle size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={warningCount} />
            </strong>
            <span className="stat-unit">saran</span>
          </div>
          <div className="stat-sub">Preferensi blok 2 JP &amp; beban</div>
        </KpiMotionCard>

        <KpiMotionCard index={3} className="stat-card tone-rose">
          <div className="stat-top">
            <span>Status Kelayakan</span>
            <div className="stat-icon" aria-hidden="true">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>{hardErrors.length === 0 ? 'Siap Terbit' : 'Ditahan'}</strong>
          </div>
          <div className="stat-sub">
            {hardErrors.length === 0 ? 'Jadwal siap edar resmi' : 'Selesaikan bentrok wajib terlebih dahulu'}
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

      {/* Toolbar & Category Filters when issues exist */}
      {combined.length > 0 && (
        <div className="toolbar-card" style={{ marginTop: '16px', marginBottom: '12px', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: `Semua (${categoryCounts.all})` },
              { id: 'teacher', label: `Guru & Beban (${categoryCounts.teacher})` },
              { id: 'class', label: `Kelas & Blok (${categoryCounts.class})` },
              { id: 'time', label: `Waktu & Hari (${categoryCounts.time})` },
              { id: 'allocation', label: `Alokasi & Master (${categoryCounts.allocation})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`filter-tab-btn ${categoryFilter === tab.id ? 'active' : ''}`}
                onClick={() => setCategoryFilter(tab.id as typeof categoryFilter)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto', flexWrap: 'wrap' }}>
            <select
              aria-label="Saring tingkat keparahan masalah"
              className="s5-toolbar-select"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as 'all' | 'error' | 'warning')}
              style={{ minWidth: '150px' }}
            >
              <option value="all">Semua Tingkat</option>
              <option value="error">Wajib Diperbaiki ({hardErrors.length})</option>
              <option value="warning">Saran Optimalisasi ({warningCount})</option>
            </select>

            <div className="table-search s5-toolbar-search" style={{ minWidth: '200px' }}>
              <Search size={14} />
              <input
                type="text"
                aria-label="Cari konflik atau rekomendasi"
                placeholder="Cari konflik, kelas, guru…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Hapus pencarian"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {combined.length === 0 ? (
        <div className="surface-card" style={{ marginTop: '16px', padding: '32px 24px', textAlign: 'center', background: '#f5faf7', border: '1.5px solid #c3e5d0' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#d1fae5', color: '#065f46', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
            <CheckCircle2 size={26} />
          </div>
          <h3 style={{ margin: '0 0 6px', fontSize: '17px', color: '#065f46', fontWeight: 700 }}>
            Audit Kepatuhan: 100% Bebas Bentrok
          </h3>
          <p style={{ margin: '0 0 16px', color: '#16483f', fontSize: '13px', maxWidth: '520px', marginLeft: 'auto', marginRight: 'auto' }}>
            Seluruh jadwal KBM, kuota mingguan rombel, ketersediaan hari mengajar, batas beban guru, dan slot non-KBM telah diverifikasi tanpa konflik.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            {onNavigate && (
              <Button onClick={() => onNavigate('schedule')} icon={CalendarDays}>
                Buka Matriks Jadwal
              </Button>
            )}
          </div>
        </div>
      ) : visibleIssues.length === 0 ? (
        <div className="surface-card" style={{ padding: '28px', textAlign: 'center', color: '#526861' }}>
          Tidak ada temuan yang cocok dengan filter yang diterapkan.
        </div>
      ) : (
        <div className="issue-list">
          {visibleIssues.map((issue, idx) => {
            const isExpanded = expandedIssue === issue.id;
            const isError = issue.severity === 'error';
            const categoryLabel = formatValidationCategoryLabel(issue.code);
            const targetScreen = getTargetScreenForIssue(issue);

            return (
              <MotionStaggerItem
                key={issue.id}
                index={idx}
                className={`s5-validation-issue-card ${isError ? 'is-error' : 'is-warning'}`}
              >
                <div
                  className="s5-validation-issue-main"
                  onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1 }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: isError ? '#FDE8E5' : '#FEF3C7',
                        color: isError ? '#9E2A21' : '#92400E',
                        display: 'grid',
                        placeItems: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                      }}
                    >
                      {isError ? <XCircle size={18} /> : <AlertTriangle size={18} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '13.5px', color: '#0B2923' }}>{issue.title}</strong>
                        <span className="s5-issue-code-label">· {categoryLabel}</span>
                      </div>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#465B54', lineHeight: 1.45 }}>
                        {issue.message}
                      </p>
                      {issue.context && (
                        <span style={{ display: 'inline-block', marginTop: '4px', fontSize: '11.5px', color: isError ? '#9E2A21' : '#92400E', fontWeight: 600 }}>
                          Konteks: {issue.context}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    {(issue.targetSlot || onNavigate) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (issue.targetSlot && onNavigateToSlot) {
                            onNavigateToSlot(issue.targetSlot.classId, issue.targetSlot.day, issue.targetSlot.jpNo);
                          } else if (onNavigate) {
                            onNavigate(targetScreen);
                          }
                        }}
                      >
                        {getActionLabelForIssue(issue)} →
                      </Button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={isExpanded ? 'Tutup detail rekomendasi' : 'Lihat rekomendasi penyelesaian'}
                      onClick={() => setExpandedIssue(isExpanded ? null : issue.id)}
                    >
                      <ChevronDown className={`issue-chevron ${isExpanded ? 'is-open' : ''}`} size={17} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="s5-validation-expanded">
                    <div style={{ flex: 1, minWidth: '240px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#526861', display: 'block' }}>
                        REKOMENDASI PENYELESAIAN
                      </span>
                      <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#0B2923', lineHeight: 1.45 }}>
                        {issue.action || 'Periksa data terkait pada area sumber dan jalankan Uji Ulang Jadwal.'}
                      </p>
                    </div>
                    <span style={{ fontSize: '11.5px', color: '#526861', fontWeight: 600 }}>
                      Prioritas: {isError ? 'Wajib diperbaiki sebelum terbit' : 'Optimalisasi opsional'}
                    </span>
                  </div>
                )}
              </MotionStaggerItem>
            );
          })}
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
        kicker="RIWAYAT VERSI"
        title="Riwayat Versi &amp; Cadangan Data"
        description="Salinan jadwal resmi dan cadangan data madrasah tersimpan secara lokal. Anda dapat memulihkan versi sebelumnya kapan saja."
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
                  <div className="version-kicker">{idx === 0 ? 'VERSI AKTIF' : `ARSIP · VERSI ${version.version}`}</div>
                  <h3>{version.label}</h3>
                </div>
                <div className="version-actions">
                  {idx === 0 && <StatusPill status="success">Aktif</StatusPill>}
                  <Button variant="secondary" icon={RefreshCw} onClick={() => onRestore(version)}>Pulihkan ke Draf</Button>
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
        kicker="CADANGAN & EKSPOR DATA"
        title="Ekspor &amp; Cadangan Data"
        description={`Seluruh data ${state.settings.schoolName} tersimpan di browser Anda. Ekspor berkas cadangan secara teratur untuk keamanan.`}
        actions={
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="secondary" icon={Download} onClick={onExportJSON}>Ekspor JSON</Button>
            <Button icon={Download} onClick={onBackup}>Unduh Cadangan JSON</Button>
          </div>
        }
      />

      <div className="s5-backup-bento-grid">
        <KpiMotionCard index={0} className="backup-action-card">
          <div className="backup-action-icon json"><FileCheck2 size={21} /></div>
          <div className="backup-action-copy">
            <div className="backup-action-kicker">ARSIP PENUH RUANG KERJA</div>
            <h3>Cadangan Penuh JSON</h3>
            <p>Cadangkan seluruh data master, alokasi kebutuhan, presensi, hari libur, dan jadwal ke berkas aman.</p>
            <Button icon={Download} onClick={onBackup}>Unduh Cadangan JSON</Button>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={1} className="backup-action-card">
          <div className="backup-action-icon csv"><FileSpreadsheet size={21} /></div>
          <div className="backup-action-copy">
            <div className="backup-action-kicker">EKSPOR LEMBAR KERJA</div>
            <h3>Ekspor Jadwal CSV</h3>
            <p>Ekspor susunan jadwal ke format tabel CSV untuk dibuka di Microsoft Excel atau Google Sheets.</p>
            <Button variant="secondary" icon={FileSpreadsheet} onClick={onExportCSV}>Ekspor CSV</Button>
          </div>
        </KpiMotionCard>

        <KpiMotionCard index={2} className="backup-action-card">
          <div className="backup-action-icon json"><Upload size={21} /></div>
          <div className="backup-action-copy">
            <div className="backup-action-kicker">PULIHKAN CADANGAN</div>
            <h3>Pulihkan Data Cadangan</h3>
            <p>Pilih berkas JSON hasil cadangan sebelumnya untuk memulihkan seluruh data madrasah.</p>
            <label className="button button-secondary file-pick-button">
              <Upload size={15} /> Pilih Berkas JSON
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
