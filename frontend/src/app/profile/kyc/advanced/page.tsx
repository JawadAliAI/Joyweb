'use client';

/**
 * Advanced identity verification (simulated).
 *
 * Two images go up as multipart/form-data. Nothing is read from them, nothing
 * is matched against a person, and no real verification happens — so the
 * screen repeatedly asks for placeholder or sample images rather than real
 * identity documents. Client-side type/size checks are a convenience; the
 * server checks again.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { DemoBadge, SimulationNotice } from '@/components/layout/DemoBadge';
import { KycStatusBadge } from '@/components/profile/KycStatusBadge';
import { ApiError, errorMessage } from '@/lib/api';
import { FormError, FormSuccess } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { Button, Card, CardBody, CardHeader, ErrorState, Skeleton } from '@/components/ui/primitives';
import type { KycDocumentSide } from '@/lib/kyc-types';
import { useKyc, useSubmitAdvancedKyc } from '../hooks';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Returns a message when the file is unusable, or null when it is fine. */
function validateFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return 'That file type is not supported. Choose a JPEG, PNG or WebP image.';
  }
  if (file.size > MAX_BYTES) {
    return `That image is ${formatBytes(file.size)}. The limit is 5 MB.`;
  }
  return null;
}

interface PickedFile {
  file: File;
  previewUrl: string;
}

function FilePicker({
  side,
  label,
  description,
  picked,
  error,
  disabled,
  onPick,
  onClear,
}: {
  side: KycDocumentSide;
  label: string;
  description: string;
  picked: PickedFile | null;
  error?: string;
  disabled: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `kyc-${side}-image`;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-fg">
        {label}
      </label>
      <p id={hintId} className="text-xs text-muted">
        {description} JPEG, PNG or WebP, up to 5 MB. Use a placeholder or sample image — never a
        real document.
      </p>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        disabled={disabled}
        aria-describedby={error ? `${hintId} ${errorId}` : hintId}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          // Allow re-picking the same file after a removal.
          event.target.value = '';
        }}
        className="block w-full touch-target cursor-pointer rounded-control border border-border bg-surface text-sm text-muted file:mr-3 file:h-11 file:cursor-pointer file:border-0 file:bg-elevated file:px-4 file:text-sm file:font-semibold file:text-fg disabled:cursor-not-allowed disabled:opacity-60"
      />

      {picked && (
        <div className="flex items-center gap-3 rounded-control bg-surface p-2.5">
          {/* Local object URL — the file never leaves the browser until submit. */}
          <img
            src={picked.previewUrl}
            alt={`Preview of the ${side} image you selected`}
            className="h-16 w-16 shrink-0 rounded-control object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-fg">{picked.file.name}</p>
            <p className="text-xs text-muted">{formatBytes(picked.file.size)}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={onClear}
            aria-label={`Remove the ${side} image`}
          >
            <X className="h-4 w-4" aria-hidden />
            Remove
          </Button>
        </div>
      )}

      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case 'BASIC_KYC_REQUIRED':
        return 'Basic verification has to be approved before you can upload documents.';
      case 'KYC_ALREADY_PENDING':
        return 'You already have an advanced submission under review.';
      case 'KYC_ALREADY_APPROVED':
        return 'Advanced verification is already approved on this demo account.';
      case 'FILE_TOO_LARGE':
        return 'One of the images is larger than the 5 MB limit. Choose a smaller image.';
      case 'UNSUPPORTED_FILE_TYPE':
        return 'One of the files is not a supported image. Use JPEG, PNG or WebP.';
      default:
        return error.message;
    }
  }
  return errorMessage(error, 'Your documents could not be uploaded. Please try again.');
}

