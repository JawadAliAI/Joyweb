"""Administrative operations for the demo exchange.

Everything in this module operates on SIMULATED balances and SIMULATED activity.
No function here can move real money or touch a blockchain.

Hard rules enforced (or relied upon) by this module:

* An administrator can never read or set a customer's plaintext password or fund
  password. Only Argon2 hashes exist, and none of them leave the database.
  Password recovery is limited to issuing a reset token.
* Every balance change, freeze, credit-score change and settings change requires
  a non-empty ``reason`` and writes an ``AuditLog`` row in the *same*
  transaction as the change itself, so an unaudited change cannot exist.
* Nothing here commits. The route opens the transaction and commits once, which
  keeps the change, its ledger entry, its audit row and its notification atomic.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Iterable

from fastapi import Request
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ValidationError
from app.db.base import utcnow
from app.db.models import (
    AccountRestriction, Asset, AuditAction, CreditScoreHistory, Deposit,
    SupportTicket, TicketStatus, Trade, TradeStatus, TransactionStatus,
    TransactionType, User, UserStatus, Wallet, Withdrawal, WithdrawalStatus,
)
from app.services import audit_service, notification_service, wallet_service

MIN_CREDIT_SCORE = 1
MAX_CREDIT_SCORE = 100

# Wording used anywhere a score is surfaced. This is an internal demo-account
# score invented by this simulator; it is not a credit-bureau score and has no
# bearing on anybody's real-world creditworthiness.
CREDIT_SCORE_DISCLAIMER = (
    "This is an internal demo account score used only inside this simulator. "
    "It is not a credit-bureau score and has no real-world meaning."
)

NO_BLOCKCHAIN_NOTICE = (
    "This is a simulated withdrawal. No blockchain transaction was created and "
    "none will be created; no real funds moved."
)

CREDIT = "CREDIT"
DEBIT = "DEBIT"


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #


def money(value: Any) -> str:
    """Render any numeric as a fixed-precision string. Never a float."""
    return f"{Decimal(str(value or 0)):.8f}"


def require_reason(reason: str | None, *, field: str = "reason") -> str:
    """Every sensitive admin action must be explained. No blank reasons."""
    text = (reason or "").strip()
    if not text:
        raise ValidationError(f"A non-empty {field} is required for this action.",
                              code="REASON_REQUIRED")
    return text[:2000]


def paginated(db: Session, stmt: Select, page: int, page_size: int) -> tuple[list[Any], int]:
    """Run a select twice: once counted, once windowed."""
    total = db.scalar(
        select(func.count()).select_from(stmt.order_by(None).subquery())) or 0
    rows = list(db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)))
    return rows, int(total)


def _day_bounds(days: int) -> tuple[datetime, list[date]]:
    today = datetime.now(timezone.utc).date()
    start_day = today - timedelta(days=days - 1)
    start = datetime(start_day.year, start_day.month, start_day.day, tzinfo=timezone.utc)
    return start, [start_day + timedelta(days=offset) for offset in range(days)]


def _day_key(raw: Any) -> str | None:
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date().isoformat()
    if isinstance(raw, date):
        return raw.isoformat()
    return str(raw)[:10]


def _zero_filled(rows: Iterable[tuple[Any, Any]],
                 days_list: list[date]) -> list[dict[str, str]]:
    """Turn (day, value) rows into a dense, gap-free daily series."""
    bucket: dict[str, Decimal] = {}
    for raw_day, value in rows:
        key = _day_key(raw_day)
        if key is None:
            continue
        bucket[key] = bucket.get(key, Decimal("0")) + Decimal(str(value or 0))
    series = []
    for day in days_list:
        key = day.isoformat()
        series.append({"date": key, "value": money(bucket.get(key, Decimal("0")))})
    return series


def _series(db: Session, date_column, value_expr, where: list,
            days: int) -> list[dict[str, str]]:
    start, days_list = _day_bounds(days)
    day = func.date(date_column)
    stmt = select(day, value_expr).where(date_column >= start)
    for clause in where:
        stmt = stmt.where(clause)
    stmt = stmt.group_by(day)
    return _zero_filled(db.execute(stmt).all(), days_list)


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #


def dashboard_metrics(db: Session) -> dict[str, Any]:
    """Headline counters for the admin dashboard. Every figure is simulated."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    day_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)

    total_users = db.scalar(select(func.count(User.id))) or 0
    active_users = db.scalar(
        select(func.count(User.id)).where(User.status == UserStatus.ACTIVE.value)) or 0
    frozen_users = db.scalar(
        select(func.count(User.id)).where(User.status.in_(
            [UserStatus.FROZEN.value, UserStatus.SUSPENDED.value]))) or 0
    new_this_week = db.scalar(
        select(func.count(User.id)).where(User.created_at >= week_ago)) or 0

    balances_rows = db.execute(
        select(Wallet.asset,
               func.coalesce(func.sum(Wallet.available), 0),
               func.coalesce(func.sum(Wallet.locked), 0))
        .group_by(Wallet.asset)).all()
    demo_balances = [
        {
            "asset": asset,
            "label": wallet_service.ASSET_META.get(asset, {}).get("label", asset),
            "available": money(available),
            "locked": money(locked),
            "total": money(Decimal(str(available or 0)) + Decimal(str(locked or 0))),
        }
        for asset, available, locked in balances_rows
    ]

    trades_today = db.scalar(
        select(func.count(Trade.id)).where(Trade.created_at >= day_start)) or 0
    volume_today = db.scalar(
        select(func.coalesce(func.sum(Trade.amount), 0))
        .where(Trade.created_at >= day_start)) or 0

    pending_wd = db.execute(
        select(func.count(Withdrawal.id), func.coalesce(func.sum(Withdrawal.amount), 0))
        .where(Withdrawal.status == WithdrawalStatus.PENDING.value)).one()
    pending_dep = db.execute(
        select(func.count(Deposit.id), func.coalesce(func.sum(Deposit.amount), 0))
        .where(Deposit.status == TransactionStatus.PENDING.value)).one()

    open_tickets = db.scalar(
        select(func.count(SupportTicket.id)).where(SupportTicket.status.in_(
            [TicketStatus.OPEN.value, TicketStatus.IN_PROGRESS.value]))) or 0

    return {
        "totalUsers": int(total_users),
        "activeUsers": int(active_users),
        "frozenUsers": int(frozen_users),
        "newUsersThisWeek": int(new_this_week),
        "demoBalances": demo_balances,
        "demoTradesToday": int(trades_today),
        "demoTradeVolumeToday": money(volume_today),
        "pendingWithdrawalsCount": int(pending_wd[0] or 0),
        "pendingWithdrawalsValue": money(pending_wd[1]),
        "pendingDepositsCount": int(pending_dep[0] or 0),
        "pendingDepositsValue": money(pending_dep[1]),
        "openSupportTickets": int(open_tickets),
    }


