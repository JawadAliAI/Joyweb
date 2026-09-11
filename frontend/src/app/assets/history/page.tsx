'use client';

/** Demo ledger history for the assets area. */
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { TransactionList } from '@/components/wallet/TransactionList';

export default function AssetsHistoryPage() {
  return (
    <AppShell>
      <PageHeader title="Transaction history" backHref="/assets" />
      <PageBody width="wide">
        <TransactionList />
      </PageBody>
    </AppShell>
  );
}
