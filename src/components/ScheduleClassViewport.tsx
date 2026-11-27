import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Minus, Plus } from 'lucide-react';

export interface ScheduleClassViewportProps {
  classNameValue: string;
  levelLabel: string;
  filledCount: number;
  requiredCount: number;
  variant: 'matrix' | 'single';
  minZoomPct?: number;
  maxZoomPct?: number;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function ScheduleClassViewport({
  classNameValue,
  levelLabel,
  filledCount,
  requiredCount,
  variant,
  minZoomPct = 45,
  maxZoomPct = 135,
  headerExtra,
  children,
}: ScheduleClassViewportProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualZoomPct, setManualZoomPct] = useState<number>(100);
  const [isZoomActive, setIsZoomActive] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(variant === 'single' ? 920 : 500);
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = el.clientWidth;
      if (next > 60) setContainerWidth(next);
    };
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMaximized, variant]);

  const innerAvailableWidth = Math.max(220, containerWidth - (isMaximized ? 32 : 8));
  const minTableWidth = variant === 'single' ? 740 : 650;
  const tableBaseWidth =
    variant === 'single' || isMaximized
      ? Math.max(minTableWidth, innerAvailableWidth)
      : minTableWidth;

  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateContent = () => {
      const w = el.offsetWidth || tableBaseWidth;
      const h = el.offsetHeight || 420;
      setContentSize((prev) =>
        prev && prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };
    updateContent();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateContent);
    ro.observe(el);
    return () => ro.disconnect();
  }, [tableBaseWidth, isMaximized, children]);

  useEffect(() => {
    if (!isMaximized) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setIsMaximized(false);
        setZoomMode('fit');
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isMaximized]);

  const rawFitScale = innerAvailableWidth / tableBaseWidth;
  const fitZoomPct = Math.round(Math.min(100, Math.max(minZoomPct, rawFitScale * 100)));
  const activeZoomPct =
    zoomMode === 'fit'
      ? fitZoomPct
      : Math.min(maxZoomPct, Math.max(minZoomPct, manualZoomPct));
  const scale = activeZoomPct / 100;

  const handleToggleMaximize = useCallback(() => {
    setIsMaximized((prev) => {
      const next = !prev;
      if (next) {
        setManualZoomPct(100);
        setZoomMode('manual');
      } else {
        setZoomMode('fit');
      }
      return next;
    });
  }, []);

  const handleSliderChange = useCallback((nextPct: number) => {
    setManualZoomPct(nextPct);
    setZoomMode('manual');
  }, []);

  const handleStepZoom = useCallback(
    (delta: number) => {
      const base = zoomMode === 'fit' ? fitZoomPct : manualZoomPct;
      const clamped = Math.min(maxZoomPct, Math.max(minZoomPct, Math.round((base + delta) / 5) * 5));
      setManualZoomPct(clamped);
      setZoomMode('manual');
    },
    [zoomMode, fitZoomPct, manualZoomPct, minZoomPct, maxZoomPct],
  );

  const naturalWidth = contentSize?.width ?? tableBaseWidth;
  const naturalHeight = contentSize?.height ?? 420;
  const scaledWidth = Math.max(120, Math.round(naturalWidth * scale));
  const scaledHeight = Math.max(120, Math.round(naturalHeight * scale));

  const blockNode = (
    <div
      className={`master-class-weekly-block scv-class-block ${
        variant === 'single' ? 'is-single-full' : 'is-matrix-card'
      } ${isMaximized ? 'is-maximized' : ''}`}
    >
      <div className="master-class-block-header">
        <div className="class-identity">
          <h4 className="class-name">Kelas {classNameValue}</h4>
          <span className="class-level-tag">{levelLabel}</span>
        </div>
        <div className="class-stats">
          <span className="jp-counter">
            {filledCount} / {requiredCount > 0 ? requiredCount : filledCount} JP
          </span>
          {headerExtra}
          <button
            type="button"
            className={`lpv-max-btn scv-max-btn s5-tooltip-end s5-tooltip-bottom ${isMaximized ? 'is-active' : ''}`}
            onClick={handleToggleMaximize}
            aria-label={
              isMaximized
                ? `Perkecil tampilan jadwal Kelas ${classNameValue}`
                : `Maksimalkan tampilan jadwal Kelas ${classNameValue}`
            }
            data-s5-tooltip={
              isMaximized
                ? 'Perkecil (Esc)'
                : `Maksimalkan Kelas ${classNameValue}`
            }
          >
            {isMaximized ? (
              <Minimize2 size={13} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Maximize2 size={13} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div ref={canvasRef} className="scv-scroll-canvas">
        <div
          className="scv-table-sizer"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
          }}
        >
          <div
            ref={contentRef}
            className="scv-table-holder"
            style={{
              width: `${tableBaseWidth}px`,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            {children}
          </div>
        </div>
      </div>

      <div
        className="scv-bottom-zoom-bar"
        role="group"
        aria-label={`Kontrol zoom jadwal Kelas ${classNameValue}`}
      >
        <div className="lpv-zoom-slider-group">
          <button
            type="button"
            className="lpv-zoom-step-btn"
            onClick={() => handleStepZoom(-5)}
            disabled={activeZoomPct <= minZoomPct}
            aria-label={`Perkecil jadwal Kelas ${classNameValue}`}
            data-s5-tooltip="Perkecil tampilan (-5%)"
          >
            <Minus size={12} aria-hidden="true" />
          </button>

          {(() => {
            const clampedZoom = Math.min(maxZoomPct, Math.max(minZoomPct, activeZoomPct));
            const ratio = maxZoomPct > minZoomPct ? (clampedZoom - minZoomPct) / (maxZoomPct - minZoomPct) : 0;
            return (
              <div className="lpv-zoom-slider-wrap">
                <span
                  className={`lpv-zoom-bubble ${isZoomActive ? 'is-visible' : ''}`}
                  style={{ left: `calc(${ratio * 100}% + ${8 - ratio * 16}px)` }}
                  aria-hidden="true"
                >
                  {activeZoomPct}%
                </span>
                <input
                  type="range"
                  className="lpv-zoom-slider"
                  min={minZoomPct}
                  max={maxZoomPct}
                  step={5}
                  value={clampedZoom}
                  aria-label={`Geser skala zoom jadwal Kelas ${classNameValue}`}
                  onPointerDown={() => setIsZoomActive(true)}
                  onPointerUp={() => setIsZoomActive(false)}
                  onMouseEnter={() => setIsZoomActive(true)}
                  onMouseLeave={() => setIsZoomActive(false)}
                  onFocus={() => setIsZoomActive(true)}
                  onBlur={() => setIsZoomActive(false)}
                  onChange={(e) => {
                    setIsZoomActive(true);
                    handleSliderChange(Number(e.target.value));
                  }}
                />
              </div>
            );
          })()}

          <button
            type="button"
            className="lpv-zoom-step-btn"
            onClick={() => handleStepZoom(5)}
            disabled={activeZoomPct >= maxZoomPct}
            aria-label={`Perbesar jadwal Kelas ${classNameValue}`}
            data-s5-tooltip="Perbesar tampilan (+5%)"
          >
            <Plus size={12} aria-hidden="true" />
          </button>
        </div>

        <span className="lpv-zoom-readout s5-tnum" aria-live="polite">
          {activeZoomPct}%
        </span>
      </div>
    </div>
  );

  if (isMaximized && typeof document !== 'undefined') {
    return createPortal(
      <div
        className="lpv-maximized-portal scv-maximized-portal"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setIsMaximized(false);
            setZoomMode('fit');
          }
        }}
      >
        {blockNode}
      </div>,
      document.body,
    );
  }

  return blockNode;
}
