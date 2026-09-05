'use client';

/**
 * Blocking countdown for a running demo position.
 *
 * While a position is live the user must not be able to start another one, so
 * this overlay is deliberately non-dismissible: there is no close button, the
 * backdrop is inert and Escape does nothing. It is closed programmatically by
 * the page once the trade settles.
 *
 * It cannot trap anyone: if settlement never arrives, an escape-hatch "Close"
 * button appears ~15 seconds after expiry.
 *
 * The focus trap, `role="dialog"`, `aria-modal` and body-scroll lock mirror
 * `components/ui/overlay.tsx`; only the dismissal behaviour differs, which is
 * why the overlay is rebuilt here rather than reusing `Modal`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownRight, ArrowUpRight, Loader2 } from 'lucide-react';
import { assetLabel, cn, formatCountdown, formatPrice } from '@/lib/format';
import { Badge, Button, DataRow, Divider } from '@/components/ui/primitives';
import { playSound } from '@/lib/sound';
import type { Money, Trade } from '@/lib/types';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** How long past expiry before the user is offered a manual way out. */
const ESCAPE_HATCH_SECONDS = 15;

/** Seconds left, derived from the expiry timestamp so a re-mount stays accurate. */
function secondsUntil(expiresAt: string, fallback: number): number {
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return Math.max(0, fallback);
  return Math.max(0, Math.round((target - Date.now()) / 1000));
}

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TradeInProgressModal({
  trade,
  currentPrice,
  onComplete,
  onForceClose,
  priceDecimals = 2,
}: {
  trade: Trade;
  currentPrice: Money | null;
  onComplete: () => void;
  /** Escape hatch, offered only if settlement is late. */
  onForceClose?: () => void;
  priceDecimals?: number;
}) {
  const total = Math.max(1, trade.durationSeconds);
  const [remaining, setRemaining] = useState(() =>
    secondsUntil(trade.expiresAt, trade.secondsRemaining),
  );
  const [announced, setAnnounced] = useState<number | null>(null);
  const [showEscapeHatch, setShowEscapeHatch] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const completedRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  // A new trade resets every piece of per-trade state.
  useEffect(() => {
    completedRef.current = false;
    lastTickRef.current = null;
    setShowEscapeHatch(false);
    setAnnounced(null);
    setRemaining(secondsUntil(trade.expiresAt, trade.secondsRemaining));
    // secondsRemaining is only the initial fallback; expiry drives the clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.id]);

  // Single interval drives the visual clock, the polite announcements, the
  // final-seconds ticks and the completion callback.
  useEffect(() => {
    const apply = (next: number) => {
      setRemaining(next);

      // Announce roughly every 5s, plus each of the last 5, so a screen reader
      // is informed without being flooded.
      if (next === 0 || next <= 5 || next % 5 === 0) setAnnounced(next);

      if (next > 0 && next <= 5 && lastTickRef.current !== next) {
        lastTickRef.current = next;
        playSound('tick');
      }

      if (next <= 0 && !completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current();
      }
    };

    apply(secondsUntil(trade.expiresAt, trade.secondsRemaining));
    const interval = window.setInterval(() => {
      apply(secondsUntil(trade.expiresAt, 0));
    }, 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade.expiresAt, trade.id]);

  // Never leave the user stuck if the settlement poll fails.
  useEffect(() => {
    if (remaining > 0 || !onForceClose) return;
    const timer = window.setTimeout(
      () => setShowEscapeHatch(true),
      ESCAPE_HATCH_SECONDS * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [remaining, onForceClose]);

  // Focus trap + scroll lock. Escape is swallowed on purpose.
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key !== 'Tab' || !panelRef.current) return;
    const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (nodes.length === 0) {
      event.preventDefault();
      panelRef.current.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown, true);
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      (panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel).focus();
    }, 20);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown, true);
      window.clearTimeout(timer);
      previouslyFocused.current?.focus?.();
    };
  }, [handleKeyDown]);

  const payoutPercent = Number(trade.payoutPercent);
  const amount = Number(trade.amount);
  const potentialReturn = useMemo(() => {
    if (!Number.isFinite(payoutPercent) || !Number.isFinite(amount)) return null;
    return amount + (amount * payoutPercent) / 100;
  }, [amount, payoutPercent]);

  const settling = remaining <= 0;
  const progress = Math.min(1, Math.max(0, remaining / total));
  const isUp = trade.direction === 'UP';

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Inert backdrop: clicking it must not dismiss a running position. */}
      <div className="absolute inset-0 animate-fade-in bg-black/80" aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Demo position in progress"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col overflow-y-auto bg-surface shadow-raised outline-none',
          'animate-sheet-up rounded-t-2xl sm:animate-slide-up sm:max-w-md sm:rounded-card',
          'px-5 py-6',
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-fg">{trade.symbol}</span>
            <Badge tone={isUp ? 'success' : 'danger'}>
              {isUp ? (
                <ArrowUpRight className="mr-1 h-3 w-3" aria-hidden />
              ) : (
                <ArrowDownRight className="mr-1 h-3 w-3" aria-hidden />
              )}
              {trade.direction}
            </Badge>
          </div>
          <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
            {settling ? 'Settling' : 'In progress'}
          </span>
        </div>

        <div className="mt-5 flex flex-col items-center">
          <div className="relative h-32 w-32">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120" aria-hidden focusable="false">
              <circle
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                strokeWidth="8"
                className="stroke-border"
              />
              <circle
                cx="60"
                cy="60"
                r={RADIUS}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                className={cn(
                  'transition-[stroke-dashoffset] duration-1000 ease-linear',
                  isUp ? 'stroke-primary' : 'stroke-danger',
                )}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {settling ? (
                <Loader2 className="h-8 w-8 animate-spin text-muted" aria-hidden />
              ) : (
                <span className="tabular text-2xl font-bold text-fg">
                  {formatCountdown(remaining)}
                </span>
              )}
            </div>
          </div>

          <p className="mt-3 text-center text-sm text-muted">
            {settling
              ? 'Settling… confirming the result against the public market price.'
              : 'Position running. Please wait for it to expire.'}
          </p>

          {/* Throttled announcements: the visual timer still ticks each second. */}
          <p className="sr-only" aria-live="polite" role="status">
            {settling
              ? 'Countdown finished. Settling the demo position.'
              : announced === null
                ? ''
                : `${announced} seconds remaining`}
          </p>
        </div>

        <div className="mt-5">
          <DataRow
            label="Stake"
            value={`${formatPrice(trade.amount, 2)} ${assetLabel(trade.asset)}`}
          />
          <Divider />
          <DataRow label="Entry price" value={formatPrice(trade.entryPrice, priceDecimals)} />
          <Divider />
          <DataRow
            label="Current price"
            value={formatPrice(currentPrice, priceDecimals, '…')}
          />
          <Divider />
          <DataRow label="Payout" value={`${trade.payoutPercent}%`} />
          <Divider />
          <DataRow
            label="Potential return"
            tone="strong"
            value={
              potentialReturn === null
                ? '—'
                : `${formatPrice(potentialReturn, 2)} ${assetLabel(trade.asset)}`
            }
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          Simulated position. No order reaches a real exchange and no real money is at risk.
        </p>

        {showEscapeHatch && onForceClose && (
          <div className="mt-4">
            <p className="mb-2 text-center text-xs text-warning">
              The result is taking longer than expected. You can close this and check the
              position in your history.
            </p>
            <Button variant="secondary" fullWidth onClick={onForceClose}>
              Close
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
