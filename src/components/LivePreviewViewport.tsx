import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minimize2, Minus, Plus, RotateCcw } from 'lucide-react';

export const PREVIEW_MM_TO_PX = 96 / 25.4;

export interface LivePreviewViewportProps {
  title?: string;
  metaText?: string;
  paperWidthMm: number;
  paperHeightMm: number;
  compactMaxHeight?: number | string;
  topSlot?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  minZoomPct?: number;
  maxZoomPct?: number;
  className?: string;
  sheetMode?: 'paper' | 'stack';
  paperStyle?: CSSProperties;
  ariaLabel?: string;
}

export function LivePreviewViewport({
  title = 'Pratinjau Dokumen Resmi',
  metaText,
  paperWidthMm,
  paperHeightMm,
  compactMaxHeight = 460,
  topSlot,
  headerActions,
  children,
  minZoomPct = 25,
  maxZoomPct = 160,
  className = '',
  sheetMode = 'paper',
  paperStyle,
  ariaLabel,
}: LivePreviewViewportProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [manualZoomPct, setManualZoomPct] = useState<number>(100);
  const [containerWidth, setContainerWidth] = useState<number>(480);
  const [contentSize, setContentSize] = useState<{ width: number; height: number } | null>(null);

  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const paperWidthPx = Math.max(240, Math.round(paperWidthMm * PREVIEW_MM_TO_PX));
  const paperHeightPx = Math.max(240, Math.round(paperHeightMm * PREVIEW_MM_TO_PX));

  // Observe available canvas width for accurate "Pas / Fit" calculation
  useLayoutEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const updateWidth = () => {
      const next = el.clientWidth;
      if (next > 40) setContainerWidth(next);
    };
    updateWidth();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMaximized, paperWidthMm, paperHeightMm]);

  // Observe natural rendered content size so CSS transform scale leaves zero dead vertical gap
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const updateContent = () => {
      const w = el.offsetWidth || paperWidthPx;
      const h = el.offsetHeight || paperHeightPx;
      setContentSize((prev) =>
        prev && prev.width === w && prev.height === h ? prev : { width: w, height: h },
      );
    };
    updateContent();

    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateContent);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paperWidthPx, paperHeightPx, isMaximized, children]);

  // Escape key minimizes when maximized (stopping propagation before parent modal closes)
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

  const paddingAllowance = isMaximized ? 56 : 28;
  const rawFitScale = (containerWidth - paddingAllowance) / paperWidthPx;
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
        // Maximize always snaps to 100% real print size immediately
        setManualZoomPct(100);
        setZoomMode('manual');
      } else {
        // Minimize smoothly returns to auto-fit compact preview
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

  const naturalWidth = contentSize?.width ?? paperWidthPx;
  const naturalHeight = contentSize?.height ?? paperHeightPx;
  const scaledWidth = Math.max(120, Math.round(naturalWidth * scale));
  const scaledHeight = Math.max(120, Math.round(naturalHeight * scale));

  const stageNode = (
    <div
      className={`lpv-stage ${isMaximized ? 'is-maximized' : 'is-compact'} ${className}`.trim()}
      role="region"
      aria-label={ariaLabel ?? title}
    >
      {/* Top Preview Bar */}
      <div className="lpv-topbar">
        <div className="lpv-topbar-left">
          <span className="s5-studio-kicker">{title}</span>
          {metaText && (
            <span className="lpv-meta-text s5-tnum">{metaText}</span>
          )}
        </div>

        <div className="lpv-topbar-actions">
          {headerActions}
          <button
            type="button"
            className={`lpv-max-btn s5-tooltip-end s5-tooltip-bottom ${isMaximized ? 'is-active' : ''}`}
            onClick={handleToggleMaximize}
            aria-label={
              isMaximized
                ? 'Perkecil kembali ke pratinjau mini'
                : 'Maksimalkan ke ukuran cetak asli (100%)'
            }
            data-s5-tooltip={
              isMaximized
                ? 'Perkecil pratinjau (Esc)'
                : 'Maksimalkan (100%)'
            }
          >
            {isMaximized ? (
              <Minimize2 size={14} strokeWidth={1.75} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} strokeWidth={1.75} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Optional live KPI strip or warning banner */}
      {topSlot && <div className="lpv-top-slot">{topSlot}</div>}

      {/* Scrollable Real-Scale Paper Canvas */}
      <div
        ref={canvasRef}
        className="lpv-scroll-canvas"
        style={
          !isMaximized && compactMaxHeight
            ? {
                maxHeight:
                  typeof compactMaxHeight === 'number'
                    ? `${compactMaxHeight}px`
                    : compactMaxHeight,
              }
            : undefined
        }
      >
        <div
          className="lpv-paper-sizer"
          style={{
            width: `${scaledWidth}px`,
            height: `${scaledHeight}px`,
          }}
        >
          <div
            ref={contentRef}
            className={sheetMode === 'paper' ? 'lpv-paper-sheet' : 'lpv-paper-stack'}
            style={{
              width: `${paperWidthPx}px`,
              minHeight: sheetMode === 'paper' ? `${paperHeightPx}px` : undefined,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              ...(sheetMode === 'paper' ? paperStyle : undefined),
            }}
          >
            {children}
          </div>
        </div>
      </div>

      {/* Bottom Zoom Slider Bar Inside Preview */}
      <div
        className="lpv-bottom-zoom-bar"
        role="group"
        aria-label="Kontrol zoom pratinjau dokumen"
      >
        <div className="lpv-zoom-slider-group">
          <button
            type="button"
            className="lpv-zoom-step-btn"
            onClick={() => handleStepZoom(-10)}
            disabled={activeZoomPct <= minZoomPct}
            aria-label="Perkecil zoom pratinjau"
            title="Perkecil (-10%)"
          >
            <Minus size={13} aria-hidden="true" />
          </button>

          <input
            type="range"
            className="lpv-zoom-slider"
            min={minZoomPct}
            max={maxZoomPct}
            step={5}
            value={activeZoomPct}
            aria-label="Geser skala zoom pratinjau"
            onChange={(e) => handleSliderChange(Number(e.target.value))}
          />

          <button
            type="button"
            className="lpv-zoom-step-btn"
            onClick={() => handleStepZoom(10)}
            disabled={activeZoomPct >= maxZoomPct}
            aria-label="Perbesar zoom pratinjau"
            title="Perbesar (+10%)"
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        </div>

        <div className="lpv-zoom-presets">
          <span className="lpv-zoom-readout s5-tnum" aria-live="polite">
            {activeZoomPct}%
          </span>

          <button
            type="button"
            className={`lpv-zoom-chip ${zoomMode === 'fit' ? 'is-active' : ''}`}
            onClick={() => setZoomMode('fit')}
            title="Sesuaikan otomatis ke lebar pratinjau"
          >
            Pas
          </button>

          <button
            type="button"
            className={`lpv-zoom-chip ${zoomMode === 'manual' && activeZoomPct === 100 ? 'is-active' : ''}`}
            onClick={() => {
              setManualZoomPct(100);
              setZoomMode('manual');
            }}
            title="Ukuran cetak asli 100%"
          >
            100%
          </button>

          {isMaximized && (
            <button
              type="button"
              className="lpv-zoom-chip"
              onClick={handleToggleMaximize}
              title="Kembali ke pratinjau mini"
            >
              <RotateCcw size={11} aria-hidden="true" />
              <span>Mini</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (isMaximized && typeof document !== 'undefined') {
    return createPortal(
      <div
        className="lpv-maximized-portal"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setIsMaximized(false);
            setZoomMode('fit');
          }
        }}
      >
        {stageNode}
      </div>,
      document.body,
    );
  }

  return stageNode;
}
