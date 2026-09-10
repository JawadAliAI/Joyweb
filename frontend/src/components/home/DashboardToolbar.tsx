'use client';

/**
 * Dashboard greeting strip: who is signed in, what their simulated wallet holds
 * and the primary action.
 *
 * The reference design shows two wallet chips (spot and futures). This platform
 * has no futures product, so the second chip reports the balance that actually
 * matters for placing a demo position — free USDT.
 */
import Link from 'next/link';
import { ArrowDownToLine } from 'lucide-react';
import { DemoBadge } from '@/components/layout/DemoBadge';
import { Skeleton } from '@/components/ui/primitives';
import { usePortfolio, useSession } from '@/hooks/useSession';
import { cn, formatAmount } from '@/lib/format';

function WalletChip({
  label,
  value,
  loading,
  tone = 'default',
}: {
  label: string;
  value: string;
  loading?: boolean;
  tone?: 'default' | 'accent';
}) {
  return (
    <div className="rounded-control border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
      {loading ? (
        <Skeleton className="mt-1 h-4 w-20" />
      ) : (
        <p
          className={cn(
            'tabular text-sm font-semibold',
            tone === 'accent' ? 'text-primary' : 'text-fg',
          )}
        >
          {value}
        </p>
      )}
    </div>
  );
}

export function DashboardToolbar() {
  const { user, isLoading } = useSession();
  const portfolio = usePortfolio();

  const initials =
    user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U' : '';
  const usdt = portfolio.data?.assets.find((asset) => asset.asset === 'DEMO_USDT');
  const pricesDown = portfolio.data?.pricesAvailable === false;

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
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-fg">{user.fullName}</p>
              <DemoBadge compact />
            </div>
          )}
          <p className="truncate text-xs text-muted">{user?.email ?? 'Demo account'}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <WalletChip
          label="Demo wallet"
          loading={portfolio.isLoading}
          value={
            pricesDown ? 'Unavailable' : `$${formatAmount(portfolio.data?.totalEstimatedValue)}`
          }
        />
        <WalletChip
          label="Free to trade"
          loading={portfolio.isLoading}
          tone="accent"
          value={usdt ? `${formatAmount(usdt.available)} USDT` : '—'}
        />
        <Link
          href="/assets/deposit"
          className={cn(
            'inline-flex touch-target items-center gap-2 rounded-pill bg-primary px-4',
            'text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
          )}
        >
          Deposit
          <ArrowDownToLine className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
