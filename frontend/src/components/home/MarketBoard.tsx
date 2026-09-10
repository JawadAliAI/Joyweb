'use client';

/**
 * The dashboard's market table.
 *
 * Search, four filter tabs and a per-row seven-day sparkline. The design's
 * "Market Cap" column is not reproduced — the backend proxies a price feed and
 * has no supply data, so a market cap here would be a guess. Its "Trending" tab
 * becomes "Favorites", which is a real per-user flag the API already stores.
 *
 * Sparklines are fetched per row and arrive independently of the table, so a
 * slow candle request never delays the prices.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search, Star } from 'lucide-react';
import { AssetIcon } from '@/components/AssetIcon';
import { Sparkline, seriesTone } from '@/components/home/Sparkline';
import { Card, ChangeChip, EmptyState, ListSkeleton } from '@/components/ui/primitives';
import { rankByChange, useSparkline } from '@/hooks/useMarkets';
import { cn, formatCompact, formatPrice, symbolToSlug } from '@/lib/format';
import type { MarketRow } from '@/lib/types';

const TABS = [
  { id: 'all', label: 'All markets' },
  { id: 'gainers', label: 'Top gainers' },
  { id: 'losers', label: 'Top losers' },
  { id: 'favorites', label: 'Favorites' },
] as const;

type TabId = (typeof TABS)[number]['id'];

/** Seven daily closes for one row. Its own component so one slow request
 *  cannot suspend or re-render the whole table. */
function RowSparkline({ symbol }: { symbol: string }) {
  const { closes } = useSparkline(symbol);
  return (
    <div className="h-8 w-full">
      <Sparkline values={closes} tone={seriesTone(closes)} area />
    </div>
  );
}

export function MarketBoard({
  markets,
  loading,
  dataAvailable = true,
  message,
}: {
  markets: MarketRow[];
  loading?: boolean;
  dataAvailable?: boolean;
  message?: string;
}) {
  const [tab, setTab] = useState<TabId>('all');
  const [term, setTerm] = useState('');

  const rows = useMemo(() => {
    let list = markets;
    if (tab === 'gainers') list = rankByChange(markets, 'gainers');
    else if (tab === 'losers') list = rankByChange(markets, 'losers');
    else if (tab === 'favorites') list = markets.filter((market) => market.isFavorite);

    const needle = term.trim().toUpperCase();
    if (!needle) return list;
    return list.filter(
      (market) =>
        market.symbol.toUpperCase().includes(needle) ||
        market.displayName.toUpperCase().includes(needle),
    );
  }, [markets, tab, term]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
            aria-hidden
          />
          <input
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search markets…"
            aria-label="Search markets"
            className={cn(
              'h-10 w-full rounded-pill border border-border bg-elevated/60 pl-9 pr-3',
              'text-sm text-fg placeholder:text-subtle focus:border-primary focus:outline-none',
            )}
          />
        </div>

        {/* Toggle buttons, not the ARIA tab pattern: there is one list below,
            not a panel per filter. */}
        <div role="group" aria-label="Market filter" className="flex flex-wrap items-center gap-1">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={tab === option.id}
              onClick={() => setTab(option.id)}
              className={cn(
                'rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
                tab === option.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated/60 text-muted hover:text-fg',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Column headings: desktop only — each mobile row is a self-describing card. */}
      <div
        aria-hidden
        className="hidden items-center gap-3 border-y border-border/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-subtle lg:flex"
      >
        <span className="min-w-0 flex-1">Market</span>
        <span className="w-28 text-right">Price</span>
        <span className="w-24 text-right">24h %</span>
        <span className="w-28 text-right">24h volume</span>
        <span className="w-28 text-right">Last 7 days</span>
        <span className="w-5" />
      </div>

      {loading ? (
        <div className="p-4">
          <ListSkeleton rows={6} />
        </div>
      ) : !dataAvailable && markets.length === 0 ? (
        <EmptyState
          title="Market data unavailable"
          description={message ?? 'Live prices could not be loaded. Please try again shortly.'}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No markets match"
          description={
            tab === 'favorites'
              ? 'Star a market from the markets screen and it will appear here.'
              : 'Try a different search term.'
          }
        />
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((market) => (
            <li key={market.symbol}>
              <Link
                href={`/markets/${symbolToSlug(market.symbol)}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated/40"
              >
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <AssetIcon asset={market.baseAsset} size="md" />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold text-fg">
                        {market.displayName}
                      </span>
                      {market.isFavorite && (
                        <Star className="h-3 w-3 shrink-0 fill-secondary text-secondary" aria-hidden />
                      )}
                    </span>
                    <span className="block truncate text-[11px] uppercase text-muted">
                      {market.symbol}
                    </span>
                  </span>
                </span>

                {/* Mobile: price and change stack on the right of the row. */}
                <span className="shrink-0 text-right lg:hidden">
                  <span className="tabular block text-sm font-medium text-fg">
                    {market.price === null
                      ? '—'
                      : `$${formatPrice(market.price, market.priceDecimals)}`}
                  </span>
                  <ChangeChip value={market.change24h} plain className="mt-0.5" />
                </span>

                <span className="tabular hidden w-28 text-right text-sm font-medium text-fg lg:block">
                  {market.price === null
                    ? '—'
                    : `$${formatPrice(market.price, market.priceDecimals)}`}
                </span>
                <span className="hidden w-24 justify-end lg:flex">
                  <ChangeChip value={market.change24h} />
                </span>
                <span className="tabular hidden w-28 text-right text-sm text-muted lg:block">
                  {market.volume24h === null ? '—' : formatCompact(market.volume24h)}
                </span>
                <span className="hidden w-28 lg:block">
                  <RowSparkline symbol={market.symbol} />
                </span>
                <ChevronRight className="hidden h-4 w-4 shrink-0 text-subtle lg:block" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
