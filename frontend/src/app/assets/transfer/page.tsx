'use client';

/**
 * Demo internal transfer between two accounts on this simulator.
 * Moves simulated credits only.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { FeatureDisabledNotice, SimulationNotice } from '@/components/layout/DemoBadge';
import { usePlatform } from '@/components/providers';
import { usePortfolio, useRefreshBalances } from '@/hooks/useSession';
import { ApiError, api, errorMessage } from '@/lib/api';
import { assetLabel, formatAmount } from '@/lib/format';
import { FormError, Input, PasswordInput, Select, Textarea } from '@/components/ui/form';
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

interface TransferReceipt {
  id: string;
  reference: string;
  asset: string;
  amount: string;
  status: string;
  recipient: string;
}

export default function TransferPage() {
  const { config } = usePlatform();
  const toast = useToast();
  const refreshBalances = useRefreshBalances();
  const portfolio = usePortfolio();

  const [recipient, setRecipient] = useState('');
  const [asset, setAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [fundPassword, setFundPassword] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<{
    recipient?: string;
    amount?: string;
    fundPassword?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [fundPasswordMissing, setFundPasswordMissing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const balances = useMemo(() => portfolio.data?.assets ?? [], [portfolio.data]);
  const selected = balances.find((item) => item.asset === asset) ?? balances[0] ?? null;

  useEffect(() => {
    if (!asset && balances.length > 0) setAsset(balances[0].asset);
  }, [asset, balances]);

  const available = selected ? Number(selected.available) : 0;
  const parsedAmount = Number(amount);

  const mutation = useMutation({
    mutationFn: (body: {
      recipient: string;
      asset: string;
      amount: string;
      fundPassword: string;
      note?: string;
    }) => api.post<TransferReceipt>('/transfers', body),
    onSuccess: (data) => {
      setConfirmOpen(false);
      setAmount('');
      setFundPassword('');
      setNote('');
      refreshBalances();
      toast.success('Demo transfer sent', `Reference ${data.reference}`);
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
    const trimmed = recipient.trim();
    if (!trimmed) {
      next.recipient = 'Enter a username or email address.';
    } else if (trimmed.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      next.recipient = 'Enter a valid email address.';
    }
    if (!amount.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      next.amount = 'Enter an amount greater than zero.';
    } else if (parsedAmount > available) {
      next.amount = 'Amount exceeds your available demo balance.';
    }
    if (!fundPassword) next.fundPassword = 'Enter your fund password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Transfer" backHref="/assets" />
      <PageBody>
        {!config.transfersEnabled ? (
          <FeatureDisabledNotice message="Demo transfers are currently unavailable." />
        ) : portfolio.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : portfolio.isError ? (
          <ErrorState
            title="Could not load your balances"
            description={errorMessage(portfolio.error)}
            onRetry={() => void portfolio.refetch()}
          />
        ) : (
          <div className="space-y-4">
            <SimulationNotice tone="emphasis">
              <strong className="font-bold uppercase tracking-wide">Simulation only.</strong> This
              moves simulated demo credits between two accounts on this paper-trading demo. No real
              money or cryptocurrency is transferred.
            </SimulationNotice>

            <section className="py-3 text-center" aria-live="polite">
              <p className="tabular text-balance font-semibold text-fg">
                {formatAmount(selected?.available, 2)}
              </p>
              <p className="mt-1 text-xs text-muted">
                Available balance ({selected ? selected.label : '—'})
              </p>
            </section>

            <Card>
              <CardBody className="space-y-4">
                <Input
                  label="Recipient"
                  placeholder="Username or email"
                  autoComplete="off"
                  value={recipient}
                  error={errors.recipient}
                  hint="The demo account that will receive the credits."
                  onChange={(event) => {
                    setRecipient(event.target.value);
                    if (errors.recipient) {
                      setErrors((current) => ({ ...current, recipient: undefined }));
                    }
                  }}
                />

                <Select
                  label="Asset"
                  value={selected?.asset ?? ''}
                  onChange={(event) => setAsset(event.target.value)}
                  options={balances.map((item) => ({
                    value: item.asset,
                    label: `${item.label} · ${formatAmount(item.available, 2)}`,
                  }))}
                />

                <Input
                  label="Amount"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  error={errors.amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    if (errors.amount) setErrors((current) => ({ ...current, amount: undefined }));
                  }}
                  suffix={
                    <button
                      type="button"
                      onClick={() => selected && setAmount(selected.available)}
                      className="rounded-control px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10"
                      aria-label="Use maximum available amount"
                    >
                      Max
                    </button>
                  }
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

                <Textarea
                  label="Note"
                  placeholder="Optional message for the recipient"
                  maxLength={280}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  hint={`${note.length}/280`}
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
                  disabled={!selected}
                  loading={mutation.isPending}
                  onClick={() => {
                    setFormError(null);
                    setFundPasswordMissing(false);
                    if (validate()) setConfirmOpen(true);
                  }}
                >
                  Transfer
                </Button>
                <p className="text-center text-xs text-muted">
                  Demo transfer only. No blockchain transaction will be created.
                </p>
              </CardBody>
            </Card>
          </div>
        )}
      </PageBody>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          if (!selected) return;
          mutation.mutate({
            recipient: recipient.trim(),
            asset: selected.asset,
            amount: amount.trim(),
            fundPassword,
            note: note.trim() || undefined,
          });
        }}
        title="Confirm demo transfer"
        confirmLabel="Confirm"
        loading={mutation.isPending}
        footnote="Simulated credits only — nothing leaves this demo."
        details={
          <div>
            <DataRow label="Recipient" value={recipient.trim()} />
            <Divider />
            <DataRow label="Asset" value={selected ? selected.label : '—'} />
            <Divider />
            <DataRow
              label="Amount"
              value={`${formatAmount(amount, 2)} ${selected ? assetLabel(selected.asset) : ''}`}
              tone="strong"
            />
            {note.trim() && (
              <>
                <Divider />
                <DataRow label="Note" value={note.trim()} />
              </>
            )}
          </div>
        }
      />
    </AppShell>
  );
}
