"""Request / response schemas for simulated trading.

Money and price fields cross the wire as strings so no client ever reintroduces
floating-point error into a demo balance.
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import Field, field_serializer, field_validator

from app.schemas.common import CamelModel


class TradeCreate(CamelModel):
    """Open one simulated fixed-duration position."""

    symbol: str = Field(..., max_length=20, examples=["BTC/USDT"])
    direction: Literal["UP", "DOWN"]
    amount: Decimal = Field(..., gt=0, description="Demo stake amount.")
    duration_seconds: int = Field(..., gt=0, le=86400,
                                  description="Must match an offered duration.")
    stake_asset: str | None = Field(
        None, max_length=20,
        description="Which simulated stablecoin funds the stake: DEMO_USDT "
                    "(default) or DEMO_USDC. It never affects the outcome.")

    @field_validator("amount", mode="before")
    @classmethod
    def _coerce_amount(cls, value: Any) -> Any:
        """Accept "10.5" as readily as 10.5, and never route money via float."""
        if isinstance(value, float):
            return Decimal(str(value))
        if isinstance(value, str):
            return Decimal(value.strip())
        return value

    @field_validator("symbol")
    @classmethod
    def _normalise_symbol(cls, value: str) -> str:
        return value.strip().upper()


class TradeOut(CamelModel):
    """A simulated position, including exactly how it was (or will be) settled."""

    id: str
    symbol: str
    direction: str
    asset: str
    amount: Decimal
    duration_seconds: int
    payout_percent: Decimal
    entry_price: Decimal
    exit_price: Decimal | None = None
    status: str
    outcome: str | None = None
    profit_loss: Decimal | None = None
    returned_amount: Decimal | None = None
    opens_at: datetime
    expires_at: datetime
    settled_at: datetime | None = None
    settlement_source: str | None = None
    settlement_note: str | None = None
    seconds_remaining: int = 0
    created_at: datetime

    @field_serializer("amount", "payout_percent", "entry_price", "exit_price",
                      "profit_loss", "returned_amount", when_used="always")
    def _money_as_string(self, value: Decimal | None) -> str | None:
        """Never emit a float for money or a price."""
        return None if value is None else format(Decimal(value), "f")

    @classmethod
    def from_trade(cls, trade: Any, *, seconds_remaining: int = 0) -> "TradeOut":
        """Build from a `Trade` row, filling the computed countdown."""
        model = cls.model_validate(trade)
        model.seconds_remaining = seconds_remaining
        return model


class MarketSummaryOut(CamelModel):
    """One enabled, tradable market as shown on the trade screen."""

    symbol: str
    display_name: str
    base_asset: str
    quote_asset: str
    price_decimals: int


class DurationOut(CamelModel):
    """An offered duration and its publicly advertised payout."""

    seconds: int
    label: str
    payout_percent: str
    min_amount: str
    max_amount: str


class StakeAssetOut(CamelModel):
    """A simulated stablecoin a position may be staked in."""

    asset: str
    label: str
    decimals: int


class TradeConfigOut(CamelModel):
    """Everything the trade screen needs, disclosure included."""

    markets: list[MarketSummaryOut]
    stake_assets: list[StakeAssetOut]
    durations: list[DurationOut]
    quick_amounts: list[str]
    min_amount: str
    max_amount: str
    stake_asset: str
    default_duration_seconds: int
    disclosure: str
    demo_notice: str
