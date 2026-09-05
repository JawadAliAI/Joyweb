'use client';

/**
 * Create a demo account. The password policy matches the backend exactly.
 *
 * Registration is invitation-only: an `?invite=<code>` link is checked against
 * the backend before the form is usable, and the code rides along with the
 * registration request.
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
import { cn, formatDateTime } from '@/lib/format';
import { FormError, Input, PasswordInput } from '@/components/ui/form';
import { Button, Card, CardBody, Skeleton } from '@/components/ui/primitives';
import type { SessionUser } from '@/lib/types';
import type { InviteCheck } from '@/lib/invite-types';
import { isInviteErrorCode } from '@/lib/invite-types';

const PASSWORD_RULES = [
  { label: 'At least 10 characters', test: (value: string) => value.length >= 10 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a digit', test: (value: string) => /\d/.test(value) },
];

interface RegisterBody {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  inviteCode?: string;
}

function RegisterForm() {
  const { config } = usePlatform();
  const router = useRouter();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get('invite')?.trim() || null;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  /** Set when the backend says an invite is mandatory and none was supplied. */
  const [inviteRequired, setInviteRequired] = useState(false);

  const inviteQuery = useQuery({
    queryKey: ['invite', inviteCode],
    queryFn: () => api.get<InviteCheck>(`/auth/invite/${encodeURIComponent(inviteCode ?? '')}`),
    enabled: Boolean(inviteCode),
    retry: false,
  });

  const invite = inviteQuery.data ?? null;
  const lockedEmail = invite?.valid ? invite.email : null;
  const inviteRejected = Boolean(invite && !invite.valid);
  // The check endpoint being unreachable must not strand a legitimate invitee:
  // the registration call itself is the authority and will reject a bad code.
  const inviteCheckFailed = Boolean(inviteCode) && inviteQuery.isError;
  const inviteChecking = Boolean(inviteCode) && inviteQuery.isLoading;
  const formDisabled = inviteChecking || inviteRejected;

  useEffect(() => {
    if (lockedEmail) setEmail(lockedEmail);
  }, [lockedEmail]);

  const register = useMutation({
    mutationFn: (body: RegisterBody) => api.post<SessionUser>('/auth/register', { ...body }),
    onSuccess: (user) => {
      queryClient.setQueryData(['session'], user);
      router.replace('/');
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'INVITE_REQUIRED') {
        setInviteRequired(true);
        setFormError(null);
        return;
      }
      if (error instanceof ApiError && isInviteErrorCode(error.code)) {
        setFormError(error.message);
        void inviteQuery.refetch();
        return;
      }
      setFormError(errorMessage(error));
    },
  });

  const submit = () => {
    const next: Record<string, string> = {};
    if (!firstName.trim()) next.firstName = 'Enter your first name.';
    if (!lastName.trim()) next.lastName = 'Enter your last name.';
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username.trim())) {
      next.username = 'Use 3 to 24 letters, digits or underscores.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!PASSWORD_RULES.every((rule) => rule.test(password))) {
      next.password = 'Password does not meet the requirements below.';
    }
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setFormError(null);
    register.mutate({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      username: username.trim(),
      email: email.trim(),
      password,
      confirmPassword,
      ...(inviteCode ? { inviteCode } : {}),
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
          <h1 className="text-lg font-semibold text-fg">Create a demo account</h1>
          <DemoBadge />
          <p className="text-xs text-muted">
            {config.appName} is a paper-trading simulator. Balances are simulated credits with no
            monetary value.
          </p>
        </div>

        {inviteRequired ? (
          <Card>
            <CardBody className="space-y-3 text-center">
              <h2 className="text-base font-semibold text-fg">Registration is by invitation only</h2>
              <p className="text-sm text-muted">
                Ask an administrator for an invite link. The link they send you opens this page with
                everything already unlocked.
              </p>
              <Button fullWidth size="lg" onClick={() => router.push('/login')}>
                Go to sign in
              </Button>
            </CardBody>
          </Card>
        ) : (
          <>
            {inviteChecking && (
              <div role="status" aria-label="Checking your invite">
                <Skeleton className="h-16 w-full" />
              </div>
            )}

            {invite?.valid && (
              <p
                role="status"
                className="rounded-card bg-primary/10 px-4 py-3 text-xs text-primary"
              >
                Invite valid — expires {formatDateTime(invite.expiresAt)}. This link can be used
                once.
              </p>
            )}

            {inviteRejected && (
              <div role="alert" className="space-y-2 rounded-card bg-danger/10 px-4 py-3">
                <p className="text-sm font-semibold text-danger">This invite cannot be used</p>
                <p className="text-xs text-danger">
                  {invite?.reason ?? 'The invite link is no longer valid.'}
                </p>
                <p className="text-xs text-muted">
                  Registration is closed until an administrator sends you a new invite link.
                </p>
              </div>
            )}

            {inviteCheckFailed && (
              <p role="status" className="rounded-card bg-warning/10 px-4 py-3 text-xs text-warning">
                We could not verify your invite just now. You can still submit the form — your
                invite is checked again when the account is created.
              </p>
            )}

            <Card>
              <CardBody>
                <fieldset disabled={formDisabled} className="border-0 p-0">
                  <form
                    className="space-y-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (formDisabled) return;
                      submit();
                    }}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        label="First name"
                        autoComplete="given-name"
                        value={firstName}
                        error={errors.firstName}
                        onChange={(event) => setFirstName(event.target.value)}
                      />
                      <Input
                        label="Last name"
                        autoComplete="family-name"
                        value={lastName}
                        error={errors.lastName}
                        onChange={(event) => setLastName(event.target.value)}
                      />
                    </div>
                    <Input
                      label="Username"
                      autoComplete="username"
                      value={username}
                      error={errors.username}
                      onChange={(event) => setUsername(event.target.value)}
                    />
                    <Input
                      label="Email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      error={errors.email}
                      readOnly={Boolean(lockedEmail)}
                      hint={
                        lockedEmail
                          ? 'This invite is reserved for this email address, so it cannot be changed.'
                          : undefined
                      }
                      onChange={(event) => {
                        if (lockedEmail) return;
                        setEmail(event.target.value);
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
                            <span className={cn(met ? 'text-primary' : 'text-muted')}>
                              {rule.label}
                            </span>
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
                    <FormError message={formError} />
                    <Button
                      type="submit"
                      fullWidth
                      size="lg"
                      loading={register.isPending}
                      disabled={formDisabled}
                    >
                      Create demo account
                    </Button>
                  </form>
                </fieldset>
              </CardBody>
            </Card>
          </>
        )}

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
