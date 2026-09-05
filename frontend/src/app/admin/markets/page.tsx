'use client';

/**
 * Market configuration.
 *
 * Prices are never stored by this product — they are read live from the
 * configured public market-data provider. This screen only decides which pairs
 * exist and how they are presented.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type { AdminMarket, MarketCreateBody, MarketUpdateBody } from '@/lib/admin-types';
import { Badge, Button } from '@/components/ui/primitives';
import { FormError, Input, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { DataTable } from '@/components/admin/DataTable';
import type { Column } from '@/components/admin/DataTable';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

interface FormState {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  providerSymbol: string;
  displayName: string;
  priceDecimals: string;
  isEnabled: boolean;
  isTradable: boolean;
  sortOrder: string;
}

const EMPTY: FormState = {
  symbol: '',
  baseAsset: '',
  quoteAsset: '',
  providerSymbol: '',
  displayName: '',
  priceDecimals: '2',
  isEnabled: true,
  isTradable: true,
  sortOrder: '100',
};

const BOOL_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

export default function AdminMarketsPage() {
  useAdminPage('Markets', 'Tradable pairs offered on the demo trade screen');

  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AdminMarket | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminMarket | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'markets'],
    queryFn: () => api.get<AdminMarket[]>('/admin/markets'),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['admin', 'markets'] });
    void queryClient.invalidateQueries({ queryKey: ['markets'] });
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setFormError(null);
  };

  const create = useMutation({
    mutationFn: (body: MarketCreateBody) => api.post<AdminMarket>('/admin/markets', { ...body }),
    onSuccess: (market) => {
      toast.success('Market created', `${market.symbol} is now configured.`);
      invalidate();
      close();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setFormError(message);
      toast.error('Could not create market', message);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: MarketUpdateBody }) =>
      api.patch<AdminMarket>(`/admin/markets/${id}`, { ...body }),
    onSuccess: (market) => {
      toast.success('Market updated', `${market.symbol} saved.`);
      invalidate();
      close();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setFormError(message);
      toast.error('Could not update market', message);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete<{ id: string; deleted: boolean }>(`/admin/markets/${id}`),
    onSuccess: () => {
      toast.success('Market deleted', 'Historic trades keep their recorded symbol.');
      invalidate();
      setDeleteTarget(null);
      setDeleteError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setDeleteError(message);
      toast.error('Could not delete market', message);
    },
  });

  const openCreate = () => {
    setForm(EMPTY);
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (market: AdminMarket) => {
    setForm({
      symbol: market.symbol,
      baseAsset: market.baseAsset,
      quoteAsset: market.quoteAsset,
      providerSymbol: market.providerSymbol,
      displayName: market.displayName,
      priceDecimals: String(market.priceDecimals),
      isEnabled: market.isEnabled,
      isTradable: market.isTradable,
      sortOrder: String(market.sortOrder),
    });
    setFormError(null);
    setEditing(market);
  };

  const submit = () => {
    if (editing) {
      update.mutate({
        id: editing.id,
        body: {
          providerSymbol: form.providerSymbol,
          displayName: form.displayName,
          priceDecimals: Number(form.priceDecimals),
          isEnabled: form.isEnabled,
          isTradable: form.isTradable,
          sortOrder: Number(form.sortOrder),
        },
      });
      return;
    }
    create.mutate({
      symbol: form.symbol.toUpperCase(),
      baseAsset: form.baseAsset.toUpperCase(),
      quoteAsset: form.quoteAsset.toUpperCase(),
      providerSymbol: form.providerSymbol,
      displayName: form.displayName,
      priceDecimals: Number(form.priceDecimals),
      isEnabled: form.isEnabled,
      isTradable: form.isTradable,
      sortOrder: Number(form.sortOrder),
    });
  };

  const columns: Column<AdminMarket>[] = [
    {
      key: 'symbol',
      header: 'Symbol',
      render: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-fg">{row.symbol}</p>
          <p className="truncate text-xs text-muted">{row.displayName}</p>
        </div>
      ),
    },
    {
      key: 'providerSymbol',
      header: 'Provider symbol',
      hideOnMobile: true,
      render: (row) => <span className="font-mono text-xs text-muted">{row.providerSymbol}</span>,
    },
    {
      key: 'priceDecimals',
      header: 'Decimals',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular">{row.priceDecimals}</span>,
    },
    {
      key: 'flags',
      header: 'Availability',
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone={row.isEnabled ? 'success' : 'neutral'}>
            {row.isEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <Badge tone={row.isTradable ? 'success' : 'neutral'}>
            {row.isTradable ? 'Tradable' : 'Not tradable'}
          </Badge>
        </div>
      ),
    },
    {
      key: 'sortOrder',
      header: 'Order',
      align: 'right',
      hideOnMobile: true,
      render: (row) => <span className="tabular">{row.sortOrder}</span>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => openEdit(row)} aria-label={`Edit ${row.symbol}`}>
            Edit
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setDeleteTarget(row);
              setDeleteError(null);
            }}
            aria-label={`Delete ${row.symbol}`}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  const busy = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" aria-hidden />
          New market
        </Button>
      </div>

      <DataTable<AdminMarket>
        caption="Configured market pairs"
        columns={columns}
        rows={query.data ?? []}
        rowKey={(row) => row.id}
        isLoading={query.isLoading}
        error={query.isError ? query.error : undefined}
        errorMessage={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => void query.refetch()}
        emptyTitle="No markets configured"
        emptyDescription="Add a pair to make it available on the demo trade screen."
      />

      <Modal
        open={creating || editing !== null}
        onClose={close}
        title={editing ? `Edit ${editing.symbol}` : 'New market'}
        description="Prices are never stored — they are read live from the configured market-data provider."
        footer={
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              fullWidth
              onClick={submit}
              loading={busy}
              disabled={
                !form.providerSymbol ||
                !form.displayName ||
                (!editing && (!form.symbol || !form.baseAsset || !form.quoteAsset))
              }
            >
              {editing ? 'Save changes' : 'Create market'}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          {!editing && (
            <>
              <Input
                label="Symbol"
                value={form.symbol}
                onChange={(event) => setForm({ ...form, symbol: event.target.value })}
                placeholder="BTC/USDT"
                hint="Must be unique."
              />
              <Input
                label="Base asset"
                value={form.baseAsset}
                onChange={(event) => setForm({ ...form, baseAsset: event.target.value })}
                placeholder="BTC"
              />
              <Input
                label="Quote asset"
                value={form.quoteAsset}
                onChange={(event) => setForm({ ...form, quoteAsset: event.target.value })}
                placeholder="USDT"
              />
            </>
          )}
          <Input
            label="Provider symbol"
            value={form.providerSymbol}
            onChange={(event) => setForm({ ...form, providerSymbol: event.target.value })}
            placeholder="BTCUSDT"
            hint="The symbol used when requesting prices from the market-data provider."
          />
          <Input
            label="Display name"
            value={form.displayName}
            onChange={(event) => setForm({ ...form, displayName: event.target.value })}
            placeholder="Bitcoin"
          />
          <Input
            label="Price decimals"
            type="number"
            min={0}
            max={12}
            value={form.priceDecimals}
            onChange={(event) => setForm({ ...form, priceDecimals: event.target.value })}
          />
          <Select
            label="Enabled"
            options={BOOL_OPTIONS}
            value={String(form.isEnabled)}
            onChange={(event) => setForm({ ...form, isEnabled: event.target.value === 'true' })}
          />
          <Select
            label="Tradable"
            options={BOOL_OPTIONS}
            value={String(form.isTradable)}
            onChange={(event) => setForm({ ...form, isTradable: event.target.value === 'true' })}
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
        open={deleteTarget !== null}
        onClose={() => {
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onSubmit={() => {
          if (deleteTarget) remove.mutate(deleteTarget.id);
        }}
        title={`Delete ${deleteTarget?.symbol ?? 'market'}`}
        description="The pair disappears from the demo trade screen. Historic trades keep their recorded symbol."
        confirmLabel="Delete market"
        confirmVariant="danger"
        loading={remove.isPending}
        error={deleteError}
      />
    </div>
  );
}
