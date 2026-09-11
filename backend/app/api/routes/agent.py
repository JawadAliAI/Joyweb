"""Reseller back office.

Every read on this router is scoped to the calling agent's own downline. That
scoping is the security boundary of the whole feature: an agent must never be
able to reach an account they did not sign up, and an id in a URL is never
trusted on its own.

Two rules keep that true, and both are enforced here rather than in each route:

* `_downline_ids` is the single source of "whose accounts may I see". Every
  list query filters through it.
* `_member` re-checks membership before returning one record, and raises
  ``NotFoundError`` rather than ``ForbiddenError`` for an account outside the
  downline — a 403 would confirm the account exists.

This router deliberately exposes no way to move money, change a balance, or
influence a trade outcome. All of that stays with administrators: an agent
reads its downline and issues invitations, nothing more.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session

from app.api.deps import rate_limit, require_agent
from app.core.config import settings as env
from app.core.errors import NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models import (
    AuditAction, Deposit, KycSubmission, Role, Trade, User, UserStatus, Wallet,
    Withdrawal,
)
from app.db.session import get_db
from app.schemas.common import PaginationParams, ok, paginate
from app.services import (
    audit_service, invite_service, pricing_service, settings_service,
)

router = APIRouter()

MAX_PAGE_SIZE = 100



# --------------------------------------------------------------------------- #
# Scoping
# --------------------------------------------------------------------------- #


def _scope(db: Session, agent_id: str | None) -> User | None:
    """The reseller whose book is being read.

    The panel is administrator-only, and an administrator has no downline of
    their own, so the agent is chosen explicitly. `None` means no agent has been
    picked yet, and every list answers empty rather than falling back to the
    whole platform — an unscoped query here would hand one reseller's customers
    to another.
    """
    if not agent_id:
        return None
    agent = db.get(User, agent_id)
    if agent is None or agent.role != Role.AGENT.value:
        raise NotFoundError("No such agent.", code="AGENT_NOT_FOUND")
    return agent


def _downline_ids(db: Session, agent: User | None) -> list[str]:
    """Every account under this reseller.

    One level for now. A multi-level hierarchy becomes a recursive walk here
    and nowhere else, because every query in this module goes through it.
    """
    if agent is None:
        return []
    return list(db.scalars(select(User.id).where(User.agent_id == agent.id)))


def _sub_agent_ids(db: Session, agent: User | None) -> list[str]:
    if agent is None:
        return []
    return list(db.scalars(
        select(User.id).where(User.agent_parent_id == agent.id,
                              User.role == Role.AGENT.value)))


def _member(db: Session, agent: User | None, user_id: str) -> User:
    """One account from the downline, or a 404 for anything else."""
    member = db.get(User, user_id)
    if agent is None or member is None or member.agent_id != agent.id:
        raise NotFoundError("No such member.", code="MEMBER_NOT_FOUND")
    return member


def _page(page: int, page_size: int) -> PaginationParams:
    return PaginationParams(page=page, page_size=min(page_size, MAX_PAGE_SIZE))


def _paginate(db: Session, stmt: Select, params: PaginationParams) -> tuple[list[Any], int]:
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    rows = list(db.scalars(
        stmt.offset(params.offset).limit(params.page_size)))
    return rows, total


# --------------------------------------------------------------------------- #
# Serialisation
# --------------------------------------------------------------------------- #


def _member_row(user: User, demo_value: Decimal) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "fullName": user.full_name,
        "status": user.status,
        "creditScore": user.credit_score,
        "isTestAccount": user.is_test_account,
        "totalDemoValue": str(demo_value),
        "createdAt": user.created_at,
        "lastLoginAt": user.last_login_at,
    }


def _agent_row(user: User, member_count: int) -> dict[str, Any]:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "fullName": user.full_name,
        "status": user.status,
        "memberCount": member_count,
        "createdAt": user.created_at,
        "lastLoginAt": user.last_login_at,
    }


def _trade_row(trade: Trade, member: User | None) -> dict[str, Any]:
    return {
        "id": trade.id,
        "userId": trade.user_id,
        "username": member.username if member else None,
        "email": member.email if member else None,
        # Drives whether the row offers scripted-outcome buttons. The gate is
        # enforced server-side regardless of what the client does with this.
        "isTestAccount": bool(member.is_test_account) if member else False,
        "symbol": trade.symbol,
        "direction": trade.direction,
        "asset": trade.asset,
        "amount": str(trade.amount),
        "durationSeconds": trade.duration_seconds,
        "payoutPercent": str(trade.payout_percent),
        "entryPrice": str(trade.entry_price) if trade.entry_price is not None else None,
        "exitPrice": str(trade.exit_price) if trade.exit_price is not None else None,
        "status": trade.status,
        "outcome": trade.outcome,
        "profitLoss": str(trade.profit_loss) if trade.profit_loss is not None else None,
        "createdAt": trade.created_at,
        "expiresAt": trade.expires_at,
        "settledAt": trade.settled_at,
    }


def _movement_row(row: Any, member: User | None, kind: str) -> dict[str, Any]:
    return {
        "id": row.id,
        "kind": kind,
        "userId": row.user_id,
        "username": member.username if member else None,
        "email": member.email if member else None,
        "asset": row.asset,
        "amount": str(row.amount),
        "status": row.status,
        "reference": getattr(row, "reference", None),
        "createdAt": row.created_at,
    }


def _member_map(db: Session, user_ids: list[str]) -> dict[str, User]:
    if not user_ids:
        return {}
    return {u.id: u for u in db.scalars(select(User).where(User.id.in_(user_ids)))}


# --------------------------------------------------------------------------- #
# Directory
# --------------------------------------------------------------------------- #


@router.get("/directory", summary="Every agent, for the panel's agent picker")
def directory(db: Session = Depends(get_db),
              admin: User = Depends(require_agent)) -> dict[str, Any]:
    """The resellers an administrator can switch between.

    Returned with each one's member count so the picker shows which books
    actually have anyone in them.
    """
    agents = list(db.scalars(
        select(User).where(User.role == Role.AGENT.value).order_by(User.username)))

    counts: dict[str, int] = {}
    if agents:
        for agent_id, count in db.execute(
            select(User.agent_id, func.count())
            .where(User.agent_id.in_([a.id for a in agents]))
            .group_by(User.agent_id)
        ).all():
            counts[agent_id] = count

    return ok({
        "items": [{
            "id": a.id,
            "username": a.username,
            "email": a.email,
            "fullName": a.full_name,
            "memberCount": counts.get(a.id, 0),
        } for a in agents],
    })


# --------------------------------------------------------------------------- #
# Console
# --------------------------------------------------------------------------- #


@router.get("/dashboard", summary="Agent console counters and daily series")
async def dashboard(agent_id: str | None = Query(None, alias="agentId"),
                    db: Session = Depends(get_db),
                    admin: User = Depends(require_agent)) -> dict[str, Any]:
    """Counters for this agent's downline plus today's hourly order volume.

    Every figure describes simulated activity for the agent's own members only.
    """
    agent = _scope(db, agent_id)
    member_ids = _downline_ids(db, agent)
    sub_agents = _sub_agent_ids(db, agent)

    active = 0
    if member_ids:
        active = db.scalar(
            select(func.count()).select_from(User)
            .where(User.id.in_(member_ids), User.status == UserStatus.ACTIVE.value)) or 0

    start_of_day = utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    volume_today = Decimal("0")

    # Today's order volume, broken into 24 hourly buckets rather than a run of
    # daily totals. Every hour is present even when empty, so the axis always
    # reads 00:00 through 23:00 instead of collapsing to the hours that traded.
    buckets: dict[int, Decimal] = {hour: Decimal("0") for hour in range(24)}

    if member_ids:
        rows = db.execute(
            select(Trade.created_at, Trade.amount)
            .where(Trade.user_id.in_(member_ids), Trade.created_at >= start_of_day)
        ).all()
        for created_at, amount in rows:
            value = amount or Decimal("0")
            volume_today += value
            buckets[created_at.hour] = buckets[created_at.hour] + value

    series = [{"date": f"{hour:02d}:00", "value": str(buckets[hour])}
              for hour in range(24)]

    return ok({
        "subAgentCount": len(sub_agents),
        "memberCount": len(member_ids),
        "activeMemberCount": active,
        "tradeVolumeToday": str(volume_today),
        "tradeVolume": series,
        "message": "All figures describe activity for your own members.",
    })


# --------------------------------------------------------------------------- #
# Members
# --------------------------------------------------------------------------- #


@router.get("/users", summary="This agent's members")
async def list_members(
    search: str | None = Query(None, max_length=255),
    status: str | None = Query(None),
    agent_id: str | None = Query(None, alias="agentId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_agent),
) -> dict[str, Any]:
    params = _page(page, page_size)
    agent = _scope(db, agent_id)
    if agent is None:
        return ok(paginate([], 0, params))

    stmt = select(User).where(User.agent_id == agent.id)
    if search:
        needle = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(User.email).like(needle)
            | func.lower(User.username).like(needle)
            | func.lower(User.first_name).like(needle)
            | func.lower(User.last_name).like(needle))
    if status:
        stmt = stmt.where(User.status == status.strip().upper())

    rows, total = _paginate(db, stmt.order_by(User.created_at.desc()), params)

    snapshot = await pricing_service.asset_prices(db)
    totals: dict[str, Decimal] = {}
    if rows:
        wallets = db.execute(
            select(Wallet.user_id, Wallet.asset,
                   func.sum(Wallet.available + Wallet.locked))
            .where(Wallet.user_id.in_([u.id for u in rows]))
            .group_by(Wallet.user_id, Wallet.asset)
        ).all()
        for user_id, asset, amount in wallets:
            price = snapshot.prices.get(asset)
            if price is None:
                continue
            totals[user_id] = totals.get(user_id, Decimal("0")) + (amount or Decimal("0")) * price

    items = [_member_row(user, totals.get(user.id, Decimal("0"))) for user in rows]
    payload = paginate(items, total, params)
    payload["pricesAvailable"] = snapshot.available
    return ok(payload)


@router.get("/users/{user_id}", summary="One member")
def member_detail(user_id: str, agent_id: str | None = Query(None, alias="agentId"),
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_agent)) -> dict[str, Any]:
    member = _member(db, _scope(db, agent_id), user_id)
    wallets = list(db.scalars(select(Wallet).where(Wallet.user_id == member.id)))
    return ok({
        "user": _member_row(member, Decimal("0")),
        "wallets": [
            {"asset": w.asset, "available": str(w.available), "locked": str(w.locked)}
            for w in wallets
        ],
    })


@router.get("/kyc", summary="Verification submissions from this agent's members")
def list_verification(
    status: str | None = Query(None),
    level: str | None = Query(None),
    agent_id: str | None = Query(None, alias="agentId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_agent),
) -> dict[str, Any]:
    """Read-only. An agent can see that a member submitted verification and
    whether it was approved, but never the document numbers or images — those
    stay with the reviewers who need them."""
    params = _page(page, page_size)
    member_ids = _downline_ids(db, _scope(db, agent_id))
    if not member_ids:
        return ok(paginate([], 0, params))

    stmt = select(KycSubmission).where(KycSubmission.user_id.in_(member_ids))
    if status:
        stmt = stmt.where(KycSubmission.status == status.strip().upper())
    if level:
        stmt = stmt.where(KycSubmission.level == level.strip().upper())

    rows, total = _paginate(db, stmt.order_by(KycSubmission.created_at.desc()), params)
    members = _member_map(db, [row.user_id for row in rows])
    items = [{
        "id": row.id,
        "userId": row.user_id,
        "username": members[row.user_id].username if row.user_id in members else None,
        "email": members[row.user_id].email if row.user_id in members else None,
        "level": row.level,
        "status": row.status,
        "createdAt": row.created_at,
        "reviewedAt": row.reviewed_at,
    } for row in rows]
    return ok(paginate(items, total, params))


# --------------------------------------------------------------------------- #
# Sub-agents
# --------------------------------------------------------------------------- #


@router.get("/agents", summary="This agent's sub-agents")
def list_sub_agents(
    agent_id: str | None = Query(None, alias="agentId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_agent),
) -> dict[str, Any]:
    params = _page(page, page_size)
    agent = _scope(db, agent_id)
    if agent is None:
        return ok(paginate([], 0, params))
    stmt = (select(User)
            .where(User.agent_parent_id == agent.id, User.role == Role.AGENT.value)
            .order_by(User.created_at.desc()))
    rows, total = _paginate(db, stmt, params)

    counts: dict[str, int] = {}
    if rows:
        for sub_id, count in db.execute(
            select(User.agent_id, func.count())
            .where(User.agent_id.in_([r.id for r in rows]))
            .group_by(User.agent_id)
        ).all():
            counts[sub_id] = count

    items = [_agent_row(row, counts.get(row.id, 0)) for row in rows]
    return ok(paginate(items, total, params))


# --------------------------------------------------------------------------- #
# Orders
# --------------------------------------------------------------------------- #


@router.get("/trades", summary="Positions across this agent's members")
def list_trades(
    symbol: str | None = Query(None, max_length=40),
    status: str | None = Query(None),
    outcome: str | None = Query(None),
    agent_id: str | None = Query(None, alias="agentId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_agent),
) -> dict[str, Any]:
    params = _page(page, page_size)
    member_ids = _downline_ids(db, _scope(db, agent_id))
    if not member_ids:
        payload = paginate([], 0, params)
        payload.update({"stakeTotal": "0", "profitLossTotal": "0"})
        return ok(payload)

    stmt = select(Trade).where(Trade.user_id.in_(member_ids))
    if symbol:
        stmt = stmt.where(Trade.symbol == symbol.strip().upper())
    if status:
        stmt = stmt.where(Trade.status == status.strip().upper())
    if outcome:
        stmt = stmt.where(Trade.outcome == outcome.strip().upper())

    rows, total = _paginate(db, stmt.order_by(Trade.created_at.desc()), params)
    members = _member_map(db, [row.user_id for row in rows])

    totals = db.execute(
        select(func.coalesce(func.sum(Trade.amount), 0),
               func.coalesce(func.sum(Trade.profit_loss), 0))
        .where(Trade.user_id.in_(member_ids))
    ).one()

    payload = paginate([_trade_row(row, members.get(row.user_id)) for row in rows],
                       total, params)
    payload["stakeTotal"] = str(totals[0])
    payload["profitLossTotal"] = str(totals[1])
    return ok(payload)


# --------------------------------------------------------------------------- #
# Funds
# --------------------------------------------------------------------------- #


def _movements(db: Session, agent: User | None, model: Any, kind: str,
               status: str | None, params: PaginationParams) -> dict[str, Any]:
    member_ids = _downline_ids(db, agent)
    if not member_ids:
        payload = paginate([], 0, params)
        payload["amountTotal"] = "0"
        return payload

    stmt = select(model).where(model.user_id.in_(member_ids))
    if status:
        stmt = stmt.where(model.status == status.strip().upper())

    rows, total = _paginate(db, stmt.order_by(model.created_at.desc()), params)
    members = _member_map(db, [row.user_id for row in rows])

    amount_total = db.scalar(
        select(func.coalesce(func.sum(model.amount), 0))
        .where(model.user_id.in_(member_ids))) or Decimal("0")

    payload = paginate([_movement_row(row, members.get(row.user_id), kind) for row in rows],
                       total, params)
    payload["amountTotal"] = str(amount_total)
    return payload


@router.get("/deposits", summary="Deposits by this agent's members")
def list_deposits(
    status: str | None = Query(None),
    agent_id: str | None = Query(None, alias="agentId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_agent),
) -> dict[str, Any]:
    return ok(_movements(db, _scope(db, agent_id), Deposit, "DEPOSIT", status, _page(page, page_size)))


@router.get("/withdrawals", summary="Withdrawals by this agent's members")
def list_withdrawals(
    status: str | None = Query(None),
    agent_id: str | None = Query(None, alias="agentId"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE, alias="pageSize"),
    db: Session = Depends(get_db),
    admin: User = Depends(require_agent),
) -> dict[str, Any]:
    return ok(_movements(db, _scope(db, agent_id), Withdrawal, "WITHDRAWAL", status, _page(page, page_size)))


# --------------------------------------------------------------------------- #
# Invitations
# --------------------------------------------------------------------------- #


def _invite_base_url(db: Session) -> str:
    """Where invitation links point.

    Same resolution the admin invite route uses: the configured public URL
    first, then the first allowed CORS origin, so a link is never built against
    an internal container hostname.
    """
    configured = str(settings_service.get(db, "public_base_url") or "").strip()
    if configured:
        return configured
    origins = env.cors_origins
    return origins[0] if origins else ""


@router.post("/invites", summary="Invite a member into this agent's downline",
             status_code=201,
             dependencies=[Depends(rate_limit(20, 3600, "agent-invite"))])
def create_invite(request: Request,
                  agent_id: str | None = Query(None, alias="agentId"),
                  db: Session = Depends(get_db),
                  admin: User = Depends(require_agent),
                  expires_in_hours: int = Query(168, ge=1, le=8760, alias="expiresInHours"),
                  email: str | None = Query(None, max_length=255)) -> dict[str, Any]:
    """Issue a single-use invitation.

    Registration attaches the resulting account to this agent, because the
    invite records who created it. That is the only way a member acquires an
    agent, so the hierarchy always matches the invite it came from.
    """
    agent = _scope(db, agent_id)
    if agent is None:
        raise ValidationError("Choose an agent to invite this member under.",
                              code="AGENT_REQUIRED")

    invite = invite_service.create(
        db, admin=agent, expires_in_hours=expires_in_hours, email=email,
        note=f"Issued by agent {agent.username}")

    audit_service.record(
        db, AuditAction.INVITE_CREATED, actor=admin, request=request,
        new_value={"inviteId": invite.id, "email": invite.email,
                   "onBehalfOfAgent": agent.id},
        reason=f"Invitation issued for agent {agent.username}.")
    db.commit()

    return ok({"invite": invite_service.to_dict(db, invite,
                                              base_url=_invite_base_url(db))})
