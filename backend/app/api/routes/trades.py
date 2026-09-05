"""Simulated trading endpoints.

Every position opened here is paper trading against real public prices. No
order is ever routed to an exchange and no real funds are ever at risk.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import rate_limit, require_active_user, require_feature, require_user
from app.core.errors import NotFoundError, ValidationError
from app.db.models import Trade, TradeOutcome, TradeStatus, User
from app.db.session import get_db
from app.schemas.common import PaginationParams, ok, paginate
from app.schemas.trade import TradeConfigOut, TradeCreate, TradeOut
from app.services import trade_engine

router = APIRouter()


def _serialize(trade: Trade) -> dict[str, Any]:
    return TradeOut.from_trade(
        trade, seconds_remaining=trade_engine.seconds_remaining(trade)
    ).model_dump(by_alias=True, mode="json")


def _owned_trade(db: Session, trade_id: str, user: User) -> Trade:
    trade = db.get(Trade, trade_id)
    if trade is None or trade.user_id != user.id:
        raise NotFoundError("Simulated trade not found.", code="TRADE_NOT_FOUND")
    return trade


@router.get("/config", summary="Demo trade configuration")
def get_trade_config(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> dict[str, Any]:
    """Markets, durations, payouts and stake limits for the demo trade screen.

    Includes the plain-language disclosure of how simulated outcomes are decided.
    """
    config = TradeConfigOut.model_validate(trade_engine.trade_config(db))
    return ok(config.model_dump(by_alias=True, mode="json"))


@router.post("", summary="Open a simulated trade", status_code=201)
async def create_trade(
    payload: TradeCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_active_user),
    _feature: None = Depends(require_feature("trading_enabled")),
    _limit: None = Depends(rate_limit(30, 60, "trade")),
) -> dict[str, Any]:
    """Open one fixed-duration paper position and lock the demo stake.

    The entry price is read live from the public market-data provider. Nothing
    is bought, sold or transmitted anywhere.
    """
    trade = await trade_engine.open_trade(
        db, user, payload.symbol, payload.direction, payload.amount,
        payload.duration_seconds, request=request,
        stake_asset=payload.stake_asset,
    )
    db.commit()
    db.refresh(trade)
    return ok(_serialize(trade))


@router.get("", summary="Simulated trade history")
def list_trades(
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    outcome: str = Query("all", description="all | WIN | LOSS | DRAW"),
    status: str | None = Query(None, description="OPEN | SETTLED | VOIDED"),
) -> dict[str, Any]:
    """Paginated history of this account's simulated trades, newest first."""
    params = PaginationParams(page=page, page_size=page_size)

    filters = [Trade.user_id == user.id]
    if outcome and outcome.lower() != "all":
        value = outcome.upper()
        if value not in {o.value for o in TradeOutcome}:
            raise ValidationError("Outcome filter must be all, WIN, LOSS or DRAW.",
                                  code="INVALID_OUTCOME_FILTER")
        filters.append(Trade.outcome == value)
    if status:
        value = status.upper()
        if value not in {s.value for s in TradeStatus}:
            raise ValidationError("Status filter must be OPEN, SETTLED or VOIDED.",
                                  code="INVALID_STATUS_FILTER")
        filters.append(Trade.status == value)

    total = db.scalar(select(func.count()).select_from(Trade).where(*filters)) or 0
    rows = db.scalars(
        select(Trade).where(*filters)
        .order_by(Trade.created_at.desc())
        .offset(params.offset).limit(params.page_size)
    ).all()
    return ok(paginate([_serialize(t) for t in rows], total, params))


@router.get("/{trade_id}", summary="One simulated trade")
def get_trade(
    trade_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> dict[str, Any]:
    """Fetch a single simulated trade belonging to the signed-in account."""
    return ok(_serialize(_owned_trade(db, trade_id, user)))


@router.get("/{trade_id}/result", summary="Settle if due, then return the result")
async def get_trade_result(
    trade_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> dict[str, Any]:
    """Return a simulated trade's result, settling it first if it has expired.

    Settling on demand keeps the UI correct even when the background settlement
    worker is not running.
    """
    trade = _owned_trade(db, trade_id, user)
    if (trade.status == TradeStatus.OPEN.value
            and trade_engine.seconds_remaining(trade) == 0):
        await trade_engine.settle_trade(db, trade)
        db.commit()
        db.refresh(trade)
    return ok(_serialize(trade))
