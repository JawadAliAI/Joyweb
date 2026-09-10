'use client';

/**
 * Sub-agents (Sub-agents).
 *
 * Reads `/agent/agents` — the agents whose upline is this account, with how
 * many members each of them has signed up.
 *
 * Creating a sub-agent is not offered here. Promoting an account to AGENT is an
 * administrator action, so an agent cannot mint tiers below itself unchecked.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { formatDateTime } from '@/lib/format';
import { Column, DataSurface, StatTiles } from '@/components/agent/AgentPrimitives';
import { Badge } from '@/components/ui/primitives';
import type { AgentPage, AgentSubAgentRow } from '@/lib/agent-types';

export default function AgentSubAgentsPage() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { params: scope } = useAgentScope();
  const params = useMemo(
    () => ({ ...scope, page, pageSize }),
    [scope, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['agent', 'agents', params],
    queryFn: () => api.get<AgentPage<AgentSubAgentRow>>('/agent/agents', params),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const members = rows.reduce((sum, row) => sum + row.memberCount, 0);

  const columns: Column<AgentSubAgentRow>[] = [
    { key: 'agent', header: 'Agent', render: (row) => (
      <span>
        <span className="block font-medium">{row.fullName || row.username}</span>
        <span className="block text-xs text-muted">@{row.username}</span>
      </span>
    ) },
    { key: 'email', header: 'Email', render: (row) => row.email },
    { key: 'members', header: 'Members', align: 'right', width: 'w-32',
      render: (row) => row.memberCount },
    { key: 'status', header: 'Status', width: 'w-28', render: (row) => (
      <Badge tone={row.status === 'ACTIVE' ? 'success' : 'danger'}>{row.status}</Badge>
    ) },
    { key: 'created', header: 'Registered', width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.createdAt)}</span> },
    { key: 'seen', header: 'Last seen', width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.lastLoginAt)}</span> },
  ];

  return (
    <>
      <StatTiles
        loading={query.isLoading}
        tiles={[
          { label: 'Sub-agents', value: total },
          { label: 'Their members', value: members },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load sub-agents.') : null}
        empty="No sub-agents yet"
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
