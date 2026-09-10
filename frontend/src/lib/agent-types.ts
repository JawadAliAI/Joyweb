/**
 * Wire types for the reseller back office (`/api/agent`).
 *
 * Every list is scoped server-side to the calling agent's downline, so nothing
 * here carries an agent id to filter by — the session decides what is visible.
 * Money crosses as a string to preserve precision, exactly as elsewhere.
 */
import type { Money, PageMeta } from '@/lib/types';

export interface AgentPage<T> {
  items: T[];
  meta: PageMeta;
}

export interface AgentDashboard {
  subAgentCount: number;
  memberCount: number;
  activeMemberCount: number;
  tradeVolumeToday: Money;
  tradeVolume: { date: string; value: string }[];
  message?: string | null;
}

export interface AgentMemberRow {
  id: string;
  email: string;
  username: string;
  fullName: string;
  status: string;
  creditScore: number;
  isTestAccount: boolean;
  totalDemoValue: Money;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AgentMemberPage extends AgentPage<AgentMemberRow> {
  pricesAvailable?: boolean;
}

export interface AgentSubAgentRow {
  id: string;
  email: string;
  username: string;
  fullName: string;
  status: string;
  memberCount: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AgentKycRow {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  level: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AgentTradeRow {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  /** Whether an administrator has flagged the member for QA. Only a flagged
   *  member's open position can be given a scripted outcome. */
  isTestAccount: boolean;
  symbol: string;
  direction: 'UP' | 'DOWN';
  asset: string;
  amount: Money;
  durationSeconds: number;
  payoutPercent: string;
  entryPrice: Money | null;
  exitPrice: Money | null;
  status: string;
  outcome: string | null;
  profitLoss: Money | null;
  createdAt: string;
  expiresAt: string;
  settledAt: string | null;
}

export interface AgentTradePage extends AgentPage<AgentTradeRow> {
  stakeTotal: Money;
  profitLossTotal: Money;
}

export interface AgentMovementRow {
  id: string;
  kind: 'DEPOSIT' | 'WITHDRAWAL';
  userId: string;
  username: string | null;
  email: string | null;
  asset: string;
  amount: Money;
  status: string;
  reference: string | null;
  createdAt: string;
}

export interface AgentMovementPage extends AgentPage<AgentMovementRow> {
  amountTotal: Money;
}

export interface AgentInvite {
  id: string;
  code: string;
  inviteUrl: string;
  email: string | null;
  status: string;
  expiresAt: string;
  createdAt: string;
}
