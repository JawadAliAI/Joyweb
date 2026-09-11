'use client';

/**
 * Identity verification hub (simulated).
 *
 * This platform is a paper-trading simulator. Nothing submitted here is
 * checked against any government registry, credit bureau or identity
 * provider — an operator of the demo simply marks a submission approved or
 * rejected. Every screen in this flow says so, and tells people not to upload
 * real identity documents.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, FileText, IdCard, ShieldCheck } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { DemoBadge, SimulationNotice } from '@/components/layout/DemoBadge';
import { KycStatusBadge } from '@/components/profile/KycStatusBadge';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Divider,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Skeleton,
} from '@/components/ui/primitives';
import type { KycOverview, KycStatus, KycSubmission } from '@/lib/kyc-types';
import { useKyc } from './hooks';

/** Explains, in plain words, why a level cannot be submitted right now. */
function blockedReason(
  status: KycStatus,
  { requiresBasic }: { requiresBasic: boolean },
  basicStatus: KycStatus,
): string {
  if (status === 'APPROVED') return 'This level is already verified.';
  if (status === 'PENDING') return 'Your submission is already under review.';
  if (requiresBasic && basicStatus !== 'APPROVED') {
    return 'Basic verification has to be approved before you can start this level.';
  }
  return 'This level is not available right now.';
}

function LevelCard({
  title,
  description,
  requirements,
  status,
  canSubmit,
  href,
  actionLabel,
  reviewNote,
  blocked,
  icon,
}: {
  title: string;
  description: string;
  requirements: string[];
  status: KycStatus;
  canSubmit: boolean;
  href: string;
  actionLabel: string;
  reviewNote: string | null;
  blocked: string;
  icon: ReactNode;
}) {
  const blockedId = `kyc-blocked-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <span aria-hidden className="text-muted">
              {icon}
            </span>
            {title}
          </span>
        }
        description={description}
        action={<KycStatusBadge status={status} />}
      />
      <CardBody className="space-y-3 pt-3">
        <ul className="space-y-1.5">
          {requirements.map((item) => (
            <li key={item} className="flex items-start gap-2 text-xs text-muted">
              <span aria-hidden className="mt-1.5 h-1 w-1 shrink-0 rounded-pill bg-subtle" />
              <span>{item}</span>
            </li>
          ))}
        </ul>

        {status === 'REJECTED' && reviewNote && (
          <p
            role="status"
            className="rounded-control bg-danger/10 px-3 py-2 text-xs leading-relaxed text-danger"
          >
            <span className="font-semibold">Reviewer note:</span> {reviewNote}
          </p>
        )}

        {canSubmit ? (
          // A real link, so it stays keyboard reachable and middle-clickable.
          <Link
            href={href}
            className="inline-flex w-full touch-target items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {actionLabel}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : (
          <>
            <Button fullWidth disabled aria-describedby={blockedId}>
              {actionLabel}
            </Button>
            <p id={blockedId} className="text-xs text-muted">
              {blocked}
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

function SubmissionRow({ submission }: { submission: KycSubmission }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">
          {submission.level === 'BASIC' ? 'Basic verification' : 'Advanced verification'}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Submitted {formatDateTime(submission.createdAt)}
          {submission.reviewedAt ? ` · Reviewed ${formatDateTime(submission.reviewedAt)}` : ''}
        </p>
        {submission.level === 'BASIC' && submission.documentNumber && (
          <p className="mt-0.5 truncate text-xs text-subtle">
            {submission.documentType === 'ID_CARD' ? 'ID card' : 'Licence'} ·{' '}
            <span className="font-mono">{submission.documentNumber}</span>
          </p>
        )}
        {submission.level === 'ADVANCED' && (
          <p className="mt-0.5 text-xs text-subtle">
            {[submission.hasFrontImage && 'front image', submission.hasBackImage && 'back image']
              .filter(Boolean)
              .join(', ') || 'no images stored'}
          </p>
        )}
        {submission.reviewNote && (
          <p className="mt-1 text-xs leading-relaxed text-muted">{submission.reviewNote}</p>
        )}
      </div>
      <KycStatusBadge status={submission.status} />
    </div>
  );
}

function KycContent({ data }: { data: KycOverview }) {
  const latestBasic = data.submissions.find((item) => item.level === 'BASIC') ?? null;
  const latestAdvanced = data.submissions.find((item) => item.level === 'ADVANCED') ?? null;

  return (
    <>
      {data.demoNotice && <SimulationNotice>{data.demoNotice}</SimulationNotice>}

      <LevelCard
        icon={<IdCard className="h-4 w-4" />}
        title="Basic verification"
        description="Your name and a document number."
        requirements={[
          'Full name as you want it shown on your account',
          'A licence number or ID card number (any placeholder value)',
          'Reviewed by our team',
        ]}
        status={data.basicStatus}
        canSubmit={data.canSubmitBasic}
        href="/profile/kyc/basic"
        actionLabel={data.basicStatus === 'REJECTED' ? 'Submit again' : 'Start basic verification'}
        reviewNote={latestBasic?.reviewNote ?? null}
        blocked={blockedReason(data.basicStatus, { requiresBasic: false }, data.basicStatus)}
      />

      <LevelCard
        icon={<FileText className="h-4 w-4" />}
        title="Advanced verification"
        description="Front and back images of a licence."
        requirements={[
          'Basic verification approved first',
          'A front image and a back image (JPEG, PNG or WebP, up to 5 MB each)',
          'Use placeholder or sample images — never a real document',
        ]}
        status={data.advancedStatus}
        canSubmit={data.canSubmitAdvanced}
        href="/profile/kyc/advanced"
        actionLabel={
          data.advancedStatus === 'REJECTED' ? 'Upload again' : 'Start advanced verification'
        }
        reviewNote={latestAdvanced?.reviewNote ?? null}
        blocked={blockedReason(data.advancedStatus, { requiresBasic: true }, data.basicStatus)}
      />

      <Card>
        <CardHeader title="Submission history" />
        <CardBody className="pt-1">
          {data.submissions.length === 0 ? (
            <EmptyState
              icon={<ShieldCheck className="h-6 w-6" aria-hidden />}
              title="No submissions yet"
              description="Once you submit a level it will appear here with its review status."
            />
          ) : (
            data.submissions.map((submission, index) => (
              <div key={submission.id}>
                {index > 0 && <Divider />}
                <SubmissionRow submission={submission} />
              </div>
            ))
          )}
        </CardBody>
      </Card>
    </>
  );
}

export default function KycPage() {
  const kyc = useKyc();

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Identity verification" backHref="/profile" action={<DemoBadge compact />} />
      <PageBody>
        <SimulationNotice tone="emphasis">
          <strong className="font-bold">Simulated verification.</strong> This is a demo
          paper-trading platform and performs no real identity verification. Nothing you submit is
          checked against any registry.{' '}
          <strong className="font-bold">Do not upload real identity documents</strong> — use
          placeholder or sample images and made-up numbers.
        </SimulationNotice>

        {kyc.isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
            <Card>
              <CardBody>
                <ListSkeleton rows={3} />
              </CardBody>
            </Card>
          </div>
        ) : kyc.isError || !kyc.data ? (
          <ErrorState
            title="Could not load your verification status"
            description={errorMessage(kyc.error)}
            onRetry={() => void kyc.refetch()}
          />
        ) : (
          <KycContent data={kyc.data} />
        )}
      </PageBody>
    </AppShell>
  );
}
