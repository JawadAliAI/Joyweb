"""Administration API for the demo exchange.

Mounted at ``/api/admin``. Every route requires an administrator (some require a
super administrator) and every response uses the ``{"success": true, "data": …}``
envelope.

SAFETY BOUNDARIES ENFORCED HERE
-------------------------------
* **No password is ever readable or settable by an administrator.** There is no
  route that returns a password or a fund password, in plaintext or hashed.
  Recovery is limited to ``POST /users/{id}/password-reset``, which stores only a
  SHA-256 digest of a one-time token and returns the reset *link* (never a
  password), and only outside production.
* **No administrator can force a real customer's trade outcome.** The only
  scripted-outcome mechanism is ``/test-scenarios``, which exists solely so QA
  can exercise the WIN / LOSS / DRAW settlement paths on accounts explicitly
  flagged ``is_test_account``. Any other target is refused with
  ``NOT_A_TEST_ACCOUNT``, every scenario is labelled as a test scenario in the
  response, and every creation and cancellation is written to the audit log.
* **Every balance change, freeze, score change, settings change and test
  scenario requires a non-empty reason** and writes an ``AuditLog`` row inside
  the same transaction as the change.
* **Nothing here touches a blockchain.** Approving a simulated withdrawal moves
  simulated ledger balances only; no on-chain transaction is created, ever.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings as env
from app.core.errors import ForbiddenError, NotFoundError, ValidationError
from app.core.security import new_reset_token
from app.db.base import utcnow
from app.db.models import (
    AccountRestriction, AuditAction, AuditLog, CreditScoreHistory, Deposit,
    Invite, Market, PasswordResetToken, Role, SupportMessage,
    SupportTicket, TicketStatus, Trade, TradeOutcome, TradeStatus, TradeTestScenario,
    TradingDuration, Transaction, TransactionStatus, TransactionType, Transfer,
    User, Wallet, Withdrawal, WithdrawalStatus,
)
from app.db.session import get_db
from app.api.deps import require_admin, require_super_admin
from app.schemas import admin as schemas
from app.schemas.common import ok, paginate, PaginationParams
from app.services import (
    admin_service, audit_service, invite_service, notification_service,
    pricing_service, settings_service, trade_engine, wallet_service,
)

router = APIRouter()

DEMO_LABEL = env.DEMO_LABEL
SUPER_ADMIN_GROUPS = {"system"}


# --------------------------------------------------------------------------- #
# Local helpers
# --------------------------------------------------------------------------- #


def _page(page: int, page_size: int) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size)


def _money(value: Any) -> str:
    return admin_service.money(value)


def _get_user(db: Session, user_id: str) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFoundError("Demo user not found.", code="USER_NOT_FOUND")
    return user


def _asset_label(asset: str) -> str:
    return wallet_service.ASSET_META.get(asset, {}).get("label", asset)


def _user_row(user: User, total_value: Decimal) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "fullName": user.full_name,
        "role": user.role,
        "status": user.status,
        "creditScore": int(user.credit_score),
        "isTestAccount": bool(user.is_test_account),
        "totalDemoValue": _money(total_value),
        "createdAt": user.created_at,
        "lastLoginAt": user.last_login_at,
    }


def _wallet_row(wallet: Wallet) -> dict[str, Any]:
    return {
        "asset": wallet.asset,
        "label": _asset_label(wallet.asset),
        "available": _money(wallet.available),
        "locked": _money(wallet.locked),
        "total": _money(wallet.total),
    }


def _transaction_row(tx: Transaction) -> dict[str, Any]:
    return {
        "id": tx.id, "userId": tx.user_id, "type": tx.type, "asset": tx.asset,
        "amount": _money(tx.amount), "fee": _money(tx.fee), "status": tx.status,
        "reference": tx.reference, "description": tx.description,
        "createdAt": tx.created_at,
    }


def _trade_row(trade: Trade, member: User | None = None) -> dict[str, Any]:
    """One position.

    `member` carries who placed it. The row reads `userId` alone without it,
    which is enough on a screen that already knows whose account it is showing
    (the user detail page) but useless on a platform-wide list.
    """
    return {
        "id": trade.id, "userId": trade.user_id, "symbol": trade.symbol,
        "username": member.username if member else None,
        "email": member.email if member else None,
        "isTestAccount": bool(member.is_test_account) if member else None,
        "direction": trade.direction, "asset": trade.asset,
        "amount": _money(trade.amount), "durationSeconds": trade.duration_seconds,
        "payoutPercent": _money(trade.payout_percent),
        "entryPrice": _money(trade.entry_price),
        "exitPrice": _money(trade.exit_price) if trade.exit_price is not None else None,
        "status": trade.status, "outcome": trade.outcome,
        "profitLoss": _money(trade.profit_loss) if trade.profit_loss is not None else None,
        "settlementSource": trade.settlement_source,
        "settlementNote": trade.settlement_note,
        "testScenarioId": trade.test_scenario_id,
        "createdAt": trade.created_at, "expiresAt": trade.expires_at,
        "settledAt": trade.settled_at,
    }


def _score_row(entry: CreditScoreHistory) -> dict[str, Any]:
    return {
        "id": entry.id, "userId": entry.user_id, "oldScore": entry.old_score,
        "newScore": entry.new_score, "reason": entry.reason,
        "changedBy": entry.changed_by, "createdAt": entry.created_at,
    }


def _restriction_row(entry: AccountRestriction) -> dict[str, Any]:
    return {
        "id": entry.id, "restriction": entry.restriction, "reason": entry.reason,
        "appliedBy": entry.applied_by, "liftedAt": entry.lifted_at,
        "liftedBy": entry.lifted_by, "createdAt": entry.created_at,
    }


def _audit_row(entry: AuditLog) -> dict[str, Any]:
    return {
        "id": entry.id, "actorId": entry.actor_id, "actorEmail": entry.actor_email,
        "targetUserId": entry.target_user_id, "action": entry.action,
        "oldValue": entry.old_value, "newValue": entry.new_value,
        "reason": entry.reason, "ipAddress": entry.ip_address,
        "createdAt": entry.created_at,
    }


def _withdrawal_row(withdrawal: Withdrawal, user: User | None) -> dict[str, Any]:
    return {
        "id": withdrawal.id, "userId": withdrawal.user_id,
        "username": user.username if user else None,
        "email": user.email if user else None,
        "asset": withdrawal.asset, "network": withdrawal.network,
        "amount": _money(withdrawal.amount), "fee": _money(withdrawal.fee),
        "netAmount": _money(withdrawal.net_amount),
        "destinationAddress": withdrawal.destination_address,
        "status": withdrawal.status, "reference": withdrawal.reference,
        "reviewNote": withdrawal.review_note, "reviewedBy": withdrawal.reviewed_by,
        "reviewedAt": withdrawal.reviewed_at, "createdAt": withdrawal.created_at,
    }


def _deposit_row(deposit: Deposit, user: User | None) -> dict[str, Any]:
    return {
        "id": deposit.id, "userId": deposit.user_id,
        "username": user.username if user else None,
        "email": user.email if user else None,
        "asset": deposit.asset, "amount": _money(deposit.amount),
        "status": deposit.status, "reference": deposit.reference,
        "simulatedAddress": deposit.simulated_address,
        "createdAt": deposit.created_at,
    }


def _transfer_row(transfer: Transfer) -> dict[str, Any]:
    return {
        "id": transfer.id, "senderId": transfer.sender_id,
        "recipientId": transfer.recipient_id, "asset": transfer.asset,
        "amount": _money(transfer.amount), "note": transfer.note,
        "reference": transfer.reference, "createdAt": transfer.created_at,
    }


def _market_row(market: Market) -> dict[str, Any]:
    return {
        "id": market.id, "symbol": market.symbol, "baseAsset": market.base_asset,
        "quoteAsset": market.quote_asset, "providerSymbol": market.provider_symbol,
        "displayName": market.display_name, "priceDecimals": market.price_decimals,
        "isEnabled": market.is_enabled, "isTradable": market.is_tradable,
        "sortOrder": market.sort_order,
    }


def _duration_row(duration: TradingDuration) -> dict[str, Any]:
    return {
        "id": duration.id, "seconds": duration.seconds, "label": duration.label,
        "payoutPercent": _money(duration.payout_percent),
        "minAmount": _money(duration.min_amount),
        "maxAmount": _money(duration.max_amount),
        "isEnabled": duration.is_enabled, "sortOrder": duration.sort_order,
    }


def _scenario_row(scenario: TradeTestScenario, user: User | None) -> dict[str, Any]:
    return {
        "id": scenario.id, "targetUserId": scenario.target_user_id,
        "targetUsername": user.username if user else None,
        "forcedOutcome": scenario.forced_outcome, "label": scenario.label,
        "createdBy": scenario.created_by, "consumed": scenario.consumed,
        "consumedAt": scenario.consumed_at, "createdAt": scenario.created_at,
        "isTestScenario": True,
        "notice": TEST_SCENARIO_NOTICE,
    }


TEST_SCENARIO_NOTICE = (
    "QA test scenario. Applies only to accounts flagged as test accounts, is "
    "labelled as a scripted outcome wherever it is used, and is fully audited. "
    "It can never be applied to a real demo customer's trade."
)


def _parse_dt(value: str | None, field: str) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise ValidationError(f"{field} must be an ISO-8601 date or datetime.",
                              code="INVALID_DATE") from exc
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #


@router.get("/dashboard", summary="Admin dashboard metrics and charts")
def get_dashboard(days: int = Query(30, ge=7, le=90),
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Metric cards plus the four daily series (registrations, trade volume,
    deposits, withdrawals). Every number describes simulated activity only."""
    payload = {
        "metrics": admin_service.dashboard_metrics(db),
        "registrations": admin_service.registration_series(db, days),
        "tradeVolume": admin_service.trade_volume_series(db, days),
        "deposits": admin_service.deposit_series(db, days),
        "withdrawals": admin_service.withdrawal_series(db, days),
        "demoLabel": "",
        "message": "",
    }
    return ok(payload)


