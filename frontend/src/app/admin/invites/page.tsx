'use client';

/**
 * Invite manager.
 *
 * Registration is invitation-only: an administrator mints a single-use link,
 * hands it to the invitee, and can revoke it at any point before it is used.
 * Creating and revoking are both audit-logged, so both require a reason.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import type {
  CreateInvitePayload,
  Invite,
  InviteMutationResult,
  InvitePage,
  InviteStatus,
} from '@/lib/invite-types';
import { Badge, Button, Card, CardBody, CardHeader, DataRow, Divider } from '@/components/ui/primitives';
import { FormError, FormSuccess, Input, Select, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

const STATUS_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'USED', label: 'Used' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'REVOKED', label: 'Revoked' },
];

const EXPIRY_OPTIONS = [
  { value: '24', label: '24 hours' },
  { value: '72', label: '72 hours (default)' },
  { value: '168', label: '7 days' },
  { value: '720', label: '30 days' },
];

const SINGLE_USE_NOTICE =
  'This link works exactly once and stops working after it expires. Anyone holding it can create one account, so share it only with the intended person.';

function statusTone(status: InviteStatus): 'success' | 'neutral' | 'warning' | 'danger' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'EXPIRED') return 'warning';
  if (status === 'REVOKED') return 'danger';
  return 'neutral';
}

/** Clipboard write with a selection fallback for browsers that refuse the API. */
async function writeToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path below.
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

/** Tracks which link was copied so the button can confirm, then reset. */
function useCopier() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (key: string, text: string) => {
    const ok = await writeToClipboard(text);
    if (!ok) return false;
    setCopiedKey(key);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopiedKey(null), 2500);
    return true;
  }, []);

  return { copiedKey, copy };
}

