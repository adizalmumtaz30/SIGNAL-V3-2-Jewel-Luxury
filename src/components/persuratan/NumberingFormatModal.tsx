import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Hash, RotateCcw, X } from 'lucide-react';
import type { AppState } from '../../domain/types';
import type {
  DocumentKind,
  DocumentNumberingConfig,
  NumberingResetMode,
} from '../../domain/persuratan/types';
import { DOCUMENT_KIND_LABELS } from '../../domain/persuratan/selectors';
import {
  DEFAULT_KIND_CODES,
  DEFAULT_NUMBERING_PATTERN,
  computeNextSequentialNumber,
  normalizeDocumentNumberingConfig,
} from '../../domain/persuratan/finalization/numberingEngine';
import './NumberingFormatModal.css';

export interface NumberingFormatModalProps {
  open: boolean;
  state: AppState;
  previewKind?: DocumentKind;
  onClose: () => void;
  onSaveConfig: (nextConfig: DocumentNumberingConfig) => Promise<void> | void;
}

const PATTERN_PRESETS: Array<{ label: string; pattern: string }> = [
  {
    label: 'Standar Madrasah',
    pattern: '{SEQ}/{KODE_SURAT}/{KODE_MADRASAH}/{BULAN_ROMAWI}/{TAHUN}',
  },
  {
    label: 'Format Kemenag (PMA)',
    pattern: 'B-{SEQ}/{KODE_MADRASAH}/{KODE_SURAT}/{BULAN}/{TAHUN}',
  },
  {
    label: 'Ringkas Instansi',
    pattern: '{KODE_SURAT}.{SEQ}/{KODE_MADRASAH}/{TAHUN}',
  },
];

const PATTERN_TOKENS = [
  { token: '{SEQ}', label: 'No. Urut' },
  { token: '{KODE_SURAT}', label: 'Kode Jenis' },
  { token: '{KODE_MADRASAH}', label: 'Kode Madrasah' },
  { token: '{BULAN_ROMAWI}', label: 'Bulan Romawi' },
  { token: '{BULAN}', label: 'Bulan (01-12)' },
  { token: '{TAHUN}', label: 'Tahun' },
];

const EDITABLE_KINDS: DocumentKind[] = [
  'SK',
  'SURAT_TUGAS',
  'UNDANGAN',
  'SURAT_KETERANGAN',
  'SURAT_KELUAR',
  'BERITA_ACARA',
  'NOTULA',
  'LAPORAN',
];

