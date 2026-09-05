/**
 * Status pill for a simulated KYC review stage.
 *
 * "Verified" here means an operator of this demo clicked approve — it is not
 * evidence that any identity was actually checked.
 */
import { Badge } from '@/components/ui/primitives';
import type { KycStatus } from '@/lib/kyc-types';

type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning';

const STATUS_META: Record<KycStatus, { label: string; tone: BadgeTone }> = {
  NOT_SUBMITTED: { label: 'Not started', tone: 'neutral' },
  PENDING: { label: 'Under review', tone: 'warning' },
  APPROVED: { label: 'Verified', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export function kycStatusLabel(status: KycStatus): string {
  return STATUS_META[status].label;
}

export function KycStatusBadge({
  status,
  className,
}: {
  status: KycStatus;
  className?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={className}>
      {meta.label}
    </Badge>
  );
}
