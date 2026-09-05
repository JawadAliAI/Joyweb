'use client';

/**
 * One wallet asset row: Available / In Use / Est. Value.
 *
 * Each figure is formatted with the asset's own decimal precision so a
 * high-precision coin is not rounded into a misleading number.
 */
import Link from 'next/link';
import type { WalletBalance } from '@/lib/types';
import { assetLabel, assetTicker, cn, formatAmount } from '@/lib/format';
import { AssetIcon } from '@/components/AssetIcon';

function Column({
  label,
  value,
  align = 'right',
}: {
  label: string;
  value: string;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('min-w-0', align === 'right' ? 'text-right' : 'text-left')}>
      <p className="text-[11px] font-medium text-subtle">{label}</p>
      <p className="tabular mt-0.5 truncate text-sm text-fg">{value}</p>
    </div>
  );
}

export interface AssetCardProps {
  /** The wallet balance to render. `asset` is the preferred prop name. */
  asset?: WalletBalance;
  /** Alias for `asset`, kept so either name reads naturally at the call site. */
  balance?: WalletBalance;
  /** Optional detail link — the whole row becomes tappable when provided. */
  href?: string;
  className?: string;
}

export function AssetCard({ asset, balance: balanceProp, href, className }: AssetCardProps) {
  const balance = asset ?? balanceProp;
  if (!balance) return null;
  const decimals = balance.decimals;

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        <AssetIcon asset={balance.asset} size="md" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-fg">{assetTicker(balance.asset)}</p>
          <p className="truncate text-[11px] text-muted">
            {balance.label || assetLabel(balance.asset)}
          </p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Column label="Available" value={formatAmount(balance.available, decimals)} align="left" />
        <Column label="In Use" value={formatAmount(balance.locked, decimals)} />
        <Column
          label="Est. Value"
          value={
            balance.estimatedValue === null
              ? 'No live price'
              : formatAmount(balance.estimatedValue, 2)
          }
        />
      </div>
    </>
  );

  const shell = cn('block rounded-card bg-card p-4', className);

  if (href) {
    return (
      <Link
        href={href}
        className={cn(shell, 'transition-colors hover:bg-elevated/60')}
        aria-label={`${assetTicker(balance.asset)} balance details`}
      >
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
