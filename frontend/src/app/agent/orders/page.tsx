'use client';

/**
 * Delivery orders.
 *
 * Reads `/agent/trades`, scoped server-side to this agent's members.
 *
 * The reference's preset-outcome buttons live on the row here. The panel is
 * administrator-only, so they call the administrator's own endpoint —
 * `/admin/users/{id}/force-next-trade` — rather than a second path with its own
 * gate to keep in sync.
 *
 * The gate is unchanged and unchanged-able from here: the account is flagged
 * `is_test_account`, the member is notified, the position settles labelled
 * ADMIN_TEST_SCENARIO instead of as a market result, and the action is audited
 * with a written reason. An ordinary member's row reads market-settled.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { cn, formatAmount, formatDateTime, formatPrice } from '@/lib/format';
import { Column, DataSurface, FilterBar, StatTiles } from '@/components/agent/AgentPrimitives';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { Badge, ChangeChip } from '@/components/ui/primitives';
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

export default function AgentOrdersPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<{ trade: AgentTradeRow; outcome: Outcome } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { params: scope } = useAgentScope();
  const params = useMemo(
    () => ({
      ...scope,
      symbol: applied.symbol || undefined,
      status: applied.status || undefined,
      outcome: applied.outcome || undefined,
      page,
      pageSize,
    }),
    [scope, applied, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['agent', 'trades', params],
    queryFn: () => api.get<AgentTradePage>('/agent/trades', params),
    refetchInterval: 15_000,
  });

  const setOutcome = useMutation({
    mutationFn: (input: { userId: string; outcome: Outcome; reason: string }) =>
      api.post<{ message: string }>(`/admin/users/${input.userId}/force-next-trade`, {
        forcedOutcome: input.outcome,
        reason: input.reason,
      }),
    onSuccess: (data) => {
      setPending(null);
      setDialogError(null);
      toast.success('Scripted result set', data.message);
      void queryClient.invalidateQueries({ queryKey: ['agent', 'trades'] });
    },
    onError: (mutationError) => setDialogError(errorMessage(mutationError)),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;

  const columns: Column<AgentTradeRow>[] = [
    { key: 'id', header: 'id', width: 'w-28',
      render: (row) => <span className="font-mono text-xs">{row.id.slice(0, 8)}</span> },
    { key: 'user', header: 'UID', render: (row) => (
      <span>
        <span className="block font-medium">{row.username ?? '—'}</span>
        <span className="block text-xs text-muted">{row.email ?? ''}</span>
      </span>
    ) },
    { key: 'symbol', header: 'Pair', width: 'w-32', render: (row) => row.symbol },
    { key: 'direction', header: 'Direction', width: 'w-24', render: (row) => (
      <Badge tone={row.direction === 'UP' ? 'success' : 'danger'}>{row.direction}</Badge>
    ) },
    { key: 'amount', header: 'Amount', align: 'right', width: 'w-28',
      render: (row) => formatAmount(row.amount) },
    { key: 'entry', header: 'Entry price', align: 'right', width: 'w-32',
      render: (row) => formatPrice(row.entryPrice, 2) },
    { key: 'exit', header: 'Exit price', align: 'right', width: 'w-32',
      render: (row) => formatPrice(row.exitPrice, 2) },
    { key: 'status', header: 'Status', width: 'w-28', render: (row) => (
      <Badge tone={row.status === 'OPEN' ? 'info' : 'neutral'}>{row.status}</Badge>
    ) },
    { key: 'pnl', header: 'P/L', align: 'right', width: 'w-28', render: (row) => (
      row.profitLoss === null ? '—' : <ChangeChip value={row.profitLoss} plain />
    ) },
    { key: 'created', header: 'Placed', width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.createdAt)}</span> },
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
                onClick={() => {
                  setDialogError(null);
                  setPending({ trade: row, outcome });
                }}
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
        onChange={(name, value) => setDraft((current) => ({ ...current, [name]: value }))}
        onSearch={() => {
          setPage(1);
          setApplied(draft);
        }}
      />

      <StatTiles
        loading={query.isLoading}
        tiles={[
          { label: 'Total orders', value: total },
          { label: 'Total staked', value: formatAmount(query.data?.stakeTotal, 2, '0') },
          { label: 'Member P/L', value: formatAmount(query.data?.profitLossTotal, 2, '0') },
          { label: 'Open positions', value: rows.filter((row) => row.status === 'OPEN').length },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load orders.') : null}
        empty="No records"
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
