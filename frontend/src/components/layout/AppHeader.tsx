'use client';

/**
 * Customer header.
 *
 * The wallet chips, the market search, the notification bell, the deposit
 * action, and the signed-in account on the far right (which is also the profile
 * menu trigger).
 *
 * The brand lives at the top of the sidebar, so it appears here only below
 * `lg` where there is no sidebar — exactly one mark is on screen at any width.
 * Balance figures are shown only on the Assets page, so the header carries no
 * wallet totals.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, Bell, ChevronDown, History, LifeBuoy, LogOut, Receipt, Search,
  Shield, UserCog, User as UserIcon,
} from 'lucide-react';
import { accountContact, cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';
import { useLogout, useSession, useUnreadCount } from '@/hooks/useSession';
import { DepositButton } from '@/components/wallet/DepositDialog';

const MENU_ITEMS = [
  { href: '/profile', label: 'My Profile', icon: UserIcon },
  { href: '/profile/security', label: 'Security', icon: Shield },
  { href: '/profile/history', label: 'Transaction History', icon: Receipt },
  { href: '/profile/trades', label: 'Trading History', icon: History },
  { href: '/support', label: 'Support', icon: LifeBuoy },
];

export function AppHeader() {
  const { config } = usePlatform();
  const { user } = useSession();
  const { data: unread } = useUnreadCount();
  const logout = useLogout();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const initials =
    user ? `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase() || 'U' : '';

  return (
    /*
     * A flat white bar across the top of the content column, matching the
     * back office it now shares a look with. 50px tall, one hairline rule,
     * no gap and no radius.
     */
    <div className="sticky top-0 z-40 bg-surface pt-[env(safe-area-inset-top)]">
      <header className="flex h-[50px] items-center gap-3 border-b border-border bg-surface px-[15px]">
        {/* Brand — below `lg` only. From `lg` up the sidebar carries it, so
            exactly one mark is on screen at any width. */}
        <Link
          href="/home"
          className="flex min-w-0 max-w-[210px] shrink-0 items-center gap-2 lg:hidden"
        >
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground"
          >
            {config.appName.charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight text-fg">
              {config.appName}
            </span>
          </span>
        </Link>

        {/* Market search. Submitting hands the term to the markets screen. */}
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            const query = term.trim();
            router.push(query ? `/markets?q=${encodeURIComponent(query)}` : '/markets');
          }}
          className="mx-auto hidden min-w-0 max-w-sm flex-1 lg:block"
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <input
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Search coins…"
              aria-label="Search coins"
              className={cn(
                'h-10 w-full rounded-pill border border-border bg-card pl-9 pr-3 text-sm',
                'text-fg placeholder:text-subtle focus:border-primary focus:outline-none',
              )}
            />
          </div>
        </form>

        <div className="ml-auto flex shrink-0 items-center gap-1 lg:ml-0">
          <Link
            href="/notifications"
            className="relative flex touch-target items-center justify-center rounded-control text-muted transition-colors hover:text-fg"
            aria-label={unread?.unread ? `Notifications, ${unread.unread} unread` : 'Notifications'}
          >
            <Bell className="h-5 w-5" aria-hidden />
            {Boolean(unread?.unread) && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
              >
                {unread!.unread > 9 ? '9+' : unread!.unread}
              </span>
            )}
          </Link>

          <DepositButton
            className={cn(
              'hidden touch-target items-center gap-2 rounded-pill bg-primary px-4 sm:inline-flex',
              'text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90',
            )}
          >
            Deposit
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
          </DepositButton>

          {/* Account + profile menu, far right. */}
          <div ref={menuRef} className="relative ml-1 shrink-0">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex touch-target items-center gap-2 rounded-control px-1 text-left transition-colors hover:bg-card"
            >
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
              >
                {initials || <UserIcon className="h-4 w-4" />}
              </span>
              <span className="hidden min-w-0 xl:block">
                <span className="block truncate text-sm font-semibold leading-tight text-fg">
                  {user?.fullName ?? 'Account'}
                </span>
                <span className="block max-w-[160px] truncate text-[11px] leading-tight text-muted">
                  {user ? accountContact(user) : ''}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden />
              <span className="sr-only">Account menu</span>
            </button>

            {open && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-2 w-60 animate-slide-up overflow-hidden rounded-card border border-border bg-elevated shadow-raised"
              >
                {user && (
                  <div className="border-b border-border px-4 py-3">
                    <p className="truncate text-sm font-semibold text-fg">{user.fullName}</p>
                    <p className="truncate text-xs text-muted">{accountContact(user)}</p>
                  </div>
                )}
                <ul className="py-1">
                  {MENU_ITEMS.map((item) => (
                    <li key={item.href}>
                      <Link
                        role="menuitem"
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex touch-target items-center gap-3 px-4 text-sm text-fg hover:bg-card"
                      >
                        <item.icon className="h-4 w-4 text-muted" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                  {user && user.role !== 'USER' && (
                    <>
                      {(user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
                        <li>
                          <Link
                            role="menuitem"
                            href="/admin"
                            onClick={() => setOpen(false)}
                            className="flex touch-target items-center gap-3 px-4 text-sm text-primary hover:bg-card"
                          >
                            <Shield className="h-4 w-4" aria-hidden />
                            Admin portal
                          </Link>
                        </li>
                      )}
                      <li>
                        <Link
                          role="menuitem"
                          href="/agent"
                          onClick={() => setOpen(false)}
                          className="flex touch-target items-center gap-3 px-4 text-sm text-primary hover:bg-card"
                        >
                          <UserCog className="h-4 w-4" aria-hidden />
                          Agent portal
                        </Link>
                      </li>
                    </>
                  )}
                </ul>
                <div className="border-t border-border py-1">
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      logout.mutate();
                      router.replace('/login');
                    }}
                    className="flex w-full touch-target items-center gap-3 px-4 text-sm text-danger hover:bg-card"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
