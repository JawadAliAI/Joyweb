'use client';

/**
 * Live positions.
 *
 * The same screen the admin portal carries, scoped to the reseller chosen in
 * the top bar: every position their members hold, refreshing while it runs,
 * with the countdown ticking between fetches.
 *
 * The panel is administrator-only, so the WIN / LOSS / DRAW controls call the
 * administrator's own endpoint rather than a second path with its own gate to
 * keep in sync. The gate itself is unchanged and cannot be changed from here:
 * the member must already be flagged `is_test_account`, they are notified, the
 * position settles labelled ADMIN_TEST_SCENARIO instead of as a market result,
 * and the action is audited. An ordinary member's row reads market-settled.
 *
 * The buttons apply on the click. A mandatory reason box on an action clicked
 * this often trains people to type one character and move on, which is worse
 * than the truthful default note the server writes; the audit row still records
 * who did it, to whom, on which position, and with what outcome.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { cn, formatAmount, formatDateTime, formatPrice } from '@/lib/format';
import {
  Column, Countdown, DataSurface, FilterBar, StatTiles,
} from '@/components/agent/AgentPrimitives';
import { Badge } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import type { AgentTradePage, AgentTradeRow } from '@/lib/agent-types';

type Outcome = 'WIN' | 'LOSS' | 'DRAW';

const OUTCOME_BUTTONS: { outcome: Outcome; label: string; icon: typeof TrendingUp }[] = [
  { outcome: 'WIN', label: 'Win', icon: TrendingUp },
  { outcome: 'LOSS', label: 'Loss', icon: TrendingDown },
  { outcome: 'DRAW', label: 'Draw', icon: Minus },
];

const FIELDS = [
  { name: 'symbol', label: 'Pair', placeholder: 'BTC/USDT' },
  {
    name: 'status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { value: 'OPEN', label: 'Open only' },
      { value: '', label: 'Any' },
      { value: 'SETTLED', label: 'SETTLED' },
      { value: 'VOIDED', label: 'VOIDED' },
    ],
  },
];

export default function AgentLivePositionsPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { params: scope, current } = useAgentScope();

  const [draft, setDraft] = useState<Record<string, string>>({ status: 'OPEN' });
  const [applied, setApplied] = useState<Record<string, string>>({ status: 'OPEN' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const params = useMemo(
    () => ({
      ...scope,
      symbol: applied.symbol || undefined,
      status: applied.status || undefined,
      page,
      pageSize,
    }),
    [scope, applied, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['agent', 'trades', 'live', params],
    queryFn: () => api.get<AgentTradePage>('/agent/trades', params),
    // Open positions move; keep the view live without a manual refresh.
    refetchInterval: 5_000,
  });

  // One row is enough: only `meta.total` is used, to tell "nothing is running"
  // apart from "this downline has never traded".
  const anyTrades = useQuery({
    queryKey: ['agent', 'trades', 'any', scope],
    queryFn: () => api.get<AgentTradePage>('/agent/trades', { ...scope, pageSize: 1 }),
  });

  const setOutcome = useMutation({
    mutationFn: (input: { userId: string; outcome: Outcome }) =>
      api.post<{ message: string }>(`/admin/users/${input.userId}/force-next-trade`, {
        forcedOutcome: input.outcome,
      }),
    onSuccess: (data) => {
      toast.success('Scripted result set', data.message);
      void queryClient.invalidateQueries({ queryKey: ['agent', 'trades'] });
    },
    onError: (mutationError) =>
      toast.error('Could not set the outcome', errorMessage(mutationError)),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const open = rows.filter((row) => row.status === 'OPEN');
  const stake = open.reduce((sum, row) => sum + Number(row.amount || 0), 0);

  const columns: Column<AgentTradeRow>[] = [
    {
      key: 'member',
      header: 'Member',
      render: (row) => (
        <span>
          <span className="block font-medium text-fg">{row.username ?? row.userId.slice(0, 8)}</span>
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
      key: 'amount',
      header: 'Stake',
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
            <Badge
              tone={
                row.outcome === 'WIN' ? 'success' : row.outcome === 'LOSS' ? 'danger' : 'neutral'
              }
            >
              {row.outcome}
            </Badge>
          )}
        </span>
      ),
    },
    {
      key: 'scripted',
      header: 'Scripted outcome',
      width: 'w-56',
      align: 'center',
      render: (row) => {
        if (row.status !== 'OPEN') return <span className="text-xs text-muted">-</span>;
        // The gate is server-side; hiding the buttons only avoids offering an
        // action that would be refused.
        if (!row.isTestAccount) {
          return <span className="text-xs text-muted">Market-settled</span>;
        }
        return (
          <span className="flex items-center justify-center gap-1">
            {OUTCOME_BUTTONS.map(({ outcome, label, icon: Icon }) => (
              <button
                key={outcome}
                type="button"
                disabled={setOutcome.isPending}
                onClick={() => setOutcome.mutate({ userId: row.userId, outcome })}
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
    <>
      <FilterBar
        fields={FIELDS}
        values={draft}
        onChange={(name, value) => setDraft((state) => ({ ...state, [name]: value }))}
        onSearch={() => {
          setPage(1);
          setApplied(draft);
        }}
      />

      <StatTiles
        loading={query.isLoading}
        tiles={[
          { label: 'Open on this page', value: open.length },
          { label: 'Matching rows', value: total },
          { label: 'Staked (USDT)', value: formatAmount(stake) },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load positions.') : null}
        empty={
          !current ? (
            'Choose an agent in the top bar'
          ) : applied.status === 'OPEN' && (anyTrades.data?.meta.total ?? 0) > 0 ? (
            <span className="flex flex-col items-center gap-2">
              <span>
                Nothing is running for {current.username} right now.{' '}
                {anyTrades.data?.meta.total} settled position
                {anyTrades.data?.meta.total === 1 ? '' : 's'} on record.
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
            `No positions for ${current.username} match these filters`
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
    </>
  );
}
