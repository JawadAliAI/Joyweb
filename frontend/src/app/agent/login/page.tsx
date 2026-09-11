'use client';

/**
 * Agent sign-in.
 *
 * Its own entry point, like the admin one. The panel is administrator-only, so
 * anyone else who authenticates here is signed straight back out rather than
 * left holding a session that opens nothing.
 *
 * The reference login carries a CAPTCHA. This one does not — the sign-in route
 * is already rate limited server-side, and a CAPTCHA that is decorative rather
 * than verified would only look like protection.
 */
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { usePlatform } from '@/components/providers';
import { sessionKey } from '@/hooks/useSession';
import { Button } from '@/components/ui/primitives';
import { FormError, Input, PasswordInput } from '@/components/ui/form';
import type { SessionUser } from '@/lib/types';

function AgentLoginForm() {
  const { config } = usePlatform();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post<SessionUser>('/auth/login', { email, password }),
    onSuccess: async (user) => {
      if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') {
        // The panel is administrator-only. End the session rather than leave
        // them holding one that opens nothing.
        await api.post<Record<string, never>>('/auth/logout').catch(() => undefined);
        queryClient.clear();
        setError('This account cannot open the agent back office.');
        return;
      }
      queryClient.setQueryData(sessionKey, user);
      // A starting password is changed in the admin panel before anything else.
      router.replace(
        user.mustChangePassword ? '/admin/password' : searchParams.get('next') || '/agent',
      );
    },
    onError: (mutationError) => setError(errorMessage(mutationError)),
  });

  return (
    <div className="theme-light flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm border border-border bg-surface p-8">
        <h1 className="text-center text-lg font-semibold text-fg">Agent back office</h1>
        <p className="mt-1 text-center text-sm text-muted">{config.appName}</p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <Input
            label="Username"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <PasswordInput
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <FormError message={error} />
          <Button type="submit" fullWidth loading={mutation.isPending}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AgentLoginPage() {
  return (
    <Suspense fallback={null}>
      <AgentLoginForm />
    </Suspense>
  );
}
