import { useMemo, useState } from 'react';
import {
  AlignLeft,
  Award,
  Check,
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
  exportAllClassesSinglePageA4PDF,
  exportAllClassesWeeklyPDF,
  exportScheduleClassPDF,
  exportScheduleMasterPDF,
  exportScheduleTeacherPDF,
  type PaperSize,
  type WeeklyClassSchedulePdfOptions,
} from '../utils/pdfExport';
import { jpToAstronomical } from '../domain/time';
import { DEFAULT_MADRASAH_IDENTITY, type KopRenderMode } from '../domain/kopIdentity';
import { OfficialKopSuratPreview } from './OfficialKopSuratPreview';

interface SchedulePdfExportModalProps {
  state: AppState;
  selectedClassId: string;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
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

  const previewSubjects = useMemo(() => state.subjects.slice(0, 6), [state.subjects]);

  if (!isOpen) return null;

  const isLandscapeOutput =
    exportType === 'all_single_page' ||
    exportType === 'school' ||
    (exportType === 'class' && classOrientation === 'landscape');

  const paperLabel = paperSize === 'a4' ? 'A4 Standar' : 'F4 / Folio';
  const paperDimensionText =
    paperSize === 'a4'
      ? isLandscapeOutput
        ? '297 × 210 mm · Landscape'
        : '210 × 297 mm · Portrait'
      : isLandscapeOutput
      ? '330 × 215 mm · Landscape'
      : '215 × 330 mm · Portrait';

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

  const previewHeadline =
    exportType === 'class' && selectedClassObj
      ? `${documentTitle || 'JADWAL PELAJARAN MINGGUAN'} — KELAS ${selectedClassObj.name}`
      : exportType === 'teacher' && selectedTeacherObj
      ? `JADWAL MENGAJAR — ${selectedTeacherObj.name.toUpperCase()}`
      : documentTitle || 'JADWAL PELAJARAN SELURUH KELAS';

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

            {/* RIGHT PANE: Live Paper & Telemetry Preview */}
            <div className="s5-pdf-paper-stage">
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span className="s5-studio-kicker">Pratinjau Dokumen Resmi</span>
                <span className="s5-tnum" style={{ fontSize: '11px', color: '#526861', fontWeight: 600 }}>
                  {paperLabel} · {isLandscapeOutput ? 'Landscape' : 'Portrait'}
                </span>
              </div>

