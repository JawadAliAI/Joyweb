/**
 * Route-level loading skeleton.
 *
 * Mirrors the home layout — header, balance card, ticker, tile grid — so the
 * page does not jump when the real content arrives.
 */
import { Skeleton } from '@/components/ui/primitives';

export default function Loading() {
  return (
    <div className="min-h-screen bg-bg" role="status" aria-label="Loading">
      <div className="h-14 border-b border-border bg-surface" />
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-44 w-full rounded-card" />
        <Skeleton className="h-24 w-full rounded-card" />
        <div className="grid grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-card" />
          ))}
        </div>
        <Skeleton className="h-40 w-full rounded-card" />
      </div>
      <span className="sr-only">Loading</span>
    </div>
  );
}
