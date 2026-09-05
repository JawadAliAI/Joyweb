/**
 * Wire types for the administration API (`/api/admin/*`).
 *
 * These mirror `backend/app/schemas/admin.py` exactly. Money always arrives as
 * a string so precision survives JSON; format it with `lib/format.ts` helpers
 * and never send a formatted value back.
 */
import type { Money, PageMeta, Role, UserStatus } from '@/lib/types';

export type { Money, PageMeta };

/** The `{items, meta}` envelope every paginated admin list returns. */
export interface AdminPage<T> {
  items: T[];
  meta: PageMeta;
}

/* ------------------------------------------------------------- Dashboard */

export interface SeriesPoint {
  date: string;
  value: string;
}

export interface AssetTotal {
  asset: string;
  label: string;
  available: Money;
  locked: Money;
  total: Money;
}

export interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  frozenUsers: number;
  newUsersThisWeek: number;
  demoBalances: AssetTotal[];
  demoTradesToday: number;
  demoTradeVolumeToday: Money;
  pendingWithdrawalsCount: number;
  pendingWithdrawalsValue: Money;
  pendingDepositsCount: number;
  pendingDepositsValue: Money;
  openSupportTickets: number;
}

export interface AdminDashboard {
  metrics: DashboardMetrics;
  registrations: SeriesPoint[];
  tradeVolume: SeriesPoint[];
  deposits: SeriesPoint[];
  withdrawals: SeriesPoint[];
  demoLabel: string;
  message?: string | null;
}

/* ----------------------------------------------------------------- Users */

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  creditScore: number;
  isTestAccount: boolean;
  totalDemoValue: Money;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUserListPage extends AdminPage<AdminUserRow> {
  pricesAvailable?: boolean;
}

export interface AdminWallet {
  asset: string;
  label: string;
  available: Money;
  locked: Money;
  total: Money;
}

export interface AdminTransaction {
  id: string;
  userId: string;
  type: string;
  asset: string;
  amount: Money;
  fee: Money;
  status: string;
  reference: string;
  description: string | null;
  createdAt: string;
}

export interface AdminTrade {
  id: string;
  userId: string;
  symbol: string;
  direction: string;
  asset: string;
  amount: Money;
  durationSeconds: number;
  payoutPercent: Money;
  entryPrice: Money;
  exitPrice: Money | null;
  status: string;
  outcome: string | null;
  profitLoss: Money | null;
  settlementSource: string | null;
  settlementNote: string | null;
  testScenarioId: string | null;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
}

export interface CreditScoreEntry {
  id: string;
  userId: string;
  oldScore: number;
  newScore: number;
  reason: string;
  changedBy: string | null;
  createdAt: string;
}

export interface CreditScorePage extends AdminPage<CreditScoreEntry> {
  disclaimer?: string;
}

export interface AdminRestriction {
  id: string;
  restriction: string;
  reason: string;
  appliedBy: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  createdAt: string;
}

/** Booleans and timestamps only — no password is ever exposed here. */
export interface SecuritySummary {
  hasFundPassword: boolean;
  mfaEnabled: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  isTestAccount: boolean;
  note: string;
}

export interface AdminUserDetail {
  profile: AdminUserRow;
  wallets: AdminWallet[];
  recentTransactions: AdminTransaction[];
  recentTrades: AdminTrade[];
  creditScoreHistory: CreditScoreEntry[];
  restrictions: AdminRestriction[];
  security: SecuritySummary;
  openTrades: number;
  freezeReason: string | null;
  creditScoreDisclaimer: string;
  pricesAvailable?: boolean;
}

/* --------------------------------------------------------- User actions */

export interface ReasonBody {
  reason: string;
}

export interface FreezeResult {
  userId: string;
  status: string;
  reason: string;
  frozenAt: string | null;
  message: string;
}

export interface BalanceAdjustBody {
  asset: string;
  amount: string;
  reason: string;
}

export interface BalanceAdjustResult {
  userId: string;
  asset: string;
  direction: string;
  amount: Money;
  oldAvailable: Money;
  newAvailable: Money;
  reference: string;
  reason: string;
  message: string;
}

export interface CreditScoreResult {
  userId: string;
  oldScore: number;
  newScore: number;
  clamped: boolean;
  reason: string;
  disclaimer: string;
}

/** A reset *link* carrying a one-time token — never a password. */
export interface PasswordResetResult {
  userId: string;
  issued: boolean;
  expiresAt: string;
  resetLink: string | null;
  message: string;
}

/* ----------------------------------------------------------------- Audit */

export interface AuditLogEntry {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  targetUserId: string | null;
  action: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  ipAddress: string | null;
  createdAt: string;
}

/* --------------------------------------------- Withdrawals and deposits */

