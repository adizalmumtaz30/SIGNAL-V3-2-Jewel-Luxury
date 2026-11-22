import { useMemo, useState } from 'react';
import {
  AlignLeft,
  AlertTriangle,
  Award,
  Download,
  FileEdit,
  FileSpreadsheet,
  GraduationCap,
  Layers,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import type { AppState } from '../domain/types';
import { MotionModalDialog } from './KpiMotion';
import {
  buildRightSignerTitle,
  compactSubjectName,
  compactTeacherName,
  exportAllClassesSinglePageA4PDF,
  exportAllClassesWeeklyPDF,
  exportScheduleClassPDF,
  exportScheduleMasterPDF,
  exportScheduleTeacherPDF,
  getPaperDimensions,
  getPrintableCellColor,
  type PaperSize,
  type WeeklyClassSchedulePdfOptions,
} from '../utils/pdfExport';
import { getTimelineRows, isSlotBlocked, jpToAstronomical } from '../domain/time';
import { DEFAULT_MADRASAH_IDENTITY, type KopRenderMode } from '../domain/kopIdentity';
import { OfficialKopSuratPreview } from './OfficialKopSuratPreview';
import { LivePreviewViewport } from './LivePreviewViewport';
import { groupClassesForMasterMatrix } from '../utils/matrixGrouping';

interface SchedulePdfExportModalProps {
  state: AppState;
  selectedClassId: string;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
  hardErrorCount?: number;
  warningCount?: number;
}

type ExportType = 'all_single_page' | 'class' | 'school' | 'teacher';
type StudioMainTab = 'layout' | 'content';
type ContentSubTab = 'kop' | 'title' | 'signer';

function formatCleanNip(nip?: string): string {
  const cleaned = (nip ?? '').trim();
  if (!cleaned || /^[.\-\u2014\s]+$/.test(cleaned)) return '';
  return cleaned;
}

export function SchedulePdfExportModal({
  state,
  selectedClassId,
  isOpen,
  onClose,
  onNotify,
  hardErrorCount = 0,
  warningCount = 0,
}: SchedulePdfExportModalProps) {
  const [studioTab, setStudioTab] = useState<StudioMainTab>('layout');
  const [contentSubTab, setContentSubTab] = useState<ContentSubTab>('kop');

  // Main export format selection
  const [exportType, setExportType] = useState<ExportType>('all_single_page');
  const [targetClassId, setTargetClassId] = useState<string>(
    () => selectedClassId || state.classes[0]?.id || 'all',
  );
  const [targetTeacherId, setTargetTeacherId] = useState<string>(
    () => state.teachers[0]?.id || '',
  );

  // Layout & Print Options
  const [paperSize, setPaperSize] = useState<PaperSize>('a4');
  const [classLayoutMode, setClassLayoutMode] = useState<'single_page' | 'two_pages'>('single_page');
  const [classOrientation, setClassOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [colorizeSubjects, setColorizeSubjects] = useState<boolean>(true);
  const [compactNames, setCompactNames] = useState<boolean>(true);
  const [includeKop, setIncludeKop] = useState<boolean>(true);
  const [includeRecapPage, setIncludeRecapPage] = useState<boolean>(true);

  // Editable Document Components (initialized from Madrasah Profile settings)
  const [ministry, setMinistry] = useState<string>(
    () => state.settings.ministry ?? DEFAULT_MADRASAH_IDENTITY.ministry,
  );
  const [regionalOffice, setRegionalOffice] = useState<string>(
    () => state.settings.regionalOffice ?? DEFAULT_MADRASAH_IDENTITY.regionalOffice,
  );
  const [legalDecree, setLegalDecree] = useState<string>(
    () => state.settings.legalDecree ?? DEFAULT_MADRASAH_IDENTITY.legalDecree,
  );
  const [accreditation, setAccreditation] = useState<string>(
    () => state.settings.accreditation ?? DEFAULT_MADRASAH_IDENTITY.accreditation,
  );
  const [schoolName, setSchoolName] = useState<string>(
    () => state.settings.schoolName || DEFAULT_MADRASAH_IDENTITY.schoolName,
  );
  const [nsm, setNsm] = useState<string>(() => state.settings.nsm ?? DEFAULT_MADRASAH_IDENTITY.nsm);
  const [npsn, setNpsn] = useState<string>(
    () => state.settings.npsn ?? DEFAULT_MADRASAH_IDENTITY.npsn,
  );
  const [address, setAddress] = useState<string>(
    () => state.settings.address ?? DEFAULT_MADRASAH_IDENTITY.address,
  );
  const [city, setCity] = useState<string>(
    () => state.settings.city ?? DEFAULT_MADRASAH_IDENTITY.city,
  );
  const [postalCode, setPostalCode] = useState<string>(
    () => state.settings.postalCode ?? DEFAULT_MADRASAH_IDENTITY.postalCode,
  );
  const [phone, setPhone] = useState<string>(
    () => state.settings.phone ?? DEFAULT_MADRASAH_IDENTITY.phone,
  );
  const [email, setEmail] = useState<string>(
    () => state.settings.email ?? DEFAULT_MADRASAH_IDENTITY.email,
  );
  const [website, setWebsite] = useState<string>(
    () => state.settings.website ?? DEFAULT_MADRASAH_IDENTITY.website,
  );
  const [kopMode, setKopMode] = useState<KopRenderMode>(
    () => state.settings.kopMode ?? DEFAULT_MADRASAH_IDENTITY.kopMode,
  );

  // Document Title & Periods
  const [documentTitle, setDocumentTitle] = useState<string>('JADWAL PELAJARAN SELURUH KELAS');
  const [academicYear, setAcademicYear] = useState<string>(
    () => state.settings.academicYear || '2026/2027',
  );
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(
    () => state.settings.semester || 'Ganjil',
  );
  const [extraNotes, setExtraNotes] = useState<string>('');

  // Signatory Overrides
  const [signerCity, setSignerCity] = useState<string>(
    () => state.settings.city || DEFAULT_MADRASAH_IDENTITY.city,
  );
  const [signerDate, setSignerDate] = useState<string>(() =>
    new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date()),
  );
  const [principalTitle, setPrincipalTitle] = useState<string>(
    () => state.settings.headmasterTitle || 'Kepala Madrasah',
  );
  const [principalName, setPrincipalName] = useState<string>(
    () => state.settings.headmasterName || 'H. Ahmad Fauzi, S.Ag., M.Pd.I.',
  );
  const [principalNip, setPrincipalNip] = useState<string>(
    () => state.settings.headmasterNip || '19750812 200212 1 003',
  );
  const [coordinatorTitle, setCoordinatorTitle] = useState<string>(
    () => state.settings.curriculumLeaderTitle || 'Waka Bidang Kurikulum',
  );
  const [coordinatorName, setCoordinatorName] = useState<string>(
    () => state.settings.curriculumLeaderName || 'Siti Aminah, S.Pd.I., M.Pd.',
  );
  const [coordinatorNip, setCoordinatorNip] = useState<string>(
    () => state.settings.curriculumLeaderNip || '19820315 200901 2 008',
  );

  const [isExporting, setIsExporting] = useState<boolean>(false);

  const activeClasses = useMemo(() => state.classes.filter((c) => c.isActive), [state.classes]);
  const activeTeachers = useMemo(() => state.teachers.filter((t) => t.isActive), [state.teachers]);

  const selectedClassObj = useMemo(
    () => (targetClassId === 'all' ? null : state.classes.find((c) => c.id === targetClassId)),
    [state.classes, targetClassId],
  );

  const selectedTeacherObj = useMemo(
    () => state.teachers.find((t) => t.id === targetTeacherId) ?? activeTeachers[0] ?? null,
    [state.teachers, activeTeachers, targetTeacherId],
  );

  const handleResetToSettings = () => {
    setMinistry(state.settings.ministry ?? DEFAULT_MADRASAH_IDENTITY.ministry);
    setRegionalOffice(
      state.settings.regionalOffice ?? DEFAULT_MADRASAH_IDENTITY.regionalOffice,
    );
    setLegalDecree(state.settings.legalDecree ?? DEFAULT_MADRASAH_IDENTITY.legalDecree);
    setAccreditation(state.settings.accreditation ?? DEFAULT_MADRASAH_IDENTITY.accreditation);
    setSchoolName(state.settings.schoolName || DEFAULT_MADRASAH_IDENTITY.schoolName);
    setNsm(state.settings.nsm ?? DEFAULT_MADRASAH_IDENTITY.nsm);
    setNpsn(state.settings.npsn ?? DEFAULT_MADRASAH_IDENTITY.npsn);
    setAddress(state.settings.address ?? DEFAULT_MADRASAH_IDENTITY.address);
    setCity(state.settings.city ?? DEFAULT_MADRASAH_IDENTITY.city);
    setPostalCode(state.settings.postalCode ?? DEFAULT_MADRASAH_IDENTITY.postalCode);
    setPhone(state.settings.phone ?? DEFAULT_MADRASAH_IDENTITY.phone);
    setEmail(state.settings.email ?? DEFAULT_MADRASAH_IDENTITY.email);
    setWebsite(state.settings.website ?? DEFAULT_MADRASAH_IDENTITY.website);
    setKopMode(state.settings.kopMode ?? DEFAULT_MADRASAH_IDENTITY.kopMode);
    setAcademicYear(state.settings.academicYear || '2026/2027');
    setSemester(state.settings.semester || 'Ganjil');
    setSignerCity(state.settings.city || DEFAULT_MADRASAH_IDENTITY.city);
    setPrincipalTitle(state.settings.headmasterTitle || 'Kepala Madrasah');
    setPrincipalName(state.settings.headmasterName || 'H. Ahmad Fauzi, S.Ag., M.Pd.I.');
    setPrincipalNip(state.settings.headmasterNip || '19750812 200212 1 003');
    setCoordinatorTitle(state.settings.curriculumLeaderTitle || 'Waka Bidang Kurikulum');
    setCoordinatorName(state.settings.curriculumLeaderName || 'Siti Aminah, S.Pd.I., M.Pd.');
    setCoordinatorNip(state.settings.curriculumLeaderNip || '19820315 200901 2 008');
    setDocumentTitle(
      exportType === 'all_single_page'
        ? 'JADWAL PELAJARAN SELURUH KELAS'
        : exportType === 'class'
        ? 'JADWAL PELAJARAN MINGGUAN'
        : exportType === 'school'
        ? 'MATRIKS JADWAL INDUK MADRASAH'
        : 'JADWAL MENGAJAR PENDIDIK',
    );
    onNotify('Seluruh isian teks dikembalikan ke data Pengaturan Madrasah.', 'info');
  };

  const classPreviewStats = useMemo(() => {
    const entries = state.draft ?? state.activeSchedule ?? [];
    const periodMinutes = state.settings.periodMinutes ?? 40;
    const activeClassIds = new Set(activeClasses.map((c) => c.id));

    if (exportType === 'teacher' && selectedTeacherObj) {
      const teacherEntries = entries.filter(
        (e) => e.teacherId === selectedTeacherObj.id && activeClassIds.has(e.classId),
      );
      const uniqueClasses = new Set(teacherEntries.map((e) => e.classId));
      const astro = jpToAstronomical(teacherEntries.length, periodMinutes);
      return {
        totalJp: teacherEntries.length,
        astroFormatted: `${astro.hours} Jam (${astro.minutes}m)`,
        teacherCount: 1,
        classCount: uniqueClasses.size,
        pageEstimate: 1,
      };
    }

    if (exportType === 'all_single_page' || exportType === 'school' || targetClassId === 'all') {
      const relevant = entries.filter((e) => activeClassIds.has(e.classId));
      const uniqueTeachers = new Set(relevant.map((e) => e.teacherId));
      const astro = jpToAstronomical(relevant.length, periodMinutes);
      const pagesPerClass = classLayoutMode === 'single_page' ? 1 : 2;
      const estimate =
        exportType === 'all_single_page'
          ? includeRecapPage
            ? 2
            : 1
          : exportType === 'school'
          ? Math.max(1, (state.settings.activeDays ?? []).length)
          : Math.max(1, activeClasses.length * pagesPerClass);
      return {
        totalJp: relevant.length,
        astroFormatted: `${astro.hours} Jam (${astro.minutes}m)`,
        teacherCount: uniqueTeachers.size,
        classCount: activeClasses.length,
        pageEstimate: estimate,
      };
    }

    const classEntries = entries.filter((e) => e.classId === targetClassId);
    const uniqueTeachers = new Set(classEntries.map((e) => e.teacherId));
    const astro = jpToAstronomical(classEntries.length, periodMinutes);
    return {
      totalJp: classEntries.length,
      astroFormatted: `${astro.hours} Jam (${astro.minutes}m)`,
      teacherCount: uniqueTeachers.size,
      classCount: 1,
      pageEstimate: classLayoutMode === 'single_page' ? 1 : 2,
    };
  }, [state, exportType, targetClassId, selectedTeacherObj, activeClasses, classLayoutMode, includeRecapPage]);

  const liveEntries = useMemo(
    () => state.draft ?? state.activeSchedule ?? [],
    [state.draft, state.activeSchedule],
  );
  const activeDays = state.settings.activeDays;
  const periodMinutes = state.settings.periodMinutes ?? 40;
  const timelineRows = useMemo(
    () => getTimelineRows(state.slots, state.settings.teachingPeriodsPerDay),
    [state.slots, state.settings.teachingPeriodsPerDay],
  );
  const rombelRows = useMemo(
    () => groupClassesForMasterMatrix(activeClasses),
    [activeClasses],
  );

  const teacherRecapRows = useMemo(() => {
    const activeClassIds = new Set(activeClasses.map((c) => c.id));
    return activeTeachers
      .map((t) => {
        const tEntries = liveEntries.filter((e) => e.teacherId === t.id && activeClassIds.has(e.classId));
        const subjNames = [...new Set(tEntries.map((e) => {
          const s = state.subjects.find((sub) => sub.id === e.subjectId);
          return s ? compactSubjectName(s.name, s.code) : '';
        }).filter(Boolean))];
        const classNames = [...new Set(tEntries.map((e) => {
          const c = activeClasses.find((cls) => cls.id === e.classId);
          return c?.name || '';
        }).filter(Boolean))];
        const astro = jpToAstronomical(tEntries.length, periodMinutes);
        return {
          teacher: t,
          jpCount: tEntries.length,
          astroLabel: `${astro.hours}j ${astro.minutes % 60}m`,
          subjectsSummary: subjNames.join(', ') || '—',
          classesSummary: classNames.join(', ') || '—',
        };
      })
      .sort((a, b) => b.jpCount - a.jpCount || a.teacher.name.localeCompare(b.teacher.name));
  }, [activeTeachers, activeClasses, liveEntries, state.subjects, periodMinutes]);

  if (!isOpen) return null;

  const isLandscapeOutput =
    exportType === 'all_single_page' ||
    exportType === 'school' ||
    (exportType === 'class' && classOrientation === 'landscape');

  const [paperWidthMm, paperHeightMm] = getPaperDimensions(
    paperSize,
    isLandscapeOutput ? 'landscape' : 'portrait',
  );
  const paperLabel = paperSize === 'a4' ? 'A4 Standar' : 'F4 / Folio';
  const paperDimensionText = `${paperWidthMm} × ${paperHeightMm} mm · ${
    isLandscapeOutput ? 'Landscape' : 'Portrait'
  }`;

  const handleDownload = () => {
    try {
      setIsExporting(true);

      const commonOverrides = {
        ministry: ministry.trim(),
        regionalOffice: regionalOffice.trim(),
        legalDecree: legalDecree.trim(),
        accreditation: accreditation.trim(),
        schoolName: schoolName.trim(),
        nsm: nsm.trim(),
        npsn: npsn.trim(),
        address: address.trim(),
        city: city.trim(),
        postalCode: postalCode.trim(),
        phone: phone.trim(),
        email: email.trim(),
        website: website.trim(),
        kopMode,
        kopImageUrl: state.settings.kopImageUrl,
        academicYear: academicYear.trim(),
        semester,
        extraNotes: extraNotes.trim(),
        signerCity: signerCity.trim(),
        signerDate: signerDate.trim(),
        principalTitle: principalTitle.trim(),
        principalName: principalName.trim(),
        principalNip: principalNip.trim(),
        coordinatorTitle: coordinatorTitle.trim(),
        coordinatorName: coordinatorName.trim(),
        coordinatorNip: coordinatorNip.trim(),
      };

      if (exportType === 'all_single_page') {
        exportAllClassesSinglePageA4PDF(state, {
          ...commonOverrides,
          documentTitle: documentTitle.trim() || 'JADWAL PELAJARAN SELURUH KELAS',
          paperSize,
          colorizeSubjects,
          compactNames,
          includeKop,
          includeTeacherRecapPage: includeRecapPage,
        });
        onNotify(
          `PDF Jadwal Seluruh Kelas (${paperSize.toUpperCase()} Landscape) berhasil diunduh.`,
          'success',
        );
      } else if (exportType === 'class') {
        const options: WeeklyClassSchedulePdfOptions = {
          ...commonOverrides,
          paperSize,
          layoutMode: classLayoutMode,
          documentTitle: documentTitle.trim() || undefined,
          orientation: classOrientation,
          kopSurat: includeKop,
          includeTeacherRecapPage: classLayoutMode === 'two_pages' && includeRecapPage,
          colorizeSubjects,
          compactNames,
          coordinatorTitle:
            targetClassId === 'all'
              ? coordinatorTitle.trim() || 'Koordinator Kurikulum & Akademik'
              : coordinatorTitle.trim() || `Wali Kelas ${selectedClassObj?.name ?? ''} / Waka Kurikulum`,
        };

        if (targetClassId === 'all') {
          exportAllClassesWeeklyPDF(state, options);
          const pageCountStr =
            classLayoutMode === 'single_page'
              ? `${activeClasses.length} Halaman (1 Hal/Kelas)`
              : `${activeClasses.length * 2} Halaman (2 Hal/Kelas)`;
          onNotify(
            `PDF Bundel Jadwal Seluruh Kelas (${pageCountStr} · ${paperSize.toUpperCase()}) berhasil diunduh.`,
            'success',
          );
        } else {
          exportScheduleClassPDF(state, targetClassId, options);
          const modeStr =
            classLayoutMode === 'single_page' ? '1 Halaman Terpadu' : '2 Halaman Lengkap';
          onNotify(
            `PDF Jadwal Kelas ${selectedClassObj?.name ?? ''} (${modeStr} · ${paperSize.toUpperCase()}) berhasil diunduh.`,
            'success',
          );
        }
      } else if (exportType === 'school') {
        exportScheduleMasterPDF(state, { paperSize });
        onNotify(
          `PDF Matriks Induk Sekolah (${paperSize.toUpperCase()}) berhasil diunduh.`,
          'success',
        );
      } else {
        const tch = state.teachers.find((t) => t.id === targetTeacherId);
        exportScheduleTeacherPDF(state, targetTeacherId, { paperSize });
        onNotify(
          `PDF Jadwal Guru ${tch?.name ?? ''} (${paperSize.toUpperCase()}) berhasil diunduh.`,
          'success',
        );
      }
      onClose();
    } catch (err) {
      console.error('PDF export failed:', err);
      onNotify('Gagal membuat PDF. Periksa kelengkapan data jadwal.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const modeChoices: Array<{
    id: ExportType;
    title: string;
    sub: string;
    icon: typeof Sparkles;
  }> = [
    {
      id: 'all_single_page',
      title: 'Semua Kelas Terpadu',
      sub: includeRecapPage ? 'Matriks + Rekap JP & TTD' : 'Matriks Seluruh Kelas',
      icon: Sparkles,
    },
    {
      id: 'class',
      title: 'Per Rombel Kelas',
      sub: classLayoutMode === 'single_page' ? '1 Hal Terpadu / Rombel' : '2 Hal Lengkap / Rombel',
      icon: GraduationCap,
    },
    {
      id: 'school',
      title: 'Matriks Induk',
      sub: 'Susunan Multi-Hari Paralel',
      icon: FileSpreadsheet,
    },
    {
      id: 'teacher',
      title: 'Jadwal Guru',
      sub: 'Ringkas Per Pendidik',
      icon: Users,
    },
  ];

  return (
    <MotionModalDialog
      panelClassName="modal-panel s5-export-studio-panel"
      ariaLabel="Studio Ekspor PDF Jadwal Pelajaran Resmi"
      onBackdropMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
        {/* Modal Header */}
        <div
          className="modal-head"
          style={{
            padding: '15px 22px',
            borderBottom: '0.75px solid #DCE5DF',
            background: '#FFFFFF',
          }}
        >
          <div className="modal-title-icon" style={{ background: '#E8F4EE', color: '#124037' }}>
            <Download size={19} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '16px', margin: 0, color: '#0B2923', fontWeight: 700 }}>
              Studio Dokumen PDF Jadwal Pelajaran ({paperSize.toUpperCase()})
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#526861' }}>
              Pratinjau tata letak real-time, pemilihan kertas A4/F4, kop Kemenag, dan pengesahan resmi madrasah
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={17} />
          </button>
        </div>

        {/* Studio Split Body */}
        <div className="s5-studio-body">
          <div className="s5-pdf-studio-grid">
            {/* LEFT PANE: Clean Tabbed Configuration */}
            <div className="s5-studio-left-pane">
              {/* Studio Primary Switcher */}
              <div className="s5-studio-tabs" role="tablist" aria-label="Kategori Pengaturan Ekspor">
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioTab === 'layout'}
                  className={`s5-studio-tab-btn ${studioTab === 'layout' ? 'is-active' : ''}`}
                  onClick={() => setStudioTab('layout')}
                >
                  <SlidersHorizontal size={14} />
                  <span>Format &amp; Tata Letak</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioTab === 'content'}
                  className={`s5-studio-tab-btn ${studioTab === 'content' ? 'is-active' : ''}`}
                  onClick={() => setStudioTab('content')}
                >
                  <FileEdit size={14} />
                  <span>Kop, Judul &amp; Pejabat</span>
                </button>
              </div>

              {studioTab === 'layout' ? (
                <>
                  {/* Card 1: Format Dokumen */}
                  <div className="s5-studio-card">
                    <div className="s5-studio-section-head">
                      <span className="s5-studio-kicker">1. Jenis Dokumen Jadwal</span>
                      <span className="s5-tnum" style={{ fontSize: '11px', color: '#1B5E43', fontWeight: 600 }}>
                        {classPreviewStats.classCount} Rombel · {classPreviewStats.totalJp} JP
                      </span>
                    </div>

                    <div className="s5-studio-choice-grid">
                      {modeChoices.map((mode) => {
                        const Icon = mode.icon;
                        const isActive = exportType === mode.id;
                        return (
                          <button
                            key={mode.id}
                            type="button"
                            onClick={() => {
                              setExportType(mode.id);
                              if (mode.id === 'all_single_page') {
                                setDocumentTitle('JADWAL PELAJARAN SELURUH KELAS');
                              } else if (mode.id === 'class') {
                                setDocumentTitle('JADWAL PELAJARAN MINGGUAN');
                              } else if (mode.id === 'school') {
                                setDocumentTitle('MATRIKS JADWAL INDUK MADRASAH');
                              } else {
                                setDocumentTitle('JADWAL MENGAJAR PENDIDIK');
                              }
                            }}
                            className={`s5-studio-choice-card ${isActive ? 'is-active' : ''}`}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', width: '100%' }}>
                              <Icon size={15} color={isActive ? '#124037' : '#5E746D'} />
                              <span
                                style={{
                                  fontSize: '12.5px',
                                  fontWeight: 700,
                                  color: isActive ? '#0B2923' : '#1F3630',
                                }}
                              >
                                {mode.title}
                              </span>
                            </div>
                            <span style={{ fontSize: '11px', color: isActive ? '#1B5E43' : '#5C706A' }}>
                              {mode.sub}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Contextual Scope Controls */}
                    {exportType === 'class' && (
                      <div
                        style={{
                          paddingTop: '10px',
                          borderTop: '0.75px solid #E8EFEA',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div className="s5-studio-choice-grid">
                          <button
                            type="button"
                            onClick={() => setClassLayoutMode('single_page')}
                            className={`s5-studio-choice-card ${
                              classLayoutMode === 'single_page' ? 'is-active' : ''
                            }`}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0B2923' }}>
                              1 Halaman Terpadu
                            </span>
                            <span style={{ fontSize: '11px', color: '#526861' }}>
                              Matriks + Rekap &amp; TTD dalam 1 lembar
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setClassLayoutMode('two_pages')}
                            className={`s5-studio-choice-card ${
                              classLayoutMode === 'two_pages' ? 'is-active' : ''
                            }`}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#0B2923' }}>
                              2 Halaman Lengkap
                            </span>
                            <span style={{ fontSize: '11px', color: '#526861' }}>
                              Hal 1 Matriks lega, Hal 2 Rekap &amp; TTD
                            </span>
                          </button>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '10px' }}>
                          <div className="field-group">
                            <label style={{ fontSize: '11px' }}>Kelas Sasaran</label>
                            <select
                              value={targetClassId}
                              onChange={(e) => setTargetClassId(e.target.value)}
                              style={{ height: '36px', fontSize: '12.5px' }}
                            >
                              <option value="all">Bundel Seluruh Kelas ({activeClasses.length})</option>
                              {activeClasses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  Kelas {c.name} (Tingkat {c.level})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="field-group">
                            <label style={{ fontSize: '11px' }}>Orientasi ({paperSize.toUpperCase()})</label>
                            <select
                              value={classOrientation}
                              onChange={(e) =>
                                setClassOrientation(e.target.value as 'landscape' | 'portrait')
                              }
                              style={{ height: '36px', fontSize: '12.5px' }}
                            >
                              <option value="landscape">Landscape (Rekomendasi)</option>
                              <option value="portrait">Portrait (Vertikal)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    )}

                    {exportType === 'teacher' && (
                      <div style={{ paddingTop: '8px', borderTop: '0.75px solid #E8EFEA' }}>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Pilih Tenaga Pendidik</label>
                          <select
                            value={targetTeacherId}
                            onChange={(e) => setTargetTeacherId(e.target.value)}
                            style={{ height: '36px', fontSize: '12.5px' }}
                          >
                            {activeTeachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.code}) · {t.roleTitle || 'Guru Mapel'}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Ukuran Kertas */}
                  <div className="s5-studio-card">
                    <div className="s5-studio-section-head">
                      <span className="s5-studio-kicker">2. Ukuran Kertas Cetak</span>
                      <span className="s5-tnum" style={{ fontSize: '11px', color: '#526861' }}>
                        {paperDimensionText}
                      </span>
                    </div>

                    <div className="s5-studio-choice-grid">
                      {(
                        [
                          {
                            id: 'a4' as const,
                            title: 'Kertas A4',
                            sub: '210 × 297 mm · Standar Umum',
                          },
                          {
                            id: 'f4' as const,
                            title: 'Kertas F4 / Folio',
                            sub: '215 × 330 mm · Standar Kemenag',
                          },
                        ]
                      ).map((opt) => {
                        const active = paperSize === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => setPaperSize(opt.id)}
                            className={`s5-studio-choice-card ${active ? 'is-active' : ''}`}
                          >
                            <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0B2923' }}>
                              {opt.title}
                            </span>
                            <span style={{ fontSize: '11px', color: '#526861' }}>{opt.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Card 3: Elemen Visual & Halaman */}
                  <div className="s5-studio-card">
                    <div className="s5-studio-section-head">
                      <span className="s5-studio-kicker">3. Kelengkapan Cetak</span>
                      <button
                        type="button"
                        onClick={() => setStudioTab('content')}
                        style={{
                          border: 0,
                          background: 'transparent',
                          color: '#124037',
                          fontSize: '11.5px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      >
                        Edit Teks &amp; TTD →
                      </button>
                    </div>

                    <div className="s5-studio-choice-grid">
                      {[
                        {
                          label: 'Warna Kode Hex Mapel',
                          sub: 'Sel pastel rapi untuk cetak',
                          checked: colorizeSubjects,
                          onChange: setColorizeSubjects,
                          icon: Palette,
                          disabled: false,
                        },
                        {
                          label: 'Padatkan Nama Otomatis',
                          sub: 'Presisi agar muat 1 halaman',
                          checked: compactNames,
                          onChange: setCompactNames,
                          icon: AlignLeft,
                          disabled: false,
                        },
                        {
                          label: 'Kop Surat Kemenag',
                          sub: 'Logo, NSM, NPSN & alamat',
                          checked: includeKop,
                          onChange: setIncludeKop,
                          icon: Award,
                          disabled: false,
                        },
                        {
                          label: 'Rekap Guru & TTD',
                          sub:
                            exportType === 'class' && classLayoutMode === 'single_page'
                              ? 'Otomatis tergabung di Halaman 1'
                              : 'Lampiran beban JP + pengesahan',
                          checked:
                            exportType === 'class' && classLayoutMode === 'single_page'
                              ? true
                              : includeRecapPage,
                          onChange: setIncludeRecapPage,
                          icon: Layers,
                          disabled: exportType === 'class' && classLayoutMode === 'single_page',
                        },
                      ].map((item) => {
                        const Icon = item.icon;
                        return (
                          <label
                            key={item.label}
                            className={`s5-studio-switch-row ${item.checked ? 'is-checked' : ''}`}
                            style={{ opacity: item.disabled ? 0.72 : 1 }}
                          >
                            <input
                              type="checkbox"
                              checked={item.checked}
                              disabled={item.disabled}
                              onChange={(e) => item.onChange(e.target.checked)}
                              style={{ accentColor: '#124037', marginTop: '2px' }}
                            />
                            <div style={{ minWidth: 0 }}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '5px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: '#0F201C',
                                }}
                              >
                                <Icon size={13} color="#1B5E43" />
                                <span>{item.label}</span>
                              </div>
                              <div style={{ fontSize: '11px', color: '#526861', marginTop: '1px' }}>
                                {item.sub}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                /* TAB 2: Kop Surat, Judul & Pejabat Pengesah */
                <div className="s5-studio-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      paddingBottom: '10px',
                      borderBottom: '0.75px solid #E8EFEA',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {(
                        [
                          { id: 'kop', label: 'Kop Madrasah' },
                          { id: 'title', label: 'Judul & Periode' },
                          { id: 'signer', label: 'Pejabat & TTD' },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setContentSubTab(tab.id)}
                          className={`s5-studio-preset-btn ${contentSubTab === tab.id ? 'is-active' : ''}`}
                          style={{ height: '30px', padding: '0 12px', fontSize: '12px' }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleResetToSettings}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        height: '30px',
                        padding: '0 10px',
                        borderRadius: '8px',
                        border: '0.75px solid #E8CFCB',
                        background: '#FDF6F5',
                        color: '#9F352B',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <RotateCcw size={12} />
                      <span>Reset Default</span>
                    </button>
                  </div>

                  {contentSubTab === 'kop' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Mode Tampilan Kop Surat</label>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => setKopMode('structured')}
                            className={`s5-studio-preset-btn ${kopMode === 'structured' ? 'is-active' : ''}`}
                            style={{ flex: 1, height: '32px', fontSize: '11.5px' }}
                          >
                            Kop Terstruktur (Editable)
                          </button>
                          <button
                            type="button"
                            onClick={() => setKopMode('image')}
                            className={`s5-studio-preset-btn ${kopMode === 'image' ? 'is-active' : ''}`}
                            style={{ flex: 1, height: '32px', fontSize: '11.5px' }}
                          >
                            Gambar Kop Resmi Penuh
                          </button>
                        </div>
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Nama Resmi Madrasah</label>
                        <input
                          value={schoolName}
                          onChange={(e) => setSchoolName(e.target.value)}
                          style={{ height: '34px', fontSize: '12px', fontWeight: 700 }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Yayasan / Lembaga Menaungi</label>
                        <input
                          value={ministry}
                          onChange={(e) => setMinistry(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Akte Notaris / SK Pendirian</label>
                        <input
                          value={regionalOffice}
                          onChange={(e) => setRegionalOffice(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Keputusan Menkumham / SK Legalitas</label>
                        <input
                          value={legalDecree}
                          onChange={(e) => setLegalDecree(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>NSM</label>
                        <input
                          value={nsm}
                          onChange={(e) => setNsm(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>NPSN</label>
                        <input
                          value={npsn}
                          onChange={(e) => setNpsn(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Status Akreditasi</label>
                        <input
                          value={accreditation}
                          onChange={(e) => setAccreditation(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Alamat Lengkap</label>
                        <input
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Kota / Kabupaten</label>
                        <input
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Telepon</label>
                        <input
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  )}

                  {contentSubTab === 'title' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Judul Utama Dokumen</label>
                        <input
                          value={documentTitle}
                          onChange={(e) => setDocumentTitle(e.target.value)}
                          style={{ height: '36px', fontSize: '12.5px', fontWeight: 700 }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Tahun Ajaran</label>
                        <input
                          value={academicYear}
                          onChange={(e) => setAcademicYear(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Semester</label>
                        <select
                          value={semester}
                          onChange={(e) => setSemester(e.target.value as 'Ganjil' | 'Genap')}
                          style={{ height: '34px', fontSize: '12px' }}
                        >
                          <option value="Ganjil">Semester Ganjil</option>
                          <option value="Genap">Semester Genap</option>
                        </select>
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Catatan Tambahan Dokumen (Opsional)</label>
                        <input
                          value={extraNotes}
                          onChange={(e) => setExtraNotes(e.target.value)}
                          placeholder="Contoh: Berlaku efektif mulai 20 Juli 2026"
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                    </div>
                  )}

                  {contentSubTab === 'signer' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Kota Titimangsa</label>
                          <input
                            value={signerCity}
                            onChange={(e) => setSignerCity(e.target.value)}
                            style={{ height: '34px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Tanggal Pengesahan</label>
                          <input
                            value={signerDate}
                            onChange={(e) => setSignerDate(e.target.value)}
                            style={{ height: '34px', fontSize: '12px' }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          background: '#F7FAF8',
                          borderRadius: '10px',
                          border: '0.75px solid #D8E2DC',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            gridColumn: 'span 2',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#124037',
                          }}
                        >
                          Penandatangan Kiri (Pemeriksa)
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Jabatan</label>
                          <input
                            value={coordinatorTitle}
                            onChange={(e) => setCoordinatorTitle(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Nama &amp; Gelar</label>
                          <input
                            value={coordinatorName}
                            onChange={(e) => setCoordinatorName(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group" style={{ gridColumn: 'span 2' }}>
                          <label style={{ fontSize: '11px' }}>NIP / NPK</label>
                          <input
                            value={coordinatorNip}
                            onChange={(e) => setCoordinatorNip(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '10px 12px',
                          background: '#FBF9F4',
                          borderRadius: '10px',
                          border: '0.75px solid #E5DCC9',
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: '8px',
                        }}
                      >
                        <div
                          style={{
                            gridColumn: 'span 2',
                            fontSize: '11px',
                            fontWeight: 700,
                            color: '#7A5B25',
                          }}
                        >
                          Penandatangan Kanan (Pengesah Utama)
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Jabatan</label>
                          <input
                            value={principalTitle}
                            onChange={(e) => setPrincipalTitle(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Nama &amp; Gelar</label>
                          <input
                            value={principalName}
                            onChange={(e) => setPrincipalName(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group" style={{ gridColumn: 'span 2' }}>
                          <label style={{ fontSize: '11px' }}>NIP / NPK</label>
                          <input
                            value={principalNip}
                            onChange={(e) => setPrincipalNip(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* RIGHT PANE: Real-Live WYSIWYG Document Viewport */}
            <div className="s5-pdf-paper-stage" style={{ padding: 0, overflow: 'hidden', border: 'none', background: 'transparent' }}>
              <LivePreviewViewport
                title="Pratinjau Dokumen Jadwal (Live)"
                metaText={`${paperLabel} · ${paperDimensionText}`}
                paperWidthMm={paperWidthMm}
                paperHeightMm={paperHeightMm}
                compactMaxHeight={485}
                sheetMode="stack"
                ariaLabel="Pratinjau dokumen jadwal siap cetak"
                topSlot={
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(hardErrorCount > 0 || warningCount > 0) && (
                      <div className="lpv-conflict-warning-banner" role="status">
                        <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px', color: '#B45309' }} />
                        <span>
                          <strong>Mode Cetak Draf Aktif:</strong> Jadwal masih memiliki{' '}
                          <span className="s5-tnum" style={{ fontWeight: 700 }}>
                            {hardErrorCount > 0 ? `${hardErrorCount} bentrok keras` : ''}
                            {hardErrorCount > 0 && warningCount > 0 ? ' & ' : ''}
                            {warningCount > 0 ? `${warningCount} catatan` : ''}
                          </span>
                          . Anda tetap dapat meninjau, mencetak, dan mengunduh PDF/CSV kapan saja untuk koreksi lapangan.
                        </span>
                      </div>
                    )}

                    {/* 4 Live Document KPI Strip */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                      <div style={{ padding: '7px 10px', background: '#FFFFFF', borderRadius: '9px', border: '0.75px solid #D5E0DA' }}>
                        <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>ALOKASI</div>
                        <strong className="s5-tnum" style={{ fontSize: '13.5px', color: '#0B2923' }}>
                          {classPreviewStats.totalJp} JP
                        </strong>
                      </div>
                      <div style={{ padding: '7px 10px', background: '#FFFFFF', borderRadius: '9px', border: '0.75px solid #D5E0DA' }}>
                        <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>ASTRONOMIS</div>
                        <strong className="s5-tnum" style={{ fontSize: '12px', color: '#0B2923' }}>
                          {classPreviewStats.astroFormatted}
                        </strong>
                      </div>
                      <div style={{ padding: '7px 10px', background: '#FFFFFF', borderRadius: '9px', border: '0.75px solid #D5E0DA' }}>
                        <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>PENDIDIK</div>
                        <strong className="s5-tnum" style={{ fontSize: '13.5px', color: '#0B2923' }}>
                          {classPreviewStats.teacherCount} Guru
                        </strong>
                      </div>
                      <div style={{ padding: '7px 10px', background: '#FFFFFF', borderRadius: '9px', border: '0.75px solid #D5E0DA' }}>
                        <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>ESTIMASI</div>
                        <strong className="s5-tnum" style={{ fontSize: '13px', color: '#1B5E43' }}>
                          {classPreviewStats.pageEstimate} Hal
                        </strong>
                      </div>
                    </div>
                  </div>
                }
              >
                {(() => {
                  const kopOverrides = {
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
                    kopMode,
                    kopImageUrl: state.settings.kopImageUrl,
                  };

                  const renderSignatures = (leftTitleOverride?: string) => (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '24px',
                        marginTop: '14px',
                        paddingTop: '8px',
                        fontSize: '10.5px',
                        lineHeight: 1.4,
                        color: '#2F443E',
                      }}
                    >
                      <div>
                        <div>Mengetahui,</div>
                        <div style={{ fontWeight: 600, color: '#0F201C' }}>
                          {leftTitleOverride || coordinatorTitle}
                        </div>
                        <div style={{ height: '34px' }} />
                        <div style={{ fontWeight: 700, color: '#0B2923', textDecoration: 'underline' }}>
                          {coordinatorName}
                        </div>
                        <div className="s5-tnum">
                          {formatCleanNip(coordinatorNip) ? `NIP. ${formatCleanNip(coordinatorNip)}` : 'NIP. —'}
                        </div>
                      </div>
                      <div>
                        <div>
                          {signerCity || 'Madrasah'}, {signerDate}
                        </div>
                        <div style={{ fontWeight: 600, color: '#0F201C', wordBreak: 'break-word' }}>
                          {buildRightSignerTitle(principalTitle, schoolName)}
                        </div>
                        <div style={{ height: '34px' }} />
                        <div style={{ fontWeight: 700, color: '#0B2923', textDecoration: 'underline' }}>
                          {principalName}
                        </div>
                        <div className="s5-tnum">
                          {formatCleanNip(principalNip) ? `NIP. ${formatCleanNip(principalNip)}` : 'NIP. —'}
                        </div>
                      </div>
                    </div>
                  );

                  const renderNonKbmCell = (actTypeRaw: string, compactFont = false) => {
                    const actType = actTypeRaw.toUpperCase();
                    let bg = '#FEF8E6';
                    let color = '#825F1E';
                    let label = 'ISTIRAHAT';
                    if (actType.includes('UPACARA')) {
                      bg = '#FDF2F0';
                      color = '#A03C30';
                      label = 'UPACARA';
                    } else if (actType.includes('RELIGI') || actType.includes('SHOLAT')) {
                      bg = '#F7EFFD';
                      color = '#632B8E';
                      label = 'RELIGI';
                    }
                    return (
                      <span
                        style={{
                          display: 'block',
                          width: '100%',
                          height: '100%',
                          background: bg,
                          color,
                          fontWeight: 700,
                          fontSize: compactFont ? '7.5px' : '9px',
                          padding: compactFont ? '2px 1px' : '4px 3px',
                        }}
                      >
                        {compactFont ? label.slice(0, 5) : label}
                      </span>
                    );
                  };

                  // MODE A & C: ALL CLASSES SINGLE PAGE OR SCHOOL MASTER MATRIX
                  if (exportType === 'all_single_page' || exportType === 'school') {
                    const showPage2 = exportType === 'school' || includeRecapPage;
                    const activeSubjects = state.subjects.filter((s) => s.isActive);
                    return (
                      <>
                        <article className="lpv-real-page" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {includeKop && (
                            <OfficialKopSuratPreview settings={state.settings} overrides={kopOverrides} variant="full" />
                          )}
                          <div style={{ textAlign: 'center', margin: '2px 0 4px' }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0B3435', letterSpacing: '0.02em' }}>
                              {(exportType === 'school'
                                ? documentTitle || 'JADWAL PELAJARAN INDUK MADRASAH'
                                : documentTitle || 'JADWAL PELAJARAN SELURUH KELAS'
                              ).toUpperCase()}
                            </div>
                            <div className="s5-tnum" style={{ fontSize: '10px', color: '#465A55', marginTop: '2px' }}>
                              Tahun Ajaran {academicYear} · Semester {semester} · Rombel Aktif: {activeClasses.map((c) => c.name).join(', ') || '—'} · {schoolName}
                              {extraNotes.trim() ? ` · ${extraNotes.trim()}` : ''}
                            </div>
                            <div style={{ width: '56px', height: '2px', background: '#C5A059', margin: '5px auto 0' }} />
                          </div>

                          {/* Real Rombel Matrix Rows */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {rombelRows.length === 0 ? (
                              <div style={{ padding: '24px', textAlign: 'center', color: '#687E77', border: '1px dashed #CBD7D1', borderRadius: '6px' }}>
                                Belum ada kelas aktif untuk ditampilkan.
                              </div>
                            ) : (
                              rombelRows.map((row) => (
                                <div key={row.rowId} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <div style={{ fontSize: '9.5px', fontWeight: 700, color: '#0F3732', letterSpacing: '0.02em' }}>
                                    {row.label.toUpperCase()} · {row.classes.map((c) => c.name).join(' | ')}
                                  </div>
                                  <div
                                    style={{
                                      display: 'grid',
                                      gridTemplateColumns: `repeat(${Math.max(1, row.classes.length)}, minmax(0, 1fr))`,
                                      gap: '8px',
                                    }}
                                  >
                                    {row.classes.map((cls) => {
                                      const clsEntries = liveEntries.filter((e) => e.classId === cls.id);
                                      return (
                                        <div
                                          key={cls.id}
                                          style={{
                                            border: '1px solid #0B3435',
                                            borderRadius: '4px',
                                            overflow: 'hidden',
                                            background: '#FFFFFF',
                                          }}
                                        >
                                          <div
                                            style={{
                                              background: '#0B3435',
                                              color: '#FFFFFF',
                                              padding: '3px 7px',
                                              display: 'flex',
                                              justifyContent: 'space-between',
                                              alignItems: 'center',
                                              fontSize: '9.5px',
                                            }}
                                          >
                                            <strong>Kelas {cls.name}</strong>
                                            <span className="s5-tnum" style={{ fontSize: '8.5px', color: '#DCEEE6' }}>
                                              Tingkat {cls.level} · {clsEntries.length} JP
                                            </span>
                                          </div>
                                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8px', tableLayout: 'fixed' }}>
                                            <thead>
                                              <tr style={{ background: '#E8F3EE', color: '#0B3435' }}>
                                                <th style={{ padding: '2px', borderBottom: '0.5px solid #D2E1DA', width: '20px' }}>JP</th>
                                                <th style={{ padding: '2px', borderLeft: '0.5px solid #D2E1DA', borderBottom: '0.5px solid #D2E1DA', width: '48px' }}>WAKTU</th>
                                                {activeDays.map((day) => (
                                                  <th
                                                    key={day}
                                                    style={{
                                                      padding: '2px',
                                                      borderLeft: '0.5px solid #D2E1DA',
                                                      borderBottom: '0.5px solid #D2E1DA',
                                                      textAlign: 'center',
                                                    }}
                                                  >
                                                    {day.slice(0, 3).toUpperCase()}
                                                  </th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {timelineRows.map((tRow, idx) => (
                                                <tr key={`${cls.id}-${tRow.order}-${idx}`} style={{ borderTop: '0.5px solid #DCE8E2' }}>
                                                  <td className="s5-tnum" style={{ padding: '2px', textAlign: 'center', fontWeight: 700, background: '#F6FAF8', color: '#0B3435' }}>
                                                    {tRow.isKbm ? String(tRow.jpNo).padStart(2, '0') : '—'}
                                                  </td>
                                                  <td className="s5-tnum" style={{ padding: '2px', textAlign: 'center', background: '#FAFCFB', color: '#55645F', borderLeft: '0.5px solid #DCE8E2', fontSize: '7px' }}>
                                                    {tRow.start}-{tRow.end}
                                                  </td>
                                                  {activeDays.map((day) => {
                                                    const slotDef = state.slots.find((s) => s.day === day && s.order === tRow.order);
                                                    const blocked = !tRow.isKbm || isSlotBlocked(slotDef);
                                                    if (blocked) {
                                                      return (
                                                        <td key={day} style={{ padding: 0, textAlign: 'center', borderLeft: '0.5px solid #DCE8E2' }}>
                                                          {renderNonKbmCell(slotDef?.activityType || tRow.activityType || 'ISTIRAHAT', true)}
                                                        </td>
                                                      );
                                                    }
                                                    const entry = clsEntries.find((e) => e.day === day && e.jpNo === tRow.jpNo);
                                                    if (!entry) {
                                                      return (
                                                        <td key={day} style={{ padding: '2px', textAlign: 'center', borderLeft: '0.5px solid #DCE8E2', color: '#B4C3BE' }}>
                                                          —
                                                        </td>
                                                      );
                                                    }
                                                    const sub = state.subjects.find((s) => s.id === entry.subjectId);
                                                    const tch = state.teachers.find((t) => t.id === entry.teacherId);
                                                    const c = colorizeSubjects && sub?.color
                                                      ? getPrintableCellColor(sub.color)
                                                      : { bg: [246, 250, 248], text: [17, 50, 48] };
                                                    const subTxt = compactNames
                                                      ? compactSubjectName(sub?.name || '', sub?.code)
                                                      : (sub?.name || 'Mapel');
                                                    const tchTxt = compactNames
                                                      ? compactTeacherName(tch?.name || '', tch?.code)
                                                      : (tch?.name || '—');
                                                    return (
                                                      <td
                                                        key={day}
                                                        style={{
                                                          padding: '1.5px 2px',
                                                          textAlign: 'center',
                                                          borderLeft: '0.5px solid #DCE8E2',
                                                          background: `rgb(${c.bg.join(',')})`,
                                                          color: `rgb(${c.text.join(',')})`,
                                                          lineHeight: 1.15,
                                                        }}
                                                      >
                                                        <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                          {subTxt}
                                                        </div>
                                                        <div style={{ fontSize: '6.8px', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                          {tchTxt}
                                                        </div>
                                                      </td>
                                                    );
                                                  })}
                                                </tr>
                                              ))}
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

                          {/* Color Swatch Legend */}
                          {colorizeSubjects && activeSubjects.length > 0 && (
                            <div style={{ marginTop: '4px', paddingTop: '6px', borderTop: '0.5px solid #DCE5E0' }}>
                              <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#0B3435', marginBottom: '4px' }}>
                                LEGENDA MAPEL &amp; KEGIATAN:
                              </div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                {activeSubjects.map((sub) => {
                                  const { bg, text } = getPrintableCellColor(sub.color || '#2f7771');
                                  return (
                                    <span
                                      key={sub.id}
                                      style={{
                                        fontSize: '8px',
                                        padding: '1.5px 6px',
                                        borderRadius: '3px',
                                        background: `rgb(${bg.join(',')})`,
                                        color: `rgb(${text.join(',')})`,
                                        border: `0.5px solid rgb(${text.join(',')})`,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {sub.code}: {compactSubjectName(sub.name, sub.code)}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          <div className="s5-tnum" style={{ marginTop: 'auto', fontSize: '8.5px', color: '#556964', display: 'flex', justifyContent: 'space-between' }}>
                            <span>* 1 JP = {periodMinutes} menit waktu efektif KBM · Jadwal disusun per kelompok rombel paralel.</span>
                            <span>Halaman 1 dari {showPage2 ? 2 : 1}</span>
                          </div>
                        </article>

                        {showPage2 && (
                          <article className="lpv-real-page" style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {includeKop && (
                              <OfficialKopSuratPreview settings={state.settings} overrides={kopOverrides} variant="full" />
                            )}
                            <div style={{ textAlign: 'center', margin: '2px 0' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0B3435' }}>
                                REKAPITULASI BEBAN MENGAJAR PENDIDIK &amp; PENGESAHAN
                              </div>
                              <div className="s5-tnum" style={{ fontSize: '10px', color: '#465A55' }}>
                                Tahun Ajaran {academicYear} · Semester {semester} · {schoolName}
                              </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
                              <thead>
                                <tr style={{ background: '#0B3435', color: '#FFFFFF' }}>
                                  <th style={{ padding: '5px 6px', textAlign: 'center', width: '30px' }}>No</th>
                                  <th style={{ padding: '5px 6px', textAlign: 'center', width: '52px' }}>Kode</th>
                                  <th style={{ padding: '5px 8px', textAlign: 'left' }}>Nama Pendidik</th>
                                  <th style={{ padding: '5px 8px', textAlign: 'left' }}>Mata Pelajaran</th>
                                  <th style={{ padding: '5px 8px', textAlign: 'left' }}>Kelas Diampu</th>
                                  <th style={{ padding: '5px 6px', textAlign: 'center', width: '58px' }}>Total JP</th>
                                  <th style={{ padding: '5px 6px', textAlign: 'right', width: '74px' }}>Astronomis</th>
                                </tr>
                              </thead>
                              <tbody>
                                {teacherRecapRows.map((row, idx) => (
                                  <tr
                                    key={row.teacher.id}
                                    style={{
                                      background: idx % 2 === 0 ? '#FFFFFF' : '#F6FAF8',
                                      borderBottom: '0.5px solid #DCE6E1',
                                    }}
                                  >
                                    <td className="s5-tnum" style={{ padding: '4px 6px', textAlign: 'center' }}>{idx + 1}</td>
                                    <td className="s5-tnum" style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: '#0B3435' }}>{row.teacher.code}</td>
                                    <td style={{ padding: '4px 8px', fontWeight: 600, color: '#0F201C' }}>{row.teacher.name}</td>
                                    <td style={{ padding: '4px 8px', color: '#385049' }}>{row.subjectsSummary}</td>
                                    <td style={{ padding: '4px 8px', color: '#385049' }}>{row.classesSummary}</td>
                                    <td className="s5-tnum" style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: '#0B3435' }}>{row.jpCount} JP</td>
                                    <td className="s5-tnum" style={{ padding: '4px 6px', textAlign: 'right', color: '#47615A' }}>{row.astroLabel}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {renderSignatures()}

                            <div className="s5-tnum" style={{ marginTop: 'auto', fontSize: '8.5px', color: '#556964', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Dokumen Rekapitulasi Akademik Resmi · {schoolName}</span>
                              <span>Halaman 2 dari 2</span>
                            </div>
                          </article>
                        )}
                      </>
                    );
                  }

                  // MODE B: PER ROMBEL KELAS (1 HALAMAN TERPADU / 2 HALAMAN LENGKAP)
                  if (exportType === 'class') {
                    const cls = selectedClassObj ?? activeClasses[0];
                    if (!cls) {
                      return (
                        <article className="lpv-real-page" style={{ padding: '28px', textAlign: 'center', color: '#687E77' }}>
                          Belum ada rombel kelas aktif untuk dipratinjau.
                        </article>
                      );
                    }
                    const clsEntries = liveEntries.filter((e) => e.classId === cls.id);
                    const astroCls = jpToAstronomical(clsEntries.length, periodMinutes);
                    const clsTeachers = [...new Set(clsEntries.map((e) => e.teacherId))];
                    const clsSubjects = [...new Set(clsEntries.map((e) => e.subjectId))];
                    const classAllocationRows = clsSubjects.map((subId) => {
                      const sub = state.subjects.find((s) => s.id === subId);
                      const subEntries = clsEntries.filter((e) => e.subjectId === subId);
                      const tIds = [...new Set(subEntries.map((e) => e.teacherId))];
                      const tNames = tIds.map((tid) => state.teachers.find((t) => t.id === tid)?.name || '—').join(', ');
                      return {
                        id: subId,
                        code: sub?.code || 'MPL',
                        subjectName: sub?.name || 'Mapel',
                        teacherName: tNames,
                        jpCount: subEntries.length,
                      };
                    }).sort((a, b) => b.jpCount - a.jpCount);

                    return (
                      <>
                        <article className="lpv-real-page" style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {targetClassId === 'all' && (
                            <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#EEF6F2', border: '0.75px solid #C6DDD2', fontSize: '10px', color: '#124037', fontWeight: 600 }}>
                              Mode Bundel Seluruh Kelas ({activeClasses.length} Rombel) — Pratinjau menampilkan sampel kelas pertama ({cls.name}). File PDF yang diunduh memuat seluruh {activeClasses.length} kelas berurutan.
                            </div>
                          )}
                          {includeKop && (
                            <OfficialKopSuratPreview settings={state.settings} overrides={kopOverrides} variant="full" />
                          )}
                          <div style={{ textAlign: 'center', margin: '2px 0' }}>
                            <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#112D2A' }}>
                              {(documentTitle ? `${documentTitle} — KELAS ${cls.name}` : `JADWAL PELAJARAN MINGGUAN — KELAS ${cls.name}`).toUpperCase()}
                            </div>
                            <div className="s5-tnum" style={{ fontSize: '10px', color: '#505F5A', marginTop: '2px' }}>
                              Tingkat {cls.level} · T.A. {academicYear} ({semester}) · Alokasi: {clsEntries.length} JP ({astroCls.hours} Jam Efektif) · {clsTeachers.length} Guru Pengajar
                              {extraNotes.trim() ? ` · ${extraNotes.trim()}` : ''}
                            </div>
                            <div style={{ width: '50px', height: '2px', background: '#C5A059', margin: '5px auto 0' }} />
                          </div>

                          {classLayoutMode === 'two_pages' && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', margin: '4px 0' }}>
                              {[
                                { label: 'TOTAL ALOKASI JP', val: `${clsEntries.length} JP Mingguan` },
                                { label: 'WAKTU ASTRONOMIS', val: `${astroCls.hours} Jam (${astroCls.minutes} Mnt)` },
                                { label: 'GURU PENGAJAR', val: `${clsTeachers.length} Pendidik` },
                                { label: 'MATA PELAJARAN', val: `${clsSubjects.length} Bidang Studi` },
                              ].map((k) => (
                                <div key={k.label} style={{ padding: '6px 9px', borderRadius: '6px', background: '#F6FAF8', border: '0.75px solid #D3E1DA' }}>
                                  <div style={{ fontSize: '8.5px', fontWeight: 700, color: '#586E67' }}>{k.label}</div>
                                  <div className="s5-tnum" style={{ fontSize: '11.5px', fontWeight: 700, color: '#0B3435', marginTop: '2px' }}>{k.val}</div>
                                </div>
                              ))}
                            </div>
                          )}

                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', tableLayout: 'fixed', border: '1px solid #0B3435' }}>
                            <thead>
                              <tr style={{ background: '#0B3435', color: '#FFFFFF' }}>
                                <th style={{ padding: '5px 4px', width: '36px', textAlign: 'center' }}>JP</th>
                                <th style={{ padding: '5px 4px', width: '82px', textAlign: 'center', borderLeft: '0.5px solid rgba(255,255,255,0.2)' }}>WAKTU</th>
                                {activeDays.map((day) => (
                                  <th key={day} style={{ padding: '5px 4px', textAlign: 'center', borderLeft: '0.5px solid rgba(255,255,255,0.2)' }}>
                                    {day.toUpperCase()}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {timelineRows.map((tRow, idx) => (
                                <tr key={`${tRow.order}-${idx}`} style={{ borderTop: '0.5px solid #D8E4DE' }}>
                                  <td className="s5-tnum" style={{ padding: '4px', textAlign: 'center', fontWeight: 700, background: '#F6FAF8', color: '#0B3435' }}>
                                    {tRow.isKbm ? String(tRow.jpNo).padStart(2, '0') : '—'}
                                  </td>
                                  <td className="s5-tnum" style={{ padding: '4px', textAlign: 'center', background: '#FAFCFB', color: '#526660', borderLeft: '0.5px solid #D8E4DE', fontSize: '8.5px' }}>
                                    {tRow.start} – {tRow.end}
                                  </td>
                                  {activeDays.map((day) => {
                                    const slotDef = state.slots.find((s) => s.day === day && s.order === tRow.order);
                                    const blocked = !tRow.isKbm || isSlotBlocked(slotDef);
                                    if (blocked) {
                                      return (
                                        <td key={day} style={{ padding: 0, textAlign: 'center', borderLeft: '0.5px solid #D8E4DE' }}>
                                          {renderNonKbmCell(slotDef?.activityType || tRow.activityType || 'ISTIRAHAT', false)}
                                        </td>
                                      );
                                    }
                                    const entry = clsEntries.find((e) => e.day === day && e.jpNo === tRow.jpNo);
                                    if (!entry) {
                                      return (
                                        <td key={day} style={{ padding: '4px', textAlign: 'center', borderLeft: '0.5px solid #D8E4DE', color: '#B4C3BE' }}>
                                          —
                                        </td>
                                      );
                                    }
                                    const sub = state.subjects.find((s) => s.id === entry.subjectId);
                                    const tch = state.teachers.find((t) => t.id === entry.teacherId);
                                    const c = colorizeSubjects && sub?.color
                                      ? getPrintableCellColor(sub.color)
                                      : { bg: [246, 250, 248], text: [17, 50, 48] };
                                    return (
                                      <td
                                        key={day}
                                        style={{
                                          padding: '4px 5px',
                                          textAlign: 'center',
                                          borderLeft: '0.5px solid #D8E4DE',
                                          background: `rgb(${c.bg.join(',')})`,
                                          color: `rgb(${c.text.join(',')})`,
                                        }}
                                      >
                                        <div style={{ fontWeight: 700 }}>
                                          {compactNames ? compactSubjectName(sub?.name || '', sub?.code) : (sub?.name || 'Mapel')}
                                        </div>
                                        <div style={{ fontSize: '8px', opacity: 0.85, marginTop: '1px' }}>
                                          {compactNames ? compactTeacherName(tch?.name || '', tch?.code) : (tch?.name || '—')}
                                        </div>
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>

                          {classLayoutMode === 'single_page' && (
                            <>
                              <div style={{ marginTop: '4px' }}>
                                <div style={{ fontSize: '9px', fontWeight: 700, color: '#0B3435', marginBottom: '3px' }}>
                                  RINGKASAN PENGAMPU MATA PELAJARAN ({classAllocationRows.length} Mapel)
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                  {classAllocationRows.map((row) => (
                                    <span
                                      key={row.id}
                                      className="s5-tnum"
                                      style={{
                                        fontSize: '8.5px',
                                        padding: '2px 7px',
                                        borderRadius: '4px',
                                        background: '#F4F8F6',
                                        border: '0.5px solid #D0DDD7',
                                        color: '#19352F',
                                      }}
                                    >
                                      <strong>{row.subjectName}</strong> ({row.jpCount} JP) — {row.teacherName}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              {renderSignatures(
                                targetClassId === 'all'
                                  ? coordinatorTitle
                                  : coordinatorTitle || `Wali Kelas ${cls.name}`,
                              )}
                            </>
                          )}

                          <div className="s5-tnum" style={{ marginTop: 'auto', fontSize: '8.5px', color: '#556964', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Kelas {cls.name} · {schoolName}</span>
                            <span>Halaman 1 dari {classLayoutMode === 'single_page' ? 1 : 2}</span>
                          </div>
                        </article>

                        {classLayoutMode === 'two_pages' && (
                          <article className="lpv-real-page" style={{ padding: '20px 26px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {includeKop && (
                              <OfficialKopSuratPreview settings={state.settings} overrides={kopOverrides} variant="full" />
                            )}
                            <div style={{ textAlign: 'center', margin: '2px 0' }}>
                              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0B3435' }}>
                                DAFTAR PENGAMPU &amp; BEBAN MATA PELAJARAN — KELAS {cls.name}
                              </div>
                              <div className="s5-tnum" style={{ fontSize: '10px', color: '#465A55' }}>
                                Tahun Ajaran {academicYear} · Semester {semester}
                              </div>
                            </div>

                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                              <thead>
                                <tr style={{ background: '#0B3435', color: '#FFFFFF' }}>
                                  <th style={{ padding: '5px 8px', width: '36px', textAlign: 'center' }}>No</th>
                                  <th style={{ padding: '5px 8px', width: '70px', textAlign: 'center' }}>Kode</th>
                                  <th style={{ padding: '5px 8px', textAlign: 'left' }}>Mata Pelajaran</th>
                                  <th style={{ padding: '5px 8px', textAlign: 'left' }}>Guru Pengampu</th>
                                  <th style={{ padding: '5px 8px', width: '76px', textAlign: 'center' }}>Beban JP</th>
                                </tr>
                              </thead>
                              <tbody>
                                {classAllocationRows.map((row, idx) => (
                                  <tr key={row.id} style={{ background: idx % 2 === 0 ? '#FFFFFF' : '#F6FAF8', borderBottom: '0.5px solid #DCE6E1' }}>
                                    <td className="s5-tnum" style={{ padding: '5px 8px', textAlign: 'center' }}>{idx + 1}</td>
                                    <td className="s5-tnum" style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{row.code}</td>
                                    <td style={{ padding: '5px 8px', fontWeight: 600 }}>{row.subjectName}</td>
                                    <td style={{ padding: '5px 8px' }}>{row.teacherName}</td>
                                    <td className="s5-tnum" style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{row.jpCount} JP</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>

                            {renderSignatures(
                              targetClassId === 'all'
                                ? coordinatorTitle
                                : coordinatorTitle || `Wali Kelas ${cls.name}`,
                            )}
                            <div className="s5-tnum" style={{ marginTop: 'auto', fontSize: '8.5px', color: '#556964', display: 'flex', justifyContent: 'space-between' }}>
                              <span>Kelas {cls.name} · {schoolName}</span>
                              <span>Halaman 2 dari 2</span>
                            </div>
                          </article>
                        )}
                      </>
                    );
                  }

                  // MODE D: PER PENDIDIK / GURU
                  const tch = selectedTeacherObj;
                  if (!tch) {
                    return (
                      <article className="lpv-real-page" style={{ padding: '28px', textAlign: 'center', color: '#687E77' }}>
                        Belum ada pendidik aktif untuk dipratinjau.
                      </article>
                    );
                  }
                  const tchEntries = liveEntries.filter((e) => e.teacherId === tch.id);
                  const tchAstro = jpToAstronomical(tchEntries.length, periodMinutes);
                  const maxQuota = tch.maxWeeklyJP > 0 ? tch.maxWeeklyJP : (state.settings.maxWeeklyJP ?? 24);
                  const isDraftMode = state.draft !== null;

                  return (
                    <article className="lpv-real-page" style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {includeKop && (
                        <OfficialKopSuratPreview settings={state.settings} overrides={kopOverrides} variant="full" />
                      )}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0B3435' }}>
                          {isDraftMode
                            ? 'JADWAL MENGAJAR INDIVIDUAL GURU (PRATINJAU DRAFT)'
                            : 'JADWAL MENGAJAR INDIVIDUAL GURU'}
                        </div>
                        <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#173637', marginTop: '3px' }}>
                          {tch.name} ({tch.code}) — {tch.roleTitle || 'Guru Mapel'}
                        </div>
                        <div className="s5-tnum" style={{ fontSize: '9.5px', color: '#526861', marginTop: '2px' }}>
                          {formatCleanNip(tch.nip) ? `NIP. ${formatCleanNip(tch.nip)} · ` : ''}
                          Total Beban: {tchEntries.length} JP ({tchAstro.hours} Jam Astronomis) · Kuota Maksimum: {maxQuota} JP/minggu
                        </div>
                        {isDraftMode && (
                          <div style={{ fontSize: '9px', fontWeight: 700, color: '#8F2D24', marginTop: '3px' }}>
                            PRATINJAU DRAFT - BELUM DITERBITKAN; BUKAN DOKUMEN RESMI ATAU DASAR SK
                          </div>
                        )}
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px', tableLayout: 'fixed', border: '1px solid #0B3435' }}>
                        <thead>
                          <tr style={{ background: '#0B3435', color: '#FFFFFF' }}>
                            <th style={{ padding: '5px 4px', width: '34px', textAlign: 'center' }}>JP</th>
                            <th style={{ padding: '5px 4px', width: '80px', textAlign: 'center', borderLeft: '0.5px solid rgba(255,255,255,0.2)' }}>WAKTU</th>
                            {activeDays.map((day) => (
                              <th key={day} style={{ padding: '5px 4px', textAlign: 'center', borderLeft: '0.5px solid rgba(255,255,255,0.2)' }}>
                                {day.toUpperCase()}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {timelineRows.map((tRow, idx) => (
                            <tr key={`${tRow.order}-${idx}`} style={{ borderTop: '0.5px solid #D8E4DE' }}>
                              <td className="s5-tnum" style={{ padding: '4px', textAlign: 'center', fontWeight: 700, background: '#F6FAF8', color: '#0B3435' }}>
                                {tRow.isKbm ? String(tRow.jpNo).padStart(2, '0') : '—'}
                              </td>
                              <td className="s5-tnum" style={{ padding: '4px', textAlign: 'center', background: '#FAFCFB', color: '#526660', borderLeft: '0.5px solid #D8E4DE', fontSize: '8.5px' }}>
                                {tRow.start} – {tRow.end}
                              </td>
                              {activeDays.map((day) => {
                                const slotDef = state.slots.find((s) => s.day === day && s.order === tRow.order);
                                const blocked = !tRow.isKbm || isSlotBlocked(slotDef);
                                if (blocked) {
                                  return (
                                    <td key={day} style={{ padding: 0, textAlign: 'center', borderLeft: '0.5px solid #D8E4DE' }}>
                                      {renderNonKbmCell(slotDef?.activityType || tRow.activityType || 'ISTIRAHAT', false)}
                                    </td>
                                  );
                                }
                                const slotEntries = tchEntries.filter((e) => e.day === day && e.jpNo === tRow.jpNo);
                                if (slotEntries.length === 0) {
                                  return (
                                    <td key={day} style={{ padding: '4px', textAlign: 'center', borderLeft: '0.5px solid #D8E4DE', color: '#B4C3BE' }}>
                                      —
                                    </td>
                                  );
                                }
                                const first = slotEntries[0];
                                const sub = state.subjects.find((s) => s.id === first.subjectId);
                                const clsNames = slotEntries
                                  .map((se) => state.classes.find((c) => c.id === se.classId)?.name || '?')
                                  .join(' & ');
                                const c = colorizeSubjects && sub?.color
                                  ? getPrintableCellColor(sub.color)
                                  : { bg: [246, 250, 248], text: [17, 50, 48] };
                                return (
                                  <td
                                    key={day}
                                    style={{
                                      padding: '4px 5px',
                                      textAlign: 'center',
                                      borderLeft: '0.5px solid #D8E4DE',
                                      background: slotEntries.length > 1 ? '#FDF2F0' : `rgb(${c.bg.join(',')})`,
                                      color: slotEntries.length > 1 ? '#8F2D24' : `rgb(${c.text.join(',')})`,
                                    }}
                                  >
                                    <div style={{ fontWeight: 700 }}>Kelas {clsNames}</div>
                                    <div style={{ fontSize: '8px', opacity: 0.9 }}>
                                      {compactNames ? compactSubjectName(sub?.name || '', sub?.code) : (sub?.name || 'Mapel')}
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {renderSignatures()}

                      <div className="s5-tnum" style={{ marginTop: 'auto', fontSize: '8.5px', color: '#556964', display: 'flex', justifyContent: 'space-between' }}>
                        <span>Jadwal Mengajar Individual · {tch.name}</span>
                        <span>Halaman 1 dari 1</span>
                      </div>
                    </article>
                  );
                })()}
              </LivePreviewViewport>
            </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="s5-studio-footer">
          <span className="s5-tnum" style={{ fontSize: '12px', color: '#526861' }}>
            Format Cetak: <strong>{paperLabel}</strong> ({paperDimensionText})
          </span>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
              style={{ height: '38px', fontSize: '12.5px' }}
            >
              Batal
            </button>
            <button
              type="button"
              className="button button-primary"
              onClick={handleDownload}
              disabled={isExporting}
              style={{ height: '38px', padding: '0 18px', fontSize: '12.5px' }}
            >
              <Download size={15} />
              {isExporting
                ? 'Memproses PDF…'
                : `Unduh Dokumen PDF Resmi (${paperSize.toUpperCase()})`}
            </button>
          </div>
        </div>
    </MotionModalDialog>
  );
}
