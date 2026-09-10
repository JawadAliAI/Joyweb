'use client';

/**
 * The five bands every list screen in the reference panel is built from:
 * a filter grid, a bulk-action strip, solid stat tiles, a table with a toolbar,
 * and layui-style pagination.
 *
 * Built once here so each screen is a configuration rather than a slab of
 * markup. Colours come from the theme tokens, so the panel re-themes with the
 * rest of the product.
 */
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Columns3, Printer, Search, Sheet } from 'lucide-react';
import { cn, formatAmount } from '@/lib/format';
import { Skeleton } from '@/components/ui/primitives';

/* ------------------------------------------------------------------ Panel */

/**
 * `.layui-card` from the reference: white, no border, 2px corners, and a shadow
 * so faint it reads as a hairline — `0 1px 2px rgba(0,0,0,.05)`.
 */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn('rounded-card bg-surface shadow-[0_1px_2px_0_rgba(0,0,0,0.05)]', className)}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- FilterBar */

export interface FilterField {
  name: string;
  label: string;
  type?: 'text' | 'date' | 'select';
  placeholder?: string;
  options?: { value: string; label: string }[];
}

/**
 * Labelled inputs, three to a row, closing with the teal search button.
 * Uncontrolled by design: the screen reads values on submit, so typing in a
 * filter never re-runs a query.
 */
export function FilterBar({
  fields,
  values,
  onChange,
  onSearch,
  children,
}: {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
  onSearch: () => void;
  /** Extra controls rendered beside the search button. */
  children?: ReactNode;
}) {
  return (
    <Panel className="mb-[15px] p-[15px]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSearch();
        }}
      >
        <div className="grid gap-x-[30px] gap-y-[15px] md:grid-cols-2 xl:grid-cols-3">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-[10px]">
              <label
                htmlFor={`filter-${field.name}`}
                className="text-sm text-fg sm:w-[90px] sm:shrink-0 sm:text-right"
              >
                {field.label}
              </label>
              {field.type === 'select' ? (
                <select
                  id={`filter-${field.name}`}
                  value={values[field.name] ?? ''}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  className="h-[38px] min-w-0 flex-1 border border-border bg-surface px-2.5 text-sm text-fg focus:border-primary focus:outline-none"
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={`filter-${field.name}`}
                  type={field.type === 'date' ? 'date' : 'text'}
                  value={values[field.name] ?? ''}
                  placeholder={field.placeholder ?? 'Enter a value'}
                  onChange={(event) => onChange(field.name, event.target.value)}
                  className="h-[38px] min-w-0 flex-1 border border-border bg-surface px-2.5 text-sm text-fg placeholder:text-subtle focus:border-primary focus:outline-none"
                />
              )}
            </div>
          ))}

          <div className="flex items-center gap-[10px]">
            <span className="hidden w-[90px] shrink-0 sm:block" aria-hidden />
            <button
              type="submit"
              className="flex h-[38px] w-[60px] items-center justify-center bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
              aria-label="Search"
            >
              <Search className="h-4 w-4" aria-hidden />
            </button>
            {children}
          </div>
        </div>
      </form>
    </Panel>
  );
}

/* ------------------------------------------------------------- StatTiles */

export interface StatTile {
  label: string;
  value: ReactNode;
}

