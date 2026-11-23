import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEventHandler,
  type ReactNode,
} from 'react';
import { AnimatePresence, animate, motion, useReducedMotion } from 'framer-motion';

export interface KpiMotionCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  index?: number;
  as?: 'div' | 'button';
  type?: 'button' | 'submit' | 'reset';
  onClick?: MouseEventHandler<HTMLElement>;
  title?: string;
  'aria-pressed'?: boolean;
  'aria-label'?: string;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

const HOVER_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 28,
  mass: 0.7,
};

const POPOVER_SPRING = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 32,
  mass: 0.65,
};

const MODAL_SPRING = {
  type: 'spring' as const,
  stiffness: 440,
  damping: 30,
  mass: 0.75,
};

/**
 * Subtle Framer Motion wrapper for dashboard KPI stat cards.
 * Animates compositor-only properties (opacity + transform) + shadow elevation
 * on mount and hover, and respects OS prefers-reduced-motion settings.
 */
export function KpiMotionCard({
  children,
  className,
  style,
  index = 0,
  as = 'div',
  type = 'button',
  onClick,
  title,
  'aria-pressed': ariaPressed,
  'aria-label': ariaLabel,
}: KpiMotionCardProps) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    if (as === 'button') {
      return (
        <button
          type={type}
          className={className}
          style={style}
          onClick={onClick}
          title={title}
          aria-pressed={ariaPressed}
          aria-label={ariaLabel}
        >
          {children}
        </button>
      );
    }
    return (
      <div
        className={className}
        style={style}
        onClick={onClick}
        title={title}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }

  const motionProps = {
    className,
    style,
    onClick,
    title,
    'aria-label': ariaLabel,
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.32,
      delay: Math.min(index, 6) * 0.045,
      ease: EASE_OUT_EXPO,
    },
    whileHover: {
      y: -4,
      boxShadow:
        '0 14px 30px -10px rgba(11, 41, 35, 0.18), 0 4px 12px -4px rgba(197, 160, 89, 0.22)',
      transition: HOVER_SPRING,
    },
    whileTap: {
      scale: 0.988,
      y: -1,
      transition: { duration: 0.1 },
    },
  };

  if (as === 'button') {
    return (
      <motion.button type={type} aria-pressed={ariaPressed} {...motionProps}>
        {children}
      </motion.button>
    );
  }

  return <motion.div {...motionProps}>{children}</motion.div>;
}

export interface KpiAnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
}

/**
 * Counts up smoothly from 0 on initial client mount and interpolates cleanly
 * when the underlying metric updates. Renders the exact target value in SSR
 * so static HTML snapshots and Vitest SSR checks always see real figures.
 */
export function KpiAnimatedNumber({
  value,
  decimals,
  prefix = '',
  suffix = '',
  duration = 0.65,
}: KpiAnimatedNumberProps) {
  const shouldReduceMotion = useReducedMotion();
  const safeValue = Number.isFinite(value) ? value : 0;
  const resolvedDecimals =
    typeof decimals === 'number'
      ? Math.max(0, decimals)
      : Number.isInteger(safeValue)
      ? 0
      : 1;

  const [displayValue, setDisplayValue] = useState<number>(safeValue);
  const prevTargetRef = useRef<number | null>(null);

  useEffect(() => {
    if (shouldReduceMotion) {
      prevTargetRef.current = safeValue;
      setDisplayValue(safeValue);
      return;
    }

    const from = prevTargetRef.current === null ? 0 : prevTargetRef.current;
    prevTargetRef.current = safeValue;

    if (from === safeValue) {
      setDisplayValue(safeValue);
      return;
    }

    setDisplayValue(from);

    const controls = animate(from, safeValue, {
      duration,
      ease: EASE_OUT_EXPO,
      onUpdate: (latest) => {
        setDisplayValue(latest);
      },
      onComplete: () => {
        setDisplayValue(safeValue);
      },
    });

    return () => {
      controls.stop();
    };
  }, [safeValue, duration, shouldReduceMotion]);

  const formatted =
    resolvedDecimals > 0
      ? displayValue.toFixed(resolvedDecimals)
      : Math.round(displayValue).toString();

  return (
    <>
      {prefix}
      {formatted}
      {suffix}
    </>
  );
}

/**
 * Smooth inter-screen page transition wrapper (`fade + slight y-slide`).
 * Uses `initial={false}` on AnimatePresence so initial load & SSR snapshots
 * are never hidden at opacity: 0, while menu navigation glides smoothly.
 */
export function MotionPageTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div key={screenKey} className="s5-screen-stack">
        {children}
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={screenKey}
        className="s5-screen-stack"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.2, ease: EASE_OUT_EXPO }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Staggered reveal item for conflict lists, version timelines, and action cards.
 */
export function MotionStaggerItem({
  children,
  className,
  style,
  index = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  index?: number;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.28,
        delay: Math.min(index, 10) * 0.04,
        ease: EASE_OUT_EXPO,
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Spring-animated popover/dropdown menu container.
 */
export function MotionPopover({
  isOpen,
  className,
  children,
}: {
  isOpen: boolean;
  className?: string;
  children: ReactNode;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return isOpen ? <div className={className}>{children}</div> : null;
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className={className}
          style={{ transformOrigin: 'top right' }}
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.97 }}
          transition={POPOVER_SPRING}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Spring-animated modal overlay + dialog surface.
 */
export function MotionModalDialog({
  children,
  onBackdropMouseDown,
  panelClassName = 'modal-panel',
  panelStyle,
  scrimClassName = 'modal-scrim',
  ariaLabel,
}: {
  children: ReactNode;
  onBackdropMouseDown?: MouseEventHandler<HTMLDivElement>;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  scrimClassName?: string;
  ariaLabel?: string;
}) {
  const shouldReduceMotion = useReducedMotion();

  if (shouldReduceMotion) {
    return (
      <div className={scrimClassName} role="presentation" onMouseDown={onBackdropMouseDown}>
        <div
          className={panelClassName}
          style={panelStyle}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className={scrimClassName}
      role="presentation"
      onMouseDown={onBackdropMouseDown}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
    >
      <motion.div
        className={panelClassName}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        initial={{ opacity: 0, y: 12, scale: 0.965 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.975 }}
        transition={MODAL_SPRING}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
