'use client';

/**
 * Support ticket queue.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import type { AdminPage, SupportTicketRow } from '@/lib/admin-types';
import { Badge } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/tabs';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

const TABS = [
  { value: '', label: 'All' },
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

// Route modules may only export the default component, so this stays private.
function ticketTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  if (status === 'OPEN') return 'warning';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'RESOLVED') return 'success';
  return 'neutral';
}

export default function AdminSupportPage() {
  useAdminPage('Support', 'Customer tickets and staff replies');

  const [status, setStatus] = useState('');
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [status, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'tickets', status, table.page],
    queryFn: () =>
      api.get<AdminPage<SupportTicketRow>>('/admin/support/tickets', {
        status: status || undefined,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<SupportTicketRow>[] = [
    {
      key: 'subject',
      header: 'Subject',
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={`/admin/support/${row.id}`}
            className="truncate font-medium text-fg hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {row.subject}
          </Link>
          <p className="truncate text-xs text-muted">{row.category}</p>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{row.username ?? row.userId}</p>
          <p className="truncate text-xs text-muted">{row.email ?? ''}</p>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={ticketTone(row.status)}>{row.status}</Badge> },
    {
      key: 'messageCount',
      header: 'Messages',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular">{row.messageCount}</span>,
    },
    {
      key: 'updatedAt',
      header: 'Updated',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-muted" title={formatDateTime(row.updatedAt)}>
          {timeAgo(row.updatedAt)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Link
          href={`/admin/support/${row.id}`}
          className="inline-flex min-h-[44px] items-center rounded-control border border-border px-3 text-xs font-semibold text-fg hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Open ticket ${row.subject}`}
        >
          Open
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <Tabs items={TABS} value={status} onChange={setStatus} ariaLabel="Ticket status" />

      <DataTable<SupportTicketRow>
        caption="Support ticket queue"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No tickets in this queue"
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />
    </div>
  );
}
