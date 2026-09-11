'use client';

/**
 * Administration navigation.
 *
 * A persistent rail from `lg` up, a focus-trapped drawer below it. Every entry
 * points at a screen backed by a real `/api/admin` endpoint — nothing here is
 * decorative.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  Activity, ArrowLeftRight, BadgeCheck, BarChart3, Coins, FileClock, Gauge, LayoutDashboard,
  LifeBuoy, LogOut, Mail, Settings, TrendingUp, UserCog, Users, Wallet, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/format';
import { useLogout } from '@/hooks/useSession';
import { usePlatform } from '@/components/providers';
import { useAdminLanguage } from './AdminLanguageContext';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match nested routes too (e.g. /admin/users/abc). */
  exact?: boolean;
}

export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/kyc', label: 'Verification (KYC)', icon: BadgeCheck },
  { href: '/admin/invites', label: 'Invites', icon: Mail },
  { href: '/admin/markets', label: 'Markets', icon: BarChart3 },
  { href: '/admin/trades', label: 'Live Positions', icon: Activity },
  { href: '/admin/settlements', label: 'Outcomes & Payments', icon: Coins },
  { href: '/admin/trading', label: 'Trading Settings', icon: TrendingUp },
  { href: '/admin/wallets', label: 'Wallets', icon: Wallet },
  { href: '/admin/withdrawals', label: 'Withdrawals', icon: Coins },
  { href: '/admin/transfers', label: 'Transfers', icon: ArrowLeftRight },
  { href: '/admin/transactions', label: 'Transactions', icon: Activity },
  { href: '/admin/credit-scores', label: 'Credit Scores', icon: Gauge },
  { href: '/admin/support', label: 'Support', icon: LifeBuoy },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: FileClock },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname() ?? '';
  const logout = useLogout();
  const { t } = useAdminLanguage();

  return (
    <nav aria-label="Administration" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {ADMIN_NAV.map((item) => {
          const active = isActive(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-10 items-center gap-3 pl-[15px] pr-[30px] text-sm',
                  'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-rail-fg hover:bg-rail-hover',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{t(item.label)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Across to the reseller panel, kept apart from the admin sections. */}
      <div className="border-t border-white/10">
        <Link
          href="/agent"
          onClick={onNavigate}
          className={cn(
            'flex h-10 items-center gap-3 pl-[15px] pr-[30px] text-sm',
            'text-rail-fg transition-colors hover:bg-rail-hover',
          )}
        >
          <UserCog className="h-4 w-4 shrink-0" aria-hidden />
          {t('Agent portal')}
        </Link>
      </div>

      <div className="border-t border-white/10">
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          className={cn(
            'flex h-10 w-full items-center gap-3 pl-[15px] pr-[30px] text-sm',
            'text-rail-fg transition-colors hover:bg-rail-hover',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
            'disabled:opacity-60',
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          {t('Logout')}
        </button>
      </div>
    </nav>
  );
}

function Brand() {
  const { config } = usePlatform();
  return (
    <div className="flex h-[49px] shrink-0 items-center gap-2 px-[15px]">
      <span className="truncate text-base text-white/80">{config.appName}</span>
      <span className="rounded-card bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
        Admin
      </span>
    </div>
  );
}

export function AdminSidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <>
      {/* Persistent rail */}
      <aside className="hidden h-full w-[220px] shrink-0 flex-col overflow-hidden bg-rail lg:flex">
        <Brand />
        <NavList />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-black/70"
            onClick={onClose}
            aria-hidden
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Administration navigation"
            className="relative flex h-full w-[220px] max-w-[85vw] flex-col bg-rail shadow-raised"
          >
            <div className="flex items-center justify-between border-b border-border pr-2">
              <div className="flex-1">
                <Brand />
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close navigation"
                className="flex h-11 w-11 items-center justify-center rounded-control text-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <NavList onNavigate={onClose} />
          </div>
        </div>
      )}
    </>
  );
}
