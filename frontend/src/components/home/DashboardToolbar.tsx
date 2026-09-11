'use client';

/**
 * Dashboard greeting strip: who is signed in, and the primary action.
 *
 * Balance figures live only on the Assets page, so this strip carries the
 * account identity and the Deposit action, not wallet totals.
 */
import { ArrowDownToLine } from 'lucide-react';
import { DepositButton } from '@/components/wallet/DepositDialog';
import { Skeleton } from '@/components/ui/primitives';
import { useSession } from '@/hooks/useSession';
import { accountContact, cn } from '@/lib/format';

export function DashboardToolbar() {
  const { user, isLoading } = useSession();

  const initials =
    user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U' : '';

  return (
    <section className="flex flex-wrap items-center gap-3" aria-label="Account summary">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary"
        >
          {initials}
        </span>
        <div className="min-w-0">
          {isLoading || !user ? (
            <Skeleton className="h-4 w-36" />
          ) : (
            <p className="truncate text-sm font-semibold text-fg">{user.fullName}</p>
          )}
          <p className="truncate text-xs text-muted">{user ? accountContact(user) : 'Account'}</p>
        </div>
      </div>

      <DepositButton
        className={cn(
          'inline-flex touch-target items-center gap-2 rounded-pill bg-primary px-4',
          'text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
        )}
      >
        Deposit
        <ArrowDownToLine className="h-4 w-4" aria-hidden />
      </DepositButton>
    </section>
  );
}
