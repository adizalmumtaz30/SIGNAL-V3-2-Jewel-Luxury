import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpDown,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clock,
  ClipboardList,
  Download,
  FileCheck2,
  FileWarning,
  GraduationCap,
  Search,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import type { AppState } from '../domain/types';
import {
  aggregateTeacherWorkloadFromEntries,
  aggregateTeacherWorkloadFromRequirements,
  formatVersionDateTime,
  resolveWorkloadSource,
  summarizeAdministrativeAssignments,
  type WorkloadSourceMode,
} from '../domain/scheduleSources';
import { exportScheduleTeacherPDF } from '../utils/pdfExport';
import { MadrasahTeacherAvatar } from './MadrasahTeacherAvatar';
import { KpiAnimatedNumber, KpiMotionCard } from './KpiMotion';
import { UnifiedPagination } from './UnifiedPagination';

export interface WorkloadDashboardProps {
  state: AppState;
  initialSourceMode?: WorkloadSourceMode;
  onNavigateToSchedule?: () => void;
  onNavigateToMaster?: () => void;
  onNavigateToRequirements?: () => void;
  onLaunchTeachingSk?: (scheduleVersionId: string) => void;
}

export function WorkloadDashboard({
  state,
  initialSourceMode = 'PUBLISHED',
  onNavigateToSchedule,
  onNavigateToMaster,
  onNavigateToRequirements,
  onLaunchTeachingSk,
}: WorkloadDashboardProps) {
  const [sourceMode, setSourceMode] = useState<WorkloadSourceMode>(initialSourceMode);
  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<'name' | 'jp' | 'max' | 'percentage'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const activeTeachers = useMemo(() => state.teachers.filter((t) => t.isActive), [state.teachers]);
  const activeClasses = useMemo(() => state.classes.filter((c) => c.isActive), [state.classes]);
  const activeSubjects = useMemo(() => state.subjects.filter((s) => s.isActive), [state.subjects]);
  const activeDays = state.settings.activeDays;
  const periodMinutes = state.settings.periodMinutes ?? 40;
  const defaultMaxWeeklyJP =
    state.settings.maxWeeklyJP && state.settings.maxWeeklyJP > 0 ? state.settings.maxWeeklyJP : 24;

  const sourceResolution = useMemo(
    () => resolveWorkloadSource(state, sourceMode, selectedVersionId || null),
    [state, sourceMode, selectedVersionId]
  );

  const assignmentSummary = useMemo(
    () => summarizeAdministrativeAssignments(state.teacherAssignments),
    [state.teacherAssignments]
  );

  const entries = sourceResolution.entries;

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (selectedTeacherId !== 'all' && e.teacherId !== selectedTeacherId) return false;
      if (selectedClassId !== 'all' && e.classId !== selectedClassId) return false;
      if (selectedSubjectId !== 'all' && e.subjectId !== selectedSubjectId) return false;
      return true;
    });
  }, [entries, selectedTeacherId, selectedClassId, selectedSubjectId]);

  const teacherStats = useMemo(
    () =>
      aggregateTeacherWorkloadFromEntries(
        activeTeachers,
        filteredEntries,
        activeDays,
        periodMinutes,
        defaultMaxWeeklyJP
      ),
    [activeTeachers, filteredEntries, activeDays, periodMinutes, defaultMaxWeeklyJP]
  );

  const requirementStats = useMemo(
    () =>
      aggregateTeacherWorkloadFromRequirements(activeTeachers, state, {
        classId: selectedClassId,
        subjectId: selectedSubjectId,
      }),
    [activeTeachers, state, selectedClassId, selectedSubjectId]
  );

  const totalScheduledJP = useMemo(() => {
    if (sourceMode === 'REQUIREMENTS') {
      return requirementStats.reduce((sum, item) => sum + item.plannedJP, 0);
    }
    return entries.length;
  }, [sourceMode, requirementStats, entries]);

  const totalAstroHours = useMemo(
    () => Math.round(((totalScheduledJP * periodMinutes) / 60) * 10) / 10,
    [totalScheduledJP, periodMinutes]
  );

  const avgJPPerTeacher = useMemo(
    () => (activeTeachers.length > 0 ? Math.round((totalScheduledJP / activeTeachers.length) * 10) / 10 : 0),
    [totalScheduledJP, activeTeachers]
  );

  const overloadedTeachersCount = useMemo(() => {
    if (sourceMode === 'REQUIREMENTS') {
      return requirementStats.filter((t) => t.isOverloaded).length;
    }
    return teacherStats.filter((t) => t.isOverloaded).length;
  }, [sourceMode, requirementStats, teacherStats]);

  const unassignedTeachersCount = useMemo(() => {
    if (sourceMode === 'REQUIREMENTS') {
      return requirementStats.filter((t) => t.isUnplanned).length;
    }
    return teacherStats.filter((t) => t.isUnderloaded).length;
  }, [sourceMode, requirementStats, teacherStats]);

  const standardLoadCount = useMemo(() => {
    if (sourceMode === 'REQUIREMENTS') {
      return requirementStats.filter((t) => t.plannedJP >= defaultMaxWeeklyJP).length;
    }
    return teacherStats.filter((t) => t.totalJP >= defaultMaxWeeklyJP).length;
  }, [sourceMode, requirementStats, teacherStats, defaultMaxWeeklyJP]);

  const displayScheduleTeachers = useMemo(() => {
    const rows = teacherStats.filter((stat) => {
      if (selectedTeacherId !== 'all' && stat.teacher.id !== selectedTeacherId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          stat.teacher.name.toLowerCase().includes(q) ||
          stat.teacher.code.toLowerCase().includes(q)
        );
      }
      return true;
    });
    rows.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'name') diff = a.teacher.name.localeCompare(b.teacher.name);
      else if (sortKey === 'jp') diff = a.totalJP - b.totalJP;
      else if (sortKey === 'max') diff = a.maxWeeklyJP - b.maxWeeklyJP;
      else if (sortKey === 'percentage') diff = a.percentage - b.percentage;
      return sortOrder === 'asc' ? diff : -diff;
    });
    return rows;
  }, [teacherStats, selectedTeacherId, searchQuery, sortKey, sortOrder]);

  const displayRequirementTeachers = useMemo(() => {
    const rows = requirementStats.filter((stat) => {
      if (selectedTeacherId !== 'all' && stat.teacher.id !== selectedTeacherId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          stat.teacher.name.toLowerCase().includes(q) ||
          stat.teacher.code.toLowerCase().includes(q)
        );
      }
      return true;
    });
    rows.sort((a, b) => {
      let diff = 0;
      if (sortKey === 'name') diff = a.teacher.name.localeCompare(b.teacher.name);
      else if (sortKey === 'jp') diff = a.plannedJP - b.plannedJP;
      else if (sortKey === 'max') diff = a.maxWeeklyJP - b.maxWeeklyJP;
      else if (sortKey === 'percentage') diff = a.percentage - b.percentage;
      return sortOrder === 'asc' ? diff : -diff;
    });
    return rows;
  }, [requirementStats, selectedTeacherId, searchQuery, sortKey, sortOrder]);

  const totalDisplayCount =
    sourceMode === 'REQUIREMENTS' ? displayRequirementTeachers.length : displayScheduleTeachers.length;

  const totalPages = Math.max(1, Math.ceil(totalDisplayCount / (pageSize || 1)));
  const currentPage = Math.min(page, totalPages);

  const paginatedScheduleTeachers = useMemo(() => {
    if (pageSize <= 0) return displayScheduleTeachers;
    const start = (currentPage - 1) * pageSize;
    return displayScheduleTeachers.slice(start, start + pageSize);
  }, [displayScheduleTeachers, currentPage, pageSize]);

  const paginatedRequirementTeachers = useMemo(() => {
    if (pageSize <= 0) return displayRequirementTeachers;
    const start = (currentPage - 1) * pageSize;
    return displayRequirementTeachers.slice(start, start + pageSize);
  }, [displayRequirementTeachers, currentPage, pageSize]);

  const handleModeChange = (nextMode: WorkloadSourceMode) => {
    setSourceMode(nextMode);
    setPage(1);
  };

  const handleTeacherPdfExport = (teacherId: string) => {
    if (!sourceResolution.pdfExportAllowed) return;
    if (sourceResolution.mode === 'PUBLISHED' && sourceResolution.selectedVersion) {
      const sv = sourceResolution.selectedVersion;
      exportScheduleTeacherPDF(state, teacherId, {
        entriesOverride: sv.version.entries,
        sourceMode: 'PUBLISHED',
        versionInfo: {
          id: sv.version.id,
          version: sv.version.version,
          createdAt: sv.version.createdAt,
          fingerprint: sv.version.fingerprint,
          academicYear: sv.version.academicYear,
          semester: sv.version.semester,
        },
      });
      return;
    }

    if (sourceResolution.mode === 'DRAFT') {
      exportScheduleTeacherPDF(state, teacherId, {
        entriesOverride: sourceResolution.entries,
        sourceMode: 'DRAFT',
      });
    }
  };

  const bannerStyles: Record<
    typeof sourceResolution.statusTone,
    { bg: string; border: string; text: string }
  > = {
    official: { bg: '#EDF7F2', border: '#1B5E43', text: '#0B2923' },
    draft: { bg: '#FDF4E7', border: '#C58B2A', text: '#6D430C' },
    planning: { bg: '#EEF4FA', border: '#2D608F', text: '#173754' },
    error: { bg: '#FCECE9', border: '#B43C30', text: '#7A2018' },
    empty: { bg: '#FDF7EB', border: '#D4B06A', text: '#644612' },
  };
  const activeToneStyle = bannerStyles[sourceResolution.statusTone];

  return (
    <div className="workload-dashboard-page">
      {/* Top Banner / Hero */}
      <div className="workload-hero">
        <div className="workload-hero-copy">
          <div className="eyebrow">
            <span className="eyebrow-line" />
            ANALISIS BEBAN MENGAJAR
          </div>
          <div>
            <h2 style={{ margin: 0 }}>Statistik &amp; Distribusi Beban Guru</h2>
            <p className="s5-workload-hero-desc">
              Pemisahan jelas antara beban mengajar dari Jadwal Terbit Resmi, Pratinjau Draf, dan Rencana Kebutuhan JP.
            </p>
          </div>
        </div>
        <div className="s5-hero-meta-strip">
          <div className="s5-hero-meta-item">
            <Clock size={14} />
            <span className="s5-tnum">1 JP = {periodMinutes} Menit Astronomis</span>
          </div>
          <span className="s5-hero-meta-sep" aria-hidden="true" />
          <div className="s5-hero-meta-item">
            <CalendarDays size={14} />
            <span className="s5-tnum">{activeDays.length} Hari KBM Aktif</span>
          </div>
        </div>
      </div>

      {/* Explicit Workload Source Switcher + Version Selector */}
      <div
        className="surface-card"
        style={{
          marginTop: '16px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
        role="region"
        aria-label="Pemilihan sumber data beban mengajar"
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div className="s5-workload-source-tabs" role="tablist" aria-label="Mode sumber beban guru">
            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'PUBLISHED'}
              onClick={() => handleModeChange('PUBLISHED')}
              className={`s5-workload-source-tab tone-emerald ${sourceMode === 'PUBLISHED' ? 'is-active' : ''}`}
            >
              <ShieldCheck size={15} aria-hidden="true" />
              <span>Jadwal Terbit (Resmi)</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'DRAFT'}
              onClick={() => handleModeChange('DRAFT')}
              className={`s5-workload-source-tab tone-gold ${sourceMode === 'DRAFT' ? 'is-active' : ''}`}
            >
              <FileWarning size={15} aria-hidden="true" />
              <span>Pratinjau Draf</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={sourceMode === 'REQUIREMENTS'}
              onClick={() => handleModeChange('REQUIREMENTS')}
              className={`s5-workload-source-tab tone-slate ${sourceMode === 'REQUIREMENTS' ? 'is-active' : ''}`}
            >
              <ClipboardList size={15} aria-hidden="true" />
              <span>Kebutuhan JP (Rencana)</span>
            </button>
          </div>

          {sourceMode === 'PUBLISHED' && sourceResolution.availableVersions.length > 0 && (
            <div className="s5-workload-version-wrap">
              <label
                htmlFor="workload-version-select"
                className="s5-workload-version-label"
              >
                Versi Terbit:
              </label>
              <select
                id="workload-version-select"
                className="s5-toolbar-select s5-workload-version-select"
                value={sourceResolution.selectedVersion?.version.id ?? ''}
                onChange={(e) => {
                  setSelectedVersionId(e.target.value);
                  setPage(1);
                }}
              >
                {sourceResolution.availableVersions.map((item) => (
                  <option key={item.version.id} value={item.version.id}>
                    v{item.version.version} — {item.version.label}{' '}
                    {item.isValidForOfficialUse ? '(Terverifikasi)' : '(Tidak Valid)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status Banner */}
        <div
          role={sourceResolution.statusTone === 'error' ? 'alert' : 'status'}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '14px',
            flexWrap: 'wrap',
            padding: '12px 14px',
            borderRadius: '10px',
            background: activeToneStyle.bg,
            border: `1px solid ${activeToneStyle.border}`,
            color: activeToneStyle.text,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 360px' }}>
            {sourceResolution.statusTone === 'official' ? (
              <FileCheck2 size={18} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            ) : sourceResolution.statusTone === 'error' ? (
              <ShieldAlert size={18} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            ) : (
              <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            )}
            <div>
              <strong style={{ display: 'block', fontSize: '13px', marginBottom: '2px' }}>
                {sourceResolution.statusBannerTitle}
              </strong>
              <p style={{ margin: 0, fontSize: '12.25px', lineHeight: 1.48 }}>
                {sourceResolution.statusBannerMessage}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {onLaunchTeachingSk && (
              <button
                type="button"
                className="button button-sm button-primary"
                disabled={
                  sourceMode !== 'PUBLISHED' ||
                  !sourceResolution.canUseAsOfficialSKBasis ||
                  !sourceResolution.selectedVersion
                }
                title={
                  sourceMode === 'PUBLISHED' &&
                  sourceResolution.canUseAsOfficialSKBasis &&
                  sourceResolution.selectedVersion
                    ? `Buat SK Pembagian Tugas Mengajar dari Jadwal Terbit v${sourceResolution.selectedVersion.version.version}`
                    : 'SK Pembagian Tugas Mengajar wajib berasal dari Jadwal Terbit Resmi terverifikasi.'
                }
                onClick={() => {
                  if (
                    sourceMode === 'PUBLISHED' &&
                    sourceResolution.canUseAsOfficialSKBasis &&
                    sourceResolution.selectedVersion
                  ) {
                    onLaunchTeachingSk(sourceResolution.selectedVersion.version.id);
                  }
                }}
              >
                <FileCheck2 size={13} aria-hidden="true" />
                <span>Buat SK Pembagian Tugas</span>
              </button>
            )}
            {sourceMode === 'REQUIREMENTS' && onNavigateToRequirements && (
              <button type="button" className="button button-sm button-secondary" onClick={onNavigateToRequirements}>
                Kelola Kebutuhan JP <ArrowRight size={13} />
              </button>
            )}
            {(sourceResolution.statusTone === 'empty' || sourceResolution.statusTone === 'error' || sourceMode === 'DRAFT') &&
              onNavigateToSchedule && (
                <button type="button" className="button button-sm button-primary" onClick={onNavigateToSchedule}>
                  Buka Jadwal Pelajaran <ArrowRight size={13} />
                </button>
              )}
          </div>
        </div>

        {/* Official ScheduleVersion Audit Metadata Strip */}
        {sourceMode === 'PUBLISHED' && sourceResolution.selectedVersion && (
          <dl
            style={{
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '10px',
              background: '#F7FAF8',
              border: '1px solid #DDE7E1',
            }}
          >
            <div>
              <dt style={{ fontSize: '11px', fontWeight: 600, color: '#5A7069', textTransform: 'uppercase' }}>
                Nomor &amp; Label Versi
              </dt>
              <dd className="s5-tnum" style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 700, color: '#0B2923' }}>
                v{sourceResolution.selectedVersion.metadata.versionNumber} · {sourceResolution.selectedVersion.metadata.label}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: '11px', fontWeight: 600, color: '#5A7069', textTransform: 'uppercase' }}>
                Tanggal Terbit
              </dt>
              <dd className="s5-tnum" style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 600, color: '#0B2923' }}>
                {formatVersionDateTime(sourceResolution.selectedVersion.metadata.createdAt)}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: '11px', fontWeight: 700, color: '#5A7069', textTransform: 'uppercase' }}>
                Tahun Ajaran &amp; Semester
              </dt>
              <dd style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 600, color: '#0B2923' }}>
                {sourceResolution.selectedVersion.metadata.isHistoricalPeriodMissing
                  ? 'Tidak tercatat pada versi lama'
                  : `${sourceResolution.selectedVersion.metadata.academicYearText} · ${sourceResolution.selectedVersion.metadata.semesterText}`}
              </dd>
            </div>
            <div>
              <dt style={{ fontSize: '11px', fontWeight: 700, color: '#5A7069', textTransform: 'uppercase' }}>
                Fingerprint &amp; Entri
              </dt>
              <dd className="s5-tnum" style={{ margin: '2px 0 0', fontSize: '12.5px', fontWeight: 600, color: sourceResolution.selectedVersion.isValidForOfficialUse ? '#1B5E43' : '#8F2D24' }}>
                #{sourceResolution.selectedVersion.metadata.fingerprint} ·{' '}
                {sourceResolution.selectedVersion.metadata.actualEntryLength} entri{' '}
                {sourceResolution.selectedVersion.isValidForOfficialUse ? '(Sah)' : '(Rusak/Tidak Cocok)'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {/* Metric Cards Grid */}
      <div className="stat-grid" style={{ marginTop: '16px' }}>
        <KpiMotionCard className="stat-card tone-teal" index={0}>
          <div className="stat-top">
            <span>
              {sourceMode === 'REQUIREMENTS'
                ? 'Total Rencana JP'
                : sourceMode === 'DRAFT'
                ? 'Total JP (Draft)'
                : 'Total JP Terjadwal (Resmi)'}
            </span>
            <div className="stat-icon">
              <BookOpen size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={totalScheduledJP} />
            </strong>
            <span className="stat-unit">JP</span>
          </div>
          <div className="stat-sub">Setara {totalAstroHours} jam dinding nyata</div>
          <div className="stat-accent" />
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-sand" index={1}>
          <div className="stat-top">
            <span>Rata-Rata per Guru</span>
            <div className="stat-icon">
              <TrendingUp size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={avgJPPerTeacher} />
            </strong>
            <span className="stat-unit">JP / guru</span>
          </div>
          <div className="stat-sub">Dari {activeTeachers.length} guru pengampu aktif</div>
          <div className="stat-accent" />
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-blue" index={2}>
          <div className="stat-top">
            <span>Beban Standar (≥{defaultMaxWeeklyJP} JP)</span>
            <div className="stat-icon">
              <GraduationCap size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={standardLoadCount} />
            </strong>
            <span className="stat-unit">/ {activeTeachers.length} guru</span>
          </div>
          <div className="stat-sub">
            {activeTeachers.length > 0
              ? `${Math.round((standardLoadCount / activeTeachers.length) * 100)}% capai standar ${defaultMaxWeeklyJP} JP/mgg`
              : 'Standar beban kerja guru'}
          </div>
          <div className="stat-accent" />
        </KpiMotionCard>

        <KpiMotionCard className="stat-card tone-rose" index={3}>
          <div className="stat-top">
            <span>Kesesuaian Beban</span>
            <div className="stat-icon">
              {overloadedTeachersCount > 0 ? <AlertTriangle size={17} /> : <UserCheck size={17} />}
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              {overloadedTeachersCount === 0 ? (
                'Optimal'
              ) : (
                <>
                  <KpiAnimatedNumber value={overloadedTeachersCount} /> Overload
                </>
              )}
            </strong>
          </div>
          <div className="stat-sub">
            {unassignedTeachersCount > 0 ? `${unassignedTeachersCount} guru belum memiliki jam` : 'Seluruh guru dalam batas wajar'}
          </div>
          <div className="stat-accent" />
        </KpiMotionCard>
      </div>

      {/* Filter and Search Bar */}
      <div className="toolbar-card" style={{ marginTop: '16px' }}>
        <div className="class-selector-wrap">
          <label htmlFor="filter-teacher">FILTER GURU</label>
          <div className="select-with-icon">
            <Users size={16} />
            <select id="filter-teacher" value={selectedTeacherId} onChange={(e) => { setSelectedTeacherId(e.target.value); setPage(1); }}>
              <option value="all">Semua Guru ({activeTeachers.length})</option>
              {activeTeachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="class-selector-wrap">
          <label htmlFor="filter-class">FILTER KELAS</label>
          <div className="select-with-icon">
            <GraduationCap size={16} />
            <select id="filter-class" value={selectedClassId} onChange={(e) => { setSelectedClassId(e.target.value); setPage(1); }}>
              <option value="all">Semua Kelas ({activeClasses.length})</option>
              {activeClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  Kelas {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-divider" />

        <div className="class-selector-wrap">
          <label htmlFor="filter-subject">FILTER MAPEL</label>
          <div className="select-with-icon">
            <BookOpen size={16} />
            <select id="filter-subject" value={selectedSubjectId} onChange={(e) => { setSelectedSubjectId(e.target.value); setPage(1); }}>
              <option value="all">Semua Mapel ({activeSubjects.length})</option>
              {activeSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="toolbar-spacer" />

        <div className="global-search" style={{ minWidth: '220px' }}>
          <Search size={15} />
          <input
            placeholder="Cari guru..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="surface-card" style={{ marginTop: '16px' }}>
        <div className="card-heading">
          <div>
            <div className="card-eyebrow">
              {sourceMode === 'REQUIREMENTS'
                ? 'PLANNING ALLOCATION (REQUIREMENTS)'
                : sourceMode === 'DRAFT'
                ? 'WORKING DRAFT PREVIEW'
                : 'PUBLISHED SCHEDULE VERSION'}
            </div>
            <h3>
              {sourceMode === 'REQUIREMENTS'
                ? 'Rencana Alokasi Kebutuhan JP per Guru'
                : sourceMode === 'DRAFT'
                ? 'Pratinjau Beban Mengajar Draft'
                : 'Rincian Beban Mengajar Resmi per Guru'}
            </h3>
          </div>
          <span className="s5-table-count-label s5-tnum">
            Menampilkan {totalDisplayCount} dari {activeTeachers.length} guru
          </span>
        </div>

        <div className="data-table-wrap">
          {sourceMode === 'REQUIREMENTS' ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th
                    onClick={() => {
                      if (sortKey === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortKey('name'); setSortOrder('asc'); }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Guru &amp; Kode</span>
                      <ArrowUpDown size={12} style={{ opacity: sortKey === 'name' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortKey === 'jp') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortKey('jp'); setSortOrder('desc'); }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Target Rencana JP</span>
                      <ArrowUpDown size={12} style={{ opacity: sortKey === 'jp' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortKey === 'percentage') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortKey('percentage'); setSortOrder('desc'); }
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Rasio vs Kuota</span>
                      <ArrowUpDown size={12} style={{ opacity: sortKey === 'percentage' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th>Cakupan Rencana</th>
                  <th>Status Sumber</th>
                </tr>
              </thead>
              <tbody>
                {paginatedRequirementTeachers.map((stat) => (
                  <tr key={stat.teacher.id}>
                    <td>
                      <div className="record-primary" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <MadrasahTeacherAvatar teacher={stat.teacher} size={38} showStatusDot={false} />
                        <div>
                          <strong>{stat.teacher.name}</strong>
                          <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                            <span className="code-pill">{stat.teacher.code}</span>
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <strong style={{ fontSize: '14.5px', color: stat.isOverloaded ? '#b8685b' : '#173637' }}>
                        {stat.plannedJP}
                      </strong>
                      <span style={{ fontSize: '11.5px', color: '#687a75' }}> / {stat.maxWeeklyJP} JP</span>
                      <small style={{ color: '#687a75', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                        {stat.astroHours} Jam Rencana
                      </small>
                    </td>
                    <td>
                      <div style={{ minWidth: '110px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                          <span style={{ fontWeight: 700, color: stat.isOverloaded ? '#b8685b' : '#2D608F' }}>
                            {stat.percentage}%
                          </span>
                        </div>
                        <div className="progress-track" style={{ height: '7px' }}>
                          <span
                            style={{
                              width: `${Math.min(100, stat.percentage)}%`,
                              background: stat.isOverloaded ? '#b8685b' : '#2D608F',
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="s5-tnum" style={{ fontSize: '12px', color: '#3B504A' }}>
                        {stat.classesPlanned.length} rombel · {stat.subjectsPlanned.length} mapel ({stat.requirementRowsCount} baris rencana)
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '11.5px', color: '#2D608F', fontWeight: 600 }}>
                        Perencanaan (Bukan SK)
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th
                    onClick={() => {
                      if (sortKey === 'name') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortKey('name'); setSortOrder('asc'); }
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Klik untuk mengurutkan nama guru"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Guru &amp; Kode</span>
                      <ArrowUpDown size={12} style={{ opacity: sortKey === 'name' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortKey === 'jp') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortKey('jp'); setSortOrder('desc'); }
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Klik untuk mengurutkan beban JP"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Beban &amp; Batas Mingguan</span>
                      <ArrowUpDown size={12} style={{ opacity: sortKey === 'jp' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th
                    onClick={() => {
                      if (sortKey === 'percentage') setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
                      else { setSortKey('percentage'); setSortOrder('desc'); }
                    }}
                    style={{ cursor: 'pointer' }}
                    title="Klik untuk mengurutkan persentase kuota"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span>Persentase Kuota</span>
                      <ArrowUpDown size={12} style={{ opacity: sortKey === 'percentage' ? 1 : 0.4 }} />
                    </div>
                  </th>
                  <th>Distribusi Hari (Sen-Sab)</th>
                  <th>Total Sesi</th>
                  <th>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {paginatedScheduleTeachers.map((stat) => {
                  const isOver = stat.isOverloaded;
                  return (
                    <tr key={stat.teacher.id}>
                      <td>
                        <div className="record-primary" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <MadrasahTeacherAvatar teacher={stat.teacher} size={38} showStatusDot={false} />
                          <div>
                            <strong>{stat.teacher.name}</strong>
                            <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                              <span className="code-pill">{stat.teacher.code}</span>
                              {stat.classesTaught.length > 0 && (
                                <small style={{ color: '#526861', fontSize: '11px' }}>
                                  · {stat.classesTaught.length} Kelas
                                </small>
                              )}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <strong style={{ fontSize: '14.5px', color: isOver ? '#b8685b' : '#173637' }}>
                              {stat.totalJP}
                            </strong>
                            <span style={{ fontSize: '11.5px', color: '#687a75' }}>/ {stat.maxWeeklyJP} JP</span>
                          </div>
                          <small style={{ color: '#687a75', fontSize: '11px', display: 'block', marginTop: '2px' }}>
                            {stat.astroHours} Jam Efektif {stat.astroMinutes > 0 ? `(${stat.astroMinutes}m)` : ''}
                          </small>
                        </div>
                      </td>

                      <td>
                        <div style={{ minWidth: '110px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                            <span style={{ fontWeight: 700, color: isOver ? '#b8685b' : '#335e58' }}>
                              {stat.percentage}%
                            </span>
                            {isOver && <span style={{ color: '#b8685b', fontSize: '11px', fontWeight: 700 }}>LEBIH</span>}
                          </div>
                          <div className="progress-track" style={{ height: '7px' }}>
                            <span
                              style={{
                                width: `${Math.min(100, stat.percentage)}%`,
                                background: isOver ? '#b8685b' : stat.percentage >= 80 ? '#387468' : '#bc945e',
                              }}
                            />
                          </div>
                        </div>
                      </td>

                      <td>
                        <div className="s5-mini-heatmap" title={activeDays.map((d) => `${d}: ${stat.dayDist[d] || 0} JP`).join(' · ')}>
                          {activeDays.map((day) => {
                            const count = stat.dayDist[day] || 0;
                            const heightPct = Math.min(100, Math.max(16, (count / 8) * 100));
                            const tone = count === 0 ? '' : count > 6 ? 'overload' : count >= 5 ? 'heavy' : 'optimal';
                            return (
                              <div
                                key={day}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end', gap: '2px' }}
                                title={`${day}: ${count} JP`}
                              >
                                <div
                                  className={`s5-heat-bar ${tone}`}
                                  style={{
                                    height: `${heightPct}%`,
                                    opacity: count === 0 ? 0.25 : 1,
                                  }}
                                />
                                <span style={{ fontSize: '11px', fontWeight: 700, color: '#556663', lineHeight: 1 }}>
                                  {day.slice(0, 1)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      <td>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                          <span className="s5-tnum" style={{ fontSize: '11.5px', fontWeight: 700, color: '#0B2923' }}>
                            {stat.totalSessions} sesi
                          </span>
                          <small style={{ fontSize: '11px', color: '#556663' }}>
                            {stat.doubleBlocks} blok 2-JP · {stat.singleBlocks} tunggal
                          </small>
                        </div>
                      </td>

                      <td>
                        <div className="s5-action-dock" style={{ display: 'inline-flex' }}>
                          <button
                            type="button"
                            className="s5-dock-btn primary"
                            disabled={!sourceResolution.pdfExportAllowed}
                            onClick={() => handleTeacherPdfExport(stat.teacher.id)}
                            title={
                              sourceResolution.pdfExportBlockedReason ??
                              (sourceMode === 'DRAFT'
                                ? 'Unduh Pratinjau PDF Draft Guru'
                                : 'Unduh Jadwal Resmi Guru PDF')
                            }
                          >
                            <Download size={13} />
                            <span>{sourceMode === 'DRAFT' ? 'PDF Draft' : 'PDF Resmi'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {totalDisplayCount === 0 && (
            <div className="empty-state">
              <Users size={28} />
              <h3>Guru tidak ditemukan</h3>
              <p>Coba sesuaikan kata kunci pencarian atau filter yang dipilih.</p>
            </div>
          )}
        </div>

        {/* Unified Pagination Controls */}
        <UnifiedPagination
          totalItems={totalDisplayCount}
          page={currentPage}
          pageSize={pageSize}
          pageSizeOptions={[10, 20, 25]}
          allowShowAll
          itemLabel="guru"
          selectAriaLabel="Jumlah guru per halaman"
          navAriaLabel="Navigasi halaman beban mengajar guru"
          onPageChange={(next) => setPage(next)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      </div>

      {/* Verification & Administrative Assignment Separation Notice */}
      <div
        className="inline-info"
        style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: '#f8faf7',
          borderRadius: '12px',
          border: '1px solid #dce4dc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flex: '1 1 360px' }}>
          <CheckCircle2 size={16} style={{ color: '#387468', flexShrink: 0, marginTop: '2px' }} />
          <div style={{ fontSize: '11.5px', color: '#405a54', lineHeight: 1.5 }}>
            <strong>Prinsip Pemisahan Sumber Beban &amp; Penugasan:</strong> Rekap JP resmi untuk dasar SK hanya diambil dari{' '}
            <strong>Jadwal Resmi Terbit</strong> di riwayat versi (bukan Rencana Kebutuhan JP, bukan Draf Sementara, dan bukan catatan penugasan tambahan). Tercatat terpisah{' '}
            <strong>{assignmentSummary.totalActive} catatan penugasan administratif</strong> aktif ({assignmentSummary.nonTeachingActiveCount} tugas non-mengajar).
          </div>
        </div>
        {onNavigateToMaster && (
          <button type="button" className="button button-sm button-secondary" onClick={onNavigateToMaster}>
            Data Guru &amp; Master
          </button>
        )}
      </div>
    </div>
  );
}
