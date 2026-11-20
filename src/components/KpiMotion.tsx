import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { animate, motion, useReducedMotion } from 'framer-motion';

export interface KpiMotionCardProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  index?: number;
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * Subtle Framer Motion wrapper for dashboard KPI stat cards.
 * Animates compositor-only properties (opacity + transform) on mount and hover,
 * and respects OS prefers-reduced-motion settings.
 */
export function KpiMotionCard({
  children,
  className,
  style,
  index = 0,
}: KpiMotionCardProps) {
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
        duration: 0.32,
        delay: Math.min(index, 6) * 0.045,
        ease: EASE_OUT_EXPO,
      }}
      whileHover={{
        y: -3,
        transition: {
          type: 'spring',
          stiffness: 420,
          damping: 28,
          mass: 0.7,
        },
      }}
      whileTap={{
        scale: 0.992,
        transition: { duration: 0.1 },
      }}
    >
      {children}
    </motion.div>
  );
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
  duration = 0.62,
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
