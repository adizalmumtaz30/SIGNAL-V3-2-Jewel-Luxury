import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  Eye,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState, GeneratorStatus, ScheduleCandidate } from '../domain/types';
import { teachingPeriodsForDay } from '../domain/time';
import {
  buildScheduleFingerprint,
  scoreScheduleDetailed,
  validateMasterData,
} from '../domain/validator';
import { getActionLabelForIssue, getTargetScreenForIssue } from '../domain/validationLabels';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { KpiAnimatedNumber, KpiMotionCard, MotionModalDialog } from '../components/KpiMotion';
import { Button, Card, EmptyState, StatusPill, type ScreenId } from '../components/ScreenPrimitives';

export function GeneratorScreen({
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
  const [showPreflightDetails, setShowPreflightDetails] = useState<boolean>(false);
  const [previewCandidate, setPreviewCandidate] = useState<ScheduleCandidate | null>(null);

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
      <EditorialPageHeader
        kicker="PENYUSUNAN OTOMATIS"
        title="Penyusun Jadwal Otomatis"
        subtitle="Susun jadwal mingguan otomatis bebas bentrok jam."
        meta={
          <>
            <span>{allJP} JP terdaftar</span>
            <span className="s5-editorial-meta-sep" aria-hidden="true">·</span>
            <span>{activeClassesCount} rombel aktif</span>
          </>
        }
        ruleInfo={{
          title: 'Prinsip Penyusunan Jadwal',
          items: [
            `Menempatkan ${allJP} JP kebutuhan ke ${totalSlotsCapacity} slot KBM tersedia.`,
            'Mematuhi ketersediaan hari guru dan batas maksimum jam mengajar mingguan.',
            'Mencegah bentrok guru dan bentrok rombel pada jam pelajaran yang sama.',
          ],
        }}
        secondaryAction={
          isGenerating
            ? {
                label: 'Batalkan Proses',
                icon: <X size={15} />,
                onClick: onCancel,
              }
            : undefined
        }
        primaryAction={{
          label: isGenerating ? 'Sedang Menyusun…' : 'Susun Jadwal Otomatis',
          icon: <WandSparkles size={15} />,
          onClick: triggerGenerateWithOptions,
          disabled: isGenerating || preflightErrors.length > 0,
        }}
      />

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

      <div className="surface-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '9px',
                display: 'grid',
                placeItems: 'center',
                background: preflightErrors.length > 0 ? '#FDE8E5' : preflightWarnings.length > 0 ? '#FEF3C7' : '#E1F4EA',
                color: preflightErrors.length > 0 ? '#9E2A21' : preflightWarnings.length > 0 ? '#92400E' : '#166534',
              }}
            >
              {preflightErrors.length > 0 || preflightWarnings.length > 0 ? <AlertTriangle size={16} /> : <ShieldCheck size={16} />}
            </div>
            <div>
              <strong style={{ fontSize: '13.5px', color: '#0B2923', display: 'block' }}>
                {preflightErrors.length > 0
                  ? `Prasyarat Belum Lengkap (${preflightErrors.length} Masalah Kritis${preflightWarnings.length ? ` · ${preflightWarnings.length} Catatan` : ''})`
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

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {preflightIssues.length > 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowPreflightDetails((v) => !v)}
              >
                {showPreflightDetails ? 'Tutup Rincian' : `Lihat Semua Rincian (${preflightIssues.length})`}
                <ChevronDown
                  size={13}
                  style={{
                    transform: showPreflightDetails ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }}
                />
              </Button>
            )}
            {preflightErrors.length > 0 && onNavigate && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate(getTargetScreenForIssue(preflightErrors[0]))}
              >
                {getActionLabelForIssue(preflightErrors[0])} →
              </Button>
            )}
          </div>
        </div>

        {showPreflightDetails && preflightIssues.length > 0 && (
          <div className="s5-preflight-checklist">
            {preflightIssues.map((issue) => {
              const isErr = issue.severity === 'error';
              return (
                <div key={issue.id} className={`s5-preflight-row ${isErr ? 'is-error' : 'is-warning'}`}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', flex: 1, minWidth: '220px' }}>
                    {isErr ? <XCircle size={15} style={{ marginTop: '2px', flexShrink: 0 }} /> : <AlertTriangle size={15} style={{ marginTop: '2px', flexShrink: 0 }} />}
                    <div>
                      <strong style={{ display: 'block', fontSize: '12.5px' }}>{issue.title}</strong>
                      <span>{issue.message}</span>
                    </div>
                  </div>
                  {onNavigate && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onNavigate(getTargetScreenForIssue(issue))}
                    >
                      {getActionLabelForIssue(issue)} →
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}

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
                  width: '140px',
                  height: '38px',
                  padding: '0 12px',
                  borderRadius: '10px',
                  border: '1px solid #C9D7D0',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  color: '#163830',
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

        <Card
          eyebrow="RIWAYAT KANDIDAT"
          title="Kandidat Tersimpan"
          action={
            state.candidates.length > 0 ? (
              <span style={{ fontSize: '11.5px', color: '#526861', fontWeight: 500 }}>
                Skor dihitung dari bonus blok 2 JP dikurangi penalti tumpuk &amp; jam kosong
              </span>
            ) : undefined
          }
        >
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
                    const createdLabel = (() => {
                      const d = new Date(cand.createdAt);
                      return Number.isNaN(d.getTime())
                        ? ''
                        : d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    })();
                    return (
                      <tr key={cand.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <strong>{cand.label}</strong>
                            {isActiveDraft && <StatusPill status="success">Aktif di Draf</StatusPill>}
                          </div>
                          <small className="s5-tnum" style={{ display: 'block', color: '#526861', marginTop: '2px' }}>
                            {cand.entries.length} slot · {cand.searchNodes.toLocaleString('id-ID')} langkah · Seed #{cand.seed}
                            {createdLabel ? ` · ${createdLabel}` : ''}
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
                              className="s5-dock-btn"
                              onClick={() => setPreviewCandidate(cand)}
                              title="Lihat rincian skor & ringkasan kandidat sebelum menerapkan"
                            >
                              <Eye size={13} />
                              <span>Pratinjau</span>
                            </button>
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

      {/* Candidate Preview Modal before overwriting Draft */}
      {previewCandidate && (() => {
        const bd = previewCandidate.scoreBreakdown ?? scoreScheduleDetailed(state, previewCandidate.entries);
        const isCurrentActive =
          previewCandidate.entries.length > 0 &&
          buildScheduleFingerprint(previewCandidate.entries) === currentDraftFingerprint;
        const activeClasses = state.classes.filter((c) => c.isActive);
        return (
          <MotionModalDialog
            ariaLabel={`Pratinjau ${previewCandidate.label}`}
            panelStyle={{ maxWidth: '640px', width: '92vw' }}
            onBackdropMouseDown={(e) => e.target === e.currentTarget && setPreviewCandidate(null)}
          >
            <div className="modal-head" style={{ borderBottom: '1px solid #e7e5da', paddingBottom: '14px' }}>
              <div className="modal-title-icon" style={{ background: '#e9f5ee' }}>
                <Eye size={20} color="#164D42" />
              </div>
              <div>
                <h2 style={{ fontSize: '17px', margin: 0, color: '#0B2923' }}>Pratinjau {previewCandidate.label}</h2>
                <p className="s5-tnum" style={{ margin: '2px 0 0', fontSize: '12px', color: '#526861' }}>
                  Seed #{previewCandidate.seed} · {previewCandidate.entries.length} penempatan · {previewCandidate.searchNodes.toLocaleString('id-ID')} kombinasi diperiksa
                </p>
              </div>
              <button type="button" className="icon-button" onClick={() => setPreviewCandidate(null)} aria-label="Tutup pratinjau">
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))', gap: '10px' }}>
                <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #DCE6E0', background: '#F8FAF7' }}>
                  <span style={{ fontSize: '11px', color: '#526861', display: 'block', fontWeight: 600 }}>Skor Total</span>
                  <strong className="s5-tnum" style={{ fontSize: '20px', color: '#0B2923' }}>{previewCandidate.score}</strong>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #B4DEC9', background: '#F6FBF8' }}>
                  <span style={{ fontSize: '11px', color: '#166534', display: 'block', fontWeight: 600 }}>Bonus Blok 2 JP</span>
                  <strong className="s5-tnum" style={{ fontSize: '20px', color: '#166534' }}>+{bd.doubleBlockBonus}</strong>
                  <small style={{ fontSize: '11px', color: '#526861', display: 'block' }}>{bd.doubleBlockCount} blok berurutan</small>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #EAD39C', background: '#FFFDF5' }}>
                  <span style={{ fontSize: '11px', color: '#92400E', display: 'block', fontWeight: 600 }}>Penalti Tumpuk</span>
                  <strong className="s5-tnum" style={{ fontSize: '20px', color: '#92400E' }}>-{bd.sameDayPenalty}</strong>
                  <small style={{ fontSize: '11px', color: '#78350F', display: 'block' }}>Mapel sama terpisah</small>
                </div>
                <div style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #F3C4BE', background: '#FFF8F7' }}>
                  <span style={{ fontSize: '11px', color: '#9E2A21', display: 'block', fontWeight: 600 }}>Penalti Kosong</span>
                  <strong className="s5-tnum" style={{ fontSize: '20px', color: '#9E2A21' }}>-{bd.freeSlotPenalty}</strong>
                  <small style={{ fontSize: '11px', color: '#7E1E16', display: 'block' }}>Celah kosong kelas</small>
                </div>
              </div>

              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0B2923', marginBottom: '8px' }}>
                  Ringkasan Cakupan Per Rombel ({activeClasses.length} kelas)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 175px), 1fr))', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                  {activeClasses.map((cls) => {
                    const placed = previewCandidate.entries.filter((e) => e.classId === cls.id).length;
                    const target = state.requirements.filter((r) => r.classId === cls.id).reduce((s, r) => s + r.requiredJP, 0);
                    const isExact = placed === target;
                    return (
                      <div
                        key={cls.id}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: `1px solid ${isExact ? '#B4DEC9' : '#EAD39C'}`,
                          background: isExact ? '#F6FBF8' : '#FFFDF5',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '12px',
                        }}
                      >
                        <strong style={{ color: '#0B2923' }}>Kelas {cls.name}</strong>
                        <span className={`s5-inline-badge ${isExact ? 'tone-ok' : 'tone-warn'}`}>
                          {placed}/{target} JP
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="modal-actions" style={{ padding: '14px 20px', background: '#faf8f2', borderRadius: '0 0 14px 14px' }}>
              <Button variant="secondary" onClick={() => setPreviewCandidate(null)}>
                Tutup
              </Button>
              <Button
                disabled={isCurrentActive}
                onClick={() => {
                  const id = previewCandidate.id;
                  setPreviewCandidate(null);
                  onChoose(id);
                }}
              >
                {isCurrentActive ? 'Sudah Aktif di Draf' : 'Terapkan ke Draf & Buka Jadwal →'}
              </Button>
            </div>
          </MotionModalDialog>
        );
      })()}
    </>
  );
}
