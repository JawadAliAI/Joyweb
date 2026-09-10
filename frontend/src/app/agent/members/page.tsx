'use client';

/**
 * Members.
 *
 * Reads `/agent/users`, which returns only this agent's downline — the list is
 * scoped on the server, never here.
 *
 * The reference filters on phone number and withdrawal address; this platform
 * stores neither against a user, so those two fields are not offered. An input
 * that silently matches nothing is worse than no input.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { formatAmount, formatDateTime } from '@/lib/format';
import {
  Column, DataSurface, FilterBar, StatTiles, StripButton,
} from '@/components/agent/AgentPrimitives';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/primitives';
import type { AgentInvite, AgentMemberPage, AgentMemberRow } from '@/lib/agent-types';

const FIELDS = [
  { name: 'search', label: 'Keyword', placeholder: 'Email, username or name' },
  {
    name: 'status',
    label: 'Status',
    type: 'select' as const,
    options: [
      { value: '', label: 'Any' },
      { value: 'ACTIVE', label: 'ACTIVE' },
      { value: 'FROZEN', label: 'FROZEN' },
    ],
  },
];

export default function AgentMembersPage() {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { params: scope } = useAgentScope();
  const params = useMemo(
    () => ({
      ...scope,
      search: applied.search || undefined,
      status: applied.status || undefined,
      page,
      pageSize,
    }),
    [scope, applied, page, pageSize],
  );

  const query = useQuery({
    queryKey: ['agent', 'users', params],
    queryFn: () => api.get<AgentMemberPage>('/agent/users', params),
  });

  const invite = useMutation({
    mutationFn: () => api.post<{ invite: AgentInvite }>('/agent/invites'),
    onSuccess: async (data) => {
      const url = data.invite.inviteUrl || data.invite.code;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Invitation created', 'The link is on your clipboard.');
      } catch {
        // Clipboard is blocked in some contexts; the code is still usable.
        toast.success('Invitation created', data.invite.code);
      }
    },
    onError: (error) => toast.error('Could not create an invitation', errorMessage(error)),
  });

  const rows = query.data?.items ?? [];
  const total = query.data?.meta.total ?? 0;
  const active = rows.filter((row) => row.status === 'ACTIVE').length;
  const balance = rows.reduce((sum, row) => sum + Number(row.totalDemoValue || 0), 0);

  const columns: Column<AgentMemberRow>[] = [
    {
      key: 'uid',
      header: 'UID',
      width: 'w-32',
      render: (row) => <span className="font-mono text-xs">{row.id.slice(0, 8)}</span>,
    },
    {
      key: 'user',
      header: 'Member',
      render: (row) => (
        <span>
          <span className="block font-medium">{row.fullName || row.username}</span>
          <span className="block text-xs text-muted">@{row.username}</span>
        </span>
      ),
    },
    { key: 'email', header: 'Email', render: (row) => row.email },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      width: 'w-36',
      render: (row) => formatAmount(row.totalDemoValue),
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      width: 'w-24',
      render: (row) => row.creditScore,
    },
    {
      key: 'status',
      header: 'Status',
      width: 'w-28',
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'success' : 'danger'}>{row.status}</Badge>
      ),
    },
    {
      key: 'created',
      header: 'Registered',
      width: 'w-44',
      render: (row) => <span className="text-xs">{formatDateTime(row.createdAt)}</span>,
    },
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
      >
        <StripButton onClick={() => invite.mutate()} disabled={invite.isPending}>
          <span className="inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4" aria-hidden />
            Invite member
          </span>
        </StripButton>
      </FilterBar>

      <StatTiles
        loading={query.isLoading}
        tiles={[
          { label: 'Total members', value: total },
          { label: 'Active on this page', value: active },
          { label: 'Balance', value: formatAmount(balance) },
          { label: 'Live prices', value: query.data?.pricesAvailable === false ? 'No' : 'Yes' },
        ]}
      />

      <DataSurface
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error, 'Could not load members.') : null}
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
