'use client';

/**
 * Administration header.
 *
 * Carries the page title slot, the signed-in administrator's identity and role,
 * and the language switcher (EN / 中文).
 */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { Globe, Menu } from 'lucide-react';
import { Badge } from '@/components/ui/primitives';
import { usePlatform } from '@/components/providers';
import { useSession } from '@/hooks/useSession';
import { useAdminLanguage } from './AdminLanguageContext';
import { cn } from '@/lib/format';

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

export function useAdminTitle() {
  const context = useContext(TitleContext);
  return { meta: context?.meta ?? { title: 'Administration' } };
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setMeta, title, description]);
}

function roleLabel(role: string): string {
  return role === 'SUPER_ADMIN' ? 'Super admin' : role === 'ADMIN' ? 'Admin' : role;
}

export function AdminHeader({ onOpenNav }: { onOpenNav: () => void }) {
  const { meta } = useAdminTitle();
  const { user } = useSession();
  const { lang, setLang, t } = useAdminLanguage();

  const title = t(meta.title);
  const description = meta.description ? t(meta.description) : undefined;

  return (
    <header className="sticky top-0 z-10 shrink-0 border-b border-border bg-card">
      <div className="flex h-[50px] items-center gap-3 px-[15px]">
        <button
          type="button"
          onClick={onOpenNav}
          aria-label={t('Open navigation')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted hover:bg-card hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:hidden"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-medium text-fg">{title}</h1>
          {description && (
            <p className="hidden truncate text-xs text-muted sm:block">{description}</p>
          )}
        </div>

        {meta.actions}

        {/* Language selector - Admin only */}
        <div className="flex items-center gap-1 rounded-control border border-border bg-card/60 p-1 text-xs">
          <Globe className="h-3.5 w-3.5 text-muted ml-0.5" aria-hidden />
          <button
            type="button"
            onClick={() => setLang('en')}
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium transition-colors',
              lang === 'en'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted hover:text-fg'
            )}
            title="English"
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setLang('zh')}
            className={cn(
              'rounded px-2 py-0.5 text-xs font-medium transition-colors',
              lang === 'zh'
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted hover:text-fg'
            )}
            title="简体中文"
          >
            中文
          </button>
        </div>

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
            {user?.role === 'SUPER_ADMIN'
              ? t('Super admin')
              : user?.role === 'ADMIN'
              ? t('Admin')
              : roleLabel(user?.role ?? '')}
          </Badge>
        </div>
      </div>
    </header>
  );
}
