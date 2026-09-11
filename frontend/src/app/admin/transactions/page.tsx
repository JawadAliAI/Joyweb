'use client';

/**
 * Platform-wide simulated ledger.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { assetLabel, formatAmount, formatDateTime, transactionLabel } from '@/lib/format';
import type { AdminPage, AdminTransaction } from '@/lib/admin-types';
import { Badge } from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useDebounced, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'DEMO_DEPOSIT', label: 'Deposit' },
  { value: 'DEMO_WITHDRAWAL', label: 'Withdrawal' },
  { value: 'DEMO_TRANSFER_IN', label: 'Transfer received' },
  { value: 'DEMO_TRANSFER_OUT', label: 'Transfer sent' },
  { value: 'DEMO_CONVERSION', label: 'Conversion' },
  { value: 'TRADE_STAKE', label: 'Trade stake' },
  { value: 'TRADE_RETURN', label: 'Trade return' },
  { value: 'ADMIN_CREDIT', label: 'Admin credit' },
  { value: 'ADMIN_DEBIT', label: 'Admin debit' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

function tone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger';
  if (status === 'PENDING') return 'warning';
  return 'neutral';
}

export default function AdminTransactionsPage() {
  useAdminPage('Transactions', 'Every balance movement on the platform');

  const [userId, setUserId] = useState('');
  const [type, setType] = useState('');
  const [asset, setAsset] = useState('');
  const [status, setStatus] = useState('');
  const debouncedUser = useDebounced(userId);
  const debouncedAsset = useDebounced(asset);
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [debouncedUser, type, debouncedAsset, status, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'transactions', { debouncedUser, type, debouncedAsset, status, page: table.page }],
    queryFn: () =>
      api.get<AdminPage<AdminTransaction>>('/admin/transactions', {
        userId: debouncedUser || undefined,
        type: type || undefined,
        asset: debouncedAsset || undefined,
        status: status || undefined,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AdminTransaction>[] = [
    { key: 'type', header: 'Type', render: (row) => transactionLabel(row.type) },
    {
      key: 'userId',
      header: 'User',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-muted">{row.userId}</span>,
    },
    { key: 'asset', header: 'Asset', render: (row) => assetLabel(row.asset) },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="tabular font-medium">{formatAmount(row.amount, 2)}</span>,
    },
    {
      key: 'fee',
      header: 'Fee',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular text-muted">{formatAmount(row.fee, 2)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={tone(row.status)}>{row.status}</Badge> },
    {
      key: 'reference',
      header: 'Reference',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-muted">{row.reference}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="User ID"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="Exact user ID"
        />
        <Select label="Type" options={TYPE_OPTIONS} value={type} onChange={(e) => setType(e.target.value)} />
        <Input
          label="Asset"
          value={asset}
          onChange={(event) => setAsset(event.target.value)}
          placeholder="DEMO_USDT"
        />
        <Select
          label="Status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        />
      </div>

      <DataTable<AdminTransaction>
        caption="Platform-wide ledger"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No ledger entries match these filters"
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />
    </div>
  );
}