export interface AdminWithdrawal {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  asset: string;
  network: string;
  amount: Money;
  fee: Money;
  netAmount: Money;
  destinationAddress: string;
  status: string;
  reference: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminWithdrawalPage extends AdminPage<AdminWithdrawal> {
  blockchainNotice?: string;
}

export interface AdminDeposit {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  asset: string;
  amount: Money;
  status: string;
  reference: string;
  simulatedAddress: string;
  createdAt: string;
}

export interface ReviewResult {
  id: string;
  status: string;
  reason: string;
  message: string;
  blockchainNotice: string;
}

/* ------------------------------------------------------------- Transfers */

export interface AdminTransfer {
  id: string;
  senderId: string;
  recipientId: string;
  asset: string;
  amount: Money;
  note: string | null;
  reference: string;
  createdAt: string;
}

/* --------------------------------------------------------------- Markets */

export interface AdminMarket {
  id: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  providerSymbol: string;
  displayName: string;
  priceDecimals: number;
  isEnabled: boolean;
  isTradable: boolean;
  sortOrder: number;
}

export interface MarketCreateBody {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  providerSymbol: string;
  displayName: string;
  priceDecimals: number;
  isEnabled: boolean;
  isTradable: boolean;
  sortOrder: number;
}

export interface MarketUpdateBody {
  providerSymbol?: string;
  displayName?: string;
  priceDecimals?: number;
  isEnabled?: boolean;
  isTradable?: boolean;
  sortOrder?: number;
}

/* ----------------------------------------------------- Trading durations */

export interface AdminDuration {
  id: string;
  seconds: number;
  label: string;
  payoutPercent: Money;
  minAmount: Money;
  maxAmount: Money;
  isEnabled: boolean;
  sortOrder: number;
}

export interface DurationCreateBody {
  seconds: number;
  label: string;
  payoutPercent: string;
  minAmount: string;
  maxAmount: string;
  isEnabled: boolean;
  sortOrder: number;
}

export interface DurationUpdateBody {
  label?: string;
  payoutPercent?: string;
  minAmount?: string;
  maxAmount?: string;
  isEnabled?: boolean;
  sortOrder?: number;
}

/* -------------------------------------------------------------- Settings */

export type SettingValue = string | number | boolean | null | unknown[] | Record<string, unknown>;

export interface AdminSetting {
  key: string;
  value: SettingValue;
  default: SettingValue;
  group: string;
  description: string | null;
}

export interface AdminSettingsGroup {
  group: string;
  settings: AdminSetting[];
  requiresSuperAdmin: boolean;
}

export interface AdminSettings {
  groups: AdminSettingsGroup[];
}

export interface SettingsUpdateBody {
  values: Record<string, SettingValue>;
  reason: string;
}

export interface SettingsUpdateResult {
  updated: string[];
  oldValues: Record<string, SettingValue>;
  newValues: Record<string, SettingValue>;
  reason: string;
}

/* --------------------------------------------------------------- Support */

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';

export interface SupportTicketRow {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  subject: string;
  category: string;
  status: TicketStatus;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  authorId: string;
  isStaffReply: boolean;
  body: string;
  createdAt: string;
}

export interface SupportTicketDetail {
  ticket: SupportTicketRow;
  messages: SupportMessage[];
}

export interface SupportReplyResult extends SupportMessage {
  ticketStatus: TicketStatus;
}

/* -------------------------------------------- QA test scenarios (test A/C) */

export type ForcedOutcome = 'WIN' | 'LOSS' | 'DRAW';

export interface TestScenarioCreateBody {
  targetUserId: string;
  forcedOutcome: ForcedOutcome;
  label: string;
  reason: string;
}

export interface TestScenario {
  id: string;
  targetUserId: string;
  targetUsername: string | null;
  forcedOutcome: ForcedOutcome;
  label: string;
  createdBy: string;
  consumed: boolean;
  consumedAt: string | null;
  createdAt: string;
  isTestScenario: boolean;
  notice: string;
}

export interface TestScenarioPage extends AdminPage<TestScenario> {
  notice?: string;
}


/** Result of closing every open position at the live market price. */
export interface BulkSettleResult {
  settled: number;
  won: number;
  lost: number;
  drawn: number;
  voided: number;
  failed: number;
  message: string;
  reason: string;
}

/** Result of cancelling every open position and refunding the stakes. */
export interface BulkVoidResult {
  voided: number;
  failed: number;
  returnedTotal: string;
  message: string;
  reason: string;
}

/** Result of queueing a scripted outcome across QA test accounts only. */
export interface BulkScenarioResult {
  created: number;
  targets: { userId: string; email: string }[];
  forcedOutcome: 'WIN' | 'LOSS' | 'DRAW';
  message: string;
  reason: string;
}