              {/* 4 Live Document KPI Strip */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                <div
                  style={{
                    padding: '8px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>ALOKASI</div>
                  <strong className="s5-tnum" style={{ fontSize: '14px', color: '#0B2923' }}>
                    {classPreviewStats.totalJp} JP
                  </strong>
                </div>
                <div
                  style={{
                    padding: '8px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>ASTRONOMIS</div>
                  <strong className="s5-tnum" style={{ fontSize: '12.5px', color: '#0B2923' }}>
                    {classPreviewStats.astroFormatted}
                  </strong>
                </div>
                <div
                  style={{
                    padding: '8px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>PENDIDIK</div>
                  <strong className="s5-tnum" style={{ fontSize: '14px', color: '#0B2923' }}>
                    {classPreviewStats.teacherCount} Guru
                  </strong>
                </div>
                <div
                  style={{
                    padding: '8px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>ESTIMASI</div>
                  <strong className="s5-tnum" style={{ fontSize: '13.5px', color: '#1B5E43' }}>
                    {classPreviewStats.pageEstimate} Hal
                  </strong>
                </div>
              </div>

              {/* Miniature Official Paper Sheet */}
              <div className="s5-pdf-paper-sheet">
                {includeKop && (
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
                      kopMode,
                      kopImageUrl: state.settings.kopImageUrl,
                    }}
                    variant="compact"
                  />
                )}

                <div style={{ textAlign: 'center', margin: '8px 0 9px' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#0B2923', letterSpacing: '0.02em' }}>
                    {previewHeadline}
                  </div>
                  <div className="s5-tnum" style={{ fontSize: '10px', color: '#526861', marginTop: '1px' }}>
                    TA {academicYear} ({semester}) · {paperSize.toUpperCase()}
                    {extraNotes.trim() ? ` · ${extraNotes.trim()}` : ''}
                  </div>
                  <div
                    style={{
                      width: '40px',
                      height: '1.5px',
                      background: '#C5A059',
                      margin: '4px auto 0',
                      borderRadius: '2px',
                    }}
                  />
                </div>

                {/* Live Mini Schedule Grid */}
                <div
                  style={{
                    border: '0.75px solid #D5E0DA',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    marginBottom: '9px',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9.5px' }}>
                    <thead>
                      <tr style={{ background: '#124037', color: '#FFFFFF' }}>
                        <th style={{ padding: '4px 5px', textAlign: 'center', width: '36px' }}>JP</th>
                        <th style={{ padding: '4px 5px', textAlign: 'center' }}>Senin</th>
                        <th style={{ padding: '4px 5px', textAlign: 'center' }}>Selasa</th>
                        <th style={{ padding: '4px 5px', textAlign: 'center' }}>Rabu</th>
                        <th style={{ padding: '4px 5px', textAlign: 'center' }}>Kamis</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3].map((rowJp) => (
                        <tr key={rowJp} style={{ borderTop: '0.5px solid #E5ECE8' }}>
                          <td
                            className="s5-tnum"
                            style={{
                              padding: '4px 5px',
                              textAlign: 'center',
                              fontWeight: 700,
                              color: '#124037',
                              background: '#F4F7F5',
                            }}
                          >
                            {rowJp}
                          </td>
                          {[0, 1, 2, 3].map((colIdx) => {
                            const subj =
                              previewSubjects[(rowJp + colIdx) % Math.max(1, previewSubjects.length)];
                            const bg = colorizeSubjects && subj?.color ? `${subj.color}22` : '#FFFFFF';
                            const label = compactNames
                              ? subj?.code || 'MPL'
                              : subj?.name?.slice(0, 9) || 'Mapel';
                            return (
                              <td
                                key={colIdx}
                                style={{
                                  padding: '4px 5px',
                                  textAlign: 'center',
                                  background: bg,
                                  color: '#0F201C',
                                  fontWeight: 600,
                                  borderLeft: '0.5px solid #E5ECE8',
                                }}
                              >
                                {label}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div
                    style={{
                      padding: '4px 8px',
                      background: '#F5F8F6',
                      borderTop: '0.5px solid #E5ECE8',
                      fontSize: '9.5px',
                      color: '#466159',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span>
                      {exportType === 'all_single_page'
                        ? `${activeClasses.length} blok jadwal kelas paralel`
                        : exportType === 'class' && targetClassId === 'all'
                        ? `${activeClasses.length} rombel (${classLayoutMode === 'single_page' ? '1 hal/rombel' : '2 hal/rombel'})`
                        : 'Matriks jadwal mingguan lengkap + jeda non-KBM'}
                    </span>
                    {(includeRecapPage || (exportType === 'class' && classLayoutMode === 'single_page')) && (
                      <span style={{ color: '#1B5E43', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                        <Check size={10} strokeWidth={3} /> Rekap JP &amp; TTD
                      </span>
                    )}
                  </div>
                </div>

                {/* Miniature Dual Signature Preview */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '12px',
                    paddingTop: '4px',
                    fontSize: '9.5px',
                    lineHeight: 1.32,
                    color: '#2F443E',
                  }}
                >
                  <div>
                    <div>Mengetahui,</div>
                    <div style={{ fontWeight: 600, color: '#0F201C' }}>{coordinatorTitle}</div>
                    <div style={{ height: '14px' }} />
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
                    <div style={{ height: '14px' }} />
                    <div style={{ fontWeight: 700, color: '#0B2923', textDecoration: 'underline' }}>
                      {principalName}
                    </div>
                    <div className="s5-tnum">
                      {formatCleanNip(principalNip) ? `NIP. ${formatCleanNip(principalNip)}` : 'NIP. —'}
                    </div>
                  </div>
                </div>
              </div>
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
