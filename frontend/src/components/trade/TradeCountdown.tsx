'use client';

/**
 * Live countdown for an open demo position.
 *
 * One interval drives the clock; it is cleared on unmount and stops itself at
 * zero rather than counting into negative time. The remaining time is
 * announced politely so screen-reader users are not left behind.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { cn, formatCountdown, formatPrice, assetLabel } from '@/lib/format';
import { Badge, Card, CardBody, DataRow, Divider } from '@/components/ui/primitives';
import type { TickerListResponse, Trade } from '@/lib/types';

/** Seconds left, derived from the expiry timestamp so a re-mount stays accurate. */
function secondsUntil(expiresAt: string, fallback: number): number {
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return Math.max(0, fallback);
  return Math.max(0, Math.round((target - Date.now()) / 1000));
}

export function TradeCountdown({
  trade,
  priceDecimals = 2,
  onExpire,
}: {
  trade: Trade;
  priceDecimals?: number;
  onExpire?: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    secondsUntil(trade.expiresAt, trade.secondsRemaining),
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    setRemaining(secondsUntil(trade.expiresAt, trade.secondsRemaining));
  }, [trade.expiresAt, trade.secondsRemaining, trade.id]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const next = secondsUntil(trade.expiresAt, 0);
      setRemaining(next);
      if (next <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        window.clearInterval(interval);
        onExpire?.();
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [trade.expiresAt, onExpire]);

  const live = remaining > 0;

  const ticker = useQuery({
    queryKey: ['ticker', trade.symbol],
    queryFn: () =>
      api
        .get<TickerListResponse>('/markets/ticker', { symbols: trade.symbol })
        .then((response) => response.items[0] ?? null),
    refetchInterval: live ? 5_000 : false,
    enabled: live,
  });

  const currentPrice = ticker.data?.price ?? null;
  const entry = Number(trade.entryPrice);
  const current = currentPrice === null ? null : Number(currentPrice);

  // Ahead/behind is purely indicative while the position is open; the API
  // decides the actual outcome at settlement.
  const winning =
    current === null || !Number.isFinite(entry)
      ? null
      : trade.direction === 'UP'
        ? current > entry
        : current < entry;

  const payoutPercent = Number(trade.payoutPercent);
  const amount = Number(trade.amount);
  const potentialProfit =
    Number.isFinite(payoutPercent) && Number.isFinite(amount)
      ? (amount * payoutPercent) / 100
      : 0;

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">{trade.symbol}</span>
            <Badge tone={trade.direction === 'UP' ? 'success' : 'danger'}>
              {trade.direction === 'UP' ? (
                <ArrowUpRight className="mr-1 h-3 w-3" aria-hidden />
              ) : (
                <ArrowDownRight className="mr-1 h-3 w-3" aria-hidden />
              )}
              {trade.direction}
            </Badge>
          </div>
          <p
            aria-live="polite"
            aria-label={`Time remaining ${formatCountdown(remaining)}`}
            className={cn(
              'tabular text-xl font-bold',
              live ? 'text-fg' : 'text-muted',
            )}
          >
            {formatCountdown(remaining)}
          </p>
        </div>

        <div>
          <DataRow label="Entry price" value={formatPrice(trade.entryPrice, priceDecimals)} />
          <Divider />
          <DataRow
            label="Current price"
            value={
              ticker.isError
                ? 'Unavailable'
                : formatPrice(currentPrice, priceDecimals, live ? '…' : '—')
            }
          />
          <Divider />
          <DataRow
            label="Stake"
            value={`${formatPrice(trade.amount, 2)} ${assetLabel(trade.asset)}`}
          />
          <Divider />
          <DataRow
            label="Running potential result"
            tone="strong"
            value={
              winning === null ? (
                <span className="text-muted">Awaiting price</span>
              ) : (
                <span className={winning ? 'text-primary' : 'text-danger'}>
                  {winning
                    ? `+${formatPrice(potentialProfit, 2)}`
                    : `-${formatPrice(trade.amount, 2)}`}
                </span>
              )
            }
          />
        </div>

        <p className="text-xs text-muted">
          {live
            ? 'Indicative only while the position is open. The outcome is settled at expiry.'
            : 'Expired — settling this position.'}
        </p>
      </CardBody>
    </Card>
  );
}
