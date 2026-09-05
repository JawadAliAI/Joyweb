'use client';

/**
 * Paginated demo ledger history, shared by the Assets and Profile history
 * screens. Every row is a simulated movement — no real funds ever move.
 */
import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react';
import { useTransactions } from '@/hooks/useSession';
import { usePlatform } from '@/components/providers';
import {
  assetLabel,
  cn,
  formatAmount,
  formatDateTime,
  transactionLabel,
} from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { AssetIcon } from '@/components/AssetIcon';
import { Select } from '@/components/ui/form';
import {
  Badge,
  Button,
  Card,
  CardBody,
  Divider,
  EmptyState,
  ErrorState,
  ListSkeleton,
} from '@/components/ui/primitives';
import type { Transaction, TransactionStatus } from '@/lib/types';

const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'DEMO_DEPOSIT', label: 'Demo deposit' },
  { value: 'DEMO_WITHDRAWAL', label: 'Demo withdrawal' },
  { value: 'DEMO_TRANSFER_IN', label: 'Demo transfer received' },
  { value: 'DEMO_TRANSFER_OUT', label: 'Demo transfer sent' },
  { value: 'DEMO_CONVERSION', label: 'Demo conversion' },
  { value: 'TRADE_STAKE', label: 'Demo trade stake' },
  { value: 'TRADE_RETURN', label: 'Demo trade return' },
  { value: 'ADMIN_CREDIT', label: 'Demo balance credited' },
  { value: 'ADMIN_DEBIT', label: 'Demo balance debited' },
];

const STATUS_TONE: Record<TransactionStatus, 'success' | 'danger' | 'warning' | 'neutral'> = {
  COMPLETED: 'success',
  PENDING: 'warning',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

/** Outgoing types render with a minus and the danger tone. */
function isOutgoing(type: string) {
  return /WITHDRAWAL|TRANSFER_OUT|STAKE|DEBIT/.test(type);
}

function TransactionRow({ transaction }: { transaction: Transaction }) {
  const outgoing = isOutgoing(transaction.type);
  return (
    <li className="flex items-center gap-3 py-3">
      <AssetIcon asset={transaction.asset} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">
          {transactionLabel(transaction.type)}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {formatDateTime(transaction.createdAt)} · {transaction.reference}
        </p>
        {transaction.description && (
          <p className="mt-0.5 truncate text-xs text-subtle">{transaction.description}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p
          className={cn(
            'tabular text-sm font-semibold',
            outgoing ? 'text-danger' : 'text-primary',
          )}
        >
          <span aria-hidden>{outgoing ? '-' : '+'}</span>
          <span className="sr-only">{outgoing ? 'minus' : 'plus'} </span>
          {formatAmount(transaction.amount, 2)}
        </p>
        <p className="mt-0.5 text-xs text-muted">{assetLabel(transaction.asset)}</p>
        <Badge tone={STATUS_TONE[transaction.status]} className="mt-1">
          {transaction.status}
        </Badge>
      </div>
    </li>
  );
}

export function TransactionList({ pageSize = 20 }: { pageSize?: number }) {
  const { config } = usePlatform();
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [asset, setAsset] = useState('');

  const assetOptions = useMemo(
    () => [
      { value: '', label: 'All assets' },
      ...(config.assets ?? []).map((item) => ({
        value: item.asset,
        label: item.label || assetLabel(item.asset),
      })),
    ],
    [config.assets],
  );

  const query = useTransactions({ page, pageSize, type: type || undefined, asset: asset || undefined });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Type"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Asset"
          options={assetOptions}
          value={asset}
          onChange={(event) => {
            setAsset(event.target.value);
            setPage(1);
          }}
        />
      </div>

      <Card>
        <CardBody>
          {query.isLoading ? (
            <ListSkeleton rows={6} />
          ) : query.isError ? (
            <ErrorState
              title="Could not load history"
              description={errorMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : !query.data || query.data.items.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-8 w-8" aria-hidden />}
              title="No transactions yet"
              description="Simulated deposits, trades, transfers and conversions appear here."
            />
          ) : (
            <>
              <ul className="divide-y divide-border/70">
                {query.data.items.map((transaction) => (
                  <TransactionRow key={transaction.id} transaction={transaction} />
                ))}
              </ul>
              <Divider className="my-3" />
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ArrowDownLeft className="h-4 w-4 rotate-45" aria-hidden />
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
                  <ArrowUpRight className="h-4 w-4 rotate-45" aria-hidden />
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
