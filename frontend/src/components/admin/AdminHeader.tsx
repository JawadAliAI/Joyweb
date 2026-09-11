'use client';

/**
 * Administration header.
 *
 * Carries the page title slot, the signed-in administrator's identity and role,
 * and the permanent simulation indicator. The demo indicator is not dismissible
 * — an operator must never be able to forget that every figure on screen is
 * simulated.
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Menu, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { usePlatform } from '@/components/providers';
import { useSession } from '@/hooks/useSession';

interface PageMeta {
  title: string;
  description?: string;
  actions?: ReactNode;
}

interface TitleContextValue {
  meta: PageMeta;
  setMeta: (meta: PageMeta) => void;
}

const TitleContext = createContext<TitleContextValue | null>(null);

export function AdminTitleProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<PageMeta>({ title: 'Administration' });
  const value = useMemo(() => ({ meta, setMeta }), [meta]);
  return <TitleContext.Provider value={value}>{children}</TitleContext.Provider>;
}

/**
 * Declares the title (and optional description / action slot) for the current
 * admin page. Call it once near the top of every page component.
 */
export function useAdminPage(title: string, description?: string, actions?: ReactNode) {
  const context = useContext(TitleContext);
  const setMeta = context?.setMeta;
  useEffect(() => {
    setMeta?.({ title, description, actions });
    // `actions` is a node; pages pass a stable element or none.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMeta, title, description]);
}

function roleLabel(role: string): string {
  return role === 'SUPER_ADMIN' ? 'Super admin' : role === 'ADMIN' ? 'Admin' : role;
}

export function AdminHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const context = useContext(TitleContext);
  const meta = context?.meta ?? { title: 'Administration' };
  const { config } = usePlatform();
  const { user } = useSession();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface pt-[env(safe-area-inset-top)]">
      <div
        role="status"
        className="flex items-center justify-center gap-2 bg-primary/15 px-4 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-primary"
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          {config.demoLabel} — every balance, trade and withdrawal shown here is simulated. No real
          funds and no blockchain transactions exist.
        </span>
      </div>

      <div className="flex h-[50px] items-center gap-3 px-[15px]">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label="Open navigation"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-card hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-fg">{meta.title}</h1>
          {meta.description && (
            <p className="hidden truncate text-xs text-muted sm:block">{meta.description}</p>
          )}
        </div>

        {meta.actions}

        <div className="hidden items-center gap-3 border-l border-border pl-[15px] sm:flex">
          <div className="text-right">
            <p className="max-w-[160px] truncate text-sm font-medium text-fg">
              {user?.fullName || user?.username || '—'}
            </p>
            <Link
              href="/admin/password"
              className="block max-w-[160px] truncate text-xs text-muted hover:text-primary"
              title="Change password"
            >
              {user?.email ?? ''} · Change password
            </Link>
          </div>
          <Badge tone={user?.role === 'SUPER_ADMIN' ? 'success' : 'info'}>
            {roleLabel(user?.role ?? '')}
          </Badge>
        </div>
      </div>
    </header>
  );
}
