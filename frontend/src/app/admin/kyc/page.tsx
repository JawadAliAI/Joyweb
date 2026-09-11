'use client';

/**
 * Identity verification (KYC) review queue.
 *
 * Customers verify in two levels: basic (name and document number), then
 * advanced (front and back photos of the document). Each submission waits here
 * as PENDING until an administrator approves or rejects it. Both need a reason:
 * it is written to the audit log and sent to the customer, and a rejected
 * customer sees it on their verification screen and can submit again.
 * Advanced verification only opens once basic has been approved.
 */
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, api, errorMessage } from '@/lib/api';
import { accountContact, formatDateTime } from '@/lib/format';
import type { AdminPage } from '@/lib/admin-types';
import type { KycSubmission } from '@/lib/kyc-types';
import { Badge, Button, DataRow, Divider } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlay';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

/** One submission in the queue, with the account that sent it. */
interface AdminKycSubmission extends Omit<KycSubmission, 'fullName' | 'documentNumber'> {
  /** Basic submissions only. */
  fullName: string | null;
  documentNumber: string | null;
  userId: string;
  email: string;
  username: string;
}

interface KycReviewResult {
  submission: KycSubmission;
  reason: string;
  demoNotice: string;
}

type ReviewKind = 'approve' | 'reject';

const TABS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

const DOCUMENT_LABELS: Record<string, string> = {
  ID_CARD: 'ID card',
  LICENSE: "Driver's license",
};

function statusTone(status: string): 'success' | 'danger' | 'warning' | 'neutral' {
  if (status === 'APPROVED') return 'success';
  if (status === 'REJECTED') return 'danger';
  if (status === 'PENDING') return 'warning';
  return 'neutral';
}

function levelLabel(level: string): string {
  return level === 'ADVANCED' ? 'Advanced · ID photos' : 'Basic · details';
}

function documentSummary(row: AdminKycSubmission): string {
  if (row.level === 'ADVANCED') {
    const sides = [row.hasFrontImage && 'front', row.hasBackImage && 'back'].filter(Boolean);
    return sides.length ? `Photos: ${sides.join(' and ')}` : 'No photos attached';
  }
  const type = row.documentType ? (DOCUMENT_LABELS[row.documentType] ?? row.documentType) : null;
  return [row.fullName, type && row.documentNumber ? `${type} ${row.documentNumber}` : type]
    .filter(Boolean)
    .join(' · ');
}

function DocumentImage({ row, side }: { row: AdminKycSubmission; side: 'front' | 'back' }) {
  // Same-origin through the /api proxy, so the admin's session cookie goes
  // with it; the backend serves these images to the owner and to admins only.
  const src = `${API_BASE}/kyc/documents/${encodeURIComponent(row.id)}/${side}`;
  const label = side === 'front' ? 'Front' : 'Back';
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-medium text-muted">{label}</figcaption>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        title="Open full size"
        className="block overflow-hidden rounded-control border border-border bg-surface"
      >
        <Image
          src={src}
          alt={`${label} of the submitted document`}
          width={640}
          height={400}
          unoptimized
          className="h-auto w-full object-contain"
        />
      </a>
    </figure>
  );
}

function SubmissionDetails({ row }: { row: AdminKycSubmission }) {
  const documentType = row.documentType
    ? (DOCUMENT_LABELS[row.documentType] ?? row.documentType)
    : null;
  return (
    <div className="space-y-4">
      <div className="rounded-control bg-surface px-3 py-1">
        <DataRow label="Customer" value={row.username} tone="strong" />
        <Divider />
        <DataRow label="Contact" value={accountContact(row)} />
        <Divider />
        <DataRow label="Level" value={levelLabel(row.level)} />
        <Divider />
        <DataRow label="Status" value={<Badge tone={statusTone(row.status)}>{row.status}</Badge>} />
        <Divider />
        <DataRow label="Submitted" value={formatDateTime(row.createdAt)} />
        {row.fullName && (
          <>
            <Divider />
            <DataRow label="Full name" value={row.fullName} tone="strong" />
          </>
        )}
        {documentType && (
          <>
            <Divider />
            <DataRow label="Document" value={documentType} />
          </>
        )}
        {row.documentNumber && (
          <>
            <Divider />
            <DataRow label="Document number" value={row.documentNumber} />
          </>
        )}
        {row.reviewedAt && (
          <>
            <Divider />
            <DataRow label="Reviewed" value={formatDateTime(row.reviewedAt)} />
          </>
        )}
      </div>

      {(row.hasFrontImage || row.hasBackImage) && (
        <div className="grid gap-3">
          {row.hasFrontImage && <DocumentImage row={row} side="front" />}
          {row.hasBackImage && <DocumentImage row={row} side="back" />}
        </div>
      )}

      {row.reviewNote && (
        <p className="rounded-control bg-surface px-3 py-2 text-xs text-muted">
          <span className="font-semibold text-fg">Review reason:</span> {row.reviewNote}
        </p>
      )}
    </div>
  );
}

