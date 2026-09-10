import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import './globals.css';

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'CryptoDemo Exchange';

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description:
    `${APP_NAME} is a paper-trading simulation. All balances, trades, deposits ` +
    'and withdrawals are simulated — no real cryptocurrency is held, transferred ' +
    'or withdrawn, and no blockchain transaction is ever created.',
  applicationName: APP_NAME,
  icons: { icon: '/brand/favicon.svg' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom stays available; capping it at 5 keeps the layout usable while
  // still meeting the "do not block zoom" accessibility rule.
  maximumScale: 5,
  // Without `cover`, `env(safe-area-inset-*)` resolves to zero on iOS and the
  // notch and home indicator overlap the fixed shell.
  viewportFit: 'cover',
  themeColor: '#f2f2f2',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-[70] rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Skip to main content
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
