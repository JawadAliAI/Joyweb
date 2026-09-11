'use client';

/**
 * Administration dashboard.
 *
 * Every figure comes from `GET /admin/dashboard`. All of them describe
 * simulated activity — no real funds exist anywhere in this product.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Activity, CircleDollarSign, LifeBuoy, Snowflake, TrendingUp, UserCheck, Users, Wallet,
} from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatAmount, formatDate } from '@/lib/format';
import type { AdminDashboard, AssetTotal } from '@/lib/admin-types';
import { Card, CardBody, CardHeader, ErrorState } from '@/components/ui/primitives';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { MetricCard } from '@/components/admin/MetricCard';
import { SimpleChart } from '@/components/admin/SimpleChart';

// A Next.js page module may only export the default component and framework
// fields, so this query key stays module-private.
const adminDashboardKey = ['admin', 'dashboard'] as const;

function sumTotals(balances: AssetTotal[]): string {
  const total = balances.reduce((sum, entry) => sum + (Number(entry.total) || 0), 0);
  return formatAmount(total, 2);
}

export default function AdminDashboardPage() {
  useAdminPage('Dashboard', 'Platform activity at a glance');

  const query = useQuery({
    queryKey: adminDashboardKey,
    queryFn: () => api.get<AdminDashboard>('/admin/dashboard', { days: 30 }),
    refetchInterval: 60_000,
  });

  const data = query.data;
  const metrics = data?.metrics;
  const loading = query.isLoading;

  if (query.isError) {
    return (
      <ErrorState
        title="Could not load the dashboard"
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-[15px]">
        {data?.message ?? ''}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total users"
          value={metrics?.totalUsers.toLocaleString('en-US') ?? '—'}
          hint={metrics ? `${metrics.newUsersThisWeek} new this week` : undefined}
          icon={<Users className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Active users"
          value={metrics?.activeUsers.toLocaleString('en-US') ?? '—'}
          tone="positive"
          icon={<UserCheck className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Frozen users"
          value={metrics?.frozenUsers.toLocaleString('en-US') ?? '—'}
          tone={metrics && metrics.frozenUsers > 0 ? 'danger' : 'default'}
          icon={<Snowflake className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Total balances"
          value={metrics ? sumTotals(metrics.demoBalances) : '—'}
          hint={metrics ? `Total across all assets` : undefined}
          icon={<Wallet className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Trades today"
          value={metrics?.demoTradesToday.toLocaleString('en-US') ?? '—'}
          icon={<Activity className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Trade volume"
          value={formatAmount(metrics?.demoTradeVolumeToday, 2)}
          hint="Staked today"
          icon={<TrendingUp className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Pending withdrawals"
          value={metrics?.pendingWithdrawalsCount.toLocaleString('en-US') ?? '—'}
          hint={
            metrics
              ? `${formatAmount(metrics.pendingWithdrawalsValue, 2)} awaiting review`
              : undefined
          }
          tone={metrics && metrics.pendingWithdrawalsCount > 0 ? 'warning' : 'default'}
          icon={<CircleDollarSign className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
        <MetricCard
          label="Open tickets"
          value={metrics?.openSupportTickets.toLocaleString('en-US') ?? '—'}
          tone={metrics && metrics.openSupportTickets > 0 ? 'warning' : 'default'}
          icon={<LifeBuoy className="h-4 w-4" aria-hidden />}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SimpleChart
          title="User registrations"
          description="New accounts per day"
          data={data?.registrations ?? []}
          variant="bar"
          unit="count"
          loading={loading}
        />
        <SimpleChart
          title="Trading volume"
          description="Stake placed per day"
          data={data?.tradeVolume ?? []}
          variant="line"
          unit="amount"
          loading={loading}
        />
        <SimpleChart
          title="Deposits"
          description="Deposits per day"
          data={data?.deposits ?? []}
          variant="bar"
          unit="amount"
          loading={loading}
        />
        <SimpleChart
          title="Withdrawals"
          description="Withdrawals per day"
          data={data?.withdrawals ?? []}
          variant="bar"
          unit="amount"
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader
          title="Balances by asset"
          description="Total held across every customer wallet"
        />
        <CardBody className="pt-2">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <caption className="sr-only">Total balances per asset</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2 text-left font-semibold">Asset</th>
                  <th scope="col" className="py-2 text-right font-semibold">Available</th>
                  <th scope="col" className="py-2 text-right font-semibold">Locked</th>
                  <th scope="col" className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {(metrics?.demoBalances ?? []).map((entry) => (
                  <tr key={entry.asset} className="border-b border-border/60 last:border-0">
                    <th scope="row" className="py-2.5 text-left font-medium text-fg">
                      {entry.label}
                    </th>
                    <td className="tabular py-2.5 text-right text-muted">
                      {formatAmount(entry.available, 2)}
                    </td>
                    <td className="tabular py-2.5 text-right text-muted">
                      {formatAmount(entry.locked, 2)}
                    </td>
                    <td className="tabular py-2.5 text-right font-semibold text-fg">
                      {formatAmount(entry.total, 2)}
                    </td>
                  </tr>
                ))}
                {!loading && (metrics?.demoBalances.length ?? 0) === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-muted">
                      No balances yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data?.registrations?.length ? (
            <p className="mt-3 text-xs text-subtle">
              Series cover {formatDate(data.registrations[0]?.date)} to{' '}
              {formatDate(data.registrations[data.registrations.length - 1]?.date)}.
            </p>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
