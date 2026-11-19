import { useMemo, useState } from 'react';
import {
  CalendarRange,
  Check,
  Download,
  FileEdit,
  FileText,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import type { AppState } from '../domain/types';
import {
  computeRangeAttendanceRecap,
  enumerateMonthsInRange,
  formatPeriodRangeLabel,
} from '../domain/attendanceRecap';
import {
  buildRightSignerTitle,
  exportAttendanceRecapPDF,
  type AttendanceRecapPdfOptions,
  type PaperSize,
} from '../utils/pdfExport';
import { DEFAULT_MADRASAH_IDENTITY, type KopRenderMode } from '../domain/kopIdentity';
import { OfficialKopSuratPreview } from './OfficialKopSuratPreview';

interface AttendancePdfExportModalProps {
  state: AppState;
  isOpen: boolean;
  onClose: () => void;
  onNotify: (message: string, kind?: 'success' | 'warning' | 'error' | 'info') => void;
  initialMonth?: string;
  initialEndMonth?: string;
  initialSelectedTeacherIds?: string[];
}

type StudioMainTab = 'config' | 'content';
type ContentSubTab = 'kop' | 'title' | 'signer';

const MONTHS_FULL_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const DEFAULT_SINGLE_TITLE = 'LAPORAN REKAPITULASI KEHADIRAN GURU BULANAN';
const DEFAULT_MULTI_TITLE = 'LAPORAN REKAPITULASI KEHADIRAN GURU MULTI-BULAN';

function formatCleanNip(nip?: string): string {
  const cleaned = (nip ?? '').trim();
  if (!cleaned || /^[.\-\u2014\s]+$/.test(cleaned)) return '';
  return cleaned;
}

function parseYmParts(ym: string, fallbackYear: number, fallbackMonth: number) {
  const [y, m] = ym.split('-').map(Number);
  return {
    year: y && y >= 2000 && y <= 2100 ? y : fallbackYear,
    month: m && m >= 1 && m <= 12 ? m : fallbackMonth,
  };
}

export function AttendancePdfExportModal({
  state,
  isOpen,
  onClose,
  onNotify,
  initialMonth,
  initialEndMonth,
  initialSelectedTeacherIds,
}: AttendancePdfExportModalProps) {
  const activeTeachers = useMemo(
    () => state.teachers.filter((t) => t.isActive !== false),
    [state.teachers],
  );

  const fallbackYm = new Date().toISOString().slice(0, 7);
  const startInit = initialMonth || fallbackYm;
  const isInitMulti = Boolean(initialEndMonth && initialEndMonth !== startInit);

  const [studioTab, setStudioTab] = useState<StudioMainTab>('config');
  const [contentSubTab, setContentSubTab] = useState<ContentSubTab>('kop');

  const [periodMode, setPeriodMode] = useState<'single' | 'range'>(() =>
    isInitMulti ? 'range' : 'single',
  );
  const [monthYear, setMonthYear] = useState<string>(() => startInit);
  const [endMonthYear, setEndMonthYear] = useState<string>(() => initialEndMonth || startInit);

  const [paperSize, setPaperSize] = useState<PaperSize>('a4');
  const [orientation, setOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [layoutDensity, setLayoutDensity] = useState<'compact' | 'standard'>('compact');
  const [includeKop, setIncludeKop] = useState<boolean>(true);
  const [includeSignature, setIncludeSignature] = useState<boolean>(true);
  const [includeNotes, setIncludeNotes] = useState<boolean>(true);
  const [includePrintMeta, setIncludePrintMeta] = useState<boolean>(true);

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

  const [documentTitle, setDocumentTitle] = useState<string>(() =>
    isInitMulti ? DEFAULT_MULTI_TITLE : DEFAULT_SINGLE_TITLE,
  );
  const [academicYear, setAcademicYear] = useState<string>(
    () => state.settings.academicYear || '2026/2027',
  );
  const [semester, setSemester] = useState<'Ganjil' | 'Genap'>(
    () => state.settings.semester || 'Ganjil',
  );

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
  const [officerTitle, setOfficerTitle] = useState<string>(
    () => state.settings.curriculumLeaderTitle || 'Koordinator Akademik & Kurikulum',
  );
  const [officerName, setOfficerName] = useState<string>(
    () => state.settings.curriculumLeaderName || 'Siti Aminah, S.Pd.I., M.Pd.',
  );
  const [officerNip, setOfficerNip] = useState<string>(
    () => state.settings.curriculumLeaderNip || '19820315 200901 2 008',
  );

  const [teacherSearch, setTeacherSearch] = useState<string>('');
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>(() => {
    if (initialSelectedTeacherIds && initialSelectedTeacherIds.length > 0) {
      const validIds = new Set(activeTeachers.map((t) => t.id));
      const filtered = initialSelectedTeacherIds.filter((id) => validIds.has(id));
      if (filtered.length > 0) return filtered;
    }
    return activeTeachers.map((t) => t.id);
  });

  const [isExporting, setIsExporting] = useState<boolean>(false);

  const effectiveEndMonth = periodMode === 'range' ? endMonthYear : undefined;
  const activeMonths = useMemo(
    () => enumerateMonthsInRange(monthYear, effectiveEndMonth || monthYear),
    [monthYear, effectiveEndMonth],
  );
  const isMultiMonth = activeMonths.length > 1;
  const activePeriodLabel = useMemo(
    () => formatPeriodRangeLabel(monthYear, effectiveEndMonth),
    [monthYear, effectiveEndMonth],
  );

  const switchPeriodMode = (nextMode: 'single' | 'range') => {
    setPeriodMode(nextMode);
    if (nextMode === 'single') {
      if (documentTitle.trim() === DEFAULT_MULTI_TITLE) {
        setDocumentTitle(DEFAULT_SINGLE_TITLE);
      }
    } else {
      if (documentTitle.trim() === DEFAULT_SINGLE_TITLE) {
        setDocumentTitle(DEFAULT_MULTI_TITLE);
      }
      if (endMonthYear <= monthYear) {
        const [y, m] = monthYear.split('-').map(Number);
        const endM = Math.min(12, (m || 1) + 2);
        setEndMonthYear(`${y || new Date().getFullYear()}-${String(endM).padStart(2, '0')}`);
      }
    }
  };

  const applySemesterPreset = (preset: 'odd' | 'even') => {
    const baseYear = parseYmParts(monthYear, new Date().getFullYear(), new Date().getMonth() + 1).year;
    setPeriodMode('range');
    if (preset === 'odd') {
      setMonthYear(`${baseYear}-07`);
      setEndMonthYear(`${baseYear}-12`);
      setSemester('Ganjil');
    } else {
      setMonthYear(`${baseYear}-01`);
      setEndMonthYear(`${baseYear}-06`);
      setSemester('Genap');
    }
    if (documentTitle.trim() === DEFAULT_SINGLE_TITLE) {
      setDocumentTitle(DEFAULT_MULTI_TITLE);
    }
  };

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
    setDocumentTitle(isMultiMonth ? DEFAULT_MULTI_TITLE : DEFAULT_SINGLE_TITLE);
    setSignerCity(state.settings.city || DEFAULT_MADRASAH_IDENTITY.city);
    setPrincipalTitle(state.settings.headmasterTitle || 'Kepala Madrasah');
    setPrincipalName(state.settings.headmasterName || 'H. Ahmad Fauzi, S.Ag., M.Pd.I.');
    setPrincipalNip(state.settings.headmasterNip || '19750812 200212 1 003');
    setOfficerTitle(
      state.settings.curriculumLeaderTitle || 'Koordinator Akademik & Kurikulum',
    );
    setOfficerName(state.settings.curriculumLeaderName || 'Siti Aminah, S.Pd.I., M.Pd.');
    setOfficerNip(state.settings.curriculumLeaderNip || '19820315 200901 2 008');
    onNotify('Seluruh teks dokumen resmi dikembalikan sesuai Pengaturan Madrasah.', 'info');
  };

  const previewStats = useMemo(() => {
    const attendanceList = state.attendance ?? [];
    const chosenTeachers = activeTeachers.filter((t) => selectedTeacherIds.includes(t.id));
    const summary = computeRangeAttendanceRecap(
      attendanceList,
      chosenTeachers,
      monthYear,
      effectiveEndMonth,
    );

    return {
      recordedDays: summary.recordedDaysCount,
      monthCount: summary.months.length,
      isMultiMonth: summary.isMultiMonth,
      monthSummaries: summary.monthSummaries,
      teacherCount: chosenTeachers.length,
      avgRate: summary.overallAvgRate,
      hasData: summary.teachersWithRecordsCount > 0,
      sampleRows: summary.rows.slice(0, 5),
      months: summary.months,
    };
  }, [state.attendance, monthYear, effectiveEndMonth, selectedTeacherIds, activeTeachers]);

  const filteredTeachersList = useMemo(() => {
    if (!teacherSearch.trim()) return activeTeachers;
    const q = teacherSearch.toLowerCase();
    return activeTeachers.filter(
      (t) => t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q),
    );
  }, [activeTeachers, teacherSearch]);

  if (!isOpen) return null;

  const paperDimensionText =
    paperSize === 'a4'
      ? orientation === 'landscape'
        ? '297 × 210 mm'
        : '210 × 297 mm'
      : orientation === 'landscape'
      ? '330 × 210 mm'
      : '210 × 330 mm';

  const paperLabel = paperSize === 'a4' ? 'A4 Standar' : 'F4 / Folio Kemenag';

  const showInlineMonthCols =
    previewStats.isMultiMonth && orientation === 'landscape' && previewStats.months.length <= 5;
  const showAppendixMonthMatrix = previewStats.isMultiMonth && !showInlineMonthCols;

  const handleDownload = () => {
    if (selectedTeacherIds.length === 0) {
      onNotify('Pilih setidaknya satu guru untuk diekspor.', 'warning');
      return;
    }

    try {
      setIsExporting(true);
      const options: AttendanceRecapPdfOptions = {
        paperSize,
        orientation,
        endMonth: effectiveEndMonth,
        layoutDensity,
        kopSurat: includeKop,
        includeSignature,
        includeNotes,
        includePrintMeta,
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
        documentTitle: documentTitle.trim(),
        academicYear: academicYear.trim(),
        semester,
        signerCity: signerCity.trim(),
        signerDate: signerDate.trim(),
        principalTitle: principalTitle.trim(),
        principalName: principalName.trim(),
        principalNip: principalNip.trim(),
        officerTitle: officerTitle.trim(),
        officerName: officerName.trim(),
        officerNip: officerNip.trim(),
        leftTitle: officerTitle.trim(),
        leftName: officerName.trim(),
        leftNip: officerNip.trim(),
        rightTitle: buildRightSignerTitle(principalTitle, schoolName),
        rightName: principalName.trim(),
        rightNip: principalNip.trim(),
      };

      exportAttendanceRecapPDF(state, monthYear, selectedTeacherIds, options);
      onNotify(
        `Laporan Presensi ${activePeriodLabel} (${paperSize.toUpperCase()}) berhasil diunduh.`,
        'success',
      );
      onClose();
    } catch (err) {
      console.error('Attendance PDF export failed:', err);
      onNotify('Gagal mengekspor PDF presensi. Periksa format data.', 'error');
    } finally {
      setIsExporting(false);
    }
  };

  const toggleTeacher = (id: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((tId) => tId !== id) : [...prev, id],
    );
  };

  const selectAll = () => setSelectedTeacherIds(activeTeachers.map((t) => t.id));
  const deselectAll = () => setSelectedTeacherIds([]);

  const currentYearFallback = new Date().getFullYear();
  const startParts = parseYmParts(monthYear, currentYearFallback, new Date().getMonth() + 1);
  const endParts = parseYmParts(endMonthYear, startParts.year, startParts.month);
  const selectableYears = Array.from(
    new Set([
      ...Array.from({ length: 9 }, (_, i) => currentYearFallback - 3 + i),
      startParts.year,
      endParts.year,
    ]),
  ).sort((a, b) => a - b);

  const updateStartMonth = (newMonth: number) => {
    setMonthYear(`${startParts.year}-${String(newMonth).padStart(2, '0')}`);
  };
  const updateStartYear = (newYear: number) => {
    setMonthYear(`${newYear}-${String(startParts.month).padStart(2, '0')}`);
  };
  const updateEndMonth = (newMonth: number) => {
    setEndMonthYear(`${endParts.year}-${String(newMonth).padStart(2, '0')}`);
  };
  const updateEndYear = (newYear: number) => {
    setEndMonthYear(`${newYear}-${String(endParts.month).padStart(2, '0')}`);
  };

  const applyTodaySignerDate = () => {
    setSignerDate(
      new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    );
  };
  const applyEndOfMonthSignerDate = () => {
    const refParts = periodMode === 'range' ? endParts : startParts;
    const endOfSelectedMonth = new Date(refParts.year, refParts.month, 0);
    setSignerDate(
      new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(endOfSelectedMonth),
    );
  };

  return (
    <div
      className="modal-scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-panel s5-export-studio-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Ekspor Rekapitulasi Presensi Guru"
      >
        {/* Header */}
        <div
          className="modal-head"
          style={{
            padding: '15px 22px',
            borderBottom: '0.75px solid #DCE5DF',
            background: '#FFFFFF',
          }}
        >
          <div className="modal-title-icon" style={{ background: '#E8F4EE', color: '#124037' }}>
            <FileText size={19} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: '16px', margin: 0, color: '#0B2923', fontWeight: 700 }}>
              Studio Ekspor Rekapitulasi Presensi Guru
            </h2>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#526861' }}>
              Dukungan rekap 1 bulan maupun rentang multi-bulan dengan pratinjau dokumen cetak resmi madrasah
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Tutup dialog">
            <X size={17} />
          </button>
        </div>

        {/* Studio Dual-Column Body */}
        <div className="s5-studio-body">
          <div className="s5-pdf-studio-grid">
            {/* LEFT COLUMN: Clean 2-Tab Configuration */}
            <div className="s5-studio-left-pane">
              <div className="s5-studio-tabs" role="tablist" aria-label="Panel Pengaturan Presensi PDF">
                <button
                  type="button"
                  role="tab"
                  aria-selected={studioTab === 'config'}
                  className={`s5-studio-tab-btn ${studioTab === 'config' ? 'is-active' : ''}`}
                  onClick={() => setStudioTab('config')}
                >
                  <SlidersHorizontal size={14} />
                  <span>Periode, Kertas &amp; Pendidik</span>
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

              {studioTab === 'config' ? (
                <>
                  {/* Card 1: Periode Laporan (1 Bulan vs Multi-Bulan) */}
                  <div className="s5-studio-card">
                    <div className="s5-studio-section-head">
                      <span
                        className="s5-studio-kicker"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      >
                        <CalendarRange size={13} color="#124037" />
                        <span>1. Periode Rekapitulasi</span>
                      </span>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => switchPeriodMode('single')}
                          className={`s5-studio-preset-btn ${periodMode === 'single' ? 'is-active' : ''}`}
                        >
                          1 Bulan
                        </button>
                        <button
                          type="button"
                          onClick={() => switchPeriodMode('range')}
                          className={`s5-studio-preset-btn ${periodMode === 'range' ? 'is-active' : ''}`}
                        >
                          Rentang Multi-Bulan
                        </button>
                        <button
                          type="button"
                          onClick={() => applySemesterPreset('odd')}
                          className="s5-studio-preset-btn"
                          title="Pilih cepat Juli – Desember"
                        >
                          Jul–Des
                        </button>
                        <button
                          type="button"
                          onClick={() => applySemesterPreset('even')}
                          className="s5-studio-preset-btn"
                          title="Pilih cepat Januari – Juni"
                        >
                          Jan–Jun
                        </button>
                      </div>
                    </div>

                    {periodMode === 'single' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.85fr', gap: '10px' }}>
                        <div className="field-group">
                          <label htmlFor="pdf-month-select" style={{ fontSize: '11px' }}>
                            Bulan Laporan
                          </label>
                          <select
                            id="pdf-month-select"
                            value={startParts.month}
                            onChange={(e) => updateStartMonth(Number(e.target.value))}
                            style={{ height: '36px', fontSize: '12.5px' }}
                          >
                            {MONTHS_FULL_ID.map((mName, idx) => (
                              <option key={mName} value={idx + 1}>
                                {mName}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="field-group">
                          <label htmlFor="pdf-year-select" style={{ fontSize: '11px' }}>
                            Tahun Laporan
                          </label>
                          <select
                            id="pdf-year-select"
                            className="s5-tnum"
                            value={startParts.year}
                            onChange={(e) => updateStartYear(Number(e.target.value))}
                            style={{ height: '36px', fontSize: '12.5px' }}
                          >
                            {selectableYears.map((yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '10px',
                          }}
                        >
                          <div
                            style={{
                              padding: '9px 10px',
                              borderRadius: '9px',
                              background: '#F7FAF8',
                              border: '0.75px solid #D8E2DC',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#2F443E' }}>
                              DARI BULAN
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.95fr', gap: '6px' }}>
                              <select
                                aria-label="Dari bulan"
                                value={startParts.month}
                                onChange={(e) => updateStartMonth(Number(e.target.value))}
                                style={{ height: '34px', fontSize: '12px' }}
                              >
                                {MONTHS_FULL_ID.map((mName, idx) => (
                                  <option key={mName} value={idx + 1}>
                                    {mName}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label="Dari tahun"
                                className="s5-tnum"
                                value={startParts.year}
                                onChange={(e) => updateStartYear(Number(e.target.value))}
                                style={{ height: '34px', fontSize: '12px' }}
                              >
                                {selectableYears.map((yr) => (
                                  <option key={yr} value={yr}>
                                    {yr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div
                            style={{
                              padding: '9px 10px',
                              borderRadius: '9px',
                              background: '#F7FAF8',
                              border: '0.75px solid #D8E2DC',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '6px',
                            }}
                          >
                            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#2F443E' }}>
                              SAMPAI BULAN
                            </span>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 0.95fr', gap: '6px' }}>
                              <select
                                aria-label="Sampai bulan"
                                value={endParts.month}
                                onChange={(e) => updateEndMonth(Number(e.target.value))}
                                style={{ height: '34px', fontSize: '12px' }}
                              >
                                {MONTHS_FULL_ID.map((mName, idx) => (
                                  <option key={mName} value={idx + 1}>
                                    {mName}
                                  </option>
                                ))}
                              </select>
                              <select
                                aria-label="Sampai tahun"
                                className="s5-tnum"
                                value={endParts.year}
                                onChange={(e) => updateEndYear(Number(e.target.value))}
                                style={{ height: '34px', fontSize: '12px' }}
                              >
                                {selectableYears.map((yr) => (
                                  <option key={yr} value={yr}>
                                    {yr}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>

                        <div
                          className="s5-tnum"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            background: '#EFF7F3',
                            border: '0.75px solid #C6DFD1',
                            fontSize: '11.5px',
                            color: '#124037',
                            fontWeight: 600,
                          }}
                        >
                          <span>Cakupan: {activePeriodLabel}</span>
                          <span>
                            {showInlineMonthCols
                              ? 'Rincian bulanan tampil di Hal. 1'
                              : isMultiMonth
                              ? '+ Lampiran Matriks Per Bulan'
                              : ''}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Kertas, Tata Letak & Titimangsa */}
                  <div className="s5-studio-card">
                    <div className="s5-studio-section-head">
                      <span className="s5-studio-kicker">2. Kertas, Tata Letak &amp; Pengesahan</span>
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
                            sub: '210 × 330 mm · Standar Kemenag',
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

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div className="field-group">
                        <label htmlFor="pdf-orientation" style={{ fontSize: '11px' }}>
                          Orientasi Halaman
                        </label>
                        <select
                          id="pdf-orientation"
                          value={orientation}
                          onChange={(e) =>
                            setOrientation(e.target.value as 'landscape' | 'portrait')
                          }
                          style={{ height: '35px', fontSize: '12px' }}
                        >
                          <option value="landscape">{paperSize.toUpperCase()} Landscape</option>
                          <option value="portrait">{paperSize.toUpperCase()} Portrait</option>
                        </select>
                      </div>

                      <div className="field-group">
                        <label htmlFor="pdf-layout-density" style={{ fontSize: '11px' }}>
                          Kepadatan Tabel
                        </label>
                        <select
                          id="pdf-layout-density"
                          value={layoutDensity}
                          onChange={(e) =>
                            setLayoutDensity(e.target.value as 'compact' | 'standard')
                          }
                          style={{ height: '35px', fontSize: '12px' }}
                        >
                          <option value="compact">Presisi 1 Halaman</option>
                          <option value="standard">Standar Lega</option>
                        </select>
                      </div>

                      <div className="field-group">
                        <label htmlFor="pdf-print-place" style={{ fontSize: '11px' }}>
                          Tempat Titimangsa
                        </label>
                        <input
                          id="pdf-print-place"
                          type="text"
                          value={signerCity}
                          onChange={(e) => setSignerCity(e.target.value)}
                          style={{ height: '35px', fontSize: '12px' }}
                        />
                      </div>

                      <div className="field-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <label htmlFor="pdf-print-date" style={{ fontSize: '11px' }}>
                            Tanggal Pengesahan
                          </label>
                          <span style={{ display: 'inline-flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={applyTodaySignerDate}
                              style={{
                                border: 0,
                                background: 'transparent',
                                padding: 0,
                                fontSize: '10.5px',
                                fontWeight: 600,
                                color: '#1B5E43',
                                cursor: 'pointer',
                              }}
                            >
                              Hari Ini
                            </button>
                            <button
                              type="button"
                              onClick={applyEndOfMonthSignerDate}
                              style={{
                                border: 0,
                                background: 'transparent',
                                padding: 0,
                                fontSize: '10.5px',
                                fontWeight: 600,
                                color: '#8C6226',
                                cursor: 'pointer',
                              }}
                            >
                              Akhir Bln
                            </button>
                          </span>
                        </div>
                        <input
                          id="pdf-print-date"
                          type="text"
                          value={signerDate}
                          onChange={(e) => setSignerDate(e.target.value)}
                          style={{ height: '35px', fontSize: '12px' }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '7px' }}>
                      {[
                        { label: 'Kop Surat Kemenag', checked: includeKop, onChange: setIncludeKop },
                        { label: 'Blok Tanda Tangan', checked: includeSignature, onChange: setIncludeSignature },
                        { label: 'Catatan Keterangan', checked: includeNotes, onChange: setIncludeNotes },
                        { label: 'Info Cetak di Footer', checked: includePrintMeta, onChange: setIncludePrintMeta },
                      ].map((item) => (
                        <label
                          key={item.label}
                          className={`s5-studio-switch-row ${item.checked ? 'is-checked' : ''}`}
                          style={{ padding: '7px 9px' }}
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={(e) => item.onChange(e.target.checked)}
                            style={{ accentColor: '#124037', marginTop: '2px' }}
                          />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#0F201C' }}>
                            {item.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Card 3: Daftar Pendidik Sasaran */}
                  <div className="s5-studio-card">
                    <div className="s5-studio-section-head">
                      <span className="s5-studio-kicker s5-tnum">
                        3. Daftar Pendidik ({selectedTeacherIds.length}/{activeTeachers.length})
                      </span>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                          type="button"
                          onClick={selectAll}
                          className="s5-studio-preset-btn"
                          style={{ color: '#1B5E43' }}
                        >
                          Pilih Semua
                        </button>
                        <button
                          type="button"
                          onClick={deselectAll}
                          className="s5-studio-preset-btn"
                          style={{ color: '#A63A2E' }}
                        >
                          Kosongkan
                        </button>
                      </div>
                    </div>

                    <div className="s5-input-shell" style={{ height: '34px', padding: '0 10px', width: '100%' }}>
                      <Search size={13} color="#687E77" />
                      <input
                        type="text"
                        placeholder="Cari nama atau kode pendidik…"
                        value={teacherSearch}
                        onChange={(e) => setTeacherSearch(e.target.value)}
                        style={{ width: '100%', fontSize: '12px' }}
                      />
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                        gap: '6px',
                        maxHeight: '146px',
                        overflowY: 'auto',
                        padding: '2px',
                      }}
                    >
                      {filteredTeachersList.map((teacher) => {
                        const isChecked = selectedTeacherIds.includes(teacher.id);
                        return (
                          <button
                            key={teacher.id}
                            type="button"
                            onClick={() => toggleTeacher(teacher.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              padding: '6px 9px',
                              borderRadius: '8px',
                              background: isChecked ? '#E8F4EE' : '#FAFBF9',
                              border: `0.75px solid ${isChecked ? '#8DC2A7' : '#DCE5DF'}`,
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.12s ease',
                            }}
                          >
                            <span
                              className={`s5-checkbox-box ${isChecked ? 'checked' : ''}`}
                              style={{ width: '16px', height: '16px', flexShrink: 0 }}
                            >
                              {isChecked && <Check size={11} color="#FFFFFF" strokeWidth={2.8} />}
                            </span>
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: '#0F201C',
                                fontWeight: isChecked ? 600 : 500,
                              }}
                            >
                              {teacher.name}
                            </span>
                          </button>
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
                          type="text"
                          value={schoolName}
                          onChange={(e) => setSchoolName(e.target.value)}
                          style={{ height: '34px', fontSize: '12px', fontWeight: 700 }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Yayasan / Lembaga Menaungi</label>
                        <input
                          type="text"
                          value={ministry}
                          onChange={(e) => setMinistry(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Akte Notaris / SK Pendirian</label>
                        <input
                          type="text"
                          value={regionalOffice}
                          onChange={(e) => setRegionalOffice(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Keputusan Menkumham / SK Legalitas</label>
                        <input
                          type="text"
                          value={legalDecree}
                          onChange={(e) => setLegalDecree(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>NSM</label>
                        <input
                          type="text"
                          value={nsm}
                          onChange={(e) => setNsm(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>NPSN</label>
                        <input
                          type="text"
                          value={npsn}
                          onChange={(e) => setNpsn(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Status Akreditasi</label>
                        <input
                          type="text"
                          value={accreditation}
                          onChange={(e) => setAccreditation(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group" style={{ gridColumn: 'span 2' }}>
                        <label style={{ fontSize: '11px' }}>Alamat Lengkap</label>
                        <input
                          type="text"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Kota / Kabupaten</label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          style={{ height: '34px', fontSize: '12px' }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Telepon</label>
                        <input
                          type="text"
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
                          type="text"
                          value={documentTitle}
                          onChange={(e) => setDocumentTitle(e.target.value)}
                          style={{ height: '36px', fontSize: '12.5px', fontWeight: 700 }}
                        />
                      </div>
                      <div className="field-group">
                        <label style={{ fontSize: '11px' }}>Tahun Ajaran</label>
                        <input
                          type="text"
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
                    </div>
                  )}

                  {contentSubTab === 'signer' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '11px' }}>
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
                        <div style={{ gridColumn: 'span 2', fontSize: '11px', fontWeight: 700, color: '#124037' }}>
                          Penandatangan Kiri (Pemeriksa)
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Jabatan Kiri</label>
                          <input
                            type="text"
                            value={officerTitle}
                            onChange={(e) => setOfficerTitle(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Nama Pejabat Kiri</label>
                          <input
                            type="text"
                            value={officerName}
                            onChange={(e) => setOfficerName(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group" style={{ gridColumn: 'span 2' }}>
                          <label style={{ fontSize: '11px' }}>NIP Pejabat Kiri</label>
                          <input
                            type="text"
                            value={officerNip}
                            onChange={(e) => setOfficerNip(e.target.value)}
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
                        <div style={{ gridColumn: 'span 2', fontSize: '11px', fontWeight: 700, color: '#7A5B25' }}>
                          Penandatangan Kanan (Kepala Madrasah)
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Jabatan Pengesah</label>
                          <input
                            type="text"
                            value={principalTitle}
                            onChange={(e) => setPrincipalTitle(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group">
                          <label style={{ fontSize: '11px' }}>Nama Kepala Madrasah</label>
                          <input
                            type="text"
                            value={principalName}
                            onChange={(e) => setPrincipalName(e.target.value)}
                            style={{ height: '32px', fontSize: '12px' }}
                          />
                        </div>
                        <div className="field-group" style={{ gridColumn: 'span 2' }}>
                          <label style={{ fontSize: '11px' }}>NIP Kepala Madrasah</label>
                          <input
                            type="text"
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

            {/* RIGHT COLUMN: Live Scaled Kemenag Document Studio Preview */}
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
                  {paperLabel} · {orientation === 'landscape' ? 'Landscape' : 'Portrait'}
                </span>
              </div>

              {/* 3 Live Metric Tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                <div
                  style={{
                    padding: '9px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>
                    {previewStats.isMultiMonth ? 'CAKUPAN' : 'HARI TERCATAT'}
                  </div>
                  <strong
                    className="s5-tnum"
                    style={{
                      fontSize: '14px',
                      color: previewStats.recordedDays > 0 ? '#0B2923' : '#687E77',
                    }}
                  >
                    {previewStats.isMultiMonth
                      ? `${previewStats.monthCount} Bln · ${previewStats.recordedDays} Hr`
                      : previewStats.recordedDays > 0
                      ? `${previewStats.recordedDays} Hari`
                      : 'Belum Ada'}
                  </strong>
                </div>
                <div
                  style={{
                    padding: '9px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>PENDIDIK</div>
                  <strong className="s5-tnum" style={{ fontSize: '14.5px', color: '#0B2923' }}>
                    {previewStats.teacherCount} Guru
                  </strong>
                </div>
                <div
                  style={{
                    padding: '9px 10px',
                    background: '#FFFFFF',
                    borderRadius: '9px',
                    border: '0.75px solid #D5E0DA',
                  }}
                >
                  <div style={{ fontSize: '10px', color: '#526861', fontWeight: 600 }}>RATA-RATA</div>
                  <strong
                    className="s5-tnum"
                    style={{
                      fontSize: '14.5px',
                      color: !previewStats.hasData
                        ? '#687E77'
                        : previewStats.avgRate >= 85
                        ? '#1B5E43'
                        : '#A63A2E',
                    }}
                  >
                    {previewStats.hasData ? `${previewStats.avgRate}%` : '—'}
                  </strong>
                </div>
              </div>

              {previewStats.recordedDays === 0 && (
                <div
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: '#FBF6EB',
                    border: '0.75px solid #E5D4B0',
                    fontSize: '11px',
                    color: '#7A5A22',
                    lineHeight: 1.4,
                  }}
                >
                  Periode {activePeriodLabel} belum memiliki catatan presensi. Isi di tab Harian atau Massal agar persentase riil terhitung otomatis.
                </div>
              )}

              {/* Live Paper Mockup Sheet */}
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

                <div style={{ textAlign: 'center', margin: '8px 0 8px' }}>
                  <div style={{ fontSize: '10.5px', fontWeight: 700, color: '#0B2923', letterSpacing: '0.02em' }}>
                    {documentTitle || (isMultiMonth ? DEFAULT_MULTI_TITLE : DEFAULT_SINGLE_TITLE)}
                  </div>
                  <div className="s5-tnum" style={{ fontSize: '10px', color: '#526861', marginTop: '1px' }}>
                    Periode {activePeriodLabel} · TA {academicYear} ({semester})
                  </div>
                  <div
                    style={{
                      width: '44px',
                      height: '1.5px',
                      background: '#C5A059',
                      margin: '4px auto 0',
                      borderRadius: '2px',
                    }}
                  />
                </div>

                {/* Multi-Month Mini Summary Strip */}
                {previewStats.isMultiMonth && (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '5px',
                      marginBottom: '8px',
                      justifyContent: 'center',
                    }}
                  >
                    {previewStats.monthSummaries.slice(0, 6).map((mb) => (
                      <span
                        key={mb.monthYear}
                        className="s5-tnum"
                        style={{
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: mb.recordedDaysCount > 0 ? '#EEF6F1' : '#F4F5F4',
                          border: `0.5px solid ${mb.recordedDaysCount > 0 ? '#C2DDD0' : '#DCE0DD'}`,
                          fontSize: '9.5px',
                          color: mb.recordedDaysCount > 0 ? '#124037' : '#687E77',
                          fontWeight: 600,
                        }}
                      >
                        {mb.shortLabel}: {mb.recordedDaysCount > 0 ? `${mb.overallAvgRate}%` : '—'}
                      </span>
                    ))}
                    {previewStats.monthSummaries.length > 6 && (
                      <span style={{ fontSize: '9.5px', color: '#526861', alignSelf: 'center' }}>
                        +{previewStats.monthSummaries.length - 6} bln lainnya
                      </span>
                    )}
                  </div>
                )}

                {/* Miniature Recap Table */}
                <div
                  style={{
                    border: '0.75px solid #D5E0DA',
                    borderRadius: '6px',
                    overflow: 'hidden',
                    marginBottom: '10px',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                    <thead>
                      <tr style={{ background: '#124037', color: '#FFFFFF' }}>
                        <th style={{ padding: '4px 6px', textAlign: 'left', fontWeight: 600 }}>Pendidik</th>
                        {showInlineMonthCols &&
                          previewStats.monthSummaries.slice(0, 3).map((mb) => (
                            <th
                              key={`th-${mb.monthYear}`}
                              className="s5-tnum"
                              style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 600 }}
                            >
                              {mb.shortLabel}
                            </th>
                          ))}
                        <th style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 600 }}>H</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 600 }}>S</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 600 }}>I</th>
                        <th style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 600 }}>A</th>
                        <th style={{ padding: '4px 6px', textAlign: 'right', fontWeight: 600 }}>%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewStats.sampleRows.length === 0 ? (
                        <tr>
                          <td
                            colSpan={6 + (showInlineMonthCols ? Math.min(3, previewStats.monthSummaries.length) : 0)}
                            style={{ padding: '12px', textAlign: 'center', color: '#687E77' }}
                          >
                            Belum ada pendidik dipilih
                          </td>
                        </tr>
                      ) : (
                        previewStats.sampleRows.map((row, idx) => (
                          <tr
                            key={row.teacher.id}
                            style={{
                              background: idx % 2 === 0 ? '#FFFFFF' : '#F8FAF8',
                              borderTop: '0.5px solid #E5ECE8',
                            }}
                          >
                            <td
                              style={{
                                padding: '4px 6px',
                                color: '#0F201C',
                                fontWeight: 600,
                                maxWidth: '115px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {row.teacher.name}
                            </td>
                            {showInlineMonthCols &&
                              previewStats.monthSummaries.slice(0, 3).map((mb) => {
                                const bucket = row.monthlyBreakdown[mb.monthYear];
                                return (
                                  <td
                                    key={`td-${row.teacher.id}-${mb.monthYear}`}
                                    className="s5-tnum"
                                    style={{
                                      padding: '4px 4px',
                                      textAlign: 'center',
                                      color: bucket?.hasData ? '#124037' : '#8A9B95',
                                      fontWeight: bucket?.hasData ? 600 : 400,
                                    }}
                                  >
                                    {bucket?.hasData ? `${bucket.rate}%` : '—'}
                                  </td>
                                );
                              })}
                            <td className="s5-tnum" style={{ padding: '4px 4px', textAlign: 'center', fontWeight: 600 }}>
                              {row.hadir}
                            </td>
                            <td className="s5-tnum" style={{ padding: '4px 4px', textAlign: 'center' }}>
                              {row.sakit}
                            </td>
                            <td className="s5-tnum" style={{ padding: '4px 4px', textAlign: 'center' }}>
                              {row.izin}
                            </td>
                            <td
                              className="s5-tnum"
                              style={{
                                padding: '4px 4px',
                                textAlign: 'center',
                                fontWeight: row.alpa > 0 ? 700 : 400,
                                color: row.alpa > 0 ? '#A63A2E' : '#2F443E',
                              }}
                            >
                              {row.alpa}
                            </td>
                            <td
                              className="s5-tnum"
                              style={{
                                padding: '4px 6px',
                                textAlign: 'right',
                                fontWeight: 700,
                                color: !row.hasData
                                  ? '#687E77'
                                  : row.rate >= 90
                                  ? '#1B5E43'
                                  : row.rate >= 75
                                  ? '#9C6F28'
                                  : '#A63A2E',
                              }}
                            >
                              {row.hasData ? `${row.rate}%` : '—'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {(previewStats.teacherCount > 5 || showAppendixMonthMatrix) && (
                    <div
                      className="s5-tnum"
                      style={{
                        padding: '3px 8px',
                        fontSize: '9.5px',
                        color: '#47615A',
                        background: '#F4F7F5',
                        borderTop: '0.5px solid #E5ECE8',
                        textAlign: 'center',
                      }}
                    >
                      {previewStats.teacherCount > 5 ? `+${previewStats.teacherCount - 5} pendidik lainnya` : ''}
                      {previewStats.teacherCount > 5 && showAppendixMonthMatrix ? ' · ' : ''}
                      {showAppendixMonthMatrix
                        ? `Hal. 2: Matriks Rincian ${previewStats.monthCount} Bulan`
                        : ''}
                    </div>
                  )}
                </div>

                {/* Live Dual Signature Block Preview */}
                {includeSignature && (
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
                      <div>Mengetahui / Memeriksa,</div>
                      <div style={{ fontWeight: 600, color: '#0F201C' }}>{officerTitle}</div>
                      <div style={{ height: '14px' }} />
                      <div style={{ fontWeight: 700, color: '#0B2923', textDecoration: 'underline' }}>
                        {officerName}
                      </div>
                      <div className="s5-tnum">
                        {formatCleanNip(officerNip) ? `NIP. ${formatCleanNip(officerNip)}` : 'NIP. —'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'left' }}>
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
                )}

                {includePrintMeta && (
                  <div
                    className="s5-tnum"
                    style={{
                      marginTop: '9px',
                      paddingTop: '5px',
                      borderTop: '0.5px solid #DCE5E0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '9px',
                      color: '#687E77',
                    }}
                  >
                    <span>
                      Dicetak di {signerCity || 'Madrasah'} · {activePeriodLabel}
                    </span>
                    <span>
                      Halaman 1 dari {showAppendixMonthMatrix ? 2 : 1}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Actions */}
        <div className="s5-studio-footer">
          <span className="s5-tnum" style={{ fontSize: '12px', color: '#526861' }}>
            Format: <strong>{paperLabel}</strong> ({paperDimensionText}) · {activePeriodLabel}
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
              disabled={isExporting || selectedTeacherIds.length === 0}
              style={{ height: '38px', padding: '0 18px', fontSize: '12.5px' }}
            >
              <Download size={15} />
              {isExporting
                ? 'Memproses PDF…'
                : `Unduh Dokumen PDF Resmi (${paperSize.toUpperCase()})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
