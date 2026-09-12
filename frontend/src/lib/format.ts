/**
 * Display formatting.
 *
 * Amounts arrive from the API as strings to preserve precision. These helpers
 * format for the eye only — never feed a formatted value back into a request.
 */

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

const numeric = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** Group digits and fix decimals, e.g. "6276.00" -> "6,276.00". */
export function formatAmount(
  value: string | number | null | undefined,
  decimals = 2,
  fallback = '—',
): string {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  return parsed.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** A price, using the market's own decimal precision. */
export function formatPrice(
  value: string | number | null | undefined,
  decimals = 2,
  fallback = '—',
): string {
  return formatAmount(value, decimals, fallback);
}

/** Signed percentage, e.g. "-0.50%" / "+1.24%". */
export function formatPercent(
  value: string | number | null | undefined,
  decimals = 2,
  fallback = '—',
): string {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  const sign = parsed > 0 ? '+' : '';
  return `${sign}${parsed.toFixed(decimals)}%`;
}

/** Compact volume, e.g. 1.24B / 980.5M / 12.3K. */
export function formatCompact(
  value: string | number | null | undefined,
  fallback = '—',
): string {
  const parsed = numeric(value);
  if (parsed === null) return fallback;
  const abs = Math.abs(parsed);
  if (abs >= 1e9) return `${(parsed / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(parsed / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(parsed / 1e3).toFixed(2)}K`;
  return parsed.toFixed(2);
}

/** Direction of a change, for colour selection. */
export function changeTone(value: string | number | null | undefined): 'up' | 'down' | 'flat' {
  const parsed = numeric(value);
  if (parsed === null || parsed === 0) return 'flat';
  return parsed > 0 ? 'up' : 'down';
}

export function toneClass(tone: 'up' | 'down' | 'flat'): string {
  if (tone === 'up') return 'text-primary';
  if (tone === 'down') return 'text-danger';
  return 'text-muted';
}

/** mm:ss for a trade countdown. */
export function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = seconds / 60;
  return Number.isInteger(minutes) ? `${minutes} minutes` : `${seconds} seconds`;
}

export function formatDateTime(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDate(value: string | null | undefined, fallback = '—'): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export function timeAgo(value: string | null | undefined): string {
  if (!value) return '—';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

/** "BTC/USDT" -> "BTC-USDT", for use in a URL path segment. */
export function symbolToSlug(symbol: string): string {
  return symbol.replace('/', '-');
}

export function slugToSymbol(slug: string): string {
  return decodeURIComponent(slug).replace('-', '/');
}

/** "DEMO_USDT" / "CryptoCPT_USDT" -> "USDT". Internal prefixes are never shown to users. */
export function assetLabel(asset: string): string {
  return asset.replace(/^(DEMO|PAPER|CryptoCPT)_/i, '').replace(/_/g, ' ');
}

/** "DEMO_USDT" / "CryptoCPT_USDT" -> "USDT", for the ticker glyph only. */
export function assetTicker(asset: string): string {
  return asset.replace(/^(DEMO|PAPER|CryptoCPT)_/i, '');
}

/** Human label for a ledger entry type. */
export function transactionLabel(type: string): string {
  const labels: Record<string, string> = {
    DEMO_DEPOSIT: 'Deposit',
    DEMO_WITHDRAWAL: 'Withdrawal',
    DEMO_TRANSFER_IN: 'Transfer received',
    DEMO_TRANSFER_OUT: 'Transfer sent',
    DEMO_CONVERSION: 'Conversion',
    TRADE_STAKE: 'Trade stake',
    TRADE_RETURN: 'Trade return',
    ADMIN_CREDIT: 'Balance credited',
    ADMIN_DEBIT: 'Balance debited',
  };
  return labels[type] ?? type.replace(/_/g, ' ').toLowerCase();
}

export function statusTone(status: string): 'up' | 'down' | 'flat' {
  if (['COMPLETED', 'ACTIVE', 'RESOLVED', 'WIN'].includes(status)) return 'up';
  if (['FAILED', 'CANCELLED', 'REJECTED', 'FROZEN', 'SUSPENDED', 'LOSS'].includes(status))
    return 'down';
  return 'flat';
}

/**
 * The address to show for an account. An account registered with a username
 * only carries a reserved placeholder address, which is never worth showing,
 * so the username stands in for it.
 */
export function accountContact(user: { email: string; username: string }): string {
  return user.email.endsWith('@no-email.invalid') ? `@${user.username}` : user.email;
}
