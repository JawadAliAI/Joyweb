'use client';

/**
 * Customer application shell.
 *
 * Guards the session, enforces maintenance mode for non-administrators, and
 * lays out the page. From `lg` up the sidebar is a full-height rail on the
 * left and the header sits above the content column beside it; below `lg` the
 * rail is replaced by the bottom bar, which the content area reserves space
 * for.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';
import { useDocumentScrollLock } from '@/hooks/useDocumentScrollLock';
import { useRequireAuth } from '@/hooks/useSession';
import { AppHeader } from '@/components/layout/AppHeader';
import { BottomNavigation, DesktopSidebar } from '@/components/layout/navigation';
import { RestrictionNotice } from '@/components/layout/DemoBadge';
import { Skeleton } from '@/components/ui/primitives';

export function AppShell({
  children,
  /** Hide the bottom bar on focused sub-flows such as withdraw confirmation. */
  hideBottomNav = false,
  showRestrictionNotice = true,
}: {
  children: ReactNode;
  hideBottomNav?: boolean;
  showRestrictionNotice?: boolean;
}) {
  const { config } = usePlatform();
  const { user, isLoading, unauthenticated } = useRequireAuth();
  // Every branch here is a fixed shell; none of them scroll the document.
  useDocumentScrollLock();

  if (isLoading || (!user && !unauthenticated)) {
    return (
      <div className="fixed inset-0 overflow-y-auto bg-bg p-4">
        <div className="mx-auto max-w-lg space-y-4 pt-10">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  // The redirect is already in flight from useRequireAuth.
  if (!user) return null;

  const restrictedByMaintenance = config.maintenanceMode && user.role === 'USER';
  if (restrictedByMaintenance) {
    return (
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto bg-bg px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold text-fg">{config.maintenanceMessage}</h1>
          <p className="mt-2 text-sm text-muted">
            {config.appName} is temporarily unavailable. Please try again shortly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-hidden bg-bg pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      {/*
       * Pinned to the viewport, like the two back offices: the rail and the
       * content each own a scrollbar, so scrolling a long page never drags the
       * rail up or exposes bare background beneath it. `min-w-0` keeps a wide
       * table scrolling inside its own container instead of pushing the layout
       * sideways.
       */}
      <div className="flex h-full overflow-hidden">
        <DesktopSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main
            id="main"
            className={cn(
              'min-w-0 flex-1 overflow-y-auto',
              hideBottomNav ? 'pb-6' : 'pb-[calc(var(--bottom-nav-height)+16px)] lg:pb-8',
            )}
          >
            {showRestrictionNotice && user.status !== 'ACTIVE' && (
              <RestrictionNotice reason={user.freezeReason} />
            )}
            {children}
          </main>
        </div>
      </div>
      {!hideBottomNav && <BottomNavigation />}
    </div>
  );
}

/**
 * Header for a focused sub-page (Withdraw, Deposit, Convert...), matching the
 * reference design's back arrow + centred title.
 */
export function PageHeader({
  title,
  action,
  backHref,
}: {
  title: string;
  action?: ReactNode;
  backHref?: string;
}) {
  const router = useRouter();

  return (
    // No negative margins: this bar is a direct child of <main>, so pulling it
    // 15px wider than its container pushed the whole page into a horizontal
    // scroll — which then clipped the sidebar's last row behind the scrollbar.
    <div className="flex h-[50px] items-center justify-between gap-3 border-b border-border bg-surface px-[15px]">
      {backHref ? (
        <Link
          href={backHref}
          className="flex touch-target items-center text-fg"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => router.back()}
          className="flex touch-target items-center text-fg"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </button>
      )}
      <h1 className="flex-1 truncate text-base font-semibold text-fg">{title}</h1>
      <div className="flex items-center">{action}</div>
    </div>
  );
}

/**
 * Consistent page padding for the content column.
 *
 * `default` keeps a single-column reading width, which is what a focused flow
 * (deposit, withdraw, convert) wants. `wide` opens the column up for screens
 * that lay their cards out in a grid.
 */
export function PageBody({
  children,
  width = 'default',
  className,
}: {
  children: ReactNode;
  width?: 'default' | 'wide';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'w-full space-y-[15px] p-[15px]',
        width === 'wide' ? 'max-w-[1400px]' : 'max-w-4xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
