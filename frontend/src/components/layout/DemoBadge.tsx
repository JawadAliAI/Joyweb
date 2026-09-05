'use client';

/**
 * Simulation indicators.
 *
 * These are deliberately hard to miss and hard to remove: the badge sits in
 * the header on every screen, and `SimulationNotice` prefixes every flow that
 * moves simulated funds. Nothing in this product represents real money, real
 * custody, or a real blockchain transaction, and the interface says so.
 */
import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import { cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';

export function DemoBadge({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { config } = usePlatform();
  if (!config.demoMode) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill bg-warning/15 font-bold uppercase tracking-wider text-warning',
        compact ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[10px]',
        className,
      )}
    >
      {config.demoLabel}
    </span>
  );
}

/** Inline explanatory banner for deposit / withdraw / trade flows. */
export function SimulationNotice({
  children,
  tone = 'info',
  className,
}: {
  children: ReactNode;
  tone?: 'info' | 'warning';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-card px-3.5 py-3 text-xs leading-relaxed',
        tone === 'warning'
          ? 'bg-warning/10 text-warning'
          : 'bg-elevated text-muted',
        className,
      )}
    >
      <Info className="mt-px h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

/** Shown at the top of a restricted account's screens. */
export function RestrictionNotice({ reason }: { reason?: string | null }) {
  return (
    <div
      role="alert"
      className="rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
    >
      <p className="font-semibold">Your demo account is currently restricted.</p>
      <p className="mt-1 text-xs leading-relaxed text-danger/90">
        {reason || 'Trading, transfers, withdrawals and conversions are unavailable.'} You can
        still sign in, review your account and contact support.
      </p>
    </div>
  );
}

/** Shown when an admin has switched a capability off. */
export function FeatureDisabledNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-card border border-border bg-card px-4 py-6 text-center"
    >
      <p className="text-sm font-medium text-fg">{message}</p>
      <p className="mt-1 text-xs text-muted">Please check back later.</p>
    </div>
  );
}
