'use client';

/**
 * Agent back-office shell.
 *
 * Reproduces the reference panel: a dark navy rail with collapsible menu
 * groups, a white top bar, and a browser-style tab strip above the content.
 *
 * On the tab strip — the reference is layui, which keeps each screen alive in
 * its own iframe. This is the App Router, which renders one route at a time, so
 * the strip here tracks which screens you have opened and navigates between
 * them; the open list survives navigation, the scroll position of a background
 * tab does not. Query results are cached, so returning to a tab is instant.
 *
 * Administrator-only, matching the API. Which reseller's book is on screen is
 * chosen in the top bar and carried by `AgentScopeProvider`; nothing here
 * infers it from the session, because an administrator has no downline.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ChevronDown, Home, LogOut, Maximize2, Menu, RefreshCw, Shield, X,
} from 'lucide-react';
import { cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';
import { useDocumentScrollLock } from '@/hooks/useDocumentScrollLock';
import { useLogout, useRequireAgent } from '@/hooks/useSession';
import { AGENT_NAV, agentRoute } from '@/components/agent/AgentNav';
import { AgentScopeProvider, useAgentScope } from '@/components/agent/AgentScope';
import { Skeleton } from '@/components/ui/primitives';

/* --------------------------------------------------------------- Tab strip */

interface TabState {
  open: string[];
  close: (href: string) => void;
  closeOthers: (href: string) => void;
}

const TabContext = createContext<TabState>({ open: [], close: () => {}, closeOthers: () => {} });

/** The console is pinned: it can never be closed, matching the reference. */
const HOME = '/agent';

function useTabs(pathname: string): TabState {
  const [open, setOpen] = useState<string[]>([HOME]);
  const router = useRouter();

  useEffect(() => {
    if (!agentRoute(pathname)) return;
    setOpen((current) => (current.includes(pathname) ? current : [...current, pathname]));
  }, [pathname]);

  const close = useCallback(
    (href: string) => {
      if (href === HOME) return;
      setOpen((current) => {
        const next = current.filter((item) => item !== href);
        // Closing the tab you are standing on falls back to the one before it.
        if (href === pathname) {
          const index = current.indexOf(href);
          router.push(next[index - 1] ?? next[next.length - 1] ?? HOME);
        }
        return next;
      });
    },
    [pathname, router],
  );

  const closeOthers = useCallback(
    (href: string) => {
      setOpen(href === HOME ? [HOME] : [HOME, href]);
      router.push(href);
    },
    [router],
  );

  return useMemo(() => ({ open, close, closeOthers }), [open, close, closeOthers]);
}