export default function AdminKycPage() {
  useAdminPage('Verification (KYC)', 'Approve or reject identity verification sent by customers');

  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('PENDING');
  const [viewing, setViewing] = useState<AdminKycSubmission | null>(null);
  const [target, setTarget] = useState<AdminKycSubmission | null>(null);
  const [action, setAction] = useState<ReviewKind | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const table = useTableState();
  const { resetPage } = table;

  useEffect(() => {
    resetPage();
  }, [status, resetPage]);

  const query = useQuery({
    queryKey: ['admin', 'kyc', status, table.page],
    queryFn: () =>
      api.get<AdminPage<AdminKycSubmission>>('/admin/kyc', {
        page: table.page,
        pageSize: 20,
        // The endpoint filters by an exact status; "All" is simply no filter.
        ...(status === 'ALL' ? {} : { status }),
      }),
    placeholderData: (previous) => previous,
  });

  const startReview = (row: AdminKycSubmission, kind: ReviewKind) => {
    setViewing(null);
    setTarget(row);
    setAction(kind);
    setDialogError(null);
  };

  const closeReview = () => {
    setTarget(null);
    setAction(null);
    setDialogError(null);
  };

  const review = useMutation({
    mutationFn: ({ id, kind, reason }: { id: string; kind: ReviewKind; reason: string }) =>
      api.post<KycReviewResult>(`/admin/kyc/${encodeURIComponent(id)}/${kind}`, { reason }),
    onSuccess: (result, variables) => {
      toast.success(
        variables.kind === 'approve' ? 'Verification approved' : 'Verification rejected',
        'The customer has been notified.',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'kyc'] });
      closeReview();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setDialogError(message);
      toast.error('Review failed', message);
    },
  });

  const columns: Column<AdminKycSubmission>[] = [
    {
      key: 'user',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.username}</p>
          <p className="truncate text-xs text-muted">{accountContact(row)}</p>
        </div>
      ),
    },
    {
      key: 'level',
      header: 'Level',
      render: (row) => <Badge tone="neutral">{levelLabel(row.level)}</Badge>,
    },
    {
      key: 'details',
      header: 'Details',
      hideOnMobile: true,
      render: (row) => (
        <span className="block max-w-[260px] truncate text-muted">{documentSummary(row)}</span>
      ),
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setViewing(row)}
            aria-label={`View verification from ${row.username}`}
          >
            View
          </Button>
          {row.status === 'PENDING' && (
            <>
              <Button
                size="sm"
                onClick={() => startReview(row, 'approve')}
                aria-label={`Approve verification from ${row.username}`}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => startReview(row, 'reject')}
                aria-label={`Reject verification from ${row.username}`}
              >
                Reject
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="rounded-card bg-primary/10 px-4 py-3 text-xs text-primary">
        Customers verify in two steps: <strong>Basic</strong> (name and document number), then{' '}
        <strong>Advanced</strong> (photos of the document). Advanced opens only after Basic is
        approved. Every decision needs a reason — the customer is notified with it, and it is
        recorded in the audit log.
      </p>

      <Tabs items={TABS} value={status} onChange={setStatus} ariaLabel="Verification status" />

      <DataTable<AdminKycSubmission>
        caption="Identity verification submissions"
        columns={columns}
        rows={query.data?.items ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle={
          status === 'PENDING' ? 'Nothing waiting for review' : 'No verification submissions here'
        }
        emptyDescription="Customer submissions appear here as soon as they are sent."
        meta={query.data?.meta ?? null}
        onPageChange={table.setPage}
      />

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title="Verification submission"
        description={viewing ? `${viewing.username} · ${levelLabel(viewing.level)}` : undefined}
        footer={
          viewing?.status === 'PENDING' ? (
            <div className="flex gap-3">
              <Button variant="danger" fullWidth onClick={() => startReview(viewing, 'reject')}>
                Reject
              </Button>
              <Button fullWidth onClick={() => startReview(viewing, 'approve')}>
                Approve
              </Button>
            </div>
          ) : undefined
        }
      >
        {viewing && <SubmissionDetails row={viewing} />}
      </Modal>

      <ReasonDialog
        open={Boolean(target && action)}
        onClose={closeReview}
        onSubmit={(reason) => {
          if (!target || !action) return;
          review.mutate({ id: target.id, kind: action, reason });
        }}
        title={action === 'reject' ? 'Reject verification' : 'Approve verification'}
        description={
          action === 'reject'
            ? 'The customer is shown this reason on their verification screen and can submit again.'
            : 'The customer is notified that this level is verified, with your reason.'
        }
        confirmLabel={action === 'reject' ? 'Reject' : 'Approve'}
        confirmVariant={action === 'reject' ? 'danger' : 'primary'}
        loading={review.isPending}
        error={dialogError}
        footnote="Every review is recorded in the audit log."
        details={
          target ? (
            <div className="rounded-control bg-surface px-3 py-1">
              <DataRow label="Customer" value={target.username} />
              <Divider />
              <DataRow label="Level" value={levelLabel(target.level)} />
              <Divider />
              <DataRow label="Details" value={documentSummary(target) || '—'} />
            </div>
          ) : null
        }
      />
    </div>
  );
}
