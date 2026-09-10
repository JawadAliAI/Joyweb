'use client';

/**
 * Profile (Profile).
 *
 * Reads the signed-in account and writes back through `/auth/profile`. The
 * email address is shown but not editable, matching the customer app.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { sessionKey, useSession } from '@/hooks/useSession';
import { Panel } from '@/components/agent/AgentPrimitives';
import { Button, DataRow, Divider, Skeleton } from '@/components/ui/primitives';
import { FormError, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import type { SessionUser } from '@/lib/types';

export default function AgentProfilePage() {
  const { user, isLoading } = useSession();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
  }, [user]);

  const mutation = useMutation({
    mutationFn: () => api.patch<SessionUser>('/auth/profile', { firstName, lastName }),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionKey, data);
      toast.success('Profile saved');
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  if (isLoading || !user) {
    return (
      <Panel className="max-w-xl p-6">
        <Skeleton className="h-48 w-full" />
      </Panel>
    );
  }

  return (
    <Panel className="max-w-xl p-6">
      <h1 className="mb-1 text-base font-semibold text-fg">Profile</h1>
      <p className="mb-5 text-sm text-muted">Profile</p>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          mutation.mutate();
        }}
      >
        <Input
          label="First name"
          value={firstName}
          autoComplete="given-name"
          onChange={(event) => setFirstName(event.target.value)}
        />
        <Input
          label="Last name"
          value={lastName}
          autoComplete="family-name"
          onChange={(event) => setLastName(event.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" loading={mutation.isPending}>
          Save
        </Button>
      </form>

      <div className="mt-6 border-t border-border pt-4">
        <DataRow label="Username" value={user.username} />
        <Divider />
        <DataRow label="Email" value={user.email} />
        <Divider />
        <DataRow label="Role" value={user.role} />
        <Divider />
        <DataRow label="Last seen" value={formatDateTime(user.lastLoginAt)} />
      </div>
    </Panel>
  );
}
