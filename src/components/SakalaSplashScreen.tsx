import { useEffect, useState } from 'react';

export interface SakalaSplashScreenProps {
  /** 'loading' stays visible until data resolves; 'intro' performs a brief luxury entrance & dissolves. */
  mode?: 'loading' | 'intro';
  /** Called after exit transition finishes in 'intro' mode. */
  onDone?: () => void;
}

export function SakalaSplashScreen({
  mode = 'loading',
  onDone,
}: SakalaSplashScreenProps) {
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (mode !== 'intro') return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      onDone?.();
      return;
    }

    const holdTimer = window.setTimeout(() => {
      setExiting(true);
    }, 920);

    const finishTimer = window.setTimeout(() => {
      onDone?.();
    }, 1260);

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        setExiting(true);
        window.setTimeout(() => onDone?.(), 260);
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.clearTimeout(holdTimer);
      window.clearTimeout(finishTimer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [mode, onDone]);

  const handleDismiss = () => {
    if (mode !== 'intro' || exiting) return;
    setExiting(true);
    window.setTimeout(() => onDone?.(), 260);
  };

  return (
    <div
      className={`sakala-splash ${exiting ? 'is-exiting' : ''} ${
        mode === 'intro' ? 'is-intro-overlay' : ''
      }`}
      role={mode === 'loading' ? 'status' : 'presentation'}
      aria-live="polite"
      aria-label="Memuat SAKALA"
      onClick={handleDismiss}
    >
      <div className="sakala-splash-atmosphere" aria-hidden="true" />
      <div className="sakala-splash-grid" aria-hidden="true" />

      <div className="sakala-splash-stage">
        <div className="sakala-splash-crest-wrap" aria-hidden="true">
          <div className="sakala-splash-aperture" />
          <div className="sakala-splash-tile">
            <img src="/sakala-mark.png" alt="" />
            <div className="sakala-splash-sheen" />
          </div>
        </div>

        <div className="sakala-splash-wordmark-group">
          <h1 className="sakala-splash-title">SAKALA</h1>
          <span className="sakala-splash-rule" aria-hidden="true" />
          <p className="sakala-splash-subtitle">
            {mode === 'loading'
              ? 'Menyiapkan ruang kerja madrasah'
              : 'Manajemen Akademik & Tata Naskah'}
          </p>
        </div>

        <div className="sakala-splash-rail" aria-hidden="true">
          <div
            className={`sakala-splash-rail-fill ${
              mode === 'intro' ? 'is-determinate' : 'is-indeterminate'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
