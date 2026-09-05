'use client';

/**
 * Dashboard stat tile.
 *
 * Values always arrive from the API — nothing here invents a number.
 */
import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/format';

export function MetricCard({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  loading,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'positive' | 'warning' | 'danger';
  loading?: boolean;
  className?: string;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-primary'
      : tone === 'warning'
        ? 'text-warning'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-fg';

  return (
    <div className={cn('rounded-card bg-card p-4 shadow-card', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        {icon && <span className="shrink-0 text-subtle">{icon}</span>}
      </div>
      {loading ? (
        <Skeleton className="mt-3 h-7 w-28" />
      ) : (
        <p className={cn('tabular mt-2 text-2xl font-semibold', toneClass)}>{value}</p>
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
