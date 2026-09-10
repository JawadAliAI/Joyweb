'use client';

/**
 * Append-only audit trail.
 *
 * Audit rows are never edited or deleted by application code. Expanding a row
 * shows the recorded old and new values side by side.
 */
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AdminPage, AuditLogEntry } from '@/lib/admin-types';
import { Button } from '@/components/ui/primitives';
import { Input } from '@/components/ui/form';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useDebounced, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

function ValueBlock({ title, value }: { title: string; value: Record<string, unknown> | null }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control bg-bg px-3 py-2 font-mono text-xs text-fg">
        {value === null ? '—' : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export default function AdminAuditLogsPage() {
  useAdminPage('Audit Logs', 'Every audited administrative action');

  const [action, setAction] = useState('');
  const [actorId, setActorId] = useState('');
  const [targetUserId, setTargetUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const debouncedAction = useDebounced(action);
  const debouncedActor = useDebounced(actorId);
  const debouncedTarget = useDebounced(targetUserId);
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [debouncedAction, debouncedActor, debouncedTarget, dateFrom, dateTo, resetPage]);

  const query = useQuery({
    queryKey: [
      'admin', 'audit-logs',
      { debouncedAction, debouncedActor, debouncedTarget, dateFrom, dateTo, page: table.page },
    ],
    queryFn: () =>
      api.get<AdminPage<AuditLogEntry>>('/admin/audit-logs', {
        action: debouncedAction || undefined,
        actorId: debouncedActor || undefined,
        targetUserId: debouncedTarget || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => <span className="font-medium">{row.action.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{row.actorEmail ?? 'System'}</p>
          <p className="truncate font-mono text-xs text-muted">{row.actorId ?? '—'}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      hideOnMobile: true,
      render: (row) => (
        <span className="font-mono text-xs text-muted">{row.targetUserId ?? '—'}</span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      hideOnMobile: true,
      render: (row) => (
        <span className="block max-w-[280px] truncate text-muted">{row.reason ?? '—'}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Date',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'expand',
      header: 'Values',
      align: 'right',
      render: (row) => (
        <Button
          size="sm"
          variant="outline"
          aria-expanded={expanded === row.id}
          aria-label={`${expanded === row.id ? 'Hide' : 'Show'} recorded values for ${row.action}`}
          onClick={() => setExpanded((current) => (current === row.id ? null : row.id))}
        >
          {expanded === row.id ? 'Hide' : 'Details'}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="rounded-card border border-border/70 bg-card px-4 py-3 text-xs text-muted">
        This trail is append-only. Application code never edits or deletes an audit row.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Input
          label="Action"
          value={action}
          onChange={(event) => setAction(event.target.value)}
          placeholder="BALANCE_ADJUSTED"
        />
        <Input
          label="Actor ID"
          value={actorId}
          onChange={(event) => setActorId(event.target.value)}
          placeholder="Administrator ID"
        />
        <Input
          label="Target user ID"
          value={targetUserId}
          onChange={(event) => setTargetUserId(event.target.value)}
          placeholder="Customer ID"
        />
        <Input
          label="From"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <Input
          label="To"
          type="date"
          value={dateTo}
          onChange={(event) => setDateTo(event.target.value)}
        />
      </div>

      <DataTable<AuditLogEntry>
        caption="Platform-wide audit log"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No audit entries match these filters"
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
        isExpanded={(row) => expanded === row.id}
        renderExpanded={(row) => (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <ValueBlock title="Old value" value={row.oldValue} />
              <ValueBlock title="New value" value={row.newValue} />
            </div>
            <dl className="grid gap-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted">Reason</dt>
                <dd className="text-fg">{row.reason ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">IP address</dt>
                <dd className="font-mono text-fg">{row.ipAddress ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-muted">Recorded</dt>
                <dd className="text-fg">{formatDateTime(row.createdAt)}</dd>
              </div>
            </dl>
          </div>
        )}
      />
    </div>
  );
}
