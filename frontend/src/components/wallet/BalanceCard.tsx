'use client';

/**
 * Total balance card.
 *
 * The figure is always the signed-in user's own simulated portfolio value from
 * `/api/wallet` — nothing here is hard-coded. The hide/show preference is a
 * per-device convenience and lives in localStorage only.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Eye, EyeOff, Repeat, RotateCw,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePortfolio } from '@/hooks/useSession';
import { errorMessage } from '@/lib/api';
import { cn, formatAmount } from '@/lib/format';
import { BalanceSkeleton, Card, ErrorState } from '@/components/ui/primitives';

const STORAGE_KEY = 'cd:balance-hidden';

interface QuickAction {
  href: string;
  label: string;
  icon: LucideIcon;
}

const ACTIONS: QuickAction[] = [
  { href: '/assets/deposit', label: 'Deposit', icon: ArrowDownToLine },
  { href: '/assets/withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
  { href: '/assets/convert', label: 'Convert', icon: Repeat },
  { href: '/assets/transfer', label: 'Transfer', icon: ArrowLeftRight },
];

export function BalanceCard({ className }: { className?: string }) {
  const { data, isLoading, isError, error, refetch, isFetching } = usePortfolio();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(STORAGE_KEY) === '1');
    } catch {
      /* storage unavailable — fall back to visible */
    }
  }, []);

  const toggleHidden = useCallback(() => {
    setHidden((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <Card className={cn('p-4', className)}>
        <BalanceSkeleton />
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className={className}>
        <ErrorState
          title="Balance unavailable"
          description={errorMessage(error, 'Your simulated balance could not be loaded.')}
          onRetry={() => void refetch()}
        />
      </Card>
    );
  }

  const label = `Balance(${data.displayCurrency})`;

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        <button
          type="button"
          onClick={toggleHidden}
          aria-pressed={hidden}
          aria-label={hidden ? 'Show balance' : 'Hide balance'}
          className="flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:text-fg"
        >
          {hidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => void refetch()}
          aria-label="Refresh balance"
          className="flex h-8 w-8 items-center justify-center rounded-control text-muted transition-colors hover:text-fg"
        >
          <RotateCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden />
        </button>
      </div>

      <p
        className="tabular mt-1 text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.02em] text-fg"
        aria-live="polite"
      >
        {hidden ? '••••••' : formatAmount(data.totalEstimatedValue)}
      </p>
      <p className="mt-1 text-xs text-subtle">
        Simulated portfolio value · {data.demoLabel}
      </p>

      {!data.pricesAvailable && (
        <p className="mt-2 text-[11px] leading-relaxed text-warning">
          Estimated values exclude assets with no live price right now.
        </p>
      )}

      <nav aria-label="Wallet actions" className="mt-5">
        <ul className="grid grid-cols-4 gap-2">
          {ACTIONS.map((action) => (
            <li key={action.href}>
              <Link
                href={action.href}
                className="flex touch-target flex-col items-center gap-1.5 rounded-control py-1 text-[11px] font-medium text-muted transition-colors hover:text-fg"
              >
                <span
                  aria-hidden
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground"
                >
                  <action.icon className="h-5 w-5" />
                </span>
                {action.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </Card>
  );
}