export default function AdvancedKycPage() {
  const router = useRouter();
  const toast = useToast();
  const kyc = useKyc();
  const submit = useSubmitAdvancedKyc();

  const [front, setFront] = useState<PickedFile | null>(null);
  const [back, setBack] = useState<PickedFile | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ front?: string; back?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const status = kyc.data?.advancedStatus ?? 'NOT_SUBMITTED';
  const canSubmit = kyc.data?.canSubmitAdvanced ?? false;
  const locked = !canSubmit || submit.isPending;

  // Object URLs are revoked as soon as the preview they back goes away.
  useEffect(
    () => () => {
      if (front) URL.revokeObjectURL(front.previewUrl);
    },
    [front],
  );
  useEffect(
    () => () => {
      if (back) URL.revokeObjectURL(back.previewUrl);
    },
    [back],
  );

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => router.push('/profile/kyc'), 1500);
    return () => window.clearTimeout(timer);
  }, [success, router]);

  const pick = useCallback(
    (side: KycDocumentSide, file: File) => {
      const problem = validateFile(file);
      setFieldErrors((current) => ({ ...current, [side]: problem ?? undefined }));
      if (problem) return;
      const next: PickedFile = { file, previewUrl: URL.createObjectURL(file) };
      if (side === 'front') setFront(next);
      else setBack(next);
    },
    [],
  );

  const onSubmit = () => {
    const next: { front?: string; back?: string } = {};
    if (!front) next.front = 'Choose a front image.';
    if (!back) next.back = 'Choose a back image.';
    setFieldErrors(next);
    if (!front || !back) return;

    setFormError(null);
    setSuccess(null);
    submit.mutate(
      { frontImage: front.file, backImage: back.file },
      {
        onSuccess: () => {
          setSuccess('Uploaded. A demo operator will review it — no real check is performed.');
          toast.success('Documents submitted');
        },
        onError: (error) => setFormError(submitErrorMessage(error)),
      },
    );
  };

  return (
    <AppShell hideBottomNav>
      <PageHeader
        title="Advanced verification"
        backHref="/profile/kyc"
        action={<DemoBadge compact />}
      />
      <PageBody>
        <SimulationNotice tone="warning">
          <strong className="font-bold">Simulated verification.</strong> This demo platform performs
          no real identity verification — uploaded images are not read, matched or checked against
          anything. <strong className="font-bold">Do not upload real identity documents.</strong>{' '}
          Use placeholder or sample images.
        </SimulationNotice>

        {kyc.isLoading ? (
          <Skeleton className="h-80 w-full" />
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
                title="Document images"
                description="Both sides are submitted together."
                action={<KycStatusBadge status={status} />}
              />
              <CardBody className="space-y-6 pt-3">
                <FilePicker
                  side="front"
                  label="Front of licence"
                  description="The side with the photo."
                  picked={front}
                  error={fieldErrors.front}
                  disabled={locked}
                  onPick={(file) => pick('front', file)}
                  onClear={() => setFront(null)}
                />
                <FilePicker
                  side="back"
                  label="Back of licence"
                  description="The reverse side."
                  picked={back}
                  error={fieldErrors.back}
                  disabled={locked}
                  onPick={(file) => pick('back', file)}
                  onClear={() => setBack(null)}
                />

                <FormError message={formError} />
                <FormSuccess message={success} />

                {canSubmit ? (
                  <Button fullWidth loading={submit.isPending} onClick={onSubmit}>
                    <Upload className="h-4 w-4" aria-hidden />
                    Upload for review
                  </Button>
                ) : (
                  <>
                    <Button fullWidth disabled aria-describedby="advanced-blocked">
                      Upload for review
                    </Button>
                    <p id="advanced-blocked" className="text-xs text-muted">
                      {status === 'APPROVED'
                        ? 'Advanced verification is already approved on this demo account.'
                        : status === 'PENDING'
                          ? 'Your submission is already under review.'
                          : kyc.data.basicStatus !== 'APPROVED'
                            ? 'Basic verification has to be approved before you can upload documents.'
                            : 'Advanced verification is not available right now.'}
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
