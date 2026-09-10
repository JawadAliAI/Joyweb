'use client';

/**
 * Reusable admin table.
 *
 * Generic over the row type, semantic (`<th scope>`), horizontally scrollable
 * inside its own container, and wired to the API's `{items, meta}` envelope for
 * pagination. Loading, error and empty states are handled here so no caller has
 * to reimplement them.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/format';
import type { PageMeta } from '@/lib/types';

export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: string;
  direction: SortDirection;
}

export interface Column<T> {
  /** Stable identifier; also the value sent to `onSortChange`. */
  key: string;
  header: ReactNode;
  /** Cell renderer. Receives the whole row. */
  render: (row: T) => ReactNode;
  /** Enables the header sort button for this column. */
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  className?: string;
  /** Hidden below `md` — use for secondary columns on narrow screens. */
  hideOnMobile?: boolean;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  isLoading?: boolean;
  error?: unknown;
  errorMessage?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  meta?: PageMeta | null;
  onPageChange?: (page: number) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  /** Extra content rendered in a full-width row beneath `row`, when returned. */
  renderExpanded?: (row: T) => ReactNode;
  /** Whether `row` currently has its expansion open. */
  isExpanded?: (row: T) => boolean;
  onRowClick?: (row: T) => void;
  className?: string;
}

const ALIGN: Record<'left' | 'right' | 'center', string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

/** Small hook so pages get page + sort state without repeating themselves. */
export function useTableState(initialSort?: SortState) {
  const [page, setPage] = useState(1);
  const [sort, setSortState] = useState<SortState | null>(initialSort ?? null);

  const setSort = (next: SortState) => {
    setSortState(next);
    setPage(1);
  };

  /** Resets to page 1 — call whenever a filter changes. */
  const resetPage = () => setPage(1);

  return { page, setPage, sort, setSort, resetPage };
}

/** Debounces a value so a search box does not fire a request per keystroke. */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  caption,
  isLoading,
  error,
  errorMessage,
  onRetry,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  meta,
  onPageChange,
  sort,
  onSortChange,
  renderExpanded,
  isExpanded,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const totalPages = meta?.totalPages ?? 1;
  const page = meta?.page ?? 1;

  const body = useMemo(() => {
    if (isLoading) {
      return (
        <div className="space-y-3 p-4" role="status" aria-label="Loading table data">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      );
    }
    if (error) {
      return (
        <ErrorState
          title="Could not load this data"
          description={errorMessage ?? 'Please try again.'}
          onRetry={onRetry}
        />
      );
    }
    if (rows.length === 0) {
      return <EmptyState title={emptyTitle} description={emptyDescription} />;
    }
    return null;
  }, [isLoading, error, errorMessage, onRetry, rows.length, emptyTitle, emptyDescription]);

  return (
    <div className={cn('rounded-card border border-border/70 bg-card shadow-card', className)}>
      {body ?? (
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr className="border-b border-border">
                {columns.map((column) => {
                  const active = sort?.key === column.key;
                  const align = column.align ?? 'left';
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={
                        active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                      }
                      className={cn(
                        'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted',
                        ALIGN[align],
                        column.hideOnMobile && 'hidden md:table-cell',
                        column.className,
                      )}
                    >
                      {column.sortable && onSortChange ? (
                        <button
                          type="button"
                          onClick={() =>
                            onSortChange({
                              key: column.key,
                              direction: active && sort?.direction === 'desc' ? 'asc' : 'desc',
                            })
                          }
                          className={cn(
                            'inline-flex min-h-[44px] items-center gap-1 rounded-control px-1 uppercase',
                            'hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                            active && 'text-fg',
                          )}
                        >
                          {column.header}
                          {active && sort?.direction === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                          )}
                        </button>
                      ) : (
                        column.header
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = rowKey(row);
                const expanded = isExpanded?.(row) ?? false;
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={onRowClick ? () => onRowClick(row) : undefined}
                      className={cn(
                        'border-b border-border/60 last:border-0',
                        onRowClick && 'cursor-pointer hover:bg-elevated/50',
                      )}
                    >
                      {columns.map((column) => (
                        <td
                          key={column.key}
                          className={cn(
                            'px-4 py-3 align-middle text-fg',
                            ALIGN[column.align ?? 'left'],
                            column.hideOnMobile && 'hidden md:table-cell',
                          )}
                        >
                          {column.render(row)}
                        </td>
                      ))}
                    </tr>
                    {expanded && renderExpanded && (
                      <tr className="border-b border-border/60 bg-surface/60">
                        <td colSpan={columns.length} className="px-4 py-4">
                          {renderExpanded(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {meta && onPageChange && totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-xs text-muted">
            Page {page} of {totalPages} · {meta.total} total
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label="Next page"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
