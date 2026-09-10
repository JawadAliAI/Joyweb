'use client';

/**
 * Demo trading screen.
 *
 * Places a simulated position, counts it down, polls the settlement endpoint
 * and explains the result. Nothing is executed on a real venue.
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LineChart } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { FeatureDisabledNotice, SimulationNotice } from '@/components/layout/DemoBadge';
import { usePlatform } from '@/components/providers';
import { usePortfolio, useRefreshBalances } from '@/hooks/useSession';
import { api, errorMessage } from '@/lib/api';
import { assetLabel, formatAmount, formatDateTime, formatDuration, formatPrice } from '@/lib/format';
import { ConfirmModal } from '@/components/ui/overlay';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  DataRow,
  Divider,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Skeleton,
} from '@/components/ui/primitives';
import { TradePanel } from '@/components/trade/TradePanel';
import type { TradeTicket } from '@/components/trade/TradePanel';
import { TradeCountdown } from '@/components/trade/TradeCountdown';
import { TradeInProgressModal } from '@/components/trade/TradeInProgressModal';
import { SoundToggle } from '@/components/trade/SoundToggle';
import { TradeResultModal } from '@/components/trade/TradeResultModal';
import { playSound } from '@/lib/sound';
import type { Paged, TickerListResponse, Trade, TradeConfig } from '@/lib/types';

const HISTORY_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'WIN', label: 'Win' },
  { value: 'LOSS', label: 'Loss' },
  { value: 'DRAW', label: 'Draw' },
];

function TradeRow({ trade }: { trade: Trade }) {
  const profit = trade.profitLoss === null ? null : Number(trade.profitLoss);
  return (
    <li className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{trade.symbol}</p>
        <p className="mt-0.5 text-xs text-muted">
          {trade.direction} · {formatDuration(trade.durationSeconds)} ·{' '}
          {formatDateTime(trade.createdAt)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="tabular text-sm text-fg">
          {formatAmount(trade.amount, 2)} {assetLabel(trade.asset)}
        </p>
        {trade.outcome && (
          <p
            className={
              profit !== null && profit < 0
                ? 'tabular text-xs text-danger'
                : 'tabular text-xs text-primary'
            }
          >
            {trade.outcome}
            {profit !== null && ` ${profit > 0 ? '+' : ''}${formatAmount(profit, 2)}`}
          </p>
        )}
      </div>
    </li>
  );
}

function TradeScreen() {
  const searchParams = useSearchParams();
  const { config: platform } = usePlatform();
  const toast = useToast();
  const refreshBalances = useRefreshBalances();
  const portfolio = usePortfolio();

  const [symbol, setSymbol] = useState('');
  const [ticket, setTicket] = useState<TradeTicket | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);
  const [settledTrade, setSettledTrade] = useState<Trade | null>(null);
  const [historyTab, setHistoryTab] = useState('ALL');
  // The position the blocking overlay is showing. Held as the trade itself
  // rather than an id so the overlay never flickers while the open-positions
  // list is refetching.
  const [blockingTrade, setBlockingTrade] = useState<Trade | null>(null);

  const tradeConfig = useQuery({
    queryKey: ['trade-config'],
    queryFn: () => api.get<TradeConfig>('/trades/config'),
    enabled: platform.tradingEnabled,
  });

  const requestedSymbol = searchParams.get('symbol');

  useEffect(() => {
    if (symbol || !tradeConfig.data) return;
    const markets = tradeConfig.data.markets;
    const match = requestedSymbol
      ? markets.find((market) => market.symbol === requestedSymbol)
      : undefined;
    setSymbol(match?.symbol ?? markets[0]?.symbol ?? '');
  }, [symbol, tradeConfig.data, requestedSymbol]);

  const ticker = useQuery({
    queryKey: ['ticker', symbol],
    queryFn: () =>
      api
        .get<TickerListResponse>('/markets/ticker', { symbols: symbol })
        .then((response) => response.items[0] ?? null),
    enabled: Boolean(symbol),
    refetchInterval: 5_000,
  });

  const openTrades = useQuery({
    queryKey: ['trades', 'open'],
    queryFn: () => api.get<Paged<Trade>>('/trades', { status: 'OPEN', pageSize: 20 }),
    refetchInterval: 15_000,
  });

  const history = useQuery({
    queryKey: ['trades', 'history', historyTab],
    queryFn: () =>
      api.get<Paged<Trade>>('/trades', {
        status: 'SETTLED',
        outcome: historyTab === 'ALL' ? undefined : historyTab,
        pageSize: 20,
      }),
  });

  const activeTrade = useMemo(() => {
    if (!activeTradeId) return null;
    return openTrades.data?.items.find((item) => item.id === activeTradeId) ?? null;
  }, [activeTradeId, openTrades.data]);

  // Poll for settlement while a placed trade is still open.
  const result = useQuery({
    queryKey: ['trade-result', activeTradeId],
    queryFn: () => api.get<Trade>(`/trades/${activeTradeId}/result`),
    enabled: Boolean(activeTradeId),
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'OPEN' ? false : 3_000,
  });

  useEffect(() => {
    if (result.data && result.data.status !== 'OPEN') {
      setSettledTrade(result.data);
      setActiveTradeId(null);
      setBlockingTrade(null);
      // A voided position has no outcome; it reads as a draw.
      const outcome = result.data.status === 'VOIDED' ? 'DRAW' : result.data.outcome;
      playSound(
        outcome === 'WIN' ? 'trade-win' : outcome === 'LOSS' ? 'trade-loss' : 'trade-draw',
      );
      refreshBalances();
      void openTrades.refetch();
      void history.refetch();
    }
    // openTrades/history refetch identities are stable enough for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data]);

  const placedTrade = activeTrade ?? (result.data && result.data.status === 'OPEN' ? result.data : null);

  const mutation = useMutation({
    mutationFn: (body: {
      symbol: string;
      direction: string;
      amount: string;
      durationSeconds: number;
      stakeAsset: string;
    }) => api.post<Trade>('/trades', body),
    onSuccess: (data) => {
      setConfirmOpen(false);
      setActiveTradeId(data.id);
      setBlockingTrade(data);
      setSettledTrade(null);
      refreshBalances();
      void openTrades.refetch();
      playSound('trade-open');
      toast.success('Demo position opened', `${data.symbol} ${data.direction}`);
    },
    onError: (error) => {
      setConfirmOpen(false);
      toast.error('Could not open position', errorMessage(error));
    },
  });

  // Which simulated stablecoin funds the stake. Defaults to the configured
  // one until the user picks the other.
  const [stakeAsset, setStakeAsset] = useState<string | null>(null);
  const tradeAsset = stakeAsset ?? tradeConfig.data?.stakeAsset ?? '';
  const availableBalance =
    portfolio.data?.assets.find((item) => item.asset === tradeAsset)?.available ?? null;

  const handleExpire = useCallback(() => {
    void result.refetch();
  }, [result]);

  // The blocking overlay owns the countdown; on zero it hands settlement
  // polling back to the page. It stays open until the result arrives.
  const handleBlockingComplete = useCallback(() => {
    void result.refetch();
  }, [result]);

  // Escape hatch, offered by the overlay only if settlement is late.
  const handleBlockingDismiss = useCallback(() => {
    setBlockingTrade(null);
  }, []);

  if (!platform.tradingEnabled) {
    return (
      <PageBody>
        <FeatureDisabledNotice message="Demo trading is currently unavailable." />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader title="Trade" backHref="/" />
      <PageBody>
        {tradeConfig.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-56 w-full" />
          </div>
        ) : tradeConfig.isError ? (
          <ErrorState
            title="Could not load trading settings"
            description={errorMessage(tradeConfig.error)}
            onRetry={() => void tradeConfig.refetch()}
          />
        ) : tradeConfig.data ? (
          <div className="space-y-4">
            <SimulationNotice tone="emphasis">
              <strong className="font-bold uppercase tracking-wide">
                Paper trading simulation.
              </strong>{' '}
              Positions are staked with simulated demo credits. No order reaches a real exchange
              and no real money can be won or lost.
            </SimulationNotice>

            {placedTrade && !blockingTrade && (
              <TradeCountdown trade={placedTrade} onExpire={handleExpire} />
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-fg">Place a demo position</p>
              <SoundToggle />
            </div>

            <TradePanel
              config={tradeConfig.data}
              symbol={symbol}
              onSymbolChange={setSymbol}
              stakeAsset={tradeAsset}
              onStakeAssetChange={setStakeAsset}
              availableBalance={availableBalance}
              currentPrice={ticker.data?.price ?? null}
              submitting={mutation.isPending}
              onSubmit={(next) => {
                setTicket(next);
                setConfirmOpen(true);
              }}
            />

            {/* Positions and history sit side by side once there is room. */}
            <div className="grid items-start gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader title="Open positions" />
                <CardBody className="pt-2">
                  {openTrades.isLoading ? (
                    <ListSkeleton rows={3} />
                  ) : openTrades.isError ? (
                    <ErrorState
                      title="Could not load open positions"
                      description={errorMessage(openTrades.error)}
                      onRetry={() => void openTrades.refetch()}
                    />
                  ) : !openTrades.data || openTrades.data.items.length === 0 ? (
                    <EmptyState
                      icon={<LineChart className="h-8 w-8" aria-hidden />}
                      title="No open positions"
                      description="Place a demo position above to see it counting down here."
                    />
                  ) : (
                    <ul className="divide-y divide-border/70">
                      {openTrades.data.items.map((trade) => (
                        <TradeRow key={trade.id} trade={trade} />
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader title="Trade history" />
                <CardBody className="space-y-3 pt-2">
                  <Tabs
                    items={HISTORY_TABS}
                    value={historyTab}
                    onChange={setHistoryTab}
                    ariaLabel="Filter trade history by outcome"
                    variant="pill"
                  />
                  <TabPanel value={historyTab} active>
                    {history.isLoading ? (
                      <ListSkeleton rows={4} />
                    ) : history.isError ? (
                      <ErrorState
                        title="Could not load trade history"
                        description={errorMessage(history.error)}
                        onRetry={() => void history.refetch()}
                      />
                    ) : !history.data || history.data.items.length === 0 ? (
                      <EmptyState
                        title="No settled trades yet"
                        description="Settled demo positions appear here with their outcome."
                      />
                    ) : (
                      <ul className="divide-y divide-border/70">
                        {history.data.items.map((trade) => (
                          <TradeRow key={trade.id} trade={trade} />
                        ))}
                      </ul>
                    )}
                  </TabPanel>
                </CardBody>
              </Card>
            </div>
          </div>
        ) : null}
      </PageBody>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (!ticket) return;
          mutation.mutate({
            symbol: ticket.symbol,
            direction: ticket.direction,
            amount: ticket.amount,
            durationSeconds: ticket.duration.seconds,
            stakeAsset: ticket.stakeAsset,
          });
        }}
        title="Confirm demo position"
        confirmLabel="Place demo trade"
        loading={mutation.isPending}
        footnote="Simulated position only. No order is sent to a real exchange."
        details={
          ticket && (
            <div>
              <DataRow label="Market" value={ticket.symbol} />
              <Divider />
              <DataRow
                label="Direction"
                value={
                  <Badge tone={ticket.direction === 'UP' ? 'success' : 'danger'}>
                    {ticket.direction}
                  </Badge>
                }
              />
              <Divider />
              <DataRow
                label="Amount"
                value={`${formatAmount(ticket.amount, 2)} ${assetLabel(tradeAsset)}`}
              />
              <Divider />
              <DataRow
                label="Potential profit"
                tone="strong"
                value={`+${formatAmount(ticket.potentialProfit, 2)}`}
              />
              <Divider />
              <DataRow
                label="Duration"
                value={`${ticket.duration.label} · ${ticket.duration.payoutPercent}%`}
              />
              <Divider />
              <DataRow
                label="Entry reference price"
                value={formatPrice(ticker.data?.price ?? null, 2)}
              />
            </div>
          )
        }
      />

      {blockingTrade && (
        <TradeInProgressModal
          trade={blockingTrade}
          currentPrice={ticker.data?.price ?? null}
          onComplete={handleBlockingComplete}
          onForceClose={handleBlockingDismiss}
        />
      )}

      <TradeResultModal
        open={Boolean(settledTrade)}
        onClose={() => setSettledTrade(null)}
        trade={settledTrade}
      />
    </>
  );
}

export default function TradePage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <PageBody>
            <Skeleton className="h-56 w-full" />
          </PageBody>
        }
      >
        <TradeScreen />
      </Suspense>
    </AppShell>
  );
}