# --------------------------------------------------------------------------- #
# Chart series
# --------------------------------------------------------------------------- #


def registration_series(db: Session, days: int = 30) -> list[dict[str, str]]:
    """New demo registrations per day, zero-filled across the window."""
    return _series(db, User.created_at, func.count(User.id), [], days)


def trade_volume_series(db: Session, days: int = 30) -> list[dict[str, str]]:
    """Total simulated stake placed per day, zero-filled."""
    return _series(db, Trade.created_at,
                   func.coalesce(func.sum(Trade.amount), 0), [], days)


def deposit_series(db: Session, days: int = 30) -> list[dict[str, str]]:
    """Completed simulated deposit value per day, zero-filled."""
    return _series(db, Deposit.created_at,
                   func.coalesce(func.sum(Deposit.amount), 0),
                   [Deposit.status == TransactionStatus.COMPLETED.value], days)


def withdrawal_series(db: Session, days: int = 30) -> list[dict[str, str]]:
    """Completed simulated withdrawal value per day, zero-filled."""
    return _series(db, Withdrawal.created_at,
                   func.coalesce(func.sum(Withdrawal.amount), 0),
                   [Withdrawal.status == WithdrawalStatus.COMPLETED.value], days)


# --------------------------------------------------------------------------- #
# Balance adjustment
# --------------------------------------------------------------------------- #


