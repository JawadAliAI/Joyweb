'use client';

/**
 * Demo user directory.
 *
 * Search, status and role filters map one-to-one onto `GET /admin/users`.
 * Balances shown are simulated units, never real money.
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatAmount, formatDate } from '@/lib/format';
import type { AdminUserListPage, AdminUserRow } from '@/lib/admin-types';
import { Badge } from '@/components/ui/primitives';
import { SearchInput, Select } from '@/components/ui/form';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useDebounced, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'FROZEN', label: 'Frozen' },
  { value: 'SUSPENDED', label: 'Suspended' },
];

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'USER', label: 'User' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'SUPER_ADMIN', label: 'Super admin' },
];

// Route modules may only export the default component, so this stays private.
function statusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'FROZEN') return 'danger';
  if (status === 'SUSPENDED') return 'warning';
  return 'neutral';
}

export default function AdminUsersPage() {
  useAdminPage('Users', 'Customer accounts and balances');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [role, setRole] = useState('');
  const debouncedSearch = useDebounced(search);
  const table = useTableState({ key: 'created', direction: 'desc' });
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [debouncedSearch, status, role, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'users', { debouncedSearch, status, role, page: table.page, sort: table.sort }],
    queryFn: () =>
      api.get<AdminUserListPage>('/admin/users', {
        search: debouncedSearch || undefined,
        status: status || undefined,
        role: role || undefined,
        sort: table.sort?.key ?? 'created',
        order: table.sort?.direction ?? 'desc',
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AdminUserRow>[] = [
    {
      key: 'user',
      header: 'User',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.fullName || row.username}</p>
          <p className="truncate text-xs text-muted">@{row.username}</p>
        </div>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      hideOnMobile: true,
      render: (row) => <span className="truncate text-muted">{row.email}</span>,
    },
    {
      key: 'balance',
      header: 'Balance (USDT)',
      sortable: true,
      align: 'right',
      render: (row) => (
        <span className="tabular font-medium">{formatAmount(row.totalDemoValue, 2)} USDT</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={statusTone(row.status)}>{row.status}</Badge>
          {row.role !== 'USER' && <Badge tone="info">{row.role}</Badge>}
        </div>
      ),
    },
    {
      key: 'creditScore',
      header: 'Credit score',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular">{row.creditScore}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      sortable: true,
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDate(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <Link
          href={`/admin/users/${row.id}`}
          className="inline-flex min-h-[44px] items-center rounded-control border border-border px-3 text-xs font-semibold text-fg hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={`Manage ${row.username}`}
        >
          Manage
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search email, username or name"
          className="lg:col-span-2"
        />
        <Select
          aria-label="Filter by status"
          options={STATUS_OPTIONS}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        />
        <Select
          aria-label="Filter by role"
          options={ROLE_OPTIONS}
          value={role}
          onChange={(event) => setRole(event.target.value)}
        />
      </div>

      <DataTable<AdminUserRow>
        caption="User accounts"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No users match these filters"
        emptyDescription="Try clearing the search or changing the status and role filters."
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
        sort={table.sort}
        onSortChange={table.setSort}
      />
    </div>
  );
}
