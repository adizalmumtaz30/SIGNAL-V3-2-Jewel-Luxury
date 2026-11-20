import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  FileCheck2,
  LockKeyhole,
  Printer,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
  XCircle,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type {
  DocumentIntakeDraft,
  DocumentNumberingConfig,
  DocumentRecord,
} from '../../domain/persuratan/types';
import type {
  DocumentStudioPageSettings,
  TipTapJSONContent,
} from '../../domain/persuratan/studio/types';
import { evaluateFinalizationChecklist } from '../../domain/persuratan/finalization/checklist';
import {
  computeNextSequentialNumber,
  validateOfficialDocumentNumber,
} from '../../domain/persuratan/finalization/numberingEngine';
import { finalizeDocumentTransaction } from '../../domain/persuratan/finalization/finalizeEngine';
import {
  triggerPdfBytesDownload,
  triggerPdfBytesPrint,
} from '../../domain/persuratan/finalization/finalPdfStore';
import { evaluateTataNaskahAuthenticity } from '../../domain/persuratan/studio/tataNaskahHelpers';
import { DOCUMENT_KIND_LABELS, formatIndonesianDate } from '../../domain/persuratan/selectors';
import { NumberingFormatModal } from './NumberingFormatModal';
import { DEFAULT_MADRASAH_IDENTITY } from '../../domain/kopIdentity';
import './FinalizationSlideDrawer.css';

export interface FinalizationSlideDrawerProps {
  open: boolean;
  state: AppState;
  draft: DocumentIntakeDraft;
  content: TipTapJSONContent;
  pageSettings: DocumentStudioPageSettings;
  documentRecord?: DocumentRecord | null;
  onClose: () => void;
  onPersistState: (nextState: AppState) => Promise<void>;
  onFinalized: (documentId: string, versionId: string) => void;
  onOpenFullPreview?: () => void;
  onJumpToStudio?: () => void;
  onJumpToIntake?: () => void;
  onNotify?: (message: string, kind?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function FinalizationSlideDrawer({
  open,
  state,
  draft,
  content,
  pageSettings,
  documentRecord = null,
  onClose,
  onPersistState,
  onFinalized,
  onOpenFullPreview,
  onJumpToStudio,
  onJumpToIntake,
  onNotify,
}: FinalizationSlideDrawerProps) {
  const resolvedDoc = useMemo(
    () =>
      documentRecord ??
      (state.documents ?? []).find((d) => d.id === draft.documentId) ??
      null,
    [documentRecord, state.documents, draft.documentId]
  );

  const liveDraft = useMemo(
    () => (state.intakeDrafts ?? []).find((d) => d.id === draft.id) ?? draft,
    [state.intakeDrafts, draft]
  );

  const docKind =
    resolvedDoc?.documentType ?? liveDraft.templateSnapshot.documentKind ?? 'SURAT_KELUAR';
  const docDate = resolvedDoc?.documentDate ?? liveDraft.documentDate;

  const suggestedAutoNumber = useMemo(
    () =>
      computeNextSequentialNumber({
        state,
        kind: docKind,
        documentDate: docDate,
        excludeDocumentId: resolvedDoc?.id ?? liveDraft.documentId ?? null,
      }),
    [state, docKind, docDate, resolvedDoc, liveDraft.documentId]
  );

  const [numberingMode, setNumberingMode] = useState<'AUTO' | 'MANUAL'>('AUTO');
  const [manualNumber, setManualNumber] = useState<string>(suggestedAutoNumber.suggestedNumber);
  const [demoAcknowledged, setDemoAcknowledged] = useState<boolean>(false);
  const [showAllChecks, setShowAllChecks] = useState<boolean>(false);
  const [showQuickIdentityFix, setShowQuickIdentityFix] = useState<boolean>(false);
  const [quickSchoolName, setQuickSchoolName] = useState<string>(state.settings.schoolName ?? '');
  const [quickAddress, setQuickAddress] = useState<string>(state.settings.address ?? '');
  const [quickCity, setQuickCity] = useState<string>(state.settings.city ?? '');
  const [quickHeadmasterName, setQuickHeadmasterName] = useState<string>(
    state.settings.headmasterName ?? ''
  );
  const [quickHeadmasterNip, setQuickHeadmasterNip] = useState<string>(
    state.settings.headmasterNip ?? ''
  );
  const [isSavingIdentity, setIsSavingIdentity] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isFormatModalOpen, setIsFormatModalOpen] = useState<boolean>(false);

  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setManualNumber(suggestedAutoNumber.suggestedNumber);
    setActionError(null);
    setQuickSchoolName(state.settings.schoolName ?? '');
    setQuickAddress(state.settings.address ?? '');
    setQuickCity(state.settings.city ?? '');
    setQuickHeadmasterName(state.settings.headmasterName ?? '');
    setQuickHeadmasterNip(state.settings.headmasterNip ?? '');
    const timer = window.setTimeout(() => closeBtnRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open, suggestedAutoNumber.suggestedNumber, state.settings]);

