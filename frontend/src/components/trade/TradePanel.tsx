'use client';

/**
 * The trade ticket.
 *
 * Every market, duration, payout percentage and quick-amount chip comes from
 * `/api/trades/config`; none of them are hard-coded here. The payout figures
 * shown are the simulator's own configured percentages, and the API's
 * `disclosure` text explains how outcomes are decided so the user is never
 * left guessing.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { assetLabel, assetTicker, cn, formatAmount, formatPrice } from '@/lib/format';
import { Button, Card, CardBody, DataRow, Divider } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import type { TradeConfig, TradeDirection, TradeDuration } from '@/lib/types';

export interface TradeTicket {
  symbol: string;
  direction: TradeDirection;
  amount: string;
  stakeAsset: string;
  duration: TradeDuration;
  potentialProfit: number;
  potentialPayout: number;
}

export function TradePanel({
  config,
  availableBalance,
  currentPrice,
  priceDecimals = 2,
  symbol,
  onSymbolChange,
  stakeAsset,
  onStakeAssetChange,
  submitting,
  onSubmit,
}: {
  config: TradeConfig;
  /** Available demo balance in the trade asset, as a string from the API. */
  availableBalance: string | null;
  currentPrice: string | null;
  priceDecimals?: number;
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  stakeAsset: string;
  onStakeAssetChange: (asset: string) => void;
  submitting?: boolean;
  onSubmit: (ticket: TradeTicket) => void;
}) {
  const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
  const [direction, setDirection] = useState<TradeDirection>('UP');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const durations = config.durations;

  useEffect(() => {
    if (durationSeconds !== null || durations.length === 0) return;
    const preferred =
      durations.find((item) => item.seconds === config.defaultDurationSeconds) ?? durations[0];
    setDurationSeconds(preferred.seconds);
  }, [durationSeconds, durations, config.defaultDurationSeconds]);

  const selectedDuration = useMemo(
    () => durations.find((item) => item.seconds === durationSeconds) ?? durations[0] ?? null,
    [durations, durationSeconds],
  );

  const parsedAmount = Number(amount);
  const payoutPercent = selectedDuration ? Number(selectedDuration.payoutPercent) : 0;
  const validAmount = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const potentialProfit = validAmount && Number.isFinite(payoutPercent)
    ? (parsedAmount * payoutPercent) / 100
    : 0;
  const potentialPayout = validAmount ? parsedAmount + potentialProfit : 0;

  const available = availableBalance === null ? null : Number(availableBalance);

  const validate = (): string | null => {
    if (!selectedDuration) return 'Select a duration.';
    if (!validAmount) return 'Enter a trade amount greater than zero.';
    const min = Number(selectedDuration.minAmount);
    const max = Number(selectedDuration.maxAmount);
    if (Number.isFinite(min) && parsedAmount < min) {
      return `Minimum trade amount is ${formatAmount(selectedDuration.minAmount, 2)}.`;
    }
    if (Number.isFinite(max) && max > 0 && parsedAmount > max) {
      return `Maximum trade amount is ${formatAmount(selectedDuration.maxAmount, 2)}.`;
    }
    if (available !== null && parsedAmount > available) {
      return 'Amount exceeds your available balance.';
    }
    return null;
  };

  const submit = (nextDirection: TradeDirection) => {
    setDirection(nextDirection);
    const problem = validate();
    setError(problem);
    if (problem || !selectedDuration) return;
    onSubmit({
      symbol,
      direction: nextDirection,
      amount: amount.trim(),
      stakeAsset,
      duration: selectedDuration,
      potentialProfit,
      potentialPayout,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <Select
              label="Pair"
              className="min-w-[10rem]"
              value={symbol}
              onChange={(event) => onSymbolChange(event.target.value)}
              options={config.markets.map((market) => ({
                value: market.symbol,
                label: market.displayName,
              }))}
            />
            <div className="pb-1 text-right">
              <p className="text-xs text-muted">Current price</p>
              <p className="tabular text-lg font-semibold text-fg" aria-live="polite">
                {formatPrice(currentPrice, priceDecimals)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p id="duration-label" className="text-sm font-medium text-fg">
              Duration
            </p>
            <div
              role="radiogroup"
              aria-labelledby="duration-label"
              className="grid grid-cols-2 gap-2 sm:grid-cols-3"
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
                      'relative touch-target rounded-control border px-3 py-2 text-left transition-colors',
                      active
                        ? 'border-primary bg-primary/10 ring-2 ring-primary'
                        : 'border-border bg-surface hover:border-border',
                    )}
                  >
                    <span className="block text-sm font-semibold text-fg">{item.label}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      Profitability {item.payoutPercent}%
                    </span>
                    {active && (
                      <Check
                        className="absolute right-2 top-2 h-4 w-4 text-primary"
                        aria-hidden
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {config.stakeAssets && config.stakeAssets.length > 1 && (
            <div className="space-y-2">
              <p id="stake-asset-label" className="text-sm font-medium text-fg">
                Trading model
              </p>
              <div
                role="radiogroup"
                aria-labelledby="stake-asset-label"
                className="grid grid-cols-2 gap-2"
              >
                {config.stakeAssets.map((option) => {
                  const active = option.asset === stakeAsset;
                  return (
                    <button
                      key={option.asset}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onStakeAssetChange(option.asset)}
                      className={cn(
                        'relative touch-target rounded-control border px-3 py-2.5 text-sm font-semibold transition-colors',
                        active
                          ? 'border-primary bg-primary/10 text-fg'
                          : 'border-border bg-surface text-muted hover:text-fg',
                      )}
                    >
                      {assetTicker(option.asset)}
                      {active && (
                        <Check
                          className="absolute right-2 top-2 h-4 w-4 text-primary"
                          aria-hidden
                        />
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted">
                Chooses which stablecoin funds the stake. It does not affect the outcome.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <p id="amount-chips-label" className="text-sm font-medium text-fg">
              Trade amount
            </p>
            <div
              role="group"
              aria-labelledby="amount-chips-label"
              className="flex flex-wrap gap-2"
            >
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
                      'touch-target rounded-pill border px-4 text-sm font-semibold transition-colors',
                      active
                        ? 'border-primary bg-primary/15 text-primary'
                        : 'border-border bg-surface text-muted hover:text-fg',
                    )}
                  >
                    {formatAmount(quick, 0)}
                  </button>
                );
              })}
            </div>

            <Input
              label="Custom amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder="0.00"
              value={amount}
              error={error}
              hint={
                selectedDuration
                  ? `Min ${formatAmount(selectedDuration.minAmount, 2)} · Max ${formatAmount(
                      selectedDuration.maxAmount,
                      2,
                    )} ${assetLabel(stakeAsset)}`
                  : undefined
              }
              onChange={(event) => {
                setAmount(event.target.value);
                if (error) setError(null);
              }}
            />
          </div>

          <div>
            <DataRow
              label="Available Balance"
              value={
                available === null
                  ? '—'
                  : `${formatAmount(availableBalance, 2)} ${assetLabel(stakeAsset)}`
              }
            />
            <Divider />
            <DataRow
              label="Trade Amount"
              value={validAmount ? `${formatAmount(amount, 2)} ${assetLabel(stakeAsset)}` : '—'}
            />
            <Divider />
            <DataRow
              label="Potential profit"
              value={validAmount ? `+${formatAmount(potentialProfit, 2)}` : '—'}
            />
            <Divider />
            <DataRow
              label="Potential Payout"
              tone="strong"
              value={validAmount ? formatAmount(potentialPayout, 2) : '—'}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              loading={submitting && direction === 'UP'}
              onClick={() => submit('UP')}
            >
              UP · Buy up
            </Button>
            <Button
              size="lg"
              variant="danger"
              loading={submitting && direction === 'DOWN'}
              onClick={() => submit('DOWN')}
            >
              DOWN · Buy down
            </Button>
          </div>
        </CardBody>
      </Card>

      <SimulationNotice>{config.disclosure}</SimulationNotice>
    </div>
  );
}
