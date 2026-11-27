import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BookOpen,
  Check,
  CheckCircle2,
  Download,
  Edit2,
  FileCheck2,
  GraduationCap,
  HardDrive,
  LayoutGrid,
  Minus,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  ToggleRight,
  Trash2,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState, SchoolClass, Subject, Teacher } from '../domain/types';
import { COMMON_TEACHER_POSITIONS } from '../utils/madrasahLogo';
import { motion, useReducedMotion } from 'framer-motion';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { KpiAnimatedNumber, KpiMotionCard, MICRO_EASE } from '../components/KpiMotion';
import { MadrasahTeacherAvatar } from '../components/MadrasahTeacherAvatar';
import { TeacherGenderToggle } from '../components/TeacherGenderToggle';
import { TableRowActions } from '../components/TableRowActions';
import { UnifiedPagination } from '../components/UnifiedPagination';
import {
  Button,
  Card,
  StatusPill,
  emptyMasterForm,
  getSubject,
  type AddType,
  type MasterTab,
  type ScreenId,
} from '../components/ScreenPrimitives';

function getRoleBadgeVariant(roleTitle?: string): 'curriculum' | 'bk' | 'wali' | 'regular' {
  if (!roleTitle) return 'regular';
  const lower = roleTitle.toLowerCase();
  if (lower.includes('kurikulum') || lower.includes('kepala') || lower.includes('waka')) return 'curriculum';
  if (lower.includes('bk') || lower.includes('konseling')) return 'bk';
  if (lower.includes('wali')) return 'wali';
  return 'regular';
}

