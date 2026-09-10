'use client';

import { useEffect } from 'react';

/**
 * Hold the document still while a full-screen shell is mounted.
 *
 * All three shells are `fixed inset-0`, so the document behind them has nothing
 * to scroll and should measure exactly one viewport. When something does push
 * it taller — a stray absolutely-positioned child, a browser that reports a
 * visual viewport smaller than the layout one, an extension injecting into the
 * page — the document scrolls behind the shell and the page ground shows below
 * it as a band of empty grey. Locking `html` and `body` makes that impossible
 * rather than relying on nothing ever overflowing.
 *
 * Sign-in, registration and error screens scroll normally, so the lock is
 * applied per shell instance and lifted the moment one unmounts.
 */
export function useDocumentScrollLock(enabled = true): void {
  useEffect(() => {
    if (!enabled) return undefined;
    const root = document.documentElement;
    root.classList.add('shell-locked');
    return () => root.classList.remove('shell-locked');
  }, [enabled]);
}
