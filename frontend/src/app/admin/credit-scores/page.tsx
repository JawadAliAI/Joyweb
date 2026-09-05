'use client';

/**
 * Platform-wide internal demo score history.
 *
 * These are internal demo account scores invented by this simulator. They are
 * not credit-bureau scores and carry no real-world meaning.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { CreditScoreEntry, CreditScorePage } from '@/lib/admin-types';
import { Input } from '@/components/ui/form';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useDebounced, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

const DISCLAIMER =
  'This is an internal demo account score used only inside this simulator. It is not a credit-bureau score and has no real-world meaning.';

export default function AdminCreditScoresPage() {
  useAdminPage('Credit Scores', 'Internal demo account score changes');

  const [userId, setUserId] = useState('');
  const debouncedUser = useDebounced(userId);
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [debouncedUser, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'credit-scores', { debouncedUser, page: table.page }],
    queryFn: () =>
      api.get<CreditScorePage>('/admin/credit-scores', {
        userId: debouncedUser || undefined,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<CreditScoreEntry>[] = [
    {
      key: 'userId',
      header: 'User',
      render: (row) => (
        <Link
          href={`/admin/users/${row.userId}`}
          className="font-mono text-xs text-fg hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {row.userId}
        </Link>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      render: (row) => (
        <span className="tabular font-medium">
          {row.oldScore} → {row.newScore}
        </span>
      ),
    },
    {
      key: 'delta',
      header: 'Delta',
      align: 'right',
      render: (row) => {
        const delta = row.newScore - row.oldScore;
        return (
          <span className={`tabular ${delta > 0 ? 'text-primary' : delta < 0 ? 'text-danger' : 'text-muted'}`}>
            {delta > 0 ? '+' : ''}
            {delta}
          </span>
        );
      },
    },
    { key: 'reason', header: 'Reason', render: (row) => <span className="text-muted">{row.reason}</span> },
    {
      key: 'changedBy',
      header: 'Changed by',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-muted">{row.changedBy ?? 'System'}</span>,
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
      <p className="rounded-card bg-warning/10 px-4 py-3 text-xs text-warning">
        {query.data?.disclaimer ?? DISCLAIMER}
      </p>

      <Input
        label="Filter by user ID"
        value={userId}
        onChange={(event) => setUserId(event.target.value)}
        placeholder="Exact user ID"
        containerClassName="max-w-md"
      />

      <DataTable<CreditScoreEntry>
        caption="Internal demo account score change history"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No score changes recorded"
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />
    </div>
  );
}
