import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  Database,
  History,
  Home,
  Info,
  Save,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Users,
  WandSparkles,
  X,
  XCircle,
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
} from './domain/types';
import { buildTimeSlots, teachingPeriodsForDay } from './domain/time';
import { createDemoState } from './domain/seed';
import { generateSchedule } from './domain/generator';
import {
  buildScheduleFingerprint,
  validateMasterData,
  validateSchedule,
} from './domain/validator';
import {
  exportAppState,
  getLocalWorkspaceSavedAt,
  loadAppState,
  migrateAppStateSchema,
  parseBackupFileDetailed,
  restoreWorkspaceSafely,
  saveAppState,
  validateAppStateStructure,
  type BackupParseResult,
} from './storage/db';
import { fetchWorkspaceFromNeon, pushWorkspaceToNeon } from './storage/neonSync';
import { WorkloadDashboard } from './components/WorkloadDashboard';
import { AttendanceScreen } from './components/AttendanceScreen';
import { PersuratanWorkspace } from './components/persuratan/PersuratanWorkspace';
import { SettingsScreen } from './components/SettingsScreen';
import { QuickValidationModal } from './components/QuickValidationModal';
import { SchedulePdfExportModal } from './components/SchedulePdfExportModal';
import { EntityEditModal, type EntityEditTarget } from './components/EntityEditModal';
import { detectTeacherGender } from './components/MadrasahTeacherAvatar';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { TimeMachineDrawer } from './components/TimeMachineDrawer';
import { InspectorSlideDrawer, type InspectorTarget } from './components/InspectorSlideDrawer';
import { TeacherAssignmentDrawer } from './components/TeacherAssignmentDrawer';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SovereignSidebar, type SovereignSidebarGroup } from './components/SovereignSidebar';
import { MICRO_EASE, MotionPageTransition } from './components/KpiMotion';
import { SakalaSplashScreen } from './components/SakalaSplashScreen';
import {
  LoadingScreen,
  Modal,
  emptyMasterForm,
  getClass,
  getEntry,
  getSubject,
  getTeacher,
  titleForScreen,
  type AddType,
  type EditSlotContext,
  type MasterTab,
  type ScreenId,
  type ToastData,
} from './components/ScreenPrimitives';
import { OperatorOverviewScreen } from './screens/OperatorOverviewScreen';
import { ScheduleScreen } from './screens/ScheduleScreen';
import { GeneratorScreen } from './screens/GeneratorScreen';
import { MasterScreen } from './screens/MasterScreen';
import { RequirementsScreen } from './screens/RequirementsScreen';
import { ValidationScreen } from './screens/ValidationScreen';
import { HistoryAndBackupScreen } from './screens/HistoryAndBackupScreen';
import type { PersuratanLaunchRequest } from './domain/persuratan/types';
import { buildSkTeachingLaunchPayload } from './domain/persuratan/assignments/teacherIntegration';
import { createSnapshot } from './storage/snapshotEngine';

