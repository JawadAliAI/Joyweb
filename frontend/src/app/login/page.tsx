'use client';

/** Sign in. Honours a `?next=` destination so a deep link survives the redirect. */
import { Suspense, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePlatform } from '@/components/providers';
import { DemoBadge } from '@/components/layout/DemoBadge';
import { api, errorMessage } from '@/lib/api';
import { FormError, Input, PasswordInput } from '@/components/ui/form';
import { Button, Card, CardBody, Skeleton } from '@/components/ui/primitives';
import type { SessionUser } from '@/lib/types';

function LoginForm() {
  const { config } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const nextParam = searchParams.get('next');
  // Only ever redirect within this app — never to an absolute foreign URL.
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';

  const login = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      api.post<SessionUser>('/auth/login', body),
    onSuccess: (user) => {
      queryClient.setQueryData(['session'], user);
      if (user.mustChangePassword) {
        router.replace('/profile/security');
        return;
      }
      // Staff land in the back office, not the customer app. An explicit
      // ?next= is still honoured so a deep link keeps working.
      // Only administrators have a back office to land in. An AGENT is a
      // customer account that happens to own a downline, so it stays here.
      if ((user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && !nextParam) {
        router.replace('/admin');
        return;
      }
      router.replace(next);
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
          <h1 className="text-lg font-semibold text-fg">{config.appName}</h1>
          <DemoBadge />
          <p className="text-xs text-muted">
            A paper-trading simulator. No real money, custody or blockchain activity.
          </p>
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
                placeholder="you@example.com"
                value={email}
                error={errors.email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <PasswordInput
                label="Password"
                autoComplete="current-password"
                value={password}
                error={errors.password}
                labelAction={
                  <Link href="/forgot-password" className="text-xs font-medium text-primary">
                    Forgot password?
                  </Link>
                }
                onChange={(event) => setPassword(event.target.value)}
              />
              <FormError message={formError} />
              <Button type="submit" fullWidth size="lg" loading={login.isPending}>
                Sign in
              </Button>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-muted">
          No demo account?{' '}
          <Link href="/register" className="font-semibold text-primary">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bg px-4">
          <Skeleton className="h-80 w-full max-w-sm" />
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
