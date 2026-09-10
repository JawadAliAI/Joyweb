'use client';

/**
 * Account profile.
 *
 * The "credit score" here is an internal demo-account score invented for this
 * simulation. It is explicitly labelled as such: it is not a credit-bureau
 * score, is not reported to anyone, and affects nothing outside this demo.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, LogOut, Pencil } from 'lucide-react';
import { AppShell, PageBody, PageHeader } from '@/components/layout/AppShell';
import { DemoBadge } from '@/components/layout/DemoBadge';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLogout, useSession, sessionKey } from '@/hooks/useSession';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { ConfirmModal, Modal } from '@/components/ui/overlay';
import { FormError, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  DataRow,
  Divider,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives';
import type { SessionUser } from '@/lib/types';
import { KycStatusBadge } from '@/components/profile/KycStatusBadge';
import { useKyc } from '@/app/profile/kyc/hooks';

function initialsOf(user: SessionUser): string {
  const source = `${user.firstName} ${user.lastName}`.trim() || user.username;
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

const MENU = [
  { href: '/assets/history', label: 'Transaction History' },
  { href: '/profile/trades', label: 'Trading History' },
  { href: '/profile/security', label: 'Change Password' },
  { href: '/profile/kyc', label: 'Identity verification (KYC)' },
  { href: '/support', label: 'Support' },
];

export default function ProfilePage() {
  const session = useSession();
  const logout = useLogout();
  const toast = useToast();

  const queryClient = useQueryClient();
  const kyc = useKyc();

  const [logoutOpen, setLogoutOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', username: '' });
  const [editError, setEditError] = useState<string | null>(null);

  const user = session.user;

  // Seed the form from the live session whenever the dialog opens, so it never
  // shows a stale value after a previous edit.
  useEffect(() => {
    if (editOpen && user) {
      setForm({
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
      });
      setEditError(null);
    }
  }, [editOpen, user]);

  const updateProfile = useMutation({
    mutationFn: (body: { firstName: string; lastName: string; username: string }) =>
      api.patch<SessionUser>('/auth/profile', body),
    onSuccess: (updated) => {
      queryClient.setQueryData(sessionKey, updated);
      setEditOpen(false);
      toast.success('Profile updated');
    },
    onError: (error) => setEditError(errorMessage(error)),
  });

  const submitProfile = () => {
    if (!form.firstName.trim()) {
      setEditError('Enter your first name.');
      return;
    }
    if (form.username.trim().length < 3) {
      setEditError('Username must be at least 3 characters.');
      return;
    }
    setEditError(null);
    updateProfile.mutate({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      username: form.username.trim(),
    });
  };

  return (
    <AppShell>
      <PageHeader title="Profile" backHref="/" action={<DemoBadge compact />} />
      <PageBody width="wide">
        {session.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : session.error && !user ? (
          <ErrorState
            title="Could not load your profile"
            description={errorMessage(session.error)}
            onRetry={() => void session.refetch()}
          />
        ) : user ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="md:col-span-2">
              <CardBody className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary"
                >
                  {initialsOf(user)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-semibold text-fg">{user.fullName}</p>
                  <p className="truncate text-xs text-muted">@{user.username}</p>
                  <p className="truncate text-xs text-muted">{user.email}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge tone={user.status === 'ACTIVE' ? 'success' : 'danger'}>
                    {user.status}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditOpen(true)}
                    aria-label="Edit profile"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Edit
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Account" />
              <CardBody className="pt-1">
                <DataRow
                  label="Account ID"
                  value={<span className="font-mono text-xs">{user.id}</span>}
                />
                <Divider />
                <DataRow label="Account status" value={user.status} />
                <Divider />
                <DataRow label="Registered" value={formatDateTime(user.createdAt)} />
                <Divider />
                <DataRow label="Last sign-in" value={formatDateTime(user.lastLoginAt)} />
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Demo credit score" />
              <CardBody className="pt-1">
                <DataRow label="Score" tone="strong" value={user.creditScore} />
                <Divider />
                <DataRow label="Band" value={user.creditScoreBand} />
                <p className="mt-3 rounded-control bg-primary/10 px-3 py-2 text-xs leading-relaxed text-primary">
                  This is an internal demo account score used only inside this paper-trading
                  simulator. It is <strong className="font-bold">not</strong> a credit-bureau
                  score, is not reported to any agency, and has no effect on your real-world
                  credit or finances.
                </p>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title="Identity verification"
                description="Simulated only — this demo performs no real identity checks."
                action={
                  <Link href="/profile/kyc" className="text-xs font-medium text-primary">
                    Manage
                  </Link>
                }
              />
              <CardBody className="pt-1">
                {kyc.isLoading ? (
                  <Skeleton className="h-14 w-full" />
                ) : kyc.data ? (
                  <>
                    <DataRow
                      label="Basic"
                      value={<KycStatusBadge status={kyc.data.basicStatus} />}
                    />
                    <Divider />
                    <DataRow
                      label="Advanced"
                      value={<KycStatusBadge status={kyc.data.advancedStatus} />}
                    />
                  </>
                ) : (
                  <p className="py-2 text-xs text-muted">
                    Verification status is unavailable right now.
                  </p>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Security" />
              <CardBody className="pt-1">
                <DataRow
                  label="Fund password"
                  value={
                    <Badge tone={user.hasFundPassword ? 'success' : 'warning'}>
                      {user.hasFundPassword ? 'Set' : 'Not set'}
                    </Badge>
                  }
                />
                <Divider />
                <DataRow
                  label="Password change required"
                  value={user.mustChangePassword ? 'Yes' : 'No'}
                />
                <Link
                  href="/profile/security"
                  className="mt-3 flex touch-target items-center justify-between rounded-control bg-surface px-3.5 text-sm font-medium text-fg"
                >
                  Security settings
                  <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                </Link>
              </CardBody>
            </Card>

            <Card className="md:col-span-2">
              <CardBody className="space-y-2">
                <nav aria-label="Account links">
                  <ul className="space-y-2">
                    {MENU.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className="flex touch-target items-center justify-between rounded-control bg-surface px-3.5 text-sm font-medium text-fg"
                        >
                          {item.label}
                          <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
                <Button variant="danger" fullWidth onClick={() => setLogoutOpen(true)}>
                  <LogOut className="h-4 w-4" aria-hidden />
                  Logout
                </Button>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </PageBody>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit profile"
        description="Your email address cannot be changed here."
        footer={
          <div className="flex gap-3">
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setEditOpen(false)}
              disabled={updateProfile.isPending}
            >
              Cancel
            </Button>
            <Button fullWidth onClick={submitProfile} loading={updateProfile.isPending}>
              Save changes
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="First name"
            value={form.firstName}
            autoComplete="given-name"
            onChange={(event) =>
              setForm((current) => ({ ...current, firstName: event.target.value }))
            }
          />
          <Input
            label="Last name"
            value={form.lastName}
            autoComplete="family-name"
            onChange={(event) =>
              setForm((current) => ({ ...current, lastName: event.target.value }))
            }
          />
          <Input
            label="Username"
            value={form.username}
            autoComplete="username"
            hint="3-32 characters: letters, digits, dot, dash or underscore."
            onChange={(event) =>
              setForm((current) => ({ ...current, username: event.target.value }))
            }
          />
          <FormError message={editError} />
        </div>
      </Modal>

      <ConfirmModal
        open={logoutOpen}
        onClose={() => setLogoutOpen(false)}
        onConfirm={() => logout.mutate()}
        title="Log out?"
        description="You will need to sign in again to reach your demo account."
        confirmLabel="Log out"
        confirmVariant="danger"
        loading={logout.isPending}
      />
    </AppShell>
  );
}
