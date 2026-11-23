import type { ReactNode } from 'react';
import { Download, RotateCcw, X } from 'lucide-react';
import type { KopRenderMode } from '../domain/kopIdentity';
import { MotionModalDialog } from './KpiMotion';

export interface PdfStudioTabItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

export interface PdfExportStudioShellProps<T extends string> {
  ariaLabel: string;
  title: string;
  subtitle: string;
  headerIcon: ReactNode;
  tabs: Array<PdfStudioTabItem<T>>;
  activeTab: T;
  onTabChange: (tab: T) => void;
  tabAriaLabel: string;
  leftPaneContent: ReactNode;
  rightPaneContent: ReactNode;
  footerMeta: ReactNode;
  onClose: () => void;
  onExport: () => void;
  isExporting: boolean;
  exportDisabled?: boolean;
  exportLabel: string;
}

/**
 * Shared Figma Pro Split-Studio Shell for SchedulePdfExportModal & AttendancePdfExportModal.
 */
export function PdfExportStudioShell<T extends string>({
  ariaLabel,
  title,
  subtitle,
  headerIcon,
  tabs,
  activeTab,
  onTabChange,
  tabAriaLabel,
  leftPaneContent,
  rightPaneContent,
  footerMeta,
  onClose,
  onExport,
  isExporting,
  exportDisabled = false,
  exportLabel,
}: PdfExportStudioShellProps<T>) {
  return (
    <MotionModalDialog
      panelClassName="modal-panel s5-export-studio-panel"
      ariaLabel={ariaLabel}
      onBackdropMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head s5-pdf-modal-head">
        <div className="modal-title-icon s5-pdf-modal-head-icon">{headerIcon}</div>
        <div className="s5-pdf-modal-head-copy">
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup dialog">
          <X size={17} />
        </button>
      </div>

      <div className="s5-studio-body">
        <div className="s5-pdf-studio-grid">
          <div className="s5-studio-left-pane">
            <div className="s5-studio-tabs" role="tablist" aria-label={tabAriaLabel}>
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  className={`s5-studio-tab-btn ${activeTab === tab.id ? 'is-active' : ''}`}
                  onClick={() => onTabChange(tab.id)}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {leftPaneContent}
          </div>

          <div className="s5-pdf-paper-stage is-viewport-host">{rightPaneContent}</div>
        </div>
      </div>

      <div className="s5-studio-footer">
        <span className="s5-tnum s5-pdf-footer-meta">{footerMeta}</span>
        <div className="s5-pdf-footer-actions">
          <button
            type="button"
            className="button button-secondary s5-pdf-footer-btn"
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="button"
            className="button button-primary s5-pdf-footer-btn-primary"
            onClick={onExport}
            disabled={isExporting || exportDisabled}
          >
            <Download size={15} />
            <span>{isExporting ? 'Memproses PDF…' : exportLabel}</span>
          </button>
        </div>
      </div>
    </MotionModalDialog>
  );
}

export type PdfContentSubTab = 'kop' | 'title' | 'signer';

export interface PdfKopSignerContentEditorProps {
  subTab: PdfContentSubTab;
  onSubTabChange: (tab: PdfContentSubTab) => void;
  onResetDefault: () => void;
  kopMode: KopRenderMode;
  onKopModeChange: (mode: KopRenderMode) => void;
  schoolName: string;
  onSchoolNameChange: (v: string) => void;
  ministry: string;
  onMinistryChange: (v: string) => void;
  regionalOffice: string;
  onRegionalOfficeChange: (v: string) => void;
  legalDecree: string;
  onLegalDecreeChange: (v: string) => void;
  nsm: string;
  onNsmChange: (v: string) => void;
  npsn: string;
  onNpsnChange: (v: string) => void;
  accreditation: string;
  onAccreditationChange: (v: string) => void;
  address: string;
  onAddressChange: (v: string) => void;
  city: string;
  onCityChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  documentTitle: string;
  onDocumentTitleChange: (v: string) => void;
  academicYear: string;
  onAcademicYearChange: (v: string) => void;
  semester: 'Ganjil' | 'Genap';
  onSemesterChange: (v: 'Ganjil' | 'Genap') => void;
  extraNotes?: string;
  onExtraNotesChange?: (v: string) => void;
  showSignerDateFields?: boolean;
  signerCity?: string;
  onSignerCityChange?: (v: string) => void;
  signerDate?: string;
  onSignerDateChange?: (v: string) => void;
  leftSignerTitle: string;
  onLeftSignerTitleChange: (v: string) => void;
  leftSignerName: string;
  onLeftSignerNameChange: (v: string) => void;
  leftSignerNip: string;
  onLeftSignerNipChange: (v: string) => void;
  rightSignerTitle: string;
  onRightSignerTitleChange: (v: string) => void;
  rightSignerName: string;
  onRightSignerNameChange: (v: string) => void;
  rightSignerNip: string;
  onRightSignerNipChange: (v: string) => void;
}