  const activeNumber =
    numberingMode === 'AUTO' ? suggestedAutoNumber.suggestedNumber : manualNumber.trim();

  const numberValidation = useMemo(
    () =>
      validateOfficialDocumentNumber(
        activeNumber,
        state,
        resolvedDoc?.id ?? liveDraft.documentId ?? null
      ),
    [activeNumber, state, resolvedDoc, liveDraft.documentId]
  );

  const checklist = useMemo(
    () =>
      evaluateFinalizationChecklist({
        draft: liveDraft,
        content,
        state,
        documentRecord: resolvedDoc,
      }),
    [liveDraft, content, state, resolvedDoc]
  );

  const authenticityReport = useMemo(() => {
    const kopSnap = liveDraft.sourceSnapshots.find(
      (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
    );
    const snapObj =
      kopSnap?.capturedValue && typeof kopSnap.capturedValue === 'object'
        ? (kopSnap.capturedValue as Record<string, unknown>)
        : {};
    const snapSignatory =
      typeof snapObj.signatoryName === 'string' && snapObj.signatoryName.trim()
        ? snapObj.signatoryName.trim()
        : state.settings.headmasterName;
    const includeKopSurat =
      liveDraft.templateSnapshot.documentHeader.includeKopSurat !== false &&
      !(liveDraft.templateId === 'SYS-TPL-30' && liveDraft.fieldValues?.tampilkan_kop === 'Tidak');
    return evaluateTataNaskahAuthenticity({
      content,
      includeKopSurat,
      draft: liveDraft,
      signatoryName: snapSignatory,
    });
  }, [content, liveDraft, state.settings.headmasterName]);

  const canFinalizeNow = Boolean(
    checklist.canFinalize &&
      (!checklist.requiresDemoAck || demoAcknowledged) &&
      numberValidation.valid
  );

  if (!open) return null;

  const handleQuickSaveIdentity = async () => {
    const cleanSchool = quickSchoolName.trim();
    const cleanAddress = quickAddress.trim();
    const cleanCity = quickCity.trim();
    const cleanHeadmaster = quickHeadmasterName.trim();
    const cleanNip = quickHeadmasterNip.trim();

    if (!cleanSchool || !cleanAddress || !cleanCity || cleanHeadmaster.length < 2) {
      setActionError(
        'Lengkapi Nama Madrasah, Alamat, Kota/Kabupaten, dan Nama Kepala Madrasah terlebih dahulu.'
      );
      return;
    }

    setIsSavingIdentity(true);
    setActionError(null);
    try {
      const now = new Date().toISOString();
      const nextSettings = {
        ...state.settings,
        schoolName: cleanSchool,
        address: cleanAddress,
        city: cleanCity,
        headmasterName: cleanHeadmaster,
        headmasterNip: cleanNip,
      };

      const updatedDrafts = (state.intakeDrafts ?? []).map((item) => {
        if (item.id !== liveDraft.id) return item;
        const hasIdentitySnap = item.sourceSnapshots.some(
          (s) => s.sourceKey === 'settings.madrasah_identity_signatory'
        );
        const nextSnapValue = {
          ministry: nextSettings.ministry ?? DEFAULT_MADRASAH_IDENTITY.ministry,
          regionalOffice: nextSettings.regionalOffice ?? DEFAULT_MADRASAH_IDENTITY.regionalOffice,
          legalDecree: nextSettings.legalDecree ?? DEFAULT_MADRASAH_IDENTITY.legalDecree,
          accreditation: nextSettings.accreditation ?? DEFAULT_MADRASAH_IDENTITY.accreditation,
          nsm: nextSettings.nsm ?? DEFAULT_MADRASAH_IDENTITY.nsm,
          npsn: nextSettings.npsn ?? DEFAULT_MADRASAH_IDENTITY.npsn,
          schoolName: cleanSchool,
          address: cleanAddress,
          city: cleanCity,
          postalCode: nextSettings.postalCode ?? DEFAULT_MADRASAH_IDENTITY.postalCode,
          phone: nextSettings.phone ?? DEFAULT_MADRASAH_IDENTITY.phone,
          email: nextSettings.email ?? DEFAULT_MADRASAH_IDENTITY.email,
          website: nextSettings.website ?? DEFAULT_MADRASAH_IDENTITY.website,
          logoUrl: nextSettings.logoUrl,
          kopMode: nextSettings.kopMode ?? DEFAULT_MADRASAH_IDENTITY.kopMode,
          kopImageUrl: nextSettings.kopImageUrl ?? DEFAULT_MADRASAH_IDENTITY.kopImageUrl,
          signatoryTitle: 'Kepala Madrasah',
          signatoryName: cleanHeadmaster,
          headmasterName: cleanHeadmaster,
          signatoryNip: cleanNip,
        };
        const nextSnapshots = hasIdentitySnap
          ? item.sourceSnapshots.map((s) =>
              s.sourceKey === 'settings.madrasah_identity_signatory'
                ? {
                    ...s,
                    status: 'VERIFIED' as const,
                    capturedAt: now,
                    capturedValue: nextSnapValue,
                  }
                : s
            )
          : [
              ...item.sourceSnapshots,
              {
                sourceKey: 'settings.madrasah_identity_signatory',
                sourceLabel: 'Identitas Madrasah & Penandatangan Resmi',
                provenance: 'AUTO_SYSTEM' as const,
                status: 'VERIFIED' as const,
                capturedAt: now,
                isDemoData: state.dataMode === 'demo',
                capturedValue: nextSnapValue,
              },
            ];
        return {
          ...item,
          sourceSnapshots: nextSnapshots,
          updatedAt: now,
        };
      });

      await onPersistState({
        ...state,
        settings: nextSettings,
        intakeDrafts: updatedDrafts,
      });

      setShowQuickIdentityFix(false);
      onNotify?.('Identitas madrasah & penandatangan diperbarui. Checklist siap disahkan.', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan identitas madrasah.';
      setActionError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setIsSavingIdentity(false);
    }
  };

  const handleFinalize = async (postAction: 'archive' | 'download' | 'print' = 'archive') => {
    if (!canFinalizeNow || isSubmitting) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      const result = await finalizeDocumentTransaction({
        state,
        draft: liveDraft,
        content,
        pageSettings,
        documentNumber: numberValidation.normalized,
        numberingMode,
        demoAcknowledged,
      });
      await onPersistState(result.state);
      const safeFileName = `${result.documentVersion.documentNumber.replace(/[/\\:*?"<>|]/g, '_')}.pdf`;
      if (postAction === 'download') {
        triggerPdfBytesDownload(result.pdfBytes, safeFileName);
      } else if (postAction === 'print') {
        triggerPdfBytesPrint(result.pdfBytes);
      }
      onNotify?.(
        postAction === 'download'
          ? `Dokumen "${result.documentRecord.title}" disahkan (${result.documentVersion.documentNumber}) dan PDF langsung diunduh.`
          : postAction === 'print'
            ? `Dokumen "${result.documentRecord.title}" disahkan (${result.documentVersion.documentNumber}). Dialog cetak dibuka…`
            : `Dokumen "${result.documentRecord.title}" resmi disahkan (${result.documentVersion.documentNumber}). PDF siap diunduh di Arsip.`,
        'success'
      );
      onFinalized(result.documentRecord.id, result.documentVersion.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengesahkan dokumen resmi.';
      setActionError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const failingItems = checklist.items.filter((i) => !i.passed && i.severity === 'blocker');
  const needsSettingsQuickFix = failingItems.some((i) => i.fixTarget === 'settings');

  return (
    <div
      className="fsd-scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSubmitting) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isSubmitting) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="fsd-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fsd-drawer-title"
      >
        <header className="fsd-head">
          <div>
            <div className="fsd-head-kicker">
              PENGESAHAN CEPAT · {DOCUMENT_KIND_LABELS[docKind]}
            </div>
            <h2 id="fsd-drawer-title" className="fsd-head-title">
              {liveDraft.title}
            </h2>
            <p className="fsd-head-sub s5-tnum">
              Tanggal {formatIndonesianDate(docDate)} · {pageSettings.paperSize.toUpperCase()}{' '}
              {pageSettings.orientation === 'portrait' ? 'Portrait' : 'Landscape'}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="fsd-close-btn"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Tutup panel pengesahan"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="fsd-body">
          {actionError && (
            <div className="s04-banner is-error" role="alert" style={{ padding: '10px 12px' }}>
              <span>{actionError}</span>
            </div>
          )}

          {/* 1. Nomor Surat Resmi */}
          <section className="fsd-section" aria-label="Nomor surat resmi">
            <div className="fsd-section-head">
              <h3 className="fsd-section-title">
                <ShieldCheck size={15} aria-hidden="true" />
                <span>Nomor Surat Resmi</span>
              </h3>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
                <button
                  type="button"
                  className="fsd-link-btn"
                  disabled={isSubmitting}
                  onClick={() => setIsFormatModalOpen(true)}
                  title="Atur pola penomoran surat resmi madrasah"
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <SlidersHorizontal size={12} aria-hidden="true" />
                    <span>Atur Format</span>
                  </span>
                </button>
                <button
                  type="button"
                  className="fsd-link-btn"
                  disabled={isSubmitting}
                  onClick={() =>
                    setNumberingMode((prev) => (prev === 'AUTO' ? 'MANUAL' : 'AUTO'))
                  }
                >
                  {numberingMode === 'AUTO' ? 'Ubah manual' : 'Gunakan nomor otomatis'}
                </button>
              </div>
            </div>

            <input
              id="fsd-official-number-input"
              type="text"
              className="fsd-number-box s5-tnum"
              aria-label="Nomor surat resmi yang akan diterbitkan"
              value={activeNumber}
              disabled={numberingMode === 'AUTO' || isSubmitting}
              onChange={(e) => setManualNumber(e.target.value)}
              placeholder="Contoh: 001/SK/MTs.DAH/XI/2026"
            />

            <div
              className={`fsd-number-hint s5-tnum ${numberValidation.valid ? '' : 'is-error'}`}
            >
              {numberValidation.valid
                ? `Nomor urut #${suggestedAutoNumber.nextSequence} (periode ${suggestedAutoNumber.periodKey}) terverifikasi unik dan siap disahkan.`
                : numberValidation.error}
            </div>
          </section>

          {/* 2. Pemeriksaan Administrasi Ringkas */}
          <section className="fsd-section" aria-label="Pemeriksaan kelengkapan administrasi">
            <div className="fsd-section-head">
              <h3 className="fsd-section-title">
                {checklist.canFinalize ? (
                  <CheckCircle2 size={15} color="#1b5e43" aria-hidden="true" />
                ) : (
                  <ShieldAlert size={15} color="#8f2d24" aria-hidden="true" />
                )}
                <span>Kelengkapan Administrasi</span>
              </h3>
              <button
                type="button"
                className="fsd-link-btn"
                onClick={() => setShowAllChecks((prev) => !prev)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                  {showAllChecks ? 'Ringkas' : `Lihat ${checklist.items.length} poin`}
                  {showAllChecks ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </span>
              </button>
            </div>

            {checklist.canFinalize && !showAllChecks ? (
              <div className="fsd-ready-summary" role="status">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '7px' }}>
                  <CheckCircle2 size={16} aria-hidden="true" />
                  <span>Semua syarat administrasi &amp; tanda tangan terpenuhi</span>
                </span>
              </div>
            ) : (
              <ul className="fsd-checklist">
                {(showAllChecks ? checklist.items : failingItems).map((item) => (
                  <li key={item.id} className={`fsd-check-item is-${item.severity}`}>
                    <span aria-hidden="true" style={{ marginTop: '1px', flexShrink: 0 }}>
                      {item.passed ? (
                        <CheckCircle2 size={14} />
                      ) : item.severity === 'blocker' ? (
                        <XCircle size={14} />
                      ) : (
                        <AlertTriangle size={14} />
                      )}
                    </span>
                    <div className="fsd-check-body">
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                      {!item.passed && item.fixTarget === 's04' && onJumpToStudio && (
                        <div>
                          <button
                            type="button"
                            className="fsd-link-btn"
                            onClick={() => {
                              onClose();
                              onJumpToStudio();
                            }}
                          >
                            Perbaiki di Editor Naskah &rarr;
                          </button>
                        </div>
                      )}
                      {!item.passed && item.fixTarget === 's03' && onJumpToIntake && (
                        <div>
                          <button
                            type="button"
                            className="fsd-link-btn"
                            onClick={() => {
                              onClose();
                              onJumpToIntake();
                            }}
                          >
                            Lengkapi Data Surat &rarr;
                          </button>
                        </div>
                      )}
                      {!item.passed && item.fixTarget === 'settings' && (
                        <div>
                          <button
                            type="button"
                            className="fsd-link-btn"
                            onClick={() => setShowQuickIdentityFix((v) => !v)}
                          >
                            {showQuickIdentityFix
                              ? 'Tutup isian cepat identitas'
                              : 'Isi cepat Identitas & Penandatangan di sini →'}
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {(needsSettingsQuickFix || showQuickIdentityFix) && showQuickIdentityFix && (
              <div className="fsd-inline-fix-card" role="region" aria-label="Isi cepat identitas madrasah">
                <div className="fsd-inline-fix-title">
                  Lengkapi Identitas Madrasah &amp; Penandatangan
                </div>
                <div className="fsd-inline-fix-grid">
                  <div className="fsd-inline-field">
                    <label htmlFor="fsd-qf-school">Nama Madrasah *</label>
                    <input
                      id="fsd-qf-school"
                      type="text"
                      value={quickSchoolName}
                      onChange={(e) => setQuickSchoolName(e.target.value)}
                      placeholder="Contoh: MTs Negeri 1 Bandung"
                    />
                  </div>
                  <div className="fsd-inline-field">
                    <label htmlFor="fsd-qf-address">Alamat Lengkap *</label>
                    <input
                      id="fsd-qf-address"
                      type="text"
                      value={quickAddress}
                      onChange={(e) => setQuickAddress(e.target.value)}
                      placeholder="Jl. Pendidikan No. 10"
                    />
                  </div>
                  <div className="fsd-inline-field">
                    <label htmlFor="fsd-qf-city">Kota / Kabupaten *</label>
                    <input
                      id="fsd-qf-city"
                      type="text"
                      value={quickCity}
                      onChange={(e) => setQuickCity(e.target.value)}
                      placeholder="Bandung"
                    />
                  </div>
                  <div className="fsd-inline-field">
                    <label htmlFor="fsd-qf-headmaster">Nama Kepala Madrasah / Penandatangan *</label>
                    <input
                      id="fsd-qf-headmaster"
                      type="text"
                      value={quickHeadmasterName}
                      onChange={(e) => setQuickHeadmasterName(e.target.value)}
                      placeholder="Drs. H. Ahmad Fauzi, M.Pd."
                    />
                  </div>
                  <div className="fsd-inline-field">
                    <label htmlFor="fsd-qf-nip">NIP / NPK (Opsional)</label>
                    <input
                      id="fsd-qf-nip"
                      type="text"
                      value={quickHeadmasterNip}
                      onChange={(e) => setQuickHeadmasterNip(e.target.value)}
                      placeholder="197201012000031002"
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="s02-btn-secondary"
                    style={{ height: '34px', fontSize: '12px' }}
                    disabled={isSavingIdentity}
                    onClick={() => setShowQuickIdentityFix(false)}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="s02-btn-primary"
                    style={{ height: '34px', fontSize: '12px' }}
                    disabled={isSavingIdentity}
                    onClick={() => void handleQuickSaveIdentity()}
                  >
                    {isSavingIdentity ? 'Menyimpan…' : 'Simpan & Perbarui Checklist'}
                  </button>
                </div>
              </div>
            )}

            {checklist.requiresDemoAck && (
              <label className="fsd-demo-ack">
                <input
                  type="checkbox"
                  checked={demoAcknowledged}
                  onChange={(e) => setDemoAcknowledged(e.target.checked)}
                />
                <span>
                  Saya memahami surat ini memakai <strong>dataset simulasi demo</strong> dan tetap
                  mengesahkannya untuk pengujian.
                </span>
              </label>
            )}
          </section>

          {authenticityReport.passedCount < authenticityReport.totalCount && (
            <div className="fsd-audit-warn" role="note" aria-label="Catatan Audit Tata Naskah">
              <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
              <div className="fsd-audit-warn-body">
                <strong className="s5-tnum">
                  Audit Tata Naskah ({authenticityReport.passedCount}/{authenticityReport.totalCount})
                </strong>
                <span>
                  Perhatikan:{' '}
                  {authenticityReport.items
                    .filter((i) => !i.passed)
                    .map((i) => i.label)
                    .join(', ')}
                  .
                </span>
                {onJumpToStudio && (
                  <button
                    type="button"
                    className="fsd-link-btn"
                    style={{ alignSelf: 'flex-start', marginTop: '2px' }}
                    onClick={() => {
                      onClose();
                      onJumpToStudio();
                    }}
                  >
                    Periksa di Editor Naskah &rarr;
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="fsd-freeze-note" role="note">
            <LockKeyhole size={15} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
            <span>
              Pengesahan akan mengunci naskah, data rujukan saat terbit, dan berkas PDF resmi
              sebagai arsip baca-saja. Perubahan di kemudian hari tetap aman melalui fitur{' '}
              <strong>Buat Revisi</strong>.
            </span>
          </div>
        </div>

        <footer className="fsd-foot">
          <div className="fsd-foot-caption">Pilih hasil akhir penerbitan resmi:</div>
          <div className="fsd-quick-actions">
            <button
              type="button"
              className="fsd-primary-btn"
              disabled={!canFinalizeNow || isSubmitting}
              onClick={() => void handleFinalize('download')}
            >
              <Download size={15} aria-hidden="true" />
              <span>{isSubmitting ? 'Menerbitkan…' : 'Terbitkan & Unduh PDF'}</span>
            </button>
            <button
              type="button"
              className="fsd-primary-outline-btn"
              disabled={!canFinalizeNow || isSubmitting}
              onClick={() => void handleFinalize('print')}
            >
              <Printer size={15} aria-hidden="true" />
              <span>Terbitkan &amp; Cetak</span>
            </button>
          </div>

          <button
            type="button"
            className="fsd-archive-only-btn"
            disabled={!canFinalizeNow || isSubmitting}
            onClick={() => void handleFinalize('archive')}
          >
            <FileCheck2 size={14} aria-hidden="true" />
            <span>
              {isSubmitting ? 'Mengesahkan & Menerbitkan PDF…' : 'Sahkan & Terbitkan PDF Resmi (Buka Arsip)'}
            </span>
          </button>

          <div className="fsd-foot-secondary">
            <button
              type="button"
              className="fsd-link-btn"
              disabled={isSubmitting}
              onClick={onClose}
            >
              Kembali menyunting
            </button>
            {onOpenFullPreview && (
              <button
                type="button"
                className="fsd-link-btn"
                disabled={isSubmitting}
                onClick={() => {
                  onClose();
                  onOpenFullPreview();
                }}
              >
                Buka Pratinjau Cetak Penuh &rarr;
              </button>
            )}
          </div>
        </footer>
      </div>

      <NumberingFormatModal
        open={isFormatModalOpen}
        state={state}
        previewKind={docKind}
        onClose={() => setIsFormatModalOpen(false)}
        onSaveConfig={async (nextConfig: DocumentNumberingConfig) => {
          await onPersistState({
            ...state,
            settings: {
              ...state.settings,
              documentNumbering: nextConfig,
            },
          });
          setNumberingMode('AUTO');
          onNotify?.('Format penomoran surat madrasah berhasil diperbarui.', 'success');
        }}
      />
    </div>
  );
}
