'use client';

/**
 * Home screen ticker strip.
 *
 * Three columns, each showing a pair, its signed 24h change and its last
 * price. Prices come from the public market-data feed the backend proxies —
 * when that feed is unavailable the card says so rather than showing a
 * fabricated number. Nothing here is a quote for a real tradable instrument.
 */
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { TickerListResponse } from '@/lib/types';
import {
  changeTone, cn, formatPercent, formatPrice, symbolToSlug, toneClass,
} from '@/lib/format';
import { Card, Skeleton } from '@/components/ui/primitives';

export type MarketTickerResponse = TickerListResponse;

function Unavailable({ message }: { message?: string }) {
  return (
    <div className="px-4 py-6 text-center" role="status">
      <p className="text-sm font-medium text-fg">Market data unavailable</p>
      <p className="mt-1 text-xs text-muted">
        {message || 'Live prices could not be loaded. Please try again shortly.'}
      </p>
    </div>
  );
}

export function MarketTicker({
  limit = 3,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  const query = useQuery({
    queryKey: ['markets', 'ticker', limit],
    queryFn: () => api.get<MarketTickerResponse>('/markets/ticker'),
    refetchInterval: 30_000,
  });

  return (
    <Card className={cn('overflow-hidden', className)}>
      {query.isLoading ? (
        <div className="grid grid-cols-3 gap-3 p-4" role="status" aria-label="Loading market prices">
          {Array.from({ length: limit }).map((_, index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      ) : query.isError || !query.data?.dataAvailable ? (
        <Unavailable message={query.data?.message} />
      ) : query.data.items.length === 0 ? (
        <Unavailable message="No markets are configured yet." />
      ) : (
        <ul className="grid grid-cols-3 divide-x divide-border">
          {query.data.items.slice(0, limit).map((row) => {
            const tone = changeTone(row.change24h);
            return (
              <li key={row.symbol}>
                <Link
                  href={`/markets/${symbolToSlug(row.symbol)}`}
                  className="flex h-full flex-col justify-center gap-1 px-3 py-3.5 transition-colors hover:bg-elevated/60"
                >
                  <span className="truncate text-xs font-medium text-muted">{row.symbol}</span>
                  <span className={cn('tabular text-sm font-semibold', toneClass(tone))}>
                    {row.change24h === null ? '—' : formatPercent(row.change24h)}
                  </span>
                  <span className="tabular truncate text-xs text-fg">
                    {row.price === null ? 'No price' : formatPrice(row.price)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
