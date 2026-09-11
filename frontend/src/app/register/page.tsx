'use client';

/**
 * Create an account.
 *
 * Four things only: a sign-in name (an email address or a username), the
 * password twice, and the invitation code. The code is normally the one shared
 * code the administrator hands out; a single-use `?invite=<code>` link still
 * works and prefills it. The password policy matches the backend exactly.
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { usePlatform } from '@/components/providers';
import { DemoBadge } from '@/components/layout/DemoBadge';
import { ApiError, api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import { FormError, Input, PasswordInput } from '@/components/ui/form';
import { Button, Card, CardBody, Skeleton } from '@/components/ui/primitives';
import type { SessionUser } from '@/lib/types';
import type { InviteCheck } from '@/lib/invite-types';
import { isInviteErrorCode } from '@/lib/invite-types';

const PASSWORD_RULES = [
  { label: 'At least 5 characters', test: (value: string) => value.length >= 5 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a digit', test: (value: string) => /\d/.test(value) },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Mirrors the backend's username rule. */
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,32}$/;

interface RegisterBody {
  identifier: string;
  password: string;
  confirmPassword: string;
  inviteCode: string;
}

type Field = 'identifier' | 'password' | 'confirmPassword' | 'inviteCode';

function RegisterForm() {
  const { config } = usePlatform();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const linkCode = searchParams.get('invite')?.trim() || '';

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode] = useState(linkCode);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // A single-use link can be locked to one address, so it is checked up front
  // and the form can say so. A typed code is checked when the account is created.
  const linkQuery = useQuery({
    queryKey: ['invite', linkCode],
    queryFn: () => api.get<InviteCheck>(`/auth/invite/${encodeURIComponent(linkCode)}`),
    enabled: Boolean(linkCode),
    retry: false,
  });
  const usingLink = Boolean(linkCode) && inviteCode.trim() === linkCode;
  const link = usingLink ? linkQuery.data ?? null : null;
  const lockedEmail = link?.valid ? link.email : null;
  const linkError =
    link && !link.valid ? (link.reason ?? 'This invitation link is no longer valid.') : undefined;

  useEffect(() => {
    if (lockedEmail) setIdentifier(lockedEmail);
  }, [lockedEmail]);

  const register = useMutation({
    mutationFn: (body: RegisterBody) => api.post<SessionUser>('/auth/register', { ...body }),
    onSuccess: (user) => {
      queryClient.setQueryData(['session'], user);
      router.replace('/');
    },
    onError: (error) => {
      if (error instanceof ApiError && isInviteErrorCode(error.code)) {
        setErrors((current) => ({ ...current, inviteCode: error.message }));
        setFormError(null);
        return;
      }
      if (
        error instanceof ApiError &&
        (error.code === 'EMAIL_TAKEN' || error.code === 'USERNAME_TAKEN')
      ) {
        setErrors((current) => ({ ...current, identifier: error.message }));
        setFormError(null);
        return;
      }
      setFormError(errorMessage(error));
    },
  });

  const submit = () => {
    const next: Partial<Record<Field, string>> = {};
    const name = identifier.trim();
    if (!name) {
      next.identifier = 'Enter an email address or a username.';
    } else if (name.includes('@') && !EMAIL_RE.test(name)) {
      next.identifier = 'Enter a valid email address.';
    } else if (!name.includes('@') && !USERNAME_RE.test(name)) {
      next.identifier = 'Use 3 to 32 letters, digits, dots, dashes or underscores.';
    }
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      next.password = 'Password does not meet the requirements below.';
    }
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match.';
    if (!inviteCode.trim()) next.inviteCode = 'Enter your invitation code.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setFormError(null);
    register.mutate({
      identifier: name,
      password,
      confirmPassword,
      inviteCode: inviteCode.trim(),
    });
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
          <h1 className="text-lg font-semibold text-fg">Create an account</h1>
          <DemoBadge />
          <p className="text-xs text-muted">
            Create your {config.appName} account to start trading the cryptocurrency markets.
          </p>
        </div>

        <Card>
          <CardBody>
            <form
              className="space-y-4"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Input
                label="Email or username"
                autoComplete="username"
                value={identifier}
                error={errors.identifier}
                readOnly={Boolean(lockedEmail)}
                hint={
                  lockedEmail
                    ? 'This invitation is reserved for this email address, so it cannot be changed.'
                    : undefined
                }
                onChange={(event) => {
                  if (lockedEmail) return;
                  setIdentifier(event.target.value);
                }}
              />
              <PasswordInput
                label="Password"
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
                      <span className={cn(met ? 'text-primary' : 'text-muted')}>{rule.label}</span>
                    </li>
                  );
                })}
              </ul>
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                value={confirmPassword}
                error={errors.confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <Input
                label="Invitation code"
                autoComplete="off"
                value={inviteCode}
                error={errors.inviteCode ?? linkError}
                hint={link?.valid ? 'Invitation link accepted.' : undefined}
                onChange={(event) => {
                  setInviteCode(event.target.value);
                  setErrors((current) => ({ ...current, inviteCode: undefined }));
                }}
              />
              <FormError message={formError} />
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={register.isPending}
                disabled={usingLink && linkQuery.isLoading}
              >
                Confirm
              </Button>
              <p className="text-center text-xs text-muted">
                By registering, you agree to our{' '}
                <Link href="/terms" target="_blank" className="font-semibold text-primary hover:underline">
                  Terms and Conditions
                </Link>
                .
              </p>
            </form>
          </CardBody>
        </Card>

        <p className="text-center text-sm text-muted">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-primary">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-bg px-4">
          <Skeleton className="h-96 w-full max-w-sm" />
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
