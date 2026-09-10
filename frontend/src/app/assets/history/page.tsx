'use client';

/** Demo ledger history for the assets area. */
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import { TransactionList } from '@/components/wallet/TransactionList';

export default function AssetsHistoryPage() {
  return (
    <AppShell>
      <PageHeader title="Transaction history" backHref="/assets" />
      <PageBody width="wide">
        <SimulationNotice>
          Every entry below is a simulated movement of demo credits recorded for paper trading.
        </SimulationNotice>
        <TransactionList />
      </PageBody>
    </AppShell>
  );
}
