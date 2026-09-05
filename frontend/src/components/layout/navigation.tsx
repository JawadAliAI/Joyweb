'use client';

/**
 * Primary navigation.
 *
 * Mobile gets the four-item bottom bar from the reference design
 * (Home / Markets / Trade / Assets); from `lg` up the same destinations render
 * as a persistent sidebar and the bottom bar is hidden.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, CandlestickChart, Home, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/markets', label: 'Markets', icon: BarChart3 },
  { href: '/trade', label: 'Trade', icon: CandlestickChart },
  { href: '/assets', label: 'Assets', icon: Wallet },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function BottomNavigation() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden',
        'pb-[env(safe-area-inset-bottom)]',
      )}
    >
      <ul className="mx-auto flex max-w-lg">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-[60px] touch-target flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted hover:text-fg',
                )}
              >
                <Icon className="h-[22px] w-[22px]" aria-hidden strokeWidth={active ? 2.2 : 1.8} />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function DesktopSidebar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="hidden w-56 shrink-0 border-r border-border bg-surface lg:block"
    >
      <ul className="sticky top-16 space-y-1 p-3">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex touch-target items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted hover:bg-card hover:text-fg',
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
