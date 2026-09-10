'use client';

/**
 * Dependency-free inline-SVG chart for the dashboard's daily series.
 *
 * Colours come from the theme's CSS variables (so re-branding re-themes the
 * charts too) and the drawing is `aria-hidden` — screen-reader users get an
 * equivalent text summary and a real data table instead.
 */
import { useId, useMemo } from 'react';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { cn, formatCompact, formatDate } from '@/lib/format';
import type { SeriesPoint } from '@/lib/admin-types';

const WIDTH = 600;
const HEIGHT = 180;
const PADDING = { top: 12, right: 8, bottom: 22, left: 8 };

interface ChartProps {
  title: string;
  description?: string;
  data: SeriesPoint[];
  variant?: 'line' | 'bar';
  /** 'count' renders whole numbers, 'amount' renders compact demo amounts. */
  unit?: 'count' | 'amount';
  loading?: boolean;
  className?: string;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function SimpleChart({
  title,
  description,
  data,
  variant = 'line',
  unit = 'count',
  loading,
  className,
}: ChartProps) {
  const gradientId = useId().replace(/:/g, '');
  const summaryId = `${gradientId}-summary`;

  const model = useMemo(() => {
    const points = data.map((point) => ({ date: point.date, value: toNumber(point.value) }));
    const values = points.map((point) => point.value);
    const max = values.length ? Math.max(...values) : 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    const peak = points.reduce<{ date: string; value: number } | null>(
      (best, point) => (best === null || point.value > best.value ? point : best),
      null,
    );
    const scaleMax = max === 0 ? 1 : max;
    const innerW = WIDTH - PADDING.left - PADDING.right;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;
    const step = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const coords = points.map((point, index) => ({
      ...point,
      x: PADDING.left + (points.length > 1 ? index * step : innerW / 2),
      y: PADDING.top + innerH - (point.value / scaleMax) * innerH,
    }));
    return { points, coords, max, total, peak, innerH, innerW, step };
  }, [data]);

  const fmt = (value: number) =>
    unit === 'amount' ? formatCompact(value) : value.toLocaleString('en-US');

  const summary =
    model.points.length === 0
      ? 'No data for this period.'
      : `${title}: ${model.points.length} days shown. Total ${fmt(model.total)}. ` +
        `Peak ${fmt(model.peak?.value ?? 0)} on ${formatDate(model.peak?.date)}. ` +
        `Latest ${fmt(model.points[model.points.length - 1]?.value ?? 0)}.`;

  const linePath = model.coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  const areaPath =
    model.coords.length > 0
      ? `${linePath} L${model.coords[model.coords.length - 1].x.toFixed(2)} ${(
          PADDING.top + model.innerH
        ).toFixed(2)} L${model.coords[0].x.toFixed(2)} ${(PADDING.top + model.innerH).toFixed(2)} Z`
      : '';

  const barWidth = model.coords.length > 0 ? Math.max(2, (model.innerW / model.coords.length) * 0.6) : 0;

  return (
    <section className={cn('rounded-card border border-border/70 bg-card p-4 shadow-card', className)} aria-labelledby={`${gradientId}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${gradientId}-title`} className="text-sm font-semibold text-fg">
            {title}
          </h3>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        {!loading && model.points.length > 0 && (
          <p className="tabular shrink-0 text-right text-xs text-muted">
            Total <span className="font-semibold text-fg">{fmt(model.total)}</span>
          </p>
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-4 h-[180px] w-full" />
      ) : model.points.length === 0 ? (
        <EmptyState title="No activity in this period" />
      ) : (
        <>
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-describedby={summaryId}
            aria-label={title}
            className="mt-4 h-44 w-full"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--color-primary))" stopOpacity="0.35" />
                <stop offset="100%" stopColor="rgb(var(--color-primary))" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Baseline */}
            <line
              x1={PADDING.left}
              y1={PADDING.top + model.innerH}
              x2={WIDTH - PADDING.right}
              y2={PADDING.top + model.innerH}
              stroke="rgb(var(--color-border))"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />

            {variant === 'bar'
              ? model.coords.map((point) => (
                  <rect
                    key={point.date}
                    x={point.x - barWidth / 2}
                    y={point.y}
                    width={barWidth}
                    height={Math.max(0, PADDING.top + model.innerH - point.y)}
                    rx="1"
                    fill="rgb(var(--color-primary))"
                    fillOpacity="0.75"
                  />
                ))
              : (
                <>
                  <path d={areaPath} fill={`url(#${gradientId})`} />
                  <path
                    d={linePath}
                    fill="none"
                    stroke="rgb(var(--color-primary))"
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
          </svg>

          <div className="mt-1 flex justify-between text-[11px] text-subtle">
            <span>{formatDate(model.points[0]?.date)}</span>
            <span>{formatDate(model.points[model.points.length - 1]?.date)}</span>
          </div>

          <p id={summaryId} className="sr-only">
            {summary}
          </p>
        </>
      )}
    </section>
  );
}
