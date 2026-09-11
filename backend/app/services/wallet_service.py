"""Simulated wallet ledger.

Every balance change goes through this module. The rules it enforces:

* Balances are `Decimal`, quantised to `SCALE`. No float ever touches money.
* A wallet row is locked (`SELECT ... FOR UPDATE`) before it is read-modified-written,
  so two concurrent requests cannot both spend the same balance.
* A balance can never go negative, and a debit that would overdraw raises instead.
* Every movement writes a `Transaction` row, so the ledger explains the balance.

Callers open the transaction (`unit_of_work` or the request-scoped session) and
commit; nothing here commits on its own, which keeps multi-step operations such
as a transfer atomic.
"""
from __future__ import annotations

import secrets
from decimal import ROUND_DOWN, Decimal
from typing import Any, Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InsufficientBalanceError, ValidationError
from app.db.models import (
    Asset, Transaction, TransactionStatus, TransactionType, User, Wallet,
)
from app.db.session import SUPPORTS_ROW_LOCKING

SCALE = Decimal("0.00000001")          # 8 dp, matching typical crypto precision
DISPLAY_SCALE = Decimal("0.01")
ZERO = Decimal("0")

SUPPORTED_ASSETS: tuple[str, ...] = tuple(a.value for a in Asset)

# Simulated stablecoins. Each is valued at 1 unit of the display currency, so
# no market lookup is needed (and none is invented) to price them.
STABLE_ASSETS: frozenset[str] = frozenset(
    {Asset.DEMO_USDT.value, Asset.DEMO_USDC.value})

# How each asset is presented to customers. The internal codes keep their
# DEMO_ prefix (it maps to the wallet rows); the display labels do not.
ASSET_META: dict[str, dict[str, Any]] = {
    Asset.DEMO_USDT.value: {"label": "USDT", "decimals": 2,
                            "market": None, "icon": "usdt"},
    Asset.DEMO_USDC.value: {"label": "USDC", "decimals": 2,
                            "market": None, "icon": "usdc"},
    Asset.DEMO_BTC.value: {"label": "BTC", "decimals": 8,
                           "market": "BTC/USDT", "icon": "btc"},
    Asset.DEMO_ETH.value: {"label": "ETH", "decimals": 6,
                           "market": "ETH/USDT", "icon": "eth"},
}


def quantize(amount: Decimal | str | int | float) -> Decimal:
    """Normalise any incoming amount to the ledger's precision, rounding down.

    Rounding down means a rounding error can never create value out of nothing.
    """
    return Decimal(str(amount)).quantize(SCALE, rounding=ROUND_DOWN)


def new_reference(prefix: str) -> str:
    """A simulation reference.

    Deliberately prefixed and short so it cannot be mistaken for a blockchain
    transaction hash.
    """
    return f"TXN-{prefix}-{secrets.token_hex(6).upper()}"


def validate_asset(asset: str) -> str:
    if asset not in SUPPORTED_ASSETS:
        raise ValidationError(f"Unsupported asset: {asset}", code="UNSUPPORTED_ASSET")
    return asset


def validate_amount(amount: Decimal | str, *, field: str = "amount") -> Decimal:
    try:
        value = quantize(amount)
    except (ArithmeticError, ValueError) as exc:
        raise ValidationError(f"{field} is not a valid number.") from exc
    if value <= ZERO:
        raise ValidationError(f"{field} must be greater than zero.",
                              code="INVALID_AMOUNT")
    return value


def get_wallet(db: Session, user_id: str, asset: str, *, for_update: bool = False) -> Wallet:
    """Fetch (creating if absent) a wallet row, optionally locking it."""
    validate_asset(asset)
    stmt = select(Wallet).where(Wallet.user_id == user_id, Wallet.asset == asset)
    if for_update and SUPPORTS_ROW_LOCKING:
        stmt = stmt.with_for_update()
    wallet = db.scalar(stmt)
    if wallet is None:
        wallet = Wallet(user_id=user_id, asset=asset, available=ZERO, locked=ZERO)
        db.add(wallet)
        db.flush()
    return wallet


def ensure_wallets(db: Session, user_id: str,
                   assets: Iterable[str] = SUPPORTED_ASSETS) -> list[Wallet]:
    return [get_wallet(db, user_id, asset) for asset in assets]


def list_wallets(db: Session, user_id: str) -> list[Wallet]:
    ensure_wallets(db, user_id)
    return list(db.scalars(
        select(Wallet).where(Wallet.user_id == user_id).order_by(Wallet.asset)))


def _record(db: Session, *, user_id: str, tx_type: TransactionType, asset: str,
            amount: Decimal, fee: Decimal, status: TransactionStatus,
            reference: str, description: str | None,
            metadata: dict[str, Any] | None) -> Transaction:
    transaction = Transaction(
        user_id=user_id, type=tx_type.value, asset=asset, amount=amount, fee=fee,
        status=status.value, reference=reference, description=description,
        meta=metadata,
    )
    db.add(transaction)
    db.flush()
    return transaction


