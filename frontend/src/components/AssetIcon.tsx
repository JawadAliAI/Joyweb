'use client';

/**
 * Asset glyph.
 *
 * Original marks drawn from the asset's own ticker letters — no third-party
 * brand artwork is used or implied. The colour is derived from the ticker so
 * the same asset always looks the same without a hard-coded lookup per coin.
 */
import { cn } from '@/lib/format';

const PALETTE = [
  'bg-primary/20 text-primary',
  'bg-secondary/20 text-secondary',
  'bg-danger/20 text-danger',
  'bg-sky-500/20 text-sky-400',
  'bg-violet-500/20 text-violet-400',
  'bg-orange-500/20 text-orange-400',
];

function toneFor(ticker: string) {
  let hash = 0;
  for (let index = 0; index < ticker.length; index += 1) {
    hash = (hash * 31 + ticker.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

const SIZES = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
} as const;

export function AssetIcon({
  asset,
  size = 'md',
  className,
}: {
  /** Either a wallet asset ("DEMO_USDT") or a base ticker ("BTC"). */
  asset: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const ticker = asset.replace(/^DEMO_/, '').replace(/^PAPER_/, '').split('/')[0];
  const label = ticker.slice(0, 4);

  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-bold tracking-tight',
        SIZES[size],
        toneFor(ticker),
        className,
      )}
    >
      {label}
    </span>
  );
}
