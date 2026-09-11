'use client';

/**
 * Runtime platform settings.
 *
 * Grouped exactly as the backend declares them. The `system` group — which
 * holds maintenance mode and its customer-facing message — requires a SUPER_ADMIN
 * and is disabled for a plain administrator, matching the server's
 * `SUPER_ADMIN_REQUIRED` rule rather than letting the request fail late.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Lock } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import type {
  AdminSetting, AdminSettings, SettingValue, SettingsUpdateResult,
} from '@/lib/admin-types';
import {
  Badge, Button, Card, CardBody, CardHeader, ErrorState, ListSkeleton,
} from '@/components/ui/primitives';
import { Input, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/hooks/useSession';
import { useAdminPage } from '@/components/admin/AdminHeader';
import { ReasonDialog } from '@/components/admin/ReasonDialog';

type Draft = Record<string, string>;

const GROUP_LABELS: Record<string, string> = {
  branding: 'Branding',
  system: 'System',
  trading: 'Trading',
  withdrawal: 'Withdrawals',
  wallet: 'Wallet',
};

type ControlKind = 'boolean' | 'json' | 'number' | 'string';

function controlKind(setting: AdminSetting): ControlKind {
  const reference = setting.value ?? setting.default;
  if (typeof reference === 'boolean') return 'boolean';
  if (Array.isArray(reference) || (reference !== null && typeof reference === 'object')) return 'json';
  if (typeof reference === 'number') return 'number';
  return 'string';
}

function toDraft(setting: AdminSetting): string {
  const kind = controlKind(setting);
  const value = setting.value ?? setting.default;
  if (kind === 'json') return JSON.stringify(value, null, 2);
  if (kind === 'boolean') return String(Boolean(value));
  return value === null || value === undefined ? '' : String(value);
}

/** Switch built on a real checkbox so it stays keyboard operable and labelled. */
function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 rounded border-border bg-surface accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      />
      <span className="text-sm text-fg">{label}</span>
    </label>
  );
}