/**
 * Shared Kop Surat, Judul, dan Pejabat Pengesah Editor for all PDF Studios.
 */
export function PdfKopSignerContentEditor({
  subTab,
  onSubTabChange,
  onResetDefault,
  kopMode,
  onKopModeChange,
  schoolName,
  onSchoolNameChange,
  ministry,
  onMinistryChange,
  regionalOffice,
  onRegionalOfficeChange,
  legalDecree,
  onLegalDecreeChange,
  nsm,
  onNsmChange,
  npsn,
  onNpsnChange,
  accreditation,
  onAccreditationChange,
  address,
  onAddressChange,
  city,
  onCityChange,
  phone,
  onPhoneChange,
  documentTitle,
  onDocumentTitleChange,
  academicYear,
  onAcademicYearChange,
  semester,
  onSemesterChange,
  extraNotes,
  onExtraNotesChange,
  showSignerDateFields = false,
  signerCity = '',
  onSignerCityChange,
  signerDate = '',
  onSignerDateChange,
  leftSignerTitle,
  onLeftSignerTitleChange,
  leftSignerName,
  onLeftSignerNameChange,
  leftSignerNip,
  onLeftSignerNipChange,
  rightSignerTitle,
  onRightSignerTitleChange,
  rightSignerName,
  onRightSignerNameChange,
  rightSignerNip,
  onRightSignerNipChange,
}: PdfKopSignerContentEditorProps) {
  return (
    <div className="s5-studio-card">
      <div className="s5-pdf-subtabs-bar">
        <div className="s5-pdf-subtabs-group">
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
              onClick={() => onSubTabChange(tab.id)}
              className={`s5-studio-preset-btn s5-pdf-subtab-btn ${subTab === tab.id ? 'is-active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button type="button" onClick={onResetDefault} className="s5-pdf-reset-btn">
          <RotateCcw size={12} />
          <span>Reset Default</span>
        </button>
      </div>

      {subTab === 'kop' && (
        <div className="s5-pdf-field-grid">
          <div className="field-group is-span-2">
            <label>Mode Tampilan Kop Surat</label>
            <div className="s5-pdf-mode-pair">
              <button
                type="button"
                onClick={() => onKopModeChange('structured')}
                className={`s5-studio-preset-btn ${kopMode === 'structured' ? 'is-active' : ''}`}
              >
                Kop Terstruktur (Editable)
              </button>
              <button
                type="button"
                onClick={() => onKopModeChange('image')}
                className={`s5-studio-preset-btn ${kopMode === 'image' ? 'is-active' : ''}`}
              >
                Gambar Kop Resmi Penuh
              </button>
            </div>
          </div>
          <div className="field-group is-span-2">
            <label>Nama Resmi Madrasah</label>
            <input
              type="text"
              className="is-strong"
              value={schoolName}
              onChange={(e) => onSchoolNameChange(e.target.value)}
            />
          </div>
          <div className="field-group is-span-2">
            <label>Yayasan / Lembaga Menaungi</label>
            <input type="text" value={ministry} onChange={(e) => onMinistryChange(e.target.value)} />
          </div>
          <div className="field-group is-span-2">
            <label>Akte Notaris / SK Pendirian</label>
            <input
              type="text"
              value={regionalOffice}
              onChange={(e) => onRegionalOfficeChange(e.target.value)}
            />
          </div>
          <div className="field-group is-span-2">
            <label>Keputusan Menkumham / SK Legalitas</label>
            <input
              type="text"
              value={legalDecree}
              onChange={(e) => onLegalDecreeChange(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>NSM</label>
            <input type="text" value={nsm} onChange={(e) => onNsmChange(e.target.value)} />
          </div>
          <div className="field-group">
            <label>NPSN</label>
            <input type="text" value={npsn} onChange={(e) => onNpsnChange(e.target.value)} />
          </div>
          <div className="field-group is-span-2">
            <label>Status Akreditasi</label>
            <input
              type="text"
              value={accreditation}
              onChange={(e) => onAccreditationChange(e.target.value)}
            />
          </div>
          <div className="field-group is-span-2">
            <label>Alamat Lengkap</label>
            <input type="text" value={address} onChange={(e) => onAddressChange(e.target.value)} />
          </div>
          <div className="field-group">
            <label>Kota / Kabupaten</label>
            <input type="text" value={city} onChange={(e) => onCityChange(e.target.value)} />
          </div>
          <div className="field-group">
            <label>Telepon</label>
            <input type="text" value={phone} onChange={(e) => onPhoneChange(e.target.value)} />
          </div>
        </div>
      )}

      {subTab === 'title' && (
        <div className="s5-pdf-field-grid">
          <div className="field-group is-span-2">
            <label>Judul Utama Dokumen</label>
            <input
              type="text"
              className="is-strong"
              value={documentTitle}
              onChange={(e) => onDocumentTitleChange(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>Tahun Ajaran</label>
            <input
              type="text"
              value={academicYear}
              onChange={(e) => onAcademicYearChange(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>Semester</label>
            <select
              value={semester}
              onChange={(e) => onSemesterChange(e.target.value as 'Ganjil' | 'Genap')}
            >
              <option value="Ganjil">Semester Ganjil</option>
              <option value="Genap">Semester Genap</option>
            </select>
          </div>
          {onExtraNotesChange && (
            <div className="field-group is-span-2">
              <label>Catatan Tambahan Dokumen (Opsional)</label>
              <input
                type="text"
                value={extraNotes ?? ''}
                onChange={(e) => onExtraNotesChange(e.target.value)}
                placeholder="Contoh: Berlaku efektif mulai 20 Juli 2026"
              />
            </div>
          )}
        </div>
      )}

      {subTab === 'signer' && (
        <div className="s5-pdf-signer-stack">
          {showSignerDateFields && onSignerCityChange && onSignerDateChange && (
            <div className="s5-pdf-field-grid">
              <div className="field-group">
                <label>Kota Titimangsa</label>
                <input
                  type="text"
                  value={signerCity}
                  onChange={(e) => onSignerCityChange(e.target.value)}
                />
              </div>
              <div className="field-group">
                <label>Tanggal Pengesahan</label>
                <input
                  type="text"
                  value={signerDate}
                  onChange={(e) => onSignerDateChange(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="s5-pdf-signer-box tone-left">
            <div className="s5-pdf-signer-box-title">Penandatangan Kiri (Pemeriksa)</div>
            <div className="field-group">
              <label>Jabatan</label>
              <input
                type="text"
                value={leftSignerTitle}
                onChange={(e) => onLeftSignerTitleChange(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>Nama &amp; Gelar</label>
              <input
                type="text"
                value={leftSignerName}
                onChange={(e) => onLeftSignerNameChange(e.target.value)}
              />
            </div>
            <div className="field-group is-span-2">
              <label>NIP / NPK</label>
              <input
                type="text"
                value={leftSignerNip}
                onChange={(e) => onLeftSignerNipChange(e.target.value)}
              />
            </div>
          </div>

          <div className="s5-pdf-signer-box tone-right">
            <div className="s5-pdf-signer-box-title">Penandatangan Kanan (Pengesah Utama)</div>
            <div className="field-group">
              <label>Jabatan</label>
              <input
                type="text"
                value={rightSignerTitle}
                onChange={(e) => onRightSignerTitleChange(e.target.value)}
              />
            </div>
            <div className="field-group">
              <label>Nama &amp; Gelar</label>
              <input
                type="text"
                value={rightSignerName}
                onChange={(e) => onRightSignerNameChange(e.target.value)}
              />
            </div>
            <div className="field-group is-span-2">
              <label>NIP / NPK</label>
              <input
                type="text"
                value={rightSignerNip}
                onChange={(e) => onRightSignerNipChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export interface PdfPreviewKpiItem {
  label: string;
  value: string;
  tone?: 'default' | 'accent';
}

export function PdfPreviewKpiStrip({ items }: { items: PdfPreviewKpiItem[] }) {
  return (
    <div className="s5-pdf-kpi-strip">
      {items.map((item) => (
        <div key={item.label} className="s5-pdf-kpi-item">
          <span className="s5-pdf-kpi-label">{item.label}</span>
          <strong className={`s5-tnum s5-pdf-kpi-value ${item.tone === 'accent' ? 'is-accent' : ''}`}>
            {item.value}
          </strong>
        </div>
      ))}
    </div>
  );
}
