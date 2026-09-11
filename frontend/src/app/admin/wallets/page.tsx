'use client';

/**
 * Demo wallets.
 *
 * Lists customers by their total simulated holdings; expanding a row loads that
 * account's per-asset demo balances and offers a reason-gated adjustment. Every
 * unit here is simulated — no real cryptocurrency is held or moved.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatAmount } from '@/lib/format';
import type {
  AdminUserDetail, AdminUserListPage, AdminUserRow, BalanceAdjustResult,
} from '@/lib/admin-types';
import { Badge, Button, ListSkeleton } from '@/components/ui/primitives';
import { Input, SearchInput, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useDebounced, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

function WalletBreakdown({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.get<AdminUserDetail>(`/admin/users/${userId}`),
  });

  if (query.isLoading) return <ListSkeleton rows={3} />;
  if (query.isError) {
    return <p className="text-xs text-danger">{errorMessage(query.error)}</p>;
  }

  const wallets = query.data?.wallets ?? [];
  if (wallets.length === 0) {
    return <p className="text-xs text-muted">This account holds no wallets yet.</p>;
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">Balances per asset</caption>
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            <th scope="col" className="py-2 text-left font-semibold">Asset</th>
            <th scope="col" className="py-2 text-right font-semibold">Available</th>
            <th scope="col" className="py-2 text-right font-semibold">Locked</th>
            <th scope="col" className="py-2 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {wallets.map((wallet) => (
            <tr key={wallet.asset} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-2 text-left font-medium text-fg">{wallet.label}</th>
              <td className="tabular py-2 text-right">{formatAmount(wallet.available, 2)}</td>
              <td className="tabular py-2 text-right text-muted">{formatAmount(wallet.locked, 2)}</td>
              <td className="tabular py-2 text-right font-semibold">{formatAmount(wallet.total, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminWalletsPage() {
  useAdminPage('Wallets', 'Balances per customer');

  const toast = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [asset, setAsset] = useState('DEMO_USDT');
  const [amount, setAmount] = useState('');
  const [dialogError, setDialogError] = useState<string | null>(null);

  const table = useTableState({ key: 'balance', direction: 'desc' });
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'users', 'wallets', { debouncedSearch, page: table.page, sort: table.sort }],
    queryFn: () =>
      api.get<AdminUserListPage>('/admin/users', {
        search: debouncedSearch || undefined,
        sort: table.sort?.key === 'created' ? 'created' : 'balance',
        order: table.sort?.direction ?? 'desc',
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const walletAssets = useQuery({
    queryKey: ['admin', 'user', target?.id ?? ''],
    queryFn: () => api.get<AdminUserDetail>(`/admin/users/${target?.id ?? ''}`),
    enabled: Boolean(target?.id),
  });

  const adjust = useMutation({
    mutationFn: (reason: string) =>
      api.post<BalanceAdjustResult>(`/admin/users/${target?.id ?? ''}/balance/${direction}`, {
        asset,
        amount,
        reason,
      }),
    onSuccess: (result) => {
      toast.success('Balance adjusted', result.message);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'user'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setTarget(null);
      setAmount('');
      setDialogError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setDialogError(message);
      toast.error('Adjustment failed', message);
    },
  });

  const assetOptions =
    walletAssets.data?.wallets.map((wallet) => ({
      value: wallet.asset,
      label: `${wallet.label} (available ${formatAmount(wallet.available, 2)})`,
    })) ?? [];

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={`/admin/users/${row.id}`}
            className="truncate font-medium text-fg hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {row.fullName || row.username}
          </Link>
          <p className="truncate text-xs text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'danger'}>{row.status}</Badge>
      ),
    },
    {
      key: 'balance',
      header: 'Total value',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="tabular font-semibold">{formatAmount(row.totalDemoValue, 2)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={expanded === row.id}
            aria-label={`${expanded === row.id ? 'Hide' : 'Show'} balances for ${row.username}`}
            onClick={() => setExpanded((current) => (current === row.id ? null : row.id))}
          >
            {expanded === row.id ? 'Hide balances' : 'Balances'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTarget(row);
              setDirection('credit');
              setAmount('');
              setDialogError(null);
            }}
            aria-label={`Adjust balance for ${row.username}`}
          >
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">


      <SearchInput
        value={search}
        onValueChange={setSearch}
        placeholder="Search email, username or name"
        className="max-w-md"
      />

      <DataTable<AdminUserRow>
        caption="Customer wallet totals"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No customers match this search"
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
        sort={table.sort}
        onSortChange={table.setSort}
        isExpanded={(row) => expanded === row.id}
        renderExpanded={(row) => <WalletBreakdown userId={row.id} />}
      />

      <ReasonDialog
        open={Boolean(target)}
        onClose={() => {
          setTarget(null);
          setDialogError(null);
        }}
        onSubmit={(reason) => adjust.mutate(reason)}
        title={`Adjust ${target?.username ?? ''}'s balance`}
        description="A debit that would overdraw is refused, never clamped."
        confirmLabel={direction === 'debit' ? 'Debit balance' : 'Credit balance'}
        confirmVariant={direction === 'debit' ? 'danger' : 'primary'}
        loading={adjust.isPending}
        error={dialogError}
        disabled={!asset || !amount || Number(amount) <= 0}
        extraFields={
          <div className="space-y-3">
            <Select
              label="Direction"
              options={[
                { value: 'credit', label: 'Credit (add funds)' },
                { value: 'debit', label: 'Debit (remove funds)' },
              ]}
              value={direction}
              onChange={(event) => setDirection(event.target.value === 'debit' ? 'debit' : 'credit')}
            />
            <Select
              label="Asset"
              options={
                assetOptions.length > 0 ? assetOptions : [{ value: asset, label: asset }]
              }
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            />
            <Input
              label="Amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
        }
      />
    </div>
  );
}
