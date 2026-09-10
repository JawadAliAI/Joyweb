'use client';

/**
 * Base visual primitives.
 *
 * Every colour here resolves through a Tailwind token backed by a CSS
 * variable, so re-branding the platform never requires touching a component.
 */
import { forwardRef } from 'react';
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { changeTone, cn, formatPercent } from '@/lib/format';

/* ------------------------------------------------------------------ Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80',
  secondary: 'bg-elevated text-fg hover:bg-elevated/80 active:bg-elevated/70',
  outline: 'border border-border bg-transparent text-fg hover:bg-card',
  ghost: 'bg-transparent text-muted hover:bg-card hover:text-fg',
  danger: 'bg-danger text-white hover:bg-danger/90 active:bg-danger/80',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm rounded-control',
  md: 'h-11 px-4 text-sm rounded-control',
  lg: 'h-13 min-h-[52px] px-6 text-base rounded-pill',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, fullWidth, className, children,
    disabled, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex touch-target items-center justify-center gap-2 font-semibold',
        'transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {children}
    </button>
  );
});

/* -------------------------------------------------------------------- Card */

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  // `.layui-card`: white, no border, 2px corners, and a shadow faint enough to
  // read as a hairline against the page's light grey.
  return <div className={cn('rounded-card bg-card shadow-card', className)} {...props} />;
}

export function CardHeader({
  title,
  action,
  description,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-4 pt-4', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4', className)} {...props} />;
}

/* ------------------------------------------------------------------- Badge */

type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-elevated text-muted',
  success: 'bg-primary/15 text-primary',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/15 text-warning',
  info: 'bg-elevated text-fg',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------- ChangeChip */

/**
 * Signed percentage pill — the dashboard's 24h-change marker.
 *
 * `plain` drops the pill background for dense rows. It is a variant rather
 * than a `className` override because two competing `bg-*` utilities are
 * resolved by stylesheet order, not by the order they appear in the string.
 */
export function ChangeChip({
  value,
  plain = false,
  className,
}: {
  value: string | number | null | undefined;
  plain?: boolean;
  className?: string;
}) {
  const tone = changeTone(value);
  if (value === null || value === undefined || value === '') {
    return <span className="text-xs text-muted">—</span>;
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[11px] font-semibold tabular',
        !plain && 'rounded-pill px-2 py-1',
        tone === 'up' && (plain ? 'text-primary' : 'bg-primary/15 text-primary'),
        tone === 'down' && (plain ? 'text-danger' : 'bg-danger/15 text-danger'),
        tone === 'flat' && (plain ? 'text-muted' : 'bg-elevated text-muted'),
        className,
      )}
    >
      <span aria-hidden>{tone === 'down' ? '▼' : '▲'}</span>
      {formatPercent(value)}
    </span>
  );
}

/* ---------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-control bg-elevated/60',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer',
        'after:bg-gradient-to-r after:from-transparent after:via-shimmer/[0.06] after:to-transparent',
        className,
      )}
    />
  );
}

/** Named skeletons keep loading shapes consistent between screens. */
export function BalanceSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading balance">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-10 w-48" />
      <div className="flex gap-6 pt-2">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-12 w-12 rounded-full" />
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className="ml-auto h-3.5 w-24" />
            <Skeleton className="ml-auto h-3 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

export const MarketSkeleton = ListSkeleton;
export const TransactionSkeleton = ListSkeleton;
export const TradeSkeleton = ListSkeleton;

/* -------------------------------------------------------------- EmptyState */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && <div className="mb-3 text-subtle">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------- ErrorState */

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-10 text-center', className)} role="alert">
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-xs text-xs text-muted">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- Data rows */

export function DataRow({
  label,
  value,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: 'default' | 'strong';
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-2.5', className)}>
      <span className="text-sm text-muted">{label}</span>
      <span
        className={cn(
          'tabular text-right text-sm',
          tone === 'strong' ? 'font-semibold text-fg' : 'text-fg',
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cn('h-px w-full bg-border/70', className)} role="separator" />;
}
