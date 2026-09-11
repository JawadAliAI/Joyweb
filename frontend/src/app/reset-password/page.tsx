'use client';

/** Complete a password reset using the `?token=` value from the emailed link. */
import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { usePlatform } from '@/components/providers';
import { DemoBadge } from '@/components/layout/DemoBadge';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import { FormError, FormSuccess, PasswordInput } from '@/components/ui/form';
import { Button, Card, CardBody, Skeleton } from '@/components/ui/primitives';

const PASSWORD_RULES = [
  { label: 'At least 5 characters', test: (value: string) => value.length >= 5 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a digit', test: (value: string) => /\d/.test(value) },
];

function ResetForm() {
  const { config } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const reset = useMutation({
    mutationFn: (body: { token: string; newPassword: string }) =>
      api.post<Record<string, never>>('/auth/reset-password', body),
    onSuccess: () => {
      setDone(true);
      setPassword('');
      setConfirmPassword('');
      window.setTimeout(() => router.replace('/login'), 1500);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      next.password = 'Password does not meet the requirements below.';
    }
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setFormError(null);
    reset.mutate({ token, newPassword: password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm space-y-5">
        <div className="flex flex-col items-center gap-2 text-center">
          <Image
            src={config.logoUrl}
            alt=""
            width={44}
            height={44}
            className="h-11 w-11 rounded-card"
            unoptimized
          />
          <h1 className="text-lg font-semibold text-fg">Choose a new password</h1>
          <DemoBadge />
        </div>

        <Card>
          <CardBody>
            {!token ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-fg">This reset link is missing its token.</p>
                <p className="text-xs text-muted">
                  Open the link from your email again, or request a new one.
                </p>
                <Link
                  href="/forgot-password"
                  className="touch-target inline-flex items-center rounded-pill bg-primary px-5 text-sm font-semibold text-primary-foreground"
                >
                  Request a new link
                </Link>
              </div>
            ) : (
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <PasswordInput
                  label="New password"
                  autoComplete="new-password"
                  value={password}
                  error={errors.password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <ul className="space-y-1" aria-live="polite">
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(password);
                    return (
                      <li key={rule.label} className="flex items-center gap-2 text-xs">
                        {met ? (
                          <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                        ) : (
                          <X className="h-3.5 w-3.5 text-subtle" aria-hidden />
                        )}
                        <span className={cn(met ? 'text-primary' : 'text-muted')}>
                          {rule.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <PasswordInput
                  label="Confirm new password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  error={errors.confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
                <FormError message={formError} />
                <FormSuccess
                  message={done ? 'Password updated. Taking you to sign in…' : null}
                />
                <Button type="submit" fullWidth size="lg" loading={reset.isPending}>
                  Set new password
                </Button>
              </form>
            )}
          </CardBody>
        </Card>

        <p className="text-center text-sm text-muted">
          <Link href="/login" className="font-semibold text-primary">
            Back to sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bg px-4">
          <Skeleton className="h-80 w-full max-w-sm" />
        </main>
      }
    >
      <ResetForm />
    </Suspense>
  );
}
