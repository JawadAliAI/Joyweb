'use client';

/**
 * Outcomes & Payments.
 *
 * One screen for the two things an operator watches together: how positions
 * settled (win / loss / draw) and the money that moved for those members.
 *
 * Administrator-only, like the rest of `/admin` — the segment is gated by
 * `useRequireAdmin`, and every endpoint it calls is behind `require_admin`
 * server-side. The agent portal has no equivalent screen and no write access to
 * any of this.
 *
 * Everything here moves *simulated* balances. A deposit credits a demo wallet
 * and a withdrawal debits one; no gateway is involved and no chain transaction
 * is created.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Check, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn, formatAmount, formatDateTime } from '@/lib/format';
import { Column, DataSurface, StatTiles } from '@/components/agent/AgentPrimitives';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { Badge } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import type {
  AdminDeposit, AdminPage, AdminTrade, AdminWithdrawal,
} from '@/lib/admin-types';

const ASSETS = ['DEMO_USDT', 'DEMO_USDC', 'DEMO_BTC', 'DEMO_ETH'];

type Tab = 'outcomes' | 'payments';

/** A deposit and a withdrawal, flattened into one shape so they can share a table. */
interface Movement {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  userId: string;
  username: string | null;
  email: string | null;
  asset: string;
  amount: string;
  status: string;
  reference: string;
  createdAt: string;
}

/** What the reason dialog is about to do. */
type Action =
  | { type: 'review'; movement: Movement; decision: 'approve' | 'reject' }
  | { type: 'adjust'; direction: 'credit' | 'debit' };

