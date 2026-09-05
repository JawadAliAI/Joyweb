"""Simulated money movement: deposits, withdrawals, transfers and conversions.

NOTHING in this module touches a blockchain, a bank, a custodian or real funds.
Deposits credit make-believe balances, withdrawal addresses are captured for
realism and never submitted anywhere, and every reference string is prefixed
`DEMO-` so it cannot be mistaken for a real transaction hash.
"""
from __future__ import annotations

import re
import secrets
from decimal import ROUND_DOWN, Decimal
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import rate_limit, require_active_user, require_feature, require_user
from app.core.errors import (
    ForbiddenError, NotFoundError, UpstreamUnavailableError, ValidationError,
)
from app.core.security import verify_password
from app.db.models import (
    AuditAction, Conversion, Deposit, Transaction, TransactionStatus,
    TransactionType, Transfer, User, UserStatus, Withdrawal, WithdrawalStatus,
)
from app.db.session import get_db
from app.schemas.common import PaginationParams, money, ok, paginate
from app.schemas.wallet import (
    ConvertCreate, ConvertQuoteIn, DepositCreate, TransferCreate, WithdrawalCreate,
)
from app.services import (
    audit_service, notification_service, pricing_service, settings_service,
    wallet_service,
)

router = APIRouter()

RATE_SCALE = Decimal("0.000000000001")
ADDRESS_PATTERN = re.compile(r"^[A-Za-z0-9:_\-]{8,200}$")
DEMO_NOTE = "This is a simulated demo movement. No real funds are involved."


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _pagination(page: int, page_size: int) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size)


def _decimals(asset: str) -> int:
    return int(wallet_service.ASSET_META.get(asset, {}).get("decimals", 8))


def _require_fund_password(user: User, supplied: str) -> None:
    """Demo money movements need the separate fund password on the account."""
    if not user.fund_password_hash:
        raise ValidationError(
            "Set a fund password under Security before moving demo funds.",
            code="FUND_PASSWORD_NOT_SET")
    if not verify_password(supplied, user.fund_password_hash):
        raise ValidationError("The fund password you entered is incorrect.",
                              code="INVALID_FUND_PASSWORD")


def _simulated_address(asset: str, network: str) -> str:
    """An obviously fake placeholder string. Never a real chain address."""
    short = asset.replace("DEMO_", "")
    return f"DEMO-{short}-{network}-{secrets.token_hex(4).upper()}"


def _networks(db: Session) -> list[dict[str, Any]]:
    raw = settings_service.get(db, "withdrawal_networks") or []
    return [n for n in raw if isinstance(n, dict) and n.get("enabled")]


def _deposit_payload(deposit: Deposit, message: str | None = None) -> dict[str, Any]:
    return {
        "id": deposit.id,
        "asset": deposit.asset,
        "amount": money(deposit.amount, _decimals(deposit.asset)),
        "status": deposit.status,
        "reference": deposit.reference,
        "simulatedAddress": deposit.simulated_address,
        "createdAt": deposit.created_at,
        "message": message,
    }


def _withdrawal_payload(row: Withdrawal, message: str | None = None) -> dict[str, Any]:
    decimals = _decimals(row.asset)
    return {
        "id": row.id,
        "asset": row.asset,
        "network": row.network,
        "amount": money(row.amount, decimals),
        "fee": money(row.fee, decimals),
        "netAmount": money(row.net_amount, decimals),
        "destinationAddress": row.destination_address,
        "status": row.status,
        "reference": row.reference,
        "createdAt": row.created_at,
        # Whatever the administrator wrote when they reviewed it.
        "reviewNote": row.review_note,
        "reviewedAt": row.reviewed_at,
        "message": message,
    }


def _transfer_payload(row: Transfer, user_id: str,
                      counterparties: dict[str, str]) -> dict[str, Any]:
    sent = row.sender_id == user_id
    other = row.recipient_id if sent else row.sender_id
    return {
        "id": row.id,
        "direction": "SENT" if sent else "RECEIVED",
        "counterparty": counterparties.get(other, "unknown"),
        "asset": row.asset,
        "amount": money(row.amount, _decimals(row.asset)),
        "note": row.note,
        "reference": row.reference,
        "createdAt": row.created_at,
    }


