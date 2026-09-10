'use client';

/**
 * Deposits (Deposits).
 *
 * Reads `/agent/deposits`, scoped server-side to this agent's members. Read-only:
 * approving or rejecting a movement stays with administrators, because it moves
 * a balance.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { formatAmount, formatDateTime } from '@/lib/format';
import { Column, DataSurface, FilterBar, StatTiles } from '@/components/agent/AgentPrimitives';
import { Badge } from '@/components/ui/primitives';
import type { AgentMovementPage, AgentMovementRow } from '@/lib/agent-types';

const FIELDS = [
  {
    name: 'status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { value: '', label: 'Any' },
      { value: 'PENDING', label: 'PENDING' },
      { value: 'COMPLETED', label: 'COMPLETED' },
      { value: 'REJECTED', label: 'REJECTED' },
    ],
  },
];

export default function AgentDepositsPage() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { params: scope } = useAgentScope();
  const params = useMemo(
    () => ({ ...scope, status: applied.status || undefined, page, pageSize }),
    [scope, applied, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['agent', 'deposits', params],
    queryFn: () => api.get<AgentMovementPage>('/agent/deposits', params),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const pending = rows.filter((row) => row.status === 'PENDING').length;

  const columns: Column<AgentMovementRow>[] = [
    { key: 'id', header: 'id', width: 'w-28',
      render: (row) => <span className="font-mono text-xs">{row.id.slice(0, 8)}</span> },
    { key: 'user', header: 'UID', render: (row) => (
      <span>
        <span className="block font-medium">{row.username ?? '—'}</span>
        <span className="block text-xs text-muted">{row.email ?? ''}</span>
      </span>
    ) },
    { key: 'asset', header: 'Asset', width: 'w-32', render: (row) => row.asset },
    { key: 'amount', header: 'Amount', align: 'right', width: 'w-36',
      render: (row) => formatAmount(row.amount) },
    { key: 'status', header: 'Status', width: 'w-32', render: (row) => (
      <Badge tone={row.status === 'COMPLETED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>
        {row.status}
      </Badge>
    ) },
    { key: 'reference', header: 'Reference', width: 'w-48',
      render: (row) => <span className="font-mono text-xs">{row.reference ?? '—'}</span> },
    { key: 'created', header: 'Time', width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.createdAt)}</span> },
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
          { label: 'Deposits', value: total },
          { label: 'Total deposited', value: formatAmount(query.data?.amountTotal, 2, '0') },
          { label: 'Pending on this page', value: pending },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load records.') : null}
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
