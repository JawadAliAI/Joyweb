'use client';

/**
 * Demo conversion between two simulated assets.
 *
 * The rate is always quoted by the backend. If market data is unavailable the
 * screen says so and blocks the conversion — it never invents or guesses a
 * rate, because a wrong number here would misrepresent the simulation.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowUpDown } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { FeatureDisabledNotice, SimulationNotice } from '@/components/layout/DemoBadge';
import { usePlatform } from '@/components/providers';
import { usePortfolio, useRefreshBalances } from '@/hooks/useSession';
import { ApiError, api, errorMessage } from '@/lib/api';
import { assetLabel, formatAmount } from '@/lib/format';
import { FormError, Input, Select } from '@/components/ui/form';
import { ConfirmModal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import {
  Button,
  Card,
  CardBody,
  DataRow,
  Divider,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives';

interface ConversionQuote {
  fromAsset: string;
  toAsset: string;
  amount: string;
  rate: string;
  estimatedReceive: string;
  feePercent: string;
  demoLabel: string;
  message?: string | null;
}

interface ConversionReceipt {
  id: string;
  reference: string;
  fromAsset: string;
  toAsset: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  createdAt: string;
  message?: string | null;
}

/** Debounce a changing value so the quote endpoint is not hit on every keystroke. */
function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function ConvertPage() {
  const { config } = usePlatform();
  const toast = useToast();
  const refreshBalances = useRefreshBalances();
  const portfolio = usePortfolio();

  const [fromAsset, setFromAsset] = useState('');
  const [toAsset, setToAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const balances = useMemo(() => portfolio.data?.assets ?? [], [portfolio.data]);

  useEffect(() => {
    if (balances.length === 0) return;
    if (!fromAsset) setFromAsset(balances[0].asset);
    if (!toAsset) setToAsset((balances[1] ?? balances[0]).asset);
  }, [balances, fromAsset, toAsset]);

  const fromBalance = balances.find((item) => item.asset === fromAsset) ?? null;
  const toBalance = balances.find((item) => item.asset === toAsset) ?? null;

  const available = fromBalance ? Number(fromBalance.available) : 0;
  const parsedAmount = Number(amount);
  const debouncedAmount = useDebounced(amount, 400);
  const debouncedParsed = Number(debouncedAmount);

  const quoteReady =
    Boolean(fromAsset) &&
    Boolean(toAsset) &&
    fromAsset !== toAsset &&
    Number.isFinite(debouncedParsed) &&
    debouncedParsed > 0;

  const quote = useQuery({
    queryKey: ['conversion-quote', fromAsset, toAsset, debouncedAmount],
    queryFn: () =>
      api.post<ConversionQuote>('/conversions/quote', {
        fromAsset,
        toAsset,
        amount: debouncedAmount.trim(),
      }),
    enabled: config.conversionsEnabled && quoteReady,
    retry: false,
    staleTime: 5_000,
  });

  const marketDataUnavailable =
    quote.error instanceof ApiError && quote.error.code === 'MARKET_DATA_UNAVAILABLE';

  const mutation = useMutation({
    mutationFn: (body: { fromAsset: string; toAsset: string; amount: string }) =>
      api.post<ConversionReceipt>('/conversions', body),
    onSuccess: (data) => {
      setConfirmOpen(false);
      setAmount('');
      refreshBalances();
      toast.success('Demo conversion complete', `Reference ${data.reference}`);
    },
    onError: (error) => {
      setConfirmOpen(false);
      setFormError(errorMessage(error));
    },
  });

  const validate = (): boolean => {
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAmountError('Enter an amount greater than zero.');
      return false;
    }
    if (parsedAmount > available) {
      setAmountError('Amount exceeds your available demo balance.');
      return false;
    }
    if (fromAsset === toAsset) {
      setAmountError('Choose two different assets.');
      return false;
    }
    setAmountError(null);
    return true;
  };

  const swap = () => {
    setFromAsset(toAsset);
    setToAsset(fromAsset);
    setAmountError(null);
  };

  const assetOptions = balances.map((item) => ({ value: item.asset, label: item.label }));
  const canConvert = Boolean(quote.data) && !marketDataUnavailable;

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Convert" backHref="/assets" />
      <PageBody>
        {!config.conversionsEnabled ? (
          <FeatureDisabledNotice message="Demo conversions are currently unavailable." />
        ) : portfolio.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : portfolio.isError ? (
          <ErrorState
            title="Could not load your balances"
            description={errorMessage(portfolio.error)}
            onRetry={() => void portfolio.refetch()}
          />
        ) : (
          <div className="space-y-4">
            <SimulationNotice tone="warning">
              <strong className="font-bold uppercase tracking-wide">Simulation only.</strong>{' '}
              Converting exchanges one simulated demo balance for another at an indicative rate.
              No real assets are bought, sold or held.
            </SimulationNotice>

            <Card>
              <CardBody className="space-y-3">
                <Select
                  label="From"
                  value={fromAsset}
                  options={assetOptions}
                  onChange={(event) => setFromAsset(event.target.value)}
                  hint={
                    fromBalance
                      ? `Available ${formatAmount(fromBalance.available, 2)} ${assetLabel(fromBalance.asset)}`
                      : undefined
                  }
                />

                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={swap}
                    aria-label="Swap the from and to assets"
                    className="rounded-full px-3"
                  >
                    <ArrowUpDown className="h-4 w-4" aria-hidden />
                  </Button>
                </div>

                <Select
                  label="To"
                  value={toAsset}
                  options={assetOptions}
                  onChange={(event) => setToAsset(event.target.value)}
                  hint={
                    toBalance
                      ? `Balance ${formatAmount(toBalance.available, 2)} ${assetLabel(toBalance.asset)}`
                      : undefined
                  }
                />

                <Input
                  label="Amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  error={amountError}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (amountError) setAmountError(null);
                  }}
                  suffix={
                    <button
                      type="button"
                      onClick={() => fromBalance && setAmount(fromBalance.available)}
                      className="rounded-control px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                      aria-label="Use maximum available amount"
                    >
                      Max
                    </button>
                  }
                />
              </CardBody>
            </Card>

            <Card>
              <CardBody className="pt-4" aria-live="polite">
                {!quoteReady ? (
                  <p className="text-center text-xs text-muted">
                    Enter an amount to see the current demo rate.
                  </p>
                ) : quote.isFetching ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-48" />
                  </div>
                ) : marketDataUnavailable ? (
                  <p role="alert" className="text-center text-xs text-danger">
                    Market data is unavailable, so no conversion rate can be quoted. Conversion is
                    disabled until pricing returns — no estimated rate is shown on purpose.
                  </p>
                ) : quote.isError ? (
                  <ErrorState
                    title="Could not fetch a quote"
                    description={errorMessage(quote.error)}
                    onRetry={() => void quote.refetch()}
                  />
                ) : quote.data ? (
                  <div>
                    <DataRow
                      label="Rate"
                      value={`1 ${assetLabel(quote.data.fromAsset)} ≈ ${formatAmount(
                        quote.data.rate,
                        6,
                      )} ${assetLabel(quote.data.toAsset)}`}
                    />
                    <Divider />
                    <DataRow label="Simulated spread" value={`${quote.data.feePercent}%`} />
                    <Divider />
                    <DataRow
                      label="Estimated received"
                      tone="strong"
                      value={`${formatAmount(quote.data.estimatedReceive, 6)} ${assetLabel(quote.data.toAsset)}`}
                    />
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <FormError message={formError} />

            <Button
              fullWidth
              size="lg"
              disabled={!canConvert}
              loading={mutation.isPending}
              onClick={() => {
                setFormError(null);
                if (validate() && canConvert) setConfirmOpen(true);
              }}
            >
              Convert
            </Button>
            <p className="text-center text-xs text-muted">
              Demo conversion only. No real assets are exchanged.
            </p>
          </div>
        )}
      </PageBody>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => mutation.mutate({ fromAsset, toAsset, amount: amount.trim() })}
        title="Confirm demo conversion"
        confirmLabel="Convert"
        loading={mutation.isPending}
        footnote="Simulated balances only — nothing is traded on a real market."
        details={
          <div>
            <DataRow
              label="From"
              value={`${formatAmount(amount, 2)} ${assetLabel(fromAsset)}`}
            />
            <Divider />
            <DataRow
              label="To"
              value={
                quote.data
                  ? `${formatAmount(quote.data.estimatedReceive, 6)} ${assetLabel(toAsset)}`
                  : '—'
              }
              tone="strong"
            />
            <Divider />
            <DataRow label="Rate" value={quote.data ? formatAmount(quote.data.rate, 6) : '—'} />
            <Divider />
            <DataRow
              label="Simulated spread"
              value={quote.data ? `${quote.data.feePercent}%` : '—'}
            />
          </div>
        }
      />
    </AppShell>
  );
}