export {
  OperatorOverviewScreen,
  ScheduleScreen,
  GeneratorScreen,
  MasterScreen,
  RequirementsScreen,
  ValidationScreen,
  HistoryAndBackupScreen,
};

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
  const [showIntroSplash, setShowIntroSplash] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false;
      return window.sessionStorage.getItem('sakala_intro_seen') !== '1';
    } catch {
      return false;
    }
  });
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
  const [pendingMasterDelete, setPendingMasterDelete] = useState<{
    kind: MasterTab;
    id: string;
    label: string;
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

  const neonEnabledRef = useRef(false);
  const skipNextNeonPushRef = useRef(false);
  const neonSyncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;
    loadAppState().then(async (loaded) => {
      if (!mounted) return;
      setWorkspace(loaded);
      setSelectedClass(loaded.classes.find((item) => item.isActive)?.id ?? '');
      setReady(true);

      const activeDatabaseMode =
        loaded.settings.databaseMode ??
        (loaded.settings.cloudSyncEnabled === false ? 'local' : 'neon');
      const isNeonPrimary = activeDatabaseMode === 'neon';
      neonEnabledRef.current = isNeonPrimary;
      if (!isNeonPrimary) return;

      const remote = await fetchWorkspaceFromNeon();
      if (!mounted || !remote || !remote.configured) return;

      if (remote.exists && remote.state) {
        try {
          validateAppStateStructure(remote.state);
          const { state: migratedRemote } = migrateAppStateSchema(remote.state);
          const localSavedAt = await getLocalWorkspaceSavedAt();
          const remoteTime = remote.updatedAt ? Date.parse(remote.updatedAt) : 0;
          const localTime = localSavedAt ? Date.parse(localSavedAt) : 0;
          const shouldPreferRemote =
            (loaded.dataMode !== 'custom' && migratedRemote.dataMode === 'custom') ||
            (Number.isFinite(remoteTime) && (!Number.isFinite(localTime) || remoteTime >= localTime));

          if (shouldPreferRemote) {
            skipNextNeonPushRef.current = true;
            await saveAppState(migratedRemote);
            if (!mounted) return;
            setWorkspace(migratedRemote);
            setSelectedClass(migratedRemote.classes.find((item) => item.isActive)?.id ?? '');
          }
        } catch {
          // Keep local IndexedDB fallback intact if remote payload is invalid
        }
      } else if (!remote.exists) {
        await pushWorkspaceToNeon(loaded);
      }
    });
    return () => {
      mounted = false;
      if (neonSyncTimerRef.current !== null) {
        window.clearTimeout(neonSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!ready || !workspace) return;
    const activeDatabaseMode =
      workspace.settings.databaseMode ??
      (workspace.settings.cloudSyncEnabled === false ? 'local' : 'neon');
    const isNeonPrimary = activeDatabaseMode === 'neon';
    neonEnabledRef.current = isNeonPrimary;

    if (typeof document !== 'undefined') {
      document.documentElement.dataset.figmaPremium = workspace.settings.figmaPremiumEnabled
        ? 'active'
        : 'inactive';
    }

    saveAppState(workspace)
      .then(() => {
        setStorageError(null);
        if (isNeonPrimary) {
          if (skipNextNeonPushRef.current) {
            skipNextNeonPushRef.current = false;
          } else {
            if (neonSyncTimerRef.current !== null) {
              window.clearTimeout(neonSyncTimerRef.current);
            }
            neonSyncTimerRef.current = window.setTimeout(() => {
              neonSyncTimerRef.current = null;
              void pushWorkspaceToNeon(workspace);
            }, 900);
          }
        } else if (neonSyncTimerRef.current !== null) {
          window.clearTimeout(neonSyncTimerRef.current);
          neonSyncTimerRef.current = null;
        }
      })
      .catch((error) => {
        console.error('Could not persist SAKALA data:', error);
        const msg =
          'Penyimpanan lokal browser (IndexedDB) gagal atau tidak tersedia. Segera ekspor backup sebelum menutup.';
        setStorageError(msg);
        setToast({ message: 'Penyimpanan lokal tidak tersedia. Segera ekspor backup sebelum menutup.', kind: 'warning' });
      });
  }, [workspace, ready]);

  const shouldReduceMotion = useReducedMotion();
  const toastTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const notify = useCallback((message: string, kind: ToastData['kind'] = 'success') => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    setToast({ message, kind });
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast(null);
    }, 4500);
  }, []);

  const retrySaveWorkspace = useCallback(() => {
    if (!workspace) return;
    saveAppState(workspace)
      .then(() => {
        setStorageError(null);
        if (neonEnabledRef.current) {
          void pushWorkspaceToNeon(workspace);
        }
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
      if (neonEnabledRef.current) {
        skipNextNeonPushRef.current = true;
        await pushWorkspaceToNeon(nextState);
      }
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
    const prevDbMode =
      workspace?.settings.databaseMode ??
      (workspace?.settings.cloudSyncEnabled === false ? 'local' : 'neon');
    const nextDbMode =
      changes.databaseMode ??
      (changes.cloudSyncEnabled !== undefined
        ? changes.cloudSyncEnabled
          ? 'neon'
          : 'local'
        : prevDbMode);
    const prevFigma = Boolean(workspace?.settings.figmaPremiumEnabled);
    const nextFigma =
      changes.figmaPremiumEnabled !== undefined ? Boolean(changes.figmaPremiumEnabled) : prevFigma;

    updateWorkspace((current) => {
      const settings = { ...current.settings, ...changes };
      return { ...current, settings, slots: buildTimeSlots(settings) };
    }, true);
    setSettingsSaved(true);
    setSettingsDirty(false);

    if (prevDbMode !== nextDbMode) {
      notify(
        nextDbMode === 'neon'
          ? 'Model database diatur ke Neon PostgreSQL (Utama · Lokal sebagai cadangan).'
          : 'Model database diatur ke Lokal IndexedDB (Mode Browser Offline).',
        nextDbMode === 'neon' ? 'success' : 'info',
      );
    } else if (prevFigma !== nextFigma) {
      notify(
        nextFigma ? 'Mode Figma Premium diaktifkan.' : 'Mode Figma Premium dinonaktifkan.',
        nextFigma ? 'success' : 'info',
      );
    } else {
      notify('Struktur waktu dan aturan beban mengajar diperbarui.', 'success');
    }
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
    const label =
      kind === 'classes'
        ? `Kelas ${getClass(workspace, id)?.name ?? id}`
        : kind === 'teachers'
        ? `Guru ${getTeacher(workspace, id)?.name ?? id}`
        : `Mata Pelajaran ${getSubject(workspace, id)?.name ?? id}`;
    setPendingMasterDelete({ kind, id, label });
  };

  const confirmExecuteMasterDelete = () => {
    if (!workspace || !pendingMasterDelete) return;
    const { kind, id, label } = pendingMasterDelete;
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
    setPendingMasterDelete(null);
    notify(`${label} beserta relasi terkait telah dihapus.`, 'info');
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
    if (report && report.hardErrorCount > 0) {
      notify(
        `CSV jadwal berhasil diunduh (catatan: masih terdapat ${report.hardErrorCount} bentrok aturan wajib).`,
        'warning',
      );
    } else {
      notify('CSV jadwal berhasil diunduh.', 'success');
    }
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
    <div
      className="app-shell"
      data-figma-premium={workspace.settings.figmaPremiumEnabled ? 'active' : 'inactive'}
    >
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
              type="button"
              className={`icon-button mobile-menu-trigger ${sidebarOpen ? 'is-open' : ''}`}
              aria-label={sidebarOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              <span className="s5-morph-burger" aria-hidden="true">
                <span className="s5-morph-line top" />
                <span className="s5-morph-line mid" />
                <span className="s5-morph-line bot" />
              </span>
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
            {/* Riwayat Versi & Cadangan Trigger */}
            <button
              className="s5-time-machine-btn is-icon-only s5-tooltip-bottom"
              onClick={() => setIsTimeMachineOpen(true)}
              type="button"
              aria-label="Riwayat versi & pemulihan jadwal"
              data-s5-tooltip="Riwayat versi & pemulihan jadwal"
            >
              <Clock size={15} strokeWidth={1.75} aria-hidden="true" />
              <span className="sr-only">Riwayat Versi</span>
            </button>

            <span className="s5-topbar-divider" aria-hidden="true" />

            {/* Real-time Validation Indicator (Semantic Icon, Zero Decorative Dot) */}
            <button
              type="button"
              className={`s5-heartbeat-pill s5-tooltip-bottom s5-tooltip-end is-icon-compact ${report && report.hardErrorCount > 0 ? 'clash' : 'clean'}`}
              onClick={() => setQuickValidationOpen(true)}
              aria-label={report && report.hardErrorCount > 0 ? `${report.hardErrorCount} Bentrok` : 'Bebas Bentrok'}
              data-s5-tooltip={report?.hardErrorCount ? `Periksa ${report.hardErrorCount} bentrok jadwal KBM` : 'Jadwal terverifikasi bebas bentrok'}
            >
              {report && report.hardErrorCount > 0 ? (
                <>
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span className="s5-tnum">
                    {report.hardErrorCount}
                    <span className="sr-only"> Bentrok</span>
                  </span>
                </>
              ) : (
                <>
                  <ShieldCheck size={14} aria-hidden="true" />
                  <span className="sr-only">Bebas Bentrok</span>
                </>
              )}
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
                <div className="demo-banner-main">
                  <div className="demo-banner-icon" aria-hidden="true"><Sparkles size={15} /></div>
                  <strong>Mode Demo</strong>
                  <span
                    className="s5-info-icon-trigger s5-tooltip-bottom"
                    tabIndex={0}
                    role="img"
                    aria-label="Informasi dataset demonstrasi"
                    data-s5-tooltip="Jadwal dan presensi sudah terverifikasi. Sesuaikan data madrasah Anda sebelum mencetak."
                  >
                    <Info size={12} aria-hidden="true" />
                  </span>
                </div>
                <div className="demo-banner-actions">
                  <button type="button" onClick={() => navigate('master')}>Sesuaikan Data <ArrowRight size={14} /></button>
                  <button
                    type="button"
                    className="demo-banner-close"
                    onClick={() => updateWorkspace((current) => ({ ...current, dataMode: 'custom' }))}
                    aria-label="Sembunyikan banner"
                    data-s5-tooltip="Tutup mode demo"
                  >
                    <X size={14} />
                  </button>
                </div>
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
                onOpenPdfModal={() => setPdfExportOpen(true)}
                onExportCSV={exportScheduleCSV}
                onValidate={() => {
                  const newReport = validateSchedule(workspace, workspace.draft ?? workspace.activeSchedule ?? [], { strictCoverage: true, includeSoftWarnings: true });
                  notify(newReport.valid ? 'Validasi selesai: jadwal bebas pelanggaran.' : `Validasi selesai: ditemukan ${newReport.hardErrorCount} pelanggaran wajib.`, newReport.valid ? 'success' : 'warning');
                }}
              />
            )}

            {/* SCREEN 9 & 10: RIWAYAT VERSI & CADANGAN */}
            {(screen === 'history' || screen === 'backup') && (
              <HistoryAndBackupScreen
                state={workspace}
                initialTab={screen === 'backup' ? 'backup' : 'versions'}
                onRestore={restoreVersion}
                onNavigate={navigate}
                onOpenTimeMachine={() => setIsTimeMachineOpen(true)}
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
              <span>
                {(workspace.settings.databaseMode ??
                  (workspace.settings.cloudSyncEnabled === false ? 'local' : 'neon')) === 'neon'
                  ? 'Neon First · Cadangan lokal aktif'
                  : 'Penyimpanan lokal aktif di browser'}
              </span>
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
                  <span style={{ color: '#4a6b62', fontSize: '12px' }}>
                    Hari {editingSlot.day} · JP ke-{editingSlot.jpNo} (Durasi {workspace.settings.periodMinutes || 40} menit/JP)
                  </span>
                </div>
              </div>
              <span
                style={{
                  fontSize: '12px',
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
                  fontSize: '12px',
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
              <span>Perubahan disimpan ke draft dan diperiksa otomatis agar bebas bentrok.</span>
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
        onOpenPdfModal={() => {
          setQuickValidationOpen(false);
          setPdfExportOpen(true);
        }}
      />

      {/* PDF Export Modal */}
      <SchedulePdfExportModal
        state={workspace}
        selectedClassId={selectedClass}
        isOpen={pdfExportOpen}
        onClose={() => setPdfExportOpen(false)}
        onNotify={notify}
        hardErrorCount={report?.hardErrorCount ?? 0}
        warningCount={report?.warningCount ?? 0}
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

      {/* Delete Master Data Confirmation Modal */}
      {pendingMasterDelete && (
        <Modal
          title="Konfirmasi Penghapusan Data Master"
          subtitle={pendingMasterDelete.label}
          icon={AlertTriangle}
          onClose={() => setPendingMasterDelete(null)}
        >
          <div style={{ padding: '18px 22px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: 'var(--s5-ink-secondary)' }}>
              Hapus <strong>{pendingMasterDelete.label}</strong>? Penempatan jadwal atau alokasi kebutuhan JP yang terkait juga akan ikut dibersihkan secara otomatis.
            </p>
            <div className="modal-actions" style={{ justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                className="button button-quiet"
                onClick={() => setPendingMasterDelete(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={confirmExecuteMasterDelete}
              >
                Hapus Permanen
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Sovereign Haute Joaillerie Luxury Toast */}
      <div className="s5-luxury-toast-container" role="status" aria-live="polite">
        <AnimatePresence>
          {toast && (
            <motion.div
              key={`${toast.kind}-${toast.message}`}
              className={`s5-luxury-toast ${toast.kind}`}
              initial={shouldReduceMotion ? false : { opacity: 0, y: -12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.21, ease: MICRO_EASE }}
            >
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {showIntroSplash && (
        <SakalaSplashScreen
          mode="intro"
          onDone={() => {
            try {
              window.sessionStorage.setItem('sakala_intro_seen', '1');
            } catch {
              // ignore storage restriction
            }
            setShowIntroSplash(false);
          }}
        />
      )}
    </div>
  );
}
