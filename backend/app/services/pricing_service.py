"""Unit prices for the simulated assets, in DEMO USDT.

Prices come from the configured public market-data provider. The platform never
invents a price: if the upstream is unavailable the snapshot comes back with
`available=False` and only DEMO_USDT priced, and callers must tell the user that
estimated values are unavailable rather than guessing.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import UpstreamUnavailableError
from app.core.logging import logger
from app.db.models import Asset, Market
from app.services import market_data, wallet_service

QUOTE_ASSET = Asset.DEMO_USDT.value
PRICES_UNAVAILABLE_MESSAGE = (
    "Live market data is unavailable, so estimated values cannot be shown "
    "right now."
)


@dataclass(frozen=True)
class PriceSnapshot:
    """A point-in-time view of asset prices."""

    prices: dict[str, Decimal] = field(default_factory=dict)
    available: bool = True
    message: str | None = None

    def get(self, asset: str) -> Decimal | None:
        return self.prices.get(asset)


def _market_symbols(db: Session) -> dict[str, str]:
    """asset -> provider symbol, for every asset that has a market pair."""
    wanted = {
        asset: meta["market"]
        for asset, meta in wallet_service.ASSET_META.items()
        if meta.get("market")
    }
    if not wanted:
        return {}
    rows = db.scalars(select(Market).where(Market.symbol.in_(set(wanted.values()))))
    by_symbol = {row.symbol: row.provider_symbol for row in rows}
    return {asset: by_symbol[symbol]
            for asset, symbol in wanted.items() if symbol in by_symbol}


async def asset_prices(db: Session) -> PriceSnapshot:
    """Unit price of each demo asset in DEMO USDT.

    DEMO_USDT is always exactly 1. Any asset the provider does not return is
    simply absent from the snapshot — a missing price contributes nothing to a
    portfolio total instead of being estimated.
    """
    prices: dict[str, Decimal] = {QUOTE_ASSET: Decimal("1")}
    symbols = _market_symbols(db)
    if not symbols:
        return PriceSnapshot(prices=prices, available=True)

    try:
        tickers = await market_data.get_provider().get_tickers(
            sorted(set(symbols.values())))
    except UpstreamUnavailableError as exc:
        logger.warning("asset_prices_unavailable error=%s", exc)
        return PriceSnapshot(prices={QUOTE_ASSET: Decimal("1")}, available=False,
                             message=PRICES_UNAVAILABLE_MESSAGE)

    for asset, provider_symbol in symbols.items():
        ticker = tickers.get(provider_symbol)
        if ticker is not None:
            prices[asset] = Decimal(str(ticker.price))
    return PriceSnapshot(prices=prices, available=True)


async def price_of(db: Session, asset: str) -> Decimal | None:
    snapshot = await asset_prices(db)
    return snapshot.get(asset)
