'use client';

/**
 * Home — the customer dashboard.
 *
 * Layout follows the reference design: a greeting strip with wallet chips, a
 * row of summary cards, then the quick trade ticket, the gainers/losers card
 * and the market table, with recent activity in a side rail that drops
 * underneath on narrow screens.
 *
 * Every figure on this screen is read from the API — the user's own balances,
 * the platform's own markets, and real candles from the public price feed. Two
 * panels in the reference could not be reproduced honestly and were replaced
 * rather than filled with plausible-looking numbers: global market cap and BTC
 * dominance (no supply data behind the price feed) and a per-coin market cap
 * column. See the notes in StatCards and MarketBoard.
 */
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardToolbar } from '@/components/home/DashboardToolbar';
import { MarketBoard } from '@/components/home/MarketBoard';
import { MarketMovers } from '@/components/home/MarketMovers';
import { QuickTrade } from '@/components/home/QuickTrade';
import { StatCards } from '@/components/home/StatCards';
import {
  Card, CardHeader, EmptyState, ErrorState, ListSkeleton,
} from '@/components/ui/primitives';
import { useMarkets } from '@/hooks/useMarkets';
import { useTransactions } from '@/hooks/useSession';
import { errorMessage } from '@/lib/api';
import { assetLabel, formatAmount, timeAgo, transactionLabel } from '@/lib/format';

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
            description="Your deposits, trades and transfers will appear here."
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
                  <span className="text-xs text-muted">{assetLabel(item.asset)}</span>
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
  const markets = useMarkets();
  const rows = markets.data?.items ?? [];

  return (
    <AppShell>
      <div className="space-y-4 py-4">
        {/* Below lg the header has no room for the account strip, so the
            page carries it instead. */}
        <div className="lg:hidden">
          <DashboardToolbar />
        </div>

        <StatCards />

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          {/* Main column: the trade ticket, movers, then the market table. */}
          <div className="min-w-0 space-y-4">
            <QuickTrade />

            <MarketMovers markets={rows} loading={markets.isLoading} />

            <MarketBoard
              markets={rows}
              loading={markets.isLoading}
              dataAvailable={markets.data?.dataAvailable ?? true}
              message={markets.data?.message}
            />
          </div>

          {/* Side rail: the account's own recent activity. */}
          <div className="min-w-0 space-y-4">
            <RecentActivity />
          </div>
        </div>
      </div>
    </AppShell>
  );
}
