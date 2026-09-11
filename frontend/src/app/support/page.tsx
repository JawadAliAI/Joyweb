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
        <div className="mb-5 flex flex-col items-start justify-between gap-4 rounded-card border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-sm">
              <LifeBuoy className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-fg">24/7 Live Support Team</h3>
              <p className="mt-0.5 text-xs text-muted">
                Need immediate assistance? Connect with our official support team on Telegram.
              </p>
            </div>
          </div>
          <a
            href="https://t.me/CPT_live_support"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2 rounded-control bg-primary px-4 py-2.5 text-xs font-bold text-white shadow transition hover:opacity-90 active:scale-95"
          >
            <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
            </svg>
            Contact Live Support (@CPT_live_support)
          </a>
        </div>

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
