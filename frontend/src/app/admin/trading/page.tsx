'use client';

/**
 * Demo trading configuration.
 *
 * Two clearly separated concerns:
 *   1. the duration / payout options and the trading master switch;
 *   2. QA simulation test mode, which can queue a scripted settlement outcome
 *      for accounts explicitly flagged as test accounts — and nothing else. The
 *      backend refuses any other target with `NOT_A_TEST_ACCOUNT`, every
 *      scenario is labelled as a test scenario, and every creation and
 *      cancellation is audit-logged. It is not, and cannot be, a way to
 *      influence a real customer's outcome.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatAmount, formatDateTime, formatDuration } from '@/lib/format';
import type {
  AdminDuration,
  AdminSettings,
  BulkScenarioResult,
  BulkSettleResult,
  BulkVoidResult,
  DurationCreateBody,
  DurationUpdateBody,
  SettingsUpdateResult,
  TestScenario,
  TestScenarioPage,
} from '@/lib/admin-types';
import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui/primitives';
import { FormError, Input, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable, useTableState } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

const TEST_MODE_NOTICE =
  'Simulation Test Mode exists for QA only. A scripted outcome can be queued ONLY for an account explicitly flagged as a test account — any other target is refused with NOT_A_TEST_ACCOUNT. Every scenario is labelled as a scripted outcome wherever it appears and every creation and cancellation is written to the audit log. It cannot be used to influence a real demo customer’s trade.';

interface DurationForm {
  seconds: string;
  label: string;
  payoutPercent: string;
  minAmount: string;
  maxAmount: string;
  isEnabled: boolean;
  sortOrder: string;
}

const EMPTY_DURATION: DurationForm = {
  seconds: '60',
  label: '60s',
  payoutPercent: '85',
  minAmount: '10',
  maxAmount: '10000',
  isEnabled: true,
  sortOrder: '100',
};

const BOOL_OPTIONS = [
  { value: 'true', label: 'Enabled' },
  { value: 'false', label: 'Disabled' },
];

const OUTCOME_OPTIONS = [
  { value: 'WIN', label: 'WIN' },
  { value: 'LOSS', label: 'LOSS' },
  { value: 'DRAW', label: 'DRAW' },
];

export default function AdminTradingPage() {
  useAdminPage('Demo Trading', 'Duration and payout options for the simulated trade screen');

  const toast = useToast();
  const queryClient = useQueryClient();

  const [editing, setEditing] = useState<AdminDuration | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<DurationForm>(EMPTY_DURATION);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminDuration | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [scenarioUser, setScenarioUser] = useState('');
  const [scenarioOutcome, setScenarioOutcome] = useState('WIN');
  const [scenarioLabel, setScenarioLabel] = useState('');
  const [cancelTarget, setCancelTarget] = useState<TestScenario | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const scenarioTable = useTableState();

  const durations = useQuery({
    queryKey: ['admin', 'durations'],
    queryFn: () => api.get<AdminDuration[]>('/admin/trading/durations'),
  });

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<AdminSettings>('/admin/settings'),
  });

  const scenarios = useQuery({
    queryKey: ['admin', 'test-scenarios', scenarioTable.page],
    queryFn: () =>
      api.get<TestScenarioPage>('/admin/test-scenarios', {
        page: scenarioTable.page,
        pageSize: 20,
      }),
    placeholderData: (previous) => previous,
  });

  const tradingEnabled = Boolean(
    settings.data?.groups
      .find((group) => group.group === 'trading')
      ?.settings.find((setting) => setting.key === 'trading_enabled')?.value,
  );

  const invalidateDurations = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'durations'] });
    void queryClient.invalidateQueries({ queryKey: ['trade-config'] });
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
    setFormError(null);
  };

  const create = useMutation({
    mutationFn: (body: DurationCreateBody) =>
      api.post<AdminDuration>('/admin/trading/durations', { ...body }),
    onSuccess: (duration) => {
      toast.success('Duration created', `${duration.label} added.`);
      invalidateDurations();
      closeForm();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setFormError(message);
      toast.error('Could not create duration', message);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DurationUpdateBody }) =>
      api.patch<AdminDuration>(`/admin/trading/durations/${id}`, { ...body }),
    onSuccess: (duration) => {
      toast.success('Duration updated', `${duration.label} saved.`);
      invalidateDurations();
      closeForm();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setFormError(message);
      toast.error('Could not update duration', message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string; deleted: boolean }>(`/admin/trading/durations/${id}`),
    onSuccess: () => {
      toast.success('Duration deleted', 'Open trades keep the terms they were opened on.');
      invalidateDurations();
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setDeleteError(message);
      toast.error('Could not delete duration', message);
    },
  });

  const toggleTrading = useMutation({
    mutationFn: (reason: string) =>
      api.patch<SettingsUpdateResult>('/admin/settings', {
        values: { trading_enabled: !tradingEnabled },
        reason,
      }),
    onSuccess: () => {
      toast.success(
        'Trading master switch updated',
        tradingEnabled ? 'Demo trading is now disabled.' : 'Demo trading is now enabled.',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-config'] });
      setSwitchOpen(false);
      setSwitchError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setSwitchError(message);
      toast.error('Could not change the master switch', message);
    },
  });

  const createScenario = useMutation({
    mutationFn: (reason: string) =>
      api.post<TestScenario>('/admin/test-scenarios', {
        targetUserId: scenarioUser.trim(),
        forcedOutcome: scenarioOutcome,
        label: scenarioLabel.trim(),
        reason,
      }),
    onSuccess: (scenario) => {
      toast.success('QA test scenario queued', scenario.notice);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'test-scenarios'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'audit-logs'] });
      setScenarioOpen(false);
      setScenarioError(null);
      setScenarioUser('');
      setScenarioLabel('');
    },
    onError: (error) => {
      const message = errorMessage(error);
      setScenarioError(message);
      toast.error('Test scenario refused', message);
    },
  });

  const cancelScenario = useMutation({
    mutationFn: (id: string) =>
      api.delete<{ id: string; cancelled: boolean }>(`/admin/test-scenarios/${id}`),
    onSuccess: () => {
      toast.success('Test scenario cancelled', 'The cancellation is audit-logged.');
      void queryClient.invalidateQueries({ queryKey: ['admin', 'test-scenarios'] });
      setCancelTarget(null);
      setCancelError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setCancelError(message);
      toast.error('Could not cancel scenario', message);
    },
  });

  const openEdit = (duration: AdminDuration) => {
    setForm({
      seconds: String(duration.seconds),
      label: duration.label,
      payoutPercent: duration.payoutPercent,
      minAmount: duration.minAmount,
      maxAmount: duration.maxAmount,
      isEnabled: duration.isEnabled,
      sortOrder: String(duration.sortOrder),
    });
    setFormError(null);
    setEditing(duration);
  };

  const submitDuration = () => {
    if (editing) {
      update.mutate({
        id: editing.id,
        body: {
          label: form.label,
          payoutPercent: form.payoutPercent,
          minAmount: form.minAmount,
          maxAmount: form.maxAmount,
          isEnabled: form.isEnabled,
          sortOrder: Number(form.sortOrder),
        },
      });
      return;
    }
    create.mutate({
      seconds: Number(form.seconds),
      label: form.label,
      payoutPercent: form.payoutPercent,
      minAmount: form.minAmount,
      maxAmount: form.maxAmount,
      isEnabled: form.isEnabled,
      sortOrder: Number(form.sortOrder),
    });
  };

  const durationColumns: Column<AdminDuration>[] = [
    {
      key: 'label',
      header: 'Duration',
      render: (row) => (
        <div>
          <p className="font-medium text-fg">{row.label}</p>
          <p className="text-xs text-muted">{formatDuration(row.seconds)}</p>
        </div>
      ),
    },
    {
      key: 'payoutPercent',
      header: 'Payout',
      align: 'right',
      render: (row) => <span className="tabular">{formatAmount(row.payoutPercent, 2)}%</span>,
    },
    {
      key: 'minAmount',
      header: 'Min stake',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular">{formatAmount(row.minAmount, 2)}</span>,
    },
    {
      key: 'maxAmount',
      header: 'Max stake',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular">{formatAmount(row.maxAmount, 2)}</span>,
    },
    {
      key: 'isEnabled',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.isEnabled ? 'success' : 'neutral'}>
          {row.isEnabled ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(row)} aria-label={`Edit ${row.label}`}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setDeleteTarget(row);
              setDeleteError(null);
            }}
            aria-label={`Delete ${row.label}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const scenarioColumns: Column<TestScenario>[] = [
    {
      key: 'target',
      header: 'Test account',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-fg">{row.targetUsername ?? row.targetUserId}</p>
          <p className="truncate font-mono text-xs text-muted">{row.targetUserId}</p>
        </div>
      ),
    },
    {
      key: 'forcedOutcome',
      header: 'Scripted outcome',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={row.forcedOutcome === 'WIN' ? 'success' : row.forcedOutcome === 'LOSS' ? 'danger' : 'neutral'}>
            {row.forcedOutcome}
          </Badge>
          <Badge tone="warning">QA test</Badge>
        </div>
      ),
    },
    { key: 'label', header: 'Label', render: (row) => <span className="text-muted">{row.label}</span> },
    {
      key: 'consumed',
      header: 'State',
      render: (row) => (
        <Badge tone={row.consumed ? 'neutral' : 'info'}>{row.consumed ? 'Consumed' : 'Queued'}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      hideOnMobile: true,
      render: (row) => <span className="text-muted">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) =>
        row.consumed ? (
          <span className="text-xs text-muted">Immutable history</span>
        ) : (
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setCancelTarget(row);
              setCancelError(null);
            }}
            aria-label={`Cancel test scenario ${row.label}`}
          >
            Cancel
          </Button>
        ),
    },
  ];

  // ---------------------------------------------- Bulk position controls
  //
  // These deliberately do NOT include "force every customer to win/lose".
  // Settling closes the book at the real market price; voiding refunds every
  // stake. Neither invents a result.
  const [bulkDialog, setBulkDialog] = useState<
    'settle' | 'void' | 'scenario' | null
  >(null);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkOutcome, setBulkOutcome] = useState<'WIN' | 'LOSS' | 'DRAW'>('WIN');

  const closeBulk = () => {
    setBulkDialog(null);
    setBulkError(null);
  };
  const onBulkError = (error: unknown) => setBulkError(errorMessage(error));
  const afterBulk = (message: string) => {
    toast.success('Done', message);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'test-scenarios'] });
    closeBulk();
  };

  const settleAll = useMutation({
    mutationFn: (reason: string) =>
      api.post<BulkSettleResult>('/admin/trades/settle-all', { reason }),
    onSuccess: (result) => afterBulk(result.message),
    onError: onBulkError,
  });

  const voidAll = useMutation({
    mutationFn: (reason: string) =>
      api.post<BulkVoidResult>('/admin/trades/void-all', { reason }),
    onSuccess: (result) => afterBulk(result.message),
    onError: onBulkError,
  });

  const bulkScenario = useMutation({
    mutationFn: (reason: string) =>
      api.post<BulkScenarioResult>('/admin/test-scenarios/bulk', {
        forcedOutcome: bulkOutcome,
        reason,
      }),
    onSuccess: (result) => afterBulk(result.message),
    onError: onBulkError,
  });

  const bulkBusy =
    settleAll.isPending || voidAll.isPending || bulkScenario.isPending;

  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-6">
      {/* Master switch */}
      <Card>
        <CardHeader
          title="Bulk position controls"
          description="Act on every open demo position at once. Each action needs a reason and is audited."
        />
        <CardBody className="space-y-3 pt-2">
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => { setBulkError(null); setBulkDialog('settle'); }}>
              Settle all open positions
            </Button>
            <Button variant="outline" onClick={() => { setBulkError(null); setBulkDialog('void'); }}>
              Void all and refund stakes
            </Button>
          </div>
          <p className="text-xs text-muted">
            <strong className="text-fg">Settle all</strong> closes every open position
            immediately against the live public market price — the same comparison that
            would have run at expiry, so the outcomes are the real ones. Useful before
            maintenance. <strong className="text-fg">Void all</strong> cancels every open
            position and returns every stake in full; nobody wins or loses.
          </p>
          <p className="text-xs text-muted">
            There is no control here that forces customers to win or lose. Outcomes come
            from the market, and the only scripted outcomes possible are on accounts
            explicitly flagged for QA — see below.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Demo trading master switch"
          description="Turns the simulated trade screen on or off for every customer."
        />
        <CardBody className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-3">
            <Badge tone={tradingEnabled ? 'success' : 'danger'}>
              {settings.isLoading ? 'Loading' : tradingEnabled ? 'Enabled' : 'Disabled'}
            </Badge>
            <p className="text-xs text-muted">
              {tradingEnabled
                ? 'Customers can open simulated positions.'
                : 'Customers cannot open new simulated positions.'}
            </p>
          </div>
          <Button
            variant={tradingEnabled ? 'danger' : 'primary'}
            disabled={settings.isLoading}
            onClick={() => {
              setSwitchError(null);
              setSwitchOpen(true);
            }}
          >
            {tradingEnabled ? 'Disable demo trading' : 'Enable demo trading'}
          </Button>
        </CardBody>
      </Card>

      {/* Durations */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">Trade durations</h2>
          <Button
            onClick={() => {
              setForm(EMPTY_DURATION);
              setFormError(null);
              setCreating(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            New duration
          </Button>
        </div>

        <DataTable<AdminDuration>
          caption="Duration and payout options offered on the demo trade screen"
          columns={durationColumns}
          rows={durations.data ?? []}
          rowKey={(row) => row.id}
          isLoading={durations.isLoading}
          error={durations.isError ? durations.error : undefined}
          errorMessage={durations.isError ? errorMessage(durations.error) : undefined}
          onRetry={() => void durations.refetch()}
          emptyTitle="No durations configured"
          emptyDescription="Add at least one duration so customers can place a simulated trade."
        />
      </section>

      {/* Simulation test mode — deliberately separated */}
      <section className="space-y-3 rounded-card border border-warning/40 bg-warning/5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-warning">
              <FlaskConical className="h-4 w-4" aria-hidden />
              Simulation Test Mode — QA only
            </h2>
            <p className="mt-1 max-w-3xl text-xs text-muted">{TEST_MODE_NOTICE}</p>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              setScenarioError(null);
              setScenarioOpen(true);
            }}
          >
            Queue QA scenario
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <span className="text-xs text-muted">Queue on every QA test account:</span>
          {(['WIN', 'LOSS', 'DRAW'] as const).map((outcome) => (
            <Button
              key={outcome}
              variant="outline"
              size="sm"
              onClick={() => {
                setBulkOutcome(outcome);
                setBulkError(null);
                setBulkDialog('scenario');
              }}
            >
              All test accounts &rarr; {outcome}
            </Button>
          ))}
        </div>

        <DataTable<TestScenario>
          caption="QA trade test scenarios"
          columns={scenarioColumns}
          rows={scenarios.data?.items ?? []}
          rowKey={(row) => row.id}
          isLoading={scenarios.isLoading}
          error={scenarios.isError ? scenarios.error : undefined}
          errorMessage={scenarios.isError ? errorMessage(scenarios.error) : undefined}
          onRetry={() => void scenarios.refetch()}
          emptyTitle="No QA scenarios queued"
          emptyDescription="Scenarios can only ever target accounts flagged as test accounts."
          meta={scenarios.data?.meta ?? null}
          onPageChange={scenarioTable.setPage}
        />
      </section>

      {/* Duration create / edit */}
      <Modal
        open={creating || editing !== null}
        onClose={closeForm}
        title={editing ? `Edit ${editing.label}` : 'New trade duration'}
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={closeForm} disabled={busy}>
              Cancel
            </Button>
            <Button
              fullWidth
              onClick={submitDuration}
              loading={busy}
              disabled={!form.label || !form.payoutPercent || !form.minAmount || !form.maxAmount}
            >
              {editing ? 'Save changes' : 'Create duration'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {!editing && (
            <Input
              label="Duration (seconds)"
              type="number"
              min={1}
              max={86400}
              value={form.seconds}
              onChange={(event) => setForm({ ...form, seconds: event.target.value })}
              hint="Duration lengths are unique."
            />
          )}
          <Input
            label="Label"
            value={form.label}
            onChange={(event) => setForm({ ...form, label: event.target.value })}
            placeholder="60s"
          />
          <Input
            label="Payout percent"
            type="number"
            min={0}
            step="any"
            value={form.payoutPercent}
            onChange={(event) => setForm({ ...form, payoutPercent: event.target.value })}
          />
          <Input
            label="Minimum stake"
            type="number"
            min={0}
            step="any"
            value={form.minAmount}
            onChange={(event) => setForm({ ...form, minAmount: event.target.value })}
          />
          <Input
            label="Maximum stake"
            type="number"
            min={0}
            step="any"
            value={form.maxAmount}
            onChange={(event) => setForm({ ...form, maxAmount: event.target.value })}
            hint="Must not be lower than the minimum stake."
          />
          <Select
            label="Availability"
            options={BOOL_OPTIONS}
            value={String(form.isEnabled)}
            onChange={(event) => setForm({ ...form, isEnabled: event.target.value === 'true' })}
          />
          <Input
            label="Sort order"
            type="number"
            value={form.sortOrder}
            onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
          />
          <FormError message={formError} />
        </div>
      </Modal>

      <ReasonDialog
        open={bulkDialog === 'settle'}
        onClose={closeBulk}
        onSubmit={(reason) => settleAll.mutate(reason)}
        title="Settle all open positions"
        description="Every open position is closed now against the live public market price. Outcomes are the genuine ones for that price move — nothing is forced. A position whose market data is unavailable is voided and its stake returned."
        confirmLabel="Settle all now"
        loading={bulkBusy}
        error={bulkError}
      />

      <ReasonDialog
        open={bulkDialog === 'void'}
        onClose={closeBulk}
        onSubmit={(reason) => voidAll.mutate(reason)}
        title="Void all open positions"
        description="Every open position is cancelled and every stake returned in full. No customer wins or loses."
        confirmLabel="Void all and refund"
        confirmVariant="danger"
        loading={bulkBusy}
        error={bulkError}
      />

      <ReasonDialog
        open={bulkDialog === 'scenario'}
        onClose={closeBulk}
        onSubmit={(reason) => bulkScenario.mutate(reason)}
        title={`Queue a ${bulkOutcome} scenario on all QA test accounts`}
        description="Applies only to accounts flagged as QA test accounts. Ordinary customers are never affected, and every affected trade is labelled as a scripted test result."
        confirmLabel="Queue on test accounts"
        loading={bulkBusy}
        error={bulkError}
      />

      <ReasonDialog
        open={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onSubmit={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
        title={`Delete ${deleteTarget?.label ?? 'duration'}`}
        description="Open trades keep the terms they were opened on."
        confirmLabel="Delete duration"
        confirmVariant="danger"
        loading={remove.isPending}
        error={deleteError}
      />

      <ReasonDialog
        open={switchOpen}
        onClose={() => {
          setSwitchOpen(false);
          setSwitchError(null);
        }}
        onSubmit={(reason) => toggleTrading.mutate(reason)}
        title={tradingEnabled ? 'Disable demo trading' : 'Enable demo trading'}
        description={
          tradingEnabled
            ? 'Customers will no longer be able to open simulated positions. Open positions still settle normally.'
            : 'Customers will be able to open simulated positions again.'
        }
        confirmLabel={tradingEnabled ? 'Disable trading' : 'Enable trading'}
        confirmVariant={tradingEnabled ? 'danger' : 'primary'}
        loading={toggleTrading.isPending}
        error={switchError}
      />

      <ReasonDialog
        open={scenarioOpen}
        onClose={() => {
          setScenarioOpen(false);
          setScenarioError(null);
        }}
        onSubmit={(reason) => createScenario.mutate(reason)}
        title="Queue a QA test scenario"
        description="Applies only to an account flagged as a test account. Any other target is refused."
        confirmLabel="Queue scenario"
        loading={createScenario.isPending}
        error={scenarioError}
        disabled={!scenarioUser.trim() || !scenarioLabel.trim()}
        footnote={TEST_MODE_NOTICE}
        extraFields={
          <div className="space-y-3">
            <Input
              label="Test account user ID"
              value={scenarioUser}
              onChange={(event) => setScenarioUser(event.target.value)}
              placeholder="User ID of a designated test account"
              hint="If this account is not flagged as a test account the request is refused with NOT_A_TEST_ACCOUNT."
            />
            <Select
              label="Scripted outcome"
              options={OUTCOME_OPTIONS}
              value={scenarioOutcome}
              onChange={(event) => setScenarioOutcome(event.target.value)}
            />
            <Input
              label="Scenario label"
              value={scenarioLabel}
              onChange={(event) => setScenarioLabel(event.target.value)}
              placeholder="e.g. Regression: WIN settlement path"
            />
          </div>
        }
      />

      <ReasonDialog
        open={cancelTarget !== null}
        onClose={() => {
          setCancelTarget(null);
          setCancelError(null);
        }}
        onSubmit={() => {
          if (cancelTarget) cancelScenario.mutate(cancelTarget.id);
        }}
        title="Cancel QA test scenario"
        description="Only an unconsumed scenario can be cancelled. A scenario already applied to a trade is immutable history."
        confirmLabel="Cancel scenario"
        confirmVariant="danger"
        loading={cancelScenario.isPending}
        error={cancelError}
      />
    </div>
  );
}
