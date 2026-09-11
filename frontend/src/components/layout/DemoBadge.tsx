'use client';

/**
 * Account notices.
 *
 * Two of the exports here are intentionally inert: `DemoBadge` and
 * `SimulationNotice` render nothing, so the many call sites across the customer
 * app need no edits while the "demo / simulated" framing is not shown. The file
 * keeps their signatures so those imports keep type-checking. `RestrictionNotice`
 * and `FeatureDisabledNotice` are real, user-facing account notices.
 */
import type { ReactNode } from 'react';

/** Intentionally renders nothing — the visible demo badge has been removed. */
export function DemoBadge(_props: { className?: string; compact?: boolean }): null {
  return null;
}

/** Intentionally renders nothing — the inline simulation banners are removed. */
export function SimulationNotice(_props: {
  children?: ReactNode;
  tone?: 'info' | 'emphasis';
  className?: string;
}): null {
  return null;
}

/** Shown at the top of a restricted account's screens. */
export function RestrictionNotice({ reason }: { reason?: string | null }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <p className="font-semibold">Your account is currently restricted.</p>
      <p className="mt-1 text-xs leading-relaxed text-danger/90">
        {reason || 'Trading, transfers, withdrawals and conversions are unavailable.'} You can
        still sign in, review your account and contact support.
      </p>
    </div>
  );
}

/**
 * Shown when an admin has switched a capability off.
 *
 * `hint` is the second line. It defaults to the generic "check back later"
 * because most callers pass a one-line message; pass `null` when the message
 * already says everything, so the notice does not repeat itself.
 */
export function FeatureDisabledNotice({
  message,
  hint = 'Please check back later.',
}: {
  message: string;
  hint?: string | null;
}) {
  return (
    <div
      role="status"
      className="rounded-card border border-border bg-card px-4 py-6 text-center"
    >
      <p className="text-sm font-medium text-fg">{message}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
