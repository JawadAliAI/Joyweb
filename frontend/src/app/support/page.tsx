'use client';

/** Support tickets: list existing threads and open a new one. */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, LifeBuoy } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { FormError, Input, Select, Textarea } from '@/components/ui/form';
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
import type { Paged, SupportTicket, TicketStatus } from '@/lib/types';

interface SupportCategory {
  value: string;
  label: string;
}

const STATUS_TONE: Record<TicketStatus, 'success' | 'warning' | 'neutral' | 'info'> = {
  OPEN: 'warning',
  IN_PROGRESS: 'info',
  RESOLVED: 'success',
  CLOSED: 'neutral',
};

export default function SupportPage() {
  const toast = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ['support-categories'],
    queryFn: () => api.get<{ categories: SupportCategory[] }>('/support/categories'),
    staleTime: 5 * 60 * 1000,
  });

  const tickets = useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => api.get<Paged<SupportTicket>>('/support'),
  });

  useEffect(() => {
    const options = categories.data?.categories ?? [];
    if (!category && options.length > 0) {
      setCategory(options[0].value);
    }
  }, [category, categories.data]);

  const create = useMutation({
    mutationFn: (body: { subject: string; category: string; message: string }) =>
      api.post<SupportTicket>('/support', body),
    onSuccess: () => {
      setSubject('');
      setMessage('');
      void queryClient.invalidateQueries({ queryKey: ['support-tickets'] });
      toast.success('Ticket submitted', 'Support will reply in this thread.');
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!subject.trim()) next.subject = 'Enter a subject.';
    else if (subject.trim().length < 4) next.subject = 'Subject is too short.';
    if (!category) next.category = 'Choose a category.';
    if (message.trim().length < 10) next.message = 'Describe the issue in at least 10 characters.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setFormError(null);
    create.mutate({ subject: subject.trim(), category, message: message.trim() });
  };

  return (
    <AppShell>
      <PageHeader title="Support" backHref="/profile" />
      <PageBody width="wide">
        <SimulationNotice>
          Support here covers this paper-trading demo only. Do not share real financial details,
          real wallet keys or real personal documents.
        </SimulationNotice>

        <div className="grid items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <Card>
            <CardHeader title="New ticket" />
            <CardBody className="space-y-4 pt-3">
              <Input
                label="Subject"
                placeholder="Briefly describe the issue"
                value={subject}
                error={errors.subject}
                maxLength={120}
                onChange={(event) => setSubject(event.target.value)}
              />
              {categories.isError ? (
                <FormError message={errorMessage(categories.error, 'Could not load categories.')} />
              ) : (
                <Select
                  label="Category"
                  value={category}
                  error={errors.category}
                  disabled={categories.isLoading}
                  options={(categories.data?.categories ?? []).map((item) => ({
                    value: item.value,
                    label: item.label,
                  }))}
                  onChange={(event) => setCategory(event.target.value)}
                />
              )}
              <Textarea
                label="Message"
                placeholder="What happened, and what did you expect?"
                value={message}
                error={errors.message}
                maxLength={4000}
                onChange={(event) => setMessage(event.target.value)}
                hint={`${message.length}/4000`}
              />
              <FormError message={formError} />
              <Button fullWidth loading={create.isPending} onClick={submit}>
                Submit ticket
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Your tickets" />
            <CardBody className="pt-2">
              {tickets.isLoading ? (
                <ListSkeleton rows={3} />
              ) : tickets.isError ? (
                <ErrorState
                  title="Could not load your tickets"
                  description={errorMessage(tickets.error)}
                  onRetry={() => void tickets.refetch()}
                />
              ) : !tickets.data || tickets.data.items.length === 0 ? (
                <EmptyState
                  icon={<LifeBuoy className="h-8 w-8" aria-hidden />}
                  title="No tickets yet"
                  description="Open a ticket above and your conversation will appear here."
                />
              ) : (
                <ul className="divide-y divide-border/70">
                  {tickets.data.items.map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        href={`/support/${ticket.id}`}
                        className="flex touch-target items-center gap-3 py-3"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">
                            {ticket.subject}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-muted">
                            {ticket.category} · updated {timeAgo(ticket.updatedAt)}
                          </span>
                        </span>
                        <Badge tone={STATUS_TONE[ticket.status]}>{ticket.status}</Badge>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </AppShell>
  );
}