export default function AdminSettingsPage() {
  useAdminPage('Settings', 'Runtime configuration for the platform');

  const toast = useToast();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [draft, setDraft] = useState<Draft>({});
  const [jsonErrors, setJsonErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<AdminSettings>('/admin/settings'),
  });

  const settingsByKey = useMemo(() => {
    const map = new Map<string, AdminSetting>();
    query.data?.groups.forEach((group) =>
      group.settings.forEach((setting) => map.set(setting.key, setting)),
    );
    return map;
  }, [query.data]);

  const dirtyKeys = Object.keys(draft).filter((key) => {
    const setting = settingsByKey.get(key);
    return setting ? draft[key] !== toDraft(setting) : false;
  });

  const buildValues = (): Record<string, SettingValue> | null => {
    const values: Record<string, SettingValue> = {};
    for (const key of dirtyKeys) {
      const setting = settingsByKey.get(key);
      if (!setting) continue;
      const raw = draft[key] ?? '';
      const kind = controlKind(setting);
      if (kind === 'boolean') {
        values[key] = raw === 'true';
      } else if (kind === 'number') {
        const parsed = Number(raw);
        if (!Number.isFinite(parsed)) return null;
        values[key] = parsed;
      } else if (kind === 'json') {
        try {
          values[key] = JSON.parse(raw) as SettingValue;
        } catch {
          return null;
        }
      } else {
        values[key] = raw;
      }
    }
    return values;
  };

  const save = useMutation({
    mutationFn: (reason: string) => {
      const values = buildValues();
      if (values === null) {
        return Promise.reject(new Error('One of the JSON values is not valid JSON.'));
      }
      return api.patch<SettingsUpdateResult>('/admin/settings', { values, reason });
    },
    onSuccess: (result) => {
      toast.success('Settings updated', `${result.updated.length} setting(s) saved.`);
      void queryClient.invalidateQueries({ queryKey: ['admin', 'settings'] });
      void queryClient.invalidateQueries({ queryKey: ['platform-config'] });
      setDraft({});
      setConfirmOpen(false);
      setSaveError(null);
    },
    onError: (error) => {
      const message = errorMessage(error);
      setSaveError(message);
      toast.error('Could not save settings', message);
    },
  });

  if (query.isLoading) {
    return (
      <Card>
        <CardBody>
          <ListSkeleton rows={8} />
        </CardBody>
      </Card>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ErrorState
        title="Could not load settings"
        description={errorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const setValue = (key: string, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const renderControl = (setting: AdminSetting, locked: boolean) => {
    const kind = controlKind(setting);
    const value = draft[setting.key] ?? toDraft(setting);

    if (kind === 'boolean') {
      const checked = value === 'true';
      const isMaintenance = setting.key === 'maintenance_mode';
      return (
        <div className="space-y-2">
          <Switch
            checked={checked}
            disabled={locked}
            label={checked ? 'On' : 'Off'}
            onChange={(next) => setValue(setting.key, String(next))}
          />
          {isMaintenance && checked && (
            <p className="flex items-start gap-2 rounded-control bg-danger/10 px-3 py-2 text-xs text-danger">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              With maintenance mode on, customers are blocked from the platform and see the
              maintenance message instead.
            </p>
          )}
        </div>
      );
    }

    if (kind === 'json') {
      const error = jsonErrors[setting.key] ?? null;
      return (
        <Textarea
          label="Value (JSON)"
          value={value}
          disabled={locked}
          error={error}
          rows={6}
          className="font-mono text-xs"
          onChange={(event) => {
            const next = event.target.value;
            setValue(setting.key, next);
            try {
              JSON.parse(next);
              setJsonErrors((current) => {
                const copy = { ...current };
                delete copy[setting.key];
                return copy;
              });
            } catch {
              setJsonErrors((current) => ({
                ...current,
                [setting.key]: 'Not valid JSON — this value will not be saved until it parses.',
              }));
            }
          }}
        />
      );
    }

    return (
      <Input
        label="Value"
        type={kind === 'number' ? 'number' : 'text'}
        value={value}
        disabled={locked}
        onChange={(event) => setValue(setting.key, event.target.value)}
      />
    );
  };

  const hasJsonError = Object.keys(jsonErrors).length > 0;

  return (
    <div className="space-y-[15px]">
      <p className="rounded-card bg-primary/10 px-4 py-3 text-xs text-primary">
        Settings changes require a reason and are recorded in the audit log with their old and new
        values. Changes in the <strong>System</strong> group require a super administrator.
      </p>

      {query.data.groups.map((group) => {
        const locked = group.requiresSuperAdmin && !isSuperAdmin;
        return (
          <Card key={group.group}>
            <CardHeader
              title={GROUP_LABELS[group.group] ?? group.group}
              description={
                group.requiresSuperAdmin
                  ? 'Super administrator only. Affects what every customer sees.'
                  : undefined
              }
              action={
                group.requiresSuperAdmin ? (
                  <Badge tone={locked ? 'danger' : 'warning'}>
                    <Lock className="mr-1 inline h-3 w-3" aria-hidden />
                    Super admin
                  </Badge>
                ) : undefined
              }
            />
            <CardBody className="space-y-5 pt-2">
              {locked && (
                <p className="rounded-control bg-danger/10 px-3 py-2 text-xs text-danger">
                  Your role cannot change these settings. Ask a super administrator.
                </p>
              )}
              {group.settings.map((setting) => (
                <div
                  key={setting.key}
                  className="grid gap-2 border-b border-border/60 pb-4 last:border-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:gap-6"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-fg">{setting.key}</p>
                    {setting.description && (
                      <p className="mt-1 text-xs text-muted">{setting.description}</p>
                    )}
                  </div>
                  <div className="min-w-0">{renderControl(setting, locked)}</div>
                </div>
              ))}
            </CardBody>
          </Card>
        );
      })}

      <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-card bg-elevated px-4 py-3 shadow-raised">
        <p className="text-xs text-muted">
          {dirtyKeys.length === 0
            ? 'No unsaved changes.'
            : `${dirtyKeys.length} unsaved change(s): ${dirtyKeys.join(', ')}`}
        </p>
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setDraft({});
              setJsonErrors({});
            }}
            disabled={dirtyKeys.length === 0}
          >
            Discard
          </Button>
          <Button
            onClick={() => {
              setSaveError(null);
              setConfirmOpen(true);
            }}
            disabled={dirtyKeys.length === 0 || hasJsonError}
          >
            Save changes
          </Button>
        </div>
      </div>

      <ReasonDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setSaveError(null);
        }}
        onSubmit={(reason) => save.mutate(reason)}
        title="Save settings"
        description="The old and new value of every changed setting is written to the audit log."
        confirmLabel="Save settings"
        loading={save.isPending}
        error={saveError}
        details={
          <ul className="space-y-1 rounded-control bg-surface px-3 py-2 text-xs text-muted">
            {dirtyKeys.map((key) => (
              <li key={key} className="font-mono">
                {key}
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}
