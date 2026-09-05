'use client';

/**
 * Customer header: brand on the left, notifications and the profile menu on
 * the right, with the permanent simulation badge beside the product name.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  Bell, ChevronDown, History, LifeBuoy, LogOut, Receipt, Shield, User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';
import { useLogout, useSession, useUnreadCount } from '@/hooks/useSession';
import { DemoBadge } from '@/components/layout/DemoBadge';

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
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground"
          >
            {config.appName.charAt(0)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold text-fg">
              {config.appName}
            </span>
            <DemoBadge className="mt-0.5" compact />
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <Link
            href="/notifications"
            className="relative flex touch-target items-center justify-center rounded-control text-muted transition-colors hover:text-fg"
            aria-label={
              unread?.unread
                ? `Notifications, ${unread.unread} unread`
                : 'Notifications'
            }
          >
            <Bell className="h-5 w-5" aria-hidden />
            {Boolean(unread?.unread) && (
              <span
                aria-hidden
                className="absolute right-2 top-2 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white"
              >
                {unread!.unread > 9 ? '9+' : unread!.unread}
              </span>
            )}
          </Link>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex touch-target items-center gap-1 rounded-control px-1 text-muted hover:text-fg"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
                {initials || <UserIcon className="h-4 w-4" aria-hidden />}
              </span>
              <ChevronDown className="h-4 w-4" aria-hidden />
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
                    <p className="truncate text-xs text-muted">{user.email}</p>
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
                  {user?.role !== 'USER' && (
                    <li>
                      <Link
                        role="menuitem"
                        href="/admin"
                        onClick={() => setOpen(false)}
                        className="flex touch-target items-center gap-3 px-4 text-sm text-primary hover:bg-card"
                      >
                        <Shield className="h-4 w-4" aria-hidden />
                        Admin dashboard
                      </Link>
                    </li>
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
                    className={cn(
                      'flex w-full touch-target items-center gap-3 px-4 text-sm text-danger hover:bg-card',
                    )}
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
