import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Edit2,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  LayoutGrid,
  LockKeyhole,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Undo2,
  WandSparkles,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { AppState, Day, ScheduleEntry } from '../domain/types';
import { getTimelineRows, isSlotBlocked } from '../domain/time';
import type { validateSchedule } from '../domain/validator';
import { getOfficialScheduleBasisStatus } from '../domain/persuratan/assignments/teacherIntegration';
import { compactSubjectName, compactTeacherName, getPrintableCellColor } from '../utils/pdfExport';
import { groupClassesForMasterMatrix } from '../utils/matrixGrouping';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { MotionPopover } from '../components/KpiMotion';
import {
  Button,
  EmptyState,
  getClass,
  getEntry,
  getSubject,
  getTeacher,
  type ScreenId,
} from '../components/ScreenPrimitives';

export function ScheduleScreen({
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

  const [viewOptionsOpen, setViewOptionsOpen] = useState<boolean>(false);
  const [filterPopoverOpen, setFilterPopoverOpen] = useState<boolean>(false);
  const viewOptionsRef = useRef<HTMLDivElement>(null);
  const filterPopoverRef = useRef<HTMLDivElement>(null);

  const activeMatrixFilterCount =
    (filterLevel !== 'all' ? 1 : 0) +
    (filterRombelRow !== 'all' ? 1 : 0) +
    (filterTeacherId ? 1 : 0) +
    (filterSubjectId ? 1 : 0);

  useEffect(() => {
    if (!viewOptionsOpen && !filterPopoverOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (viewOptionsRef.current && !viewOptionsRef.current.contains(e.target as Node)) {
        setViewOptionsOpen(false);
      }
      if (filterPopoverRef.current && !filterPopoverRef.current.contains(e.target as Node)) {
        setFilterPopoverOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [viewOptionsOpen, filterPopoverOpen]);

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

  const skBasis = getOfficialScheduleBasisStatus(state);

  return (
    <>
      <EditorialPageHeader
        kicker="MANAJEMEN JADWAL"
        title="Jadwal Pelajaran"
        subtitle="Atur jadwal mingguan tiap kelas dan guru."
        ruleInfo={{
          title: 'Panduan Matriks Jadwal',
          items: [
            'Klik sel untuk menambah/mengedit slot atau seret kartu untuk menukar jadwal.',
            'Slot non-KBM (upacara, istirahat, religi) terkunci otomatis agar tidak tertabrak.',
            'Semua perpindahan langsung divalidasi dan bisa diurungkan melalui menu Ekspor & Aksi.',
          ],
        }}
        overflowLabel="Ekspor & Aksi"
        overflowIcon={<Download size={15} />}
        overflowActions={[
          {
            id: 'export-pdf',
            label: 'Cetak & Ekspor PDF',
            description: 'Jadwal Induk, Semua Kelas A4, Per Kelas & Guru',
            icon: <FileText size={15} />,
            onClick: onOpenPdfModal,
          },
          {
            id: 'export-csv',
            label: 'Unduh Data CSV',
            description: 'Format spreadsheet siap olah',
            icon: <FileSpreadsheet size={15} />,
            onClick: onExportCSV,
          },
          ...(lastMove
            ? [
                {
                  id: 'undo-move',
                  label: 'Urungkan Perpindahan Terakhir',
                  description: lastMove.description,
                  icon: <Undo2 size={15} />,
                  onClick: onUndoMove,
                },
              ]
            : []),
          ...(onLaunchTeachingSk
            ? [
                {
                  id: 'teaching-sk',
                  label: 'Buat SK Mengajar',
                  description: skBasis.allowed
                    ? `Sumber resmi v${skBasis.selectedVersion?.version.version ?? ''}`
                    : 'Terbitkan jadwal resmi terlebih dahulu',
                  icon: <FileCheck2 size={15} />,
                  disabled: !skBasis.allowed,
                  onClick: () => onLaunchTeachingSk(skBasis.selectedVersion?.version.id ?? null),
                },
              ]
            : []),
        ]}
        primaryAction={{
          label: isGenerating ? 'Menyusun…' : 'Susun Jadwal Otomatis',
          icon: <WandSparkles size={15} />,
          onClick: onGenerate,
          disabled: isGenerating,
        }}
      />

      <div className="toolbar-card s5-schedule-unified-toolbar">
        <div className="s5-schedule-toolbar-left">
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

          {viewMode === 'single' ? (
            <div className="class-selector-wrap">
              <div className="select-with-icon">
                <GraduationCap size={16} />
                <select
                  id="schedule-class"
                  aria-label="Pilih Kelas"
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
          ) : (
            <div className="s5-schedule-filter-wrap" ref={filterPopoverRef}>
              <button
                type="button"
                className={`button button-secondary ${filterPopoverOpen || activeMatrixFilterCount > 0 ? 'is-active' : ''}`}
                onClick={() => setFilterPopoverOpen((v) => !v)}
                aria-expanded={filterPopoverOpen}
                title="Saring tingkat, kelompok paralel, guru, atau mapel"
              >
                <Filter size={14} />
                <span>Filter</span>
                {activeMatrixFilterCount > 0 && (
                  <span className="s5-filter-count-badge">{activeMatrixFilterCount}</span>
                )}
                <ChevronDown
                  size={13}
                  style={{
                    transform: filterPopoverOpen ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                />
              </button>

              {activeMatrixFilterCount > 0 && (
                <button
                  type="button"
                  className="button button-sm matrix-reset-filter-btn"
                  onClick={() => {
                    setFilterLevel('all');
                    setFilterRombelRow('all');
                    setFilterTeacherId('');
                    setFilterSubjectId('');
                  }}
                  title="Hapus seluruh filter aktif"
                >
                  <RotateCcw size={13} />
                  <span>Reset</span>
                </button>
              )}

              <MotionPopover isOpen={filterPopoverOpen} className="s5-schedule-filter-popover">
                <div className="s5-schedule-filter-popover-head">
                  <span className="s5-schedule-filter-popover-title">Filter &amp; Sorotan Matriks</span>
                  {activeMatrixFilterCount > 0 && (
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setFilterLevel('all');
                        setFilterRombelRow('all');
                        setFilterTeacherId('');
                        setFilterSubjectId('');
                      }}
                    >
                      Reset ({activeMatrixFilterCount})
                    </button>
                  )}
                </div>
                <div className="s5-schedule-filter-grid">
                  <div className="s5-schedule-filter-field">
                    <label htmlFor="matrix-filter-level">Tingkat Kelas</label>
                    <select
                      id="matrix-filter-level"
                      className="master-filter-select"
                      value={filterLevel}
                      onChange={(e) => setFilterLevel(e.target.value)}
                    >
                      <option value="all">Semua Tingkat ({uniqueLevels.join(', ') || 'Semua'})</option>
                      {uniqueLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          Tingkat {lvl}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="s5-schedule-filter-field">
                    <label htmlFor="matrix-filter-row">Kelompok Paralel</label>
                    <select
                      id="matrix-filter-row"
                      className="master-filter-select"
                      value={filterRombelRow}
                      onChange={(e) => setFilterRombelRow(e.target.value)}
                    >
                      <option value="all">Semua Kelompok ({rombelRows.length})</option>
                      {rombelRows.map((r) => (
                        <option key={r.sectionKey} value={r.sectionKey}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="s5-schedule-filter-field">
                    <label htmlFor="matrix-filter-teacher">Sorot Guru</label>
                    <select
                      id="matrix-filter-teacher"
                      className="master-filter-select"
                      value={filterTeacherId}
                      onChange={(e) => setFilterTeacherId(e.target.value)}
                    >
                      <option value="">Semua Guru</option>
                      {activeTeachers.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.code})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="s5-schedule-filter-field">
                    <label htmlFor="matrix-filter-subject">Sorot Mapel</label>
                    <select
                      id="matrix-filter-subject"
                      className="master-filter-select"
                      value={filterSubjectId}
                      onChange={(e) => setFilterSubjectId(e.target.value)}
                    >
                      <option value="">Semua Mapel</option>
                      {state.subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </MotionPopover>
            </div>
          )}

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
                  : `${report.hardErrorCount} Bentrok`
                : published
                ? `Terbit · v${state.history[0]?.version ?? '1'}`
                : 'Belum Dibuat'}
            </span>
          </button>

          {viewMode === 'all' && (
            <span className="s5-schedule-meta-pill" aria-label="Ringkasan rombel dan alokasi JP">
              <span>{activeClasses.length} Rombel</span>
              <span style={{ opacity: 0.35 }}>·</span>
              <span>
                {totalAllocatedJp}/{targetRequiredJp > 0 ? targetRequiredJp : totalAllocatedJp} JP ({totalAstroHours}j)
              </span>
            </span>
          )}
        </div>

        <div className="schedule-toolbar-actions">
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
        {viewMode === 'all' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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

                  <div className="master-matrix-horizontal-track">
                    {row.classes.map((cls) => {
                      const classEntries = scheduleEntries.filter((e) => e.classId === cls.id);
                      const classReqJp = state.requirements
                        .filter((r) => r.classId === cls.id)
                        .reduce((sum, r) => sum + r.requiredJP, 0);

                      return (
                        <div key={cls.id} className="master-class-weekly-block">
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
                                  ...(entry && subject ? ({ '--subject-color': subject.color } as CSSProperties) : {}),
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

              <div className="schedule-legend-row">
                <span><i className="legend-dot dot-teal" /> Mapel Terisi</span>
                <span><i className="legend-dot dot-ivory" /> Slot Kosong</span>
                <span><LockKeyhole size={12} style={{ verticalAlign: -2, color: '#16483f' }} /> Non-KBM Terkunci</span>
                <span className="legend-spacer" />
                <button className="text-link" onClick={onOpenValidationModal}>
                  Laporan Validasi <ArrowRight size={13} />
                </button>
              </div>

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
                        style={{ '--subject-color': item.subjectColor } as CSSProperties}
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
