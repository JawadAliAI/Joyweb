'use client';

/**
 * Toast notifications.
 *
 * Messages are announced through a polite live region so screen-reader users
 * hear the outcome of an action they just took.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cn } from '@/lib/format';

type ToastTone = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (toast: Omit<Toast, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<ToastTone, { icon: ReactNode; ring: string }> = {
  success: { icon: <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />, ring: 'border-primary/40' },
  error: { icon: <XCircle className="h-4 w-4 text-danger" aria-hidden />, ring: 'border-danger/40' },
  warning: { icon: <AlertTriangle className="h-4 w-4 text-warning" aria-hidden />, ring: 'border-warning/40' },
  info: { icon: <Info className="h-4 w-4 text-muted" aria-hidden />, ring: 'border-border' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = ++nextId.current;
      setToasts((current) => [...current, { ...input, id }].slice(-3));
      window.setTimeout(() => dismiss(id), 5000);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (title, description) => toast({ tone: 'success', title, description }),
      error: (title, description) => toast({ tone: 'error', title, description }),
      info: (title, description) => toast({ tone: 'info', title, description }),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              'pointer-events-auto w-full max-w-sm animate-slide-up rounded-card border bg-elevated px-4 py-3 shadow-raised',
              TONE_STYLES[item.tone].ring,
            )}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5">{TONE_STYLES[item.tone].icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-fg">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-muted">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-muted hover:text-fg"
                aria-label="Dismiss notification"
              >
                <XCircle className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}
