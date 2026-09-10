'use client';

/** Full demo trading history, filterable by outcome. */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import { api, errorMessage } from '@/lib/api';
import {
  assetLabel,
  cn,
  formatAmount,
  formatDateTime,
  formatDuration,
  formatPrice,
} from '@/lib/format';
import { Tabs } from '@/components/ui/tabs';
import {
  Badge,
  Button,
  Card,
  CardBody,
  DataRow,
  Divider,
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '@/components/ui/primitives';
import type { Paged, Trade } from '@/lib/types';

const OUTCOME_TABS = [
  { value: 'ALL', label: 'All' },
  { value: 'WIN', label: 'Win' },
  { value: 'LOSS', label: 'Loss' },
  { value: 'DRAW', label: 'Draw' },
];

function TradeCard({ trade }: { trade: Trade }) {
  const profit = trade.profitLoss === null ? null : Number(trade.profitLoss);
  return (
    <li>
      <Card>
        <CardBody className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-fg">{trade.symbol}</p>
            <div className="flex items-center gap-2">
              <Badge tone={trade.direction === 'UP' ? 'success' : 'danger'}>
                {trade.direction}
              </Badge>
              {trade.outcome && (
                <Badge
                  tone={
                    trade.outcome === 'WIN'
                      ? 'success'
                      : trade.outcome === 'LOSS'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {trade.outcome}
                </Badge>
              )}
            </div>
          </div>
          <DataRow label="Trade ID" value={<span className="font-mono text-xs">{trade.id}</span>} />
          <Divider />
          <DataRow
            label="Amount"
            value={`${formatAmount(trade.amount, 2)} ${assetLabel(trade.asset)}`}
          />
          <Divider />
          <DataRow label="Duration" value={formatDuration(trade.durationSeconds)} />
          <Divider />
          <DataRow label="Entry Price" value={formatPrice(trade.entryPrice, 2)} />
          <Divider />
          <DataRow label="Exit Price" value={formatPrice(trade.exitPrice, 2)} />
          <Divider />
          <DataRow
            label="Profit / Loss"
            tone="strong"
            value={
              profit === null ? (
                '—'
              ) : (
                <span className={cn(profit < 0 ? 'text-danger' : 'text-primary')}>
                  {profit > 0 ? '+' : ''}
                  {formatAmount(profit, 2)}
                </span>
              )
            }
          />
          <Divider />
          <DataRow label="Date" value={formatDateTime(trade.createdAt)} />
        </CardBody>
      </Card>
    </li>
  );
}

export default function ProfileTradesPage() {
  const [outcome, setOutcome] = useState('ALL');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ['trades', 'profile', outcome, page],
    queryFn: () =>
      api.get<Paged<Trade>>('/trades', {
        outcome: outcome === 'ALL' ? undefined : outcome,
        page,
        pageSize: 20,
      }),
  });

  return (
    <AppShell>
      <PageHeader title="Trading history" backHref="/profile" />
      <PageBody width="wide">
        <SimulationNotice>
          Every position below was staked with simulated demo credits. No real trade was executed.
        </SimulationNotice>

        <Tabs
          items={OUTCOME_TABS}
          value={outcome}
          onChange={(value) => {
            setOutcome(value);
            setPage(1);
          }}
          ariaLabel="Filter trading history by outcome"
          variant="pill"
        />

        {query.isLoading ? (
          <ListSkeleton rows={5} />
        ) : query.isError ? (
          <ErrorState
            title="Could not load trading history"
            description={errorMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : !query.data || query.data.items.length === 0 ? (
          <EmptyState
            icon={<LineChart className="h-8 w-8" aria-hidden />}
            title="No trades match these filters"
            description="Try a different outcome filter."
          />
        ) : (
          <>
            <ul className="grid gap-3 lg:grid-cols-2">
              {query.data.items.map((trade) => (
                <TradeCard key={trade.id} trade={trade} />
              ))}
            </ul>
            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || query.isFetching}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <p className="text-xs text-muted" aria-live="polite">
                Page {query.data.meta.page} of {Math.max(1, query.data.meta.totalPages)}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= query.data.meta.totalPages || query.isFetching}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </PageBody>
    </AppShell>
  );
}
