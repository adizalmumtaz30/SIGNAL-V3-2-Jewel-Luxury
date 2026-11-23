import { useEffect, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Send,
  CheckCircle2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import type { ValidationIssue } from '../domain/types';
import { formatValidationCategoryLabel } from '../domain/validationLabels';

export type AiHealthStatus = 'checking' | 'available' | 'unavailable';

interface AiConflictHelperProps {
  issues: ValidationIssue[];
  geminiEnabledInSettings?: boolean;
  initialHealthAvailable?: boolean;
  onNavigateToScreen?: (screen: 'schedule' | 'master' | 'requirements' | 'settings') => void;
  compact?: boolean;
}

export function AiConflictHelper({
  issues,
  geminiEnabledInSettings = true,
  initialHealthAvailable,
  onNavigateToScreen,
  compact = false,
}: AiConflictHelperProps) {
  const [healthStatus, setHealthStatus] = useState<AiHealthStatus>(() => {
    if (!geminiEnabledInSettings) return 'unavailable';
    if (typeof initialHealthAvailable === 'boolean') {
      return initialHealthAvailable ? 'available' : 'unavailable';
    }
    return 'checking';
  });
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState('');
  const [lastAskedQuestion, setLastAskedQuestion] = useState<string | null>(null);

  useEffect(() => {
    if (!geminiEnabledInSettings) {
      setHealthStatus('unavailable');
      return;
    }
    if (typeof initialHealthAvailable === 'boolean') {
      setHealthStatus(initialHealthAvailable ? 'available' : 'unavailable');
      return;
    }
    if (typeof window === 'undefined' || typeof fetch !== 'function') {
      setHealthStatus('unavailable');
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setHealthStatus('checking');

    fetch('/api/health', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) return { aiAvailable: false };
        return (await res.json()) as { ok?: boolean; aiAvailable?: boolean };
      })
      .then((data) => {
        if (!cancelled) {
          setHealthStatus(data?.aiAvailable === true ? 'available' : 'unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHealthStatus('unavailable');
        }
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [geminiEnabledInSettings, initialHealthAvailable]);

  const canInvokeAi = geminiEnabledInSettings && healthStatus === 'available';
  const hardErrors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  const handleAskAI = async (overrideQuestion?: string) => {
    if (!canInvokeAi) return;
    setLoading(true);
    setErrorMessage(null);

    const trimmedCustom = customQuestion.trim();
    const questionToSend =
      overrideQuestion ||
      trimmedCustom ||
      'Jelaskan akar penyebab bentrok di atas dan berikan 1-3 langkah perbaikan paling aman bagi operator.';

    const topIssues = (hardErrors.length ? hardErrors : warnings).slice(0, 6);
    const issueSummary =
      topIssues.length > 0
        ? topIssues
            .map(
              (i, idx) =>
                `${idx + 1}. (${formatValidationCategoryLabel(i.code)}) ${i.title}: ${i.message}. Konteks: ${i.context || 'Jadwal'} (Tindakan awal: ${
                  i.action || 'Periksa alokasi'
                })`
            )
            .join('\n')
        : 'Tidak ada bentrok keras terdeteksi pada jadwal.';

    try {
      const res = await fetch('/api/ai/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issue: issueSummary,
          question: questionToSend,
        }),
      });

      const data = (await res.json()) as { answer?: string; error?: string };
      if (!res.ok) {
        if (res.status === 503) {
          setHealthStatus('unavailable');
        }
        throw new Error(data.error || `Permintaan ke asisten AI gagal (${res.status}).`);
      }
      setAnswer(data.answer || 'Asisten tidak mengembalikan tanggapan.');
      setLastAskedQuestion(questionToSend);
      setCustomQuestion('');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Asisten AI sementara tidak dapat merespons. Sistem deterministik SAKALA tetap berjalan normal.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`ai-conflict-helper-box s5-ai-helper ${compact ? 'is-compact' : ''}`}>
      {/* Header with live-verified /api/health status badge */}
      <div className="s5-ai-helper-head">
        <div className="s5-ai-helper-brand">
          <div className="s5-ai-helper-icon" aria-hidden="true">
            <Sparkles size={16} />
          </div>
          <div>
            <h4 className="s5-ai-helper-title">Asisten Analisis Konflik (Gemini)</h4>
            <span className="s5-ai-helper-sub">
              Konsultasi pemecahan bentrok jadwal &amp; saran alternatif
            </span>
          </div>
        </div>

        <div aria-live="polite">
          {!geminiEnabledInSettings ? (
            <span className="s5-ai-status-pill is-off">AI Standby (OFF)</span>
          ) : healthStatus === 'checking' ? (
            <span className="s5-ai-status-pill is-checking">
              <RefreshCw size={12} className="spin-animation" /> Memeriksa Server AI…
            </span>
          ) : healthStatus === 'available' ? (
            <span className="s5-ai-status-pill is-active">
              <CheckCircle2 size={12} /> AI Aktif
            </span>
          ) : (
            <span className="s5-ai-status-pill is-unavailable">
              <AlertTriangle size={12} /> Server AI Belum Terhubung
            </span>
          )}
        </div>
      </div>

      {/* Honest Server Availability Banner when inactive or unreachable */}
      {(!geminiEnabledInSettings || healthStatus === 'unavailable') && (
        <div className="s5-ai-unavailable-banner" role="status">
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true" />
          <div>
            {!geminiEnabledInSettings
              ? 'Asisten AI nonaktif. Pemeriksaan jadwal tetap berjalan otomatis.'
              : 'Layanan AI pada server belum terhubung.'}
          </div>
        </div>
      )}

      {/* Description / Info */}
      <p className="s5-ai-helper-desc">
        Bantuan saran langkah perbaikan konflik jadwal.{' '}
        <strong>Keputusan akhir tetap mengacu pada aturan jadwal.</strong>
      </p>

      {/* Trigger Buttons */}
      <div className="s5-ai-helper-actions">
        <button
          type="button"
          className="button button-primary button-sm"
          onClick={() => handleAskAI()}
          disabled={loading || !canInvokeAi}
        >
          {loading ? (
            <>
              <RefreshCw size={14} className="spin-animation" /> Menganalisis…
            </>
          ) : (
            <>
              <Sparkles size={14} /> Minta Saran Penyelesaian
            </>
          )}
        </button>

        {hardErrors.length > 0 && (
          <button
            type="button"
            className="button button-secondary button-sm"
            onClick={() =>
              handleAskAI(
                'Fokus pada bentrok guru dan bentrok jam KBM: guru mana yang paling mendesak dipindahkan jamnya?'
              )
            }
            disabled={loading || !canInvokeAi}
          >
            Prioritaskan Bentrok Guru
          </button>
        )}
      </div>

      {/* Operator Custom Question Box */}
      <div className="s5-ai-query-row">
        <input
          type="text"
          className="s5-ai-query-input"
          placeholder={
            canInvokeAi
              ? "Tanyakan spesifik ke AI (misal: 'Bagaimana menukar jam di kelas VIIA?')"
              : 'Pertanyaan AI tersedia saat Server AI aktif'
          }
          value={customQuestion}
          onChange={(e) => setCustomQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && customQuestion.trim() && !loading && canInvokeAi) {
              e.preventDefault();
              handleAskAI();
            }
          }}
          disabled={loading || !canInvokeAi}
        />
        <button
          type="button"
          className="button button-secondary button-sm"
          disabled={loading || !canInvokeAi || !customQuestion.trim()}
          onClick={() => handleAskAI()}
        >
          <Send size={13} /> Tanya
        </button>
      </div>

      {/* Error state */}
      {errorMessage && (
        <div className="s5-ai-error-box">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}>
            <AlertTriangle size={15} /> Bantuan AI Tidak Tersedia
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '11.5px', color: '#68251c' }}>{errorMessage}</p>
        </div>
      )}

      {/* AI Answer Box */}
      {answer && (
        <div className="s5-ai-answer-box">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
              borderBottom: '1px solid #eef2ed',
              paddingBottom: '6px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={14} color="#124037" />
              <strong style={{ fontSize: '12px', color: '#0b2923' }}>Rekomendasi Penyelesaian</strong>
            </div>
            {lastAskedQuestion && (
              <span style={{ fontSize: '11px', color: '#526861' }}>
                Topik: &quot;{lastAskedQuestion.slice(0, 45)}…&quot;
              </span>
            )}
          </div>

          <div style={{ fontSize: '12.5px', color: '#28473e', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {answer}
          </div>

          <div
            style={{
              marginTop: '10px',
              paddingTop: '8px',
              borderTop: '1px dashed #e2e8df',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '11.5px',
              color: '#526861',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <ShieldCheck size={13} color="#124037" aria-hidden="true" />
              Verifikasi perubahan dengan tombol <strong>Uji Ulang Jadwal</strong>.
            </span>
            {onNavigateToScreen && (
              <button
                type="button"
                className="text-link"
                onClick={() => onNavigateToScreen('schedule')}
              >
                Buka Meja Jadwal <ArrowRight size={13} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
