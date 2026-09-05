'use client';

/**
 * Simulated withdrawal queue.
 *
 * Approving retires locked simulated units and nothing more: no blockchain
 * transaction is created by this action, or by any action in this product.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { assetLabel, formatAmount, formatDateTime } from '@/lib/format';
import type { AdminWithdrawal, AdminWithdrawalPage, ReviewResult } from '@/lib/admin-types';
import { Badge, Button } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/tabs';
import { DataRow, Divider } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

const NO_CHAIN =
  'Approving settles the simulation only. No blockchain transaction was created and none will be created; no real funds move.';

const TABS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ALL', label: 'All' },
];

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'PENDING') return 'warning';
  return 'neutral';
}

export default function AdminWithdrawalsPage() {
  useAdminPage('Withdrawals', 'Simulated withdrawal requests — no blockchain transfer is involved');

  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [target, setTarget] = useState<AdminWithdrawal | null>(null);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [status, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'withdrawals', status, table.page],
    queryFn: () =>
      api.get<AdminWithdrawalPage>('/admin/withdrawals', {
        status,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const review = useMutation({
    mutationFn: ({ id, kind, reason }: { id: string; kind: 'approve' | 'reject'; reason: string }) =>
      api.post<ReviewResult>(`/admin/withdrawals/${id}/${kind}`, { reason }),
    onSuccess: (result) => {
      toast.success('Simulated withdrawal reviewed', result.message);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
      setTarget(null);
      setAction(null);
      setDialogError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setDialogError(message);
      toast.error('Review failed', message);
    },
  });

  const columns: Column<AdminWithdrawal>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.username ?? row.userId}</p>
          <p className="truncate text-xs text-muted">{row.email ?? ''}</p>
        </div>
      ),
    },
    {
      key: 'asset',
      header: 'Asset / network',
      render: (row) => (
        <span>
          {assetLabel(row.asset)} <span className="text-muted">· {row.network}</span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <div className="tabular">
          <p className="font-medium">{formatAmount(row.amount, 2)}</p>
          <p className="text-xs text-muted">net {formatAmount(row.netAmount, 2)}</p>
        </div>
      ),
    },
    {
      key: 'destination',
      header: 'Destination',
      hideOnMobile: true,
      render: (row) => (
        <span className="block max-w-[200px] truncate font-mono text-xs text-muted">
          {row.destinationAddress}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'createdAt',
      header: 'Requested',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        row.status === 'PENDING' ? (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              onClick={() => {
                setTarget(row);
                setAction('approve');
                setDialogError(null);
              }}
              aria-label={`Approve simulated withdrawal ${row.reference}`}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setTarget(row);
                setAction('reject');
                setDialogError(null);
              }}
              aria-label={`Reject simulated withdrawal ${row.reference}`}
            >
              Reject
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">Reviewed {formatDateTime(row.reviewedAt)}</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="rounded-card bg-warning/10 px-4 py-3 text-xs text-warning">
        {query.data?.blockchainNotice ?? NO_CHAIN}
      </p>

      <Tabs items={TABS} value={status} onChange={setStatus} ariaLabel="Withdrawal status" />

      <DataTable<AdminWithdrawal>
        caption="Simulated withdrawal requests"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle={status === 'PENDING' ? 'No withdrawals awaiting review' : 'No withdrawals yet'}
        emptyDescription="Simulated withdrawal requests appear here as customers submit them."
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />

      <ReasonDialog
        open={Boolean(target && action)}
        onClose={() => {
          setTarget(null);
          setAction(null);
          setDialogError(null);
        }}
        onSubmit={(reason) => {
          if (!target || !action) return;
          review.mutate({ id: target.id, kind: action, reason });
        }}
        title={action === 'reject' ? 'Reject simulated withdrawal' : 'Approve simulated withdrawal'}
        description={
          action === 'reject'
            ? 'The locked simulated funds return to the customer’s available balance and they are shown this reason.'
            : 'The locked simulated funds are retired. This settles the simulation only.'
        }
        confirmLabel={action === 'reject' ? 'Reject withdrawal' : 'Approve withdrawal'}
        confirmVariant={action === 'reject' ? 'danger' : 'primary'}
        loading={review.isPending}
        error={dialogError}
        footnote={NO_CHAIN}
        details={
          target ? (
            <div className="rounded-control bg-surface px-3 py-1">
              <DataRow label="Customer" value={target.username ?? target.userId} />
              <Divider />
              <DataRow label="Asset" value={`${assetLabel(target.asset)} · ${target.network}`} />
              <Divider />
              <DataRow label="Amount" value={formatAmount(target.amount, 2)} tone="strong" />
              <Divider />
              <DataRow label="Fee" value={formatAmount(target.fee, 2)} />
              <Divider />
              <DataRow label="Net" value={formatAmount(target.netAmount, 2)} />
              <Divider />
              <DataRow label="Reference" value={target.reference} />
            </div>
          ) : null
        }
      />
    </div>
  );
}
