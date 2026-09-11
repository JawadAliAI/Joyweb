'use client';

/**
 * Deposit. Customers do not fund their own accounts — the receptionist does.
 *
 * Every Deposit control in the app opens the receptionist dialog instead of
 * coming here; this page is what a direct visit to /assets/deposit shows, with
 * the same message and the same way to reach them.
 */
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { Button, Card, CardBody } from '@/components/ui/primitives';

export default function DepositPage() {
  const router = useRouter();

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Deposit" backHref="/assets" />
      <PageBody>
        <Card>
          <CardBody className="flex flex-col items-center gap-3 py-8 text-center">
            <span
              aria-hidden
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
            >
              <LifeBuoy className="h-7 w-7" />
            </span>
            <h2 className="text-base font-semibold text-fg">
              Please contact the receptionist to make a deposit.
            </h2>
            <p className="max-w-sm text-sm text-muted">
              Deposits are added to your account by our receptionist. Reach them through Support and
              they will take care of it for you.
            </p>
            <Button className="mt-2" onClick={() => router.push('/support')}>
              Contact receptionist
            </Button>
          </CardBody>
        </Card>
      </PageBody>
    </AppShell>
  );
}