# --------------------------------------------------------------------------- #
# Users
# --------------------------------------------------------------------------- #


@router.get("/users", summary="List demo users")
async def list_users(
    search: str | None = Query(None, max_length=255),
    status: str | None = Query(None),
    role: str | None = Query(None),
    sort: str = Query("created", pattern="^(created|balance)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Paginated user list with search (email / username / name), status and role
    filters, sortable by signup date or by total simulated balance. Each row
    carries the account's estimated total value in DEMO USDT."""
    params = _page(page, page_size)
    stmt = select(User)
    if search:
        stmt = stmt.where(admin_service.user_search_clause(search))
    if status:
        stmt = stmt.where(User.status == status.upper())
    if role:
        stmt = stmt.where(User.role == role.upper())

    if sort == "balance":
        balance_sum = (
            select(func.coalesce(func.sum(Wallet.available + Wallet.locked), 0))
            .where(Wallet.user_id == User.id).correlate(User).scalar_subquery())
        stmt = stmt.order_by(balance_sum.desc() if order == "desc" else balance_sum.asc())
    else:
        stmt = stmt.order_by(User.created_at.desc() if order == "desc"
                             else User.created_at.asc())

    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    snapshot = await pricing_service.asset_prices(db)
    totals = admin_service.total_demo_value_map(db, [u.id for u in rows], snapshot.prices)
    items = [_user_row(user, totals.get(user.id, Decimal("0"))) for user in rows]
    payload = paginate(items, total, params)
    payload["pricesAvailable"] = snapshot.available
    return ok(payload)


@router.get("/users/{user_id}", summary="Full demo user detail")
async def get_user_detail(user_id: str, db: Session = Depends(get_db),
                          admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Profile, simulated wallets, recent ledger entries, recent simulated
    trades, score history, restrictions and a security summary.

    The security summary contains booleans and a last-login timestamp only —
    never a password hash and never a plaintext secret."""
    user = _get_user(db, user_id)
    snapshot = await pricing_service.asset_prices(db)
    wallets = wallet_service.list_wallets(db, user.id)
    total_value = wallet_service.portfolio_value(wallets, snapshot.prices)

    transactions = list(db.scalars(
        select(Transaction).where(Transaction.user_id == user.id)
        .order_by(Transaction.created_at.desc()).limit(20)))
    trades = list(db.scalars(
        select(Trade).where(Trade.user_id == user.id)
        .order_by(Trade.created_at.desc()).limit(20)))
    scores = list(db.scalars(
        select(CreditScoreHistory).where(CreditScoreHistory.user_id == user.id)
        .order_by(CreditScoreHistory.created_at.desc()).limit(50)))
    restrictions = list(db.scalars(
        select(AccountRestriction).where(AccountRestriction.user_id == user.id)
        .order_by(AccountRestriction.created_at.desc()).limit(50)))

    return ok({
        "profile": _user_row(user, total_value),
        "wallets": [_wallet_row(w) for w in wallets],
        "recentTransactions": [_transaction_row(t) for t in transactions],
        "recentTrades": [_trade_row(t) for t in trades],
        "creditScoreHistory": [_score_row(s) for s in scores],
        "restrictions": [_restriction_row(r) for r in restrictions],
        "security": admin_service.security_summary(user),
        "openTrades": admin_service.open_trade_count(db, user.id),
        "freezeReason": user.freeze_reason,
        "creditScoreDisclaimer": admin_service.CREDIT_SCORE_DISCLAIMER,
        "pricesAvailable": snapshot.available,
    })


@router.post("/users/{user_id}/freeze", summary="Freeze a demo account")
def freeze_user(user_id: str, body: schemas.ReasonIn, request: Request,
                db: Session = Depends(get_db),
                admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Freeze an account. A reason is mandatory and is recorded in the audit log
    and shown to the customer."""
    user = _get_user(db, user_id)
    result = admin_service.freeze_account(db, admin, user, body.reason, request)
    db.commit()
    result["message"] = "Demo account frozen. The customer has been notified."
    return ok(result)


@router.post("/users/{user_id}/test-account",
             summary="Flag or unflag an account for QA test scenarios")
def set_test_account(user_id: str, body: schemas.TestAccountIn, request: Request,
                     db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Mark an account as a QA test account, or clear the mark.

    Only a flagged account can have a trade outcome scripted through
    ``/test-scenarios``. The flag is deliberately visible to the account holder
    and every change is audited, so a scripted result can never be passed off as
    a market-derived one.
    """
    user = _get_user(db, user_id)
    admin_service.require_reason(body.reason)

    was = bool(user.is_test_account)
    user.is_test_account = bool(body.is_test_account)

    audit_service.record(
        db, AuditAction.USER_UPDATED, actor=admin, target_user_id=user.id,
        old_value={"isTestAccount": was},
        new_value={"isTestAccount": user.is_test_account},
        reason=body.reason, request=request)

    if user.is_test_account and not was:
        notification_service.notify(
            db, user.id, "Account marked as a test account",
            "An administrator marked this account as a QA test account. Trade "
            "outcomes on it may be scripted for testing and are labelled as such "
            "on each trade.", notification_service.ACCOUNT)
    elif was and not user.is_test_account:
        notification_service.notify(
            db, user.id, "Test account flag removed",
            "This account is no longer a QA test account. Trades settle purely "
            "against public market prices.", notification_service.ACCOUNT)

    db.commit()
    return ok({
        "userId": user.id,
        "isTestAccount": user.is_test_account,
        "reason": body.reason,
        "message": ("Account flagged for QA. Scripted outcomes are permitted and "
                    "will be labelled on every affected trade."
                    if user.is_test_account else
                    "Test flag removed. This account now settles only against "
                    "public market prices."),
    })


@router.post("/users/{user_id}/unfreeze", summary="Lift a demo account freeze")
def unfreeze_user(user_id: str, body: schemas.ReasonIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Restore full demo functionality. A reason is mandatory and audited."""
    user = _get_user(db, user_id)
    result = admin_service.unfreeze_account(db, admin, user, body.reason, request)
    db.commit()
    result["message"] = "Demo account restored. The customer has been notified."
    return ok(result)


@router.post("/users/{user_id}/balance/credit", summary="Credit a simulated balance")
def credit_balance(user_id: str, body: schemas.BalanceAdjustIn, request: Request,
                   db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Add simulated funds to a customer's wallet. Writes an ``ADMIN_CREDIT``
    ledger entry, an audit row carrying the old and new balance, and notifies
    the customer. No real funds are involved."""
    user = _get_user(db, user_id)
    result = admin_service.adjust_balance(db, admin, user, body.asset, body.amount,
                                          body.reason, admin_service.CREDIT, request)
    db.commit()
    return ok(result)


@router.post("/users/{user_id}/balance/debit", summary="Debit a simulated balance")
def debit_balance(user_id: str, body: schemas.BalanceAdjustIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Remove simulated funds from a customer's wallet. A debit that would
    overdraw is refused with ``INSUFFICIENT_BALANCE`` rather than clamped."""
    user = _get_user(db, user_id)
    result = admin_service.adjust_balance(db, admin, user, body.asset, body.amount,
                                          body.reason, admin_service.DEBIT, request)
    db.commit()
    return ok(result)


@router.post("/users/{user_id}/agent", summary="Move a member into an agent's downline")
def assign_agent(user_id: str, body: schemas.AssignAgentIn, request: Request,
                 db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Attach a member to an agent, or detach them with a null ``agentId``.

    Registration normally sets this from the invitation the account was created
    with. This is the administrator's way to correct that after the fact — for
    an account that predates the agent tier, or one signed up directly.

    An agent account's own upline is set here too: pointing an ``AGENT`` at
    another agent makes it a sub-agent.
    """
    target = _get_user(db, user_id)
    admin_service.require_reason(body.reason)

    agent = None
    if body.agent_id:
        agent = db.get(User, body.agent_id)
        if agent is None or agent.role != Role.AGENT.value:
            raise ValidationError("That account is not an agent.", code="NOT_AN_AGENT")
        if agent.id == target.id:
            raise ValidationError("An account cannot be its own agent.",
                                  code="SELF_ASSIGNMENT")

    # An agent joining another agent becomes a sub-agent; anyone else becomes a
    # member. Writing to one column or the other keeps the two relationships
    # from ever describing the same pair twice.
    field = "agent_parent_id" if target.role == Role.AGENT.value else "agent_id"
    previous = getattr(target, field)
    setattr(target, field, agent.id if agent else None)

    audit_service.record(
        db, AuditAction.USER_UPDATED, actor=admin, target_user_id=target.id,
        old_value={field: previous}, new_value={field: agent.id if agent else None},
        reason=body.reason, request=request)
    db.commit()

    return ok({
        "userId": target.id,
        "email": target.email,
        "relationship": field,
        "agentId": agent.id if agent else None,
        "agentUsername": agent.username if agent else None,
    })


@router.post("/users/{user_id}/credit-score", summary="Set the internal demo account score")
def set_score(user_id: str, body: schemas.CreditScoreIn, request: Request,
              db: Session = Depends(get_db),
              admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Set the account's internal demo score (clamped to 1–100).

    This is an internal demo account score invented by this simulator. It is not
    a credit-bureau score and carries no real-world meaning."""
    user = _get_user(db, user_id)
    result = admin_service.set_credit_score(db, admin, user, body.score,
                                            body.reason, request)
    db.commit()
    return ok(result)


@router.post("/users/{user_id}/password-reset", summary="Issue a password reset token")
def issue_password_reset(user_id: str, body: schemas.ReasonIn, request: Request,
                         db: Session = Depends(get_db),
                         admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Issue a one-time password reset token for a customer.

    This is the ONLY password-recovery mechanism available to an administrator.
    Only the SHA-256 digest of the token is stored; the plaintext token exists
    only inside the returned link, and the link itself is returned only outside
    production. No password — current or new — is ever revealed to anyone."""
    user = _get_user(db, user_id)
    reason = admin_service.require_reason(body.reason)

    raw, digest = new_reset_token()
    expires_at = utcnow() + timedelta(minutes=env.PASSWORD_RESET_TTL_MINUTES)
    db.add(PasswordResetToken(user_id=user.id, token_hash=digest, expires_at=expires_at))

    audit_service.record(
        db, AuditAction.PASSWORD_RESET_REQUESTED, actor=admin, target_user_id=user.id,
        new_value={"issuedBy": "ADMIN", "expiresAt": expires_at.isoformat()},
        reason=reason, request=request)
    notification_service.notify(
        db, user.id, "Password reset issued",
        "An administrator issued a password reset link for your account. "
        "If you did not expect this, contact support.",
        notification_service.SECURITY)
    db.commit()

    base = (env.cors_origins[0] if env.cors_origins else "").rstrip("/")
    link = f"{base}/reset-password?token={raw}"
    return ok({
        "userId": user.id,
        "issued": True,
        "expiresAt": expires_at,
        "resetLink": None if env.is_production else link,
        "message": ("Reset token issued. Passwords are never viewable or settable "
                    "by an administrator; the customer must choose a new one via "
                    "the reset link."
                    if env.is_production else
                    "Reset token issued. The link is shown here because this is a "
                    "non-production environment. It contains a one-time token, "
                    "never a password."),
    })


@router.get("/users/{user_id}/transactions", summary="A user's simulated ledger")
def user_transactions(user_id: str, page: int = Query(1, ge=1),
                      page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                      db: Session = Depends(get_db),
                      admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Paginated ledger entries for one demo account."""
    user = _get_user(db, user_id)
    params = _page(page, page_size)
    stmt = (select(Transaction).where(Transaction.user_id == user.id)
            .order_by(Transaction.created_at.desc()))
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    return ok(paginate([_transaction_row(t) for t in rows], total, params))


@router.get("/users/{user_id}/trades", summary="A user's simulated trades")
def user_trades(user_id: str, page: int = Query(1, ge=1),
                page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                db: Session = Depends(get_db),
                admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Paginated simulated positions for one demo account."""
    user = _get_user(db, user_id)
    params = _page(page, page_size)
    stmt = (select(Trade).where(Trade.user_id == user.id)
            .order_by(Trade.created_at.desc()))
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    return ok(paginate([_trade_row(t) for t in rows], total, params))


@router.get("/users/{user_id}/audit-logs", summary="Audit trail for one user")
def user_audit_logs(user_id: str, page: int = Query(1, ge=1),
                    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every audited action taken on or by this demo account."""
    user = _get_user(db, user_id)
    params = _page(page, page_size)
    stmt = (select(AuditLog).where(AuditLog.target_user_id == user.id)
            .order_by(AuditLog.created_at.desc()))
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    return ok(paginate([_audit_row(r) for r in rows], total, params))


# --------------------------------------------------------------------------- #
# Audit log
# --------------------------------------------------------------------------- #


@router.get("/audit-logs", summary="Platform-wide audit log")
def list_audit_logs(action: str | None = Query(None),
                    actor_id: str | None = Query(None, alias="actorId"),
                    target_user_id: str | None = Query(None, alias="targetUserId"),
                    date_from: str | None = Query(None, alias="dateFrom"),
                    date_to: str | None = Query(None, alias="dateTo"),
                    page: int = Query(1, ge=1),
                    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """The append-only audit trail, filterable by action, actor, target and date
    range. Audit rows are never edited or deleted by application code."""
    params = _page(page, page_size)
    stmt = select(AuditLog)
    if action:
        stmt = stmt.where(AuditLog.action == action.upper())
    if actor_id:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if target_user_id:
        stmt = stmt.where(AuditLog.target_user_id == target_user_id)
    start = _parse_dt(date_from, "dateFrom")
    end = _parse_dt(date_to, "dateTo")
    if start:
        stmt = stmt.where(AuditLog.created_at >= start)
    if end:
        stmt = stmt.where(AuditLog.created_at <= end)
    stmt = stmt.order_by(AuditLog.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    return ok(paginate([_audit_row(r) for r in rows], total, params))


# --------------------------------------------------------------------------- #
# Withdrawals
# --------------------------------------------------------------------------- #


@router.get("/withdrawals", summary="Simulated withdrawal queue")
def list_withdrawals(status: str = Query("PENDING"),
                     page: int = Query(1, ge=1),
                     page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                     db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Simulated withdrawal requests. Pass ``status=ALL`` for the full history.

    Nothing in this queue corresponds to an on-chain transfer."""
    params = _page(page, page_size)
    stmt = select(Withdrawal)
    if status and status.upper() != "ALL":
        stmt = stmt.where(Withdrawal.status == status.upper())
    stmt = stmt.order_by(Withdrawal.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    users = {u.id: u for u in db.scalars(
        select(User).where(User.id.in_([r.user_id for r in rows])))} if rows else {}
    items = [_withdrawal_row(r, users.get(r.user_id)) for r in rows]
    payload = paginate(items, total, params)
    payload["blockchainNotice"] = admin_service.NO_BLOCKCHAIN_NOTICE
    return ok(payload)


def _withdrawal_transaction(db: Session, withdrawal: Withdrawal) -> Transaction | None:
    return db.scalar(select(Transaction).where(
        Transaction.user_id == withdrawal.user_id,
        Transaction.reference == withdrawal.reference))


@router.post("/withdrawals/{withdrawal_id}/approve",
             summary="Approve a simulated withdrawal")
def approve_withdrawal(withdrawal_id: str, body: schemas.ReasonIn, request: Request,
                       db: Session = Depends(get_db),
                       admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Consume the customer's locked simulated funds and mark the request
    complete.

    No blockchain transaction was created and none will be created — this only
    retires a simulated ledger balance."""
    withdrawal = db.get(Withdrawal, withdrawal_id)
    if withdrawal is None:
        raise NotFoundError("Withdrawal not found.", code="WITHDRAWAL_NOT_FOUND")
    if withdrawal.status != WithdrawalStatus.PENDING.value:
        raise ValidationError("This withdrawal has already been reviewed.",
                              code="WITHDRAWAL_NOT_PENDING")
    reason = admin_service.require_reason(body.reason)

    wallet_service.release_locked(db, withdrawal.user_id, withdrawal.asset,
                                  Decimal(withdrawal.amount), back_to_available=False)
    old_status = withdrawal.status
    withdrawal.status = WithdrawalStatus.COMPLETED.value
    withdrawal.reviewed_by = admin.id
    withdrawal.reviewed_at = utcnow()
    withdrawal.review_note = reason

    transaction = _withdrawal_transaction(db, withdrawal)
    if transaction is not None:
        transaction.status = TransactionStatus.COMPLETED.value

    audit_service.record(
        db, AuditAction.WITHDRAWAL_REVIEWED, actor=admin,
        target_user_id=withdrawal.user_id,
        old_value={"status": old_status},
        new_value={"status": withdrawal.status, "amount": _money(withdrawal.amount),
                   "asset": withdrawal.asset, "reference": withdrawal.reference,
                   "blockchainTransaction": False},
        reason=reason, request=request)
    notification_service.notify(
        db, withdrawal.user_id, "Demo withdrawal approved",
        f"Your simulated withdrawal of {_money(withdrawal.amount)} "
        f"{_asset_label(withdrawal.asset)} was approved. "
        f"{admin_service.NO_BLOCKCHAIN_NOTICE}",
        notification_service.DEMO_WITHDRAWAL)
    db.commit()

    return ok({
        "id": withdrawal.id, "status": withdrawal.status, "reason": reason,
        "message": "Simulated withdrawal approved and the locked demo funds retired.",
        "blockchainNotice": admin_service.NO_BLOCKCHAIN_NOTICE,
    })


@router.post("/withdrawals/{withdrawal_id}/reject",
             summary="Reject a simulated withdrawal")
def reject_withdrawal(withdrawal_id: str, body: schemas.ReasonIn, request: Request,
                      db: Session = Depends(get_db),
                      admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Return the locked simulated funds to the customer's available balance and
    mark the request rejected. A reason is mandatory and is shown to the
    customer. No blockchain transaction was or will be created."""
    withdrawal = db.get(Withdrawal, withdrawal_id)
    if withdrawal is None:
        raise NotFoundError("Withdrawal not found.", code="WITHDRAWAL_NOT_FOUND")
    if withdrawal.status != WithdrawalStatus.PENDING.value:
        raise ValidationError("This withdrawal has already been reviewed.",
                              code="WITHDRAWAL_NOT_PENDING")
    reason = admin_service.require_reason(body.reason)

    wallet_service.release_locked(db, withdrawal.user_id, withdrawal.asset,
                                  Decimal(withdrawal.amount), back_to_available=True)
    old_status = withdrawal.status
    withdrawal.status = WithdrawalStatus.REJECTED.value
    withdrawal.reviewed_by = admin.id
    withdrawal.reviewed_at = utcnow()
    withdrawal.review_note = reason

    transaction = _withdrawal_transaction(db, withdrawal)
    if transaction is not None:
        transaction.status = TransactionStatus.CANCELLED.value

    audit_service.record(
        db, AuditAction.WITHDRAWAL_REVIEWED, actor=admin,
        target_user_id=withdrawal.user_id,
        old_value={"status": old_status},
        new_value={"status": withdrawal.status, "amount": _money(withdrawal.amount),
                   "asset": withdrawal.asset, "reference": withdrawal.reference,
                   "blockchainTransaction": False},
        reason=reason, request=request)
    notification_service.notify(
        db, withdrawal.user_id, "Demo withdrawal rejected",
        f"Your simulated withdrawal of {_money(withdrawal.amount)} "
        f"{_asset_label(withdrawal.asset)} was rejected and the demo funds "
        f"returned to your available balance. Reason: {reason}. "
        f"{admin_service.NO_BLOCKCHAIN_NOTICE}",
        notification_service.DEMO_WITHDRAWAL)
    db.commit()

    return ok({
        "id": withdrawal.id, "status": withdrawal.status, "reason": reason,
        "message": "Simulated withdrawal rejected and the demo funds returned.",
        "blockchainNotice": admin_service.NO_BLOCKCHAIN_NOTICE,
    })


# --------------------------------------------------------------------------- #
# Deposits
# --------------------------------------------------------------------------- #


@router.get("/deposits", summary="Simulated deposit queue")
def list_deposits(status: str = Query("PENDING"),
                  page: int = Query(1, ge=1),
                  page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Simulated deposits awaiting review. Pass ``status=ALL`` for history."""
    params = _page(page, page_size)
    stmt = select(Deposit)
    if status and status.upper() != "ALL":
        stmt = stmt.where(Deposit.status == status.upper())
    stmt = stmt.order_by(Deposit.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    users = {u.id: u for u in db.scalars(
        select(User).where(User.id.in_([r.user_id for r in rows])))} if rows else {}
    return ok(paginate([_deposit_row(r, users.get(r.user_id)) for r in rows],
                       total, params))


@router.post("/deposits/{deposit_id}/approve", summary="Approve a simulated deposit")
def approve_deposit(deposit_id: str, body: schemas.ReasonIn, request: Request,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Credit a pending simulated deposit to the customer's demo wallet. Writes a
    ledger entry, an audit row and a notification. No real or on-chain funds are
    involved."""
    deposit = db.get(Deposit, deposit_id)
    if deposit is None:
        raise NotFoundError("Deposit not found.", code="DEPOSIT_NOT_FOUND")
    if deposit.status != TransactionStatus.PENDING.value:
        raise ValidationError("This deposit has already been reviewed.",
                              code="DEPOSIT_NOT_PENDING")
    reason = admin_service.require_reason(body.reason)

    transaction = wallet_service.credit(
        db, deposit.user_id, deposit.asset, Decimal(deposit.amount),
        tx_type=TransactionType.DEMO_DEPOSIT,
        description="Simulated deposit approved by an administrator",
        metadata={"depositId": deposit.id, "reason": reason, "simulated": True})
    old_status = deposit.status
    deposit.status = TransactionStatus.COMPLETED.value
    deposit.transaction_id = transaction.id

    audit_service.record(
        db, AuditAction.DEPOSIT_CREATED, actor=admin, target_user_id=deposit.user_id,
        old_value={"status": old_status},
        new_value={"status": deposit.status, "amount": _money(deposit.amount),
                   "asset": deposit.asset, "reference": deposit.reference},
        reason=reason, request=request)
    notification_service.notify(
        db, deposit.user_id, "Demo deposit approved",
        f"Your simulated deposit of {_money(deposit.amount)} "
        f"{_asset_label(deposit.asset)} was approved and credited to your demo "
        "balance. No real funds were received.",
        notification_service.DEMO_DEPOSIT)
    db.commit()

    return ok({
        "id": deposit.id, "status": deposit.status, "reason": reason,
        "message": "Simulated deposit credited.",
        "blockchainNotice": ("No blockchain transaction was involved; this is a "
                             "simulated deposit."),
    })


@router.post("/deposits/{deposit_id}/reject", summary="Reject a simulated deposit")
def reject_deposit(deposit_id: str, body: schemas.ReasonIn, request: Request,
                   db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Cancel a pending simulated deposit without crediting anything."""
    deposit = db.get(Deposit, deposit_id)
    if deposit is None:
        raise NotFoundError("Deposit not found.", code="DEPOSIT_NOT_FOUND")
    if deposit.status != TransactionStatus.PENDING.value:
        raise ValidationError("This deposit has already been reviewed.",
                              code="DEPOSIT_NOT_PENDING")
    reason = admin_service.require_reason(body.reason)

    old_status = deposit.status
    deposit.status = TransactionStatus.CANCELLED.value

    audit_service.record(
        db, AuditAction.DEPOSIT_CREATED, actor=admin, target_user_id=deposit.user_id,
        old_value={"status": old_status},
        new_value={"status": deposit.status, "reference": deposit.reference},
        reason=reason, request=request)
    notification_service.notify(
        db, deposit.user_id, "Demo deposit rejected",
        f"Your simulated deposit request was rejected. Reason: {reason}. "
        "Nothing was credited and no real funds were involved.",
        notification_service.DEMO_DEPOSIT)
    db.commit()

    return ok({
        "id": deposit.id, "status": deposit.status, "reason": reason,
        "message": "Simulated deposit rejected.",
        "blockchainNotice": ("No blockchain transaction was involved; this is a "
                             "simulated deposit."),
    })


# --------------------------------------------------------------------------- #
# Platform-wide activity views
# --------------------------------------------------------------------------- #


@router.get("/transactions", summary="Platform-wide simulated ledger")
def list_transactions(user_id: str | None = Query(None, alias="userId"),
                      type: str | None = Query(None),
                      asset: str | None = Query(None),
                      status: str | None = Query(None),
                      page: int = Query(1, ge=1),
                      page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                      db: Session = Depends(get_db),
                      admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every simulated balance movement on the platform, filterable by user,
    type, asset and status."""
    params = _page(page, page_size)
    stmt = select(Transaction)
    if user_id:
        stmt = stmt.where(Transaction.user_id == user_id)
    if type:
        stmt = stmt.where(Transaction.type == type.upper())
    if asset:
        stmt = stmt.where(Transaction.asset == asset.upper())
    if status:
        stmt = stmt.where(Transaction.status == status.upper())
    stmt = stmt.order_by(Transaction.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    return ok(paginate([_transaction_row(t) for t in rows], total, params))


@router.get("/transfers", summary="Platform-wide simulated transfers")
def list_transfers(user_id: str | None = Query(None, alias="userId"),
                   asset: str | None = Query(None),
                   page: int = Query(1, ge=1),
                   page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                   db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Internal demo transfers between accounts."""
    params = _page(page, page_size)
    stmt = select(Transfer)
    if user_id:
        stmt = stmt.where((Transfer.sender_id == user_id) |
                          (Transfer.recipient_id == user_id))
    if asset:
        stmt = stmt.where(Transfer.asset == asset.upper())
    stmt = stmt.order_by(Transfer.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    return ok(paginate([_transfer_row(t) for t in rows], total, params))


@router.get("/trades", summary="Platform-wide simulated trades")
def list_trades(user_id: str | None = Query(None, alias="userId"),
                symbol: str | None = Query(None),
                status: str | None = Query(None),
                outcome: str | None = Query(None),
                page: int = Query(1, ge=1),
                page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                db: Session = Depends(get_db),
                admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every simulated position, with the settlement source that decided it."""
    params = _page(page, page_size)
    stmt = select(Trade)
    if user_id:
        stmt = stmt.where(Trade.user_id == user_id)
    if symbol:
        stmt = stmt.where(Trade.symbol == symbol.upper())
    if status:
        stmt = stmt.where(Trade.status == status.upper())
    if outcome:
        stmt = stmt.where(Trade.outcome == outcome.upper())
    stmt = stmt.order_by(Trade.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)

    members = {}
    if rows:
        members = {u.id: u for u in db.scalars(
            select(User).where(User.id.in_({t.user_id for t in rows})))}

    payload = paginate([_trade_row(t, members.get(t.user_id)) for t in rows],
                       total, params)
    # Counters for the live view, over the whole filtered set rather than the page.
    payload["openCount"] = db.scalar(
        select(func.count()).select_from(Trade)
        .where(Trade.status == TradeStatus.OPEN.value)) or 0
    return ok(payload)


# --------------------------------------------------------------------------- #
# Markets
# --------------------------------------------------------------------------- #


@router.get("/markets", summary="List configured markets")
def list_markets(db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every configured market pair. Prices are never stored — they are read
    live from the configured public market-data provider."""
    rows = db.scalars(select(Market).order_by(Market.sort_order, Market.symbol))
    return ok([_market_row(m) for m in rows])


@router.post("/markets", summary="Create a market")
def create_market(body: schemas.MarketCreateIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Add a tradable pair. The symbol must be unique."""
    symbol = body.symbol.upper()
    if db.scalar(select(Market).where(Market.symbol == symbol)) is not None:
        raise ValidationError("A market with that symbol already exists.",
                              code="MARKET_EXISTS")
    market = Market(symbol=symbol, base_asset=body.base_asset.upper(),
                    quote_asset=body.quote_asset.upper(),
                    provider_symbol=body.provider_symbol,
                    display_name=body.display_name,
                    price_decimals=body.price_decimals,
                    is_enabled=body.is_enabled, is_tradable=body.is_tradable,
                    sort_order=body.sort_order)
    db.add(market)
    db.flush()
    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         new_value={"market": _market_row(market)},
                         reason=f"Market {symbol} created", request=request)
    db.commit()
    return ok(_market_row(market))


@router.patch("/markets/{market_id}", summary="Update a market")
def update_market(market_id: str, body: schemas.MarketUpdateIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Change a market's provider symbol, display name, decimals, availability
    or sort order."""
    market = db.get(Market, market_id)
    if market is None:
        raise NotFoundError("Market not found.", code="MARKET_NOT_FOUND")
    old = _market_row(market)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(market, field, value)
    db.flush()
    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         old_value={"market": old},
                         new_value={"market": _market_row(market)},
                         reason=f"Market {market.symbol} updated", request=request)
    db.commit()
    return ok(_market_row(market))


@router.delete("/markets/{market_id}", summary="Delete a market")
def delete_market(market_id: str, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Remove a market pair. Historic trades keep their recorded symbol."""
    market = db.get(Market, market_id)
    if market is None:
        raise NotFoundError("Market not found.", code="MARKET_NOT_FOUND")
    old = _market_row(market)
    db.delete(market)
    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         old_value={"market": old}, new_value=None,
                         reason=f"Market {old['symbol']} deleted", request=request)
    db.commit()
    return ok({"id": market_id, "deleted": True})


# --------------------------------------------------------------------------- #
# Trading durations
# --------------------------------------------------------------------------- #


@router.get("/trading/durations", summary="List trading durations")
def list_durations(db: Session = Depends(get_db),
                   admin: User = Depends(require_admin)) -> dict[str, Any]:
    """The duration / payout options offered on the demo trade screen."""
    rows = db.scalars(select(TradingDuration)
                      .order_by(TradingDuration.sort_order, TradingDuration.seconds))
    return ok([_duration_row(d) for d in rows])


@router.post("/trading/durations", summary="Create a trading duration")
def create_duration(body: schemas.DurationCreateIn, request: Request,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Add a duration / payout option. Duration lengths are unique."""
    if db.scalar(select(TradingDuration)
                 .where(TradingDuration.seconds == body.seconds)) is not None:
        raise ValidationError("A duration with that length already exists.",
                              code="DURATION_EXISTS")
    if body.max_amount < body.min_amount:
        raise ValidationError("maxAmount must not be lower than minAmount.",
                              code="INVALID_AMOUNT_RANGE")
    duration = TradingDuration(
        seconds=body.seconds, label=body.label,
        payout_percent=Decimal(body.payout_percent),
        min_amount=Decimal(body.min_amount), max_amount=Decimal(body.max_amount),
        is_enabled=body.is_enabled, sort_order=body.sort_order)
    db.add(duration)
    db.flush()
    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         new_value={"duration": _duration_row(duration)},
                         reason=f"Trading duration {body.seconds}s created",
                         request=request)
    db.commit()
    return ok(_duration_row(duration))


@router.patch("/trading/durations/{duration_id}", summary="Update a trading duration")
def update_duration(duration_id: str, body: schemas.DurationUpdateIn, request: Request,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Change a duration's label, payout, stake limits, availability or order."""
    duration = db.get(TradingDuration, duration_id)
    if duration is None:
        raise NotFoundError("Trading duration not found.", code="DURATION_NOT_FOUND")
    old = _duration_row(duration)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is None:
            continue
        setattr(duration, field,
                Decimal(value) if isinstance(value, Decimal) else value)
    if Decimal(duration.max_amount) < Decimal(duration.min_amount):
        raise ValidationError("maxAmount must not be lower than minAmount.",
                              code="INVALID_AMOUNT_RANGE")
    db.flush()
    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         old_value={"duration": old},
                         new_value={"duration": _duration_row(duration)},
                         reason=f"Trading duration {duration.seconds}s updated",
                         request=request)
    db.commit()
    return ok(_duration_row(duration))


@router.delete("/trading/durations/{duration_id}", summary="Delete a trading duration")
def delete_duration(duration_id: str, request: Request,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Remove a duration option. Open trades keep the terms they were opened on."""
    duration = db.get(TradingDuration, duration_id)
    if duration is None:
        raise NotFoundError("Trading duration not found.", code="DURATION_NOT_FOUND")
    old = _duration_row(duration)
    db.delete(duration)
    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         old_value={"duration": old}, new_value=None,
                         reason=f"Trading duration {old['seconds']}s deleted",
                         request=request)
    db.commit()
    return ok({"id": duration_id, "deleted": True})


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


def _invite_base_url(db: Session) -> str:
    """Where invitation links should point.

    Prefers the admin-configured public URL, then the first allowed CORS origin,
    so a link is never built against an internal container hostname.
    """
    configured = str(settings_service.get(db, "public_base_url") or "").strip()
    if configured:
        return configured
    origins = env.cors_origins
    return origins[0] if origins else ""


@router.post("/invites", summary="Generate a single-use invitation link",
             status_code=201)
def create_invite(body: schemas.InviteCreateIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Issue one invitation that can create exactly one account.

    The link expires, is consumed the moment an account is created with it, and
    can be revoked before use. A reason is mandatory and is audited.
    """
    admin_service.require_reason(body.reason)
    invite = invite_service.create(
        db, admin=admin, expires_in_hours=body.expires_in_hours,
        email=body.email, note=body.note)

    audit_service.record(
        db, AuditAction.INVITE_CREATED, actor=admin, request=request,
        new_value={"inviteId": invite.id, "email": invite.email,
                   "expiresAt": invite.expires_at.isoformat()},
        reason=body.reason)
    db.commit()

    return ok({
        "invite": invite_service.to_dict(db, invite, base_url=_invite_base_url(db)),
        "message": ("Invitation created. It is valid for one account only and "
                    "expires at the time shown."),
    })


@router.get("/invites", summary="List registration invitations")
def list_invites(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
    status: str | None = Query(None, pattern="^(ACTIVE|USED|EXPIRED|REVOKED)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
) -> dict[str, Any]:
    """Every invitation with its derived status, newest first."""
    rows = list(db.scalars(select(Invite).order_by(Invite.created_at.desc())))
    base = _invite_base_url(db)
    items = [invite_service.to_dict(db, row, base_url=base) for row in rows]
    if status:
        items = [item for item in items if item["status"] == status]

    total = len(items)
    start = (page - 1) * page_size
    params = PaginationParams(page=page, page_size=page_size)
    return ok(paginate(items[start:start + page_size], total, params))


@router.post("/invites/{invite_id}/revoke", summary="Revoke an unused invitation")
def revoke_invite(invite_id: str, body: schemas.ReasonIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Cancel an invitation that has not been used yet."""
    admin_service.require_reason(body.reason)
    invite = invite_service.revoke(db, invite_id, admin=admin, reason=body.reason)
    audit_service.record(db, AuditAction.INVITE_REVOKED, actor=admin, request=request,
                         new_value={"inviteId": invite.id}, reason=body.reason)
    db.commit()
    return ok({
        "invite": invite_service.to_dict(db, invite, base_url=_invite_base_url(db)),
        "message": "Invitation revoked. The link can no longer create an account.",
    })


@router.post("/users/{user_id}/force-next-trade",
             summary="Flag an account for QA and queue its next trade outcome")
def force_next_trade(user_id: str, body: schemas.ForceNextTradeIn, request: Request,
                     db: Session = Depends(get_db),
                     admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Set up a scripted outcome in one step.

    Marks the account as a QA test account if it is not one already, then queues
    the outcome for its next trade. This is a convenience wrapper around the two
    existing actions — it changes nothing about the guarantees: the account
    holder is notified that their account is flagged, the resulting trade is
    labelled ``ADMIN_TEST_SCENARIO`` rather than a market result, and both steps
    are written to the audit log.
    """
    target = _get_user(db, user_id)
    # Optional by design — see `ForceNextTradeIn`. The fallback still tells a
    # later reader what produced the row rather than leaving it blank.
    reason = (body.reason or "").strip() or "Scripted outcome set from the positions screen."

    was_flagged = bool(target.is_test_account)
    if not was_flagged:
        target.is_test_account = True
        audit_service.record(
            db, AuditAction.USER_UPDATED, actor=admin, target_user_id=target.id,
            old_value={"isTestAccount": False}, new_value={"isTestAccount": True},
            reason=reason, request=request)
        notification_service.notify(
            db, target.id, "Account marked as a test account",
            "An administrator marked this account as a QA test account. Trade "
            "outcomes on it may be scripted for testing and are labelled as such "
            "on each trade.", notification_service.ACCOUNT)

    outcome = str(body.forced_outcome).upper()

    # Whatever was queued before is stale the moment the admin presses a button,
    # otherwise an older entry fires first and the result looks shifted.
    superseded = list(db.scalars(
        select(TradeTestScenario).where(
            TradeTestScenario.target_user_id == target.id,
            TradeTestScenario.consumed.is_(False))))
    for stale in superseded:
        stale.consumed = True
        stale.consumed_at = utcnow()

    # Prefer the position the admin is actually looking at: if the customer has
    # a trade running, pin the outcome to that trade. Only when there is nothing
    # open do we queue it for the next one.
    open_trade = db.scalar(
        select(Trade)
        .where(Trade.user_id == target.id, Trade.status == TradeStatus.OPEN.value)
        .order_by(Trade.expires_at.asc()))

    scenario = None
    applied_to_open_trade = False
    if open_trade is not None:
        open_trade.forced_outcome = outcome
        applied_to_open_trade = True
    else:
        scenario = TradeTestScenario(
            target_user_id=target.id,
            forced_outcome=outcome,
            label=(body.label or f"Forced {outcome}").strip(),
            created_by=admin.id,
        )
        db.add(scenario)
    db.flush()

    audit_service.record(
        db, AuditAction.TEST_SCENARIO_CREATED, actor=admin, target_user_id=target.id,
        new_value={"scenarioId": scenario.id if scenario else None,
                   "tradeId": open_trade.id if open_trade else None,
                   "forcedOutcome": outcome,
                   "appliedToOpenTrade": applied_to_open_trade,
                   "accountWasAlreadyFlagged": was_flagged,
                   "supersededScenarios": len(superseded)},
        reason=reason, request=request)
    db.commit()

    if applied_to_open_trade:
        message = (
            f"The trade currently running on {target.email} will settle as "
            f"{outcome}. It is labelled as a scripted test result rather than a "
            "market-derived one.")
    else:
        message = (
            f"{target.email} has no open trade, so the next one they place will "
            f"settle as {outcome}.")

    return ok({
        "scenarioId": scenario.id if scenario else None,
        "tradeId": open_trade.id if open_trade else None,
        "appliedToOpenTrade": applied_to_open_trade,
        "userId": target.id,
        "email": target.email,
        "forcedOutcome": outcome,
        "accountNewlyFlagged": not was_flagged,
        "supersededScenarios": len(superseded),
        "isTestScenario": True,
        "message": message,
    })


@router.get("/settings", summary="All platform settings, grouped")
def get_settings(db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every runtime setting with its current value, default and description,
    grouped exactly as declared in ``settings_service.DEFAULTS``."""
    current = settings_service.get_all(db)
    groups: dict[str, list[dict[str, Any]]] = {}
    for key, (default, group, description) in settings_service.DEFAULTS.items():
        groups.setdefault(group, []).append({
            "key": key, "value": current.get(key, default), "default": default,
            "group": group, "description": description,
        })
    return ok({
        "groups": [
            {"group": group, "settings": items,
             "requiresSuperAdmin": group in SUPER_ADMIN_GROUPS}
            for group, items in sorted(groups.items())
        ]
    })


@router.patch("/settings", summary="Update platform settings")
def update_settings(body: schemas.SettingsUpdateIn, request: Request,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Update one or more settings. Unknown keys are rejected outright, a reason
    is mandatory, and the audit entry records every old and new value.

    Changing anything in the ``system`` group (maintenance mode and its message)
    requires a super administrator."""
    reason = admin_service.require_reason(body.reason)
    if not body.values:
        raise ValidationError("No settings supplied.", code="NO_SETTINGS")

    unknown = [key for key in body.values if key not in settings_service.DEFAULTS]
    if unknown:
        raise ValidationError(f"Unknown setting key(s): {', '.join(sorted(unknown))}",
                              code="UNKNOWN_SETTING")

    touches_system = any(settings_service.DEFAULTS[key][1] in SUPER_ADMIN_GROUPS
                         for key in body.values)
    if touches_system and admin.role != Role.SUPER_ADMIN.value:
        raise ForbiddenError("Changing system settings requires a super administrator.",
                             code="SUPER_ADMIN_REQUIRED")

    old_values = {key: settings_service.get(db, key) for key in body.values}
    for key, value in body.values.items():
        settings_service.set_value(db, key, value)
    db.flush()

    audit_service.record(db, AuditAction.SETTINGS_UPDATED, actor=admin,
                         old_value=old_values, new_value=dict(body.values),
                         reason=reason, request=request)
    db.commit()
    return ok({
        "updated": sorted(body.values.keys()),
        "oldValues": old_values,
        "newValues": dict(body.values),
        "reason": reason,
    })


# --------------------------------------------------------------------------- #
# Support
# --------------------------------------------------------------------------- #


def _ticket_row(db: Session, ticket: SupportTicket, user: User | None) -> dict[str, Any]:
    count = db.scalar(select(func.count(SupportMessage.id))
                      .where(SupportMessage.ticket_id == ticket.id)) or 0
    return {
        "id": ticket.id, "userId": ticket.user_id,
        "username": user.username if user else None,
        "email": user.email if user else None,
        "subject": ticket.subject, "category": ticket.category,
        "status": ticket.status, "messageCount": int(count),
        "createdAt": ticket.created_at, "updatedAt": ticket.updated_at,
    }


@router.get("/support/tickets", summary="List support tickets")
def list_tickets(status: str | None = Query(None),
                 page: int = Query(1, ge=1),
                 page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                 db: Session = Depends(get_db),
                 admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Paginated support queue, optionally filtered by status."""
    params = _page(page, page_size)
    stmt = select(SupportTicket)
    if status:
        stmt = stmt.where(SupportTicket.status == status.upper())
    stmt = stmt.order_by(SupportTicket.updated_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    users = {u.id: u for u in db.scalars(
        select(User).where(User.id.in_([r.user_id for r in rows])))} if rows else {}
    return ok(paginate([_ticket_row(db, t, users.get(t.user_id)) for t in rows],
                       total, params))


@router.get("/support/tickets/{ticket_id}", summary="Read one support ticket")
def get_ticket(ticket_id: str, db: Session = Depends(get_db),
               admin: User = Depends(require_admin)) -> dict[str, Any]:
    """The ticket plus its full message thread, oldest first."""
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise NotFoundError("Support ticket not found.", code="TICKET_NOT_FOUND")
    user = db.get(User, ticket.user_id)
    messages = [
        {"id": m.id, "authorId": m.author_id, "isStaffReply": m.is_staff_reply,
         "body": m.body, "createdAt": m.created_at}
        for m in ticket.messages
    ]
    return ok({"ticket": _ticket_row(db, ticket, user), "messages": messages})


@router.post("/support/tickets/{ticket_id}/reply", summary="Reply to a support ticket")
def reply_to_ticket(ticket_id: str, body: schemas.SupportReplyIn,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Post a staff reply and notify the customer. An open ticket moves to
    ``IN_PROGRESS`` automatically."""
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise NotFoundError("Support ticket not found.", code="TICKET_NOT_FOUND")
    message = SupportMessage(ticket_id=ticket.id, author_id=admin.id,
                             is_staff_reply=True, body=body.body)
    db.add(message)
    if ticket.status == TicketStatus.OPEN.value:
        ticket.status = TicketStatus.IN_PROGRESS.value
    ticket.updated_at = utcnow()
    notification_service.notify(
        db, ticket.user_id, "Support replied to your ticket",
        f'Support replied to "{ticket.subject}". Open the ticket to read the reply.',
        notification_service.GENERAL)
    db.flush()
    db.commit()
    return ok({"id": message.id, "authorId": message.author_id,
               "isStaffReply": True, "body": message.body,
               "createdAt": message.created_at, "ticketStatus": ticket.status})


@router.patch("/support/tickets/{ticket_id}", summary="Change a ticket's status")
def update_ticket(ticket_id: str, body: schemas.SupportStatusIn, request: Request,
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Move a ticket between OPEN, IN_PROGRESS, RESOLVED and CLOSED."""
    ticket = db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise NotFoundError("Support ticket not found.", code="TICKET_NOT_FOUND")
    new_status = body.status.upper()
    valid = {s.value for s in TicketStatus}
    if new_status not in valid:
        raise ValidationError(f"Status must be one of: {', '.join(sorted(valid))}",
                              code="INVALID_TICKET_STATUS")
    old_status = ticket.status
    ticket.status = new_status
    ticket.updated_at = utcnow()
    audit_service.record(db, AuditAction.SUPPORT_TICKET_UPDATED, actor=admin,
                         target_user_id=ticket.user_id,
                         old_value={"status": old_status},
                         new_value={"status": new_status}, request=request)
    db.commit()
    user = db.get(User, ticket.user_id)
    return ok(_ticket_row(db, ticket, user))


# --------------------------------------------------------------------------- #
# Credit score history
# --------------------------------------------------------------------------- #


@router.get("/credit-scores", summary="Internal demo score change history")
def list_credit_scores(user_id: str | None = Query(None, alias="userId"),
                       page: int = Query(1, ge=1),
                       page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                       db: Session = Depends(get_db),
                       admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every internal demo account score change across all users.

    These are internal demo scores invented by this simulator, not
    credit-bureau scores."""
    params = _page(page, page_size)
    stmt = select(CreditScoreHistory)
    if user_id:
        stmt = stmt.where(CreditScoreHistory.user_id == user_id)
    stmt = stmt.order_by(CreditScoreHistory.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    payload = paginate([_score_row(r) for r in rows], total, params)
    payload["disclaimer"] = admin_service.CREDIT_SCORE_DISCLAIMER
    return ok(payload)


# --------------------------------------------------------------------------- #
# QA test scenarios — test accounts only
# --------------------------------------------------------------------------- #


@router.post("/test-scenarios", summary="Create a QA trade test scenario")
def create_test_scenario(body: schemas.TestScenarioCreateIn, request: Request,
                         db: Session = Depends(get_db),
                         admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Queue a scripted WIN / LOSS / DRAW outcome for a designated QA test
    account.

    This exists **solely** so QA can exercise the three settlement paths on
    accounts explicitly flagged ``isTestAccount``. It is refused with
    ``NOT_A_TEST_ACCOUNT`` for any other account, so a real demo customer's
    trade outcome can never be forced. The result is labelled as a test scenario
    and the creation is written to the audit log with the supplied reason."""
    reason = admin_service.require_reason(body.reason)
    target = _get_user(db, body.target_user_id)

    if not target.is_test_account:
        raise ForbiddenError(
            "Scripted trade outcomes are permitted only on accounts flagged as "
            "test accounts. This account is a real demo customer.",
            code="NOT_A_TEST_ACCOUNT")

    outcome = body.forced_outcome.upper()
    valid = {o.value for o in TradeOutcome}
    if outcome not in valid:
        raise ValidationError(f"forcedOutcome must be one of: {', '.join(sorted(valid))}",
                              code="INVALID_OUTCOME")

    scenario = TradeTestScenario(target_user_id=target.id, forced_outcome=outcome,
                                 label=body.label, created_by=admin.id, consumed=False)
    db.add(scenario)
    db.flush()

    audit_service.record(
        db, AuditAction.TEST_SCENARIO_CREATED, actor=admin, target_user_id=target.id,
        new_value={"scenarioId": scenario.id, "forcedOutcome": outcome,
                   "label": body.label, "isTestAccount": True},
        reason=reason, request=request)
    db.commit()
    return ok(_scenario_row(scenario, target))


@router.get("/test-scenarios", summary="List QA trade test scenarios")
def list_test_scenarios(consumed: bool | None = Query(None),
                        page: int = Query(1, ge=1),
                        page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                        db: Session = Depends(get_db),
                        admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Every QA test scenario with its consumed state. Test scenarios apply only
    to accounts flagged as test accounts and are fully audited."""
    params = _page(page, page_size)
    stmt = select(TradeTestScenario)
    if consumed is not None:
        stmt = stmt.where(TradeTestScenario.consumed.is_(consumed))
    stmt = stmt.order_by(TradeTestScenario.created_at.desc())
    rows, total = admin_service.paginated(db, stmt, params.page, params.page_size)
    users = {u.id: u for u in db.scalars(
        select(User).where(User.id.in_([r.target_user_id for r in rows])))} if rows else {}
    payload = paginate([_scenario_row(s, users.get(s.target_user_id)) for s in rows],
                       total, params)
    payload["notice"] = TEST_SCENARIO_NOTICE
    return ok(payload)


@router.delete("/test-scenarios/{scenario_id}", summary="Cancel a QA test scenario")
def delete_test_scenario(scenario_id: str, request: Request,
                         db: Session = Depends(get_db),
                         admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Cancel an unconsumed QA test scenario. A scenario that has already been
    applied to a trade is immutable history and cannot be removed."""
    scenario = db.get(TradeTestScenario, scenario_id)
    if scenario is None:
        raise NotFoundError("Test scenario not found.", code="SCENARIO_NOT_FOUND")
    if scenario.consumed:
        raise ValidationError("This test scenario has already been consumed.",
                              code="SCENARIO_ALREADY_CONSUMED")
    target_id = scenario.target_user_id
    old = {"scenarioId": scenario.id, "forcedOutcome": scenario.forced_outcome,
           "label": scenario.label}
    db.delete(scenario)
    audit_service.record(db, AuditAction.TEST_SCENARIO_CREATED, actor=admin,
                         target_user_id=target_id, old_value=old, new_value=None,
                         reason="QA test scenario cancelled before use",
                         request=request)
    db.commit()
    return ok({"id": scenario_id, "cancelled": True, "isTestScenario": True,
               "notice": TEST_SCENARIO_NOTICE})


# --------------------------------------------------------------------------- #
# Administrators and roles (super administrator only)
# --------------------------------------------------------------------------- #


def _admin_row(user: User) -> dict[str, Any]:
    return {
        "id": user.id, "email": user.email, "username": user.username,
        "fullName": user.full_name, "role": user.role, "status": user.status,
        "lastLoginAt": user.last_login_at, "createdAt": user.created_at,
    }


@router.get("/admins", summary="List administrators")
def list_admins(db: Session = Depends(get_db),
                admin: User = Depends(require_super_admin)) -> dict[str, Any]:
    """Every account holding an ADMIN or SUPER_ADMIN role."""
    rows = db.scalars(select(User)
                      .where(User.role.in_([Role.ADMIN.value, Role.SUPER_ADMIN.value]))
                      .order_by(User.created_at.asc()))
    return ok([_admin_row(u) for u in rows])


@router.post("/admins/{user_id}/role", summary="Change a user's role")
def change_role(user_id: str, body: schemas.RoleChangeIn, request: Request,
                db: Session = Depends(get_db),
                admin: User = Depends(require_super_admin)) -> dict[str, Any]:
    """Move an account between USER, ADMIN and SUPER_ADMIN.

    A reason is mandatory and audited. A super administrator may not demote
    themselves — that is refused with ``CANNOT_DEMOTE_SELF`` so the platform can
    never be left without a super administrator by accident."""
    reason = admin_service.require_reason(body.reason)
    target = _get_user(db, user_id)
    new_role = body.role.upper()
    valid = {r.value for r in Role}
    if new_role not in valid:
        raise ValidationError(f"Role must be one of: {', '.join(sorted(valid))}",
                              code="INVALID_ROLE")

    if target.id == admin.id and new_role != Role.SUPER_ADMIN.value:
        raise ForbiddenError("A super administrator cannot demote themselves.",
                             code="CANNOT_DEMOTE_SELF")

    old_role = target.role
    target.role = new_role
    audit_service.record(db, AuditAction.USER_UPDATED, actor=admin,
                         target_user_id=target.id,
                         old_value={"role": old_role}, new_value={"role": new_role},
                         reason=reason, request=request)
    notification_service.notify(
        db, target.id, "Account role updated",
        f"Your account role changed from {old_role} to {new_role}. Reason: {reason}.",
        notification_service.ACCOUNT)
    db.commit()
    return ok({"userId": target.id, "oldRole": old_role, "newRole": new_role,
               "reason": reason})


# --------------------------------------------------------------------------- #
# Bulk controls for open demo trades
#
# An administrator may close the book (settle everything at the live public
# price) or cancel it (void everything and return every stake). Those are the
# only two bulk actions, and neither of them chooses an outcome: there is no
# route anywhere in this API that can force a WIN or a LOSS on an ordinary
# customer's trade.
# --------------------------------------------------------------------------- #


@router.post("/trades/settle-all",
             summary="Settle every open demo trade at the live market price")
async def settle_all_trades(body: schemas.ReasonIn, request: Request,
                            db: Session = Depends(get_db),
                            admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Close the book: settle every currently open simulated trade right now.

    Each trade runs through the ordinary settlement path, so its outcome comes
    from comparing the recorded entry price with the live public market price —
    exactly as it would at expiry. This route cannot pick winners or losers.
    Trades whose market data is unavailable are voided with the stake returned
    and are counted under ``voided``. A mandatory reason is audited as
    ``TRADES_BULK_SETTLED`` in the same transaction.
    """
    reason = admin_service.require_reason(body.reason)
    result = await trade_engine.settle_all_open(db, admin, reason, request)
    db.commit()
    return ok(result)


@router.post("/trades/void-all",
             summary="Cancel every open demo trade and return every stake")
def void_all_trades(body: schemas.ReasonIn, request: Request,
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Cancel every currently open simulated trade and return every stake in full.

    Locked funds go back to available, a ``TRADE_RETURN`` ledger entry is
    written for each stake, and the trade is left with no exit price and no
    outcome — nobody wins and nobody loses. A mandatory reason is audited as
    ``TRADES_BULK_VOIDED`` in the same transaction.
    """
    reason = admin_service.require_reason(body.reason)
    result = trade_engine.void_all_open(db, admin, reason, request)
    db.commit()
    return ok({**result, "returnedTotal": _money(result["returnedTotal"])})


@router.post("/test-scenarios/bulk",
             summary="Queue a QA test scenario on every flagged test account")
def create_bulk_test_scenarios(body: schemas.BulkTestScenarioIn, request: Request,
                               db: Session = Depends(get_db),
                               admin: User = Depends(require_admin)) -> dict[str, Any]:
    """Queue one scripted WIN / LOSS / DRAW outcome per QA test account.

    Only accounts explicitly flagged ``isTestAccount`` are targeted; ordinary
    demo customers are never included, and their trades keep settling purely
    against public market data. Every scenario created here is labelled as a
    test scenario on the trade it is applied to, and the batch is audited as
    ``TEST_SCENARIO_BULK_CREATED`` with the supplied reason.
    """
    reason = admin_service.require_reason(body.reason)

    outcome = str(body.forced_outcome).upper()
    valid = {o.value for o in TradeOutcome}
    if outcome not in valid:
        raise ValidationError(f"forcedOutcome must be one of: {', '.join(sorted(valid))}",
                              code="INVALID_OUTCOME")

    targets = list(db.scalars(
        select(User).where(User.is_test_account.is_(True)).order_by(User.email)))

    label = f"Bulk QA {outcome} scenario"
    for target in targets:
        db.add(TradeTestScenario(target_user_id=target.id, forced_outcome=outcome,
                                 label=label, created_by=admin.id, consumed=False))
    db.flush()

    for target in targets:
        notification_service.notify(
            db, target.id, "QA test scenario queued",
            (f"A scripted {outcome} outcome was queued on this QA test account. "
             f"It is labelled as a test scenario on the trade it applies to. "
             f"Reason: {reason}"),
            notification_service.DEMO_TRADE)

    audit_service.record(
        db, AuditAction.TEST_SCENARIO_BULK_CREATED, actor=admin, request=request,
        new_value={"forcedOutcome": outcome, "label": label,
                   "created": len(targets),
                   "targetUserIds": [t.id for t in targets]},
        reason=reason)
    db.commit()

    message = (
        f"Queued a scripted {outcome} outcome on {len(targets)} QA test "
        f"account(s). This applies to accounts flagged as test accounts only, "
        f"never to a real demo customer, and is labelled as a test scenario on "
        f"every affected trade."
    ) if targets else (
        "No accounts are flagged as QA test accounts, so no test scenarios were "
        "created. Scripted outcomes apply to test accounts only and can never "
        "be queued for a real demo customer."
    )

    return ok({
        "created": len(targets),
        "targets": [{"userId": t.id, "email": t.email} for t in targets],
        "forcedOutcome": outcome,
        "message": message,
        "reason": reason,
    })
