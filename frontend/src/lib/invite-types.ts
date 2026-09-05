/**
 * Invite-only registration types.
 *
 * Registration is gated behind a single-use invite link minted by an
 * administrator. These shapes mirror the backend contract exactly.
 */
import type { Paged } from './types';

export type InviteStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface Invite {
  id: string;
  code: string;
  /** Fully-qualified registration link, ready to hand to the invitee. */
  inviteUrl: string;
  email: string | null;
  note: string | null;
  status: InviteStatus;
  expiresAt: string;
  createdAt: string;
  usedAt: string | null;
  usedByEmail: string | null;
  createdByEmail: string | null;
}

export type InvitePage = Paged<Invite>;

export interface CreateInvitePayload {
  /** 1..8760; the backend defaults to 72 when omitted. */
  expiresInHours?: number;
  email?: string | null;
  note?: string | null;
  /** Every admin mutation is audit-logged and requires a reason. */
  reason: string;
}

export interface RevokeInvitePayload {
  reason: string;
}

export interface InviteMutationResult {
  invite: Invite;
  message: string;
}

/** Public pre-flight check for `?invite=<code>` on the registration page. */
export interface InviteCheck {
  valid: boolean;
  /** Human-readable explanation when `valid` is false. */
  reason: string | null;
  /** When set, the invite is locked to this email address. */
  email: string | null;
  expiresAt: string | null;
}

/** Registration failures that are specifically about the invite. */
export const INVITE_ERROR_CODES = [
  'INVITE_REQUIRED',
  'INVITE_INVALID',
  'INVITE_EXPIRED',
  'INVITE_ALREADY_USED',
  'INVITE_REVOKED',
  'INVITE_EMAIL_MISMATCH',
] as const;

export type InviteErrorCode = (typeof INVITE_ERROR_CODES)[number];

export function isInviteErrorCode(code: string): code is InviteErrorCode {
  return (INVITE_ERROR_CODES as readonly string[]).includes(code);
}
