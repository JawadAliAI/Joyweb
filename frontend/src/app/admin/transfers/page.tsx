'use client';

/**
 * Internal demo transfers between accounts.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { assetLabel, formatAmount, formatDateTime } from '@/lib/format';
import type { AdminPage, AdminTransfer } from '@/lib/admin-types';
import { Input } from '@/components/ui/form';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useDebounced, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

export default function AdminTransfersPage() {
  useAdminPage('Transfers', 'Simulated transfers between demo accounts');

  const [userId, setUserId] = useState('');
  const [asset, setAsset] = useState('');
  const debouncedUser = useDebounced(userId);
  const debouncedAsset = useDebounced(asset);
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [debouncedUser, debouncedAsset, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'transfers', { debouncedUser, debouncedAsset, page: table.page }],
    queryFn: () =>
      api.get<AdminPage<AdminTransfer>>('/admin/transfers', {
        userId: debouncedUser || undefined,
        asset: debouncedAsset || undefined,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AdminTransfer>[] = [
    {
      key: 'senderId',
      header: 'Sender',
      render: (row) => <span className="font-mono text-xs text-muted">{row.senderId}</span>,
    },
    {
      key: 'recipientId',
      header: 'Recipient',
      render: (row) => <span className="font-mono text-xs text-muted">{row.recipientId}</span>,
    },
    { key: 'asset', header: 'Asset', render: (row) => assetLabel(row.asset) },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="tabular font-medium">{formatAmount(row.amount, 2)}</span>,
    },
    {
      key: 'note',
      header: 'Note',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{row.note ?? '—'}</span>,
    },
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
          placeholder="Sender or recipient ID"
        />
        <Input
          label="Asset"
          value={asset}
          onChange={(event) => setAsset(event.target.value)}
          placeholder="DEMO_USDT"
        />
      </div>

      <DataTable<AdminTransfer>
        caption="Internal simulated transfers"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No transfers match these filters"
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />
    </div>
  );
}