def _conversion_payload(row: Conversion, message: str | None = None) -> dict[str, Any]:
    return {
        "id": row.id,
        "fromAsset": row.from_asset,
        "toAsset": row.to_asset,
        "fromAmount": money(row.from_amount, _decimals(row.from_asset)),
        "toAmount": money(row.to_amount, _decimals(row.to_asset)),
        "rate": money(row.rate, 12),
        "reference": row.reference,
        "createdAt": row.created_at,
        "message": message,
    }


async def _quote_conversion(db: Session, from_asset: str, to_asset: str,
                            amount: Decimal) -> dict[str, Any]:
    """Server-side conversion quote. A client-supplied rate is never trusted."""
    from_asset = wallet_service.validate_asset(from_asset.strip().upper())
    to_asset = wallet_service.validate_asset(to_asset.strip().upper())
    if from_asset == to_asset:
        raise ValidationError("Choose two different demo assets to convert between.",
                              code="SAME_ASSET")
    amount = wallet_service.validate_amount(amount)

    snapshot = await pricing_service.asset_prices(db)
    if not snapshot.available:
        raise UpstreamUnavailableError(pricing_service.PRICES_UNAVAILABLE_MESSAGE)
    source_price = snapshot.get(from_asset)
    target_price = snapshot.get(to_asset)
    if source_price is None or target_price is None or target_price <= 0:
        raise UpstreamUnavailableError(pricing_service.PRICES_UNAVAILABLE_MESSAGE)

    fee_percent = settings_service.get_decimal(db, "conversion_fee_percent")
    spread = Decimal("1") - fee_percent / Decimal("100")
    if spread < 0:
        spread = Decimal("0")
    rate = ((source_price / target_price) * spread).quantize(
        RATE_SCALE, rounding=ROUND_DOWN)
    receive = wallet_service.quantize(amount * rate)
    if receive <= 0:
        raise ValidationError(
            "That amount is too small to convert once the simulated spread is "
            "applied.", code="AMOUNT_TOO_SMALL")
    return {
        "fromAsset": from_asset,
        "toAsset": to_asset,
        "amount": money(amount, _decimals(from_asset)),
        "rate": money(rate, 12),
        "estimatedReceive": money(receive, _decimals(to_asset)),
        "feePercent": str(fee_percent),
        "_amount": amount,
        "_rate": rate,
        "_receive": receive,
    }


# --------------------------------------------------------------------------- #
# Deposits
# --------------------------------------------------------------------------- #


@router.post("/deposits/demo", summary="Create a simulated deposit")
def create_demo_deposit(
    payload: DepositCreate,
    request: Request,
    user: Annotated[User, Depends(require_active_user)],
    db: Annotated[Session, Depends(get_db)],
    _feature: Annotated[None, Depends(require_feature("deposits_enabled"))] = None,
) -> dict:
    """Top up a demo balance with simulated funds.

    No blockchain deposit takes place: the returned `simulatedAddress` is an
    obviously fake placeholder for display only. Depending on platform settings
    the balance is credited immediately or held pending administrator review.
    """
    asset = wallet_service.validate_asset(payload.asset.strip().upper())
    amount = wallet_service.validate_amount(payload.amount)
    maximum = settings_service.get_decimal(db, "demo_deposit_max")
    if maximum > 0 and amount > maximum:
        raise ValidationError(
            f"The largest single simulated deposit is {maximum}.",
            code="DEPOSIT_LIMIT_EXCEEDED")

    reference = wallet_service.new_reference("DEP")
    auto_credit = settings_service.get_bool(db, "demo_deposit_auto_credit")
    deposit = Deposit(
        user_id=user.id, asset=asset, amount=amount,
        status=(TransactionStatus.COMPLETED.value if auto_credit
                else TransactionStatus.PENDING.value),
        reference=reference,
        simulated_address=_simulated_address(asset, "DEMO"),
    )
    db.add(deposit)
    db.flush()

    if auto_credit:
        transaction = wallet_service.credit(
            db, user.id, asset, amount,
            tx_type=TransactionType.DEMO_DEPOSIT,
            reference=reference,
            description="Simulated demo deposit",
            metadata={"simulated": True, "depositId": deposit.id})
        deposit.transaction_id = transaction.id
        message = (f"{amount} {asset} in simulated funds has been credited to your "
                   "demo balance. No real deposit took place.")
    else:
        message = ("Your simulated deposit is pending administrator review. "
                   "No real deposit took place.")

    audit_service.record(db, AuditAction.DEPOSIT_CREATED, actor=user,
                         new_value={"asset": asset, "amount": str(amount),
                                    "reference": reference,
                                    "autoCredited": auto_credit},
                         request=request)
    notification_service.notify(
        db, user.id, "Simulated deposit created", message,
        notification_service.DEMO_DEPOSIT)
    db.commit()
    db.refresh(deposit)
    return ok(_deposit_payload(deposit, message))


