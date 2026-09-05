'use client';

/** Demo ledger history reached from the profile menu. */
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { SimulationNotice } from '@/components/layout/DemoBadge';
import { TransactionList } from '@/components/wallet/TransactionList';

export default function ProfileHistoryPage() {
  return (
    <AppShell>
      <PageHeader title="Transaction history" backHref="/profile" />
      <PageBody>
        <SimulationNotice>
          Every entry below is a simulated movement of demo credits recorded for paper trading.
        </SimulationNotice>
        <TransactionList />
      </PageBody>
    </AppShell>
  );
}
