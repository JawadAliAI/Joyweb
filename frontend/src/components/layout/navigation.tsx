'use client';

/**
 * Primary navigation.
 *
 * From `lg` up: the back office's rail — a dark navy column of collapsible
 * groups, each opening onto its own sub-pages, with the current page filled
 * teal. Below `lg` the rail is replaced by the four-item bottom bar, because a
 * two-level tree is not a phone pattern.
 *
 * This is the customer's own navigation and nothing else: the back offices are
 * reached from the account menu, not from a section of the rail that most
 * people signing in would never be allowed to open.
 *
 * Every entry points at a route that exists; there are no placeholders.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, BadgeCheck, BarChart3, Bell,
  CandlestickChart, ChevronDown, History, Home, LifeBuoy, LogOut, Receipt, Repeat,
  Shield, User as UserIcon, Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';
import { useLogout } from '@/hooks/useSession';
import { DemoBadge } from '@/components/layout/DemoBadge';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

/** Bottom bar: the four destinations that matter on a phone. */
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/markets', label: 'Markets', icon: BarChart3 },
  { href: '/trade', label: 'Trade', icon: CandlestickChart },
  { href: '/assets', label: 'Assets', icon: Wallet },
];

/** The rail: the same four as groups, opened onto their sub-pages. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'home',
    label: 'Home',
    icon: Home,
    items: [{ href: '/', label: 'Dashboard', icon: Home }],
  },
  {
    id: 'markets',
    label: 'Markets',
    icon: BarChart3,
    items: [{ href: '/markets', label: 'All markets', icon: BarChart3 }],
  },
  {
    id: 'trade',
    label: 'Trade',
    icon: CandlestickChart,
    items: [
      { href: '/trade', label: 'Place a position', icon: CandlestickChart },
      { href: '/profile/trades', label: 'Trading history', icon: History },
    ],
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: Wallet,
    items: [
      { href: '/assets', label: 'Overview', icon: Wallet },
      { href: '/assets/deposit', label: 'Deposit', icon: ArrowDownToLine },
      { href: '/assets/withdraw', label: 'Withdraw', icon: ArrowUpFromLine },
      { href: '/assets/convert', label: 'Convert', icon: Repeat },
      { href: '/assets/transfer', label: 'Transfer', icon: ArrowLeftRight },
      { href: '/assets/history', label: 'Transaction history', icon: Receipt },
    ],
  },
  {
    id: 'account',
    label: 'Account',
    icon: UserIcon,
    items: [
      { href: '/profile', label: 'Profile', icon: UserIcon },
      { href: '/profile/security', label: 'Security', icon: Shield },
      { href: '/profile/kyc', label: 'Verification', icon: BadgeCheck },
      { href: '/profile/history', label: 'Statements', icon: Receipt },
      { href: '/notifications', label: 'Notifications', icon: Bell },
      { href: '/support', label: 'Support', icon: LifeBuoy },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * `/assets` and `/assets/history` both match the history route, so the longest
 * matching href wins — otherwise two rows light up at once.
 */
function activeHref(pathname: string, items: NavItem[]) {
  return items
    .filter((item) => isActive(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

const ALL_ITEMS = NAV_GROUPS.flatMap((group) => group.items);

function owningGroup(pathname: string) {
  const current = activeHref(pathname, ALL_ITEMS);
  return NAV_GROUPS.find((group) => group.items.some((item) => item.href === current));
}

export function BottomNavigation() {
  const pathname = usePathname();
  const current = activeHref(pathname, NAV_ITEMS);

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
          const active = current === item.href;
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

const ROW = 'flex h-10 items-center gap-3 pl-[15px] pr-[30px] text-sm transition-colors';
const ROW_IDLE = 'text-rail-fg hover:bg-rail-hover';
const ROW_ACTIVE = 'bg-primary text-primary-foreground';

export function DesktopSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const { config } = usePlatform();
  const current = activeHref(pathname, ALL_ITEMS);

  // The group holding the current page opens; the rest start closed.
  const [expanded, setExpanded] = useState<string[]>(() => {
    const owning = owningGroup(pathname);
    return owning ? [owning.id] : ['home'];
  });

  useEffect(() => {
    const owning = owningGroup(pathname);
    if (!owning) return;
    setExpanded((open) => (open.includes(owning.id) ? open : [...open, owning.id]));
  }, [pathname]);

  return (
    <nav aria-label="Primary" className="hidden h-full w-[220px] shrink-0 lg:block">
      <div className="flex h-full flex-col overflow-hidden bg-rail">
        <Link
          href="/"
          className="flex shrink-0 flex-col justify-center gap-1 px-[15px] py-2.5 text-white/80"
        >
          <span className="truncate text-[15px] leading-tight">{config.appName}</span>
          <DemoBadge className="self-start" compact />
        </Link>

        <ul className="min-h-0 flex-1 overflow-y-auto">
          {NAV_GROUPS.map((group) => {
            const open = expanded.includes(group.id);
            const GroupIcon = group.icon;
            // A group holding one page is a plain link — a disclosure that
            // opens onto a single row is a control that does nothing.
            const solo = group.items.length === 1 ? group.items[0] : null;

            if (solo) {
              const active = current === solo.href;
              return (
                <li key={group.id}>
                  <Link
                    href={solo.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(ROW, active ? ROW_ACTIVE : ROW_IDLE)}
                  >
                    <GroupIcon className="h-[18px] w-[18px] shrink-0" aria-hidden strokeWidth={1.6} />
                    {group.label}
                  </Link>
                </li>
              );
            }

            return (
              <li key={group.id}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() =>
                    setExpanded((ids) =>
                      ids.includes(group.id)
                        ? ids.filter((id) => id !== group.id)
                        : [...ids, group.id],
                    )
                  }
                  className={cn(ROW, ROW_IDLE, 'w-full pr-[15px]')}
                >
                  <GroupIcon className="h-[18px] w-[18px] shrink-0" aria-hidden strokeWidth={1.6} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
                    aria-hidden
                  />
                </button>

                {open && (
                  <ul>
                    {group.items.map((item) => {
                      const active = current === item.href;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={cn(
                              'flex h-10 items-center pl-[45px] pr-[30px] text-sm transition-colors',
                              active ? ROW_ACTIVE : ROW_IDLE,
                            )}
                          >
                            {item.label}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>

        <div className="shrink-0 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              logout.mutate();
              router.replace('/login');
            }}
            disabled={logout.isPending}
            className={cn(ROW, ROW_IDLE, 'w-full disabled:cursor-not-allowed disabled:opacity-50')}
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden strokeWidth={1.6} />
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
