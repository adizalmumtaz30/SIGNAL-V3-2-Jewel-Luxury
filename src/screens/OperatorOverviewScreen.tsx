import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  FileCheck2,
  FileText,
  GraduationCap,
  LockKeyhole,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  WandSparkles,
} from 'lucide-react';
import type { AppState, ValidationIssue } from '../domain/types';
import type { validateSchedule } from '../domain/validator';
import type { PersuratanLaunchRequest } from '../domain/persuratan/types';
import { getOfficialScheduleBasisStatus } from '../domain/persuratan/assignments/teacherIntegration';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { KpiAnimatedNumber, KpiMotionCard } from '../components/KpiMotion';
import { Button, type ScreenId } from '../components/ScreenPrimitives';

export function OperatorOverviewScreen({
  state,
  report,
  masterIssues,
  readiness,
  occupiedSlots,
  totalWeeklyCapacity,
  onNavigate,
  onGenerate,
  isGenerating,
  onOpenPdfModal,
  onOpenValidationModal,
  onSelectClass,
  onLaunchPersuratan,
  onLaunchTeachingSk,
}: {
  state: AppState;
  report: ReturnType<typeof validateSchedule>;
  masterIssues: ValidationIssue[];
  readiness: number;
  occupiedSlots: number;
  totalWeeklyCapacity: number;
  onNavigate: (screen: ScreenId) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onOpenPdfModal: () => void;
  onOpenValidationModal: () => void;
  onSelectClass?: (classId: string) => void;
  onLaunchPersuratan?: (request: PersuratanLaunchRequest) => void;
  onLaunchTeachingSk?: () => void;
}) {
  const activeClasses = state.classes.filter((c) => c.isActive);
  const activeTeachers = state.teachers.filter((t) => t.isActive);
  const classCount = activeClasses.length;
  const teacherCount = activeTeachers.length;
  const totalErrors = masterIssues.filter((i) => i.severity === 'error').length + report.hardErrorCount;
  const capacityPercent = totalWeeklyCapacity > 0 ? Math.round((occupiedSlots / totalWeeklyCapacity) * 100) : 0;

  const missingReqClassCount = activeClasses.filter(
    (c) => !state.requirements.some((r) => r.classId === c.id),
  ).length;
  const allocationStepDone = classCount > 0 && missingReqClassCount === 0;
  const validationStepDone = totalErrors === 0 && occupiedSlots > 0;
  const scheduleEntries = state.draft ?? state.activeSchedule ?? [];
  const publishedReady = !state.draft && !!state.activeSchedule?.length;
  const avgTeacherJP = teacherCount > 0 ? (occupiedSlots / teacherCount).toFixed(1) : '0';

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const todayPresentCount = (state.attendance ?? []).filter(
    (a) => a.date === todayIso && a.status === 'HADIR',
  ).length;
  const todayRecordedCount = (state.attendance ?? []).filter((a) => a.date === todayIso).length;

  const documents = state.documents ?? [];
  const draftDocsCount = documents.filter((d) => d.status === 'DRAFT' || d.status === 'IN_REVIEW').length;
  const finalDocsCount = documents.filter((d) => d.status === 'FINAL' || d.status === 'REVISED').length;
  const archivedDocsCount = documents.filter((d) => d.status === 'ARCHIVED').length;
  const customTemplatesCount = (state.customTemplates ?? []).filter((t) => t.status !== 'ARCHIVED').length;
  const attachmentsCount = (state.documentAttachments ?? []).length;
  const skBasis = getOfficialScheduleBasisStatus(state);
  const recentDocuments = [...documents]
    .sort((a, b) => (b.updatedAt || b.documentDate || '').localeCompare(a.updatedAt || a.documentDate || ''))
    .slice(0, 3);

  const openPersuratanView = (request: PersuratanLaunchRequest) => {
    if (onLaunchPersuratan) {
      onLaunchPersuratan(request);
    } else {
      onNavigate('persuratan');
    }
  };

  const openClassEditor = (classId: string) => {
    if (onSelectClass) onSelectClass(classId);
    else onNavigate('schedule');
  };

  const overviewHeroTitle =
    report.valid && occupiedSlots > 0
      ? 'Jadwal Siap Diterbitkan'
      : totalErrors > 0
      ? `${totalErrors} Bentrok Perlu Diselesaikan`
      : 'Lengkapi JP & Susun Jadwal';

  const overviewHeroSubtitle =
    report.valid && occupiedSlots > 0
      ? 'Seluruh aturan terpenuhi dan bebas bentrok.'
      : totalErrors > 0
      ? 'Perbaiki bentrok guru atau kelas sebelum terbit.'
      : 'Tetapkan kebutuhan JP lalu susun jadwal.';

  return (
    <div className="overview-page-wrapper">
      <EditorialPageHeader
        variant="featured"
        kicker={`SEMESTER ${state.settings.semester.toUpperCase()} · ${state.settings.academicYear}`}
        title={overviewHeroTitle}
        subtitle={overviewHeroSubtitle}
        primaryAction={
          totalErrors > 0
            ? {
                label: 'Periksa Konflik',
                icon: <AlertTriangle size={15} />,
                onClick: () => onNavigate('validation'),
              }
            : occupiedSlots === 0
            ? {
                label: isGenerating ? 'Menyusun…' : 'Susun Jadwal',
                icon: <WandSparkles size={15} />,
                onClick: onGenerate,
                disabled: isGenerating,
              }
            : {
                label: 'Buka Matriks Jadwal',
                icon: <CalendarDays size={15} />,
                onClick: () => onNavigate('schedule'),
              }
        }
        secondaryAction={{
          label: 'Cetak PDF',
          icon: <FileText size={15} />,
          onClick: onOpenPdfModal,
        }}
        rightSlot={
          <div className="s5-header-readiness-box">
            <div className="s5-header-readiness-ring">
              <svg width="52" height="52" className="s5-dial-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" stroke="#CCD8D2" strokeWidth="10" fill="transparent" opacity="0.28" />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke={readiness >= 90 ? '#E5C378' : readiness >= 70 ? '#529E72' : '#E05D52'}
                  strokeWidth="10"
                  fill="transparent"
                  strokeDasharray={251.2}
                  strokeDashoffset={251.2 - (Math.max(0, Math.min(100, readiness)) / 100) * 251.2}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.16, 1, 0.3, 1)' }}
                />
              </svg>
              <span className="s5-header-readiness-pct">{readiness}%</span>
            </div>
            <div className="s5-header-readiness-copy">
              <small>Kesiapan Jadwal</small>
              <strong>{totalErrors === 0 ? 'Lolos Aturan' : `${totalErrors} Konflik`}</strong>
              <span>{occupiedSlots} / {totalWeeklyCapacity} JP · {classCount} rombel</span>
            </div>
          </div>
        }
      />

      <div className="stat-grid">
        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-teal"
          index={0}
          onClick={() => onNavigate('master')}
        >
          <div className="stat-top">
            <span>Rombel Aktif</span>
            <div className="stat-icon" aria-hidden="true">
              <GraduationCap size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={classCount} />
            </strong>
            <span className="stat-unit">Rombel</span>
          </div>
          <div className="stat-sub">Seluruh kelas terdaftar</div>
        </KpiMotionCard>

        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-sand"
          index={1}
          onClick={() => onNavigate('schedule')}
        >
          <div className="stat-top">
            <span>Alokasi KBM</span>
            <div className="stat-icon" aria-hidden="true">
              <BookOpen size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={capacityPercent} suffix="%" />
            </strong>
            <span className="stat-unit">terisi</span>
          </div>
          <div className="stat-sub">{occupiedSlots} / {totalWeeklyCapacity} JP terjadwal</div>
        </KpiMotionCard>

        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-blue"
          index={2}
          onClick={() => onOpenValidationModal()}
        >
          <div className="stat-top">
            <span>Konflik Keras</span>
            <div className="stat-icon" aria-hidden="true">
              {totalErrors > 0 ? <AlertTriangle size={17} /> : <ShieldCheck size={17} />}
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={totalErrors} />
            </strong>
            <span className="stat-unit">Temuan</span>
          </div>
          <div className="stat-sub">{totalErrors === 0 ? 'Bebas bentrok aturan wajib' : 'Klik untuk tinjau bentrok'}</div>
        </KpiMotionCard>

        <KpiMotionCard
          as="button"
          type="button"
          className="stat-card stat-card-interactive tone-rose"
          index={3}
          onClick={() => onNavigate('workload')}
        >
          <div className="stat-top">
            <span>Dewan Guru Aktif</span>
            <div className="stat-icon" aria-hidden="true">
              <Users size={17} />
            </div>
          </div>
          <div className="stat-value-row">
            <strong>
              <KpiAnimatedNumber value={teacherCount} />
            </strong>
            <span className="stat-unit">Guru</span>
          </div>
          <div className="stat-sub">Rata-rata {avgTeacherJP} JP / guru</div>
        </KpiMotionCard>
      </div>

      <div className="s5-overview-split">
        <div className="panel s5-overview-rombel-panel">
          <div>
            <div className="panel-head" style={{ marginBottom: '14px' }}>
              <div>
                <div className="s5-panel-kicker">PROGRESS ROMBEL</div>
                <div className="panel-title">Kesiapan Matriks per Kelas</div>
              </div>
              <Button variant="secondary" size="sm" icon={CalendarDays} onClick={() => onNavigate('schedule')}>
                Matriks Lengkap
              </Button>
            </div>

            <div className="s5-rombel-table-wrap">
              <table className="s5-rombel-table">
                <thead>
                  <tr>
                    <th style={{ width: '44px' }}>#</th>
                    <th>KELAS &amp; TINGKAT</th>
                    <th>ALOKASI JP</th>
                    <th>STATUS</th>
                    <th style={{ textAlign: 'right' }}>AKSES LANGSUNG</th>
                  </tr>
                </thead>
                <tbody>
                  {activeClasses.map((cls, idx) => {
                    const reqs = state.requirements.filter((r) => r.classId === cls.id);
                    const totalReq = reqs.reduce((sum, r) => sum + r.requiredJP, 0);
                    const classEntries = scheduleEntries.filter((e) => e.classId === cls.id);
                    const fillPct = totalReq > 0 ? Math.min(100, Math.round((classEntries.length / totalReq) * 100)) : 0;
                    const isComplete = totalReq > 0 && classEntries.length >= totalReq;

                    return (
                      <tr
                        key={cls.id}
                        onClick={() => openClassEditor(cls.id)}
                        title={`Klik untuk membuka jadwal Kelas ${cls.name}`}
                      >
                        <td className="s5-tnum" style={{ color: 'var(--s5-ink-tertiary)', fontWeight: 600 }}>
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td>
                          <div className="s5-rombel-name-cell">
                            <strong>Kelas {cls.name}</strong>
                            <span className="s5-rombel-level-meta">· Tingkat {cls.level}</span>
                          </div>
                        </td>
                        <td>
                          <div className="s5-jp-progress-cell">
                            <div className="s5-jp-meter-track" aria-hidden="true">
                              <div
                                className={`s5-jp-meter-fill ${isComplete ? 'is-done' : 'is-partial'}`}
                                style={{ width: `${fillPct}%` }}
                              />
                            </div>
                            <span className="s5-tnum" style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--s5-ink-primary)', whiteSpace: 'nowrap' }}>
                              {classEntries.length} / {totalReq || '—'} JP
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className={`s5-status-inline ${isComplete ? 'is-good' : 'is-warn'}`}>
                            <span className="s5-status-dot-static" aria-hidden="true" />
                            {isComplete ? 'Lengkap' : totalReq === 0 ? 'Belum Dialokasi' : 'Perlu Cek'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <span className="s5-row-launch-link">
                            Buka Jadwal <ArrowRight size={13} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="s5-pulse-footer">
            <button type="button" className="s5-pulse-item" onClick={() => onNavigate('attendance')}>
              <div>
                <small>Presensi Guru Hari Ini</small>
                <strong className="s5-tnum">
                  {todayRecordedCount > 0 ? `${todayPresentCount} / ${teacherCount} Hadir` : 'Belum dicatat hari ini'}
                </strong>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--s5-ink-tertiary)', flexShrink: 0 }} />
            </button>

            <button type="button" className="s5-pulse-item" onClick={() => onNavigate('workload')}>
              <div>
                <small>Distribusi Beban Guru</small>
                <strong className="s5-tnum">{avgTeacherJP} JP rata-rata</strong>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--s5-ink-tertiary)', flexShrink: 0 }} />
            </button>

            <button type="button" className="s5-pulse-item" onClick={() => onNavigate('history')}>
              <div>
                <small>Riwayat &amp; Snapshot</small>
                <strong className="s5-tnum">{state.history.length} versi tersimpan</strong>
              </div>
              <ArrowRight size={14} style={{ color: 'var(--s5-ink-tertiary)', flexShrink: 0 }} />
            </button>
          </div>
        </div>

        <div className="panel dark s5-priority-panel">
          <div>
            <div className="panel-head" style={{ marginBottom: '14px' }}>
              <div>
                <div className="s5-panel-kicker">PANDUAN OPERASIONAL</div>
                <div className="panel-title">Langkah Berikutnya</div>
              </div>
              <span className="s5-priority-badge">3 TAHAP</span>
            </div>

            <div className="s5-priority-list">
              <button type="button" className="s5-priority-step" onClick={() => onNavigate('requirements')}>
                <span className={`s5-priority-num ${allocationStepDone ? 'is-done' : 'is-pending'}`}>
                  {allocationStepDone ? <Check size={14} /> : '01'}
                </span>
                <span className="s5-priority-copy">
                  <strong>Lengkapi Alokasi JP</strong>
                  <small>
                    {missingReqClassCount > 0
                      ? `${missingReqClassCount} rombel belum terisi target JP`
                      : `${classCount} rombel aktif sudah lengkap`}
                  </small>
                </span>
                <ChevronRight size={15} style={{ color: 'rgba(229, 195, 120, 0.75)', flexShrink: 0 }} />
              </button>

              <button type="button" className="s5-priority-step" onClick={() => onNavigate('validation')}>
                <span className={`s5-priority-num ${validationStepDone ? 'is-done' : 'is-pending'}`}>
                  {validationStepDone ? <Check size={14} /> : '02'}
                </span>
                <span className="s5-priority-copy">
                  <strong>Audit Validasi Aturan</strong>
                  <small>
                    {totalErrors === 0
                      ? 'Bebas bentrok aturan wajib'
                      : `${totalErrors} bentrok wajib perlu diselesaikan`}
                  </small>
                </span>
                <ChevronRight size={15} style={{ color: 'rgba(229, 195, 120, 0.75)', flexShrink: 0 }} />
              </button>

              <button type="button" className="s5-priority-step" onClick={() => (publishedReady ? onOpenPdfModal() : onNavigate('schedule'))}>
                <span className={`s5-priority-num ${publishedReady ? 'is-done' : 'is-pending'}`}>
                  {publishedReady ? <Check size={14} /> : '03'}
                </span>
                <span className="s5-priority-copy">
                  <strong>Terbitkan &amp; Cetak Resmi</strong>
                  <small>
                    {publishedReady ? 'Jadwal aktif siap dicetak ke PDF' : 'Terbitkan draf lalu ekspor PDF resmi'}
                  </small>
                </span>
                <ChevronRight size={15} style={{ color: 'rgba(229, 195, 120, 0.75)', flexShrink: 0 }} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <section
        className="panel s5-admin-persuratan-panel"
        aria-label="Ringkasan Persuratan dan Arsip Madrasah"
      >
        <div className="s5-admin-persuratan-head">
          <div>
            <div className="s5-panel-kicker">ADMINISTRASI &amp; PERSURATAN MADRASAH</div>
            <div className="panel-title">Ringkasan Persuratan &amp; Arsip</div>
          </div>
          <div className="s5-admin-persuratan-actions">
            <button
              type="button"
              className="text-link"
              onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
            >
              Pusat Arsip <ArrowRight size={13} />
            </button>
            <Button
              variant="secondary"
              size="sm"
              icon={SlidersHorizontal}
              onClick={() => openPersuratanView({ view: 'template-manager', nonce: Date.now() })}
            >
              Kelola Template
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Plus}
              onClick={() => openPersuratanView({ view: 'templates', nonce: Date.now() })}
            >
              Buat Surat Baru
            </Button>
          </div>
        </div>

        <div className="s5-editorial-summary-bar" role="region" aria-label="Statistik Persuratan Madrasah">
          <button
            type="button"
            className="s5-editorial-stat"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <span className="s5-editorial-stat-label">Draft Aktif</span>
            <div className="s5-editorial-stat-num-row">
              <strong className="s5-editorial-stat-num">{draftDocsCount}</strong>
              <span className="s5-editorial-stat-unit">draf</span>
            </div>
            <span className="s5-editorial-stat-hint">
              {draftDocsCount > 0 ? 'Siap dilanjutkan di Editor Naskah' : 'Belum ada draf berjalan'}
            </span>
          </button>

          <button
            type="button"
            className="s5-editorial-stat"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <span className="s5-editorial-stat-label">Dokumen Final</span>
            <div className="s5-editorial-stat-num-row">
              <strong className="s5-editorial-stat-num">{finalDocsCount}</strong>
              <span className="s5-editorial-stat-unit">naskah</span>
            </div>
            <span className="s5-editorial-stat-hint">
              {finalDocsCount > 0 ? 'Bernomor resmi & salinan terkunci' : 'Belum ada dokumen disahkan'}
            </span>
          </button>

          <button
            type="button"
            className="s5-editorial-stat"
            onClick={() => openPersuratanView({ view: 'center', nonce: Date.now() })}
          >
            <span className="s5-editorial-stat-label">Arsip &amp; Lampiran</span>
            <div className="s5-editorial-stat-num-row">
              <strong className="s5-editorial-stat-num">{archivedDocsCount}</strong>
              <span className="s5-editorial-stat-unit">arsip</span>
            </div>
            <span className="s5-editorial-stat-hint">
              {attachmentsCount} lampiran terverifikasi tersimpan
            </span>
          </button>

          <button
            type="button"
            className="s5-editorial-stat"
            onClick={() => openPersuratanView({ view: 'template-manager', nonce: Date.now() })}
          >
            <span className="s5-editorial-stat-label">Template Madrasah</span>
            <div className="s5-editorial-stat-num-row">
              <strong className="s5-editorial-stat-num">{customTemplatesCount}</strong>
              <span className="s5-editorial-stat-unit">kustom</span>
            </div>
            <span className="s5-editorial-stat-hint">+ 30 template resmi bawaan SAKALA</span>
          </button>
        </div>

        <div className={`s5-admin-sk-strip ${skBasis.allowed ? '' : 'is-locked'}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            {skBasis.allowed ? (
              <Award size={18} color="#124037" aria-hidden="true" style={{ flexShrink: 0 }} />
            ) : (
              <LockKeyhole size={18} color="#8E7035" aria-hidden="true" style={{ flexShrink: 0 }} />
            )}
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0B2923' }}>
                SK Pembagian Tugas Mengajar
              </div>
              <div style={{ fontSize: '12px', color: '#4B635D' }}>
                {skBasis.allowed
                  ? `Sumber resmi aktif: ${skBasis.selectedVersion?.version.label ?? skBasis.selectedVersion?.version.id} · ${skBasis.validVersionsCount} versi jadwal terverifikasi.`
                  : skBasis.blockedReason ?? 'Terbitkan dan verifikasi jadwal terlebih dahulu agar SK Mengajar bersumber dari data resmi.'}
              </div>
            </div>
          </div>
          {skBasis.allowed ? (
            <Button
              variant="secondary"
              size="sm"
              icon={FileCheck2}
              onClick={() => {
                if (onLaunchTeachingSk) {
                  onLaunchTeachingSk();
                } else {
                  openPersuratanView({ view: 'templates', nonce: Date.now() });
                }
              }}
            >
              Buat SK Mengajar
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={CalendarDays}
              onClick={() => onNavigate('schedule')}
            >
              Terbitkan Jadwal
            </Button>
          )}
        </div>

        {recentDocuments.length > 0 ? (
          <div className="s5-admin-recent-list">
            {recentDocuments.map((doc) => {
              const isDraft = doc.status === 'DRAFT' && Boolean(doc.intakeDraftId);
              return (
                <button
                  key={doc.id}
                  type="button"
                  className="s5-admin-recent-row"
                  onClick={() => {
                    if (isDraft && doc.intakeDraftId) {
                      openPersuratanView({
                        view: 'studio',
                        draftId: doc.intakeDraftId,
                        documentId: doc.id,
                        templateId: doc.templateId ?? null,
                        nonce: Date.now(),
                      });
                    } else {
                      openPersuratanView({
                        view: 'detail',
                        documentId: doc.id,
                        versionId: doc.currentVersionId ?? null,
                        nonce: Date.now(),
                      });
                    }
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: '12.5px',
                        fontWeight: 700,
                        color: '#0B2923',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {doc.title}
                    </div>
                    <div
                      className="s5-tnum"
                      style={{
                        fontSize: '11.5px',
                        color: '#4B635D',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {doc.documentNumber ?? 'Draft Belum Bernomor'} · {doc.status}
                    </div>
                  </div>
                  <ArrowRight size={14} color="#4B635D" aria-hidden="true" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        ) : (
          <div className="s5-admin-empty-callout">
            Belum ada dokumen persuratan tersimpan pada workspace ini. Klik <strong>Buat Surat Baru</strong> untuk memilih template resmi madrasah.
          </div>
        )}
      </section>
    </div>
  );
}
