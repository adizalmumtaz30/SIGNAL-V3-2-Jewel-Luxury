import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Clock,
  Copy,
  Edit2,
  Filter,
  Minus,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  TrendingUp,
  WandSparkles,
  X,
} from 'lucide-react';
import type { AppState, Requirement, ValidationIssue } from '../domain/types';
import { teachingPeriodsForDay } from '../domain/time';
import { validateMasterData } from '../domain/validator';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { KpiAnimatedNumber, KpiMotionCard } from '../components/KpiMotion';
import { TableRowActions } from '../components/TableRowActions';
import { UnifiedPagination } from '../components/UnifiedPagination';
import {
  Button,
  getClass,
  getSubject,
  getTeacher,
  type ScreenId,
} from '../components/ScreenPrimitives';

function setPageResetIfNeeded(setter: (page: number) => void) {
  setter(1);
}

export function RequirementsScreen({
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

  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourceClassId, setCopySourceClassId] = useState<string>(() => state.classes[0]?.id ?? '');
  const [copyTargetClassId, setCopyTargetClassId] = useState<string>(() => state.classes[1]?.id ?? state.classes[0]?.id ?? '');

  useEffect(() => {
    setReqPage(1);
  }, [selectedClassFilter, selectedTeacherFilter, selectedSubjectFilter, sortBy, onlyIssuesFilter, searchQuery]);

  const totalWeeklySlots = useMemo(() => {
    return state.settings.activeDays.reduce(
      (sum, day) => sum + teachingPeriodsForDay(state.slots, day).length,
      0
    );
  }, [state.settings.activeDays, state.slots]);

  const totalJP = state.requirements.reduce((sum, item) => sum + item.requiredJP, 0);

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

  const classSubjectTotals = useMemo(() => {
    const map = new Map<string, { totalJP: number; count: number }>();
    for (const r of state.requirements) {
      const key = `${r.classId}|${r.subjectId}`;
      const existing = map.get(key) ?? { totalJP: 0, count: 0 };
      map.set(key, { totalJP: existing.totalJP + r.requiredJP, count: existing.count + 1 });
    }
    return map;
  }, [state.requirements]);

  const liveIssues = useMemo(() => {
    return masterIssues ?? validateMasterData(state);
  }, [masterIssues, state]);

  const criticalIssues = useMemo(() => liveIssues.filter((i) => i.severity === 'error'), [liveIssues]);
  const warningIssues = useMemo(() => liveIssues.filter((i) => i.severity === 'warning'), [liveIssues]);

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

  const classCapacityMap = useMemo(() => {
    const map = new Map<string, (typeof classCapacityStats)[number]>();
    for (const c of classCapacityStats) {
      map.set(c.cls.id, c);
    }
    return map;
  }, [classCapacityStats]);

  const issueRowCount = useMemo(() => {
    return state.requirements.filter((r) => {
      const tStat = teacherWorkloadStats.get(r.teacherId);
      const cStat = classCapacityMap.get(r.classId);
      const tch = getTeacher(state, r.teacherId);
      const isQualified = Boolean(tch?.subjectIds.includes(r.subjectId));
      return Boolean(tStat?.isOver || cStat?.isOver || cStat?.isUnder || !isQualified);
    }).length;
  }, [state, teacherWorkloadStats, classCapacityMap]);

  const activeClassesCount = state.classes.filter((c) => c.isActive).length;
  const totalCapacityJP = totalWeeklySlots * activeClassesCount;
  const balanceExact = totalJP === totalCapacityJP;
  const balanceSurplus = totalJP > totalCapacityJP;
  const incompleteClassCount = classCapacityStats.filter((c) => !c.isExact).length;
  const hasActiveReqFilters =
    selectedClassFilter !== 'ALL' ||
    selectedTeacherFilter !== 'ALL' ||
    selectedSubjectFilter !== 'ALL' ||
    onlyIssuesFilter ||
    searchQuery.trim().length > 0;

  return (
    <>
      <EditorialPageHeader
        kicker="PERENCANAAN KURIKULUM"
        title="Kebutuhan & Alokasi JP"
        subtitle="Atur target jam pelajaran mingguan tiap kelas."
        meta={
          <>
            <span>{totalJP} JP terdaftar</span>
            <span className="s5-editorial-meta-sep" aria-hidden="true">·</span>
            <span>Kapasitas {totalCapacityJP} JP</span>
          </>
        }
        ruleInfo={{
          title: 'Aturan Kebutuhan JP',
          items: [
            `Setiap rombel aktif memiliki kapasitas ${totalWeeklySlots} slot KBM per minggu.`,
            'Total JP teralokasi idealnya sama dengan kapasitas slot KBM kelas.',
            'Gunakan Salin Alokasi Rombel untuk menyalin struktur mapel antar kelas paralel.',
          ],
        }}
        overflowLabel="Lainnya"
        overflowActions={[
          {
            id: 'copy-req',
            label: 'Salin Alokasi Rombel',
            description: 'Duplikasi struktur JP antar kelas paralel',
            icon: <Copy size={15} />,
            onClick: () => setCopyModalOpen(true),
          },
          {
            id: 'auto-generate',
            label: 'Susun Jadwal Otomatis',
            description: 'Jalankan penyusunan dari alokasi saat ini',
            icon: <WandSparkles size={15} />,
            onClick: () => (criticalIssues.length > 0 && onNavigate ? onNavigate('generator') : onGenerate()),
          },
        ]}
        primaryAction={{
          label: 'Tambah Alokasi',
          icon: <Plus size={15} />,
          onClick: () => onOpenAddModal?.(),
        }}
      />

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
            fontSize: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#78350F' }}>
            <AlertTriangle size={15} color="#B45309" />
            <span>
              <strong>{criticalIssues.length} isu kritis</strong> · <strong>{warningIssues.length} peringatan alokasi</strong>
            </span>
          </div>
          {onNavigate && (
            <button
              type="button"
              className="button button-sm button-secondary"
              onClick={() => onNavigate('validation')}
            >
              Lihat Audit Validasi →
            </button>
          )}
        </div>
      )}

      <div className="toolbar-card" style={{ gap: '10px', flexWrap: 'wrap' }}>
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
          aria-pressed={onlyIssuesFilter}
          onClick={() => setOnlyIssuesFilter((v) => !v)}
          title="Tampilkan hanya alokasi yang memiliki isu kapasitas atau beban guru"
        >
          <Filter size={13} />
          <span>Bermasalah ({issueRowCount})</span>
        </button>

        {hasActiveReqFilters && (
          <button
            type="button"
            className="button matrix-reset-filter-btn is-icon-only"
            aria-label="Reset seluruh filter alokasi JP"
            data-s5-tooltip="Reset filter"
            onClick={() => {
              setSelectedClassFilter('ALL');
              setSelectedTeacherFilter('ALL');
              setSelectedSubjectFilter('ALL');
              setOnlyIssuesFilter(false);
              setSearchQuery('');
            }}
          >
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className="sr-only">Reset Filter</span>
          </button>
        )}

        <span className="s5-tnum" style={{ fontSize: '12px', color: '#526861', fontWeight: 600, marginLeft: 'auto' }}>
          Menampilkan {filteredRequirements.length} dari {state.requirements.length} alokasi
        </span>
      </div>

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
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                      <span>Tidak ada data alokasi yang sesuai dengan filter yang dipilih.</span>
                      {hasActiveReqFilters && (
                        <button
                          type="button"
                          className="button button-sm button-secondary"
                          onClick={() => {
                            setSelectedClassFilter('ALL');
                            setSelectedTeacherFilter('ALL');
                            setSelectedSubjectFilter('ALL');
                            setOnlyIssuesFilter(false);
                            setSearchQuery('');
                          }}
                        >
                          <RotateCcw size={13} /> Reset Semua Filter
                        </button>
                      )}
                    </div>
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
                  const cStat = classCapacityMap.get(r.classId);
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                              <span style={{ fontSize: '11px', color: '#526861' }}>Kode: {sub?.code}</span>
                              {splitMeta && splitMeta.count > 1 && (
                                <span
                                  className="s5-inline-badge tone-warn"
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <strong style={{ fontSize: '13px' }}>{tch?.name}</strong>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span
                              className={`s5-inline-badge ${
                                isTchOver ? 'tone-danger' : tStat?.isFull ? 'tone-ok' : 'tone-info'
                              }`}
                            >
                              Beban: {tStat?.totalJP ?? 0} / {tStat?.maxJP ?? defaultMaxWeeklyJP} JP
                              {isTchOver && ` (Lebih ${(tStat?.totalJP ?? 0) - (tStat?.maxJP ?? defaultMaxWeeklyJP)} JP)`}
                            </span>
                            {!isQualified && (
                              <span className="s5-inline-badge tone-danger">
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
                            <input
                              type="number"
                              min={1}
                              max={50}
                              className="s5-req-stepper-input"
                              aria-label={`Jumlah JP ${sub?.name} kelas ${cls?.name}`}
                              value={r.requiredJP}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                if (Number.isFinite(val) && val >= 1 && val <= 50) {
                                  onUpdateRequirementJP(r.id, Math.round(val));
                                }
                              }}
                            />
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
                        <TableRowActions
                          ariaLabel={`Opsi ${sub?.name ?? 'Alokasi'} Kelas ${cls?.name ?? ''}`}
                          primary={
                            onEdit
                              ? {
                                  label: 'Edit',
                                  icon: <Edit2 size={13} strokeWidth={1.75} />,
                                  iconOnly: true,
                                  onClick: () => onEdit(r),
                                  title: 'Edit alokasi kebutuhan',
                                }
                              : undefined
                          }
                          items={[
                            {
                              id: 'delete-req',
                              label: 'Hapus Alokasi',
                              icon: <Trash2 size={13} />,
                              tone: 'danger',
                              onClick: () => onDelete(r),
                            },
                          ]}
                        />
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
