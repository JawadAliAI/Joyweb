"""Demo trade engine and settlement worker.

**Simulation only.** Nothing here touches a blockchain or real money.

How an outcome is decided — and the complete list of ways it can be decided:

* The entry price is read from the configured public market-data provider when
  the trade is opened, and the exit price is read from the same public source
  at expiry. UP wins when the exit price is above the entry price, DOWN wins
  when it is below, and an unchanged price is a DRAW with the stake returned.
* If the market-data provider is unavailable at expiry the trade is **voided**
  and the full stake is returned. A price is never invented, never randomised,
  and never nudged.
* An explicitly labelled `TradeTestScenario` may force an outcome, but only on
  an account flagged `is_test_account`. It is refused (and logged) for any
  normal demo customer, and every use is written to the audit log and disclosed
  on the trade itself via `settlement_source=ADMIN_TEST_SCENARIO`.

There is no per-customer outcome manipulation in this module and no hidden
house edge: two customers opening the same trade at the same moment always get
the same result. Payout percentages are public, admin-configured, and shown to
the user before the trade is opened.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, UpstreamUnavailableError, ValidationError
from app.core.logging import logger
from app.db.base import utcnow
from app.db.models import (
    Asset, AuditAction, Market, SettlementSource, Trade, TradeDirection,
    TradeOutcome, TradeStatus, TradeTestScenario, TradingDuration, Transaction,
    TransactionStatus, TransactionType, User,
)
from app.db.session import unit_of_work
from app.services import audit_service, market_data, settings_service, wallet_service

ZERO = Decimal("0")
HUNDRED = Decimal("100")

# A position may be staked in either simulated stablecoin. The choice only
# decides which wallet funds the stake and receives the return — it never
# affects the outcome, which is decided purely by the price comparison.
DEFAULT_STAKE_ASSET = Asset.DEMO_USDT.value
STAKE_ASSETS: tuple[str, ...] = (Asset.DEMO_USDT.value, Asset.DEMO_USDC.value)


def resolve_stake_asset(asset: str | None) -> str:
    """Validate a requested stake asset, defaulting to DEMO USDT."""
    if not asset:
        return DEFAULT_STAKE_ASSET
    value = str(asset).upper()
    if value not in STAKE_ASSETS:
        raise ValidationError(
            f"Trades can only be staked in {' or '.join(STAKE_ASSETS)}.",
            code="UNSUPPORTED_STAKE_ASSET")
    return value

VOID_NOTE = (
    "Simulation voided: public market data was unavailable at expiry, so no "
    "exit price could be recorded. Your stake was returned in full."
)


# --------------------------------------------------------------------------- #
# Pure calculation helpers — no I/O, trivially testable.
# --------------------------------------------------------------------------- #

def calculate_outcome(direction: str, entry_price: Decimal,
                      exit_price: Decimal) -> TradeOutcome:
    """Compare two public prices. This is the entire outcome rule."""
    entry = Decimal(str(entry_price))
    exit_ = Decimal(str(exit_price))
    if exit_ == entry:
        return TradeOutcome.DRAW
    moved_up = exit_ > entry
    if str(direction) == TradeDirection.UP.value:
        return TradeOutcome.WIN if moved_up else TradeOutcome.LOSS
    return TradeOutcome.LOSS if moved_up else TradeOutcome.WIN


def calculate_settlement(amount: Decimal, payout_percent: Decimal,
                         outcome: TradeOutcome | str) -> tuple[Decimal, Decimal]:
    """Return `(profit_loss, returned_amount)` for a finished trade."""
    amount = wallet_service.quantize(amount)
    outcome = TradeOutcome(str(outcome))
    if outcome is TradeOutcome.WIN:
        profit = wallet_service.quantize(
            amount * Decimal(str(payout_percent)) / HUNDRED)
        return profit, wallet_service.quantize(amount + profit)
    if outcome is TradeOutcome.LOSS:
        return wallet_service.quantize(-amount), ZERO
    return ZERO, amount


def seconds_remaining(trade: Trade, *, now: datetime | None = None) -> int:
    """Whole seconds until expiry; never negative."""
    reference = now or utcnow()
    expires = _aware(trade.expires_at)
    return max(0, int((expires - reference).total_seconds()))


def _aware(value: datetime | None) -> datetime:
    """Treat a naive timestamp (SQLite) as UTC so comparisons never explode."""
    if value is None:
        return utcnow()
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _notify(db: Session, user_id: str, title: str, body: str, kind: str) -> None:
    """Best-effort in-app notification.

    The notification service is owned by another module and may not be present;
    a missing notifier must never block a settlement.
    """
    try:
        from app.services.notification_service import notify  # type: ignore
    except ImportError:
        return
    try:
        notify(db, user_id=user_id, title=title, body=body, category=kind)
    except Exception:  # pragma: no cover - notifications are never critical
        logger.warning("trade_notification_failed user=%s kind=%s", user_id, kind)


# --------------------------------------------------------------------------- #
# Configuration lookups
# --------------------------------------------------------------------------- #

def get_market(db: Session, symbol: str) -> Market:
    market = db.scalar(select(Market).where(Market.symbol == symbol))
    if market is None or not market.is_enabled:
        raise NotFoundError(f"Market {symbol} is not available.",
                            code="MARKET_NOT_FOUND")
    if not market.is_tradable:
        raise ValidationError(
            f"Market {symbol} is not open for trading right now.",
            code="MARKET_NOT_TRADABLE")
    return market


def get_duration(db: Session, duration_seconds: int) -> TradingDuration:
    duration = db.scalar(select(TradingDuration).where(
        TradingDuration.seconds == int(duration_seconds)))
    if duration is None or not duration.is_enabled:
        raise ValidationError(
            f"{duration_seconds}s is not one of the offered trade durations.",
            code="INVALID_DURATION")
    return duration


def list_durations(db: Session) -> list[TradingDuration]:
    return list(db.scalars(
        select(TradingDuration)
        .where(TradingDuration.is_enabled.is_(True))
        .order_by(TradingDuration.sort_order, TradingDuration.seconds)))


def list_markets(db: Session) -> list[Market]:
    return list(db.scalars(
        select(Market)
        .where(Market.is_enabled.is_(True), Market.is_tradable.is_(True))
        .order_by(Market.sort_order, Market.symbol)))


def amount_bounds(db: Session, duration: TradingDuration) -> tuple[Decimal, Decimal]:
    """Tightest of the per-duration limits and the platform-wide limits."""
    global_min = settings_service.get_decimal(db, "trade_min_amount")
    global_max = settings_service.get_decimal(db, "trade_max_amount")
    minimum = max(wallet_service.quantize(duration.min_amount),
                  wallet_service.quantize(global_min))
    maximum = min(wallet_service.quantize(duration.max_amount),
                  wallet_service.quantize(global_max))
    return minimum, maximum


def trade_config(db: Session) -> dict:
    """Everything the trade screen needs, including the simulation disclosure."""
    durations = list_durations(db)
    global_min = wallet_service.quantize(
        settings_service.get_decimal(db, "trade_min_amount"))
    global_max = wallet_service.quantize(
        settings_service.get_decimal(db, "trade_max_amount"))
    return {
        "markets": [
            {
                "symbol": m.symbol,
                "displayName": m.display_name,
                "baseAsset": m.base_asset,
                "quoteAsset": m.quote_asset,
                "priceDecimals": m.price_decimals,
            }
            for m in list_markets(db)
        ],
        "durations": [
            {
                "seconds": d.seconds,
                "label": d.label,
                "payoutPercent": str(Decimal(str(d.payout_percent))),
                "minAmount": str(max(wallet_service.quantize(d.min_amount), global_min)),
                "maxAmount": str(min(wallet_service.quantize(d.max_amount), global_max)),
            }
            for d in durations
        ],
        "quickAmounts": [str(wallet_service.quantize(a))
                         for a in settings_service.get(db, "trade_quick_amounts") or []],
        "minAmount": str(global_min),
        "maxAmount": str(global_max),
        "stakeAsset": DEFAULT_STAKE_ASSET,
        "stakeAssets": [
            {"asset": asset,
             "label": wallet_service.ASSET_META[asset]["label"],
             "decimals": wallet_service.ASSET_META[asset]["decimals"]}
            for asset in STAKE_ASSETS
        ],
        "defaultDurationSeconds": int(
            settings_service.get(db, "default_duration_seconds") or 60),
        "disclosure": settings_service.get(db, "simulation_disclosure"),
        "demoNotice": (
            "Trading only. Stakes and payouts are balances; no "
            "real funds are ever placed at risk."
        ),
    }


# --------------------------------------------------------------------------- #
# Opening a trade
# --------------------------------------------------------------------------- #

async def open_trade(db: Session, user: User, symbol: str, direction: str,
                     amount: Decimal, duration_seconds: int,
                     request: Request | None = None,
                     stake_asset: str | None = None) -> Trade:
    """Open one simulated fixed-duration position and lock the demo stake.

    The caller owns the transaction and must commit.
    """
    direction_value = str(direction).upper()
    if direction_value not in (TradeDirection.UP.value, TradeDirection.DOWN.value):
        raise ValidationError("Direction must be UP or DOWN.", code="INVALID_DIRECTION")

    asset = resolve_stake_asset(stake_asset)

    market = get_market(db, symbol)
    duration = get_duration(db, duration_seconds)

    stake = wallet_service.validate_amount(amount, field="Stake amount")
    minimum, maximum = amount_bounds(db, duration)
    if minimum > maximum:
        raise ValidationError(
            "Stake limits are misconfigured for this duration.",
            code="INVALID_AMOUNT_LIMITS")
    if stake < minimum:
        raise ValidationError(
            f"Minimum stake for this duration is {minimum} "
            f"{wallet_service.ASSET_META[asset]['label']}.",
            code="AMOUNT_BELOW_MINIMUM")
    if stake > maximum:
        raise ValidationError(
            f"Maximum stake for this duration is {maximum} "
            f"{wallet_service.ASSET_META[asset]['label']}.",
            code="AMOUNT_ABOVE_MAXIMUM")

    # Real, public entry price. If the upstream is down we refuse the trade
    # rather than open one against a made-up number.
    ticker = await market_data.get_provider().get_ticker(market.provider_symbol)
    entry_price = Decimal(str(ticker.price))
    if entry_price <= ZERO:
        raise UpstreamUnavailableError(
            "Market data returned an unusable price; the trade was not opened.")

    wallet_service.lock_funds(db, user.id, asset, stake)

    opens_at = utcnow()
    expires_at = opens_at + timedelta(seconds=int(duration.seconds))

    trade = Trade(
        user_id=user.id,
        symbol=market.symbol,
        direction=direction_value,
        asset=asset,
        amount=stake,
        duration_seconds=int(duration.seconds),
        payout_percent=Decimal(str(duration.payout_percent)),
        entry_price=entry_price,
        status=TradeStatus.OPEN.value,
        opens_at=opens_at,
        expires_at=expires_at,
    )
    db.add(trade)
    db.flush()

    # lock_funds moves value without writing the ledger, so record the stake here.
    db.add(Transaction(
        user_id=user.id,
        type=TransactionType.TRADE_STAKE.value,
        asset=asset,
        amount=-stake,
        fee=ZERO,
        status=TransactionStatus.COMPLETED.value,
        reference=wallet_service.new_reference("TRD"),
        description=f"{direction_value} trade stake on {market.symbol}",
        meta={"tradeId": trade.id, "symbol": market.symbol,
              "direction": direction_value, "simulation": True},
    ))
    db.flush()

    audit_service.record(
        db, AuditAction.TRADE_CREATED, actor=user, target_user_id=user.id,
        new_value={"tradeId": trade.id, "symbol": market.symbol,
                   "direction": direction_value, "amount": str(stake),
                   "durationSeconds": trade.duration_seconds,
                   "entryPrice": str(entry_price)},
        reason="Trade opened by the account holder.",
        request=request,
    )
    _notify(db, user.id, "Trade opened",
            f"{direction_value} on {market.symbol} for {stake} USDT.",
            "TRADE_OPENED")
    return trade


# --------------------------------------------------------------------------- #
# Settlement
# --------------------------------------------------------------------------- #

def _pending_scenario(db: Session, user: User) -> TradeTestScenario | None:
    """Return a usable scripted outcome, or None.

    Hard guard: a scenario is only ever honoured for an account explicitly
    flagged as a test account. If one is somehow attached to a normal demo
    customer it is consumed without effect and logged loudly, so a scripted
    result can never reach a real user.
    """
    scenario = db.scalar(
        select(TradeTestScenario)
        .where(TradeTestScenario.target_user_id == user.id,
               TradeTestScenario.consumed.is_(False))
        .order_by(TradeTestScenario.created_at))
    if scenario is None:
        return None
    if not bool(user.is_test_account):
        logger.warning(
            "trade_test_scenario_refused user=%s scenario=%s reason=not_a_test_account",
            user.id, scenario.id)
        scenario.consumed = True
        scenario.consumed_at = utcnow()
        return None
    return scenario


def _void(db: Session, trade: Trade, user: User, note: str,
          *, actor: User | None = None) -> Trade:
    """Return the stake in full and mark the trade voided.

    `actor` names who caused the void in the audit trail; it defaults to the
    account holder, which is what an ordinary expiry-time void is. An
    administrator bulk cancellation passes itself instead.
    """
    wallet_service.release_locked(db, trade.user_id, trade.asset,
                                  trade.amount, back_to_available=True)
    db.add(Transaction(
        user_id=trade.user_id,
        type=TransactionType.TRADE_RETURN.value,
        asset=trade.asset,
        amount=wallet_service.quantize(trade.amount),
        fee=ZERO,
        status=TransactionStatus.COMPLETED.value,
        reference=wallet_service.new_reference("TRV"),
        description=f"Trade voided on {trade.symbol} - stake returned",
        meta={"tradeId": trade.id, "symbol": trade.symbol, "voided": True,
              "simulation": True},
    ))
    trade.status = TradeStatus.VOIDED.value
    trade.outcome = None
    trade.profit_loss = ZERO
    trade.returned_amount = wallet_service.quantize(trade.amount)
    trade.exit_price = None
    trade.settled_at = utcnow()
    trade.settlement_source = None
    trade.settlement_note = note
    db.flush()
    audit_service.record(
        db, AuditAction.TRADE_COMPLETED, actor=actor or user,
        target_user_id=trade.user_id,
        new_value={"tradeId": trade.id, "status": trade.status,
                   "returnedAmount": str(trade.returned_amount)},
        reason=note)
    _notify(db, trade.user_id, "Trade voided", note, "TRADE_VOIDED")
    return trade


async def settle_trade(db: Session, trade: Trade) -> Trade:
    """Settle one simulated trade. Idempotent — a settled trade is returned as-is.

    The caller owns the transaction and must commit.
    """
    if trade.status != TradeStatus.OPEN.value:
        return trade

    user = db.get(User, trade.user_id)
    if user is None:  # pragma: no cover - FK makes this near-impossible
        raise NotFoundError("The account for this trade no longer exists.")

    market = db.scalar(select(Market).where(Market.symbol == trade.symbol))
    exit_price: Decimal | None = None
    if market is not None:
        try:
            ticker = await market_data.get_provider().get_ticker(market.provider_symbol)
            exit_price = Decimal(str(ticker.price))
        except UpstreamUnavailableError:
            logger.warning("trade_settlement_market_data_unavailable trade=%s symbol=%s",
                           trade.id, trade.symbol)
            exit_price = None

    # An outcome pinned to THIS trade wins over everything else. It is what the
    # admin pressed while looking at this position, so it must not be affected
    # by anything queued before or after it.
    pinned = str(trade.forced_outcome).upper() if trade.forced_outcome else None
    if pinned and not bool(user.is_test_account):
        logger.warning(
            "trade_forced_outcome_refused trade=%s user=%s reason=not_a_test_account",
            trade.id, trade.user_id)
        trade.forced_outcome = None
        pinned = None

    scenario = None if pinned else _pending_scenario(db, user)

    if exit_price is None and scenario is None and pinned is None:
        return _void(db, trade, user, VOID_NOTE)

    if pinned is not None:
        outcome = TradeOutcome(pinned)
        settlement_source = SettlementSource.ADMIN_TEST_SCENARIO
        note = ("Outcome set by an administrator on this specific trade, on a "
                "flagged test account. Not a market-derived result.")
        if exit_price is None:
            exit_price = Decimal(str(trade.entry_price))
    elif scenario is not None:
        outcome = TradeOutcome(str(scenario.forced_outcome))
        settlement_source = SettlementSource.ADMIN_TEST_SCENARIO
        note = (f"Outcome forced by admin test scenario \"{scenario.label}\" on a "
                f"flagged test account. Not a market-derived result.")
        scenario.consumed = True
        scenario.consumed_at = utcnow()
        trade.test_scenario_id = scenario.id
        if exit_price is None:
            exit_price = Decimal(str(trade.entry_price))
    else:
        outcome = calculate_outcome(trade.direction, trade.entry_price, exit_price)
        settlement_source = SettlementSource.MARKET_DATA
        note = ("Settled by comparing the entry price to the public market price "
                "at expiry.")

    profit_loss, returned_amount = calculate_settlement(
        trade.amount, trade.payout_percent, outcome)

    # Retire the locked stake, then credit whatever comes back as a fresh entry.
    wallet_service.release_locked(db, trade.user_id, trade.asset,
                                  trade.amount, back_to_available=False)
    if returned_amount > ZERO:
        wallet_service.credit(
            db, trade.user_id, trade.asset, returned_amount,
            tx_type=TransactionType.TRADE_RETURN,
            reference=wallet_service.new_reference("TRR"),
            description=(f"{outcome.value} on {trade.symbol} "
                         f"({trade.direction})"),
            metadata={"tradeId": trade.id, "symbol": trade.symbol,
                      "outcome": outcome.value, "profitLoss": str(profit_loss),
                      "settlementSource": settlement_source.value,
                      "simulation": True})

    trade.exit_price = exit_price
    trade.outcome = outcome.value
    trade.profit_loss = profit_loss
    trade.returned_amount = returned_amount
    trade.status = TradeStatus.SETTLED.value
    trade.settled_at = utcnow()
    trade.settlement_source = settlement_source.value
    trade.settlement_note = note
    db.flush()

    audit_service.record(
        db, AuditAction.TRADE_COMPLETED, actor=user, target_user_id=trade.user_id,
        new_value={"tradeId": trade.id, "outcome": outcome.value,
                   "entryPrice": str(trade.entry_price),
                   "exitPrice": str(exit_price),
                   "profitLoss": str(profit_loss),
                   "returnedAmount": str(returned_amount),
                   "settlementSource": settlement_source.value},
        reason=note)
    _notify(db, trade.user_id, f"Trade {outcome.value.lower()}",
            f"{trade.symbol} {trade.direction}: {note}", "TRADE_SETTLED")
    return trade


async def settle_due_trades(db: Session) -> int:
    """Settle every open trade that has reached its expiry."""
    now = utcnow()
    due = list(db.scalars(
        select(Trade)
        .where(Trade.status == TradeStatus.OPEN.value, Trade.expires_at <= now)
        .order_by(Trade.expires_at)))
    settled = 0
    for trade in due:
        try:
            await settle_trade(db, trade)
            settled += 1
        except Exception:
            # One bad trade must not stall the queue behind it.
            logger.exception("trade_settlement_failed trade=%s", trade.id)
    return settled


# --------------------------------------------------------------------------- #
# Administrator bulk operations
#
# Both operations below are deliberately outcome-neutral. `settle_all_open`
# closes the book early by running the ordinary settlement path against the live
# public price, so every outcome is the one the price comparison gives — an
# administrator cannot choose it. `void_all_open` cancels instead: everybody
# gets their stake back and nobody wins or loses. There is no third option, and
# in particular there is no way to force a WIN or a LOSS on a customer.
# --------------------------------------------------------------------------- #

BULK_VOID_NOTE = (
    "Simulation cancelled by an administrator before expiry, so no exit price "
    "was recorded and no outcome was decided. Your stake was returned in "
    "full. Reason: {reason}"
)


def _open_trades(db: Session) -> list[Trade]:
    """Every trade still open, oldest first."""
    return list(db.scalars(
        select(Trade)
        .where(Trade.status == TradeStatus.OPEN.value)
        .order_by(Trade.expires_at, Trade.created_at)))


def _require_reason(reason: str | None) -> str:
    text = (reason or "").strip()
    if not text:
        raise ValidationError(
            "A non-empty reason is required for this action.",
            code="REASON_REQUIRED")
    return text[:2000]


async def settle_all_open(db: Session, admin: User, reason: str,
                          request: Request | None = None) -> dict:
    """Settle every open simulated trade now, at the live public market price.

    Intended for closing the book before maintenance. Each trade goes through
    the ordinary `settle_trade` path, so the outcome is decided by exactly the
    same public price comparison it would have used at expiry — this operation
    cannot pick a winner or a loser. A trade whose market data is unavailable is
    voided with the stake returned, as it would be at expiry.

    One failing trade is logged and counted under `failed`; it never aborts the
    batch. The caller owns the transaction and must commit.
    """
    text = _require_reason(reason)
    trades = _open_trades(db)

    counts = {"settled": 0, "won": 0, "lost": 0, "drawn": 0,
              "voided": 0, "failed": 0}
    touched: list[tuple[str, str]] = []

    for trade in trades:
        try:
            await settle_trade(db, trade)
        except Exception:
            counts["failed"] += 1
            logger.exception("admin_bulk_settle_failed trade=%s", trade.id)
            continue
        if trade.status == TradeStatus.VOIDED.value:
            counts["voided"] += 1
        elif trade.status == TradeStatus.SETTLED.value:
            counts["settled"] += 1
            key = {TradeOutcome.WIN.value: "won",
                   TradeOutcome.LOSS.value: "lost",
                   TradeOutcome.DRAW.value: "drawn"}.get(str(trade.outcome))
            if key:
                counts[key] += 1
        else:  # pragma: no cover - settle_trade leaves no other state
            counts["failed"] += 1
            continue
        touched.append((trade.user_id, trade.symbol))

    for user_id, symbol in touched:
        _notify(db, user_id, "Trade closed early",
                (f"An administrator closed all open positions, including "
                 f"your {symbol} trade, at the live public market price. "
                 f"Reason: {text}"),
                "TRADE_SETTLED")

    audit_service.record(
        db, AuditAction.TRADES_BULK_SETTLED, actor=admin, request=request,
        new_value={"open": len(trades), **counts},
        reason=text)

    counts["reason"] = text
    counts["message"] = (
        f"Settled {counts['settled']} open trade(s) against the live public "
        f"market price; {counts['voided']} were voided with the stake returned "
        f"because market data was unavailable. Outcomes were decided by the "
        f"price comparison alone."
    )
    return counts


def void_all_open(db: Session, admin: User, reason: str,
                  request: Request | None = None) -> dict:
    """Cancel every open simulated trade and return every stake in full.

    Nobody wins and nobody loses: the locked stake goes straight back to
    available, a `TRADE_RETURN` ledger entry is written, and the trade is left
    with no exit price and no outcome. The caller owns the transaction and must
    commit.
    """
    text = _require_reason(reason)
    note = BULK_VOID_NOTE.format(reason=text)
    trades = _open_trades(db)

    voided = 0
    failed = 0
    returned_total = ZERO
    touched: list[tuple[str, str]] = []

    for trade in trades:
        user = db.get(User, trade.user_id)
        if user is None:  # pragma: no cover - FK makes this near-impossible
            failed += 1
            continue
        try:
            _void(db, trade, user, note, actor=admin)
        except Exception:
            failed += 1
            logger.exception("admin_bulk_void_failed trade=%s", trade.id)
            continue
        voided += 1
        returned_total += wallet_service.quantize(trade.amount)
        touched.append((trade.user_id, trade.symbol))

    for user_id, symbol in touched:
        _notify(db, user_id, "Trade cancelled",
                f"Your open {symbol} trade was cancelled by an "
                f"administrator and the full stake was returned. Reason: {text}",
                "TRADE_VOIDED")

    audit_service.record(
        db, AuditAction.TRADES_BULK_VOIDED, actor=admin, request=request,
        new_value={"open": len(trades), "voided": voided, "failed": failed,
                   "returnedTotal": str(wallet_service.quantize(returned_total))},
        reason=text)

    return {
        "voided": voided,
        "failed": failed,
        "returnedTotal": wallet_service.quantize(returned_total),
        "reason": text,
        "message": (
            f"Cancelled {voided} open trade(s) and returned every stake in "
            f"full. No outcome was decided and nobody won or lost."
        ),
    }


class _SettlementLoop:
    """Background poller that settles expired simulated trades.

    It owns its own short-lived session per tick and swallows every error, so a
    transient database or upstream outage can never kill the loop. On-demand
    settlement via `GET /api/trades/{id}/result` means the UI stays correct even
    if this loop is not running at all.
    """

    interval_seconds: float = 2.0

    async def start(self) -> asyncio.Task:
        task = asyncio.create_task(self._run(), name="trade-settlement-loop")
        logger.info("trade_settlement_loop_started interval=%ss", self.interval_seconds)
        return task

    async def stop(self, handle: asyncio.Task | None) -> None:
        if handle is None:
            return
        handle.cancel()
        try:
            await handle
        except asyncio.CancelledError:
            pass
        except Exception:  # pragma: no cover - shutdown must never raise
            logger.exception("trade_settlement_loop_stop_failed")
        logger.info("trade_settlement_loop_stopped")

    async def _run(self) -> None:
        while True:
            try:
                await asyncio.sleep(self.interval_seconds)
                await self._tick()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("trade_settlement_loop_tick_failed")

    async def _tick(self) -> None:
        cm = unit_of_work()
        db = cm.__enter__()
        try:
            count = await settle_due_trades(db)
            if count:
                logger.info("trade_settlement_loop_settled count=%s", count)
        except BaseException as exc:
            cm.__exit__(type(exc), exc, exc.__traceback__)
            raise
        else:
            cm.__exit__(None, None, None)


settle_due_trades_loop = _SettlementLoop()
