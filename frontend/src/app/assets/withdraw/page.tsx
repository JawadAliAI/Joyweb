'use client';

/**
 * Demo withdrawal.
 *
 * Nothing here touches a blockchain: the request is recorded against the
 * simulated ledger so the review flow can be demonstrated end to end. Limits,
 * fees and the network list all come from `/api/withdrawals/options` — none of
 * them are hard-coded.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { FeatureDisabledNotice, SimulationNotice } from '@/components/layout/DemoBadge';
import { usePlatform } from '@/components/providers';
import { useRefreshBalances } from '@/hooks/useSession';
import { ApiError, api, errorMessage } from '@/lib/api';
import { assetLabel, cn, formatAmount } from '@/lib/format';
import { AssetIcon } from '@/components/AssetIcon';
import { FormError, Input, PasswordInput } from '@/components/ui/form';
import { ConfirmModal, Modal } from '@/components/ui/overlay';
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
import type { Withdrawal, WithdrawalNetwork, WithdrawalOptions } from '@/lib/types';

/** Fee = flat + percent of amount, exactly as the API describes it. */
function computeFee(amount: number, options: WithdrawalOptions): number {
  const flat = Number(options.feeFlat);
  const percent = Number(options.feePercent);
  const flatPart = Number.isFinite(flat) ? flat : 0;
  const percentPart = Number.isFinite(percent) ? (amount * percent) / 100 : 0;
  return flatPart + percentPart;
}

