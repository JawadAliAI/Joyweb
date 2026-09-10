'use client';

/**
 * Dependency-free micro-visualisations for the dashboard.
 *
 * All three draw straight to inline SVG so a row sparkline costs nothing in
 * bundle size, and all three take their colour from theme CSS variables so the
 * admin branding settings re-theme them for free. Each drawing is `aria-hidden`
 * — the number it decorates is already in the DOM as text.
 */
import { useId } from 'react';
import { cn } from '@/lib/format';

type Tone = 'up' | 'down' | 'flat';

const STROKE: Record<Tone, string> = {
  up: 'rgb(var(--color-primary))',
  down: 'rgb(var(--color-danger))',
  flat: 'rgb(var(--color-fg-subtle))',
};

/** Direction of a series, from its first and last point. */
export function seriesTone(values: number[]): Tone {
  if (values.length < 2) return 'flat';
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

/**
 * A line (optionally filled) through `values`, scaled to its own min/max.
 *
 * Renders a flat dash rather than a line when there is nothing to plot, so a
 * market whose feed is unavailable never shows an invented shape.
 */
export function Sparkline({
  values,
  tone,
  width = 112,
  height = 34,
  area = false,
  className,
}: {
  values: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  area?: boolean;
  className?: string;
}) {
  const gradientId = useId().replace(/:/g, '');

  if (values.length < 2) {
    return (
      <svg
        aria-hidden
        viewBox={`0 0 ${width} ${height}`}
        className={cn('h-full w-full', className)}
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="rgb(var(--color-border))"
          strokeWidth="1.5"
          strokeDasharray="3 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    );
  }

  const resolved = tone ?? seriesTone(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const step = width / (values.length - 1);

  const points = values.map((value, index) => ({
    x: index * step,
    y: pad + (1 - (value - min) / span) * (height - pad * 2),
  }));

  const line = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const fill = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      className={cn('h-full w-full overflow-visible', className)}
      preserveAspectRatio="none"
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={STROKE[resolved]} stopOpacity="0.28" />
              <stop offset="100%" stopColor={STROKE[resolved]} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={fill} fill={`url(#${gradientId})`} />
        </>
      )}
      <path
        d={line}
        fill="none"
        stroke={STROKE[resolved]}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/**
 * Proportional bars, one per value.
 *
 * Heights use a square-root scale: on a linear one a dominant value (Bitcoin's
 * 24h volume runs ~30x Cardano's) flattens every other bar into an invisible
 * sliver. The ordering and relative ranking are preserved either way.
 */
export function MicroBars({
  values,
  className,
  height = 34,
}: {
  values: number[];
  className?: string;
  height?: number;
}) {
  if (values.length === 0) return null;
  const max = Math.max(...values) || 1;
  const slot = 100 / values.length;
  const barWidth = Math.min(slot * 0.55, 9);

  return (
    <svg
      aria-hidden
      viewBox={`0 0 100 ${height}`}
      className={cn('h-full w-full', className)}
      preserveAspectRatio="none"
    >
      {values.map((value, index) => {
        const ratio = Math.sqrt(Math.max(0, value) / max);
        const barHeight = Math.max(3, ratio * height);
        return (
          <rect
            key={index}
            x={index * slot + (slot - barWidth) / 2}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx="1.5"
            fill="rgb(var(--color-primary))"
            fillOpacity={0.4 + 0.6 * ratio}
          />
        );
      })}
    </svg>
  );
}

/**
 * Ring chart for a small set of parts of a whole — an asset allocation, or how
 * many markets are up against down. Segments are drawn clockwise from twelve
 * o'clock.
 */
export function Donut({
  segments,
  size = 44,
  thickness = 7,
  className,
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const usable = segments.filter((segment) => segment.value > 0);
  const total = usable.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return null;

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let consumed = 0;

  return (
    <svg aria-hidden viewBox={`0 0 ${size} ${size}`} className={cn('h-full w-full', className)}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(var(--color-elevated))"
        strokeWidth={thickness}
      />
      {usable.map((segment, index) => {
        const length = (segment.value / total) * circumference;
        const offset = consumed;
        consumed += length;
        return (
          <circle
            key={index}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={segment.color}
            strokeWidth={thickness}
            strokeDasharray={`${length} ${circumference - length}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        );
      })}
    </svg>
  );
}
