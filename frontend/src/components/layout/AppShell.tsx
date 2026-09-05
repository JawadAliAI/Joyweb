'use client';

/**
 * Customer application shell.
 *
 * Guards the session, enforces maintenance mode for non-administrators, and
 * lays out header + sidebar/bottom-nav around each page. Mobile-first: the
 * bottom bar is always visible and the content area reserves space for it.
 */
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/format';
import { usePlatform } from '@/components/providers';
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

  if (isLoading || (!user && !unauthenticated)) {
    return (
      <div className="min-h-screen bg-bg p-4">
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
      <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-center">
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
    <div className="min-h-screen bg-bg">
      <AppHeader />
      <div className="mx-auto flex max-w-6xl">
        <DesktopSidebar />
        <main
          id="main"
          className={cn(
            'min-w-0 flex-1',
            hideBottomNav ? 'pb-6' : 'pb-[calc(var(--bottom-nav-height)+16px)] lg:pb-8',
          )}
        >
          {showRestrictionNotice && user.status !== 'ACTIVE' && (
            <div className="px-4 pt-4">
              <RestrictionNotice reason={user.freezeReason} />
            </div>
          )}
          {children}
        </main>
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
    <div className="flex h-14 items-center justify-between gap-3 border-b border-border px-4">
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

/** Consistent page padding for the mobile-first content column. */
export function PageBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('space-y-4 px-4 py-4', className)}>{children}</div>;
}
