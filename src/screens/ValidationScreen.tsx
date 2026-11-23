import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState, Day, ValidationIssue } from '../domain/types';
import type { validateSchedule } from '../domain/validator';
import {
  formatValidationCategoryLabel,
  getActionLabelForIssue,
  getTargetScreenForIssue,
  getValidationCategoryGroup,
} from '../domain/validationLabels';
import { AiConflictHelper } from '../components/AiConflictHelper';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { KpiAnimatedNumber, KpiMotionCard, MotionStaggerItem } from '../components/KpiMotion';
import { Button, type ScreenId } from '../components/ScreenPrimitives';

export function ValidationScreen({
  state,
  report,
  masterIssues,
  expandedIssue,
  setExpandedIssue,
  onNavigate,
  onNavigateToSlot,
  onValidate,
  onOpenPdfModal,
  onExportCSV,
}: {
  state: AppState;
  report: ReturnType<typeof validateSchedule>;
  masterIssues: ValidationIssue[];
  expandedIssue: string | null;
  setExpandedIssue: (id: string | null) => void;
  onNavigate?: (screen: ScreenId) => void;
  onNavigateToSlot?: (classId: string, day: Day, jpNo: number) => void;
  onValidate: () => void;
  onOpenPdfModal?: () => void;
  onExportCSV?: () => void;
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
      <EditorialPageHeader
        kicker="KEPATUHAN ATURAN JADWAL"
        title="Validasi & Konflik Jadwal"
        subtitle="Periksa kepatuhan aturan sebelum jadwal diterbitkan."
        ruleInfo={{
          title: 'Aturan Validasi Jadwal',
          items: [
            'Bentrok wajib mencakup jadwal ganda guru/kelas, slot non-KBM, dan kuota JP belum tepat.',
            'Jadwal resmi baru dapat diterbitkan bila bentrok wajib berjumlah 0.',
            'Draf jadwal tetap dapat dicetak ke PDF/CSV untuk peninjauan internal.',
          ],
        }}
        overflowLabel={onExportCSV || onOpenPdfModal ? 'Ekspor' : undefined}
        overflowIcon={<Download size={15} />}
        overflowActions={[
          ...(onOpenPdfModal
            ? [
                {
                  id: 'val-pdf',
                  label: 'Cetak & Ekspor PDF',
                  icon: <FileText size={15} />,
                  onClick: onOpenPdfModal,
                },
              ]
            : []),
          ...(onExportCSV
            ? [
                {
                  id: 'val-csv',
                  label: 'Ekspor CSV',
                  icon: <FileSpreadsheet size={15} />,
                  onClick: onExportCSV,
                },
              ]
            : []),
        ]}
        primaryAction={{
          label: 'Uji Ulang Jadwal',
          icon: <RefreshCw size={15} />,
          onClick: onValidate,
        }}
      />

      <div className={`validation-banner ${hardErrors.length ? 'validation-banner-warning' : 'validation-banner-good'}`}>
        <div className="validation-banner-mark">
          {hardErrors.length ? <AlertTriangle size={24} /> : <ShieldCheck size={24} />}
        </div>
        <div>
          <h2>{hardErrors.length ? 'Terdapat Pelanggaran Aturan Wajib' : 'Jadwal Memenuhi Seluruh Aturan Wajib'}</h2>
          <p>
            {hardErrors.length
              ? 'Selesaikan bentrok wajib sebelum menerbitkan versi resmi.'
              : 'Bebas konflik guru, kelas, dan alokasi.'}
          </p>
        </div>
        <div className="validation-banner-count">
          <strong className="s5-tnum">{hardErrors.length}</strong>
          <span>BENTROK WAJIB</span>
        </div>
      </div>

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

      {state.settings.geminiEnabled && (
        <AiConflictHelper
          issues={combined}
          geminiEnabledInSettings={state.settings.geminiEnabled}
          onNavigateToScreen={onNavigate as ((screen: string) => void) | undefined}
        />
      )}

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