export function NumberingFormatModal({
  open,
  state,
  previewKind = 'SURAT_TUGAS',
  onClose,
  onSaveConfig,
}: NumberingFormatModalProps) {
  const initial = useMemo(
    () => normalizeDocumentNumberingConfig(state.settings.documentNumbering, state.settings),
    [state.settings]
  );

  const [madrasahCode, setMadrasahCode] = useState(initial.madrasahCode);
  const [formatPattern, setFormatPattern] = useState(initial.formatPattern);
  const [seqPadding, setSeqPadding] = useState(initial.seqPadding);
  const [resetMode, setResetMode] = useState<NumberingResetMode>(initial.resetMode);
  const [startingSequence, setStartingSequence] = useState(initial.startingSequence ?? 1);
  const [separateSkSequence, setSeparateSkSequence] = useState(Boolean(initial.separateSkSequence));
  const [kindCodes, setKindCodes] = useState<Partial<Record<DocumentKind, string>>>({
    ...DEFAULT_KIND_CODES,
    ...initial.kindCodes,
  });
  const [isSaving, setIsSaving] = useState(false);

  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setMadrasahCode(initial.madrasahCode);
    setFormatPattern(initial.formatPattern);
    setSeqPadding(initial.seqPadding);
    setResetMode(initial.resetMode);
    setStartingSequence(initial.startingSequence ?? 1);
    setSeparateSkSequence(Boolean(initial.separateSkSequence));
    setKindCodes({ ...DEFAULT_KIND_CODES, ...initial.kindCodes });
    setTimeout(() => firstInputRef.current?.focus(), 20);
  }, [open, initial]);

  const draftConfig: DocumentNumberingConfig = useMemo(
    () =>
      normalizeDocumentNumberingConfig(
        {
          enabled: true,
          madrasahCode,
          formatPattern,
          seqPadding,
          resetMode,
          startingSequence,
          separateSkSequence,
          kindCodes,
        },
        state.settings
      ),
    [
      madrasahCode,
      formatPattern,
      seqPadding,
      resetMode,
      startingSequence,
      separateSkSequence,
      kindCodes,
      state.settings,
    ]
  );

  const livePreview = useMemo(
    () =>
      computeNextSequentialNumber({
        state,
        kind: previewKind,
        documentDate: new Date().toISOString().slice(0, 10),
        configOverride: draftConfig,
      }),
    [state, previewKind, draftConfig]
  );

  if (!open) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.resolve(onSaveConfig(draftConfig));
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDefault = () => {
    const def = normalizeDocumentNumberingConfig(
      {
        formatPattern: DEFAULT_NUMBERING_PATTERN,
        seqPadding: 3,
        resetMode: 'YEARLY',
        startingSequence: 1,
        separateSkSequence: false,
        kindCodes: { ...DEFAULT_KIND_CODES },
      },
      state.settings
    );
    setMadrasahCode(def.madrasahCode);
    setFormatPattern(def.formatPattern);
    setSeqPadding(def.seqPadding);
    setResetMode(def.resetMode);
    setStartingSequence(def.startingSequence ?? 1);
    setSeparateSkSequence(Boolean(def.separateSkSequence));
    setKindCodes({ ...DEFAULT_KIND_CODES });
  };

  return (
    <div
      className="nfm-scrim"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !isSaving) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !isSaving) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        className="nfm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nfm-modal-title"
      >
        <header className="nfm-head">
          <div>
            <h2 id="nfm-modal-title" className="nfm-title">
              Format Penomoran Surat
            </h2>
            <p className="nfm-subtitle">
              Sesuaikan pola nomor surat resmi sesuai tata naskah madrasah.
            </p>
          </div>
          <button
            type="button"
            className="nfm-close-btn"
            onClick={onClose}
            aria-label="Tutup pengaturan format nomor surat"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="nfm-body">
          {/* Live Result Preview */}
          <div className="nfm-preview-strip" aria-live="polite">
            <span className="nfm-preview-label">Pratinjau Nomor Berikutnya ({DOCUMENT_KIND_LABELS[previewKind]})</span>
            <strong className="nfm-preview-value s5-tnum">{livePreview.suggestedNumber}</strong>
          </div>

          {/* Core Settings */}
          <div className="nfm-grid-2">
            <div className="nfm-field">
              <label htmlFor="nfm-madrasah-code">Kode Madrasah / Satker</label>
              <input
                ref={firstInputRef}
                id="nfm-madrasah-code"
                type="text"
                className="nfm-input"
                value={madrasahCode}
                onChange={(e) => setMadrasahCode(e.target.value)}
                placeholder="Mis. MTs.DAH atau MTs.13.07"
              />
            </div>

            <div className="nfm-field">
              <label htmlFor="nfm-reset-mode">Siklus Reset Urutan</label>
              <select
                id="nfm-reset-mode"
                className="nfm-select"
                value={resetMode}
                onChange={(e) => setResetMode(e.target.value as NumberingResetMode)}
              >
                <option value="YEARLY">Reset Setiap Tahun</option>
                <option value="MONTHLY">Reset Setiap Bulan</option>
                <option value="CONTINUOUS">Berkelanjutan (Tanpa Reset)</option>
              </select>
            </div>
          </div>

          <div className="nfm-grid-2">
            <div className="nfm-field">
              <label htmlFor="nfm-start-seq">Nomor Urut Awal Periode</label>
              <input
                id="nfm-start-seq"
                type="number"
                min={1}
                max={999999}
                className="nfm-input s5-tnum"
                value={startingSequence}
                onChange={(e) => setStartingSequence(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div className="nfm-field">
              <label htmlFor="nfm-seq-pad">Jumlah Digit Urutan</label>
              <select
                id="nfm-seq-pad"
                className="nfm-select s5-tnum"
                value={seqPadding}
                onChange={(e) => setSeqPadding(Number(e.target.value) || 3)}
              >
                <option value={2}>2 digit (01)</option>
                <option value={3}>3 digit (001)</option>
                <option value={4}>4 digit (0001)</option>
              </select>
            </div>
          </div>

          <label className="nfm-checkbox-row" htmlFor="nfm-separate-sk">
            <input
              id="nfm-separate-sk"
              type="checkbox"
              checked={separateSkSequence}
              onChange={(e) => setSeparateSkSequence(e.target.checked)}
            />
            <span>
              <strong>Pisahkan buku nomor SK dari surat keluar umum</strong>
              <small>
                Nomor urut Surat Keputusan (SK) dihitung tersendiri, tidak tercampur dengan buku agenda surat keluar.
              </small>
            </span>
          </label>

          {/* Pattern Editor */}
          <div className="nfm-field">
            <div className="nfm-label-row">
              <label htmlFor="nfm-pattern">Pola Format Nomor</label>
              <div className="nfm-preset-row">
                {PATTERN_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={`nfm-preset-btn ${formatPattern === p.pattern ? 'is-active' : ''}`}
                    onClick={() => setFormatPattern(p.pattern)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <input
              id="nfm-pattern"
              type="text"
              className="nfm-input nfm-mono"
              value={formatPattern}
              onChange={(e) => setFormatPattern(e.target.value)}
            />
            <div className="nfm-token-row">
              {PATTERN_TOKENS.map((t) => (
                <button
                  key={t.token}
                  type="button"
                  className="nfm-token-btn"
                  onClick={() =>
                    setFormatPattern((prev) =>
                      prev.endsWith('/') || !prev.trim() ? `${prev}${t.token}` : `${prev}/${t.token}`
                    )
                  }
                >
                  + {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Classification Codes per Document Kind */}
          <div className="nfm-kinds-block">
            <div className="nfm-kinds-head">
              <Hash size={14} aria-hidden="true" />
              <span>Kode Klasifikasi per Jenis Surat</span>
            </div>
            <div className="nfm-kinds-grid">
              {EDITABLE_KINDS.map((kind) => (
                <div key={kind} className="nfm-kind-item">
                  <label htmlFor={`nfm-kind-${kind}`}>{DOCUMENT_KIND_LABELS[kind]}</label>
                  <input
                    id={`nfm-kind-${kind}`}
                    type="text"
                    className="nfm-input nfm-input-sm nfm-mono"
                    value={kindCodes[kind] ?? DEFAULT_KIND_CODES[kind]}
                    onChange={(e) =>
                      setKindCodes((prev) => ({
                        ...prev,
                        [kind]: e.target.value,
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <footer className="nfm-foot">
          <button
            type="button"
            className="nfm-ghost-btn"
            onClick={handleResetDefault}
            disabled={isSaving}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>Reset Bawaan</span>
          </button>

          <div className="nfm-foot-actions">
            <button
              type="button"
              className="nfm-sec-btn"
              onClick={onClose}
              disabled={isSaving}
            >
              Batal
            </button>
            <button
              type="button"
              className="nfm-pri-btn"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              <Check size={14} aria-hidden="true" />
              <span>{isSaving ? 'Menyimpan…' : 'Simpan Format'}</span>
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
