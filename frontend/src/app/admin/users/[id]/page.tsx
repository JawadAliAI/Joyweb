'use client';

/**
 * Demo user detail and administrative actions.
 *
 * Every action here is reason-gated and audit-logged by the backend. Two things
 * are deliberately impossible and are stated as such in the UI:
 *   * an administrator can never see or set a customer's password — the only
 *     recovery path issues a one-time reset link;
 *   * the credit score is an internal demo score invented by this simulator,
 *     not a credit-bureau score.
 */
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Snowflake, Sun } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import {
  assetLabel, formatAmount, formatDateTime, transactionLabel,
} from '@/lib/format';
import type {
  AdminTransaction, AdminUserDetail, AdminPage as ApiPage, AuditLogEntry,
  BalanceAdjustResult, CreditScoreResult, FreezeResult, PasswordResetResult,
} from '@/lib/admin-types';
import {
  Badge, Button, Card, CardBody, CardHeader, DataRow, Divider, ErrorState, ListSkeleton,
} from '@/components/ui/primitives';
import { Input, Select } from '@/components/ui/form';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { ReasonDialog } from '@/components/admin/ReasonDialog';
import { DataTable } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';

type DialogKind =
  | 'freeze' | 'unfreeze' | 'credit' | 'debit' | 'score' | 'reset'
  | 'flagTest' | 'unflagTest' | 'forceWin' | 'forceLoss' | 'forceDraw' | null;

const TABS = [
  { value: 'profile', label: 'Profile' },
  { value: 'wallet', label: 'Wallet' },
  { value: 'transactions', label: 'Transactions' },
  { value: 'trades', label: 'Trades' },
  { value: 'security', label: 'Security' },
  { value: 'score', label: 'Credit Score' },
  { value: 'audit', label: 'Audit Logs' },
];

