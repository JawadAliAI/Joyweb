'use client';

/**
 * Change password (Change password).
 *
 * A thin wrapper over `/auth/change-password`, which the customer app already
 * uses — the agent panel needs its own screen, not its own endpoint.
 */
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { Panel } from '@/components/agent/AgentPrimitives';
import { Button } from '@/components/ui/primitives';
import { FormError, PasswordInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export default function AgentPasswordPage() {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Record<string, never>>('/auth/change-password', {
        currentPassword: current,
        newPassword: next,
      }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed', 'Use the new password next time you sign in.');
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <Panel className="max-w-xl p-6">
      <h1 className="mb-1 text-base font-semibold text-fg">Change password</h1>
      <p className="mb-5 text-sm text-muted">Change password</p>

      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          if (next !== confirm) {
            setError('The two new passwords do not match.');
            return;
          }
          mutation.mutate();
        }}
      >
        <PasswordInput
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
        />
        <PasswordInput
          label="New password"
          autoComplete="new-password"
          hint="At least 5 characters, with a letter and a digit."
          value={next}
          onChange={(event) => setNext(event.target.value)}
        />
        <PasswordInput
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
        />
        <FormError message={error} />
        <Button type="submit" loading={mutation.isPending}>
          Save
        </Button>
      </form>
    </Panel>
  );
}
