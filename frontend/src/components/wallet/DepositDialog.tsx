'use client';

/**
 * Deposits go through the receptionist, not a form.
 *
 * Every "Deposit" control in the customer app opens this dialog instead of a
 * deposit screen: it tells the customer to contact the receptionist and takes
 * them to Support. The provider sits in `AppShell`, so any control rendered
 * inside the shell can open it — `DepositButton` for a plain button, or
 * `useDepositDialog` for custom markup.
 */
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { Modal } from '@/components/ui/overlay';
import { Button } from '@/components/ui/primitives';

const DepositDialogContext = createContext<() => void>(() => {});

/** Returns a function that opens the deposit dialog. */
export function useDepositDialog() {
  return useContext(DepositDialogContext);
}

export function DepositDialogProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  return (
    <DepositDialogContext.Provider value={show}>
      {children}
      <Modal
        open={open}
        onClose={close}
        title="Deposit"
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={close}>
              Close
            </Button>
            <Button
              fullWidth
              onClick={() => {
                close();
                router.push('/support');
              }}
            >
              Contact receptionist
            </Button>
          </div>
        }
      >
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <span
            aria-hidden
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <LifeBuoy className="h-7 w-7" />
          </span>
          <p className="text-base font-semibold text-fg">
            Please contact the receptionist to make a deposit.
          </p>
          <p className="text-sm text-muted">
            Deposits are added to your account by our receptionist. Reach them through Support and
            they will take care of it for you.
          </p>
        </div>
      </Modal>
    </DepositDialogContext.Provider>
  );
}

/** A button that opens the deposit dialog. Must render inside `AppShell`. */
export function DepositButton({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const openDeposit = useDepositDialog();
  return (
    <button type="button" onClick={openDeposit} className={className}>
      {children}
    </button>
  );
}