def adjust_balance(db: Session, admin: User, user: User, asset: str,
                   amount: Decimal, reason: str, direction: str,
                   request: Request | None = None) -> dict[str, Any]:
    """Credit or debit a customer's simulated balance.

    A debit that would overdraw is refused by ``wallet_service`` rather than
    clamped, so an administrator can never manufacture a negative balance. The
    audit row records the before and after available balance for the wallet.
    """
    reason = require_reason(reason)
    wallet_service.validate_asset(asset)
    amount = wallet_service.validate_amount(amount)
    direction = (direction or "").upper()
    if direction not in (CREDIT, DEBIT):
        raise ValidationError("Direction must be CREDIT or DEBIT.",
                              code="INVALID_DIRECTION")

    wallet = wallet_service.get_wallet(db, user.id, asset)
    old_available = Decimal(wallet.available)
    label = wallet_service.ASSET_META.get(asset, {}).get("label", asset)

    if direction == CREDIT:
        transaction = wallet_service.credit(
            db, user.id, asset, amount, tx_type=TransactionType.ADMIN_CREDIT,
            description=f"Administrator credit ({label})",
            metadata={"reason": reason, "adminId": admin.id, "simulated": True})
        action = AuditAction.BALANCE_CREDITED
        verb = "credited to"
    else:
        transaction = wallet_service.debit(
            db, user.id, asset, amount, tx_type=TransactionType.ADMIN_DEBIT,
            description=f"Administrator debit ({label})",
            metadata={"reason": reason, "adminId": admin.id, "simulated": True})
        action = AuditAction.BALANCE_DEBITED
        verb = "debited from"

    db.flush()
    new_available = Decimal(wallet.available)

    audit_service.record(
        db, action, actor=admin, target_user_id=user.id,
        old_value={"asset": asset, "available": money(old_available)},
        new_value={"asset": asset, "available": money(new_available),
                   "amount": money(amount), "reference": transaction.reference},
        reason=reason, request=request)

    notification_service.notify(
        db, user.id,
        f"Demo balance adjusted ({label})",
        f"An administrator {verb} your simulated {label} balance: "
        f"{money(amount)} {label}. Reason: {reason}. "
        "This affects simulated funds only — no real money was involved.",
        notification_service.DEMO_BALANCE)

    return {
        "userId": user.id,
        "asset": asset,
        "direction": direction,
        "amount": money(amount),
        "oldAvailable": money(old_available),
        "newAvailable": money(new_available),
        "reference": transaction.reference,
        "reason": reason,
        "message": ("Simulated balance updated. No real funds were moved and no "
                    "blockchain transaction was created."),
    }


# --------------------------------------------------------------------------- #
# Internal demo account score
# --------------------------------------------------------------------------- #


def set_credit_score(db: Session, admin: User, user: User, new_score: int,
                     reason: str, request: Request | None = None) -> dict[str, Any]:
    """Set a demo account's internal score, clamped to 1..100.

    This value is invented by the simulator for demo purposes only. It is not a
    credit-bureau score and is never described as one.
    """
    reason = require_reason(reason)
    try:
        requested = int(new_score)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Score must be a whole number.",
                              code="INVALID_SCORE") from exc
    score = max(MIN_CREDIT_SCORE, min(MAX_CREDIT_SCORE, requested))

    old_score = int(user.credit_score)
    user.credit_score = score

    db.add(CreditScoreHistory(user_id=user.id, old_score=old_score, new_score=score,
                              reason=reason, changed_by=admin.id))
    audit_service.record(
        db, AuditAction.CREDIT_SCORE_CHANGED, actor=admin, target_user_id=user.id,
        old_value={"creditScore": old_score}, new_value={"creditScore": score},
        reason=reason, request=request)
    notification_service.notify(
        db, user.id, "Demo account score updated",
        f"Your internal demo account score changed from {old_score} to {score}. "
        f"Reason: {reason}. {CREDIT_SCORE_DISCLAIMER}",
        notification_service.ACCOUNT)

    return {
        "userId": user.id,
        "oldScore": old_score,
        "newScore": score,
        "clamped": score != requested,
        "reason": reason,
        "disclaimer": CREDIT_SCORE_DISCLAIMER,
    }


# --------------------------------------------------------------------------- #
# Freeze / unfreeze
# --------------------------------------------------------------------------- #


