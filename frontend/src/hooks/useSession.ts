'use client';

/**
 * Session and shared data hooks.
 *
 * `useSession` is the single source of truth for who is signed in. Nothing in
 * the UI hard-codes a name, balance or score — every screen reads the
 * authenticated user's own data from the API.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ApiError, api } from '@/lib/api';
import type {
  Notification, Paged, Portfolio, SessionUser, Transaction,
} from '@/lib/types';

export const sessionKey = ['session'] as const;

export function useSession() {
  const query = useQuery({
    queryKey: sessionKey,
    queryFn: () => api.get<SessionUser>('/auth/me'),
    retry: false,
    staleTime: 60_000,
  });

  const unauthenticated =
    query.isError && query.error instanceof ApiError && query.error.isAuthError;

  return {
    user: query.data ?? null,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data),
    unauthenticated,
    error: query.error,
    refetch: query.refetch,
  };
}

/** Redirects to sign-in when the visitor has no session. */
export function useRequireAuth(redirectTo = '/login') {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!session.isLoading && session.unauthenticated) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/';
      router.replace(`${redirectTo}?next=${encodeURIComponent(next)}`);
    }
  }, [session.isLoading, session.unauthenticated, router, redirectTo]);

  return session;
}

/**
 * Redirects anyone who is not an administrator away from the admin area.
 *
 * `enabled: false` turns the guard off for the admin sign-in page, which lives
 * inside the segment it protects.
 */
export function useRequireAdmin({ enabled = true }: { enabled?: boolean } = {}) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!enabled || session.isLoading) return;
    if (session.unauthenticated) {
      const next = typeof window !== 'undefined' ? window.location.pathname : '/admin';
      router.replace(`/admin/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (session.user && session.user.role === 'USER') {
      router.replace('/');
    }
  }, [enabled, session.isLoading, session.unauthenticated, session.user, router]);

  return session;
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => api.post<Record<string, never>>('/auth/logout'),
    onSettled: () => {
      queryClient.clear();
      router.replace('/login');
    },
  });
}

export function usePortfolio() {
  return useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.get<Portfolio>('/wallet'),
    staleTime: 10_000,
  });
}

export function useTransactions(params: {
  page?: number;
  pageSize?: number;
  type?: string;
  asset?: string;
} = {}) {
  return useQuery({
    queryKey: ['transactions', params],
    queryFn: () => api.get<Paged<Transaction>>('/wallet/history', params),
  });
}

export function useNotifications(unreadOnly = false) {
  return useQuery({
    queryKey: ['notifications', unreadOnly],
    queryFn: () => api.get<Paged<Notification>>('/notifications', { unreadOnly }),
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => api.get<{ unread: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
  });
}

/**
 * Invalidates everything a balance change can affect.
 * Call after any deposit, withdrawal, transfer, conversion or trade.
 */
export function useRefreshBalances() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    void queryClient.invalidateQueries({ queryKey: ['trades'] });
    void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  };
}
