'use client';

/**
 * The administrator's own password — changed inside the admin panel.
 *
 * An account created with a starting password (the seeded administrator) is
 * flagged `mustChangePassword`. The admin shell holds it on this page until the
 * password is changed, then the dashboard opens. It used to send them to the
 * customer app's Security page instead, which dropped an administrator into
 * the customer interface on their very first sign-in.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import { sessionKey, useSession } from '@/hooks/useSession';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { FormError, FormSuccess, PasswordInput } from '@/components/ui/form';
import { Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

/** Mirrors the backend policy: at least 5 characters, a letter and a digit. */
const PASSWORD_RULES = [
  { label: 'At least 5 characters', test: (value: string) => value.length >= 5 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a digit', test: (value: string) => /\d/.test(value) },
];

type Field = 'current' | 'next' | 'confirm';

export default function AdminPasswordPage() {
  useAdminPage('Change password', 'Your administrator sign-in password');

  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const mustChange = user?.mustChangePassword ?? false;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<Record<string, never>>('/auth/change-password', body),
    onSuccess: async () => {
      setCurrent('');
      setNext('');
      setConfirm('');
      toast.success('Password changed', 'Use the new password next time you sign in.');
      // The session carries mustChangePassword. Refresh it before moving on,
      // or the shell would read the old flag and send us straight back here.
      await queryClient.refetchQueries({ queryKey: sessionKey });
      if (mustChange) {
        router.replace('/admin');
        return;
      }
      setSuccess('Your password has been changed.');
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const submit = () => {
    const found: Partial<Record<Field, string>> = {};
    if (!current) found.current = 'Enter your current password.';
    if (!PASSWORD_RULES.every((rule) => rule.test(next))) {
      found.next = 'Password does not meet the requirements below.';
    } else if (next === current) {
      found.next = 'Choose a password different from your current one.';
    }
    if (confirm !== next) found.confirm = 'Passwords do not match.';
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setFormError(null);
    setSuccess(null);
    mutation.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="max-w-xl space-y-4">
      {mustChange && (
        <div role="alert" className="rounded-card border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm font-semibold text-warning">Set a new password to continue</p>
          <p className="mt-1 text-xs leading-relaxed text-warning/90">
            This administrator account still uses the password it was created with. Choose a new
            one and the admin dashboard opens straight away.
          </p>
        </div>
      )}

      <Card>
        <CardHeader
          title="Change password"
          description="Used to sign in to the admin panel and the agent portal."
        />
        <CardBody className="pt-3">
          <form
            className="space-y-4"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <PasswordInput
              label="Current password"
              autoComplete="current-password"
              value={current}
              error={errors.current}
              onChange={(event) => setCurrent(event.target.value)}
            />
            <PasswordInput
              label="New password"
              autoComplete="new-password"
              value={next}
              error={errors.next}
              onChange={(event) => setNext(event.target.value)}
            />
            <ul className="space-y-1" aria-live="polite">
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(next);
                return (
                  <li key={rule.label} className="flex items-center gap-2 text-xs">
                    {met ? (
                      <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                    ) : (
                      <X className="h-3.5 w-3.5 text-subtle" aria-hidden />
                    )}
                    <span className={cn(met ? 'text-primary' : 'text-muted')}>{rule.label}</span>
                  </li>
                );
              })}
            </ul>
            <PasswordInput
              label="Confirm new password"
              autoComplete="new-password"
              value={confirm}
              error={errors.confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
            <FormError message={formError} />
            <FormSuccess message={success} />
            <Button type="submit" loading={mutation.isPending}>
              Change password
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
