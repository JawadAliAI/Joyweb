'use client';

/**
 * Request a password reset link. The response is deliberately identical
 * whether or not the address exists, so this page never reveals which
 * accounts are registered.
 */
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useMutation } from '@tanstack/react-query';
import { usePlatform } from '@/components/providers';
import { DemoBadge } from '@/components/layout/DemoBadge';
import { api, errorMessage } from '@/lib/api';
import { FormError, FormSuccess, Input } from '@/components/ui/form';
import { Button, Card, CardBody } from '@/components/ui/primitives';

export default function ForgotPasswordPage() {
  const { config } = usePlatform();
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const request = useMutation({
    mutationFn: (body: { email: string }) =>
      api.post<Record<string, never>>('/auth/forgot-password', body),
    onSuccess: () => setSent(true),
    onError: (error) => setFormError(errorMessage(error)),
  });

  const submit = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailError(null);
    setFormError(null);
    request.mutate({ email: email.trim() });
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
          <h1 className="text-lg font-semibold text-fg">Reset your password</h1>
          <DemoBadge />
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
                autoComplete="email"
                value={email}
                error={emailError}
                hint="We will send a reset link if this address has a demo account."
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (emailError) setEmailError(null);
                }}
              />
              <FormError message={formError} />
              <FormSuccess
                message={
                  sent
                    ? 'If that address has a demo account, a reset link is on its way. Check your inbox.'
                    : null
                }
              />
              <Button type="submit" fullWidth size="lg" loading={request.isPending}>
                Send reset link
              </Button>
            </form>
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
