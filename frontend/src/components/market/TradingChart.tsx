'use client';

/**
 * Candlestick chart.
 *
 * `lightweight-charts` is imported dynamically inside the effect so the
 * library never lands in the initial bundle — only visitors who actually open
 * a chart pay for it. All colours are read from the theme's CSS variables, so
 * an administrator re-branding the platform re-colours the chart too.
 *
 * The chart is informational only: it plots public market data and never
 * represents an executable price on this simulator.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
// Type-only import: erased at compile time, so it adds nothing to the bundle.
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';
import { api } from '@/lib/api';
import type { Candle } from '@/lib/types';
import { cn } from '@/lib/format';
import { Skeleton } from '@/components/ui/primitives';

// The product shows one-minute candles only.
export const CHART_INTERVALS = ['1m'] as const;
export type ChartInterval = (typeof CHART_INTERVALS)[number];

export interface CandlesResponse {
  candles: Candle[];
  dataAvailable: boolean;
  message?: string;
}

/** Reads `--color-x` ("24 184 135") and returns a CSS `rgb()` string. */
function themeColor(variable: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  const channels = raw.split(/[\s,]+/).filter(Boolean);
  if (channels.length < 3) return fallback;
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

export function TradingChart({
  symbol,
  height = 300,
  limit = 200,
  className,
}: {
  symbol: string;
  height?: number;
  limit?: number;
  className?: string;
}) {
  const [interval, setInterval] = useState<ChartInterval>('1m');
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [ready, setReady] = useState(false);

  const query = useQuery({
    queryKey: ['markets', symbol, 'candles', interval, limit],
    queryFn: () =>
      api.get<CandlesResponse>(`/markets/${encodeURIComponent(symbol)}/candles`, {
        interval,
        limit,
      }),
    refetchInterval: 60_000,
  });

  // Create the chart once, lazily loading the library.
  useEffect(() => {
    let disposed = false;
    let chart: IChartApi | null = null;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const container = containerRef.current;
      if (!container) return;

      const { createChart, CrosshairMode } = await import('lightweight-charts');
      if (disposed || !containerRef.current) return;

      const up = themeColor('--color-primary', 'rgb(24, 184, 135)');
      const down = themeColor('--color-danger', 'rgb(233, 75, 103)');
      const text = themeColor('--color-fg-muted', 'rgb(146, 153, 165)');
      const grid = themeColor('--color-border', 'rgb(58, 64, 72)');

      chart = createChart(containerRef.current, {
        height,
        layout: {
          background: { color: 'transparent' },
          textColor: text,
          fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-sans'),
        },
        grid: {
          vertLines: { color: grid, style: 1 },
          horzLines: { color: grid, style: 1 },
        },
        rightPriceScale: { borderColor: grid },
        timeScale: { borderColor: grid, timeVisible: true, secondsVisible: false },
        crosshair: { mode: CrosshairMode.Normal },
        handleScale: { axisPressedMouseMove: false },
      });

      seriesRef.current = chart.addCandlestickSeries({
        upColor: up,
        downColor: down,
        borderUpColor: up,
        borderDownColor: down,
        wickUpColor: up,
        wickDownColor: down,
      });
      chartRef.current = chart;
      setReady(true);

      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !chartRef.current) return;
        chartRef.current.applyOptions({ width: Math.floor(entry.contentRect.width) });
      });
      observer.observe(containerRef.current);
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      setReady(false);
      seriesRef.current = null;
      chartRef.current = null;
      chart?.remove();
    };
  }, [height]);

  // Feed data whenever the chart exists and a new candle set arrives.
  useEffect(() => {
    const series = seriesRef.current;
    if (!ready || !series || !query.data?.dataAvailable) return;
    series.setData(
      query.data.candles.map((candle) => ({
        time: candle.time as UTCTimestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    );
    chartRef.current?.timeScale().fitContent();
  }, [ready, query.data]);

  const unavailable = query.isError || (query.data ? !query.data.dataAvailable : false);

  return (
    <section className={cn('rounded-card border border-border/70 bg-card', className)} aria-label={`${symbol} price chart`}>
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="rounded-control bg-elevated px-2.5 py-1 text-xs font-semibold text-primary">
          M1
        </span>
        <span className="text-xs text-muted">One-minute candles</span>
      </div>

      <div className="relative p-2">
        <div ref={containerRef} className="w-full" style={{ height }} />

        {query.isLoading && (
          <div
            className="absolute inset-2 flex flex-col justify-end gap-2"
            role="status"
            aria-label="Loading chart"
          >
            <Skeleton className="h-full w-full" />
          </div>
        )}

        {unavailable && (
          <div
            role="status"
            className="absolute inset-2 flex flex-col items-center justify-center rounded-control bg-card px-6 text-center"
          >
            <p className="text-sm font-medium text-fg">Market data unavailable</p>
            <p className="mt-1 text-xs text-muted">
              {query.data?.message ||
                'The public market-data provider could not be reached. No price is shown rather than an estimated one.'}
            </p>
          </div>
        )}
      </div>

      <p className="px-4 pb-3 text-[11px] leading-relaxed text-subtle">
        Chart is informational only and sourced from a public market-data provider. Trades on this
        simulator do not reach any exchange or order book.
      </p>
    </section>
  );
}

export default TradingChart;
