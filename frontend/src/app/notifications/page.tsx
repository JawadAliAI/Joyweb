'use client';

/**
 * Notifications.
 *
 * Reads the signed-in user's own notifications and marks them read one at a
 * time or all at once. Unread rows carry a visible marker and are announced
 * through the accessible name of their "mark read" control.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellOff, Check, CheckCheck } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import {
  Badge, Button, EmptyState, ErrorState, ListSkeleton,
} from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';
import { useNotifications } from '@/hooks/useSession';
import { api, errorMessage } from '@/lib/api';
import { cn, timeAgo } from '@/lib/format';

export default function NotificationsPage() {
  const query = useNotifications();
  const queryClient = useQueryClient();
  const toast = useToast();

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };

  const markOne = useMutation({
    mutationFn: (id: string) => api.post<Record<string, never>>(`/notifications/${id}/read`),
    onSuccess: invalidate,
    onError: (error) => toast.error('Could not mark as read', errorMessage(error)),
  });

  const markAll = useMutation({
    mutationFn: () => api.post<Record<string, never>>('/notifications/read-all'),
    onSuccess: () => {
      invalidate();
      toast.success('All notifications marked as read');
    },
    onError: (error) => toast.error('Could not mark all as read', errorMessage(error)),
  });

  const items = query.data?.items ?? [];
  const unreadCount = items.filter((item) => !item.read).length;

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        backHref="/"
        action={
          unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAll.mutate()}
              loading={markAll.isPending}
            >
              <CheckCheck className="h-4 w-4" aria-hidden />
              Mark all read
            </Button>
          ) : undefined
        }
      />
      <PageBody width="wide">
        {query.isLoading ? (
          <div className="rounded-card border border-border/70 bg-card p-4">
            <ListSkeleton rows={5} />
          </div>
        ) : query.isError ? (
          <ErrorState
            title="Notifications unavailable"
            description={errorMessage(query.error, 'Your notifications could not be loaded.')}
            onRetry={() => void query.refetch()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-8 w-8" aria-hidden />}
            title="No notifications"
            description="Account and trading updates will appear here."
          />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={cn(
                  'flex items-start gap-3 rounded-card border bg-card p-4',
                  // A ternary, not two competing border-colour utilities:
                  // which of those wins is decided by stylesheet order.
                  item.read ? 'border-border/70' : 'border-primary/30',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-fg">{item.title}</h2>
                    {!item.read && <Badge tone="success">New</Badge>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{item.body}</p>
                  <p className="mt-1.5 text-[11px] text-subtle">
                    {item.category} · {timeAgo(item.createdAt)}
                  </p>
                </div>

                {!item.read && (
                  <button
                    type="button"
                    onClick={() => markOne.mutate(item.id)}
                    disabled={markOne.isPending && markOne.variables === item.id}
                    aria-label={`Mark "${item.title}" as read`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-elevated hover:text-primary disabled:opacity-50"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageBody>
    </AppShell>
  );
}