def freeze_account(db: Session, admin: User, user: User, reason: str,
                   request: Request | None = None) -> dict[str, Any]:
    """Freeze a demo account: it can still sign in and read, but not move funds."""
    reason = require_reason(reason)
    old_status = user.status
    user.status = UserStatus.FROZEN.value
    user.freeze_reason = reason
    user.frozen_at = utcnow()
    user.frozen_by = admin.id

    db.add(AccountRestriction(user_id=user.id, restriction="FREEZE", reason=reason,
                              applied_by=admin.id))
    audit_service.record(
        db, AuditAction.ACCOUNT_FROZEN, actor=admin, target_user_id=user.id,
        old_value={"status": old_status}, new_value={"status": user.status},
        reason=reason, request=request)
    notification_service.notify(
        db, user.id, "Demo account frozen",
        f"Your demo account has been frozen by an administrator. Reason: {reason}. "
        "You can still sign in and contact support, but demo trading, transfers, "
        "withdrawals and conversions are paused.",
        notification_service.ACCOUNT)

    return {"userId": user.id, "status": user.status, "reason": reason,
            "frozenAt": user.frozen_at}


def unfreeze_account(db: Session, admin: User, user: User, reason: str,
                     request: Request | None = None) -> dict[str, Any]:
    """Lift a freeze and close out any open restriction rows."""
    reason = require_reason(reason)
    old_status = user.status
    user.status = UserStatus.ACTIVE.value
    user.freeze_reason = None
    user.frozen_at = None
    user.frozen_by = None

    open_restrictions = list(db.scalars(
        select(AccountRestriction).where(AccountRestriction.user_id == user.id,
                                         AccountRestriction.lifted_at.is_(None))))
    for restriction in open_restrictions:
        restriction.lifted_at = utcnow()
        restriction.lifted_by = admin.id

    audit_service.record(
        db, AuditAction.ACCOUNT_UNFROZEN, actor=admin, target_user_id=user.id,
        old_value={"status": old_status}, new_value={"status": user.status},
        reason=reason, request=request)
    notification_service.notify(
        db, user.id, "Demo account restored",
        f"Your demo account restriction has been lifted. Reason: {reason}. "
        "Full demo functionality is available again.",
        notification_service.ACCOUNT)

    return {"userId": user.id, "status": user.status, "reason": reason}


# --------------------------------------------------------------------------- #
# User listing helpers
# --------------------------------------------------------------------------- #


def user_search_clause(search: str):
    """Case-insensitive match across email, username, first and last name."""
    like = f"%{search.strip()}%"
    return or_(User.email.ilike(like), User.username.ilike(like),
               User.first_name.ilike(like), User.last_name.ilike(like))


def total_demo_value_map(db: Session, user_ids: list[str],
                         prices: dict[str, Decimal]) -> dict[str, Decimal]:
    """Estimated DEMO USDT value per user, in a single query.

    An asset with no available price contributes nothing rather than being
    guessed at — the platform never invents a number.
    """
    totals: dict[str, Decimal] = {uid: Decimal("0") for uid in user_ids}
    if not user_ids:
        return totals
    rows = db.execute(
        select(Wallet.user_id, Wallet.asset, Wallet.available, Wallet.locked)
        .where(Wallet.user_id.in_(user_ids))).all()
    for uid, asset, available, locked in rows:
        amount = Decimal(str(available or 0)) + Decimal(str(locked or 0))
        if asset == Asset.DEMO_USDT.value:
            totals[uid] = totals.get(uid, Decimal("0")) + amount
        else:
            price = prices.get(asset)
            if price is not None:
                totals[uid] = totals.get(uid, Decimal("0")) + amount * price
    return totals


def open_trade_count(db: Session, user_id: str) -> int:
    """How many simulated positions the account currently has open."""
    return int(db.scalar(
        select(func.count(Trade.id)).where(
            Trade.user_id == user_id,
            Trade.status == TradeStatus.OPEN.value)) or 0)


def security_summary(user: User) -> dict[str, Any]:
    """Safe security facts only.

    Deliberately returns booleans and timestamps — never a hash, never a
    plaintext secret. No code path in this application exposes a password or a
    fund password to an administrator.
    """
    return {
        "hasFundPassword": bool(user.fund_password_hash),
        "mfaEnabled": bool(user.mfa_secret),
        "mustChangePassword": bool(user.must_change_password),
        "lastLoginAt": user.last_login_at,
        "isTestAccount": bool(user.is_test_account),
        "note": ("Passwords and fund passwords are stored only as Argon2 hashes "
                 "and can never be viewed or set by an administrator. Password "
                 "recovery is limited to issuing a reset token."),
    }
