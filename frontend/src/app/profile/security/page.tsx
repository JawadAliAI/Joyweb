'use client';

/**
 * Security settings: login password and fund password.
 *
 * Passwords are write-only here — nothing is ever fetched, displayed or echoed
 * back, and the fields are cleared as soon as a change succeeds.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { useSession } from '@/hooks/useSession';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import { FormError, FormSuccess, PasswordInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';

/** Mirrors the backend policy exactly: at least 5 characters, a letter and a digit. */
const PASSWORD_RULES = [
  { label: 'At least 5 characters', test: (value: string) => value.length >= 5 },
  { label: 'Contains a letter', test: (value: string) => /[A-Za-z]/.test(value) },
  { label: 'Contains a digit', test: (value: string) => /\d/.test(value) },
];

/** Fund password policy: 6 to 64 characters. */
const FUND_RULES = [
  { label: 'Between 6 and 64 characters', test: (value: string) => value.length >= 6 && value.length <= 64 },
];

function RuleList({ rules, value }: { rules: typeof PASSWORD_RULES; value: string }) {
  return (
    <ul className="space-y-1" aria-live="polite">
      {rules.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.label} className="flex items-center gap-2 text-xs">
            {met ? (
              <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
            ) : (
              <X className="h-3.5 w-3.5 text-subtle" aria-hidden />
            )}
            <span className={cn(met ? 'text-primary' : 'text-muted')}>{rule.label}</span>
            <span className="sr-only">{met ? 'requirement met' : 'requirement not met'}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function SecurityPage() {
  const session = useSession();
  const toast = useToast();
  const router = useRouter();

  // An administrator's starting password is changed in the admin panel, never
  // here: this page belongs to the customer app.
  const mustChange = session.user?.mustChangePassword ?? false;
  const isAdmin = session.user?.role === 'ADMIN' || session.user?.role === 'SUPER_ADMIN';
  useEffect(() => {
    if (mustChange && isAdmin) router.replace('/admin/password');
  }, [mustChange, isAdmin, router]);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [passwordFormError, setPasswordFormError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const [loginPasswordForFund, setLoginPasswordForFund] = useState('');
  const [fundPassword, setFundPassword] = useState('');
  const [fundConfirm, setFundConfirm] = useState('');
  const [fundErrors, setFundErrors] = useState<Record<string, string>>({});
  const [fundFormError, setFundFormError] = useState<string | null>(null);
  const [fundSuccess, setFundSuccess] = useState<string | null>(null);

  const hasFundPassword = session.user?.hasFundPassword ?? false;

  const changePassword = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api.post<Record<string, never>>('/auth/change-password', body),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSuccess('Your password has been changed.');
      void session.refetch();
      toast.success('Password changed');
    },
    onError: (error) => setPasswordFormError(errorMessage(error)),
  });

  const setFundPasswordMutation = useMutation({
    mutationFn: (body: { currentPassword: string; fundPassword: string }) =>
      api.post<Record<string, never>>('/auth/fund-password', body),
    onSuccess: () => {
      setLoginPasswordForFund('');
      setFundPassword('');
      setFundConfirm('');
      setFundSuccess('Your fund password has been saved.');
      void session.refetch();
      toast.success('Fund password saved');
    },
    onError: (error) => setFundFormError(errorMessage(error)),
  });

  const submitPassword = () => {
    const next: Record<string, string> = {};
    if (!currentPassword) next.currentPassword = 'Enter your current password.';
    if (!PASSWORD_RULES.every((rule) => rule.test(newPassword))) {
      next.newPassword = 'Password does not meet the requirements below.';
    }
    if (newPassword && newPassword === currentPassword) {
      next.newPassword = 'Choose a password different from your current one.';
    }
    if (confirmPassword !== newPassword) next.confirmPassword = 'Passwords do not match.';
    setPasswordErrors(next);
    if (Object.keys(next).length > 0) return;
    setPasswordFormError(null);
    setPasswordSuccess(null);
    changePassword.mutate({ currentPassword, newPassword });
  };

  const submitFundPassword = () => {
    const next: Record<string, string> = {};
    if (!loginPasswordForFund) next.loginPassword = 'Enter your login password to confirm.';
    if (!FUND_RULES.every((rule) => rule.test(fundPassword))) {
      next.fundPassword = 'Fund password must be 6 to 64 characters.';
    }
    if (fundConfirm !== fundPassword) next.fundConfirm = 'Fund passwords do not match.';
    setFundErrors(next);
    if (Object.keys(next).length > 0) return;
    setFundFormError(null);
    setFundSuccess(null);
    setFundPasswordMutation.mutate({
      currentPassword: loginPasswordForFund,
      fundPassword,
    });
  };

  return (
    <AppShell hideBottomNav>
      <PageHeader title="Security" backHref="/profile" />
      <PageBody width="wide">
        {mustChange && (
          <div
            role="alert"
            className="rounded-card border border-warning/40 bg-warning/10 px-4 py-3"
          >
            <p className="text-sm font-semibold text-warning">
              Set a new password to continue
            </p>
            <p className="mt-1 text-xs leading-relaxed text-warning/90">
              This account still uses a temporary password. Choose a new one to keep
              your account secure.
            </p>
          </div>
        )}
        <div className="grid items-start gap-4 md:grid-cols-2">
          <Card>
            <CardHeader
              title="Change password"
              description="Used to sign in to your account."
            />
            <CardBody className="space-y-4 pt-3">
              <PasswordInput
                label="Current password"
                autoComplete="current-password"
                value={currentPassword}
                error={passwordErrors.currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
              <PasswordInput
                label="New password"
                autoComplete="new-password"
                value={newPassword}
                error={passwordErrors.newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <RuleList rules={PASSWORD_RULES} value={newPassword} />
              <PasswordInput
                label="Confirm new password"
                autoComplete="new-password"
                value={confirmPassword}
                error={passwordErrors.confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              <FormError message={passwordFormError} />
              <FormSuccess message={passwordSuccess} />
              <Button fullWidth loading={changePassword.isPending} onClick={submitPassword}>
                Change password
              </Button>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={hasFundPassword ? 'Replace fund password' : 'Set fund password'}
              description="Required to confirm withdrawals and transfers."
              action={
                <Badge tone={hasFundPassword ? 'success' : 'warning'}>
                  {hasFundPassword ? 'Set' : 'Not set'}
                </Badge>
              }
            />
            <CardBody className="space-y-4 pt-3">
              <PasswordInput
                label="Login password"
                autoComplete="current-password"
                value={loginPasswordForFund}
                error={fundErrors.loginPassword}
                hint="Confirms it is really you before the fund password changes."
                onChange={(event) => setLoginPasswordForFund(event.target.value)}
              />
              <PasswordInput
                label="Fund password"
                autoComplete="new-password"
                value={fundPassword}
                error={fundErrors.fundPassword}
                onChange={(event) => setFundPassword(event.target.value)}
              />
              <RuleList rules={FUND_RULES} value={fundPassword} />
              <PasswordInput
                label="Confirm fund password"
                autoComplete="new-password"
                value={fundConfirm}
                error={fundErrors.fundConfirm}
                onChange={(event) => setFundConfirm(event.target.value)}
              />
              <FormError message={fundFormError} />
              <FormSuccess message={fundSuccess} />
              <Button
                fullWidth
                loading={setFundPasswordMutation.isPending}
                onClick={submitFundPassword}
              >
                {hasFundPassword ? 'Replace fund password' : 'Set fund password'}
              </Button>
              <p className="text-xs text-muted">
                Your passwords are never displayed back to you and are not stored in this browser.
              </p>
            </CardBody>
          </Card>
        </div>
      </PageBody>
    </AppShell>
  );
}
