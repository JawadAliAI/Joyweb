'use client';

/**
 * Reason-gated confirmation.
 *
 * The backend refuses any destructive or balance-changing action without a
 * non-empty reason, and records that reason in the audit log alongside the old
 * and new values. This dialog enforces the same rule in the UI so an operator
 * finds out before submitting, not after.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/overlay';
import { Button } from '@/components/ui/primitives';
import { Textarea } from '@/components/ui/form';
import { FormError } from '@/components/ui/form';

export function ReasonDialog({
  open,
  onClose,
  onSubmit,
  title,
  description,
  details,
  extraFields,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  loading,
  error,
  footnote,
  reasonLabel = 'Reason (required)',
  reasonHint = 'Recorded in the audit log with your identity and the old and new values.',
  disabled,
}: {
  open: boolean;
  onClose: () => void;
  /** Called only with a non-empty, trimmed reason. */
  onSubmit: (reason: string) => void;
  title: string;
  description?: string;
  /** Review rows shown above the reason box. */
  details?: ReactNode;
  /** Action-specific inputs (asset, amount, score…) owned by the caller. */
  extraFields?: ReactNode;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  /** Server error message to surface inside the dialog. */
  error?: string | null;
  footnote?: ReactNode;
  reasonLabel?: string;
  reasonHint?: string;
  /** Blocks submission for caller-side validation of `extraFields`. */
  disabled?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setReason('');
      setTouched(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const reasonError = touched && trimmed.length === 0 ? 'A reason is required.' : null;

  const submit = () => {
    setTouched(true);
    if (trimmed.length === 0 || disabled) return;
    onSubmit(trimmed);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            fullWidth
            onClick={submit}
            loading={loading}
            disabled={trimmed.length === 0 || disabled}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {details}
        {extraFields}
        <Textarea
          label={reasonLabel}
          hint={reasonHint}
          value={reason}
          error={reasonError}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={2000}
          required
          placeholder="Explain why this action is being taken."
        />
        <FormError message={error} />
        {footnote && <p className="text-xs text-muted">{footnote}</p>}
      </div>
    </Modal>
  );
}
