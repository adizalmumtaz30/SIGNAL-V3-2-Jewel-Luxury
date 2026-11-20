import { useMemo, useState } from 'react';
import { CheckCircle2, FileStack, Search, Users, X } from 'lucide-react';
import type { AppState } from '../../domain/types';
import type { DocumentTemplate } from '../../domain/persuratan/templates/types';
import type { IntakeFormValues } from '../../domain/persuratan/intake/types';
import {
  generateBatchDocumentsInState,
  parseManualRecipientsText,
  type BatchRecipientItem,
} from '../../domain/persuratan/intake/batchEngine';
import { computeNextSequentialNumber } from '../../domain/persuratan/finalization/numberingEngine';
import './BatchIssueModal.css';

export interface BatchIssueModalProps {
  open: boolean;
  state: AppState;
  template: DocumentTemplate;
  baseValues: IntakeFormValues;
  onClose: () => void;
  onPersistState: (nextState: AppState) => Promise<void>;
  onCompleted: (summary: { createdCount: number; finalizedCount: number }) => void;
  onNotify?: (message: string, kind?: 'success' | 'info' | 'warning' | 'error') => void;
}

export function BatchIssueModal({
  open,
  state,
  template,
  baseValues,
  onClose,
  onPersistState,
  onCompleted,
  onNotify,
}: BatchIssueModalProps) {
  const activeTeachers = useMemo(
    () => state.teachers.filter((t) => t.isActive),
    [state.teachers]
  );

  const defaultMode: 'teachers' | 'manual' =
    template.id === 'SYS-TPL-14' || template.id === 'SYS-TPL-15' ? 'manual' : 'teachers';

  const [sourceMode, setSourceMode] = useState<'teachers' | 'manual'>(defaultMode);
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [manualText, setManualText] = useState('');
  const [issueMode, setIssueMode] = useState<'draft' | 'finalize'>('draft');
  const [demoAck, setDemoAck] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const filteredTeachers = useMemo(() => {
    const q = teacherSearch.trim().toLowerCase();
    if (!q) return activeTeachers;
    return activeTeachers.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.code.toLowerCase().includes(q) ||
        (t.roleTitle ?? '').toLowerCase().includes(q)
    );
  }, [activeTeachers, teacherSearch]);

  const recipients: BatchRecipientItem[] = useMemo(() => {
    if (sourceMode === 'teachers') {
      return selectedTeacherIds
        .map((id) => activeTeachers.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t))
        .map((t) => ({
          id: t.id,
          label: t.name,
          teacherId: t.id,
        }));
    }
    return parseManualRecipientsText(manualText);
  }, [sourceMode, selectedTeacherIds, activeTeachers, manualText]);

  const sampleStartNumber = useMemo(() => {
    const docDate =
      typeof baseValues.documentDate === 'string' && baseValues.documentDate.trim()
        ? baseValues.documentDate
        : new Date().toISOString().slice(0, 10);
    return computeNextSequentialNumber({
      state,
      kind: template.documentKind,
      documentDate: docDate,
    });
  }, [state, template.documentKind, baseValues.documentDate]);

  if (!open) return null;

  const isDemoMode = state.dataMode === 'demo';
  const canSubmit =
    recipients.length > 0 &&
    !isProcessing &&
    (issueMode === 'draft' || !isDemoMode || demoAck);

  const toggleTeacher = (id: string) => {
    setSelectedTeacherIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (!canSubmit) return;
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const result = await generateBatchDocumentsInState({
        state,
        template,
        baseValues,
        recipients,
        finalizeImmediately: issueMode === 'finalize',
        demoAcknowledged: demoAck,
      });

      if (result.createdCount === 0) {
        const firstErr = result.errors[0]?.message ?? 'Tidak ada surat yang berhasil diterbitkan.';
        setErrorMsg(firstErr);
        return;
      }

      await onPersistState(result.state);
      const summaryMsg =
        result.finalizedCount > 0
          ? `${result.finalizedCount} surat resmi berhasil diterbitkan berurutan.`
          : `${result.createdCount} paket draft surat massal siap ditinjau di Arsip.`;
      onNotify?.(summaryMsg, 'success');
      onCompleted({
        createdCount: result.createdCount,
        finalizedCount: result.finalizedCount,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal menerbitkan surat massal.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="bim-scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isProcessing) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isProcessing) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="bim-dialog p5-modal-pop"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bim-modal-title"
      >
        <header className="bim-head">
          <div className="bim-head-title-wrap">
            <span className="bim-head-badge" aria-hidden="true">
              <FileStack size={18} />
            </span>
            <div>
              <h2 id="bim-modal-title" className="bim-title">
                Terbitkan Surat Massal
              </h2>
              <p className="bim-subtitle">
                {template.name} · Satu format untuk banyak penerima sekaligus
              </p>
            </div>
          </div>
          <button
            type="button"
            className="bim-close-btn"
            onClick={onClose}
            aria-label="Tutup dialog surat massal"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="bim-body">
          <div className="bim-step-block">
            <div className="bim-step-label">
              <span className="bim-step-num s5-tnum">1</span>
              <span>Sumber Daftar Penerima</span>
            </div>

            {/* Source Selector */}
            <div className="bim-segment" role="tablist" aria-label="Sumber penerima surat massal">
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === 'teachers'}
                className={`bim-seg-btn ${sourceMode === 'teachers' ? 'is-active' : ''}`}
                onClick={() => setSourceMode('teachers')}
              >
                <Users size={14} aria-hidden="true" />
                <span>Dari Daftar Guru ({selectedTeacherIds.length})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sourceMode === 'manual'}
                className={`bim-seg-btn ${sourceMode === 'manual' ? 'is-active' : ''}`}
                onClick={() => setSourceMode('manual')}
              >
                <FileStack size={14} aria-hidden="true" />
                <span>Tempel Daftar Nama (Siswa / Penerima)</span>
              </button>
            </div>

            {sourceMode === 'teachers' ? (
              <div className="bim-teacher-panel">
                <div className="bim-teacher-bar">
                  <div className="bim-search-wrap">
                    <Search size={14} className="bim-search-icon" aria-hidden="true" />
                    <input
                      type="search"
                      className="bim-input has-icon"
                      placeholder="Cari nama guru..."
                      value={teacherSearch}
                      onChange={(e) => setTeacherSearch(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="bim-mini-btn"
                    onClick={() => setSelectedTeacherIds(filteredTeachers.map((t) => t.id))}
                  >
                    Pilih Semua
                  </button>
                {selectedTeacherIds.length > 0 && (
                  <button
                    type="button"
                    className="bim-mini-btn"
                    onClick={() => setSelectedTeacherIds([])}
                  >
                    Kosongkan
                  </button>
                )}
              </div>
              <div className="bim-teacher-grid">
                {filteredTeachers.map((t) => {
                  const checked = selectedTeacherIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`bim-teacher-item ${checked ? 'is-checked' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTeacher(t.id)}
                      />
                      <span>
                        <strong>{t.name}</strong>
                        <small>{t.code}{t.roleTitle ? ` · ${t.roleTitle}` : ''}</small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bim-manual-panel">
              <label htmlFor="bim-manual-textarea" className="bim-field-label">
                Daftar Nama Penerima (1 nama per baris, opsional tambah <code>| NISN</code>)
              </label>
              <textarea
                id="bim-manual-textarea"
                className="bim-textarea"
                rows={6}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                placeholder={'Ahmad Fauzan | 0091234561\nSiti Rahmawati | 0091234562\nMuhammad Rizki | 0091234563'}
              />
            </div>
          )}
          </div>

          {/* Output Mode */}
          <div className="bim-step-block">
            <div className="bim-step-label">
              <span className="bim-step-num s5-tnum">2</span>
              <span>Mode Penerbitan Surat</span>
            </div>
            <div className="bim-mode-grid">
              <button
                type="button"
                className={`bim-mode-card ${issueMode === 'draft' ? 'is-active' : ''}`}
                onClick={() => setIssueMode('draft')}
              >
                <strong>Simpan sebagai Paket Draft</strong>
                <span>Dapat ditinjau ulang sebelum diberi nomor resmi.</span>
              </button>
              <button
                type="button"
                className={`bim-mode-card ${issueMode === 'finalize' ? 'is-active' : ''}`}
                onClick={() => setIssueMode('finalize')}
              >
                <strong>Sahkan &amp; Nomor Berurutan Otomatis</strong>
                <span className="s5-tnum">
                  Mulai dari {sampleStartNumber.suggestedNumber}
                </span>
              </button>
            </div>
          </div>

          {issueMode === 'finalize' && isDemoMode && (
            <label className="bim-demo-ack">
              <input
                type="checkbox"
                checked={demoAck}
                onChange={(e) => setDemoAck(e.target.checked)}
              />
              <span>Saya memahami paket massal ini memakai dataset simulasi demo.</span>
            </label>
          )}

          {errorMsg && (
            <div className="bim-error" role="alert">
              {errorMsg}
            </div>
          )}
        </div>

        <footer className="bim-foot">
          <span className="bim-count s5-tnum">
            {recipients.length} penerima siap diproses
          </span>
          <div className="bim-foot-actions">
            <button
              type="button"
              className="bim-sec-btn"
              onClick={onClose}
              disabled={isProcessing}
            >
              Batal
            </button>
            <button
              type="button"
              className="bim-pri-btn"
              disabled={!canSubmit}
              onClick={() => void handleGenerate()}
            >
              <CheckCircle2 size={15} aria-hidden="true" />
              <span>
                {isProcessing
                  ? 'Memproses paket…'
                  : issueMode === 'finalize'
                  ? `Terbitkan ${recipients.length} Surat Resmi`
                  : `Buat ${recipients.length} Draft Surat`}
              </span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