export default function AdminSettlementsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('outcomes');
  const [action, setAction] = useState<Action | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Fields for the manual credit / debit, owned here and fed to the dialog.
  const [memberQuery, setMemberQuery] = useState('');
  const [memberId, setMemberId] = useState('');
  const [asset, setAsset] = useState(ASSETS[0]);
  const [amount, setAmount] = useState('');

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /* ------------------------------------------------------------ Outcomes */

  const settled = useQuery({
    queryKey: ['admin', 'trades', 'settled', page, pageSize],
    queryFn: () =>
      api.get<AdminPage<AdminTrade>>('/admin/trades', {
        status: 'SETTLED',
        page,
        pageSize,
      }),
    refetchInterval: 15_000,
  });

  /* ------------------------------------------------------------ Payments */

  const deposits = useQuery({
    queryKey: ['admin', 'deposits', 'all'],
    queryFn: () => api.get<AdminPage<AdminDeposit>>('/admin/deposits', {
      status: 'ALL', pageSize: 50,
    }),
  });

  const withdrawals = useQuery({
    queryKey: ['admin', 'withdrawals', 'all'],
    queryFn: () => api.get<AdminPage<AdminWithdrawal>>('/admin/withdrawals', {
      status: 'ALL', pageSize: 50,
    }),
  });

  const movements: Movement[] = useMemo(() => {
    const rows: Movement[] = [
      ...(deposits.data?.items ?? []).map((d) => ({
        id: d.id,
        kind: 'DEPOSIT' as const,
        userId: d.userId,
        username: d.username,
        email: d.email,
        asset: d.asset,
        amount: d.amount,
        status: d.status,
        reference: d.reference,
        createdAt: d.createdAt,
      })),
      ...(withdrawals.data?.items ?? []).map((w) => ({
        id: w.id,
        kind: 'WITHDRAWAL' as const,
        userId: w.userId,
        username: w.username,
        email: w.email,
        asset: w.asset,
        amount: w.amount,
        status: w.status,
        reference: w.reference,
        createdAt: w.createdAt,
      })),
    ];
    // Newest first across both kinds.
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [deposits.data, withdrawals.data]);

  /* ------------------------------------------------------------- Actions */

  const refreshMoney = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'deposits'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
  };

  const review = useMutation({
    mutationFn: (input: { movement: Movement; decision: 'approve' | 'reject'; reason: string }) => {
      const base = input.movement.kind === 'DEPOSIT' ? 'deposits' : 'withdrawals';
      return api.post<{ status: string }>(
        `/admin/${base}/${input.movement.id}/${input.decision}`,
        { reason: input.reason },
      );
    },
    onSuccess: (_data, input) => {
      setAction(null);
      setDialogError(null);
      toast.success(
        input.decision === 'approve' ? 'Approved' : 'Rejected',
        `${input.movement.kind === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'} ${input.movement.reference}`,
      );
      refreshMoney();
    },
    onError: (error) => setDialogError(errorMessage(error)),
  });

  const adjust = useMutation({
    mutationFn: (input: { direction: 'credit' | 'debit'; reason: string }) =>
      api.post<{ newAvailable: string }>(
        `/admin/users/${memberId}/balance/${input.direction}`,
        { asset, amount: amount.trim(), reason: input.reason },
      ),
    onSuccess: (data, input) => {
      setAction(null);
      setDialogError(null);
      setAmount('');
      toast.success(
        input.direction === 'credit' ? 'Deposit credited' : 'Withdrawal debited',
        `New balance ${formatAmount(data.newAvailable)} ${asset}`,
      );
      refreshMoney();
    },
    onError: (error) => setDialogError(errorMessage(error)),
  });

  /** Resolve the typed search to one account before enabling the buttons. */
  const memberLookup = useQuery({
    queryKey: ['admin', 'users', 'lookup', memberQuery],
    queryFn: () =>
      api.get<AdminPage<{ id: string; username: string; email: string }>>('/admin/users', {
        search: memberQuery,
        pageSize: 5,
      }),
    enabled: memberQuery.trim().length >= 2,
  });

  const candidates = memberLookup.data?.items ?? [];

  /* -------------------------------------------------------------- Tables */

  const outcomeColumns: Column<AdminTrade>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (row) => (
        <span>
          <Link
            href={`/admin/users/${row.userId}`}
            className="block font-medium text-primary hover:underline"
          >
            {row.username ?? row.userId.slice(0, 8)}
          </Link>
          <span className="block text-xs text-muted">{row.email ?? ''}</span>
        </span>
      ),
    },
    { key: 'pair', header: 'Pair', width: 'w-32', render: (row) => row.symbol },
    {
      key: 'direction',
      header: 'Direction',
      width: 'w-24',
      render: (row) => (
        <Badge tone={row.direction === 'UP' ? 'success' : 'danger'}>{row.direction}</Badge>
      ),
    },
    {
      key: 'stake',
      header: 'Stake',
      align: 'right',
      width: 'w-28',
      render: (row) => formatAmount(row.amount),
    },
    {
      key: 'outcome',
      header: 'Outcome',
      width: 'w-28',
      render: (row) => (
        <Badge
          tone={
            row.outcome === 'WIN' ? 'success' : row.outcome === 'LOSS' ? 'danger' : 'neutral'
          }
        >
          {row.outcome ?? row.status}
        </Badge>
      ),
    },
    {
      key: 'pnl',
      header: 'P/L',
      align: 'right',
      width: 'w-32',
      render: (row) => {
        if (row.profitLoss === null) return <span className="text-muted">—</span>;
        const value = Number(row.profitLoss);
        return (
          <span className={cn(value < 0 ? 'text-danger' : value > 0 ? 'text-primary' : '')}>
            {value > 0 ? '+' : ''}
            {formatAmount(row.profitLoss)}
          </span>
        );
      },
    },
    {
      key: 'source',
      header: 'Settled by',
      width: 'w-44',
      render: (row) => (
        <span
          className={cn(
            'text-xs',
            row.settlementSource?.includes('TEST') ? 'font-medium text-warning' : 'text-muted',
          )}
        >
          {row.settlementSource ?? '—'}
        </span>
      ),
    },
    {
      key: 'when',
      header: 'Settled',
      width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.settledAt)}</span>,
    },
  ];

  const paymentColumns: Column<Movement>[] = [
    {
      key: 'kind',
      header: 'Type',
      width: 'w-32',
      render: (row) => (
        <span className="flex items-center gap-1.5 text-sm">
          {row.kind === 'DEPOSIT' ? (
            <ArrowDownToLine className="h-3.5 w-3.5 text-primary" aria-hidden />
          ) : (
            <ArrowUpFromLine className="h-3.5 w-3.5 text-danger" aria-hidden />
          )}
          {row.kind === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
        </span>
      ),
    },
    {
      key: 'member',
      header: 'Member',
      render: (row) => (
        <span>
          <Link
            href={`/admin/users/${row.userId}`}
            className="block font-medium text-primary hover:underline"
          >
            {row.username ?? row.userId.slice(0, 8)}
          </Link>
          <span className="block text-xs text-muted">{row.email ?? ''}</span>
        </span>
      ),
    },
    { key: 'asset', header: 'Asset', width: 'w-32', render: (row) => row.asset },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: 'w-32',
      render: (row) => formatAmount(row.amount),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-32',
      render: (row) => (
        <Badge
          tone={
            row.status === 'COMPLETED'
              ? 'success'
              : row.status === 'REJECTED' || row.status === 'FAILED'
                ? 'danger'
                : 'warning'
          }
        >
          {row.status}
        </Badge>
      ),
    },
    {
      key: 'reference',
      header: 'Reference',
      width: 'w-52',
      render: (row) => <span className="font-mono text-xs">{row.reference}</span>,
    },
    {
      key: 'actions',
      header: 'Review',
      width: 'w-44',
      align: 'center',
      render: (row) => {
        if (row.status !== 'PENDING') return <span className="text-xs text-muted">—</span>;
        return (
          <span className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => {
                setDialogError(null);
                setAction({ type: 'review', movement: row, decision: 'approve' });
              }}
              className="flex items-center gap-1 border border-primary px-2 py-1 text-xs text-primary transition-colors hover:bg-primary/10"
            >
              <Check className="h-3 w-3" aria-hidden />
              Approve
            </button>
            <button
              type="button"
              onClick={() => {
                setDialogError(null);
                setAction({ type: 'review', movement: row, decision: 'reject' });
              }}
              className="flex items-center gap-1 border border-danger px-2 py-1 text-xs text-danger transition-colors hover:bg-danger/10"
            >
              <X className="h-3 w-3" aria-hidden />
              Reject
            </button>
          </span>
        );
      },
    },
  ];

  /* --------------------------------------------------------------- Tiles */

  const trades = settled.data?.items ?? [];
  const wins = trades.filter((t) => t.outcome === 'WIN');
  const losses = trades.filter((t) => t.outcome === 'LOSS');
  const draws = trades.filter((t) => t.outcome === 'DRAW');
  const netPnl = trades.reduce((sum, t) => sum + Number(t.profitLoss ?? 0), 0);
  const pendingMoney = movements.filter((m) => m.status === 'PENDING');

  const amountValid = Number(amount) > 0;

  return (
    <div className="space-y-[15px]">
      <StatTiles
        loading={settled.isLoading}
        tiles={[
          { label: 'Wins on this page', value: wins.length },
          { label: 'Losses on this page', value: losses.length },
          { label: 'Draws on this page', value: draws.length },
          {
            label: 'Net member P/L',
            value: `${netPnl > 0 ? '+' : ''}${formatAmount(netPnl)}`,
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['outcomes', `Outcomes (${settled.data?.meta.total ?? 0})`],
            ['payments', `Payments (${movements.length})`],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'rounded-control px-3.5 py-1.5 text-xs font-semibold transition-colors',
              tab === id
                ? 'bg-primary text-primary-foreground'
                : 'bg-surface text-muted hover:text-fg',
            )}
          >
            {label}
          </button>
        ))}
        {pendingMoney.length > 0 && (
          <span className="rounded-control bg-warning/15 px-2.5 py-1.5 text-xs font-medium text-warning">
            {pendingMoney.length} awaiting review
          </span>
        )}
      </div>

      {tab === 'outcomes' ? (
        <DataSurface
          columns={outcomeColumns}
          rows={trades}
          rowKey={(row) => row.id}
          loading={settled.isLoading}
          error={settled.isError ? errorMessage(settled.error, 'Could not load outcomes.') : null}
          empty="No settled positions yet"
          page={page}
          pageSize={pageSize}
          total={settled.data?.meta.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />
      ) : (
        <>
          {/* Move money directly, without waiting for a member to request it. */}
          <div className="rounded-card bg-surface p-[15px] shadow-card">
            <h2 className="text-sm font-semibold text-fg">Deposit or withdraw for a member</h2>
            <p className="mt-1 text-xs text-muted">
              Credits or debits a simulated balance immediately. A debit that would overdraw
              the wallet is refused rather than clamped. Both write a ledger entry and an
              audit row.
            </p>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="md:col-span-2">
                <Input
                  label="Member"
                  placeholder="Search email, username or name"
                  value={memberQuery}
                  onChange={(event) => {
                    setMemberQuery(event.target.value);
                    setMemberId('');
                  }}
                  hint={
                    memberId
                      ? `Selected: ${candidates.find((c) => c.id === memberId)?.email ?? memberId}`
                      : 'Type at least two characters, then pick an account.'
                  }
                />
                {memberQuery.trim().length >= 2 && !memberId && candidates.length > 0 && (
                  <ul className="mt-1 border border-border bg-surface">
                    {candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <button
                          type="button"
                          onClick={() => setMemberId(candidate.id)}
                          className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-elevated"
                        >
                          <span className="font-medium text-fg">{candidate.username}</span>
                          <span className="text-xs text-muted">{candidate.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <Select
                label="Asset"
                value={asset}
                onChange={(event) => setAsset(event.target.value)}
                options={ASSETS.map((value) => ({ value, label: value.replace('DEMO_', '') }))}
              />

              <Input
                label="Amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                disabled={!memberId || !amountValid}
                onClick={() => {
                  setDialogError(null);
                  setAction({ type: 'adjust', direction: 'credit' });
                }}
                className="flex h-11 items-center justify-center gap-2 bg-primary px-[18px] text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-[38px]"
              >
                <ArrowDownToLine className="h-4 w-4" aria-hidden />
                Deposit
              </button>
              <button
                type="button"
                disabled={!memberId || !amountValid}
                onClick={() => {
                  setDialogError(null);
                  setAction({ type: 'adjust', direction: 'debit' });
                }}
                className="flex h-11 items-center justify-center gap-2 bg-danger px-[18px] text-sm text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50 sm:h-[38px]"
              >
                <ArrowUpFromLine className="h-4 w-4" aria-hidden />
                Withdraw
              </button>
            </div>
          </div>

          <DataSurface
            columns={paymentColumns}
            rows={movements}
            rowKey={(row) => `${row.kind}-${row.id}`}
            loading={deposits.isLoading || withdrawals.isLoading}
            error={
              deposits.isError || withdrawals.isError
                ? 'Could not load payments.'
                : null
            }
            empty="No deposits or withdrawals yet"
            page={1}
            pageSize={movements.length || 1}
            total={movements.length}
            onPageChange={() => undefined}
            onPageSizeChange={() => undefined}
          />
        </>
      )}

      <ReasonDialog
        open={Boolean(action)}
        onClose={() => {
          setAction(null);
          setDialogError(null);
        }}
        onSubmit={(reason) => {
          if (!action) return;
          if (action.type === 'review') {
            review.mutate({ movement: action.movement, decision: action.decision, reason });
          } else {
            adjust.mutate({ direction: action.direction, reason });
          }
        }}
        title={
          action?.type === 'review'
            ? `${action.decision === 'approve' ? 'Approve' : 'Reject'} this ${
                action.movement.kind === 'DEPOSIT' ? 'deposit' : 'withdrawal'
              }`
            : action?.direction === 'credit'
              ? 'Credit a simulated balance'
              : 'Debit a simulated balance'
        }
        description={
          action?.type === 'review'
            ? `${action.movement.username ?? action.movement.userId} · ${formatAmount(
                action.movement.amount,
              )} ${action.movement.asset} · ${action.movement.reference}`
            : `${formatAmount(amount)} ${asset}`
        }
        confirmLabel={
          action?.type === 'review'
            ? action.decision === 'approve'
              ? 'Approve'
              : 'Reject'
            : action?.direction === 'credit'
              ? 'Credit'
              : 'Debit'
        }
        confirmVariant={
          action?.type === 'review'
            ? action.decision === 'reject'
              ? 'danger'
              : 'primary'
            : action?.direction === 'debit'
              ? 'danger'
              : 'primary'
        }
        loading={review.isPending || adjust.isPending}
        error={dialogError}
        footnote="Simulated funds only. No gateway is called and no chain transaction is created."
      />
    </div>
  );
}
