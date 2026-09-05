'use client';

/**
 * Administrator sign-in.
 *
 * Deliberately separate from the customer sign-in page: staff have their own
 * entry point, and a customer who authenticates here is signed straight back
 * out rather than being left holding a half-usable session.
 */
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { usePlatform } from '@/components/providers';
import { sessionKey } from '@/hooks/useSession';
import { Button, Card, CardBody } from '@/components/ui/primitives';
import { FormError, Input, PasswordInput } from '@/components/ui/form';
import { DemoBadge } from '@/components/layout/DemoBadge';
import type { SessionUser } from '@/lib/types';

export default function AdminLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { config } = usePlatform();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const nextParam = searchParams.get('next');
  // Only ever follow an in-app admin path — never an absolute foreign URL.
  const next =
    nextParam && nextParam.startsWith('/admin') && !nextParam.startsWith('//')
      ? nextParam
      : '/admin';

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<SessionUser>('/auth/login', body),
    onSuccess: async (user) => {
      if (user.role === 'USER') {
        // Not staff: drop the session rather than leaving them signed in here.
        await api.post('/auth/logout').catch(() => undefined);
        queryClient.clear();
        setFormError('This account does not have administrator access.');
        return;
      }
      queryClient.setQueryData(sessionKey, user);
      router.replace(user.mustChangePassword ? '/profile/security' : next);
    },
    onError: (error) => setFormError(errorMessage(error)),
  });

  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (!email.trim()) nextErrors.email = 'Enter your email address.';
    if (!password) nextErrors.password = 'Enter your password.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setFormError(null);
    login.mutate({ email: email.trim(), password });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span
            aria-hidden
            className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary"
          >
            <ShieldCheck className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-semibold text-fg">Administration</h1>
          <p className="mt-1 text-xs text-muted">{config.appName}</p>
          <DemoBadge className="mt-2" />
        </div>

        <Card>
          <CardBody>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Input
                label="Email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="admin@example.com"
                value={email}
                error={errors.email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                value={password}
                error={errors.password}
                onChange={(event) => setPassword(event.target.value)}
              />

              <FormError message={formError} />

              <Button type="submit" fullWidth size="lg" loading={login.isPending}>
                Sign in to administration
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted">
              Staff access only. Every administrative action is written to the
              audit log with your identity.
            </p>
          </CardBody>
        </Card>

        <p className="mt-5 text-center text-xs text-muted">
          Looking for the customer app?{' '}
          <Link href="/login" className="font-medium text-primary">
            Sign in here
          </Link>
        </p>
      </div>
    </main>
  );
}
