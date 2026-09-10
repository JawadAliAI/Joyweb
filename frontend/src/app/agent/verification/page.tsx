'use client';

/**
 * Verification (Verification).
 *
 * Reads `/agent/kyc`. Read-only, and deliberately thin: an agent sees that a
 * member submitted verification and how it was decided, never the document
 * numbers or the uploaded images. Those stay with the reviewers who need them.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { formatDateTime } from '@/lib/format';
import { Column, DataSurface, FilterBar, StatTiles } from '@/components/agent/AgentPrimitives';
import { Badge } from '@/components/ui/primitives';
import type { AgentKycRow, AgentPage } from '@/lib/agent-types';

const FIELDS = [
  {
    name: 'level',
    label: 'Level',
    type: 'select' as const,
    options: [
      { value: '', label: 'Any' },
      { value: 'BASIC', label: 'BASIC' },
      { value: 'ADVANCED', label: 'ADVANCED' },
    ],
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { value: '', label: 'Any' },
      { value: 'PENDING', label: 'PENDING' },
      { value: 'APPROVED', label: 'APPROVED' },
      { value: 'REJECTED', label: 'REJECTED' },
    ],
  },
];

export default function AgentVerificationPage() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { params: scope } = useAgentScope();
  const params = useMemo(
    () => ({
      ...scope,
      level: applied.level || undefined,
      status: applied.status || undefined,
      page,
      pageSize,
    }),
    [scope, applied, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['agent', 'kyc', params],
    queryFn: () => api.get<AgentPage<AgentKycRow>>('/agent/kyc', params),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;

  const columns: Column<AgentKycRow>[] = [
    { key: 'user', header: 'UID', render: (row) => (
      <span>
        <span className="block font-medium">{row.username ?? '—'}</span>
        <span className="block text-xs text-muted">{row.email ?? ''}</span>
      </span>
    ) },
    { key: 'level', header: 'Level', width: 'w-36', render: (row) => row.level },
    { key: 'status', header: 'Status', width: 'w-36', render: (row) => (
      <Badge tone={row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'warning'}>
        {row.status}
      </Badge>
    ) },
    { key: 'created', header: 'Submitted', width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.createdAt)}</span> },
    { key: 'reviewed', header: 'Reviewed', width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.reviewedAt)}</span> },
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
          { label: 'Submissions', value: total },
          { label: 'Pending', value: rows.filter((row) => row.status === 'PENDING').length },
          { label: 'Approved', value: rows.filter((row) => row.status === 'APPROVED').length },
          { label: 'Rejected', value: rows.filter((row) => row.status === 'REJECTED').length },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load verification.') : null}
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
