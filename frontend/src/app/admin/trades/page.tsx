'use client';

/**
 * Live positions (Delivery orders).
 *
 * Every simulated position on the platform, newest first, refreshing while it
 * is open — who placed it, what they staked, the entry price, and the
 * countdown. This is the full-visibility view: nothing is hidden from an
 * administrator here.
 *
 * Each row carries WIN / LOSS / DRAW. Those run the platform's existing
 * scripted-outcome path, which is deliberately not silent: the account is
 * flagged `is_test_account`, the account holder is notified, the trade settles
 * labelled `ADMIN_TEST_SCENARIO` rather than as a market result, and the action
 * is written to the audit log with the administrator's identity.
 * Ordinary accounts are refused with `NOT_A_TEST_ACCOUNT`.
 *
 * The buttons apply on the click rather than opening a reason box: on an action
 * clicked this often a mandatory field trains people to type one character and
 * move on. The audit row is written either way.
 *
 * That is the whole mechanism. There is no unlabelled path that decides an
 * ordinary customer's outcome, and this screen does not add one.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn, formatAmount, formatDateTime, formatPrice } from '@/lib/format';
import {
  Column, Countdown, DataSurface, FilterBar, StatTiles,
} from '@/components/agent/AgentPrimitives';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { AdminPage, AdminTrade } from '@/lib/admin-types';

type Outcome = 'WIN' | 'LOSS' | 'DRAW';

interface TradePage extends AdminPage<AdminTrade> {
  openCount?: number;
}

const FIELDS = [
  { name: 'userId', label: 'User ID', placeholder: 'Paste a user id' },
  { name: 'symbol', label: 'Pair', placeholder: 'BTC/USDT' },
  {
    name: 'status',
    label: 'Order status',
    type: 'select' as const,
    options: [
      { value: '', label: 'Any' },
      { value: 'OPEN', label: 'OPEN' },
      { value: 'SETTLED', label: 'SETTLED' },
      { value: 'VOIDED', label: 'VOIDED' },
    ],
  },
  {
    name: 'outcome',
    label: 'Outcome',
    type: 'select' as const,
    options: [
      { value: '', label: 'Any' },
      { value: 'WIN', label: 'WIN' },
      { value: 'LOSS', label: 'LOSS' },
      { value: 'DRAW', label: 'DRAW' },
    ],
  },
];

export default function AdminTradesPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({ status: 'OPEN' });
  const [applied, setApplied] = useState<Record<string, string>>({ status: 'OPEN' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params = useMemo(
    () => ({
      userId: applied.userId || undefined,
      symbol: applied.symbol || undefined,
      status: applied.status || undefined,
      outcome: applied.outcome || undefined,
      page,
      pageSize,
    }),
    [applied, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['admin', 'trades', params],
    queryFn: () => api.get<TradePage>('/admin/trades', params),
    // Open positions move; keep the view live without a manual refresh.
    refetchInterval: 5_000,
  });

  const force = useMutation({
    mutationFn: (input: { userId: string; outcome: Outcome }) =>
      api.post<{ message: string; appliedToOpenTrade: boolean }>(
        `/admin/users/${input.userId}/force-next-trade`,
        { forcedOutcome: input.outcome },
      ),
    onSuccess: (data) => {
      toast.success('Scripted outcome queued', data.message);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'trades'] });
    },
    onError: (mutationError) =>
      toast.error('Could not set the outcome', errorMessage(mutationError)),
  });

  // Same reasoning as the agent screen: distinguish "nothing running" from
  // "nothing here at all".
  const anyTrades = useQuery({
    queryKey: ['admin', 'trades', 'any'],
    queryFn: () => api.get<TradePage>('/admin/trades', { pageSize: 1 }),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const open = rows.filter((row) => row.status === 'OPEN');
  const stake = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const columns: Column<AdminTrade>[] = [
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
    { key: 'symbol', header: 'Pair', width: 'w-32', render: (row) => row.symbol },
    {
      key: 'direction',
      header: 'Direction',
      width: 'w-24',
      render: (row) => (
        <Badge tone={row.direction === 'UP' ? 'success' : 'danger'}>{row.direction}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      width: 'w-28',
      render: (row) => formatAmount(row.amount),
    },
    {
      key: 'entry',
      header: 'Entry price',
      align: 'right',
      width: 'w-32',
      render: (row) => formatPrice(row.entryPrice, 2),
    },
    {
      key: 'clock',
      header: 'Countdown',
      width: 'w-28',
      align: 'center',
      render: (row) =>
        row.status === 'OPEN' ? (
          <Countdown expiresAt={row.expiresAt} />
        ) : (
          <span className="text-xs text-muted">{formatDateTime(row.settledAt)}</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-32',
      render: (row) => (
        <span className="flex flex-col gap-1">
          <Badge tone={row.status === 'OPEN' ? 'info' : 'neutral'}>{row.status}</Badge>
          {row.outcome && (
            <Badge tone={row.outcome === 'WIN' ? 'success' : row.outcome === 'LOSS' ? 'danger' : 'neutral'}>
              {row.outcome}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'source',
      header: 'Settlement source',
      width: 'w-40',
      render: (row) =>
        row.settlementSource ? (
          <span
            className={cn(
              'text-xs',
              row.settlementSource.includes('TEST') ? 'font-medium text-warning' : 'text-muted',
            )}
          >
            {row.settlementSource}
          </span>
        ) : (
          <span className="text-xs text-muted">—</span>
        ),
    },
    {
      key: 'outcome',
      header: 'Scripted outcome',
      width: 'w-52',
      align: 'center',
      render: (row) => {
        if (row.status !== 'OPEN') return <span className="text-xs text-muted">—</span>;
        const buttons: { outcome: Outcome; label: string; icon: typeof TrendingUp }[] = [
          { outcome: 'WIN', label: 'Win', icon: TrendingUp },
          { outcome: 'LOSS', label: 'Loss', icon: TrendingDown },
          { outcome: 'DRAW', label: 'Draw', icon: Minus },
        ];
        return (
          <span className="flex items-center justify-center gap-1">
            {buttons.map(({ outcome, label, icon: Icon }) => (
              <button
                key={outcome}
                type="button"
                disabled={force.isPending}
                onClick={() => force.mutate({ userId: row.userId, outcome })}
                className={cn(
                  'flex items-center gap-1 border px-2 py-1 text-xs transition-colors',
                  outcome === 'WIN' && 'border-primary text-primary hover:bg-primary/10',
                  outcome === 'LOSS' && 'border-danger text-danger hover:bg-danger/10',
                  outcome === 'DRAW' && 'border-border text-muted hover:bg-elevated',
                )}
              >
                <Icon className="h-3 w-3" aria-hidden />
                {label}
              </button>
            ))}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-[15px] p-[15px]">
      <FilterBar
        fields={FIELDS}
        values={draft}
        onChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))}
        onSearch={() => {
          setPage(1);
          setApplied(draft);
        }}
      />

      <StatTiles
        loading={query.isLoading}
        tiles={[
          { label: 'Open positions', value: query.data?.openCount ?? open.length },
          { label: 'Matching rows', value: total },
          { label: 'Staked', value: formatAmount(stake) },
          { label: 'Test accounts', value: rows.filter((row) => row.isTestAccount).length },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load positions.') : null}
        empty={
          applied.status === 'OPEN' && (anyTrades.data?.meta.total ?? 0) > 0 ? (
            <span className="flex flex-col items-center gap-2">
              <span>
                No positions are running right now. {anyTrades.data?.meta.total} on record.
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = { ...draft, status: '' };
                  setDraft(next);
                  setApplied(next);
                  setPage(1);
                }}
                className="text-primary underline underline-offset-2"
              >
                Show every status
              </button>
            </span>
          ) : (
            'No records'
          )
        }
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </div>
  );
}
