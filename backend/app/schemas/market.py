"""Market, ticker and candle schemas.

Prices are read from a public market-data provider and rendered as strings so no
float rounding reaches the client. When the provider is unreachable every price
field is `null` — the platform never invents a price.
"""
from __future__ import annotations

from app.schemas.common import CamelModel


class MarketOut(CamelModel):
    """One tradable simulated pair, optionally merged with live ticker data."""

    symbol: str
    display_name: str
    base_asset: str
    quote_asset: str
    price_decimals: int
    is_tradable: bool
    is_favorite: bool = False
    price: str | None = None
    change24h: str | None = None
    high24h: str | None = None
    low24h: str | None = None
    volume24h: str | None = None


class TickerOut(CamelModel):
    """Compact home-screen ticker row."""

    symbol: str
    price: str | None = None
    change24h: str | None = None
    volume24h: str | None = None
    timestamp: int | None = None


class CandleOut(CamelModel):
    """One OHLCV bar, shaped for TradingView Lightweight Charts."""

    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float
