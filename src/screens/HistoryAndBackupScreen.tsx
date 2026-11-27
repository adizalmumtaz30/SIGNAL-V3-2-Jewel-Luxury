import { useEffect, useState } from 'react';
import {
  Archive,
  CalendarDays,
  Check,
  Clock,
  Clock3,
  Download,
  FileCheck2,
  FileSpreadsheet,
  HelpCircle,
  History,
  RefreshCw,
  Upload,
} from 'lucide-react';
import type { AppState, ScheduleVersion } from '../domain/types';
import { EditorialPageHeader } from '../components/EditorialPageHeader';
import { KpiMotionCard, MotionStaggerItem } from '../components/KpiMotion';
import {
  Button,
  EmptyState,
  StatusPill,
  formatShortDate,
  type ScreenId,
} from '../components/ScreenPrimitives';

export function HistoryAndBackupScreen({
  state,
  initialTab = 'versions',
  onRestore,
  onNavigate,
  onOpenTimeMachine,
  onBackup,
  onImport,
  onExportCSV,
  onExportJSON,
}: {
  state: AppState;
  initialTab?: 'versions' | 'backup';
  onRestore: (version: ScheduleVersion) => void;
  onNavigate: (screen: ScreenId) => void;
  onOpenTimeMachine?: () => void;
  onBackup: () => void;
  onImport: (file?: File) => void;
  onExportCSV: () => void;
  onExportJSON: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'versions' | 'backup'>(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  return (
    <>
      <EditorialPageHeader
        kicker="RIWAYAT & CADANGAN"
        title="Riwayat Versi & Cadangan Data"
        subtitle="Pulihkan versi jadwal dan cadangkan data lokal."
        secondaryAction={
          onOpenTimeMachine
            ? {
                label: 'Snapshot & .sakala',
                icon: <Clock size={15} />,
                onClick: onOpenTimeMachine,
              }
            : undefined
        }
        primaryAction={{
          label: 'Buka Jadwal',
          icon: <CalendarDays size={15} />,
          onClick: () => onNavigate('schedule'),
        }}
      />

      <div className="s5-history-tabs-bar">
        <div className="s5-segmented-tabs" role="tablist" aria-label="Kategori Riwayat & Backup">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'versions'}
            className={`s5-segmented-tab ${activeTab === 'versions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('versions')}
          >
            <History size={15} />
            <span>Linimasa Versi Jadwal</span>
            <span className="s5-segmented-tab-count">{state.history.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'backup'}
            className={`s5-segmented-tab ${activeTab === 'backup' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('backup')}
          >
            <Archive size={15} />
            <span>Cadangan &amp; Ekspor Data</span>
          </button>
        </div>

        {activeTab === 'backup' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button variant="secondary" size="sm" icon={Download} onClick={onExportJSON}>
              Ekspor Jadwal JSON
            </Button>
            <Button size="sm" icon={Download} onClick={onBackup}>
              Unduh Cadangan Penuh
            </Button>
          </div>
        )}
      </div>

      {activeTab === 'versions' ? (
        state.history.length === 0 ? (
          <EmptyState
            icon={History}
            title="Belum ada versi jadwal terbit"
            description="Terbitkan jadwal dari halaman Jadwal Pelajaran agar setiap versi resmi tercatat dan dapat dipulihkan."
            action={
              <Button icon={CalendarDays} onClick={() => onNavigate('schedule')}>
                Buka Jadwal Pelajaran
              </Button>
            }
          />
        ) : (
          <div className="version-timeline">
            {state.history.map((version, idx) => (
              <MotionStaggerItem key={version.id} index={idx} className="version-row">
                <div className="timeline-track">
                  <div className={`timeline-dot ${idx === 0 ? 'current' : ''}`}>
                    {idx === 0 ? <Check size={13} /> : <span />}
                  </div>
                </div>
                <div className="version-main">
                  <div className="version-title-row">
                    <div>
                      <div className="version-kicker">
                        {idx === 0 ? 'VERSI AKTIF' : `ARSIP · VERSI ${version.version}`}
                      </div>
                      <h3>{version.label}</h3>
                    </div>
                    <div className="version-actions">
                      {idx === 0 && <StatusPill status="success">Aktif</StatusPill>}
                      <Button variant="secondary" icon={RefreshCw} onClick={() => onRestore(version)}>
                        Pulihkan ke Draf
                      </Button>
                    </div>
                  </div>
                  <div className="version-meta">
                    <span>
                      <Clock3 size={13} /> {formatShortDate(version.createdAt)}
                    </span>
                    <span>
                      <CalendarDays size={13} /> {version.entryCount} Penempatan
                    </span>
                  </div>
                </div>
              </MotionStaggerItem>
            ))}
          </div>
        )
      ) : (
        <div className="s5-backup-bento-grid">
          <KpiMotionCard index={0} className="backup-action-card">
            <div className="backup-action-icon json">
              <FileCheck2 size={21} />
            </div>
            <div className="backup-action-copy">
              <div className="backup-action-kicker">ARSIP PENUH RUANG KERJA</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3>Cadangan Penuh JSON</h3>
                <span
                  className="s5-info-icon-trigger"
                  tabIndex={0}
                  role="img"
                  aria-label="Penjelasan Cadangan Penuh JSON"
                  data-s5-tooltip="Cadangkan seluruh data master, kebutuhan JP, presensi, arsip surat, dan jadwal ke satu berkas aman."
                >
                  <HelpCircle size={12} aria-hidden="true" />
                </span>
              </div>
              <Button icon={Download} onClick={onBackup}>
                Unduh Cadangan JSON
              </Button>
            </div>
          </KpiMotionCard>

          <KpiMotionCard index={1} className="backup-action-card">
            <div className="backup-action-icon csv">
              <FileSpreadsheet size={21} />
            </div>
            <div className="backup-action-copy">
              <div className="backup-action-kicker">EKSPOR LEMBAR KERJA</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3>Ekspor Jadwal CSV</h3>
                <span
                  className="s5-info-icon-trigger"
                  tabIndex={0}
                  role="img"
                  aria-label="Penjelasan Ekspor Jadwal CSV"
                  data-s5-tooltip="Ekspor susunan jadwal ke tabel CSV untuk dibuka di Microsoft Excel atau Google Sheets."
                >
                  <HelpCircle size={12} aria-hidden="true" />
                </span>
              </div>
              <Button variant="secondary" icon={FileSpreadsheet} onClick={onExportCSV}>
                Ekspor CSV
              </Button>
            </div>
          </KpiMotionCard>

          <KpiMotionCard index={2} className="backup-action-card">
            <div className="backup-action-icon json">
              <Upload size={21} />
            </div>
            <div className="backup-action-copy">
              <div className="backup-action-kicker">PULIHKAN CADANGAN</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <h3>Pulihkan Data Cadangan</h3>
                <span
                  className="s5-info-icon-trigger"
                  tabIndex={0}
                  role="img"
                  aria-label="Penjelasan Pulihkan Data Cadangan"
                  data-s5-tooltip="Pilih berkas JSON hasil cadangan sebelumnya untuk memulihkan seluruh data madrasah."
                >
                  <HelpCircle size={12} aria-hidden="true" />
                </span>
              </div>
              <label className="button button-secondary file-pick-button">
                <Upload size={15} /> Pilih Berkas JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImport(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
          </KpiMotionCard>
        </div>
      )}
    </>
  );
}