export default function AdminUserDetailPage() {
  const params = useParams<{ id: string }>();
  const userId = params?.id ?? '';
  const toast = useToast();
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('profile');
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [asset, setAsset] = useState('');
  const [amount, setAmount] = useState('');
  const [score, setScore] = useState('');
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.get<AdminUserDetail>(`/admin/users/${userId}`),
    enabled: Boolean(userId),
  });

  useAdminPage(
    detail.data ? detail.data.profile.fullName || detail.data.profile.username : 'User',
    detail.data ? detail.data.profile.email : undefined,
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'user-transactions', userId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'user-audit', userId] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    void queryClient.invalidateQueries({ queryKey: ['admin', 'credit-scores'] });
  };

  const closeDialog = () => {
    setDialog(null);
    setDialogError(null);
  };

  const onError = (error: unknown) => {
    const message = errorMessage(error);
    setDialogError(message);
    toast.error('Action failed', message);
  };

  const freeze = useMutation({
    mutationFn: (reason: string) =>
      api.post<FreezeResult>(`/admin/users/${userId}/freeze`, { reason }),
    onSuccess: (result) => {
      toast.success('Account frozen', result.message);
      invalidate();
      closeDialog();
    },
    onError,
  });

  const unfreeze = useMutation({
    mutationFn: (reason: string) =>
      api.post<FreezeResult>(`/admin/users/${userId}/unfreeze`, { reason }),
    onSuccess: (result) => {
      toast.success('Account restored', result.message);
      invalidate();
      closeDialog();
    },
    onError,
  });

  // Flagging is what makes scripted QA outcomes possible on an account. It is
  // audited and the customer is notified, so a scripted result is never hidden.
  // One step: flag the account for QA and queue the next outcome. The trade is
  // still labelled as a scripted test result and the customer is still notified.
  const forceNextTrade = useMutation({
    mutationFn: ({ outcome, reason }: { outcome: 'WIN' | 'LOSS' | 'DRAW'; reason: string }) =>
      api.post<{ forcedOutcome: string; message: string }>(
        `/admin/users/${userId}/force-next-trade`, { forcedOutcome: outcome, reason }),
    onSuccess: (result) => {
      toast.success(`Next trade will settle ${result.forcedOutcome}`, result.message);
      invalidate();
      closeDialog();
    },
    onError,
  });

  const setTestAccount = useMutation({
    mutationFn: ({ isTestAccount, reason }: { isTestAccount: boolean; reason: string }) =>
      api.post<{ isTestAccount: boolean; message: string }>(
        `/admin/users/${userId}/test-account`, { isTestAccount, reason }),
    onSuccess: (result) => {
      toast.success(
        result.isTestAccount ? 'Marked as test account' : 'Test flag removed',
        result.message);
      invalidate();
      closeDialog();
    },
    onError,
  });

  const adjust = useMutation({
    mutationFn: ({ direction, reason }: { direction: 'credit' | 'debit'; reason: string }) =>
      api.post<BalanceAdjustResult>(`/admin/users/${userId}/balance/${direction}`, {
        asset,
        amount,
        reason,
      }),
    onSuccess: (result) => {
      toast.success('Balance adjusted', result.message);
      setAmount('');
      invalidate();
      closeDialog();
    },
    onError,
  });

  const setCreditScore = useMutation({
    mutationFn: (reason: string) =>
      api.post<CreditScoreResult>(`/admin/users/${userId}/credit-score`, {
        score: Number(score),
        reason,
      }),
    onSuccess: (result) => {
      toast.success(
        'Internal score updated',
        `${result.oldScore} → ${result.newScore}. ${result.disclaimer}`,
      );
      invalidate();
      closeDialog();
    },
    onError,
  });

  const passwordReset = useMutation({
    mutationFn: (reason: string) =>
      api.post<PasswordResetResult>(`/admin/users/${userId}/password-reset`, { reason }),
    onSuccess: (result) => {
      setResetLink(result.resetLink);
      setResetMessage(result.message);
      toast.success('Reset link issued', result.message);
      invalidate();
      closeDialog();
    },
    onError,
  });

  const transactions = useQuery({
    queryKey: ['admin', 'user-transactions', userId],
    queryFn: () =>
      api.get<ApiPage<AdminTransaction>>(`/admin/users/${userId}/transactions`, { pageSize: 50 }),
    enabled: Boolean(userId) && tab === 'transactions',
  });

  const auditLogs = useQuery({
    queryKey: ['admin', 'user-audit', userId],
    queryFn: () =>
      api.get<ApiPage<AuditLogEntry>>(`/admin/users/${userId}/audit-logs`, { pageSize: 50 }),
    enabled: Boolean(userId) && tab === 'audit',
  });

  if (detail.isLoading) {
    return (
      <Card>
        <CardBody>
          <ListSkeleton rows={8} />
        </CardBody>
      </Card>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <ErrorState
        title="Could not load this user"
        description={errorMessage(detail.error)}
        onRetry={() => void detail.refetch()}
      />
    );
  }

  const data = detail.data;
  const profile = data.profile;
  // The API returns wallets alphabetically, which puts DEMO_BTC first. Credits
  // are almost always in the platform's main demo currency, so order and
  // default to that instead of whatever sorts first.
  const ASSET_PRIORITY = ['DEMO_USDT', 'DEMO_USDC'];
  const orderedWallets = [...data.wallets].sort((a, b) => {
    const rank = (asset: string) => {
      const index = ASSET_PRIORITY.indexOf(asset);
      return index === -1 ? ASSET_PRIORITY.length : index;
    };
    return rank(a.asset) - rank(b.asset) || a.asset.localeCompare(b.asset);
  });
  const assetOptions = orderedWallets.map((wallet) => ({
    value: wallet.asset,
    label: `${wallet.label} (available ${formatAmount(wallet.available, 2)})`,
  }));
  const defaultAsset = orderedWallets[0]?.asset ?? '';
  const busy =
    freeze.isPending || unfreeze.isPending || adjust.isPending ||
    setCreditScore.isPending || passwordReset.isPending ||
    setTestAccount.isPending || forceNextTrade.isPending;

  const openAdjust = (kind: 'credit' | 'debit') => {
    setAsset(defaultAsset);
    setAmount('');
    setDialogError(null);
    setDialog(kind);
  };

  const transactionColumns: Column<AdminTransaction>[] = [
    { key: 'type', header: 'Type', render: (row) => transactionLabel(row.type) },
    { key: 'asset', header: 'Asset', render: (row) => assetLabel(row.asset) },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="tabular">{formatAmount(row.amount, 2)}</span>,
    },
    { key: 'status', header: 'Status', render: (row) => <Badge>{row.status}</Badge> },
    {
      key: 'reference',
      header: 'Reference',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-muted">{row.reference}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  const auditColumns: Column<AuditLogEntry>[] = [
    { key: 'action', header: 'Action', render: (row) => row.action.replace(/_/g, ' ') },
    {
      key: 'actor',
      header: 'Actor',
      render: (row) => <span className="text-muted">{row.actorEmail ?? row.actorId ?? 'System'}</span>,
    },
    {
      key: 'reason',
      header: 'Reason',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{row.reason ?? '—'}</span>,
    },
    {
      key: 'createdAt',
      header: 'Date',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <Link
        href="/admin/users"
        className="inline-flex min-h-[44px] items-center gap-2 text-sm text-muted hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to users
      </Link>

      {/* Actions */}
      <Card>
        <CardHeader
          title="Administrative actions"
          description="Each action requires a reason and is written to the audit log with your identity."
        />
        <CardBody className="flex flex-wrap gap-3 pt-2">
          {profile.status === 'ACTIVE' ? (
            <Button variant="danger" onClick={() => { setDialogError(null); setDialog('freeze'); }}>
              <Snowflake className="h-4 w-4" aria-hidden />
              Freeze account
            </Button>
          ) : (
            <Button variant="primary" onClick={() => { setDialogError(null); setDialog('unfreeze'); }}>
              <Sun className="h-4 w-4" aria-hidden />
              Unfreeze account
            </Button>
          )}
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted">Force next trade (QA):</span>
            {(['WIN', 'LOSS', 'DRAW'] as const).map((outcome) => (
              <Button
                key={outcome}
                variant="outline"
                size="sm"
                onClick={() => {
                  setDialogError(null);
                  setDialog(
                    outcome === 'WIN' ? 'forceWin'
                      : outcome === 'LOSS' ? 'forceLoss' : 'forceDraw',
                  );
                }}
              >
                {outcome}
              </Button>
            ))}
          </span>

          <Button variant="outline" onClick={() => openAdjust('credit')}>
            Credit balance
          </Button>
          <Button variant="outline" onClick={() => openAdjust('debit')}>
            Debit balance
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setScore(String(profile.creditScore));
              setDialogError(null);
              setDialog('score');
            }}
          >
            Adjust credit score
          </Button>
          <Button variant="outline" onClick={() => { setDialogError(null); setDialog('reset'); }}>
            <KeyRound className="h-4 w-4" aria-hidden />
            Issue password reset link
          </Button>
        </CardBody>
      </Card>

      {resetMessage && (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-sm font-medium text-fg">Password reset link issued</p>
            <p className="text-xs text-muted">{resetMessage}</p>
            {resetLink ? (
              <p className="break-all rounded-control bg-surface px-3 py-2 font-mono text-xs text-fg">
                {resetLink}
              </p>
            ) : null}
            <p className="text-xs text-warning">
              This is a one-time reset link, not a password. No administrator can see or set a
              customer&apos;s password — only the customer can choose a new one.
            </p>
          </CardBody>
        </Card>
      )}

      <Tabs items={TABS} value={tab} onChange={setTab} ariaLabel="User sections" />

      <TabPanel value="profile" active={tab === 'profile'}>
        <Card>
          <CardBody>
            <DataRow label="Full name" value={profile.fullName || '—'} tone="strong" />
            <Divider />
            <DataRow label="Username" value={`@${profile.username}`} />
            <Divider />
            <DataRow label="Email" value={profile.email} />
            <Divider />
            <DataRow label="Role" value={<Badge tone="info">{profile.role}</Badge>} />
            <Divider />
            <DataRow
              label="Status"
              value={
                <Badge tone={profile.status === 'ACTIVE' ? 'success' : 'danger'}>
                  {profile.status}
                </Badge>
              }
            />
            <Divider />
            <DataRow
              label="Total balance (USDT)"
              value={`${formatAmount(profile.totalDemoValue, 2)} USDT`}
              tone="strong"
            />
            <Divider />
            <DataRow label="Open trades" value={data.openTrades} />
            <Divider />
            <DataRow label="Registered" value={formatDateTime(profile.createdAt)} />
            <Divider />
            <DataRow label="Last login" value={formatDateTime(profile.lastLoginAt)} />
            {data.freezeReason && (
              <>
                <Divider />
                <DataRow label="Freeze reason" value={data.freezeReason} />
              </>
            )}
            {data.pricesAvailable === false && (
              <p className="mt-3 text-xs text-warning">
                Live market data is unavailable, so the estimated total value may be incomplete.
              </p>
            )}
          </CardBody>
        </Card>

        {data.restrictions.length > 0 && (
          <Card className="mt-4">
            <CardHeader title="Account restrictions" />
            <CardBody className="space-y-3 pt-2">
              {data.restrictions.map((entry) => (
                <div key={entry.id} className="rounded-control bg-surface px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-fg">{entry.restriction}</span>
                    <Badge tone={entry.liftedAt ? 'neutral' : 'danger'}>
                      {entry.liftedAt ? 'Lifted' : 'Active'}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted">{entry.reason}</p>
                  <p className="mt-1 text-xs text-subtle">{formatDateTime(entry.createdAt)}</p>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </TabPanel>

      <TabPanel value="wallet" active={tab === 'wallet'}>
        <Card>
          <CardHeader
            title="Wallets"
            description="Customer wallet balances."
          />
          <CardBody className="pt-2">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <caption className="sr-only">Wallet balances</caption>
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="py-2 text-left font-semibold">Asset</th>
                    <th scope="col" className="py-2 text-right font-semibold">Available</th>
                    <th scope="col" className="py-2 text-right font-semibold">Locked</th>
                    <th scope="col" className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.wallets.map((wallet) => (
                    <tr key={wallet.asset} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="py-2.5 text-left font-medium text-fg">
                        {wallet.label}
                      </th>
                      <td className="tabular py-2.5 text-right">{formatAmount(wallet.available, 2)}</td>
                      <td className="tabular py-2.5 text-right text-muted">
                        {formatAmount(wallet.locked, 2)}
                      </td>
                      <td className="tabular py-2.5 text-right font-semibold">
                        {formatAmount(wallet.total, 2)}
                      </td>
                    </tr>
                  ))}
                  {data.wallets.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-xs text-muted">
                        No wallets yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="transactions" active={tab === 'transactions'}>
        <DataTable<AdminTransaction>
          caption="Ledger entries for this account"
          columns={transactionColumns}
          rows={transactions.data?.items ?? data.recentTransactions}
          rowKey={(row) => row.id}
          isLoading={transactions.isLoading}
          error={transactions.isError ? transactions.error : undefined}
          errorMessage={transactions.isError ? errorMessage(transactions.error) : undefined}
          onRetry={() => void transactions.refetch()}
          emptyTitle="No ledger entries yet"
        />
      </TabPanel>

      <TabPanel value="trades" active={tab === 'trades'}>
        <Card>
          <CardHeader title="Recent trades" description="Most recent 20 positions" />
          <CardBody className="pt-2">
            <div className="w-full overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">Recent trades</caption>
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                    <th scope="col" className="py-2 text-left font-semibold">Market</th>
                    <th scope="col" className="py-2 text-left font-semibold">Direction</th>
                    <th scope="col" className="py-2 text-right font-semibold">Stake</th>
                    <th scope="col" className="py-2 text-left font-semibold">Outcome</th>
                    <th scope="col" className="py-2 text-right font-semibold">P/L</th>
                    <th scope="col" className="py-2 text-left font-semibold">Settled by</th>
                    <th scope="col" className="py-2 text-left font-semibold">Opened</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentTrades.map((trade) => (
                    <tr key={trade.id} className="border-b border-border/60 last:border-0">
                      <th scope="row" className="py-2.5 text-left font-medium text-fg">
                        {trade.symbol}
                      </th>
                      <td className="py-2.5">{trade.direction}</td>
                      <td className="tabular py-2.5 text-right">{formatAmount(trade.amount, 2)}</td>
                      <td className="py-2.5">
                        <Badge
                          tone={
                            trade.outcome === 'WIN'
                              ? 'success'
                              : trade.outcome === 'LOSS'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {trade.outcome ?? trade.status}
                        </Badge>
                      </td>
                      <td className="tabular py-2.5 text-right">
                        {trade.profitLoss === null ? '—' : formatAmount(trade.profitLoss, 2)}
                      </td>
                      <td className="py-2.5 text-xs text-muted">
                        {trade.settlementSource ?? '—'}
                        {trade.testScenarioId ? ' (QA test scenario)' : ''}
                      </td>
                      <td className="py-2.5 text-xs text-muted">{formatDateTime(trade.createdAt)}</td>
                    </tr>
                  ))}
                  {data.recentTrades.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-muted">
                        No trades yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="security" active={tab === 'security'}>
        <Card>
          <CardHeader
            title="Security"
            description="Booleans and timestamps only — no password material is ever exposed."
          />
          <CardBody>
            <DataRow label="Fund password set" value={data.security.hasFundPassword ? 'Yes' : 'No'} />
            <Divider />
            <DataRow label="Two-factor enabled" value={data.security.mfaEnabled ? 'Yes' : 'No'} />
            <Divider />
            <DataRow
              label="Must change password"
              value={data.security.mustChangePassword ? 'Yes' : 'No'}
            />
            <Divider />
            <DataRow label="Last login" value={formatDateTime(data.security.lastLoginAt)} />
            <p className="mt-4 rounded-control bg-warning/10 px-3 py-2 text-xs text-warning">
              {data.security.note}
            </p>
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="score" active={tab === 'score'}>
        <Card>
          <CardHeader
            title="Internal account score"
            description="Not a credit-bureau score"
          />
          <CardBody>
            <p className="rounded-control bg-warning/10 px-3 py-2 text-xs text-warning">
              {data.creditScoreDisclaimer}
            </p>
            <div className="mt-4">
              <DataRow label="Current score" value={profile.creditScore} tone="strong" />
            </div>
            <Divider />
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
              Change history
            </p>
            <div className="mt-2 space-y-2">
              {data.creditScoreHistory.map((entry) => (
                <div key={entry.id} className="rounded-control bg-surface px-3 py-2">
                  <p className="tabular text-sm text-fg">
                    {entry.oldScore} → {entry.newScore}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{entry.reason}</p>
                  <p className="mt-0.5 text-xs text-subtle">{formatDateTime(entry.createdAt)}</p>
                </div>
              ))}
              {data.creditScoreHistory.length === 0 && (
                <p className="text-xs text-muted">No score changes recorded.</p>
              )}
            </div>
          </CardBody>
        </Card>
      </TabPanel>

      <TabPanel value="audit" active={tab === 'audit'}>
        <DataTable<AuditLogEntry>
          caption="Audit trail for this account"
          columns={auditColumns}
          rows={auditLogs.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={auditLogs.isLoading}
          error={auditLogs.isError ? auditLogs.error : undefined}
          errorMessage={auditLogs.isError ? errorMessage(auditLogs.error) : undefined}
          onRetry={() => void auditLogs.refetch()}
          emptyTitle="No audited actions for this account"
        />
      </TabPanel>

      {/* ------------------------------------------------------------ Dialogs */}

      <ReasonDialog
        open={dialog === 'freeze'}
        onClose={closeDialog}
        onSubmit={(reason) => freeze.mutate(reason)}
        title="Freeze account"
        description="The customer will be locked out of trading and withdrawals, and will see this reason."
        confirmLabel="Freeze account"
        confirmVariant="danger"
        loading={busy}
        error={dialogError}
      />

      {(['WIN', 'LOSS', 'DRAW'] as const).map((outcome) => {
        const kind = outcome === 'WIN' ? 'forceWin'
          : outcome === 'LOSS' ? 'forceLoss' : 'forceDraw';
        return (
          <ReasonDialog
            key={outcome}
            open={dialog === kind}
            onClose={closeDialog}
            onSubmit={(reason) => forceNextTrade.mutate({ outcome, reason })}
            title={`Force the next trade to ${outcome}`}
            description={`This marks the account as a QA test account if it is not one already, then settles its next trade as ${outcome}. The customer is notified that their account is flagged, the trade is labelled as a scripted test result rather than a market outcome, and both steps are audited.`}
            confirmLabel={`Queue ${outcome}`}
            loading={busy}
            error={dialogError}
          />
        );
      })}



      <ReasonDialog
        open={dialog === 'unfreeze'}
        onClose={closeDialog}
        onSubmit={(reason) => unfreeze.mutate(reason)}
        title="Restore account"
        description="Full functionality is returned to the customer."
        confirmLabel="Unfreeze account"
        loading={busy}
        error={dialogError}
      />

      <ReasonDialog
        open={dialog === 'credit' || dialog === 'debit'}
        onClose={closeDialog}
        onSubmit={(reason) =>
          adjust.mutate({ direction: dialog === 'debit' ? 'debit' : 'credit', reason })
        }
        title={dialog === 'debit' ? 'Debit balance' : 'Credit balance'}
        description="A debit that would overdraw the wallet is refused, never clamped."
        confirmLabel={dialog === 'debit' ? 'Debit balance' : 'Credit balance'}
        confirmVariant={dialog === 'debit' ? 'danger' : 'primary'}
        loading={busy}
        error={dialogError}
        disabled={!asset || !amount || Number(amount) <= 0}
        extraFields={
          <div className="space-y-3">
            <Select
              label="Asset"
              options={
                assetOptions.length > 0
                  ? assetOptions
                  : [{ value: '', label: 'No wallets available' }]
              }
              value={asset}
              onChange={(event) => setAsset(event.target.value)}
            />
            <Input
              label="Amount"
              inputMode="decimal"
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              hint="A debit that would overdraw the wallet is refused, never clamped."
            />
          </div>
        }
      />

      <ReasonDialog
        open={dialog === 'score'}
        onClose={closeDialog}
        onSubmit={(reason) => setCreditScore.mutate(reason)}
        title="Adjust internal score"
        description="This is an internal account score used only inside this platform. It is not a credit-bureau score and has no real-world meaning."
        confirmLabel="Set score"
        loading={busy}
        error={dialogError}
        disabled={!score || Number(score) < 1 || Number(score) > 100}
        extraFields={
          <Input
            label="New score (1–100)"
            type="number"
            min={1}
            max={100}
            step={1}
            value={score}
            onChange={(event) => setScore(event.target.value)}
            hint={`Current score: ${profile.creditScore}`}
          />
        }
      />

      <ReasonDialog
        open={dialog === 'reset'}
        onClose={closeDialog}
        onSubmit={(reason) => passwordReset.mutate(reason)}
        title="Issue a password reset link"
        description="This issues a one-time reset link only."
        confirmLabel="Issue reset link"
        loading={busy}
        error={dialogError}
        footnote="An administrator can never see or set a customer's password. This action stores only a hashed one-time token and lets the customer choose a new password themselves. The customer is notified."
      />
    </div>
  );
}
