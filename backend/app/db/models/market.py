from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class Market(UUIDMixin, TimestampMixin, Base):
    """A tradable simulated pair.

    Prices are never stored here: they are read live from the configured
    market-data provider, so the platform never invents a price.
    """

    __tablename__ = "markets"

    symbol: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    base_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    quote_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    # Symbol handed to the external provider, e.g. "BTCUSDT".
    provider_symbol: Mapped[str] = mapped_column(String(30), nullable=False)
    display_name: Mapped[str] = mapped_column(String(40), nullable=False)
    price_decimals: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_tradable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)


class FavoriteMarket(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "favorite_markets"

    user_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False)


class TradingDuration(UUIDMixin, TimestampMixin, Base):
    """Admin-configured duration/payout pairs offered on the trade screen."""

    __tablename__ = "trading_durations"

    seconds: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    label: Mapped[str] = mapped_column(String(30), nullable=False)
    payout_percent: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)
    min_amount: Mapped[Decimal] = mapped_column(Numeric(30, 10), nullable=False)
    max_amount: Mapped[Decimal] = mapped_column(Numeric(30, 10), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
