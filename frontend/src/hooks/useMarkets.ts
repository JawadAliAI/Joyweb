'use client';

/**
 * Market data hooks for the dashboard.
 *
 * Everything here reads the backend's own market endpoints, which proxy a
 * public price feed. When that feed is down the API returns `dataAvailable:
 * false` with null prices — callers must render "unavailable" rather than a
 * placeholder number. Nothing in this file may invent, interpolate or carry
 * forward a price.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { symbolToSlug } from '@/lib/format';
import type { Candle, MarketListResponse, MarketRow } from '@/lib/types';

export interface CandleResponse {
  symbol: string;
  interval: string;
  candles: Candle[];
  dataAvailable: boolean;
  message?: string;
}

/** Every enabled market with its live ticker merged in. */
export function useMarkets() {
  return useQuery({
    queryKey: ['markets', 'list'],
    queryFn: () => api.get<MarketListResponse>('/markets'),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

/** Raw candles for one market. Backs the row sparklines. */
export function useCandles(symbol: string | null, interval: string, limit: number) {
  return useQuery({
    queryKey: ['markets', symbol, 'candles', interval, limit],
    queryFn: () =>
      api.get<CandleResponse>(`/markets/${symbolToSlug(symbol as string)}/candles`, {
        interval,
        limit,
      }),
    enabled: Boolean(symbol),
    staleTime: 60_000,
  });
}

/**
 * Seven daily closes for a row sparkline.
 *
 * Shares a query key shape with `useCandles`, so a symbol shown both in the
 * table and in a stat card is fetched once.
 */
export function useSparkline(symbol: string) {
  const query = useCandles(symbol, '1d', 7);
  const closes = query.data?.dataAvailable
    ? query.data.candles.map((candle) => candle.close)
    : [];
  return { closes, isLoading: query.isLoading, isError: query.isError };
}

/* ------------------------------------------------------------- Derivations */

const asNumber = (value: string | null): number | null => {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Markets that have a live price, sorted by 24h change. */
export function rankByChange(markets: MarketRow[], direction: 'gainers' | 'losers') {
  const priced = markets.filter((market) => asNumber(market.change24h) !== null);
  const sorted = [...priced].sort((a, b) => {
    const left = asNumber(a.change24h) ?? 0;
    const right = asNumber(b.change24h) ?? 0;
    return direction === 'gainers' ? right - left : left - right;
  });
  return sorted;
}

/**
 * Platform-level summary of the listed markets.
 *
 * Volume is summed over USDT-quoted markets only — a cross pair such as
 * ETH/BTC reports its volume in BTC, and adding that to a USDT figure would be
 * meaningless.
 */
export function summarise(markets: MarketRow[]) {
  const quoted = markets.filter((market) => market.quoteAsset === 'USDT');
  let volume = 0;
  let volumeCount = 0;
  let up = 0;
  let down = 0;
  let flat = 0;
  let changeSum = 0;
  let changeCount = 0;

  for (const market of quoted) {
    const marketVolume = asNumber(market.volume24h);
    if (marketVolume !== null) {
      volume += marketVolume;
      volumeCount += 1;
    }
    const change = asNumber(market.change24h);
    if (change === null) continue;
    changeSum += change;
    changeCount += 1;
    if (change > 0) up += 1;
    else if (change < 0) down += 1;
    else flat += 1;
  }

  return {
    volume: volumeCount > 0 ? volume : null,
    volumeCount,
    up,
    down,
    flat,
    rated: changeCount,
    averageChange: changeCount > 0 ? changeSum / changeCount : null,
  };
}
