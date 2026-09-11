'use client';

/**
 * Market detail.
 *
 * Pair statistics plus the candlestick chart. Every number is read from the
 * API; when the upstream market-data provider is unavailable the screen says
 * so rather than inventing a price.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { TradingChart } from '@/components/market/TradingChart';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import {
  Button, Card, DataRow, Divider, ErrorState, Skeleton,
} from '@/components/ui/primitives';
import { AssetIcon } from '@/components/AssetIcon';
import { api, errorMessage } from '@/lib/api';
import type { MarketRow } from '@/lib/types';
import {
  changeTone, cn, formatCompact, formatPercent, formatPrice, slugToSymbol, toneClass,
} from '@/lib/format';

export interface MarketDetailResponse {
  market: MarketRow;
  dataAvailable: boolean;
  message?: string;
}

export default function MarketDetailPage() {
  const params = useParams<{ symbol: string }>();
  const slug = typeof params?.symbol === 'string' ? params.symbol : '';
  const symbol = slugToSymbol(slug);

  const query = useQuery({
    queryKey: ['markets', 'detail', symbol],
    queryFn: () => api.get<MarketDetailResponse>(`/markets/${encodeURIComponent(symbol)}`),
    enabled: Boolean(slug),
    refetchInterval: 30_000,
  });

  const market = query.data?.market ?? null;
  const priceAvailable = Boolean(query.data?.dataAvailable) && market?.price != null;
  const tone = changeTone(market?.change24h);
  const decimals = market?.priceDecimals ?? 2;

  return (
    <AppShell>
      <PageHeader title={market?.displayName ?? symbol} backHref="/markets" />
      <PageBody>
        {query.isLoading ? (
          <Card className="space-y-3 p-4" role="status" aria-label="Loading market">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-44" />
            <Skeleton className="h-3 w-24" />
          </Card>
        ) : query.isError || !market ? (
          <ErrorState
            title="Market unavailable"
            description={errorMessage(query.error, 'This market could not be loaded.')}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-center gap-2.5">
                <AssetIcon asset={market.baseAsset} size="md" />
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold text-fg">
                    {market.displayName}
                  </h1>
                  <p className="truncate text-xs text-muted">
                    {market.baseAsset} / {market.quoteAsset}
                  </p>
                </div>
              </div>

              <p className="tabular mt-3 text-[2rem] font-semibold leading-tight tracking-[-0.02em] text-fg">
                {priceAvailable ? formatPrice(market.price, decimals) : 'Market data unavailable'}
              </p>
              <p className={cn('tabular mt-1 text-sm font-semibold', toneClass(tone))}>
                {market.change24h === null ? '—' : `${formatPercent(market.change24h)} (24h)`}
              </p>

              <Divider className="my-3" />

              <div>
                <DataRow
                  label="24h High"
                  value={market.high24h === null ? '—' : formatPrice(market.high24h, decimals)}
                />
                <DataRow
                  label="24h Low"
                  value={market.low24h === null ? '—' : formatPrice(market.low24h, decimals)}
                />
                <DataRow label="24h Volume" value={formatCompact(market.volume24h)} />
              </div>
            </Card>

            <TradingChart symbol={market.symbol} />


            {market.isTradable ? (
              <Link
                href={`/trade?symbol=${encodeURIComponent(market.symbol)}`}
                className={cn(
                  'flex min-h-[52px] w-full touch-target items-center justify-center rounded-pill',
                  'bg-primary px-6 text-base font-semibold text-primary-foreground',
                  'transition-colors hover:bg-primary/90 active:bg-primary/80',
                )}
              >
                Trade {market.displayName}
              </Link>
            ) : (
              <Button size="lg" fullWidth disabled>
                Trading unavailable
              </Button>
            )}
          </>
        )}
      </PageBody>
    </AppShell>
  );
}
