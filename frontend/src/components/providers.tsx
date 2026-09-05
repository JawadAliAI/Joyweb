'use client';

/**
 * Application providers: data fetching, branding and toasts.
 *
 * Branding is fetched once from `/api/platform/config` and written into CSS
 * variables, so an administrator changing the primary colour re-themes the
 * whole product without a rebuild.
 */
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, api } from '@/lib/api';
import type { PlatformConfig } from '@/lib/types';
import { ToastProvider } from '@/components/ui/toast';

const FALLBACK_CONFIG: PlatformConfig = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'CryptoDemo Exchange',
  logoUrl: '/brand/logo.svg',
  faviconUrl: '/brand/favicon.svg',
  primaryColor: '#18B887',
  secondaryColor: '#F0B90B',
  supportEmail: 'support@cryptodemo.example',
  displayCurrency: 'USD',
  demoLabel: process.env.NEXT_PUBLIC_DEMO_LABEL || 'DEMO / PAPER TRADING',
  demoMode: true,
  maintenanceMode: false,
  maintenanceMessage: 'Platform is currently under maintenance.',
  tradingEnabled: true,
  withdrawalsEnabled: true,
  depositsEnabled: true,
  transfersEnabled: true,
  conversionsEnabled: true,
};

const PlatformContext = createContext<{ config: PlatformConfig; loading: boolean }>({
  config: FALLBACK_CONFIG,
  loading: true,
});

export function usePlatform() {
  return useContext(PlatformContext);
}

/** "#18B887" -> "24 184 135", the channel triplet the CSS variables expect. */
function hexToChannels(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const value = parseInt(match[1], 16);
  return `${(value >> 16) & 255} ${(value >> 8) & 255} ${value & 255}`;
}

function PlatformProvider({ children }: { children: ReactNode }) {
  const { data, isLoading } = useQuery({
    queryKey: ['platform-config'],
    queryFn: () => api.get<PlatformConfig>('/platform/config'),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const config = data ?? FALLBACK_CONFIG;

  useEffect(() => {
    const root = document.documentElement;
    const primary = hexToChannels(config.primaryColor);
    const secondary = hexToChannels(config.secondaryColor);
    if (primary) root.style.setProperty('--color-primary', primary);
    if (secondary) root.style.setProperty('--color-secondary', secondary);
  }, [config.primaryColor, config.secondaryColor]);

  useEffect(() => {
    document.title = config.appName;
  }, [config.appName]);

  return (
    <PlatformContext.Provider value={{ config, loading: isLoading }}>
      {children}
    </PlatformContext.Provider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Never retry an auth failure — the app redirects to sign-in instead.
              if (error instanceof ApiError && (error.isAuthError || error.status === 403)) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <PlatformProvider>
        <ToastProvider>{children}</ToastProvider>
      </PlatformProvider>
    </QueryClientProvider>
  );
}