def credit(db: Session, user_id: str, asset: str, amount: Decimal, *,
           tx_type: TransactionType, description: str | None = None,
           reference: str | None = None, fee: Decimal = ZERO,
           metadata: dict[str, Any] | None = None,
           status: TransactionStatus = TransactionStatus.COMPLETED) -> Transaction:
    """Add simulated funds and write the matching ledger entry."""
    amount = validate_amount(amount)
    wallet = get_wallet(db, user_id, asset, for_update=True)
    wallet.available = quantize(wallet.available + amount)
    return _record(db, user_id=user_id, tx_type=tx_type, asset=asset, amount=amount,
                   fee=quantize(fee), status=status,
                   reference=reference or new_reference("CR"),
                   description=description, metadata=metadata)


def debit(db: Session, user_id: str, asset: str, amount: Decimal, *,
          tx_type: TransactionType, description: str | None = None,
          reference: str | None = None, fee: Decimal = ZERO,
          metadata: dict[str, Any] | None = None,
          status: TransactionStatus = TransactionStatus.COMPLETED) -> Transaction:
    """Remove simulated funds, refusing to overdraw."""
    amount = validate_amount(amount)
    wallet = get_wallet(db, user_id, asset, for_update=True)
    if wallet.available < amount:
        raise InsufficientBalanceError()
    wallet.available = quantize(wallet.available - amount)
    return _record(db, user_id=user_id, tx_type=tx_type, asset=asset,
                   amount=-amount, fee=quantize(fee), status=status,
                   reference=reference or new_reference("DR"),
                   description=description, metadata=metadata)


def lock_funds(db: Session, user_id: str, asset: str, amount: Decimal) -> Wallet:
    """Move funds from available to locked (open trade / pending withdrawal)."""
    amount = validate_amount(amount)
    wallet = get_wallet(db, user_id, asset, for_update=True)
    if wallet.available < amount:
        raise InsufficientBalanceError()
    wallet.available = quantize(wallet.available - amount)
    wallet.locked = quantize(wallet.locked + amount)
    return wallet


def release_locked(db: Session, user_id: str, asset: str, amount: Decimal,
                   *, back_to_available: bool) -> Wallet:
    """Consume locked funds.

    `back_to_available=True` returns them to the user (cancelled withdrawal, void
    trade); `False` retires them (settled withdrawal, lost stake).
    """
    amount = validate_amount(amount)
    wallet = get_wallet(db, user_id, asset, for_update=True)
    if wallet.locked < amount:
        raise ValidationError("Locked balance is lower than the amount to release.",
                              code="INVALID_LOCKED_RELEASE")
    wallet.locked = quantize(wallet.locked - amount)
    if back_to_available:
        wallet.available = quantize(wallet.available + amount)
    return wallet


def transfer_between_users(db: Session, sender: User, recipient: User, asset: str,
                           amount: Decimal, *, note: str | None = None) -> tuple[
                               Transaction, Transaction, str]:
    """Move simulated funds between two demo accounts atomically.

    Wallets are locked in a stable order (by user id) so two mirrored transfers
    running at once cannot deadlock.
    """
    amount = validate_amount(amount)
    validate_asset(asset)
    if sender.id == recipient.id:
        raise ValidationError("You cannot transfer to your own account.",
                              code="SELF_TRANSFER")

    first, second = sorted([sender.id, recipient.id])
    get_wallet(db, first, asset, for_update=True)
    get_wallet(db, second, asset, for_update=True)

    reference = new_reference("TRF")
    out_tx = debit(db, sender.id, asset, amount,
                   tx_type=TransactionType.DEMO_TRANSFER_OUT,
                   reference=f"{reference}-OUT",
                   description=f"Demo transfer to {recipient.username}",
                   metadata={"counterparty": recipient.username, "note": note})
    in_tx = credit(db, recipient.id, asset, amount,
                   tx_type=TransactionType.DEMO_TRANSFER_IN,
                   reference=f"{reference}-IN",
                   description=f"Demo transfer from {sender.username}",
                   metadata={"counterparty": sender.username, "note": note})
    return out_tx, in_tx, reference


def portfolio_value(wallets: Iterable[Wallet], prices: dict[str, Decimal]) -> Decimal:
    """Total estimated value in the quote asset (DEMO USDT).

    `prices` maps asset -> unit price. A missing price contributes nothing rather
    than being guessed at.
    """
    total = ZERO
    for wallet in wallets:
        if wallet.asset in STABLE_ASSETS:
            total += wallet.total
        else:
            price = prices.get(wallet.asset)
            if price is not None:
                total += wallet.total * price
    return total.quantize(DISPLAY_SCALE, rounding=ROUND_DOWN)
