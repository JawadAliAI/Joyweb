'use client';

/**
 * The dashboard's headline row — four cards, one row from `lg` up, each one a
 * link into the screen behind its number.
 *
 * The reference design shows global crypto metrics (total market cap, global
 * volume, BTC dominance). This platform has no source for those — it proxies a
 * price feed, not a market-cap index — so rather than print a number nobody can
 * defend, each card reports something the API genuinely knows: the signed-in
 * user's simulated portfolio, the traded volume of the listed markets, and how
 * many of those markets are up over 24 hours.
 *
 * The reference pairs each value with a sparkline. None of these three metrics
 * has a history endpoint behind it, so the slot holds a chart of the breakdown
 * that does exist — allocation, per-market volume, up against down.
 */
import Link from 'next/link';
import { Activity, BarChart3, CandlestickChart, ChevronRight, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';
import { Donut, MicroBars } from '@/components/home/Sparkline';
import { ChangeChip, Skeleton } from '@/components/ui/primitives';
import { useOpenTradeCount, usePortfolio } from '@/hooks/useSession';
import { summarise, useMarkets } from '@/hooks/useMarkets';
import { cn, formatAmount, formatCompact } from '@/lib/format';
import type { MarketRow } from '@/lib/types';

/** Ring colours for an allocation: the accent, stepping down in weight. */
const ALLOCATION_COLORS = [
  'rgb(var(--color-primary))',
  'rgb(var(--color-primary) / 0.62)',
  'rgb(var(--color-primary) / 0.38)',
  'rgb(var(--color-primary) / 0.22)',
];

/**
 * The reference card: label and a circular icon on the top row, an oversized
 * value beneath, then a pill chip on the left and a small chart on the right.
 *
 * Every card is a link to the screen its number comes from, so the whole card
 * is one keyboard-reachable target rather than a panel with a link buried in
 * it. `accent` marks the call-to-action card.
 */
function StatCard({
  label,
  icon,
  value,
  href,
  loading,
  chip,
  visual,
  accent = false,
}: {
  label: string;
  icon: ReactNode;
  value: ReactNode;
  href: string;
  loading?: boolean;
  chip?: ReactNode;
  visual?: ReactNode;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        // Card's own styling, applied to the anchor so the whole card is the
        // link target rather than a div wrapping one.
        'group flex flex-col rounded-card border bg-card p-4 shadow-card transition-colors',
        accent
          ? 'border-primary/40 bg-primary/[0.07] hover:border-primary/70'
          : 'border-border/70 hover:border-primary/30',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="pt-1 text-xs font-medium leading-snug text-muted">{label}</p>
        {/* The affordance is the icon lighting up, not a badge pinned to its
            corner — that overlapped the glyph underneath. */}
        <span
          aria-hidden
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors',
            accent
              ? 'bg-primary/20 text-primary'
              : 'bg-elevated text-muted group-hover:bg-primary/15 group-hover:text-primary',
          )}
        >
          {icon}
        </span>
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-9 w-36" />
      ) : (
        <p className="tabular mt-3 text-[26px] font-bold leading-none tracking-tight text-fg">
          {value}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <div className="min-w-0 flex-1">{loading ? <Skeleton className="h-6 w-24" /> : chip}</div>
        {visual}
      </div>
    </Link>
  );
}

