'use client';

/**
 * Movers rail — gainers and losers in one card, switched by a toggle.
 *
 * "Top" is simply the listed markets ordered by their real 24h change: there is
 * no editorial list and nothing is promoted. Markets whose price could not be
 * read are excluded rather than shown at zero, so a feed outage empties the
 * list instead of filling it with flat lines.
 */
import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { AssetIcon } from '@/components/AssetIcon';
import { Card, ChangeChip, ListSkeleton } from '@/components/ui/primitives';
import { rankByChange } from '@/hooks/useMarkets';
import { cn, formatPrice, symbolToSlug } from '@/lib/format';
import type { MarketRow } from '@/lib/types';

const VIEWS = [
  { id: 'gainers', label: 'Top gainers' },
  { id: 'losers', label: 'Top losers' },
] as const;

type ViewId = (typeof VIEWS)[number]['id'];

export function MarketMovers({
  markets,
  loading,
  limit = 5,
  className,
}: {
  markets: MarketRow[];
  loading?: boolean;
  limit?: number;
  className?: string;
}) {
  const [view, setView] = useState<ViewId>('gainers');
  const rows = rankByChange(markets, view).slice(0, limit);

  return (
    <Card className={cn('flex flex-col p-4', className)}>
      {/* Toggle buttons, not the ARIA tab pattern: one list is swapped in
          place rather than a panel per view. */}
      <div
        role="group"
        aria-label="Movers"
        className="flex items-center gap-1 rounded-pill bg-elevated/60 p-1"
      >
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={view === option.id}
            onClick={() => setView(option.id)}
            className={cn(
              'flex-1 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
              view === option.id
                ? 'bg-primary text-primary-foreground'
                : 'text-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-2 flex-1">
        {loading ? (
          <div className="pt-2">
            <ListSkeleton rows={limit} />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted" role="status">
            Market data unavailable.
          </p>
        ) : (
          <ul className="divide-y divide-border/50">
            {rows.map((market) => (
              <li key={market.symbol}>
                <Link
                  href={`/markets/${symbolToSlug(market.symbol)}`}
                  className="flex items-center gap-3 py-2.5 transition-colors hover:opacity-80"
                >
                  <AssetIcon asset={market.baseAsset} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">
                      {market.displayName}
                    </span>
                    <span className="block truncate text-[11px] uppercase text-muted">
                      {market.baseAsset}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block text-sm text-fg">
                      {market.price === null
                        ? '—'
                        : `$${formatPrice(market.price, market.priceDecimals)}`}
                    </span>
                    <ChangeChip value={market.change24h} plain className="mt-0.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link
        href="/markets"
        className={cn(
          'mt-3 flex touch-target items-center justify-center gap-1 rounded-pill',
          'bg-elevated text-sm font-semibold text-fg transition-colors hover:bg-elevated/70',
        )}
      >
        View all
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </Card>
  );
}
