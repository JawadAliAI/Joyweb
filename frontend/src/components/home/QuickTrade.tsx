'use client';

/**
 * Quick trade ticket for the dashboard.
 *
 * A condensed version of the trade screen's panel: pair, duration, stake, then
 * Buy up / Buy down. It places the position straight away — no confirmation
 * step — then hands over to the countdown overlay and the result modal, so the
 * outcome lands in one flow without leaving the dashboard.
 *
 * Every market, duration, payout percentage and quick-amount chip comes from
 * `/api/trades/config`; nothing is hard-coded. The outcome is decided by the
 * backend against the public market price at expiry — this card cannot
 * influence it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, TrendingDown, TrendingUp } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { assetLabel, cn, formatAmount, formatPrice } from '@/lib/format';
import { usePlatform } from '@/components/providers';
import { usePortfolio, useRefreshBalances } from '@/hooks/useSession';
import { FeatureDisabledNotice } from '@/components/layout/DemoBadge';
import { Button, Card, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { TradeInProgressModal } from '@/components/trade/TradeInProgressModal';
import { TradeResultModal } from '@/components/trade/TradeResultModal';
import { playSound } from '@/lib/sound';
import type {
  Paged, TickerListResponse, Trade, TradeConfig, TradeDirection,
} from '@/lib/types';

export function QuickTrade() {
  const { config: platform } = usePlatform();
  const toast = useToast();
  const portfolio = usePortfolio();
  const refreshBalances = useRefreshBalances();

  const [symbol, setSymbol] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [direction, setDirection] = useState<TradeDirection>('UP');
  const [activeTradeId, setActiveTradeId] = useState<string | null>(null);
  const [blockingTrade, setBlockingTrade] = useState<Trade | null>(null);
  const [settledTrade, setSettledTrade] = useState<Trade | null>(null);

  const tradeConfig = useQuery({
    queryKey: ['trade-config'],
    queryFn: () => api.get<TradeConfig>('/trades/config'),
    enabled: platform.tradingEnabled,
  });

  const config = tradeConfig.data ?? null;
  const durations = useMemo(() => config?.durations ?? [], [config]);

  useEffect(() => {
    if (symbol || !config) return;
    setSymbol(config.markets[0]?.symbol ?? '');
  }, [symbol, config]);

  useEffect(() => {
    if (durationSeconds !== null || durations.length === 0 || !config) return;
    const preferred =
      durations.find((item) => item.seconds === config.defaultDurationSeconds) ?? durations[0];
    setDurationSeconds(preferred.seconds);
  }, [durationSeconds, durations, config]);

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

  // Poll for settlement while the placed position is still open.
  const result = useQuery({
    queryKey: ['trade-result', activeTradeId],
    queryFn: () => api.get<Trade>(`/trades/${activeTradeId}/result`),
    enabled: Boolean(activeTradeId),
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'OPEN' ? false : 3_000,
  });

  useEffect(() => {
    if (!result.data || result.data.status === 'OPEN') return;
    setSettledTrade(result.data);
    setActiveTradeId(null);
    setBlockingTrade(null);
    // A voided position has no outcome; it reads as a draw.
    const outcome = result.data.status === 'VOIDED' ? 'DRAW' : result.data.outcome;
    playSound(outcome === 'WIN' ? 'trade-win' : outcome === 'LOSS' ? 'trade-loss' : 'trade-draw');
    refreshBalances();
    void openTrades.refetch();
    // openTrades/refresh identities are stable enough for this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data]);

  const mutation = useMutation({
    mutationFn: (body: {
      symbol: string;
      direction: string;
      amount: string;
      durationSeconds: number;
      stakeAsset: string;
    }) => api.post<Trade>('/trades', body),
    onSuccess: (data) => {
      setActiveTradeId(data.id);
      setBlockingTrade(data);
      setSettledTrade(null);
      refreshBalances();
      void openTrades.refetch();
      playSound('trade-open');
    },
    onError: (mutationError) => {
      toast.error('Could not open position', errorMessage(mutationError));
    },
  });

  const stakeAsset = config?.stakeAsset ?? '';
  const availableBalance =
    portfolio.data?.assets.find((item) => item.asset === stakeAsset)?.available ?? null;
  const available = availableBalance === null ? null : Number(availableBalance);

  const selectedDuration =
    durations.find((item) => item.seconds === durationSeconds) ?? durations[0] ?? null;

  const parsedAmount = Number(amount);
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const payoutPercent = selectedDuration ? Number(selectedDuration.payoutPercent) : 0;
  const potentialProfit =
    validAmount && Number.isFinite(payoutPercent) ? (parsedAmount * payoutPercent) / 100 : 0;

  const validate = (): string | null => {
    if (!selectedDuration) return 'Select a duration.';
    if (!validAmount) return 'Enter a trade amount greater than zero.';
    const min = Number(selectedDuration.minAmount);
    const max = Number(selectedDuration.maxAmount);
    if (Number.isFinite(min) && parsedAmount < min) {
      return `Minimum is ${formatAmount(selectedDuration.minAmount, 2)}.`;
    }
    if (Number.isFinite(max) && max > 0 && parsedAmount > max) {
      return `Maximum is ${formatAmount(selectedDuration.maxAmount, 2)}.`;
    }
    if (available !== null && parsedAmount > available) {
      return 'Amount exceeds your available balance.';
    }
    return null;
  };

  const place = (next: TradeDirection) => {
    setDirection(next);
    const problem = validate();
    setError(problem);
    if (problem || !selectedDuration || !symbol) return;
    mutation.mutate({
      symbol,
      direction: next,
      amount: amount.trim(),
      durationSeconds: selectedDuration.seconds,
      stakeAsset,
    });
  };

  const handleSettle = useCallback(() => {
    void result.refetch();
  }, [result]);

  if (!platform.tradingEnabled) {
    return (
      <Card className="p-4">
        <FeatureDisabledNotice message="Trading is currently unavailable." />
      </Card>
    );
  }

  if (tradeConfig.isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-48 w-full" />
      </Card>
    );
  }

  if (tradeConfig.isError || !config) {
    return (
      <Card className="p-4">
        <ErrorState
          title="Could not load trading settings"
          description={errorMessage(tradeConfig.error)}
          onRetry={() => void tradeConfig.refetch()}
        />
      </Card>
    );
  }

  const priceDecimals =
    config.markets.find((market) => market.symbol === symbol)?.priceDecimals ?? 2;

  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-fg">Quick trade</h2>
          <Link
            href="/trade"
            className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Full trade screen
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {/* Pair and its live price. */}
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <label htmlFor="quick-trade-pair" className="sr-only">
              Pair
            </label>
            <select
              id="quick-trade-pair"
              value={symbol}
              onChange={(event) => setSymbol(event.target.value)}
              className="h-10 rounded-control border border-border bg-elevated px-2.5 text-sm font-semibold text-fg focus:border-primary focus:outline-none"
            >
              {config.markets.map((market) => (
                <option key={market.symbol} value={market.symbol}>
                  {market.displayName} · {market.symbol}
                </option>
              ))}
            </select>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-muted">Current price</p>
            <p className="tabular text-lg font-semibold leading-tight text-fg" aria-live="polite">
              {formatPrice(ticker.data?.price ?? null, priceDecimals)}
            </p>
          </div>
        </div>

        {/* Duration — compact pills rather than the full screen's card grid. */}
        <div className="mt-3">
          <p id="quick-duration" className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Duration
          </p>
          <div
            role="radiogroup"
            aria-labelledby="quick-duration"
            className="mt-1.5 flex flex-wrap gap-1.5"
          >
            {durations.map((item) => {
              const active = item.seconds === selectedDuration?.seconds;
              return (
                <button
                  key={item.seconds}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setDurationSeconds(item.seconds)}
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-elevated text-muted hover:text-fg',
                  )}
                >
                  {item.label}
                  <span className="ml-1 font-normal opacity-70">{item.payoutPercent}%</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Stake. */}
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-2">
            <p
              id="quick-amount"
              className="text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              Amount
            </p>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {config.quickAmounts.map((quick) => {
              const active = amount === String(quick);
              return (
                <button
                  key={quick}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setAmount(String(quick));
                    setError(null);
                  }}
                  className={cn(
                    'rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border bg-elevated text-muted hover:text-fg',
                  )}
                >
                  {formatAmount(quick, 0)}
                </button>
              );
            })}
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="Custom"
              aria-labelledby="quick-amount"
              aria-invalid={error ? true : undefined}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                if (error) setError(null);
              }}
              className={cn(
                'h-9 w-24 rounded-pill border bg-elevated px-3 text-sm text-fg',
                'placeholder:text-subtle focus:border-primary focus:outline-none',
                error ? 'border-danger' : 'border-border',
              )}
            />
          </div>
        </div>

        {/* One summary line instead of the full screen's four data rows. */}
        <p className="tabular mt-3 text-xs text-muted">
          Potential profit{' '}
          <span className="font-semibold text-primary">
            {validAmount ? `+${formatAmount(potentialProfit, 2)}` : '—'}
          </span>
          {validAmount && selectedDuration && (
            <>
              {' · payout '}
              <span className="font-semibold text-fg">
                {formatAmount(parsedAmount + potentialProfit, 2)} {assetLabel(stakeAsset)}
              </span>
            </>
          )}
        </p>

        {error && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        )}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            loading={mutation.isPending && direction === 'UP'}
            disabled={mutation.isPending}
            onClick={() => place('UP')}
          >
            <TrendingUp className="h-4 w-4" aria-hidden />
            Buy up
          </Button>
          <Button
            size="lg"
            variant="danger"
            loading={mutation.isPending && direction === 'DOWN'}
            disabled={mutation.isPending}
            onClick={() => place('DOWN')}
          >
            <TrendingDown className="h-4 w-4" aria-hidden />
            Buy down
          </Button>
        </div>

        <p className="mt-2.5 text-[11px] leading-relaxed text-muted">{config.disclosure}</p>
      </Card>

      {blockingTrade && (
        <TradeInProgressModal
          trade={blockingTrade}
          currentPrice={ticker.data?.price ?? null}
          priceDecimals={priceDecimals}
          onComplete={handleSettle}
          onForceClose={() => setBlockingTrade(null)}
        />
      )}

      <TradeResultModal
        open={Boolean(settledTrade)}
        onClose={() => setSettledTrade(null)}
        trade={settledTrade}
        priceDecimals={priceDecimals}
      />
    </>
  );
}