export default function WithdrawPage() {
  const { config } = usePlatform();
  const toast = useToast();
  const refreshBalances = useRefreshBalances();

  const [networkId, setNetworkId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [fundPassword, setFundPassword] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; address?: string; fundPassword?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fundPasswordMissing, setFundPasswordMissing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const options = useQuery({
    queryKey: ['withdrawal-options'],
    queryFn: () => api.get<WithdrawalOptions>('/withdrawals/options'),
    enabled: config.withdrawalsEnabled,
  });

  const networks = useMemo<WithdrawalNetwork[]>(() => options.data?.networks ?? [], [options.data]);
  const selected = networks.find((item) => item.id === networkId) ?? networks[0] ?? null;

  useEffect(() => {
    if (!networkId && networks.length > 0) setNetworkId(networks[0].id);
  }, [networkId, networks]);

  const available = selected ? Number(selected.availableBalance) : 0;
  const parsedAmount = Number(amount);
  const fee = options.data && Number.isFinite(parsedAmount) ? computeFee(parsedAmount, options.data) : 0;
  const receive = Math.max(0, parsedAmount - fee);

  const mutation = useMutation({
    mutationFn: (body: {
      networkId: string;
      amount: string;
      address: string;
      fundPassword: string;
    }) => api.post<Withdrawal>('/withdrawals/demo', body),
    onSuccess: (data) => {
      setConfirmOpen(false);
      setAmount('');
      setAddress('');
      setFundPassword('');
      refreshBalances();
      toast.success('Demo withdrawal submitted', `Reference ${data.reference}`);
    },
    onError: (error) => {
      setConfirmOpen(false);
      if (error instanceof ApiError && error.code === 'FUND_PASSWORD_NOT_SET') {
        setFundPasswordMissing(true);
        setFormError(null);
        return;
      }
      setFormError(errorMessage(error));
    },
  });

  const validate = (): boolean => {
    const next: typeof errors = {};
    const min = Number(options.data?.minAmount);
    const max = Number(options.data?.maxAmount);

    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      next.amount = 'Enter an amount greater than zero.';
    } else if (parsedAmount > available) {
      next.amount = 'Amount exceeds your available demo balance.';
    } else if (Number.isFinite(min) && parsedAmount < min) {
      next.amount = `Minimum withdrawal is ${formatAmount(options.data?.minAmount, 2)}.`;
    } else if (Number.isFinite(max) && max > 0 && parsedAmount > max) {
      next.amount = `Maximum withdrawal is ${formatAmount(options.data?.maxAmount, 2)}.`;
    }

    if (!address.trim()) next.address = 'Enter a destination address.';
    if (!fundPassword) next.fundPassword = 'Enter your fund password.';

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const openConfirm = () => {
    setFormError(null);
    setFundPasswordMissing(false);
    if (!selected) return;
    if (!validate()) return;
    setConfirmOpen(true);
  };

  const disabledByFlag = !config.withdrawalsEnabled;
  const disabledByApi = options.data ? !options.data.enabled : false;

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Withdraw" backHref="/assets" />
      <PageBody>
        {disabledByFlag ? (
          <FeatureDisabledNotice
            message={options.data?.message || 'Demo withdrawals are currently unavailable.'}
          />
        ) : options.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : options.isError ? (
          <ErrorState
            title="Could not load withdrawal options"
            description={errorMessage(options.error)}
            onRetry={() => void options.refetch()}
          />
        ) : disabledByApi ? (
          <FeatureDisabledNotice
            message={options.data?.message || 'Demo withdrawals are currently unavailable.'}
          />
        ) : (
          <div className="space-y-4">
            {options.data?.notice && (
              <div
                role="status"
                className="rounded-card border border-border bg-elevated px-4 py-3 text-sm text-fg"
              >
                {options.data.notice}
              </div>
            )}

            <SimulationNotice tone="warning">
              <strong className="font-bold uppercase tracking-wide">
                Simulation only — no real blockchain transfer.
              </strong>{' '}
              This request debits simulated demo credits and is recorded for review inside the
              demo. No cryptocurrency leaves any wallet.
            </SimulationNotice>

            <section className="py-4 text-center" aria-live="polite">
              <p className="tabular text-balance font-semibold text-fg">
                {formatAmount(selected?.availableBalance, 2)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Available balance ({selected ? selected.label : '—'})
              </p>
            </section>

            <Card>
              <CardBody className="space-y-4">
                <div className="space-y-1.5">
                  <span id="coin-label" className="text-sm font-medium text-fg">
                    Coin
                  </span>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    aria-labelledby="coin-label"
                    aria-haspopup="dialog"
                    className="flex w-full touch-target items-center gap-3 rounded-control border border-border bg-surface px-3.5 text-left"
                  >
                    {selected && <AssetIcon asset={selected.asset} size="sm" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                      {selected ? selected.label : 'Select a coin'}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                  </button>
                </div>

                <Input
                  label="Amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  error={errors.amount}
                  hint={
                    options.data
                      ? `Min ${formatAmount(options.data.minAmount, 2)} · Max ${formatAmount(
                          options.data.maxAmount,
                          2,
                        )} · Fee ${formatAmount(options.data.feeFlat, 2)} + ${options.data.feePercent}%`
                      : undefined
                  }
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
                  }}
                  suffix={
                    <button
                      type="button"
                      onClick={() => selected && setAmount(selected.availableBalance)}
                      className="rounded-control px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                      aria-label="Use maximum available amount"
                    >
                      Max
                    </button>
                  }
                />

                <Input
                  label="Address"
                  placeholder="Demo destination address"
                  value={address}
                  error={errors.address}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => {
                    setAddress(event.target.value);
                    if (errors.address) setErrors((current) => ({ ...current, address: undefined }));
                  }}
                />

                <PasswordInput
                  label="Fund Password"
                  placeholder="Enter your fund password"
                  autoComplete="off"
                  value={fundPassword}
                  error={errors.fundPassword}
                  onChange={(event) => {
                    setFundPassword(event.target.value);
                    if (errors.fundPassword) {
                      setErrors((current) => ({ ...current, fundPassword: undefined }));
                    }
                  }}
                />

                {fundPasswordMissing && (
                  <div role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-xs text-danger">
                    You have not set a fund password yet.{' '}
                    <Link href="/profile/security" className="font-semibold underline">
                      Set one in Security settings
                    </Link>
                    .
                  </div>
                )}

                <FormError message={formError} />

                <Button
                  fullWidth
                  size="lg"
                  onClick={openConfirm}
                  disabled={!selected}
                  loading={mutation.isPending}
                >
                  Withdraw
                </Button>
                <p className="text-center text-xs text-muted">
                  Demo withdrawal only. No blockchain transaction will be created.
                </p>
              </CardBody>
            </Card>
          </div>
        )}
      </PageBody>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Select coin"
        description="Demo networks only."
        size="tall"
      >
        <ul className="divide-y divide-border/70">
          {networks.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setNetworkId(item.id);
                  setPickerOpen(false);
                }}
                aria-current={item.id === selected?.id}
                className={cn(
                  'flex w-full touch-target items-center gap-3 px-1 text-left',
                  item.id === selected?.id ? 'text-fg' : 'text-muted hover:text-fg',
                )}
              >
                <AssetIcon asset={item.asset} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-fg">{item.label}</span>
                  <span className="tabular block text-xs text-muted">
                    {formatAmount(item.availableBalance, 2)} available
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      </Modal>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (!selected) return;
          mutation.mutate({
            networkId: selected.id,
            amount: amount.trim(),
            address: address.trim(),
            fundPassword,
          });
        }}
        title="Confirm demo withdrawal"
        confirmLabel="Confirm"
        loading={mutation.isPending}
        footnote="Demo withdrawal only. No blockchain transaction will be created."
        details={
          <div>
            <DataRow label="Asset" value={selected ? selected.label : '—'} />
            <Divider />
            <DataRow
              label="Amount"
              value={`${formatAmount(amount, 2)} ${selected ? assetLabel(selected.asset) : ''}`}
            />
            <Divider />
            <DataRow label="Fee" value={formatAmount(fee, 2)} />
            <Divider />
            <DataRow label="Receive" value={formatAmount(receive, 2)} tone="strong" />
            <Divider />
            <DataRow
              label="Destination"
              value={<span className="break-all font-mono text-xs">{address}</span>}
            />
          </div>
        }
      />
    </AppShell>
  );
}
