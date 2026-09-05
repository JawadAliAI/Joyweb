'use client';

/**
 * Underlined tab strip, as used for the market quote filters (Favorites /
 * USDT / BTC / ETH) and the Spot header on the assets screen.
 *
 * Implemented with the ARIA tab pattern: arrow keys move between tabs and only
 * the active tab is in the tab order.
 */
import { useRef } from 'react';
import { cn } from '@/lib/format';

export interface TabItem {
  value: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  ariaLabel = 'Sections',
  variant = 'underline',
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  variant?: 'underline' | 'pill';
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (direction: 1 | -1) => {
    const index = items.findIndex((item) => item.value === value);
    if (index === -1) return;
    const next = items[(index + direction + items.length) % items.length];
    onChange(next.value);
    refs.current[next.value]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'no-scrollbar flex gap-1 overflow-x-auto',
        variant === 'underline' ? 'border-b border-border' : 'rounded-control bg-surface p-1',
        className,
      )}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[item.value] = node;
            }}
            role="tab"
            type="button"
            id={`tab-${item.value}`}
            aria-selected={active}
            aria-controls={`panel-${item.value}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors',
              variant === 'underline'
                ? active
                  ? 'text-primary'
                  : 'text-muted hover:text-fg'
                : active
                  ? 'rounded-control bg-elevated text-fg'
                  : 'rounded-control text-muted hover:text-fg',
            )}
          >
            {item.label}
            {typeof item.count === 'number' && (
              <span className="ml-1.5 text-xs text-subtle">{item.count}</span>
            )}
            {variant === 'underline' && active && (
              <span
                aria-hidden
                className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  value,
  active,
  children,
  className,
}: {
  value: string;
  active: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={`panel-${value}`}
      aria-labelledby={`tab-${value}`}
      tabIndex={0}
      className={cn('focus:outline-none', className)}
    >
      {children}
    </div>
  );
}