/** The row of solid blue panels above the table. */
export function StatTiles({ tiles, loading }: { tiles: StatTile[]; loading?: boolean }) {
  if (tiles.length === 0) return null;
  return (
    <div className="mb-[15px] grid gap-[15px] sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-card bg-tile px-[15px] py-4 text-tile-foreground">
          <p className="text-sm font-medium">{tile.label}</p>
          {loading ? (
            <Skeleton className="mt-2 h-8 w-20 bg-white/25" />
          ) : (
            <p className="tabular mt-1 text-[36px] font-normal leading-tight">{tile.value}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/** Convenience: a tile value that is a demo money amount. */
export function tileAmount(value: string | number | null | undefined, decimals = 2) {
  return formatAmount(value, decimals, '0');
}

/* ------------------------------------------------------------ ActionStrip */

/** The bar of bulk actions the reference puts above the tiles. */
export function ActionStrip({ children }: { children: ReactNode }) {
  return (
    <Panel className="mb-[15px] flex flex-wrap items-center gap-3 p-[15px]">{children}</Panel>
  );
}

export function StripButton({
  onClick,
  disabled,
  tone = 'primary',
  children,
}: {
  onClick?: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-[38px] px-[18px] text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        tone === 'danger' && 'bg-danger text-white hover:bg-danger/90',
        tone === 'neutral' && 'border border-border bg-surface text-fg hover:bg-elevated',
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- Countdown */

/**
 * Seconds left on an open position, ticking locally.
 *
 * The list around it refetches every few seconds; this keeps the number moving
 * in between, so a row never looks frozen. Shared by the admin and agent
 * position screens rather than written twice.
 */
export function Countdown({ expiresAt }: { expiresAt: string }) {
  const remaining = () =>
    Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
  const [left, setLeft] = useState(remaining);

  useEffect(() => {
    setLeft(remaining());
    const timer = window.setInterval(() => setLeft(remaining()), 1000);
    return () => window.clearInterval(timer);
    // `remaining` closes over expiresAt, which is the only input that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiresAt]);

  if (left <= 0) return <span className="text-xs text-muted">settling…</span>;
  return <span className="tabular text-sm font-medium text-primary">{left}s</span>;
}

/* ------------------------------------------------------------ DataSurface */

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Tailwind width class, e.g. "w-32". Omit to let the column flex. */
  width?: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

/**
 * Table with the reference's toolbar and pagination.
 *
 * The toolbar's column picker, export and print are shown as disabled until
 * they are wired up — they are drawn in the reference, and an enabled control
 * that does nothing is worse than one that says it is not ready yet.
 */
export function DataSurface<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  empty = 'No records' as ReactNode,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string | null;
  empty?: ReactNode;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Panel>
      <div className="flex items-center justify-end gap-1 border-b border-border p-[15px]">
        {[
          { icon: Columns3, label: 'Choose columns' },
          { icon: Sheet, label: 'Export' },
          { icon: Printer, label: 'Print' },
        ].map(({ icon: Icon, label }) => (
          <button
            key={label}
            type="button"
            disabled
            title={`${label} — not wired up yet`}
            aria-label={label}
            className="flex h-[30px] w-[30px] items-center justify-center border border-border text-muted disabled:opacity-50"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-elevated">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-[15px] py-[9px] font-normal leading-5 text-fg',
                    column.width,
                    column.align === 'right' && 'text-right',
                    column.align === 'center' && 'text-center',
                    (!column.align || column.align === 'left') && 'text-left',
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border">
                  {columns.map((column) => (
                    <td key={column.key} className="px-[15px] py-[9px]">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-danger">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-muted">
                  {empty}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={rowKey(row)} className="border-b border-border hover:bg-elevated">
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-[15px] py-[9px] leading-5 text-fg',
                        column.align === 'right' && 'tabular text-right',
                        column.align === 'center' && 'text-center',
                      )}
                    >
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-[15px] text-sm text-muted">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="h-11 min-w-11 border border-border px-2 text-fg disabled:opacity-40 sm:h-[30px] sm:min-w-[30px]"
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="flex h-11 min-w-11 items-center justify-center bg-primary px-2 text-primary-foreground sm:h-[30px] sm:min-w-[30px]">
          {page}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="h-11 min-w-11 border border-border px-2 text-fg disabled:opacity-40 sm:h-[30px] sm:min-w-[30px]"
          aria-label="Next page"
        >
          ›
        </button>

        <span className="ml-2">{total} records</span>

        <label className="ml-auto flex items-center gap-2">
          <span className="sr-only">Rows per page</span>
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-11 border border-border bg-surface px-1.5 text-sm text-fg focus:border-primary focus:outline-none sm:h-[30px]"
          >
            {[20, 30, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size} / page
              </option>
            ))}
          </select>
        </label>
      </div>
    </Panel>
  );
}
