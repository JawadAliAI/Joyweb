'use client';

/**
 * Console (Console).
 *
 * The reference's landing screen: counter cards with a small badge in the
 * header rule, then Order volume today — today's order volume broken into 24 hourly
 * buckets, labelled 00:00 through 23:00.
 *
 * Card metrics here are the reference's own computed values: a 15px body over a
 * 10px/15px header on a #f8f8f8 rule, an 18px badge, and a 36px figure in #666.
 * Figures are this agent's downline only — the API scopes them; nothing is
 * filtered client-side.
 */
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { useAgentScope } from '@/components/agent/AgentScope';
import { cn, formatAmount } from '@/lib/format';
import { Panel } from '@/components/agent/AgentPrimitives';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import type { AgentDashboard } from '@/lib/agent-types';

/** A console counter: label and badge in the header rule, figure below. */
function CounterCard({
  label,
  badge,
  value,
  loading,
  badgeTone = 'cyan',
}: {
  label: string;
  badge: string;
  value: string | number;
  loading?: boolean;
  badgeTone?: 'cyan' | 'green';
}) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3 border-b border-border px-[15px] py-[10px]">
        <p className="text-sm text-fg">{label}</p>
        <span
          className={cn(
            'flex h-[18px] items-center rounded-card px-1.5 text-xs text-white',
            badgeTone === 'green' ? 'bg-primary' : 'bg-secondary',
          )}
        >
          {badge}
        </span>
      </div>
      <div className="p-[15px]">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="tabular text-[36px] font-normal leading-none text-muted">{value}</p>
        )}
      </div>
    </Panel>
  );
}

/**
 * Order volume today — 24 bars, one per hour of today.
 *
 * Every hour is drawn even when it is empty, so the axis always reads 0 through
 * 23 rather than collapsing to the hours that happened to trade. Ticks are five
 * even steps up to the busiest hour, and the scale falls back to 5 before
 * anything has traded — the same empty state the reference shows.
 */
function HourlyVolume({
  points,
  loading,
}: {
  points: { date: string; value: string }[];
  loading?: boolean;
}) {
  const values = points.map((point) => Number(point.value) || 0);
  const peak = values.length > 0 ? Math.max(...values) : 0;
  const scale = peak > 0 ? peak : 5;
  const ticks = [5, 4, 3, 2, 1, 0].map((step) => (scale / 5) * step);
  const total = values.reduce((sum, value) => sum + value, 0);

  if (loading) return <Skeleton className="h-[300px] w-full" />;

  return (
    <div>
      <div className="flex gap-2">
        <div className="flex h-[262px] w-12 shrink-0 flex-col justify-between pb-[22px] text-right">
          {ticks.map((tick) => (
            <span key={tick} className="tabular text-xs leading-none text-muted">
              {tick >= 1000 ? formatAmount(tick, 0) : Math.round(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="relative flex h-[240px] items-end border-l border-border">
              {ticks.map((tick, index) => (
                <span
                  key={tick}
                  aria-hidden
                  className="absolute inset-x-0 border-t border-elevated"
                  style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
                />
              ))}
              {points.map((point, index) => {
                const value = values[index];
                const height = scale > 0 ? (value / scale) * 100 : 0;
                return (
                  <span
                    key={point.date}
                    className="relative flex flex-1 items-end justify-center"
                    title={`${point.date} · ${formatAmount(value)}`}
                  >
                    <span
                      className="w-1/2 bg-primary"
                      style={{ height: `${Math.max(value > 0 ? 2 : 0, height)}%` }}
                    />
                  </span>
                );
              })}
            </div>
            <div className="flex border-t border-border pt-1.5">
              {points.map((point) => (
                <span
                  key={point.date}
                  className="flex-1 text-center text-[11px] leading-none text-muted"
                >
                  {point.date}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="sr-only">
        Today&rsquo;s order volume across your members, by hour. Total{' '}
        {formatAmount(total)}, busiest hour {formatAmount(peak)}.
      </p>
    </div>
  );
}

export default function AgentConsolePage() {
  const { params, agentId } = useAgentScope();
  const query = useQuery({
    queryKey: ['agent', 'dashboard', agentId],
    queryFn: () => api.get<AgentDashboard>('/agent/dashboard', params),
    enabled: Boolean(agentId),
  });

  const data = query.data;

  return (
    <>
      <div className="mb-[15px] grid gap-[15px] md:grid-cols-2 xl:grid-cols-4">
        <CounterCard
          label="Sub-agents"
          badge="Total"
          loading={query.isLoading}
          value={data?.subAgentCount ?? 0}
        />
        <CounterCard
          label="Total members"
          badge="Total"
          badgeTone="green"
          loading={query.isLoading}
          value={data?.memberCount ?? 0}
        />
        <CounterCard
          label="Active members"
          badge="Total"
          loading={query.isLoading}
          value={data?.activeMemberCount ?? 0}
        />
        <CounterCard
          label="Volume today"
          badge="Today"
          badgeTone="green"
          loading={query.isLoading}
          value={formatAmount(data?.tradeVolumeToday, 2, '0')}
        />
      </div>

      <Panel>
        <div className="border-b border-border px-[15px] py-[10px]">
          <h2 className="text-sm text-fg">Order volume today</h2>
        </div>
        <div className="p-[15px]">
          {query.isError ? (
            <ErrorState
              title="Could not load the console"
              description={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <HourlyVolume points={data?.tradeVolume ?? []} loading={query.isLoading} />
          )}
        </div>
      </Panel>
    </>
  );
}