@router.get("/deposits", summary="List simulated deposits")
def list_deposits(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, alias="pageSize")] = 20,
) -> dict:
    """Paginated history of the simulated deposits on this demo account."""
    params = _pagination(page, page_size)
    total = int(db.scalar(select(func.count()).select_from(Deposit)
                          .where(Deposit.user_id == user.id)) or 0)
    rows = db.scalars(select(Deposit).where(Deposit.user_id == user.id)
                      .order_by(Deposit.created_at.desc())
                      .limit(params.page_size).offset(params.offset))
    return ok(paginate([_deposit_payload(row) for row in rows], total, params))


# --------------------------------------------------------------------------- #
# Withdrawals
# --------------------------------------------------------------------------- #


@router.get("/withdrawals/options", summary="Demo withdrawal options and limits")
def withdrawal_options(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Networks, limits and simulated fees for the demo withdrawal screen.

    Returns 200 even when demo withdrawals are switched off, with
    `enabled: false`, so the UI can render the disabled state rather than an
    error. No withdrawal here ever leaves the simulator.
    """
    enabled = settings_service.get_bool(db, "withdrawals_enabled")
    wallets = {w.asset: w for w in wallet_service.list_wallets(db, user.id)}
    db.commit()
    networks = []
    for entry in _networks(db):
        asset = str(entry.get("asset") or "")
        wallet = wallets.get(asset)
        networks.append({
            "id": entry.get("id"),
            "asset": asset,
            "network": entry.get("network"),
            "label": entry.get("label", asset),
            "availableBalance": money(
                wallet.available if wallet else Decimal("0"), _decimals(asset)),
        })
    return ok({
        "enabled": enabled,
        "networks": networks,
        "minAmount": str(settings_service.get_decimal(db, "withdrawal_min_amount")),
        "maxAmount": str(settings_service.get_decimal(db, "withdrawal_max_amount")),
        "feeFlat": str(settings_service.get_decimal(db, "withdrawal_fee_flat")),
        "feePercent": str(settings_service.get_decimal(db, "withdrawal_fee_percent")),
        "fundPasswordSet": bool(user.fund_password_hash),
        "demoLabel": settings_service.get(db, "demo_label"),
        # Both strings are admin-editable in Settings -> Withdrawals.
        "message": (None if enabled else str(
            settings_service.get(db, "withdrawals_disabled_message")
            or "Demo withdrawals are currently unavailable.").strip()),
        "notice": str(settings_service.get(db, "withdrawal_notice") or "").strip() or None,
    })


@router.post("/withdrawals/demo", summary="Request a simulated withdrawal")
def create_demo_withdrawal(
    payload: WithdrawalCreate,
    request: Request,
    user: Annotated[User, Depends(require_active_user)],
    db: Annotated[Session, Depends(get_db)],
    _feature: Annotated[None, Depends(require_feature("withdrawals_enabled"))] = None,
    _rate: Annotated[None, Depends(rate_limit(10, 60, "withdraw"))] = None,
) -> dict:
    """Lock demo funds against a pending simulated withdrawal.

    The destination address is stored for realism only. It is never validated
    against, or submitted to, any blockchain. Funds move from available to
    locked and stay inside the simulator until an administrator reviews the
    request or you cancel it.
    """
    network = next((n for n in _networks(db) if n.get("id") == payload.network_id),
                   None)
    if network is None:
        raise ValidationError("That demo withdrawal network is not available.",
                              code="UNKNOWN_NETWORK")

    asset = wallet_service.validate_asset(str(network.get("asset")))
    amount = wallet_service.validate_amount(payload.amount)
    minimum = settings_service.get_decimal(db, "withdrawal_min_amount")
    maximum = settings_service.get_decimal(db, "withdrawal_max_amount")
    if minimum > 0 and amount < minimum:
        raise ValidationError(f"The minimum demo withdrawal is {minimum}.",
                              code="AMOUNT_BELOW_MINIMUM")
    if maximum > 0 and amount > maximum:
        raise ValidationError(f"The maximum demo withdrawal is {maximum}.",
                              code="AMOUNT_ABOVE_MAXIMUM")

    address = payload.address.strip()
    if not ADDRESS_PATTERN.match(address):
        raise ValidationError(
            "Enter a demo destination address of 8-200 letters, digits or "
            "dashes. It is only a placeholder for the simulation and is never "
            "submitted to any network.",
            code="INVALID_ADDRESS")

    _require_fund_password(user, payload.fund_password)

    fee_flat = settings_service.get_decimal(db, "withdrawal_fee_flat")
    fee_percent = settings_service.get_decimal(db, "withdrawal_fee_percent")
    fee = wallet_service.quantize(fee_flat + amount * fee_percent / Decimal("100"))
    net = wallet_service.quantize(amount - fee)
    if net <= 0:
        raise ValidationError(
            "The simulated fee is greater than or equal to the amount you "
            "entered. Increase the amount.", code="AMOUNT_BELOW_FEE")

    wallet_service.lock_funds(db, user.id, asset, amount)
    reference = wallet_service.new_reference("WDR")
    withdrawal = Withdrawal(
        user_id=user.id, asset=asset, network=str(network.get("network", "DEMO")),
        amount=amount, fee=fee, net_amount=net, destination_address=address,
        status=WithdrawalStatus.PENDING.value, reference=reference,
    )
    db.add(withdrawal)
    db.flush()

    pending_tx = Transaction(
        user_id=user.id, type=TransactionType.DEMO_WITHDRAWAL.value, asset=asset,
        amount=-amount, fee=fee, status=TransactionStatus.PENDING.value,
        reference=reference, description="Simulated demo withdrawal (pending)",
        meta={"simulated": True, "withdrawalId": withdrawal.id,
              "network": withdrawal.network},
    )
    db.add(pending_tx)
    db.flush()

    message = (f"{amount} {asset} of simulated funds is locked pending review. "
               "Nothing has been sent to any blockchain.")
    audit_service.record(db, AuditAction.WITHDRAWAL_CREATED, actor=user,
                         new_value={"asset": asset, "amount": str(amount),
                                    "fee": str(fee), "reference": reference},
                         request=request)
    notification_service.notify(
        db, user.id, "Simulated withdrawal requested", message,
        notification_service.DEMO_WITHDRAWAL)
    db.commit()
    db.refresh(withdrawal)
    return ok(_withdrawal_payload(withdrawal, message))


@router.get("/withdrawals", summary="List simulated withdrawals")
def list_withdrawals(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, alias="pageSize")] = 20,
) -> dict:
    """Paginated history of the simulated withdrawal requests on this account."""
    params = _pagination(page, page_size)
    total = int(db.scalar(select(func.count()).select_from(Withdrawal)
                          .where(Withdrawal.user_id == user.id)) or 0)
    rows = db.scalars(select(Withdrawal).where(Withdrawal.user_id == user.id)
                      .order_by(Withdrawal.created_at.desc())
                      .limit(params.page_size).offset(params.offset))
    return ok(paginate([_withdrawal_payload(row) for row in rows], total, params))


@router.post("/withdrawals/{withdrawal_id}/cancel",
             summary="Cancel a pending simulated withdrawal")
def cancel_withdrawal(
    withdrawal_id: str,
    request: Request,
    user: Annotated[User, Depends(require_active_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Cancel your own pending simulated withdrawal and unlock the demo funds."""
    withdrawal = db.get(Withdrawal, withdrawal_id)
    if withdrawal is None:
        raise NotFoundError("That simulated withdrawal could not be found.")
    if withdrawal.user_id != user.id:
        raise ForbiddenError("You can only cancel your own demo withdrawals.")
    if withdrawal.status != WithdrawalStatus.PENDING.value:
        raise ValidationError(
            "Only a pending simulated withdrawal can be cancelled.",
            code="WITHDRAWAL_NOT_PENDING")

    wallet_service.release_locked(db, user.id, withdrawal.asset, withdrawal.amount,
                                  back_to_available=True)
    withdrawal.status = WithdrawalStatus.CANCELLED.value

    transaction = db.scalar(select(Transaction).where(
        Transaction.reference == withdrawal.reference))
    if transaction is not None:
        transaction.status = TransactionStatus.CANCELLED.value

    message = (f"{withdrawal.amount} {withdrawal.asset} of simulated funds has been "
               "returned to your available demo balance.")
    audit_service.record(db, AuditAction.WITHDRAWAL_CANCELLED, actor=user,
                         new_value={"withdrawalId": withdrawal.id,
                                    "reference": withdrawal.reference},
                         request=request)
    notification_service.notify(
        db, user.id, "Simulated withdrawal cancelled", message,
        notification_service.DEMO_WITHDRAWAL)
    db.commit()
    db.refresh(withdrawal)
    return ok(_withdrawal_payload(withdrawal, message))


# --------------------------------------------------------------------------- #
# Transfers
# --------------------------------------------------------------------------- #


@router.post("/transfers", summary="Send simulated funds to another demo account")
def create_transfer(
    payload: TransferCreate,
    request: Request,
    user: Annotated[User, Depends(require_active_user)],
    db: Annotated[Session, Depends(get_db)],
    _feature: Annotated[None, Depends(require_feature("transfers_enabled"))] = None,
) -> dict:
    """Move simulated funds to another demo account on this platform.

    Both sides of the movement are internal ledger entries. Nothing leaves the
    simulator and no real value changes hands.
    """
    asset = wallet_service.validate_asset(payload.asset.strip().upper())
    amount = wallet_service.validate_amount(payload.amount)
    _require_fund_password(user, payload.fund_password)

    handle = payload.recipient.strip().lower()
    recipient = db.scalar(select(User).where(or_(
        func.lower(User.username) == handle, func.lower(User.email) == handle)))
    if recipient is None:
        raise NotFoundError("No demo account matches that username or email.",
                            code="RECIPIENT_NOT_FOUND")
    if recipient.id == user.id:
        raise ValidationError("You cannot transfer demo funds to yourself.",
                              code="SELF_TRANSFER")
    if recipient.status != UserStatus.ACTIVE.value:
        raise ValidationError(
            "That demo account cannot receive transfers at the moment.",
            code="RECIPIENT_RESTRICTED")

    _out, _in, reference = wallet_service.transfer_between_users(
        db, user, recipient, asset, amount, note=payload.note)
    transfer = Transfer(sender_id=user.id, recipient_id=recipient.id, asset=asset,
                        amount=amount, note=payload.note, reference=reference)
    db.add(transfer)
    db.flush()

    audit_service.record(db, AuditAction.TRANSFER_CREATED, actor=user,
                         new_value={"recipient": recipient.username, "asset": asset,
                                    "amount": str(amount), "reference": reference},
                         request=request)
    notification_service.notify(
        db, user.id, "Simulated transfer sent",
        f"You sent {amount} {asset} in simulated funds to {recipient.username}. "
        f"{DEMO_NOTE}", notification_service.DEMO_BALANCE)
    notification_service.notify(
        db, recipient.id, "Simulated transfer received",
        f"You received {amount} {asset} in simulated funds from {user.username}. "
        f"{DEMO_NOTE}", notification_service.DEMO_BALANCE)
    db.commit()
    db.refresh(transfer)

    payload_out = _transfer_payload(transfer, user.id,
                                    {recipient.id: recipient.username})
    payload_out["message"] = f"Simulated transfer complete. {DEMO_NOTE}"
    return ok(payload_out)


@router.get("/transfers", summary="List simulated transfers")
def list_transfers(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, alias="pageSize")] = 20,
) -> dict:
    """Paginated history of simulated transfers sent or received by this account."""
    params = _pagination(page, page_size)
    condition = or_(Transfer.sender_id == user.id, Transfer.recipient_id == user.id)
    total = int(db.scalar(select(func.count()).select_from(Transfer)
                          .where(condition)) or 0)
    rows = list(db.scalars(select(Transfer).where(condition)
                           .order_by(Transfer.created_at.desc())
                           .limit(params.page_size).offset(params.offset)))
    ids = {row.recipient_id if row.sender_id == user.id else row.sender_id
           for row in rows}
    names: dict[str, str] = {}
    if ids:
        names = {u.id: u.username
                 for u in db.scalars(select(User).where(User.id.in_(ids)))}
    return ok(paginate([_transfer_payload(row, user.id, names) for row in rows],
                       total, params))


