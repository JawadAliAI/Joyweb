'use client';

/**
 * Reusable market list.
 *
 * Mobile renders each market as a two-line card row; from `sm` up the same
 * data lines up into Pair / Price / 24h Change / 24h Volume columns under a
 * header row. Rows are links, so the whole row is keyboard reachable.
 */
import Link from 'next/link';
import { Star } from 'lucide-react';
import type { MarketRow } from '@/lib/types';
import {
  changeTone, cn, formatCompact, formatPercent, formatPrice, symbolToSlug, toneClass,
} from '@/lib/format';
import { AssetIcon } from '@/components/AssetIcon';

export function MarketTableHeader({ showFavorite = false }: { showFavorite?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'hidden items-center gap-3 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-subtle sm:flex',
      )}
    >
      {showFavorite && <span className="w-9 shrink-0" />}
      <span className="min-w-0 flex-1">Pair</span>
      <span className="w-28 text-right">Price</span>
      <span className="w-24 text-right">24h Change</span>
      <span className="w-28 text-right">24h Volume</span>
    </div>
  );
}

export function MarketTableRow({
  market,
  onToggleFavorite,
  favoritePending = false,
}: {
  market: MarketRow;
  onToggleFavorite?: (market: MarketRow) => void;
  favoritePending?: boolean;
}) {
  const tone = changeTone(market.change24h);
  const showFavorite = Boolean(onToggleFavorite);

  return (
    <li className="flex items-center gap-3 px-4 transition-colors hover:bg-elevated/50">
      {onToggleFavorite && (
        <button
          type="button"
          disabled={favoritePending}
          onClick={() => onToggleFavorite(market)}
          aria-pressed={market.isFavorite}
          aria-label={
            market.isFavorite
              ? `Remove ${market.displayName} from favorites`
              : `Add ${market.displayName} to favorites`
          }
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded-control text-subtle transition-colors hover:text-secondary disabled:opacity-50"
        >
          <Star
            className={cn('h-4 w-4', market.isFavorite && 'fill-secondary text-secondary')}
            aria-hidden
          />
        </button>
      )}

      <Link
        href={`/markets/${symbolToSlug(market.symbol)}`}
        className={cn(
          'flex min-w-0 flex-1 touch-target items-center gap-3 py-3',
          'sm:gap-3',
        )}
      >
        <AssetIcon asset={market.baseAsset} size="md" className="sm:hidden" />

        <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <AssetIcon asset={market.baseAsset} size="sm" className="hidden sm:flex" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-fg">
                {market.displayName}
              </span>
              <span className="block truncate text-[11px] text-subtle sm:hidden">
                Vol {formatCompact(market.volume24h)}
              </span>
            </span>
          </span>

          {/* Mobile: price + change stack on the right. Desktop: aligned columns. */}
          <span className="hidden w-28 text-right sm:block">
            <span className="tabular text-sm text-fg">
              {market.price === null
                ? '—'
                : formatPrice(market.price, market.priceDecimals)}
            </span>
          </span>
          <span className={cn('hidden w-24 text-right sm:block', toneClass(tone))}>
            <span className="tabular text-sm font-semibold">
              {market.change24h === null ? '—' : formatPercent(market.change24h)}
            </span>
          </span>
          <span className="hidden w-28 text-right sm:block">
            <span className="tabular text-sm text-muted">{formatCompact(market.volume24h)}</span>
          </span>
        </span>

        <span className="flex flex-col items-end gap-0.5 sm:hidden">
          <span className="tabular text-sm font-semibold text-fg">
            {market.price === null ? '—' : formatPrice(market.price, market.priceDecimals)}
          </span>
          <span className={cn('tabular text-xs font-semibold', toneClass(tone))}>
            {market.change24h === null ? '—' : formatPercent(market.change24h)}
          </span>
        </span>
      </Link>

      {showFavorite && <span className="hidden sm:block" />}
    </li>
  );
}

export function MarketTable({
  markets,
  onToggleFavorite,
  pendingSymbol,
  className,
  ariaLabel = 'Markets',
}: {
  markets: MarketRow[];
  onToggleFavorite?: (market: MarketRow) => void;
  pendingSymbol?: string | null;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cn('overflow-hidden rounded-card bg-card', className)}>
      <MarketTableHeader showFavorite={Boolean(onToggleFavorite)} />
      <ul aria-label={ariaLabel} className="divide-y divide-border/60">
        {markets.map((market) => (
          <MarketTableRow
            key={market.symbol}
            market={market}
            onToggleFavorite={onToggleFavorite}
            favoritePending={pendingSymbol === market.symbol}
          />
        ))}
      </ul>
    </div>
  );
}
