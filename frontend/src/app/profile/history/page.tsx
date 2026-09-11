'use client';

/** Demo ledger history reached from the profile menu. */
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { TransactionList } from '@/components/wallet/TransactionList';

export default function ProfileHistoryPage() {
  return (
    <AppShell>
      <PageHeader title="Transaction history" backHref="/profile" />
      <PageBody width="wide">
        <TransactionList />
      </PageBody>
    </AppShell>
  );
}
