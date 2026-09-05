"""Request/response schemas for the administration API.

Money always crosses the wire as a string, never a float, so precision survives
the round trip.

Nothing in this module can carry a secret: there is no field anywhere here for a
plaintext password or fund password, in either direction. The only security
facts an administrator can see are booleans (``hasFundPassword``,
``mfaEnabled``) and a last-login timestamp.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel

# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #


class SeriesPoint(CamelModel):
    """One day of a zero-filled daily series."""

    date: str
    value: str


class AssetTotalOut(CamelModel):
    asset: str
    label: str
    available: str
    locked: str
    total: str


class DashboardMetricsOut(CamelModel):
    total_users: int
    active_users: int
    frozen_users: int
    new_users_this_week: int
    demo_balances: list[AssetTotalOut]
    demo_trades_today: int
    demo_trade_volume_today: str
    pending_withdrawals_count: int
    pending_withdrawals_value: str
    pending_deposits_count: int
    pending_deposits_value: str
    open_support_tickets: int


class DashboardOut(CamelModel):
    metrics: DashboardMetricsOut
    registrations: list[SeriesPoint]
    trade_volume: list[SeriesPoint]
    deposits: list[SeriesPoint]
    withdrawals: list[SeriesPoint]
    demo_label: str
    message: str | None = None


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #


class AdminUserRow(CamelModel):
    """One row of the admin user list."""

    id: str
    email: str
    username: str
    full_name: str
    role: str
    status: str
    credit_score: int
    is_test_account: bool
    total_demo_value: str
    created_at: datetime
    last_login_at: datetime | None = None


class AdminWalletOut(CamelModel):
    asset: str
    label: str
    available: str
    locked: str
    total: str


class AdminTransactionOut(CamelModel):
    id: str
    user_id: str
    type: str
    asset: str
    amount: str
    fee: str
    status: str
    reference: str
    description: str | None = None
    created_at: datetime


class AdminTradeOut(CamelModel):
    id: str
    user_id: str
    symbol: str
    direction: str
    asset: str
    amount: str
    duration_seconds: int
    payout_percent: str
    entry_price: str
    exit_price: str | None = None
    status: str
    outcome: str | None = None
    profit_loss: str | None = None
    settlement_source: str | None = None
    settlement_note: str | None = None
    test_scenario_id: str | None = None
    created_at: datetime
    expires_at: datetime
    settled_at: datetime | None = None


class CreditScoreEntryOut(CamelModel):
    id: str
    user_id: str
    old_score: int
    new_score: int
    reason: str
    changed_by: str | None = None
    created_at: datetime


class RestrictionOut(CamelModel):
    id: str
    restriction: str
    reason: str
    applied_by: str | None = None
    lifted_at: datetime | None = None
    lifted_by: str | None = None
    created_at: datetime


class SecuritySummaryOut(CamelModel):
    """Booleans only. No hash and no plaintext secret is ever included."""

    has_fund_password: bool
    mfa_enabled: bool
    must_change_password: bool
    last_login_at: datetime | None = None
    is_test_account: bool
    note: str


class AdminUserDetailOut(CamelModel):
    profile: AdminUserRow
    wallets: list[AdminWalletOut]
    recent_transactions: list[AdminTransactionOut]
    recent_trades: list[AdminTradeOut]
    credit_score_history: list[CreditScoreEntryOut]
    restrictions: list[RestrictionOut]
    security: SecuritySummaryOut
    open_trades: int
    freeze_reason: str | None = None
    credit_score_disclaimer: str


# --------------------------------------------------------------------------- #
# User actions
# --------------------------------------------------------------------------- #


class ReasonIn(CamelModel):
    """Shared body for any action that must be explained and audited."""

    reason: str = Field(..., min_length=1, max_length=2000)


class FreezeResultOut(CamelModel):
    user_id: str
    status: str
    reason: str
    frozen_at: datetime | None = None
    message: str


class BalanceAdjustIn(CamelModel):
    asset: str
    amount: Decimal = Field(..., gt=0)
    reason: str = Field(..., min_length=1, max_length=2000)


class BalanceAdjustOut(CamelModel):
    user_id: str
    asset: str
    direction: str
    amount: str
    old_available: str
    new_available: str
    reference: str
    reason: str
    message: str


class CreditScoreIn(CamelModel):
    score: int = Field(..., ge=1, le=100)
    reason: str = Field(..., min_length=1, max_length=2000)


class CreditScoreOut(CamelModel):
    user_id: str
    old_score: int
    new_score: int
    clamped: bool
    reason: str
    disclaimer: str


class PasswordResetOut(CamelModel):
    """The result of issuing a reset token.

    ``resetLink`` is populated only outside production, and even then it carries
    a one-time token — never a password. There is no field for a password here
    because no password is ever retrievable.
    """

    user_id: str
    issued: bool
    expires_at: datetime
    reset_link: str | None = None
    message: str


# --------------------------------------------------------------------------- #
# Audit
# --------------------------------------------------------------------------- #


class AuditLogOut(CamelModel):
    id: str
    actor_id: str | None = None
    actor_email: str | None = None
    target_user_id: str | None = None
    action: str
    old_value: dict[str, Any] | None = None
    new_value: dict[str, Any] | None = None
    reason: str | None = None
    ip_address: str | None = None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Withdrawals / deposits
# --------------------------------------------------------------------------- #


class AdminWithdrawalOut(CamelModel):
    id: str
    user_id: str
    username: str | None = None
    email: str | None = None
    asset: str
    network: str
    amount: str
    fee: str
    net_amount: str
    destination_address: str
    status: str
    reference: str
    review_note: str | None = None
    reviewed_by: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime


class AdminDepositOut(CamelModel):
    id: str
    user_id: str
    username: str | None = None
    email: str | None = None
    asset: str
    amount: str
    status: str
    reference: str
    simulated_address: str
    created_at: datetime


class ReviewResultOut(CamelModel):
    id: str
    status: str
    reason: str
    message: str
    blockchain_notice: str


# --------------------------------------------------------------------------- #
# Transfers
# --------------------------------------------------------------------------- #


class AdminTransferOut(CamelModel):
    id: str
    sender_id: str
    recipient_id: str
    asset: str
    amount: str
    note: str | None = None
    reference: str
    created_at: datetime


# --------------------------------------------------------------------------- #
# Markets
# --------------------------------------------------------------------------- #


class MarketOut(CamelModel):
    id: str
    symbol: str
    base_asset: str
    quote_asset: str
    provider_symbol: str
    display_name: str
    price_decimals: int
    is_enabled: bool
    is_tradable: bool
    sort_order: int


class MarketCreateIn(CamelModel):
    symbol: str = Field(..., min_length=3, max_length=20)
    base_asset: str = Field(..., min_length=1, max_length=20)
    quote_asset: str = Field(..., min_length=1, max_length=20)
    provider_symbol: str = Field(..., min_length=1, max_length=30)
    display_name: str = Field(..., min_length=1, max_length=40)
    price_decimals: int = Field(2, ge=0, le=12)
    is_enabled: bool = True
    is_tradable: bool = True
    sort_order: int = 100


class MarketUpdateIn(CamelModel):
    provider_symbol: str | None = Field(None, min_length=1, max_length=30)
    display_name: str | None = Field(None, min_length=1, max_length=40)
    price_decimals: int | None = Field(None, ge=0, le=12)
    is_enabled: bool | None = None
    is_tradable: bool | None = None
    sort_order: int | None = None


# --------------------------------------------------------------------------- #
# Trading durations
# --------------------------------------------------------------------------- #


class DurationOut(CamelModel):
    id: str
    seconds: int
    label: str
    payout_percent: str
    min_amount: str
    max_amount: str
    is_enabled: bool
    sort_order: int


class DurationCreateIn(CamelModel):
    seconds: int = Field(..., gt=0, le=86400)
    label: str = Field(..., min_length=1, max_length=30)
    payout_percent: Decimal = Field(..., ge=0)
    min_amount: Decimal = Field(..., gt=0)
    max_amount: Decimal = Field(..., gt=0)
    is_enabled: bool = True
    sort_order: int = 100


class DurationUpdateIn(CamelModel):
    label: str | None = Field(None, min_length=1, max_length=30)
    payout_percent: Decimal | None = Field(None, ge=0)
    min_amount: Decimal | None = Field(None, gt=0)
    max_amount: Decimal | None = Field(None, gt=0)
    is_enabled: bool | None = None
    sort_order: int | None = None


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


class SettingOut(CamelModel):
    key: str
    value: Any = None
    default: Any = None
    group: str
    description: str | None = None


class SettingsGroupOut(CamelModel):
    group: str
    settings: list[SettingOut]
    requires_super_admin: bool = False


class SettingsOut(CamelModel):
    groups: list[SettingsGroupOut]


class SettingsUpdateIn(CamelModel):
    """A flat map of setting key -> new value, plus the mandatory reason."""

    values: dict[str, Any]
    reason: str = Field(..., min_length=1, max_length=2000)


class SettingsUpdateOut(CamelModel):
    updated: list[str]
    old_values: dict[str, Any]
    new_values: dict[str, Any]
    reason: str


# --------------------------------------------------------------------------- #
# Support
# --------------------------------------------------------------------------- #


class SupportMessageOut(CamelModel):
    id: str
    author_id: str
    is_staff_reply: bool
    body: str
    created_at: datetime


class SupportTicketRow(CamelModel):
    id: str
    user_id: str
    username: str | None = None
    email: str | None = None
    subject: str
    category: str
    status: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class SupportTicketDetailOut(CamelModel):
    ticket: SupportTicketRow
    messages: list[SupportMessageOut]


class SupportReplyIn(CamelModel):
    body: str = Field(..., min_length=1, max_length=5000)


class SupportStatusIn(CamelModel):
    status: str = Field(..., min_length=1, max_length=20)


# --------------------------------------------------------------------------- #
# Test scenarios (QA on designated test accounts only)
# --------------------------------------------------------------------------- #


class TestScenarioCreateIn(CamelModel):
    """Request a scripted outcome for a QA test account.

    Refused outright for any account whose ``isTestAccount`` flag is false.
    """

    target_user_id: str
    forced_outcome: str = Field(..., description="WIN, LOSS or DRAW")
    label: str = Field(..., min_length=1, max_length=120)
    reason: str = Field(..., min_length=1, max_length=2000)


class TestScenarioOut(CamelModel):
    id: str
    target_user_id: str
    target_username: str | None = None
    forced_outcome: str
    label: str
    created_by: str
    consumed: bool
    consumed_at: datetime | None = None
    created_at: datetime
    is_test_scenario: bool = True
    notice: str


# --------------------------------------------------------------------------- #
# Admin roster / roles
# --------------------------------------------------------------------------- #


class AdminRow(CamelModel):
    id: str
    email: str
    username: str
    full_name: str
    role: str
    status: str
    last_login_at: datetime | None = None
    created_at: datetime


class RoleChangeIn(CamelModel):
    role: str = Field(..., description="USER, ADMIN or SUPER_ADMIN")
    reason: str = Field(..., min_length=1, max_length=2000)


class RoleChangeOut(CamelModel):
    user_id: str
    old_role: str
    new_role: str
    reason: str


class TestAccountIn(CamelModel):
    """Flag or unflag an account for QA use.

    A flagged account is the only kind on which a scripted trade outcome may be
    applied, and the flag is visible to the account holder.
    """

    is_test_account: bool
    reason: str = Field(..., min_length=1, max_length=2000)


class InviteCreateIn(CamelModel):
    """Issue one single-use registration invitation."""

    expires_in_hours: int = Field(72, ge=1, le=8760)
    email: str | None = Field(None, max_length=255,
                              description="Lock the invite to one address.")
    note: str | None = Field(None, max_length=500)
    reason: str = Field(..., min_length=1, max_length=2000)


class InviteOut(CamelModel):
    id: str
    code: str
    invite_url: str
    email: str | None
    note: str | None
    status: str
    expires_at: datetime
    created_at: datetime
    used_at: datetime | None
    used_by_email: str | None
    created_by_email: str | None


# --------------------------------------------------------------------------- #
# Bulk controls for open demo trades
#
# There is deliberately no schema here for forcing a WIN or a LOSS on an
# ordinary customer: settling closes positions at the live public price and
# voiding returns every stake, and those are the only two bulk outcomes.
# --------------------------------------------------------------------------- #


class BulkSettleOut(CamelModel):
    """Result of settling every open trade at the live public market price."""

    settled: int
    won: int
    lost: int
    drawn: int
    voided: int
    failed: int
    message: str
    reason: str


class BulkVoidOut(CamelModel):
    """Result of cancelling every open trade and returning every stake."""

    voided: int
    failed: int = 0
    returned_total: str
    message: str
    reason: str


class BulkTestScenarioIn(CamelModel):
    """Queue one scripted outcome on every account flagged ``isTestAccount``.

    Accounts that are not flagged are never touched, so this can never decide a
    real demo customer's trade.
    """

    forced_outcome: str = Field(..., description="WIN, LOSS or DRAW")
    reason: str = Field(..., min_length=1, max_length=2000)


class BulkTestScenarioTargetOut(CamelModel):
    user_id: str
    email: str


class BulkTestScenarioOut(CamelModel):
    created: int
    targets: list[BulkTestScenarioTargetOut]
    forced_outcome: str
    message: str
    reason: str


class ForceNextTradeIn(CamelModel):
    """One-step QA setup: flag the account and queue the next outcome."""

    forced_outcome: Literal["WIN", "LOSS", "DRAW"]
    label: str | None = Field(None, max_length=120)
    reason: str = Field(..., min_length=1, max_length=2000)
