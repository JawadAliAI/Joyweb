'use client';

/**
 * Home.
 *
 * Everything on this screen belongs to the signed-in user and is read from the
 * API — the greeting, the balance, the prices and the activity list. Nothing
 * is hard-coded, and the simulation is labelled in three places.
 */
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { AppShell, PageBody } from '@/components/layout/AppShell';
import { DemoBadge, SimulationNotice } from '@/components/layout/DemoBadge';
import { MarketTicker } from '@/components/market/MarketTicker';
import {
  Card, CardHeader, EmptyState, ErrorState, ListSkeleton, Skeleton,
} from '@/components/ui/primitives';
import { useSession, useTransactions } from '@/hooks/useSession';
import { errorMessage } from '@/lib/api';
import { cn, formatAmount, timeAgo, transactionLabel } from '@/lib/format';

function RecentActivity() {
  const { data, isLoading, isError, error, refetch } = useTransactions({ pageSize: 5 });

  return (
    <Card>
      <CardHeader
        title="Recent activity"
        action={
          <Link
            href="/profile/history"
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all
          </Link>
        }
      />
      <div className="p-4 pt-3">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : isError ? (
          <ErrorState
            title="Activity unavailable"
            description={errorMessage(error, 'Your transaction history could not be loaded.')}
            onRetry={() => void refetch()}
          />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Your simulated deposits, trades and transfers will appear here."
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {data.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">
                    {transactionLabel(item.type)}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {timeAgo(item.createdAt)} · {item.status.toLowerCase()}
                  </p>
                </div>
                <p className="tabular shrink-0 text-sm text-fg">
                  {formatAmount(item.amount)}{' '}
                  <span className="text-xs text-muted">{item.asset}</span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export default function HomePage() {
  const { user, isLoading } = useSession();

  return (
    <AppShell>
      <PageBody>
        <header className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            {isLoading || !user ? (
              <Skeleton className="h-6 w-48" />
            ) : (
              <h1 className="text-lg font-semibold text-fg">
                Welcome back, {user.firstName}
              </h1>
            )}
            <DemoBadge />
          </div>
          <p className="text-xs text-muted">Demo Account</p>
        </header>

        <section aria-label="Market prices">
          <MarketTicker />
        </section>

        <SimulationNotice>
          <span className="flex flex-wrap items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden />
            Start your simulated trading journey — all balances, orders and transfers on this
            platform are practice only. No real funds move and no blockchain transaction is
            created.
          </span>
        </SimulationNotice>

        <RecentActivity />
      </PageBody>
    </AppShell>
  );
}
