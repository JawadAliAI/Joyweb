'use client';

/**
 * Markets list.
 *
 * Quote-currency tabs plus a debounced search, backed by `/api/markets`.
 * Favouriting is optimistic — the star flips immediately and the list is
 * re-fetched once the server confirms.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageBody } from '@/components/layout/AppShell';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import type { TabItem } from '@/components/ui/tabs';
import { SearchInput } from '@/components/ui/form';
import { EmptyState, ErrorState, MarketSkeleton } from '@/components/ui/primitives';
import { MarketTable } from '@/components/market/MarketTable';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';
import type { MarketListResponse, MarketRow } from '@/lib/types';

const TABS: TabItem[] = [
  { value: 'favorites', label: 'Favorites' },
  { value: 'USDT', label: 'USDT' },
  { value: 'BTC', label: 'BTC' },
  { value: 'ETH', label: 'ETH' },
];

/** Debounces a changing value by `delay` milliseconds. */
function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function MarketsPage() {
  const [tab, setTab] = useState<string>('USDT');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search, 300);
  const queryClient = useQueryClient();
  const toast = useToast();

  const params = useMemo(
    () => ({
      quote: tab === 'favorites' ? undefined : tab,
      favorites: tab === 'favorites' ? true : undefined,
      search: debouncedSearch.trim() || undefined,
    }),
    [tab, debouncedSearch],
  );

  const query = useQuery({
    queryKey: ['markets', params],
    queryFn: () => api.get<MarketListResponse>('/markets', params),
    refetchInterval: 30_000,
  });

  const favorite = useMutation({
    mutationFn: (market: MarketRow) => {
      const path = `/markets/${encodeURIComponent(market.symbol)}/favorite`;
      return market.isFavorite
        ? api.delete<Record<string, never>>(path)
        : api.post<Record<string, never>>(path);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['markets'] });
    },
    onError: (error) => {
      toast.error('Could not update favorites', errorMessage(error));
    },
  });

  const pendingSymbol = favorite.isPending ? favorite.variables?.symbol ?? null : null;

  // Optimistic star: flip the pending row locally until the refetch lands.
  const markets: MarketRow[] = useMemo(() => {
    const rows = query.data?.items ?? [];
    if (!pendingSymbol) return rows;
    return rows.map((row) =>
      row.symbol === pendingSymbol ? { ...row, isFavorite: !row.isFavorite } : row,
    );
  }, [query.data, pendingSymbol]);

  return (
    <AppShell>
      <PageBody>
        <h1 className="text-lg font-semibold text-fg">Markets</h1>
        <p className="-mt-2 text-xs text-muted">
          Simulated markets. Prices come from a public market-data provider and are
          informational only.
        </p>

        <SearchInput value={search} onValueChange={setSearch} placeholder="Search markets" />

        <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="Market filters" />

        <TabPanel value={tab} active>
          {query.isLoading ? (
            <div className="rounded-card bg-card p-4">
              <MarketSkeleton rows={8} />
            </div>
          ) : query.isError ? (
            <ErrorState
              title="Markets unavailable"
              description={errorMessage(query.error, 'The market list could not be loaded.')}
              onRetry={() => void query.refetch()}
            />
          ) : !query.data?.dataAvailable && markets.length === 0 ? (
            <EmptyState
              title="Market data unavailable"
              description={
                query.data?.message ||
                'Live prices could not be loaded, so no market data is shown.'
              }
            />
          ) : markets.length === 0 ? (
            <EmptyState
              title="No markets available"
              description={
                tab === 'favorites'
                  ? 'Star a market to pin it here.'
                  : 'Try a different quote currency or search term.'
              }
            />
          ) : (
            <MarketTable
              markets={markets}
              onToggleFavorite={(market) => favorite.mutate(market)}
              pendingSymbol={pendingSymbol}
              ariaLabel={`${tab} markets`}
            />
          )}
        </TabPanel>
      </PageBody>
    </AppShell>
  );
}
