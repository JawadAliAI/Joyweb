'use client';

/**
 * Basic identity verification (simulated).
 *
 * The user picks a document kind and types a number. Nothing here is verified
 * against any registry — a demo operator approves or rejects it by hand — so
 * the screen asks for placeholder values rather than real document numbers.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, CreditCard, IdCard } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { DemoBadge, SimulationNotice } from '@/components/layout/DemoBadge';
import { KycStatusBadge } from '@/components/profile/KycStatusBadge';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import { FormError, FormSuccess, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { Button, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/primitives';
import type { KycDocumentType } from '@/lib/kyc-types';
import { useKyc, useSubmitBasicKyc } from '../hooks';

const DOCUMENT_OPTIONS: {
  value: KycDocumentType;
  title: string;
  numberLabel: string;
  hint: string;
  icon: typeof IdCard;
}[] = [
  {
    value: 'LICENSE',
    title: 'Driving licence',
    numberLabel: 'Licence number',
    hint: 'Any placeholder value, e.g. DEMO-1234.',
    icon: CreditCard,
  },
  {
    value: 'ID_CARD',
    title: 'ID card',
    numberLabel: 'ID card number',
    hint: 'Any placeholder value, e.g. DEMO-5678.',
    icon: IdCard,
  },
];

/** Turns the documented error codes into something a person can act on. */
function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'KYC_ALREADY_PENDING':
        return 'You already have a basic submission under review. Wait for it to be reviewed.';
      case 'KYC_ALREADY_APPROVED':
        return 'Basic verification is already approved on this demo account.';
      default:
        return error.message;
    }
  }
  return errorMessage(error, 'Your details could not be submitted. Please try again.');
}

export default function BasicKycPage() {
  const router = useRouter();
  const toast = useToast();
  const kyc = useKyc();
  const submit = useSubmitBasicKyc();

  const [documentType, setDocumentType] = useState<KycDocumentType>('LICENSE');
  const [fullName, setFullName] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selected = DOCUMENT_OPTIONS.find((option) => option.value === documentType)!;
  const status = kyc.data?.basicStatus ?? 'NOT_SUBMITTED';
  const canSubmit = kyc.data?.canSubmitBasic ?? false;

  // Redirect back to the hub shortly after a successful submission.
  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => router.push('/profile/kyc'), 1500);
    return () => window.clearTimeout(timer);
  }, [success, router]);

  const onSubmit = () => {
    const next: Record<string, string> = {};
    if (fullName.trim().length < 2) next.fullName = 'Enter your full name (at least 2 characters).';
    if (documentNumber.trim().length < 4) {
      next.documentNumber = `${selected.numberLabel} must be at least 4 characters.`;
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setFormError(null);
    setSuccess(null);
    submit.mutate(
      {
        fullName: fullName.trim(),
        documentType,
        documentNumber: documentNumber.trim(),
      },
      {
        onSuccess: () => {
          setSuccess('Submitted. A demo operator will review it — no real check is performed.');
          toast.success('Basic verification submitted');
        },
        onError: (error) => setFormError(submitErrorMessage(error)),
      },
    );
  };

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Basic verification" backHref="/profile/kyc" action={<DemoBadge compact />} />
      <PageBody>
        <SimulationNotice tone="emphasis">
          <strong className="font-bold">Simulated verification.</strong> This demo platform performs
          no real identity verification and checks nothing against any registry.{' '}
          <strong className="font-bold">Do not enter a real document number</strong> — use a
          placeholder value.
        </SimulationNotice>

        {kyc.isLoading ? (
          <Skeleton className="h-72 w-full" />
        ) : kyc.isError || !kyc.data ? (
          <ErrorState
            title="Could not load your verification status"
            description={errorMessage(kyc.error)}
            onRetry={() => void kyc.refetch()}
          />
        ) : (
          <>
            {kyc.data.demoNotice && <SimulationNotice>{kyc.data.demoNotice}</SimulationNotice>}

            <Card>
              <CardHeader
                title="Your details"
                description="Two things: what kind of document, and the name on the account."
                action={<KycStatusBadge status={status} />}
              />
              <CardBody className="space-y-5 pt-3">
                <fieldset disabled={!canSubmit || submit.isPending} className="space-y-2">
                  <legend className="text-sm font-medium text-fg">Document type</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {DOCUMENT_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const active = option.value === documentType;
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            'flex cursor-pointer touch-target items-center gap-3 rounded-control border px-3.5 py-3 transition-colors',
                            active
                              ? 'border-primary bg-primary/10'
                              : 'border-border bg-surface hover:bg-elevated',
                          )}
                        >
                          <input
                            type="radio"
                            name="documentType"
                            value={option.value}
                            checked={active}
                            onChange={() => {
                              setDocumentType(option.value);
                              setErrors((current) => ({ ...current, documentNumber: '' }));
                            }}
                            className="sr-only"
                          />
                          <Icon
                            className={cn('h-5 w-5 shrink-0', active ? 'text-primary' : 'text-muted')}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-fg">{option.title}</span>
                            <span className="block text-xs text-muted">{option.numberLabel}</span>
                          </span>
                          {active && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <Input
                  label={selected.numberLabel}
                  value={documentNumber}
                  inputMode="text"
                  autoComplete="off"
                  disabled={!canSubmit || submit.isPending}
                  error={errors.documentNumber || undefined}
                  hint={selected.hint}
                  onChange={(event) => setDocumentNumber(event.target.value)}
                />

                <Input
                  label="Full name"
                  value={fullName}
                  autoComplete="name"
                  disabled={!canSubmit || submit.isPending}
                  error={errors.fullName || undefined}
                  hint="At least 2 characters."
                  onChange={(event) => setFullName(event.target.value)}
                />

                <FormError message={formError} />
                <FormSuccess message={success} />

                {canSubmit ? (
                  <Button fullWidth loading={submit.isPending} onClick={onSubmit}>
                    Submit for review
                  </Button>
                ) : (
                  <>
                    <Button fullWidth disabled aria-describedby="basic-blocked">
                      Submit for review
                    </Button>
                    <p id="basic-blocked" className="text-xs text-muted">
                      {status === 'APPROVED'
                        ? 'Basic verification is already approved on this demo account.'
                        : status === 'PENDING'
                          ? 'Your submission is already under review.'
                          : 'Basic verification is not available right now.'}
                    </p>
                  </>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </PageBody>
    </AppShell>
  );
}
