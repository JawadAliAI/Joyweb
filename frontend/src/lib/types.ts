/**
 * Wire types shared across the app.
 *
 * Money always arrives as a string so no precision is lost crossing JSON.
 * Format it with the helpers in `lib/format.ts`; never coerce it with
 * `parseFloat` for anything other than display.
 */

export type Money = string;

export interface PlatformConfig {
  appName: string;
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  supportEmail: string;
  displayCurrency: string;
  demoLabel: string;
  demoMode: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  tradingEnabled: boolean;
  withdrawalsEnabled: boolean;
  depositsEnabled: boolean;
  transfersEnabled: boolean;
  conversionsEnabled: boolean;
  assets?: AssetMeta[];
}

export interface AssetMeta {
  asset: string;
  label: string;
  decimals: number;
  market: string | null;
  icon: string;
}

export type UserStatus = 'ACTIVE' | 'FROZEN' | 'SUSPENDED';
export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  creditScore: number;
  creditScoreBand: string;
  avatarUrl: string | null;
  isTestAccount: boolean;
  mustChangePassword: boolean;
  hasFundPassword: boolean;
  freezeReason: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  demoMode: boolean;
  demoLabel: string;
}

export interface WalletBalance {
  asset: string;
  label: string;
  available: Money;
  locked: Money;
  total: Money;
  estimatedValue: Money | null;
  decimals: number;
}

export interface Portfolio {
  totalEstimatedValue: Money;
  displayCurrency: string;
  pricesAvailable: boolean;
  assets: WalletBalance[];
  demoLabel: string;
  message?: string | null;
}

export interface MarketRow {
  symbol: string;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  priceDecimals: number;
  isTradable: boolean;
  isFavorite: boolean;
  price: Money | null;
  change24h: Money | null;
  high24h: Money | null;
  low24h: Money | null;
  volume24h: Money | null;
}

export interface MarketListResponse {
  items: MarketRow[];
  dataAvailable: boolean;
  message?: string;
}

export interface TickerRow {
  symbol: string;
  price: Money | null;
  change24h: Money | null;
  volume24h: Money | null;
  timestamp: number | null;
}

export interface TickerListResponse {
  items: TickerRow[];
  dataAvailable: boolean;
  message?: string;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TradeDirection = 'UP' | 'DOWN';
export type TradeOutcome = 'WIN' | 'LOSS' | 'DRAW';
export type TradeStatus = 'OPEN' | 'SETTLED' | 'VOIDED';

export interface TradeDuration {
  seconds: number;
  label: string;
  payoutPercent: string;
  minAmount: Money;
  maxAmount: Money;
}

export interface TradeMarketSummary {
  symbol: string;
  displayName: string;
  baseAsset: string;
  quoteAsset: string;
  priceDecimals: number;
}

export interface StakeAssetOption {
  asset: string;
  label: string;
  decimals: number;
}

export interface TradeConfig {
  markets: TradeMarketSummary[];
  stakeAssets?: StakeAssetOption[];
  durations: TradeDuration[];
  quickAmounts: Money[];
  minAmount: Money;
  maxAmount: Money;
  stakeAsset: string;
  defaultDurationSeconds: number;
  disclosure: string;
  demoNotice: string;
}

export interface Trade {
  id: string;
  symbol: string;
  direction: TradeDirection;
  asset: string;
  amount: Money;
  durationSeconds: number;
  payoutPercent: string;
  entryPrice: Money;
  exitPrice: Money | null;
  status: TradeStatus;
  outcome: TradeOutcome | null;
  profitLoss: Money | null;
  returnedAmount: Money | null;
  opensAt: string;
  expiresAt: string;
  settledAt: string | null;
  settlementSource: string | null;
  settlementNote: string | null;
  secondsRemaining: number;
  createdAt: string;
}

export type TransactionStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export interface Transaction {
  id: string;
  type: string;
  asset: string;
  amount: Money;
  fee: Money;
  status: TransactionStatus;
  reference: string;
  description: string | null;
  createdAt: string;
}

export interface WithdrawalNetwork {
  id: string;
  asset: string;
  network: string;
  label: string;
  availableBalance: Money;
}

export interface WithdrawalOptions {
  enabled: boolean;
  /** Shown when withdrawals are switched off. Admin-editable. */
  message?: string;
  /** Optional notice shown while withdrawals are open. Admin-editable. */
  notice?: string | null;
  networks: WithdrawalNetwork[];
  minAmount: Money;
  maxAmount: Money;
  feeFlat: Money;
  feePercent: string;
  fundPasswordSet: boolean;
  demoLabel: string;
}

export interface Withdrawal {
  id: string;
  asset: string;
  network: string;
  amount: Money;
  fee: Money;
  netAmount: Money;
  destinationAddress: string;
  status: string;
  reference: string;
  createdAt: string;
  reviewNote?: string | null;
  reviewedAt?: string | null;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  category: string;
  read: boolean;
  createdAt: string;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SupportMessage {
  id: string;
  body: string;
  isStaffReply: boolean;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  messages?: SupportMessage[];
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}