export function StatCards() {
  const portfolio = usePortfolio();
  const markets = useMarkets();
  const openTrades = useOpenTradeCount();

  const rows: MarketRow[] = markets.data?.items ?? [];
  const stats = summarise(rows);
  const feedDown = markets.data ? !markets.data.dataAvailable : false;

  // Card 2's chart: per-market 24h volume, largest first.
  const volumeBars = rows
    .filter((market) => market.quoteAsset === 'USDT' && market.volume24h !== null)
    .map((market) => Number(market.volume24h))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => b - a)
    .slice(0, 7);

  // Card 1's ring: each held asset's estimated value, largest first. An asset
  // whose price could not be read has no estimate and is left out.
  const allocation = (portfolio.data?.assets ?? [])
    .map((asset) => Number(asset.estimatedValue ?? '0'))
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .slice(0, 4)
    .map((value, index) => ({ value, color: ALLOCATION_COLORS[index] }));

  return (
    <section
      aria-label="Account and market summary"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <StatCard
        label="Portfolio value"
        href="/assets"
        icon={<Wallet className="h-4 w-4" aria-hidden />}
        loading={portfolio.isLoading}
        value={
          portfolio.data?.pricesAvailable === false ? (
            <span className="text-base font-medium text-muted">Prices unavailable</span>
          ) : (
            <>
              <span className="align-top text-lg text-muted">$</span>
              {formatAmount(portfolio.data?.totalEstimatedValue)}
            </>
          )
        }
        chip={
          <span className="inline-flex items-center rounded-pill bg-primary/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
            Simulated
          </span>
        }
        visual={
          allocation.length > 0 ? (
            <span className="block h-10 w-10 shrink-0">
              <Donut segments={allocation} />
            </span>
          ) : undefined
        }
      />

      <StatCard
        label="24h volume"
        href="/markets"
        icon={<BarChart3 className="h-4 w-4" aria-hidden />}
        loading={markets.isLoading}
        value={
          stats.volume === null ? (
            <span className="text-base font-medium text-muted">Unavailable</span>
          ) : (
            <>
              <span className="align-top text-lg text-muted">$</span>
              {formatCompact(stats.volume)}
            </>
          )
        }
        chip={
          <span className="inline-flex items-center rounded-pill bg-elevated px-2 py-1 text-[11px] font-semibold text-muted">
            {stats.volumeCount} USDT {stats.volumeCount === 1 ? 'market' : 'markets'}
          </span>
        }
        visual={
          volumeBars.length > 0 ? (
            <span className="block h-8 w-20 shrink-0">
              <MicroBars values={volumeBars} />
            </span>
          ) : undefined
        }
      />

      <StatCard
        label="Markets up · 24h"
        href="/markets"
        icon={<Activity className="h-4 w-4" aria-hidden />}
        loading={markets.isLoading}
        value={
          stats.rated === 0 ? (
            <span className="text-base font-medium text-muted">Unavailable</span>
          ) : (
            <>
              {stats.up}
              <span className="text-lg text-muted"> / {stats.rated}</span>
            </>
          )
        }
        chip={<ChangeChip value={stats.averageChange} />}
        visual={
          stats.rated > 0 ? (
            <span className="block h-10 w-10 shrink-0">
              <Donut
                segments={[
                  { value: stats.up, color: 'rgb(var(--color-primary))' },
                  { value: stats.down, color: 'rgb(var(--color-danger))' },
                  { value: stats.flat, color: 'rgb(var(--color-fg-subtle))' },
                ]}
              />
            </span>
          ) : undefined
        }
      />

      <StatCard
        label="Open positions"
        href="/trade"
        accent
        icon={<CandlestickChart className="h-4 w-4" aria-hidden />}
        loading={openTrades.isLoading}
        value={
          openTrades.isError ? (
            <span className="text-base font-medium text-muted">Unavailable</span>
          ) : (
            <>
              {openTrades.data ?? 0}
              <span className="text-lg text-muted">
                {' '}
                {openTrades.data === 1 ? 'trade' : 'trades'}
              </span>
            </>
          )
        }
        chip={
          <span className="inline-flex items-center gap-1 rounded-pill bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground">
            {openTrades.data ? 'Manage trades' : 'Place a demo trade'}
            <ChevronRight className="h-3 w-3" aria-hidden />
          </span>
        }
      />

      {feedDown && (
        <p role="status" className="text-xs text-muted sm:col-span-2 lg:col-span-4">
          {markets.data?.message ?? 'Live market data is unavailable right now.'}
        </p>
      )}
    </section>
  );
}
