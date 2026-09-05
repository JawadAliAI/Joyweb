"""Request/response schemas for the simulated wallet and money movement.

Money crosses the wire as a string, never a float, so precision survives the
round trip. Every label keeps the DEMO prefix so a balance in this system can
never be mistaken for a real holding.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.schemas.common import CamelModel

# --------------------------------------------------------------------------- #
# Assets / portfolio
# --------------------------------------------------------------------------- #


class AssetOut(CamelModel):
    """Metadata for one supported simulated asset."""

    asset: str
    label: str
    decimals: int
    icon: str | None = None
    market: str | None = None


class WalletOut(CamelModel):
    """One simulated balance row."""

    asset: str
    label: str
    available: str
    locked: str
    total: str
    estimated_value: str | None = None
    decimals: int


class PortfolioOut(CamelModel):
    """The caller's whole simulated portfolio."""

    total_estimated_value: str
    display_currency: str
    prices_available: bool
    assets: list[WalletOut]
    demo_label: str
    message: str | None = None


class TransactionOut(CamelModel):
    """A single ledger entry describing a simulated balance movement."""

    id: str
    type: str
    asset: str
    amount: str
    fee: str
    status: str
    reference: str
    description: str | None = None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Deposits
# --------------------------------------------------------------------------- #


class DepositCreate(CamelModel):
    asset: str
    amount: Decimal = Field(..., gt=0)


class DepositOut(CamelModel):
    id: str
    asset: str
    amount: str
    status: str
    reference: str
    simulated_address: str
    created_at: datetime
    message: str | None = None


# --------------------------------------------------------------------------- #
# Withdrawals
# --------------------------------------------------------------------------- #


class WithdrawalNetworkOut(CamelModel):
    id: str
    asset: str
    network: str
    label: str
    available_balance: str


class WithdrawalOptionsOut(CamelModel):
    enabled: bool
    networks: list[WithdrawalNetworkOut]
    min_amount: str
    max_amount: str
    fee_flat: str
    fee_percent: str
    fund_password_set: bool
    demo_label: str
    message: str | None = None
    notice: str | None = None


class WithdrawalCreate(CamelModel):
    network_id: str
    amount: Decimal = Field(..., gt=0)
    address: str = Field(..., min_length=8, max_length=200)
    fund_password: str = Field(..., min_length=1, max_length=128)


class WithdrawalQuote(CamelModel):
    asset: str
    network: str
    amount: str
    fee: str
    net_amount: str
    fee_flat: str
    fee_percent: str


class WithdrawalOut(CamelModel):
    id: str
    asset: str
    network: str
    amount: str
    fee: str
    net_amount: str
    destination_address: str
    status: str
    reference: str
    created_at: datetime
    # What the administrator wrote when approving or rejecting. Shown to the
    # customer on their withdrawal history, not just in a notification.
    review_note: str | None = None
    reviewed_at: datetime | None = None
    message: str | None = None


# --------------------------------------------------------------------------- #
# Transfers
# --------------------------------------------------------------------------- #


class TransferCreate(CamelModel):
    recipient: str = Field(..., min_length=1, max_length=255,
                           description="Recipient username or email address.")
    asset: str
    amount: Decimal = Field(..., gt=0)
    fund_password: str = Field(..., min_length=1, max_length=128)
    note: str | None = Field(None, max_length=200)


class TransferOut(CamelModel):
    id: str
    direction: str            # SENT or RECEIVED, from the caller's point of view
    counterparty: str
    asset: str
    amount: str
    note: str | None = None
    reference: str
    created_at: datetime
    message: str | None = None


# --------------------------------------------------------------------------- #
# Conversions
# --------------------------------------------------------------------------- #


class ConvertQuoteIn(CamelModel):
    from_asset: str
    to_asset: str
    amount: Decimal = Field(..., gt=0)


class ConvertQuoteOut(CamelModel):
    from_asset: str
    to_asset: str
    amount: str
    rate: str
    estimated_receive: str
    fee_percent: str
    demo_label: str
    message: str | None = None


class ConvertCreate(CamelModel):
    from_asset: str
    to_asset: str
    amount: Decimal = Field(..., gt=0)


class ConversionOut(CamelModel):
    id: str
    from_asset: str
    to_asset: str
    from_amount: str
    to_amount: str
    rate: str
    reference: str
    created_at: datetime
    message: str | None = None
