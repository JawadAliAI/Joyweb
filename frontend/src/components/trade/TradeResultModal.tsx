'use client';

/**
 * Settlement result.
 *
 * The settlement source and note are shown deliberately: in a simulator the
 * user is entitled to know how the outcome was decided rather than being
 * handed an unexplained win or loss.
 */
import { Modal } from '@/components/ui/overlay';
import { Button, Badge, DataRow, Divider } from '@/components/ui/primitives';
import { assetLabel, cn, formatAmount, formatDateTime, formatPrice } from '@/lib/format';
import type { Trade, TradeOutcome } from '@/lib/types';

const OUTCOME_COPY: Record<TradeOutcome, { title: string; tone: string; badge: 'success' | 'danger' | 'neutral' }> = {
  WIN: { title: 'WIN', tone: 'text-primary', badge: 'success' },
  LOSS: { title: 'LOSS', tone: 'text-danger', badge: 'danger' },
  DRAW: { title: 'DRAW', tone: 'text-muted', badge: 'neutral' },
};

export function TradeResultModal({
  open,
  onClose,
  trade,
  priceDecimals = 2,
}: {
  open: boolean;
  onClose: () => void;
  trade: Trade | null;
  priceDecimals?: number;
}) {
  const outcome = trade?.outcome ?? null;
  const copy = outcome ? OUTCOME_COPY[outcome] : null;
  const profit = trade?.profitLoss ?? null;
  const profitValue = profit === null ? null : Number(profit);
  const isLoss = outcome === 'LOSS';

  return (
    <Modal
      open={open && Boolean(trade)}
      onClose={onClose}
      title="Trade result"
      description="Here is how your position settled."
      footer={
        <Button fullWidth onClick={onClose}>
          Done
        </Button>
      }
    >
      {trade && copy && (
        <div className="space-y-4">
          <div className="text-center">
            <p className={cn('text-display font-bold', copy.tone)}>{copy.title}</p>
            <Badge tone={copy.badge} className="mt-2">
              {trade.symbol} · {trade.direction}
            </Badge>
          </div>

          <div>
            <DataRow
              label="Initial Amount"
              value={`${formatAmount(trade.amount, 2)} ${assetLabel(trade.asset)}`}
            />
            <Divider />
            <DataRow
              label={isLoss ? 'Loss' : 'Profit'}
              value={
                profitValue === null ? (
                  '—'
                ) : (
                  <span className={profitValue < 0 ? 'text-danger' : 'text-primary'}>
                    {profitValue > 0 ? '+' : ''}
                    {formatAmount(profitValue, 2)}
                  </span>
                )
              }
            />
            <Divider />
            <DataRow
              label={isLoss ? 'Total Loss' : 'Total Return'}
              tone="strong"
              value={
                trade.returnedAmount === null
                  ? '—'
                  : `${formatAmount(trade.returnedAmount, 2)} ${assetLabel(trade.asset)}`
              }
            />
            <Divider />
            <DataRow label="Entry price" value={formatPrice(trade.entryPrice, priceDecimals)} />
            <Divider />
            <DataRow label="Exit price" value={formatPrice(trade.exitPrice, priceDecimals)} />
            <Divider />
            <DataRow label="Payout rate" value={`${trade.payoutPercent}%`} />
            <Divider />
            <DataRow label="Settled" value={formatDateTime(trade.settledAt)} />
          </div>

          <div className="rounded-card bg-elevated px-3.5 py-3 text-xs leading-relaxed text-muted">
            <p className="font-semibold text-fg">How this outcome was decided</p>
            <p className="mt-1">
              Settlement source: {trade.settlementSource || 'Not recorded'}
            </p>
            {trade.settlementNote && <p className="mt-1">{trade.settlementNote}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}
