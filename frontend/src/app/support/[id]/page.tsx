'use client';

/** A single support thread, with a reply box. */
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDateTime } from '@/lib/format';
import { FormError, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '@/components/ui/primitives';
import type { SupportMessage, SupportTicket, TicketStatus } from '@/lib/types';

const STATUS_TONE: Record<TicketStatus, 'success' | 'warning' | 'neutral' | 'info'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

function MessageBubble({ message }: { message: SupportMessage }) {
  return (
    <li
      className={cn(
        'flex flex-col',
        message.isStaffReply ? 'items-start' : 'items-end',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-card px-3.5 py-2.5 text-sm leading-relaxed',
          message.isStaffReply ? 'bg-elevated text-fg' : 'bg-primary/15 text-fg',
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
      <p className="mt-1 text-[11px] text-subtle">
        {message.isStaffReply ? 'Support' : 'You'} · {formatDateTime(message.createdAt)}
      </p>
    </li>
  );
}

export default function SupportThreadPage() {
  const params = useParams<{ id: string }>();
  const ticketId = params?.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [reply, setReply] = useState('');
  const [replyError, setReplyError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const ticket = useQuery({
    queryKey: ['support-ticket', ticketId],
    queryFn: () => api.get<SupportTicket>(`/support/${ticketId}`),
    enabled: Boolean(ticketId),
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: (body: { message: string }) =>
      api.post<{ ticket: SupportTicket; message: SupportMessage }>(
        `/support/${ticketId}/messages`,
        body,
      ),
    onSuccess: () => {
      setReply('');
      void ticket.refetch();
      void queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Reply sent');
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const closed = ticket.data?.status === 'CLOSED';

  const submit = () => {
    if (reply.trim().length < 2) {
      setReplyError('Enter a reply before sending.');
      return;
    }
    setReplyError(null);
    setFormError(null);
    send.mutate({ message: reply.trim() });
  };

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Ticket" backHref="/support" />
      <PageBody>
        {ticket.isLoading ? (
          <ListSkeleton rows={4} />
        ) : ticket.isError ? (
          <ErrorState
            title="Could not load this ticket"
            description={errorMessage(ticket.error)}
            onRetry={() => void ticket.refetch()}
          />
        ) : ticket.data ? (
          <>
            <Card>
              <CardHeader
                title={ticket.data.subject}
                description={`${ticket.data.category} · opened ${formatDateTime(ticket.data.createdAt)}`}
                action={<Badge tone={STATUS_TONE[ticket.data.status]}>{ticket.data.status}</Badge>}
              />
              <CardBody className="pt-3">
                {!ticket.data.messages || ticket.data.messages.length === 0 ? (
                  <EmptyState
                    title="No messages yet"
                    description="Your conversation with support will appear here."
                  />
                ) : (
                  <ul className="space-y-4">
                    {ticket.data.messages.map((message) => (
                      <MessageBubble key={message.id} message={message} />
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardBody className="space-y-3">
                {closed ? (
                  <p className="text-center text-xs text-muted">
                    This ticket is closed. Open a new ticket if you still need help.
                  </p>
                ) : (
                  <>
                    <Textarea
                      label="Reply"
                      placeholder="Write a reply"
                      value={reply}
                      error={replyError}
                      maxLength={4000}
                      onChange={(event) => {
                        setReply(event.target.value);
                        if (replyError) setReplyError(null);
                      }}
                      hint={`${reply.length}/4000`}
                    />
                    <FormError message={formError} />
                    <Button fullWidth loading={send.isPending} onClick={submit}>
                      Send reply
                    </Button>
                  </>
                )}
              </CardBody>
            </Card>
          </>
        ) : null}
      </PageBody>
    </AppShell>
  );
}