# --------------------------------------------------------------------------- #
# Conversions
# --------------------------------------------------------------------------- #


@router.post("/conversions/quote", summary="Quote a simulated conversion")
async def quote_conversion(
    payload: ConvertQuoteIn,
    user: Annotated[User, Depends(require_active_user)],
    db: Annotated[Session, Depends(get_db)],
) -> dict:
    """Price a demo asset conversion from live public market data.

    The configured simulated spread is applied to the live rate. If market data
    is unavailable no rate is returned, because the platform never invents a
    price.
    """
    quote = await _quote_conversion(db, payload.from_asset, payload.to_asset,
                                    payload.amount)
    body = {key: value for key, value in quote.items() if not key.startswith("_")}
    body["demoLabel"] = settings_service.get(db, "demo_label")
    body["message"] = "Indicative simulated rate. No real assets are exchanged."
    return ok(body)


@router.post("/conversions", summary="Convert between demo assets")
async def create_conversion(
    payload: ConvertCreate,
    request: Request,
    user: Annotated[User, Depends(require_active_user)],
    db: Annotated[Session, Depends(get_db)],
    _feature: Annotated[None, Depends(require_feature("conversions_enabled"))] = None,
) -> dict:
    """Swap one simulated asset for another at the current server-side rate.

    The rate is always re-quoted here from live market data; a client-supplied
    rate is never accepted. Both legs are internal ledger entries, so no real
    assets are exchanged.
    """
    quote = await _quote_conversion(db, payload.from_asset, payload.to_asset,
                                    payload.amount)
    from_asset = quote["fromAsset"]
    to_asset = quote["toAsset"]
    amount = quote["_amount"]
    rate = quote["_rate"]
    receive = quote["_receive"]

    reference = wallet_service.new_reference("CNV")
    wallet_service.debit(
        db, user.id, from_asset, amount, tx_type=TransactionType.DEMO_CONVERSION,
        reference=f"{reference}-OUT",
        description=f"Simulated conversion to {to_asset}",
        metadata={"simulated": True, "toAsset": to_asset, "rate": str(rate)})
    wallet_service.credit(
        db, user.id, to_asset, receive, tx_type=TransactionType.DEMO_CONVERSION,
        reference=f"{reference}-IN",
        description=f"Simulated conversion from {from_asset}",
        metadata={"simulated": True, "fromAsset": from_asset, "rate": str(rate)})

    conversion = Conversion(user_id=user.id, from_asset=from_asset,
                            to_asset=to_asset, from_amount=amount,
                            to_amount=receive, rate=rate, reference=reference)
    db.add(conversion)
    db.flush()

    message = (f"Converted {amount} {from_asset} into {receive} {to_asset} in "
               f"simulated funds. {DEMO_NOTE}")
    audit_service.record(db, AuditAction.CONVERSION_CREATED, actor=user,
                         new_value={"fromAsset": from_asset, "toAsset": to_asset,
                                    "fromAmount": str(amount),
                                    "toAmount": str(receive), "rate": str(rate),
                                    "reference": reference},
                         request=request)
    notification_service.notify(
        db, user.id, "Simulated conversion complete", message,
        notification_service.DEMO_BALANCE)
    db.commit()
    db.refresh(conversion)
    return ok(_conversion_payload(conversion, message))
