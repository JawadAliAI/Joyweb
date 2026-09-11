'use client';

/**
 * Assets overview: the demo spot balance plus a per-asset breakdown.
 * Every figure comes from `/api/wallet` — nothing here is hard-coded.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Wallet } from 'lucide-react';
import { AppShell, PageBody } from '@/components/layout/AppShell';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import { BalanceCard } from '@/components/wallet/BalanceCard';
import { DepositButton } from '@/components/wallet/DepositDialog';
import { AssetCard } from '@/components/wallet/AssetCard';
import { usePortfolio } from '@/hooks/useSession';
import { errorMessage } from '@/lib/api';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { EmptyState, ErrorState, ListSkeleton } from '@/components/ui/primitives';

const TABS = [{ value: 'spot', label: 'Spot' }];

export default function AssetsPage() {
  const [tab, setTab] = useState('spot');
  const portfolio = usePortfolio();

  return (
    <AppShell>
      <PageBody width="wide">
        <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="Account sections" />

        <TabPanel value="spot" active={tab === 'spot'} className="space-y-4">
          <BalanceCard />

          <SimulationNotice>
            All balances are simulated demo credits for paper trading. They hold no monetary
            value and cannot be withdrawn to a real wallet.
          </SimulationNotice>

          <section aria-labelledby="assets-details" className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 id="assets-details" className="text-base font-semibold text-fg">
                Details
              </h2>
              <Link
                href="/assets/history"
                className="touch-target inline-flex items-center px-2 text-sm font-medium text-primary"
              >
                History
              </Link>
            </div>

            {portfolio.isLoading ? (
              <ListSkeleton rows={4} />
            ) : portfolio.isError ? (
              <ErrorState
                title="Could not load your assets"
                description={errorMessage(portfolio.error)}
                onRetry={() => void portfolio.refetch()}
              />
            ) : !portfolio.data || portfolio.data.assets.length === 0 ? (
              <EmptyState
                icon={<Wallet className="h-8 w-8" aria-hidden />}
                title="No assets available"
                description="Contact the receptionist to fund your account."
                action={
                  <DepositButton className="touch-target inline-flex items-center rounded-pill bg-primary px-5 text-sm font-semibold text-primary-foreground">
                    Deposit
                  </DepositButton>
                }
              />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {portfolio.data.assets.map((asset) => (
                  <li key={asset.asset}>
                    <AssetCard asset={asset} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabPanel>
      </PageBody>
    </AppShell>
  );
}
