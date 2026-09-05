'use client';

/**
 * Support ticket thread, staff reply box and status control.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/format';
import type {
  SupportReplyResult, SupportTicketDetail, SupportTicketRow, TicketStatus,
} from '@/lib/admin-types';
import {
  Badge, Button, Card, CardBody, CardHeader, ErrorState, ListSkeleton,
} from '@/components/ui/primitives';
import { FormError, Select, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';

function ticketTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' | 'info' {
  if (status === 'OPEN') return 'warning';
  if (status === 'IN_PROGRESS') return 'info';
  if (status === 'RESOLVED') return 'success';
  return 'neutral';
}

const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'CLOSED', label: 'Closed' },
];

export default function AdminSupportTicketPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [body, setBody] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'ticket', ticketId],
    queryFn: () => api.get<SupportTicketDetail>(`/admin/support/tickets/${ticketId}`),
    enabled: Boolean(ticketId),
  });

  useAdminPage(
    query.data?.ticket.subject ?? 'Support ticket',
    query.data ? `${query.data.ticket.category} · ${query.data.ticket.username ?? ''}` : undefined,
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'ticket', ticketId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'tickets'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
  };

  const reply = useMutation({
    mutationFn: (text: string) =>
      api.post<SupportReplyResult>(`/admin/support/tickets/${ticketId}/reply`, { body: text }),
    onSuccess: () => {
      toast.success('Reply sent', 'The customer has been notified.');
      setBody('');
      setReplyError(null);
      invalidate();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setReplyError(message);
      toast.error('Could not send reply', message);
    },
  });

  const changeStatus = useMutation({
    mutationFn: (status: TicketStatus) =>
      api.patch<SupportTicketRow>(`/admin/support/tickets/${ticketId}`, { status }),
    onSuccess: (ticket) => {
      toast.success('Ticket status updated', `Now ${ticket.status.replace('_', ' ').toLowerCase()}.`);
      invalidate();
    },
    onError: (error) => toast.error('Could not change status', errorMessage(error)),
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardBody>
          <ListSkeleton rows={6} />
        </CardBody>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Could not load this ticket"
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { ticket, messages } = query.data;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/support"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm text-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to queue
      </Link>

      <Card>
        <CardHeader
          title={ticket.subject}
          description={`${ticket.category} · opened ${formatDateTime(ticket.createdAt)}`}
          action={<Badge tone={ticketTone(ticket.status)}>{ticket.status}</Badge>}
        />
        <CardBody className="flex flex-wrap items-end gap-3 pt-2">
          <div className="min-w-0">
            <p className="text-sm text-fg">{ticket.username ?? ticket.userId}</p>
            <p className="text-xs text-muted">{ticket.email ?? ''}</p>
          </div>
          <div className="ml-auto w-full sm:w-56">
            <Select
              label="Status"
              options={STATUS_OPTIONS}
              value={ticket.status}
              disabled={changeStatus.isPending}
              onChange={(event) => changeStatus.mutate(event.target.value as TicketStatus)}
            />
          </div>
          {ticket.userId && (
            <Link
              href={`/admin/users/${ticket.userId}`}
              className="inline-flex min-h-[44px] items-center rounded-control border border-border px-3 text-xs font-semibold text-fg hover:bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              View customer
            </Link>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Conversation" description={`${messages.length} messages`} />
        <CardBody className="space-y-3 pt-2">
          {messages.length === 0 && <p className="text-xs text-muted">No messages yet.</p>}
          {messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                'rounded-card px-4 py-3',
                message.isStaffReply ? 'bg-primary/10' : 'bg-surface',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {message.isStaffReply ? 'Support' : 'Customer'}
                </span>
                <span className="text-xs text-subtle">{formatDateTime(message.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-fg">{message.body}</p>
            </article>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Reply as support" description="An open ticket moves to In progress automatically." />
        <CardBody className="space-y-3 pt-2">
          <Textarea
            label="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={5000}
            placeholder="Write your reply to the customer."
          />
          <FormError message={replyError} />
          <div className="flex justify-end">
            <Button
              onClick={() => reply.mutate(body.trim())}
              loading={reply.isPending}
              disabled={body.trim().length === 0}
            >
              Send reply
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
