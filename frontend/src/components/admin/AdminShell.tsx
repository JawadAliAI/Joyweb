'use client';

/**
 * Administration shell.
 *
 * Gates the whole `/admin` segment behind `useRequireAdmin()` — an unauthenticated
 * visitor is sent to sign-in and a plain customer is sent back to the app — and
 * lays out the sidebar, header and content column.
 */
import { useState } from 'react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { ErrorState, Skeleton } from '@/components/ui/primitives';
import { useRequireAdmin } from '@/hooks/useSession';
import { AdminHeader, AdminTitleProvider } from './AdminHeader';
import { AdminSidebar } from './AdminSidebar';

function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-bg p-6" role="status" aria-label="Loading administration">
      <Skeleton className="h-12 w-full" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="mt-4 h-72 w-full" />
    </div>
  );
}

/** The admin sign-in page lives inside /admin but must not be gated by it. */
export const ADMIN_LOGIN_PATH = '/admin/login';

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useRequireAdmin({ enabled: pathname !== ADMIN_LOGIN_PATH });
  const [navOpen, setNavOpen] = useState(false);

  // Rendered bare: no sidebar, no guard, or nobody could ever sign in.
  if (pathname === ADMIN_LOGIN_PATH) return <>{children}</>;

  if (session.isLoading) return <ShellSkeleton />;

  if (!session.user) {
    // `useRequireAdmin` has already started the redirect; this is the interim frame.
    return <ShellSkeleton />;
  }

  if (session.user.role === 'USER') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-6">
        <ErrorState
          title="Administrator access only"
          description="This area is limited to administrators. Redirecting you back to the app."
        />
      </div>
    );
  }

  return (
    <AdminTitleProvider>
      <div className="flex min-h-screen bg-bg">
        <AdminSidebar open={navOpen} onClose={() => setNavOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader onOpenNav={() => setNavOpen(true)} />
          <main id="main" className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
            {children}
          </main>
        </div>
      </div>
    </AdminTitleProvider>
  );
}
