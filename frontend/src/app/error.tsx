'use client';

/**
 * Route-level error boundary.
 *
 * Shows the message the API produced (never a stack trace) and offers a retry
 * that re-renders the segment.
 */
import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/primitives';
import { errorMessage } from '@/lib/api';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error(error);
  }, [error]);

  return (
    <main
      role="alert"
      className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center"
    >
      <AlertTriangle className="h-10 w-10 text-warning" aria-hidden />
      <h1 className="text-lg font-semibold text-fg">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted">
        {errorMessage(error, 'This screen could not be loaded. Please try again.')}
      </p>
      {error.digest && (
        <p className="tabular text-[11px] text-subtle">Reference: {error.digest}</p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={() => reset()}>Try again</Button>
        <Link
          href="/home"
          className="flex touch-target items-center rounded-control px-4 text-sm font-semibold text-muted hover:text-fg"
        >
          Go home
        </Link>
      </div>
    </main>
  );
}