export default function AdminInvitesPage() {
  useAdminPage('Invites', 'Single-use registration links — registration is invitation-only');

  const toast = useToast();
  const queryClient = useQueryClient();
  const { copiedKey, copy } = useCopier();

  const [status, setStatus] = useState('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [expiresInHours, setExpiresInHours] = useState('72');
  const [lockEmail, setLockEmail] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invite | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Invite | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [status, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'invites', status, table.page],
    queryFn: () =>
      api.get<InvitePage>('/admin/invites', {
        status: status === 'ALL' ? undefined : status,
        page: table.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const createInvite = useMutation({
    mutationFn: (body: CreateInvitePayload) =>
      api.post<InviteMutationResult>('/admin/invites', { ...body }),
    onSuccess: (result) => {
      setCreated(result.invite);
      setCreateOpen(false);
      setCreateError(null);
      setLockEmail('');
      setNote('');
      setReason('');
      setFieldErrors({});
      toast.success('Invite link generated', result.message);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
    onError: (error) => {
      const message = errorMessage(error);
      setCreateError(message);
      toast.error('Could not generate invite', message);
    },
  });

  const revokeInvite = useMutation({
    mutationFn: ({ id, reason: why }: { id: string; reason: string }) =>
      api.post<InviteMutationResult>(`/admin/invites/${id}/revoke`, { reason: why }),
    onSuccess: (result) => {
      toast.success('Invite revoked', result.message);
      setRevokeTarget(null);
      setRevokeError(null);
      if (created && created.id === result.invite.id) setCreated(result.invite);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    },
    onError: (error) => {
      const message = errorMessage(error);
      setRevokeError(message);
      toast.error('Could not revoke invite', message);
    },
  });

  const submitCreate = () => {
    const next: Record<string, string> = {};
    const trimmedEmail = lockEmail.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      next.email = 'Enter a valid email address, or leave this blank.';
    }
    if (!reason.trim()) next.reason = 'A reason is required.';
    setFieldErrors(next);
    if (Object.keys(next).length > 0) return;
    setCreateError(null);
    createInvite.mutate({
      expiresInHours: Number(expiresInHours),
      email: trimmedEmail || null,
      note: note.trim() || null,
      reason: reason.trim(),
    });
  };

  const copyLink = async (key: string, url: string) => {
    const ok = await copy(key, url);
    if (!ok) toast.error('Could not copy', 'Copy the link manually from the invite row.');
  };

  const columns: Column<Invite>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (row) => (
        <span className="block max-w-[140px] truncate font-mono text-xs text-fg" title={row.code}>
          {row.code}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'email',
      header: 'Locked to',
      render: (row) =>
        row.email ? (
          <span className="block max-w-[180px] truncate text-fg">{row.email}</span>
        ) : (
          <span className="text-muted">Anyone with the link</span>
        ),
    },
    {
      key: 'createdBy',
      header: 'Created by',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-fg">{row.createdByEmail ?? '—'}</p>
          <p className="truncate text-xs text-muted">{timeAgo(row.createdAt)}</p>
        </div>
      ),
    },
    {
      key: 'expiresAt',
      header: 'Expires',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.expiresAt)}</span>,
    },
    {
      key: 'usedBy',
      header: 'Used by',
      hideOnMobile: true,
      render: (row) =>
        row.usedByEmail ? (
          <div className="min-w-0">
            <p className="truncate text-fg">{row.usedByEmail}</p>
            <p className="truncate text-xs text-muted">{formatDateTime(row.usedAt)}</p>
          </div>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        row.status === 'ACTIVE' ? (
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copyLink(row.id, row.inviteUrl)}
              aria-label={`Copy invite link for code ${row.code}`}
            >
              {copiedKey === row.id ? (
                <Check className="h-4 w-4" aria-hidden />
              ) : (
                <Copy className="h-4 w-4" aria-hidden />
              )}
              {copiedKey === row.id ? 'Copied' : 'Copy link'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setRevokeTarget(row);
                setRevokeError(null);
              }}
              aria-label={`Revoke invite ${row.code}`}
            >
              Revoke
            </Button>
          </div>
        ) : (
          <span className="text-xs text-muted">No actions</span>
        ),
    },
  ];

  return (
    <div className="space-y-4">
      <span aria-live="polite" className="sr-only">
        {copiedKey ? 'Invite link copied to the clipboard.' : ''}
      </span>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-xs text-muted">
          New customers can only register through an invite link. Each link is single use and
          expires; revoke one at any time before it is used.
        </p>
        <Button
          onClick={() => {
            setCreateOpen(true);
            setCreateError(null);
            setFieldErrors({});
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Generate invite link
        </Button>
      </div>

      {created && (
        <Card className="border border-primary/40">
          <CardHeader
            title="Invite link ready"
            description="Copy it now and send it to the invitee over a channel you trust."
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCreated(null)}
                aria-label="Dismiss generated invite link"
              >
                Dismiss
              </Button>
            }
          />
          <CardBody className="space-y-3">
            <FormSuccess message="Single use — this link stops working once it is redeemed." />
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 overflow-x-auto rounded-control bg-surface px-3 py-3 font-mono text-xs text-fg">
                {created.inviteUrl}
              </code>
              <Button
                onClick={() => void copyLink(`created-${created.id}`, created.inviteUrl)}
                aria-label="Copy the generated invite link"
              >
                {copiedKey === `created-${created.id}` ? (
                  <Check className="h-4 w-4" aria-hidden />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden />
                )}
                {copiedKey === `created-${created.id}` ? 'Copied' : 'Copy link'}
              </Button>
            </div>
            <div className="rounded-control bg-surface px-3 py-1">
              <DataRow label="Expires" value={formatDateTime(created.expiresAt)} tone="strong" />
              <Divider />
              <DataRow label="Locked to" value={created.email ?? 'Anyone with the link'} />
              <Divider />
              <DataRow label="Status" value={created.status} />
              {created.note && (
                <>
                  <Divider />
                  <DataRow label="Note" value={created.note} />
                </>
              )}
            </div>
            <p className="text-xs text-muted">{SINGLE_USE_NOTICE}</p>
          </CardBody>
        </Card>
      )}

      <Tabs items={STATUS_TABS} value={status} onChange={setStatus} ariaLabel="Invite status" />

      <DataTable<Invite>
        caption="Registration invites"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle={status === 'ALL' ? 'No invites yet' : `No ${status.toLowerCase()} invites`}
        emptyDescription="Generate an invite link to let someone create an account."
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate invite link"
        description="Creates one single-use registration link."
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setCreateOpen(false)}
              disabled={createInvite.isPending}
            >
              Cancel
            </Button>
            <Button fullWidth onClick={submitCreate} loading={createInvite.isPending}>
              Generate link
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Select
            label="Expires after"
            options={EXPIRY_OPTIONS}
            value={expiresInHours}
            onChange={(event) => setExpiresInHours(event.target.value)}
            hint="The link stops working once this window passes."
          />
          <Input
            label="Lock to email (optional)"
            type="email"
            autoComplete="off"
            placeholder="person@example.com"
            value={lockEmail}
            error={fieldErrors.email}
            onChange={(event) => setLockEmail(event.target.value)}
            hint="If set, only this address can register with the link."
          />
          <Input
            label="Note (optional)"
            value={note}
            maxLength={200}
            placeholder="Who is this for?"
            onChange={(event) => setNote(event.target.value)}
            hint="Internal only — the invitee never sees it."
          />
          <Textarea
            label="Reason (required)"
            hint="Recorded in the audit log with your identity."
            placeholder="Explain why this invite is being issued."
            value={reason}
            error={fieldErrors.reason}
            maxLength={2000}
            required
            onChange={(event) => setReason(event.target.value)}
          />
          <FormError message={createError} />
          <p className="text-xs text-muted">{SINGLE_USE_NOTICE}</p>
        </div>
      </Modal>

      <ReasonDialog
        open={Boolean(revokeTarget)}
        onClose={() => {
          setRevokeTarget(null);
          setRevokeError(null);
        }}
        onSubmit={(why) => {
          if (!revokeTarget) return;
          revokeInvite.mutate({ id: revokeTarget.id, reason: why });
        }}
        title="Revoke invite"
        description="The link stops working immediately. Anyone already holding it will be turned away."
        confirmLabel="Revoke invite"
        confirmVariant="danger"
        loading={revokeInvite.isPending}
        error={revokeError}
        details={
          revokeTarget ? (
            <div className="rounded-control bg-surface px-3 py-1">
              <DataRow label="Code" value={<span className="font-mono">{revokeTarget.code}</span>} />
              <Divider />
              <DataRow label="Locked to" value={revokeTarget.email ?? 'Anyone with the link'} />
              <Divider />
              <DataRow label="Expires" value={formatDateTime(revokeTarget.expiresAt)} />
              <Divider />
              <DataRow label="Created by" value={revokeTarget.createdByEmail ?? '—'} />
            </div>
          ) : null
        }
      />
    </div>
  );
}
