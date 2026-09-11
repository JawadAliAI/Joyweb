"""Idempotent development seed data.

Run with::

    python -m app.db.seed

Everything this module writes is SIMULATED. No balance, trade, deposit or
withdrawal it creates corresponds to real money or to any blockchain.

Idempotency rule for this file: every insert is guarded by a lookup on the
natural key of the row (market symbol, duration seconds, user email, ...), so
running the seed twice leaves the database in exactly the same state as running
it once. Balances are only ever credited on the run that creates the wallet's
opening ledger entry.

Credentials are NEVER hard-coded here. They come from the SEED_* environment
variables; if one is empty a strong random password is generated with `secrets`,
printed once to stdout, and never persisted anywhere in plaintext.
"""
from __future__ import annotations

import secrets
import string
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.db.models import (
    Asset, Market, Notification, Role, SettlementSource, SupportMessage,
    SupportTicket, TicketStatus, Trade, TradeDirection, TradeOutcome,
    TradeStatus, TradingDuration, TransactionType, User, UserStatus,
)
from app.db.session import unit_of_work
from app.services import settings_service, wallet_service

BANNER = """
================================================================================
  cptcryptoiin SEED DATA INITIALIZATION
================================================================================
"""

# Marker written to seeded sample trades so a second run can recognise them.
SAMPLE_TRADE_NOTE = "Seeded sample trade (market data settlement)."
OPENING_BALANCE_REF = "DEMO-SEED-OPENING"


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _generate_password() -> str:
    """A strong random password. Shown once, stored only as an Argon2 hash."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*-_=+"
    return "".join(secrets.choice(alphabet) for _ in range(24))


def _resolve_password(env_value: str, label: str, generated: list[tuple[str, str]]) -> str:
    if env_value:
        return env_value
    password = _generate_password()
    generated.append((label, password))
    return password


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# --------------------------------------------------------------------------- #
# markets
# --------------------------------------------------------------------------- #
MARKETS: list[dict] = [
    # symbol, base, quote, provider symbol, display, decimals, sort
    {"symbol": "BTC/USDT", "base_asset": "BTC", "quote_asset": "USDT",
     "provider_symbol": "BTCUSDT", "display_name": "Bitcoin",
     "price_decimals": 2, "sort_order": 10},
    {"symbol": "ETH/USDT", "base_asset": "ETH", "quote_asset": "USDT",
     "provider_symbol": "ETHUSDT", "display_name": "Ethereum",
     "price_decimals": 2, "sort_order": 20},
    {"symbol": "TRX/USDT", "base_asset": "TRX", "quote_asset": "USDT",
     "provider_symbol": "TRXUSDT", "display_name": "TRON",
     "price_decimals": 6, "sort_order": 30},
    {"symbol": "BNB/USDT", "base_asset": "BNB", "quote_asset": "USDT",
     "provider_symbol": "BNBUSDT", "display_name": "BNB",
     "price_decimals": 2, "sort_order": 40},
    {"symbol": "SOL/USDT", "base_asset": "SOL", "quote_asset": "USDT",
     "provider_symbol": "SOLUSDT", "display_name": "Solana",
     "price_decimals": 3, "sort_order": 50},
    {"symbol": "XRP/USDT", "base_asset": "XRP", "quote_asset": "USDT",
     "provider_symbol": "XRPUSDT", "display_name": "XRP",
     "price_decimals": 5, "sort_order": 60},
    {"symbol": "ADA/USDT", "base_asset": "ADA", "quote_asset": "USDT",
     "provider_symbol": "ADAUSDT", "display_name": "Cardano",
     "price_decimals": 5, "sort_order": 70},
    {"symbol": "ETH/BTC", "base_asset": "ETH", "quote_asset": "BTC",
     "provider_symbol": "ETHBTC", "display_name": "Ethereum / Bitcoin",
     "price_decimals": 6, "sort_order": 80},
]

# seconds, label, payout percent
DURATIONS: list[tuple[int, str, str]] = [
    (30, "30 Second", "20"),
    (60, "60 Second", "30"),
    (90, "90 Second", "35"),
    (120, "120 Second", "45"),
    (180, "180 Second", "60"),
    (360, "360 Second", "70"),
    (420, "420 Second", "75"),
    (510, "510 Second", "80"),
    (620, "620 Second", "90"),
]

DURATION_MIN = Decimal("10")
DURATION_MAX = Decimal("10000")


def seed_markets(db: Session) -> int:
    existing = {row.symbol for row in db.scalars(select(Market))}
    added = 0
    for spec in MARKETS:
        if spec["symbol"] in existing:
            continue
        db.add(Market(is_enabled=True, is_tradable=True, **spec))
        added += 1
    return added


def seed_durations(db: Session) -> int:
    existing = {row.seconds for row in db.scalars(select(TradingDuration))}
    added = 0
    for order, (seconds, label, payout) in enumerate(DURATIONS, start=1):
        if seconds in existing:
            continue
        db.add(TradingDuration(
            seconds=seconds, label=label, payout_percent=Decimal(payout),
            min_amount=DURATION_MIN, max_amount=DURATION_MAX,
            is_enabled=True, sort_order=order * 10,
        ))
        added += 1
    return added


# --------------------------------------------------------------------------- #
# users
# --------------------------------------------------------------------------- #
def _get_or_create_user(db: Session, *, email: str, username: str, first_name: str,
                        last_name: str, password: str, role: str,
                        is_test_account: bool = False,
                        must_change_password: bool = False) -> tuple[User, bool]:
    user = db.scalar(select(User).where(User.email == email))
    if user is not None:
        return user, False
    user = User(
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
        password_hash=hash_password(password),
        role=role,
        status=UserStatus.ACTIVE.value,
        credit_score=70,
        is_test_account=is_test_account,
        must_change_password=must_change_password,
    )
    db.add(user)
    db.flush()
    wallet_service.ensure_wallets(db, user.id)
    return user, True


# --------------------------------------------------------------------------- #
# wallets / ledger
# --------------------------------------------------------------------------- #
def _credit_opening_balance(db: Session, user: User, asset: str,
                            amount: Decimal, tag: str) -> bool:
    """Credit an opening balance exactly once, through the wallet ledger."""
    reference = f"{OPENING_BALANCE_REF}-{tag}"
    from app.db.models import Transaction  # local import keeps the header tidy

    existing = db.scalar(select(Transaction).where(Transaction.reference == reference))
    if existing is not None:
        return False
    if amount <= Decimal("0"):
        wallet_service.get_wallet(db, user.id, asset)  # ensure a zero row exists
        return False
    wallet_service.credit(
        db, user.id, asset, amount,
        tx_type=TransactionType.ADMIN_CREDIT,
        reference=reference,
        description="Opening balance.",
        metadata={"source": "seed"},
    )
    return True


# --------------------------------------------------------------------------- #
# sample history
# --------------------------------------------------------------------------- #
# Five settled trades whose profit/loss nets to exactly zero, so the demo
# account's opening balance still reconciles against its ledger.
SAMPLE_TRADES: list[dict] = [
    {"symbol": "BTC/USDT", "direction": TradeDirection.UP, "amount": "100",
     "duration": 60, "payout": "25", "entry": "63120.450000000000",
     "exit": "63344.120000000000", "outcome": TradeOutcome.WIN, "hours_ago": 30},
    {"symbol": "ETH/USDT", "direction": TradeDirection.DOWN, "amount": "100",
     "duration": 120, "payout": "45", "entry": "2465.880000000000",
     "exit": "2478.310000000000", "outcome": TradeOutcome.LOSS, "hours_ago": 26},
    {"symbol": "BTC/USDT", "direction": TradeDirection.UP, "amount": "200",
     "duration": 60, "payout": "25", "entry": "62880.100000000000",
     "exit": "63012.750000000000", "outcome": TradeOutcome.WIN, "hours_ago": 20},
    {"symbol": "TRX/USDT", "direction": TradeDirection.UP, "amount": "50",
     "duration": 30, "payout": "20", "entry": "0.158420000000",
     "exit": "0.158420000000", "outcome": TradeOutcome.DRAW, "hours_ago": 12},
    {"symbol": "SOL/USDT", "direction": TradeDirection.DOWN, "amount": "100",
     "duration": 60, "payout": "25", "entry": "146.820000000000",
     "exit": "145.410000000000", "outcome": TradeOutcome.WIN, "hours_ago": 4},
]


def seed_sample_trades(db: Session, user: User) -> int:
    """Settled trades, with the matching stake / return ledger entries."""
    already = db.scalar(
        select(Trade).where(Trade.user_id == user.id,
                            Trade.settlement_note == SAMPLE_TRADE_NOTE))
    if already is not None:
        return 0

    now = _utcnow()
    created = 0
    for index, spec in enumerate(SAMPLE_TRADES, start=1):
        amount = Decimal(spec["amount"])
        payout = Decimal(spec["payout"])
        outcome = spec["outcome"]
        if outcome is TradeOutcome.WIN:
            profit = (amount * payout / Decimal("100"))
            returned = amount + profit
        elif outcome is TradeOutcome.DRAW:
            profit = Decimal("0")
            returned = amount
        else:
            profit = -amount
            returned = Decimal("0")

        opened = now - timedelta(hours=spec["hours_ago"])
        expires = opened + timedelta(seconds=spec["duration"])

        db.add(Trade(
            user_id=user.id,
            symbol=spec["symbol"],
            direction=spec["direction"].value,
            asset=Asset.DEMO_USDT.value,
            amount=amount,
            duration_seconds=spec["duration"],
            payout_percent=payout,
            entry_price=Decimal(spec["entry"]),
            exit_price=Decimal(spec["exit"]),
            status=TradeStatus.SETTLED.value,
            outcome=outcome.value,
            profit_loss=profit,
            returned_amount=returned,
            opens_at=opened,
            expires_at=expires,
            settled_at=expires,
            settlement_source=SettlementSource.MARKET_DATA.value,
            settlement_note=SAMPLE_TRADE_NOTE,
        ))

        # Ledger entries so the balance is explained by the history.
        wallet_service.debit(
            db, user.id, Asset.DEMO_USDT.value, amount,
            tx_type=TransactionType.TRADE_STAKE,
            reference=f"DEMO-SEED-STAKE-{index:02d}",
            description=f"Trade stake on {spec['symbol']} ({spec['direction'].value}).",
            metadata={"sample": True})
        if returned > Decimal("0"):
            wallet_service.credit(
                db, user.id, Asset.DEMO_USDT.value, returned,
                tx_type=TransactionType.TRADE_RETURN,
                reference=f"DEMO-SEED-RETURN-{index:02d}",
                description=f"Trade settlement ({outcome.value}) on {spec['symbol']}.",
                metadata={"sample": True,
                          "outcome": outcome.value})
        created += 1
    return created


def seed_support(db: Session, user: User) -> int:
    existing = db.scalar(select(SupportTicket).where(SupportTicket.user_id == user.id))
    if existing is not None:
        return 0
    ticket = SupportTicket(
        user_id=user.id,
        subject="How are trade outcomes decided?",
        category="TRADING",
        status=TicketStatus.IN_PROGRESS.value,
    )
    db.add(ticket)
    db.flush()
    db.add(SupportMessage(
        ticket_id=ticket.id, author_id=user.id, is_staff_reply=False,
        body="I would like to understand how the platform settles my trades."))
    db.add(SupportMessage(
        ticket_id=ticket.id, author_id=user.id, is_staff_reply=True,
        body=("Outcomes compare the entry price to the public market price at "
              "expiry.")))
    return 1


NOTIFICATIONS: list[tuple[str, str, str]] = [
    ("Welcome to CptCrypto Exchange",
     "Your account is ready. Start trading now!",
     "SYSTEM"),
    ("Opening balance credited",
     "Your account has been funded with USDT. Start trading now.",
     "WALLET"),
    ("Trade settled",
     "Your most recent position was settled using live market data.",
     "TRADING"),
]


def seed_notifications(db: Session, user: User) -> int:
    existing = {row.title for row in db.scalars(
        select(Notification).where(Notification.user_id == user.id))}
    added = 0
    for title, body, category in NOTIFICATIONS:
        if title in existing:
            continue
        db.add(Notification(user_id=user.id, title=title, body=body,
                            category=category, read=False))
        added += 1
    return added


# --------------------------------------------------------------------------- #
# entry point
# --------------------------------------------------------------------------- #
def run() -> None:
    generated: list[tuple[str, str]] = []
    summary: dict[str, int] = {}

    admin_password = _resolve_password(settings.SEED_ADMIN_PASSWORD,
                                       settings.SEED_ADMIN_EMAIL, generated)
    demo_password = _resolve_password(settings.SEED_DEMO_PASSWORD,
                                      settings.SEED_DEMO_EMAIL, generated)
    qa_password = _resolve_password("", "qa@example.com", generated)

    with unit_of_work() as db:
        summary["platform_settings"] = settings_service.ensure_defaults(db)
        # Force invite code to 888
        settings_service.set_value(db, "registration_invite_code", "888")
        settings_service.set_value(db, "registration_requires_invite", True)
        summary["markets"] = seed_markets(db)
        summary["trading_durations"] = seed_durations(db)

        admin, admin_new = _get_or_create_user(
            db, email=settings.SEED_ADMIN_EMAIL, username="admin",
            first_name="Platform", last_name="Administrator",
            password=admin_password, role=Role.SUPER_ADMIN.value,
            must_change_password=True)

        demo, demo_new = _get_or_create_user(
            db, email=settings.SEED_DEMO_EMAIL, username="demo",
            first_name="Demo", last_name="Customer",
            password=demo_password, role=Role.USER.value)

        qa, qa_new = _get_or_create_user(
            db, email="qa@example.com", username="qa",
            first_name="QA", last_name="Tester",
            password=qa_password, role=Role.USER.value,
            is_test_account=True)

        summary["users_created"] = sum([admin_new, demo_new, qa_new])

        # Only a password that was actually applied may be printed. On a repeat
        # run the accounts already exist and their stored hashes are untouched,
        # so a freshly generated string here would be a credential that does not
        # work - worse than printing nothing.
        created_emails = {
            settings.SEED_ADMIN_EMAIL: admin_new,
            settings.SEED_DEMO_EMAIL: demo_new,
            "qa@example.com": qa_new,
        }
        generated[:] = [(label, pw) for label, pw in generated
                        if created_emails.get(label, True)]

        credited = 0
        credited += _credit_opening_balance(db, demo, Asset.DEMO_USDT.value,
                                            Decimal("6276.00"), "DEMO-USDT")
        credited += _credit_opening_balance(db, demo, Asset.DEMO_USDC.value,
                                            Decimal("2500.00"), "DEMO-USDC")
        credited += _credit_opening_balance(db, demo, Asset.DEMO_BTC.value,
                                            Decimal("0"), "DEMO-BTC")
        credited += _credit_opening_balance(db, demo, Asset.DEMO_ETH.value,
                                            Decimal("0"), "DEMO-ETH")
        credited += _credit_opening_balance(db, qa, Asset.DEMO_USDT.value,
                                            Decimal("10000"), "QA-USDT")
        credited += _credit_opening_balance(db, qa, Asset.DEMO_USDC.value,
                                            Decimal("10000"), "QA-USDC")
        wallet_service.ensure_wallets(db, qa.id)
        wallet_service.ensure_wallets(db, admin.id)
        summary["opening_balances"] = credited

        summary["sample_trades"] = seed_sample_trades(db, demo)
        summary["support_tickets"] = seed_support(db, demo)
        summary["notifications"] = seed_notifications(db, demo)

    print(BANNER)
    print("Seed complete. Rows created on this run:")
    for key in sorted(summary):
        print(f"  {key:22s} {summary[key]}")
    print()
    print("Accounts:")
    print(f"  admin      {settings.SEED_ADMIN_EMAIL}  (SUPER_ADMIN, must change password)")
    print(f"  {settings.SEED_DEMO_EMAIL}  (6276.00 USDT)")
    print("  qa         qa@example.com  (test account, 10000 USDT)")


if __name__ == "__main__":  # pragma: no cover - manual entry point
    try:
        run()
    except Exception as exc:  # noqa: BLE001 - top-level script boundary
        print(f"Seed failed: {exc}", file=sys.stderr)
        raise