function TabStrip() {
  const pathname = usePathname();
  const { open, close, closeOthers } = useContext(TabContext);

  return (
    <div className="flex h-10 min-w-0 items-stretch bg-surface">
      <button
        type="button"
        onClick={() => closeOthers(pathname)}
        title="Close other tabs"
        className="flex w-10 shrink-0 items-center justify-center bg-elevated text-muted transition-colors hover:text-fg"
      >
        <span aria-hidden>«</span>
        <span className="sr-only">Close other tabs</span>
      </button>

      <div className="no-scrollbar flex flex-1 items-stretch overflow-x-auto">
        {open.map((href) => {
          const route = agentRoute(href);
          const active = pathname === href;
          const pinned = href === HOME;
          return (
            <span
              key={href}
              className={cn(
                'group relative flex shrink-0 items-center gap-2 pl-[15px] text-sm',
                pinned ? 'pr-[15px]' : 'pr-2',
                active ? 'bg-elevated text-black' : 'text-black/70 hover:text-black',
              )}
            >
              {active && (
                <span aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
              )}
              <Link href={href} className="flex h-10 items-center gap-1.5">
                {pinned ? (
                  <Home className="h-3.5 w-3.5" aria-hidden />
                ) : (
                  route?.label ?? href
                )}
                {pinned && <span className="sr-only">Console</span>}
              </Link>
              {!pinned && (
                <button
                  type="button"
                  onClick={() => close(href)}
                  aria-label={`Close ${route?.label ?? href}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-subtle transition-colors hover:bg-elevated hover:text-fg"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Agent picker */

/**
 * Whose book is on screen. Sits where the reference puts its search box,
 * because on an administrator-operated panel this is the control that actually
 * changes what you are looking at.
 */
function AgentPicker() {
  const { agentId, setAgentId, agents, isLoading } = useAgentScope();

  if (isLoading) {
    return <Skeleton className="ml-2 h-8 w-56" />;
  }

  if (agents.length === 0) {
    return (
      <span className="ml-2 hidden text-xs text-muted md:block">
        No agent accounts yet — promote a user to AGENT in the admin portal.
      </span>
    );
  }

  return (
    <label className="ml-2 flex min-w-0 items-center gap-2">
      <span className="hidden text-xs text-muted sm:inline">Agent</span>
      <select
        value={agentId}
        onChange={(event) => setAgentId(event.target.value)}
        aria-label="Agent"
        className="h-8 min-w-0 max-w-[9rem] border border-border bg-surface px-2 text-sm text-fg focus:border-primary focus:outline-none sm:max-w-none sm:min-w-[13rem]"
      >
        {agents.map((agent) => (
          <option key={agent.id} value={agent.id}>
            {agent.username} ({agent.memberCount})
          </option>
        ))}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------- Rail */

function Rail({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { config } = usePlatform();

  // A group opens when it holds the current route; the rest start closed.
  const [expanded, setExpanded] = useState<string[]>(() => {
    const owning = AGENT_NAV.find((group) => group.items.some((item) => item.href === pathname));
    return owning ? [owning.id] : ['home'];
  });

  useEffect(() => {
    const owning = AGENT_NAV.find((group) => group.items.some((item) => item.href === pathname));
    if (owning) setExpanded((current) => (current.includes(owning.id) ? current : [...current, owning.id]));
  }, [pathname]);

  return (
    <nav aria-label="Agent sections" className="flex h-full w-[220px] shrink-0 flex-col overflow-hidden bg-rail">
      <Link
        href="/agent"
        onClick={onNavigate}
        className="flex h-[49px] shrink-0 items-center px-5 text-base text-white/80"
      >
        {config.appName}
      </Link>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {AGENT_NAV.map((group) => {
          const isOpen = expanded.includes(group.id);
          const GroupIcon = group.icon;
          return (
            <li key={group.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() =>
                  setExpanded((current) =>
                    current.includes(group.id)
                      ? current.filter((id) => id !== group.id)
                      : [...current, group.id],
                  )
                }
                className="flex h-10 w-full items-center gap-3 pl-[15px] pr-[30px] text-sm text-rail-fg transition-colors hover:bg-rail-hover"
              >
                <GroupIcon className="h-[18px] w-[18px] shrink-0" aria-hidden strokeWidth={1.6} />
                <span className="flex-1 text-left">{group.label}</span>
                <ChevronDown
                  className={cn('h-4 w-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
                  aria-hidden
                />
              </button>

              {isOpen && (
                <ul>
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex h-10 items-center pl-[45px] pr-[30px] text-sm transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-rail-fg hover:bg-rail-hover',
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

      {/* Ways back out. The panel is one of three areas an administrator moves
          between, so leaving it should not mean editing the URL. */}
      <div className="mt-auto border-t border-white/10">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex h-10 items-center gap-3 pl-[15px] pr-[30px] text-sm text-rail-fg transition-colors hover:bg-rail-hover"
        >
          <Shield className="h-[18px] w-[18px] shrink-0" aria-hidden strokeWidth={1.6} />
          Admin portal
        </Link>
        <Link
          href="/home"
          onClick={onNavigate}
          className="flex h-10 items-center gap-3 pl-[15px] pr-[30px] text-sm text-rail-fg transition-colors hover:bg-rail-hover"
        >
          <Home className="h-[18px] w-[18px] shrink-0" aria-hidden strokeWidth={1.6} />
          Customer app
        </Link>
      </div>
    </nav>
  );
}

/* ------------------------------------------------------------------ Shell */

export const AGENT_LOGIN_PATH = '/agent/login';

export function AgentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const logout = useLogout();
  const onLogin = pathname === AGENT_LOGIN_PATH;
  const { user, isLoading } = useRequireAgent({ enabled: !onLogin });
  const tabs = useTabs(pathname);
  const [railOpen, setRailOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Every branch below the sign-in page is a fixed shell; none of them scroll
  // the document. Called before the early return so the hook order is stable.
  useDocumentScrollLock(!onLogin);

  // A starting password is replaced in the admin panel before anything else opens.
  const heldForPassword = !onLogin && Boolean(user?.mustChangePassword);
  useEffect(() => {
    if (heldForPassword) router.replace('/admin/password');
  }, [heldForPassword, router]);

  // The sign-in page lives inside this segment but must not be wrapped by the
  // chrome it signs you in to, or the guard would redirect to itself.
  if (onLogin) return <>{children}</>;

  if (isLoading || !user || heldForPassword) {
    return (
      <div className="theme-light fixed inset-0 overflow-y-auto bg-bg p-6">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    );
  }

  return (
    <TabContext.Provider value={tabs}>
      <AgentScopeProvider>
      <div className="theme-light fixed inset-0 flex overflow-hidden bg-bg text-fg pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        {/* Rail — fixed drawer below lg, static column above it. */}
        <div className="hidden lg:block">
          <Rail />
        </div>
        {railOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setRailOpen(false)}
              aria-hidden
            />
            <div className="relative h-full">
              <Rail onNavigate={() => setRailOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar */}
          <header className="flex h-[50px] shrink-0 items-center gap-1 border-b border-elevated bg-surface px-3">
            <button
              type="button"
              onClick={() => setRailOpen(true)}
              className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-fg lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => setRailOpen((current) => !current)}
              className="hidden h-9 w-9 items-center justify-center text-muted transition-colors hover:text-fg lg:flex"
              aria-label="Toggle menu"
            >
              <Menu className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="flex h-9 w-9 items-center justify-center text-muted transition-colors hover:text-fg"
              aria-label="Refresh"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>

            <AgentPicker />

            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/admin"
                title="Admin portal"
                className="flex h-8 items-center gap-1.5 border border-border px-2.5 text-xs text-muted transition-colors hover:text-fg"
              >
                <Shield className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="hidden md:inline">Admin portal</span>
              </Link>
              <button
                type="button"
                onClick={() => void document.documentElement.requestFullscreen?.()}
                className="hidden h-9 w-9 items-center justify-center text-muted transition-colors hover:text-fg sm:flex"
                aria-label="Fullscreen"
              >
                <Maximize2 className="h-4 w-4" aria-hidden />
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="flex h-9 items-center gap-1 px-2 text-sm text-fg"
                >
                  {user.username}
                  <ChevronDown className="h-4 w-4 text-muted" aria-hidden />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-full z-50 w-44 border border-border bg-surface shadow-raised"
                  >
                    <Link
                      role="menuitem"
                      href="/admin"
                      onClick={() => setMenuOpen(false)}
                      className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-sm text-primary hover:bg-elevated"
                    >
                      <Shield className="h-4 w-4" aria-hidden />
                      Back to admin portal
                    </Link>
                    <Link
                      role="menuitem"
                      href="/agent/profile"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-fg hover:bg-elevated"
                    >
                      Profile
                    </Link>
                    <Link
                      role="menuitem"
                      href="/agent/password"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2.5 text-sm text-fg hover:bg-elevated"
                    >
                      Change password
                    </Link>
                    <button
                      role="menuitem"
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        logout.mutate();
                      }}
                      className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 text-sm text-danger hover:bg-elevated"
                    >
                      <LogOut className="h-4 w-4" aria-hidden />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <TabStrip />

          <main id="agent-main" className="flex-1 overflow-y-auto bg-bg p-[15px]">
            {children}
          </main>
        </div>
      </div>
      </AgentScopeProvider>
    </TabContext.Provider>
  );
}

/** Breadcrumb-free page heading used inside a screen. */
export function AgentPageTitle({ href }: { href: string }) {
  const route = agentRoute(href);
  if (!route) return null;
  return (
    <div className="mb-3 flex items-center gap-2 text-sm text-muted">
      <span className="font-semibold text-fg">{route.label}</span>
    </div>
  );
}
