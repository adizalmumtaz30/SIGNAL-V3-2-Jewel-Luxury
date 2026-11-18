import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Eye,
  FileCheck2,
  FileEdit,
  FileText,
  History,
  LockKeyhole,
  Paperclip,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AppState } from '../../domain/types';
import type {
  DocumentAttachmentMeta,
  DocumentRecord,
  DocumentVersion,
  TipTapJSONNode,
} from '../../domain/persuratan/types';
import {
  DOCUMENT_KIND_LABELS,
  DOCUMENT_STATUS_LABELS,
  formatIndonesianDate,
  getRelatedTeacherNames,
} from '../../domain/persuratan/selectors';
import {
  createRevisionDraftInState,
  getDocumentVersionChain,
} from '../../domain/persuratan/finalization/finalizeEngine';
import {
  defaultFinalPdfStorageAdapter,
  triggerPdfBytesDownload,
} from '../../domain/persuratan/finalization/finalPdfStore';
import { renderOfficialDocumentPdf } from '../../domain/persuratan/finalization/pdfRenderer';
import {
  formatBytesReadable,
  getAttachmentsForDocument,
  getBinaryBlob,
  isSafeRasterPreviewMime,
  triggerBinaryDownload,
} from '../../domain/persuratan/attachments/attachmentStore';
import {
  archiveDocumentInState,
  attachFileToDocumentInState,
  canDeleteDocumentRecord,
  removeAttachmentFromDocumentInState,
  restoreArchivedDocumentInState,
} from '../../domain/persuratan/archive/archiveEngine';
import './DocumentArchiveDetail.css';

export interface DocumentArchiveDetailProps {
  state: AppState;
  documentId: string;
  initialVersionId?: string | null;
  onPersistState: (nextState: AppState) => Promise<void>;
  onBackToCenter: () => void;
  onOpenStudio?: (draftId: string) => void;
  onOpenPreview?: (target: {
    documentId: string;
    draftId?: string | null;
    versionId?: string | null;
  }) => void;
  onOpenRevisionInStudio?: (revisionDraftId: string) => void;
  onDeleteDraft?: (target: { draftId?: string | null; documentId?: string | null }) => Promise<void> | void;
  onSaveAsTemplate?: (documentId: string) => void;
  onNotify?: (message: string, kind?: 'success' | 'info' | 'warning' | 'error') => void;
}

type S06TabId = 'overview' | 'metadata' | 'attachments' | 'versions';