export function MasterScreen({
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
  const shouldReduceMotion = useReducedMotion();
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState<number>(1);
  const [filterPreset, setFilterPreset] = useState<string>('all');
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
      <EditorialPageHeader
        kicker="BASIS DATA MASTER"
        title="Data Master Madrasah"
        subtitle="Kelola kelas, dewan guru, dan mata pelajaran."
        meta={
          <>
            <span>T.A. {state.settings.academicYear} ({state.settings.semester})</span>
            <span className="s5-editorial-meta-sep" aria-hidden="true">·</span>
            <span>{activeClasses.length} Rombel</span>
            <span className="s5-editorial-meta-sep" aria-hidden="true">·</span>
            <span>{activeTeachers.length} Guru</span>
            <span className="s5-editorial-meta-sep" aria-hidden="true">·</span>
            <span>Kesiapan {integrityScore}%</span>
          </>
        }
        overflowLabel={onNavigate ? 'Lainnya' : undefined}
        overflowActions={
          onNavigate
            ? [
                {
                  id: 'nav-workload',
                  label: 'Matriks Beban Guru',
                  description: 'Tinjau distribusi JP per pendidik',
                  icon: <Activity size={15} />,
                  onClick: () => onNavigate('workload'),
                },
                {
                  id: 'nav-validation',
                  label: 'Validasi & Konflik',
                  description: 'Periksa kelengkapan dan kepatuhan data',
                  icon: <FileCheck2 size={15} />,
                  onClick: () => onNavigate('validation'),
                },
              ]
            : undefined
        }
        primaryAction={{
          label: `Tambah ${tabEntityLabel}`,
          icon: <Plus size={15} />,
          shortcut: 'N',
          title: `Tambah ${tabEntityLabel} baru`,
          onClick: () =>
            onOpenAddModal
              ? onOpenAddModal(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject')
              : onAdd(activeTab === 'classes' ? 'class' : activeTab === 'teachers' ? 'teacher' : 'subject'),
        }}
      />

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
                {activeTab === 'classes' && (
                  <motion.span
                    layoutId="masterTabPill"
                    className="s5-sliding-tab-pill"
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: MICRO_EASE }}
                    aria-hidden="true"
                  />
                )}
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
                {activeTab === 'teachers' && (
                  <motion.span
                    layoutId="masterTabPill"
                    className="s5-sliding-tab-pill"
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: MICRO_EASE }}
                    aria-hidden="true"
                  />
                )}
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
                {activeTab === 'subjects' && (
                  <motion.span
                    layoutId="masterTabPill"
                    className="s5-sliding-tab-pill"
                    transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.22, ease: MICRO_EASE }}
                    aria-hidden="true"
                  />
                )}
                <span className="master-tab-btn-content">
                  <BookOpen size={14} className="master-tab-icon" />
                  <span>Mata Pelajaran</span>
                  <span className="tab-count">{state.subjects.length}</span>
                </span>
              </button>
            </div>
          </div>
        }
      >
        <div className="master-unified-controls" role="region" aria-label="Filter dan Pencarian Data Master">
          <div className="master-unified-chips" role="group" aria-label="Filter Preset Data Master">
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

          <div className="master-unified-search">
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

        {addType && (
          <form className="inline-create-form" onSubmit={onSave}>
            <div className="inline-create-title">
              <div className="inline-create-icon"><Plus size={17} /></div>
              <div>
                <strong>Tambah {addType === 'class' ? 'Kelas Baru' : addType === 'teacher' ? 'Guru Baru' : 'Mapel Baru'}</strong>
                <span
                  tabIndex={0}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  data-s5-tooltip="Data tersimpan secara lokal dan aman di browser Anda."
                >
                  <HardDrive size={12} aria-hidden="true" />
                  <span>Penyimpanan Lokal</span>
                </span>
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
                  <TeacherGenderToggle
                    value={form.gender}
                    onChange={(gender) => setForm({ ...form, gender })}
                  />
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
                        <TableRowActions
                          ariaLabel={`Opsi Kelas ${c.name}`}
                          primary={{
                            label: 'Edit',
                            icon: <Edit2 size={13} strokeWidth={1.75} />,
                            iconOnly: true,
                            onClick: () => onEditClass(c),
                            title: 'Edit data kelas',
                          }}
                          items={[
                            {
                              id: 'delete-class',
                              label: 'Hapus Kelas',
                              icon: <Trash2 size={13} />,
                              tone: 'danger',
                              onClick: () => onDelete('classes', c.id),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
                        <TableRowActions
                          ariaLabel={`Opsi ${t.name}`}
                          primary={{
                            label: 'Inspeksi',
                            icon: <Pencil size={13} strokeWidth={1.75} />,
                            iconOnly: true,
                            onClick: () => (onInspectTeacher ? onInspectTeacher(t) : onEditTeacher(t)),
                            title: 'Lihat rincian data & jadwal guru',
                          }}
                          items={[
                            ...(onOpenTeacherAssignments
                              ? [
                                  {
                                    id: 'assignments',
                                    label: 'Penugasan & Dokumen',
                                    icon: <Award size={13} />,
                                    onClick: () => onOpenTeacherAssignments(t),
                                  },
                                ]
                              : []),
                            {
                              id: 'edit-teacher',
                              label: 'Edit Data Lengkap',
                              icon: <Edit2 size={13} />,
                              onClick: () => onEditTeacher(t),
                            },
                            ...(onNavigate
                              ? [
                                  {
                                    id: 'workload',
                                    label: 'Analisis Beban JP',
                                    icon: <LayoutGrid size={13} />,
                                    onClick: () => onNavigate('workload'),
                                  },
                                ]
                              : []),
                            {
                              id: 'delete-teacher',
                              label: 'Hapus Guru',
                              icon: <Trash2 size={13} />,
                              tone: 'danger',
                              onClick: () => onDelete('teachers', t.id),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
                        <TableRowActions
                          ariaLabel={`Opsi ${s.name}`}
                          primary={{
                            label: 'Edit',
                            icon: <Edit2 size={13} strokeWidth={1.75} />,
                            iconOnly: true,
                            onClick: () => onEditSubject(s),
                            title: 'Edit mata pelajaran',
                          }}
                          items={[
                            {
                              id: 'delete-subject',
                              label: 'Hapus Mapel',
                              icon: <Trash2 size={13} />,
                              tone: 'danger',
                              onClick: () => onDelete('subjects', s.id),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

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
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#C7DCD2', marginRight: '2px' }}>
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