function renderStaticNodes(nodes: TipTapJSONNode[] | undefined) {
  if (!nodes || nodes.length === 0) return null;
  return nodes.map((node, idx) => {
    const text = (node.content ?? []).map((c) => c.text ?? '').join('');
    if (node.type === 'heading') {
      return (
        <h3 key={idx} style={{ margin: '8px 0 4px', fontSize: '13.5px', color: '#0b2923' }}>
          {text}
        </h3>
      );
    }
    if (node.type === 'horizontalRule') {
      return <hr key={idx} style={{ border: 0, borderTop: '1px solid #30453f', margin: '8px 0' }} />;
    }
    if (node.type === 'pageBreak') {
      return (
        <div
          key={idx}
          style={{
            borderTop: '1px dashed #8da89e',
            textAlign: 'center',
            fontSize: '10px',
            color: '#526861',
            margin: '10px 0',
            paddingTop: '4px',
          }}
        >
          — Pemisah Halaman —
        </div>
      );
    }
    if (node.type === 'table') {
      return (
        <table
          key={idx}
          style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px', margin: '8px 0' }}
        >
          <tbody>
            {(node.content ?? []).slice(0, 20).map((row, rIdx) => (
              <tr key={rIdx}>
                {(row.content ?? []).map((cell, cIdx) => {
                  const CellTag = cell.type === 'tableHeader' ? 'th' : 'td';
                  const cellText = (cell.content ?? [])
                    .flatMap((p) => p.content ?? [])
                    .map((t) => t.text ?? '')
                    .join(' ');
                  return (
                    <CellTag
                      key={cIdx}
                      style={{
                        border: '1px solid #748881',
                        padding: '4px 6px',
                        textAlign: 'left',
                        background: cell.type === 'tableHeader' ? '#f1f5f3' : 'transparent',
                      }}
                    >
                      {cellText}
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    if (node.type === 'bulletList' || node.type === 'orderedList') {
      const Tag = node.type === 'orderedList' ? 'ol' : 'ul';
      return (
        <Tag key={idx} style={{ margin: '4px 0 8px 18px', padding: 0, fontSize: '12px' }}>
          {(node.content ?? []).map((li, liIdx) => (
            <li key={liIdx}>
              {(li.content ?? [])
                .flatMap((p) => p.content ?? [])
                .map((t) => t.text ?? '')
                .join('')}
            </li>
          ))}
        </Tag>
      );
    }
    if (!text.trim()) return null;
    return (
      <p key={idx} style={{ margin: '0 0 6px', fontSize: '12px', lineHeight: 1.5 }}>
        {text}
      </p>
    );
  });
}

export function DocumentArchiveDetail({
  state,
  documentId,
  initialVersionId = null,
  onPersistState,
  onBackToCenter,
  onOpenStudio,
  onOpenPreview,
  onOpenRevisionInStudio,
  onDeleteDraft,
  onSaveAsTemplate,
  onNotify,
}: DocumentArchiveDetailProps) {
  const [activeTab, setActiveTab] = useState<S06TabId>('overview');
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(initialVersionId);
  const [isBusy, setIsBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [revisionModalOpen, setRevisionModalOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [rasterPreview, setRasterPreview] = useState<{
    fileName: string;
    url: string;
    mimeType: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const revisionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (rasterPreview?.url) {
        URL.revokeObjectURL(rasterPreview.url);
      }
    };
  }, [rasterPreview]);

  useEffect(() => {
    if (revisionModalOpen) {
      setTimeout(() => revisionInputRef.current?.focus(), 0);
    }
  }, [revisionModalOpen]);

  const doc: DocumentRecord | null = useMemo(
    () => (state.documents ?? []).find((d) => d.id === documentId) ?? null,
    [state.documents, documentId]
  );

  const linkedDraft = useMemo(() => {
    if (!doc) return null;
    return (
      (state.intakeDrafts ?? []).find(
        (d) => d.id === doc.intakeDraftId || d.documentId === doc.id
      ) ?? null
    );
  }, [state.intakeDrafts, doc]);

  const versionChain = useMemo(
    () => (doc ? getDocumentVersionChain(state, doc.id) : null),
    [state, doc]
  );

  const activeVersion: DocumentVersion | null = useMemo(() => {
    if (!doc || !versionChain) return null;
    if (selectedVersionId) {
      const matched = versionChain.versions.find((v) => v.id === selectedVersionId);
      if (matched) return matched;
    }
    if (doc.currentVersionId) {
      const current = versionChain.versions.find((v) => v.id === doc.currentVersionId);
      if (current) return current;
    }
    return versionChain.versions[versionChain.versions.length - 1] ?? null;
  }, [doc, versionChain, selectedVersionId]);

  const attachments = useMemo(
    () => (doc ? getAttachmentsForDocument(state, doc.id) : []),
    [state, doc]
  );

  if (!doc) {
    return (
      <section className="s06-shell" aria-label="Detail & Arsip Dokumen">
        <div className="s06-card">
          <h2>Dokumen tidak ditemukan</h2>
          <p style={{ margin: 0, fontSize: '13px', color: '#4b635d' }}>
            Rekaman dokumen tidak tersedia di arsip lokal saat ini.
          </p>
          <div>
            <button type="button" className="s02-btn-primary" onClick={onBackToCenter}>
              <ArrowLeft size={14} aria-hidden="true" />
              <span>Kembali ke Pusat Persuratan</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  const deleteCheck = canDeleteDocumentRecord(doc);
  const relatedTeachers = getRelatedTeacherNames(doc.relatedTeacherIds, state.teachers);
  const isOfficial = doc.status === 'FINAL' || doc.status === 'ARCHIVED' || doc.status === 'REVISED';
  const sourceSnapshots = activeVersion?.sourceSnapshots ?? linkedDraft?.sourceSnapshots ?? [];
  const previewContent = activeVersion?.snapshotContent ?? linkedDraft?.studio?.content ?? null;

  const handleDownloadFinalPdf = async () => {
    if (!activeVersion) {
      onNotify?.('PDF final hanya tersedia untuk dokumen yang sudah disahkan pada S05.', 'warning');
      return;
    }
    setIsBusy(true);
    try {
      const stored = await defaultFinalPdfStorageAdapter.getFinalPdf(activeVersion.pdfStorageKey);
      const safeName = `${activeVersion.documentNumber.replace(/[/\\:*?"<>|]/g, '_')}.pdf`;
      if (stored) {
        triggerPdfBytesDownload(stored.bytes, safeName);
        onNotify?.(`PDF final "${safeName}" diunduh dari arsip terverifikasi.`, 'success');
        return;
      }
      // Deterministic rebuild from immutable frozen DocumentVersion snapshot if binary cache was evicted
      const syntheticDraft = linkedDraft ?? {
        id: doc.intakeDraftId ?? `SNAP-${activeVersion.id}`,
        documentId: doc.id,
        templateId: activeVersion.templateSnapshot.templateId,
        templateVersion: activeVersion.templateSnapshot.version,
        intakeStatus: 'READY_FOR_EDITOR' as const,
        title: activeVersion.title,
        subject: activeVersion.subject,
        documentDate: activeVersion.documentDate,
        counterpartName: activeVersion.counterpartName,
        relatedTeacherIds: activeVersion.relatedTeacherIds,
        scheduleVersionId: activeVersion.scheduleVersionId ?? null,
        scheduleVersionFingerprint: activeVersion.scheduleVersionFingerprint ?? null,
        fieldValues: activeVersion.fieldValues,
        fieldProvenance: {},
        templateSnapshot: activeVersion.templateSnapshot,
        sourceSnapshots: activeVersion.sourceSnapshots,
        linkedAssignmentId: doc.linkedAssignmentId ?? null,
        createdAt: activeVersion.finalizedAt,
        updatedAt: activeVersion.finalizedAt,
      };
      const rebuilt = await renderOfficialDocumentPdf({
        draft: syntheticDraft,
        content: activeVersion.snapshotContent,
        pageSettings: activeVersion.snapshotPageSettings,
        state,
        officialNumber: activeVersion.documentNumber,
      });
      triggerPdfBytesDownload(rebuilt.pdfBytes, safeName);
      onNotify?.(
        `PDF final "${safeName}" direkonstruksi dari snapshot versi ${activeVersion.versionNumber} dan diunduh.`,
        'info'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengunduh PDF final.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleArchiveToggle = async () => {
    setIsBusy(true);
    try {
      const result =
        doc.status === 'ARCHIVED'
          ? restoreArchivedDocumentInState(state, doc.id)
          : archiveDocumentInState(state, doc.id);
      await onPersistState(result.state);
      onNotify?.(
        doc.status === 'ARCHIVED'
          ? `Dokumen "${doc.title}" dipulihkan dari Arsip ke status Final.`
          : `Dokumen "${doc.title}" berhasil diarsipkan secara aman.`,
        'success'
      );
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengubah status arsip.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateRevision = async () => {
    if (!revisionReason.trim() || revisionReason.trim().length < 4) {
      onNotify?.('Alasan revisi wajib diisi minimal 4 karakter.', 'warning');
      return;
    }
    setIsBusy(true);
    try {
      const rev = createRevisionDraftInState(state, {
        sourceDocumentId: doc.id,
        sourceVersionId: activeVersion?.id ?? null,
        revisionReason: revisionReason.trim(),
      });
      await onPersistState(rev.state);
      setRevisionModalOpen(false);
      setRevisionReason('');
      onNotify?.(
        `Draft revisi v${rev.revisionDocument.versionNumber} dibuat secara non-destruktif; versi resmi lama tetap utuh.`,
        'success'
      );
      onOpenRevisionInStudio?.(rev.revisionDraft.id);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal membuat revisi dokumen.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleAttachmentFileSelect = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setIsBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const res = await attachFileToDocumentInState({
        state,
        documentId: doc.id,
        versionId: activeVersion?.id ?? null,
        fileName: file.name,
        declaredMimeType: file.type,
        bytes,
      });
      await onPersistState(res.state);
      onNotify?.(
        `Lampiran "${res.attachment.fileName}" (${formatBytesReadable(res.attachment.sizeBytes)}) lolos validasi magic bytes & disimpan.`,
        'success'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah lampiran.';
      setUploadError(msg);
      onNotify?.(msg, 'error');
    } finally {
      setIsBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownloadAttachment = async (att: DocumentAttachmentMeta) => {
    try {
      const found = await getBinaryBlob(att.storageKey);
      if (!found) {
        onNotify?.('Blob lampiran tidak ditemukan di penyimpanan lokal browser ini.', 'warning');
        return;
      }
      triggerBinaryDownload(found.bytes, att.fileName, att.mimeType);
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal mengunduh lampiran.', 'error');
    }
  };

  const handlePreviewAttachmentSafe = async (att: DocumentAttachmentMeta) => {
    if (!isSafeRasterPreviewMime(att.mimeType)) {
      onNotify?.(
        'Pratinjau inline hanya diizinkan untuk gambar raster (PNG/JPG/WEBP). Gunakan tombol Unduh untuk PDF/DOCX demi keamanan (anti-HTML aktif).',
        'info'
      );
      return;
    }
    const found = await getBinaryBlob(att.storageKey);
    if (!found) {
      onNotify?.('Blob gambar lampiran tidak ditemukan di penyimpanan lokal.', 'warning');
      return;
    }
    if (rasterPreview?.url) URL.revokeObjectURL(rasterPreview.url);
    const copy = new Uint8Array(found.bytes.byteLength);
    copy.set(found.bytes);
    const blob = new Blob([copy.buffer], { type: att.mimeType });
    const url = URL.createObjectURL(blob);
    setRasterPreview({ fileName: att.fileName, url, mimeType: att.mimeType });
  };

  const handleRemoveAttachment = async (att: DocumentAttachmentMeta) => {
    setIsBusy(true);
    try {
      const res = await removeAttachmentFromDocumentInState({
        state,
        attachmentId: att.id,
      });
      await onPersistState(res.state);
      onNotify?.(`Lampiran "${att.fileName}" dihapus dari draft.`, 'info');
    } catch (err) {
      onNotify?.(err instanceof Error ? err.message : 'Gagal menghapus lampiran.', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="s06-shell" aria-label="S06 Detail Dokumen dan Arsip Digital">
      {/* Top Action Bar */}
      <header className="s06-topbar">
        <div className="s06-topbar-left">
          <span className="s06-kicker">S06 · DETAIL DOKUMEN &amp; ARSIP DIGITAL</span>
          <div className="s06-title-row">
            <h1>{doc.title}</h1>
            <span className={`s01-status-label status-${doc.status}`}>
              {DOCUMENT_STATUS_LABELS[doc.status]}
            </span>
            {activeVersion && (
              <span className="s02-code-tag s5-tnum">v{activeVersion.versionNumber}</span>
            )}
          </div>
          <div className="s06-subline s5-tnum">
            <span>
              Nomor: <strong>{doc.documentNumber ?? 'Belum Bernomor'}</strong>
            </span>
            <span>· {DOCUMENT_KIND_LABELS[doc.documentType]}</span>
            <span>· Tanggal: {formatIndonesianDate(doc.documentDate)}</span>
            {doc.archivedAt && <span>· Diarsipkan: {doc.archivedAt.slice(0, 10)}</span>}
          </div>
        </div>

        <div className="s06-topbar-actions">
          <button type="button" className="s02-btn-secondary" onClick={onBackToCenter}>
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Kembali ke Arsip</span>
          </button>

          {doc.status === 'DRAFT' && linkedDraft && onOpenStudio && (
            <button
              type="button"
              className="s02-btn-primary"
              onClick={() => onOpenStudio(linkedDraft.id)}
            >
              <FileEdit size={14} aria-hidden="true" />
              <span>Lanjutkan S04</span>
            </button>
          )}

          {isOfficial && activeVersion && (
            <button
              type="button"
              className="s02-btn-primary"
              disabled={isBusy}
              onClick={() => void handleDownloadFinalPdf()}
            >
              <Download size={14} aria-hidden="true" />
              <span>Unduh PDF Final</span>
            </button>
          )}

          {isOfficial && (
            <>
              <button
                type="button"
                className="s02-btn-secondary"
                disabled={isBusy}
                onClick={() => setRevisionModalOpen(true)}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Buat Revisi</span>
              </button>
              <button
                type="button"
                className="s02-btn-secondary"
                disabled={isBusy}
                onClick={() => void handleArchiveToggle()}
              >
                {doc.status === 'ARCHIVED' ? (
                  <>
                    <ArchiveRestore size={14} aria-hidden="true" />
                    <span>Pulihkan dari Arsip</span>
                  </>
                ) : (
                  <>
                    <Archive size={14} aria-hidden="true" />
                    <span>Arsipkan</span>
                  </>
                )}
              </button>
            </>
          )}

          {onSaveAsTemplate && (
            <button
              type="button"
              className="s02-btn-secondary"
              onClick={() => onSaveAsTemplate(doc.id)}
            >
              <FileCheck2 size={14} aria-hidden="true" />
              <span>Jadikan Template (Sanitasi PII)</span>
            </button>
          )}
        </div>
      </header>

      {/* Sub-tabs */}
      <div className="s06-tabs-bar">
        <div className="s06-tablist" role="tablist" aria-label="Bagian Detail Arsip S06">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'overview'}
            className={`s06-tab ${activeTab === 'overview' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FileText size={14} aria-hidden="true" />
            <span>Pratinjau Dokumen</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'metadata'}
            className={`s06-tab ${activeTab === 'metadata' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('metadata')}
          >
            <Database size={14} aria-hidden="true" />
            <span>Metadata &amp; Sumber Data ({sourceSnapshots.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'attachments'}
            className={`s06-tab ${activeTab === 'attachments' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('attachments')}
          >
            <Paperclip size={14} aria-hidden="true" />
            <span>Lampiran ({attachments.length})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'versions'}
            className={`s06-tab ${activeTab === 'versions' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('versions')}
          >
            <History size={14} aria-hidden="true" />
            <span>Riwayat Versi ({versionChain?.versions.length ?? 0})</span>
          </button>
        </div>

        {onOpenPreview && (linkedDraft || activeVersion) && (
          <button
            type="button"
            className="s02-icon-btn"
            onClick={() =>
              onOpenPreview({
                documentId: doc.id,
                draftId: linkedDraft?.id ?? null,
                versionId: activeVersion?.id ?? null,
              })
            }
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>Buka Layar S05</span>
          </button>
        )}
      </div>

      {/* Main Content + Rail */}
      <div className="s06-grid">
        {/* Left Primary Pane */}
        <div className="s06-card">
          {activeTab === 'overview' && (
            <>
              <h2>
                <FileText size={15} aria-hidden="true" />
                <span>
                  {activeVersion
                    ? `Snapshot Naskah Resmi v${activeVersion.versionNumber} (Baca-Saja)`
                    : 'Pratinjau Naskah Draft'}
                </span>
              </h2>
              {previewContent ? (
                <div
                  style={{
                    border: '1px solid #d4dfd9',
                    borderRadius: '10px',
                    padding: '20px 24px',
                    background: '#ffffff',
                    fontFamily: 'Georgia, "Times New Roman", serif',
                    color: '#152b29',
                  }}
                >
                  {(activeVersion?.templateSnapshot ?? linkedDraft?.templateSnapshot)?.documentHeader
                    .includeKopSurat && (
                    <div
                      style={{
                        borderBottom: '2px solid #124037',
                        paddingBottom: '8px',
                        marginBottom: '12px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '11px', fontWeight: 700 }}>
                        {state.settings.ministry || 'KEMENTERIAN AGAMA REPUBLIK INDONESIA'}
                      </div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#124037' }}>
                        {state.settings.schoolName}
                      </div>
                    </div>
                  )}
                  {renderStaticNodes(previewContent.content)}
                </div>
              ) : (
                <div className="s01-notice-box">
                  Naskah Document Studio belum tersimpan untuk dokumen ini. Buka S04 untuk menyunting isi naskah.
                </div>
              )}
            </>
          )}

          {activeTab === 'metadata' && (
            <>
              <h2>
                <Database size={15} aria-hidden="true" />
                <span>Metadata Administrasi &amp; Jejak Snapshot Sumber</span>
              </h2>
              <dl className="s06-meta-dl">
                <div className="s06-meta-item">
                  <dt>ID Dokumen</dt>
                  <dd style={{ fontFamily: 'var(--font-mono)' }}>{doc.id}</dd>
                </div>
                <div className="s06-meta-item">
                  <dt>Nomor Surat Resmi</dt>
                  <dd>{doc.documentNumber ?? 'Belum Bernomor'}</dd>
                </div>
                <div className="s06-meta-item is-wide">
                  <dt>Perihal</dt>
                  <dd>{doc.subject || '—'}</dd>
                </div>
                <div className="s06-meta-item">
                  <dt>Pihak / Penerima Terkait</dt>
                  <dd>{[doc.counterpartName, ...relatedTeachers].filter(Boolean).join(' · ') || '—'}</dd>
                </div>
                <div className="s06-meta-item">
                  <dt>Rujukan ScheduleVersion</dt>
                  <dd style={{ fontFamily: 'var(--font-mono)' }}>
                    {activeVersion?.scheduleVersionId ?? doc.scheduleVersionId ?? 'Tidak terkait jadwal'}
                  </dd>
                </div>
                {activeVersion && (
                  <>
                    <div className="s06-meta-item is-wide">
                      <dt>Checksum SHA-256 PDF Final</dt>
                      <dd style={{ fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>
                        {activeVersion.pdfChecksum}
                      </dd>
                    </div>
                    <div className="s06-meta-item">
                      <dt>Disahkan Pada</dt>
                      <dd className="s5-tnum">{activeVersion.finalizedAt}</dd>
                    </div>
                    <div className="s06-meta-item">
                      <dt>Ukuran &amp; Halaman PDF</dt>
                      <dd className="s5-tnum">
                        {formatBytesReadable(activeVersion.pdfSizeBytes)} · {activeVersion.pdfPageCount} hal
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              <h2 style={{ marginTop: '6px' }}>
                <ShieldCheck size={15} aria-hidden="true" />
                <span>Daftar Snapshot Sumber Data ({sourceSnapshots.length})</span>
              </h2>
              {sourceSnapshots.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12.5px', color: '#526861' }}>
                  Belum ada catatan snapshot sumber data pada dokumen ini.
                </p>
              ) : (
                <div className="s06-attachment-list">
                  {sourceSnapshots.map((snap, idx) => (
                    <div key={`${snap.sourceKey}-${idx}`} className="s06-attachment-row">
                      <div className="s06-attachment-info">
                        <strong>{snap.sourceLabel}</strong>
                        <small>
                          Kunci: <code>{snap.sourceKey}</code> · Status: {snap.status} · Diambil:{' '}
                          <span className="s5-tnum">{snap.capturedAt}</span>
                        </small>
                      </div>
                      <span className="s02-code-tag">
                        {snap.provenance === 'AUTO_SYSTEM' ? 'Otomatis Sistem' : 'Input Operator'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'attachments' && (
            <>
              <h2>
                <Paperclip size={15} aria-hidden="true" />
                <span>Lampiran Dokumen (Validasi Magic Bytes &amp; Blob Store)</span>
              </h2>

              <div className="s06-upload-box">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <strong style={{ fontSize: '13px', color: '#0b2923' }}>
                    Tambahkan Lampiran Resmi (PDF, PNG, JPG, WEBP, DOCX · maks. 10 MB)
                  </strong>
                  <small style={{ fontSize: '11.5px', color: '#4c635d' }}>
                    Ekstensi, MIME type, ukuran, dan magic bytes biner diverifikasi otomatis. HTML/SVG/skrip aktif ditolak.
                  </small>
                </div>
                <label className="s02-btn-primary" style={{ cursor: 'pointer' }}>
                  <Upload size={14} aria-hidden="true" />
                  <span>Pilih Berkas</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.docx"
                    style={{ display: 'none' }}
                    disabled={isBusy}
                    onChange={(e) => void handleAttachmentFileSelect(e.target.files?.[0])}
                  />
                </label>
              </div>

              {uploadError && (
                <div className="s01-alert-banner" role="alert">
                  <span>{uploadError}</span>
                </div>
              )}

              {rasterPreview && (
                <div className="s06-preview-raster-box" aria-label="Pratinjau aman gambar lampiran">
                  <div
                    style={{
                      width: '100%',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <strong style={{ fontSize: '12.5px', color: '#0b2923' }}>
                      Pratinjau Aman (Gambar Raster): {rasterPreview.fileName}
                    </strong>
                    <button
                      type="button"
                      className="s02-icon-btn"
                      onClick={() => {
                        URL.revokeObjectURL(rasterPreview.url);
                        setRasterPreview(null);
                      }}
                    >
                      <X size={13} /> Tutup
                    </button>
                  </div>
                  <img src={rasterPreview.url} alt={`Lampiran ${rasterPreview.fileName}`} />
                </div>
              )}

              {attachments.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12.5px', color: '#526861' }}>
                  Belum ada lampiran yang ditautkan pada dokumen ini.
                </p>
              ) : (
                <div className="s06-attachment-list">
                  {attachments.map((att) => (
                    <div key={att.id} className="s06-attachment-row">
                      <div className="s06-attachment-info">
                        <strong>{att.fileName}</strong>
                        <small className="s5-tnum">
                          {att.mimeType} · {formatBytesReadable(att.sizeBytes)} · SHA-256:{' '}
                          <code>{att.sha256.slice(0, 12)}…</code>
                          {att.isLocked ? ' · Terkunci (Resmi)' : ' · Draft'}
                        </small>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {isSafeRasterPreviewMime(att.mimeType) && (
                          <button
                            type="button"
                            className="s02-icon-btn"
                            onClick={() => void handlePreviewAttachmentSafe(att)}
                          >
                            <Eye size={13} aria-hidden="true" />
                            <span>Pratinjau</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="s02-icon-btn"
                          onClick={() => void handleDownloadAttachment(att)}
                        >
                          <Download size={13} aria-hidden="true" />
                          <span>Unduh</span>
                        </button>
                        {!att.isLocked && doc.status === 'DRAFT' && (
                          <button
                            type="button"
                            className="s02-icon-btn"
                            style={{ color: '#8f2d24', borderColor: '#e2b5af' }}
                            disabled={isBusy}
                            onClick={() => void handleRemoveAttachment(att)}
                          >
                            <Trash2 size={13} aria-hidden="true" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === 'versions' && (
            <>
              <h2>
                <History size={15} aria-hidden="true" />
                <span>Riwayat Versi Non-Destruktif</span>
              </h2>
              {!versionChain || versionChain.versions.length === 0 ? (
                <p style={{ margin: 0, fontSize: '12.5px', color: '#526861' }}>
                  Dokumen ini belum memiliki versi resmi yang disahkan. Selesaikan dan sahkan dokumen melalui S05.
                </p>
              ) : (
                <div className="s06-attachment-list">
                  {versionChain.versions.map((ver) => {
                    const isCurrent = activeVersion?.id === ver.id;
                    return (
                      <div
                        key={ver.id}
                        className="s06-attachment-row"
                        style={{
                          borderColor: isCurrent ? '#124037' : '#d5e0db',
                          background: isCurrent ? '#f1f8f5' : '#fbfdfc',
                        }}
                      >
                        <div className="s06-attachment-info">
                          <strong>
                            Versi {ver.versionNumber} · {ver.documentNumber} ({ver.status})
                          </strong>
                          <small className="s5-tnum">
                            Disahkan: {ver.finalizedAt} · PDF SHA-256: <code>{ver.pdfChecksum.slice(0, 14)}…</code>
                            {ver.revisionReason ? ` · Alasan: ${ver.revisionReason}` : ''}
                          </small>
                        </div>
                        <button
                          type="button"
                          className="s02-icon-btn"
                          onClick={() => {
                            setSelectedVersionId(ver.id);
                            setActiveTab('overview');
                          }}
                        >
                          <Eye size={13} aria-hidden="true" />
                          <span>{isCurrent ? 'Aktif' : 'Tampilkan'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Governance Rail */}
        <aside className="s06-card" aria-label="Ringkasan Tata Kelola & Proteksi Arsip">
          <h2>
            <LockKeyhole size={15} aria-hidden="true" />
            <span>Tata Kelola &amp; Proteksi Arsip</span>
          </h2>

          <div className="s06-protection-box">
            <ShieldCheck size={17} style={{ color: '#124037', flexShrink: 0, marginTop: '2px' }} />
            <div>
              {deleteCheck.allowed ? (
                <>
                  <strong>Status Draft Lokal:</strong> Dokumen belum bernomor dan masih dapat disunting atau dihapus bila tidak diperlukan.
                </>
              ) : (
                <>
                  <strong>Dilindungi dari Penghapusan Tidak Sengaja:</strong> {deleteCheck.reason}
                </>
              )}
            </div>
          </div>

          <dl className="s06-meta-dl" style={{ gridTemplateColumns: '1fr' }}>
            <div className="s06-meta-item">
              <dt>Template Sumber</dt>
              <dd>
                {activeVersion?.templateSnapshot.name ??
                  linkedDraft?.templateSnapshot.name ??
                  doc.templateId ??
                  'Manual / Arsip'}
              </dd>
            </div>
            <div className="s06-meta-item">
              <dt>Total Lampiran Terverifikasi</dt>
              <dd className="s5-tnum">{attachments.length} berkas</dd>
            </div>
            <div className="s06-meta-item">
              <dt>Total Versi Resmi</dt>
              <dd className="s5-tnum">{versionChain?.versions.length ?? 0} versi</dd>
            </div>
          </dl>

          {deleteCheck.allowed && onDeleteDraft && (
            <button
              type="button"
              className="s01-btn-danger-outline s06-btn-danger-lock"
              onClick={() =>
                void onDeleteDraft({
                  draftId: doc.intakeDraftId ?? null,
                  documentId: doc.id,
                })
              }
            >
              <Trash2 size={14} aria-hidden="true" />
              <span>Hapus Draft Belum Bernomor</span>
            </button>
          )}
        </aside>
      </div>

      {/* Non-Destructive Revision Modal */}
      {revisionModalOpen && (
        <div
          className="s01-modal-scrim"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !isBusy) setRevisionModalOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !isBusy) {
              e.stopPropagation();
              setRevisionModalOpen(false);
            }
          }}
        >
          <div
            className="s01-modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="s06-revision-modal-title"
          >
            <div className="s01-modal-head">
              <div className="s01-modal-title-wrap">
                <div className="s01-modal-icon" aria-hidden="true">
                  <RotateCcw size={19} />
                </div>
                <div>
                  <h2 id="s06-revision-modal-title">Buat Revisi Non-Destruktif</h2>
                  <p>Versi resmi yang telah disahkan tetap utuh sebagai arsip baca-saja.</p>
                </div>
              </div>
              <button
                type="button"
                className="s01-modal-close"
                aria-label="Tutup modal revisi"
                onClick={() => setRevisionModalOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <div className="s01-modal-body">
              <label
                htmlFor="s06-revision-reason"
                style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, marginBottom: '6px' }}
              >
                Alasan Pembuatan Revisi (wajib)
              </label>
              <input
                ref={revisionInputRef}
                id="s06-revision-reason"
                type="text"
                className="s02-search-input"
                style={{ paddingLeft: '12px' }}
                placeholder="Misal: Pembaruan rincian jadwal atau koreksi redaksi surat"
                value={revisionReason}
                onChange={(e) => setRevisionReason(e.target.value)}
              />
            </div>
            <div className="s01-modal-foot" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="s02-btn-secondary"
                disabled={isBusy}
                onClick={() => setRevisionModalOpen(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="s02-btn-primary"
                disabled={isBusy || revisionReason.trim().length < 4}
                onClick={() => void handleCreateRevision()}
              >
                <RotateCcw size={14} aria-hidden="true" />
                <span>Buat Draft Revisi Baru</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
