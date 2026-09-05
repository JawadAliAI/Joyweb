"""Market listing, ticker and chart routes.

Charts and prices shown here are informational. They are sourced live from a
public market-data provider; the platform stores no prices of its own and never
invents one. If the provider is unreachable the rows are still returned with
every price field `null` and `dataAvailable: false`, so the UI can say "Market
data unavailable" instead of showing a stale or fabricated number.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user_optional, require_user
from app.core.errors import NotFoundError, UpstreamUnavailableError, ValidationError
from app.db.models import FavoriteMarket, Market, User
from app.db.session import get_db
from app.schemas.common import ok
from app.schemas.market import CandleOut, MarketOut, TickerOut
from app.services import market_data

router = APIRouter()

UNAVAILABLE_MESSAGE = "Market data unavailable."


def normalise_symbol(symbol: str) -> str:
    """Accept both "BTC/USDT" and the URL-safe "BTC-USDT" form."""
    return (symbol or "").strip().upper().replace("-", "/")


def _load_market(db: Session, symbol: str) -> Market:
    market = db.scalar(select(Market).where(
        Market.symbol == normalise_symbol(symbol), Market.is_enabled.is_(True)))
    if market is None:
        raise NotFoundError("That market is not available.", code="MARKET_NOT_FOUND")
    return market


def _favorite_symbols(db: Session, user: User | None) -> set[str]:
    if user is None:
        return set()
    return set(db.scalars(select(FavoriteMarket.symbol).where(
        FavoriteMarket.user_id == user.id)))


def _market_row(market: Market, ticker, is_favorite: bool) -> dict:
    return MarketOut(
        symbol=market.symbol,
        display_name=market.display_name,
        base_asset=market.base_asset,
        quote_asset=market.quote_asset,
        price_decimals=market.price_decimals,
        is_tradable=market.is_tradable,
        is_favorite=is_favorite,
        price=str(ticker.price) if ticker else None,
        change24h=str(ticker.change24h) if ticker else None,
        high24h=str(ticker.high24h) if ticker else None,
        low24h=str(ticker.low24h) if ticker else None,
        volume24h=str(ticker.volume24h) if ticker else None,
    ).model_dump(by_alias=True)


async def _tickers_for(markets: list[Market]) -> tuple[dict, bool]:
    """Fetch tickers, degrading to "no data" rather than failing the request."""
    if not markets:
        return {}, True
    try:
        provider = market_data.get_provider()
        return await provider.get_tickers([m.provider_symbol for m in markets]), True
    except UpstreamUnavailableError:
        return {}, False


@router.get("", summary="List tradable demo markets")
async def list_markets(request: Request,
                       quote: str | None = Query(None, description="Quote asset tab, e.g. USDT"),
                       favorites: bool = Query(False, description="Only my favourites"),
                       search: str | None = Query(None, max_length=40),
                       db: Session = Depends(get_db)) -> dict:
    """Enabled markets with live ticker data merged in.

    Returns 200 even when the market-data provider is down; in that case every
    price field is null and `dataAvailable` is false.
    """
    user = get_current_user_optional(request, db)
    favorite_symbols = _favorite_symbols(db, user)

    stmt = select(Market).where(Market.is_enabled.is_(True))
    if quote:
        stmt = stmt.where(Market.quote_asset == quote.strip().upper())
    stmt = stmt.order_by(Market.sort_order, Market.symbol)
    markets = list(db.scalars(stmt))

    if search:
        needle = search.strip().upper()
        markets = [m for m in markets
                   if needle in m.symbol.upper() or needle in m.display_name.upper()]
    if favorites:
        markets = [m for m in markets if m.symbol in favorite_symbols]

    tickers, available = await _tickers_for(markets)
    items = [_market_row(m, tickers.get(m.provider_symbol),
                         m.symbol in favorite_symbols) for m in markets]

    payload: dict = {"items": items, "dataAvailable": available}
    if not available:
        payload["message"] = UNAVAILABLE_MESSAGE
    return ok(payload)


@router.get("/ticker", summary="Compact price ticker for the home screen")
async def ticker(symbols: str | None = Query(None,
                                             description="Comma-separated symbols"),
                 db: Session = Depends(get_db)) -> dict:
    """Symbol, price, 24h change and volume for the scrolling home ticker."""
    stmt = select(Market).where(Market.is_enabled.is_(True))
    if symbols:
        wanted = [normalise_symbol(s) for s in symbols.split(",") if s.strip()]
        if wanted:
            stmt = stmt.where(Market.symbol.in_(wanted))
    markets = list(db.scalars(stmt.order_by(Market.sort_order, Market.symbol)))

    tickers, available = await _tickers_for(markets)
    items = []
    for market in markets:
        row = tickers.get(market.provider_symbol)
        items.append(TickerOut(
            symbol=market.symbol,
            price=str(row.price) if row else None,
            change24h=str(row.change24h) if row else None,
            volume24h=str(row.volume24h) if row else None,
            timestamp=row.timestamp if row else None,
        ).model_dump(by_alias=True))

    payload: dict = {"items": items, "dataAvailable": available}
    if not available:
        payload["message"] = UNAVAILABLE_MESSAGE
    return ok(payload)


@router.get("/{symbol:path}/candles", summary="OHLCV candles for a market")
async def market_candles(symbol: str,
                         interval: str = Query("1h"),
                         limit: int = Query(200, ge=1, le=1000),
                         db: Session = Depends(get_db)) -> dict:
    """Chart data for Lightweight Charts. Informational only, from a public feed."""
    market = _load_market(db, symbol)
    if interval not in market_data.VALID_INTERVALS:
        raise ValidationError(
            "Unsupported interval. Choose one of: "
            + ", ".join(market_data.VALID_INTERVALS),
            code="INVALID_INTERVAL")
    try:
        candles = await market_data.get_provider().get_candles(
            market.provider_symbol, interval, limit)
    except UpstreamUnavailableError:
        return ok({"symbol": market.symbol, "interval": interval, "candles": [],
                   "dataAvailable": False, "message": UNAVAILABLE_MESSAGE})

    items = [CandleOut(**candle.to_dict()).model_dump(by_alias=True)
             for candle in candles]
    return ok({"symbol": market.symbol, "interval": interval, "candles": items,
               "dataAvailable": True})


@router.post("/{symbol:path}/favorite", summary="Add a market to my favourites")
def add_favorite(symbol: str, user: User = Depends(require_user),
                 db: Session = Depends(get_db)) -> dict:
    """Idempotent: favouriting an already-favourited market is a no-op."""
    market = _load_market(db, symbol)
    existing = db.scalar(select(FavoriteMarket).where(
        FavoriteMarket.user_id == user.id, FavoriteMarket.symbol == market.symbol))
    if existing is None:
        db.add(FavoriteMarket(user_id=user.id, symbol=market.symbol))
        db.commit()
    return ok({"symbol": market.symbol, "isFavorite": True})


@router.delete("/{symbol:path}/favorite", summary="Remove a market from my favourites")
def remove_favorite(symbol: str, user: User = Depends(require_user),
                    db: Session = Depends(get_db)) -> dict:
    """Idempotent: removing a market that is not favourited is a no-op."""
    market = _load_market(db, symbol)
    existing = db.scalar(select(FavoriteMarket).where(
        FavoriteMarket.user_id == user.id, FavoriteMarket.symbol == market.symbol))
    if existing is not None:
        db.delete(existing)
        db.commit()
    return ok({"symbol": market.symbol, "isFavorite": False})


@router.get("/{symbol:path}", summary="One market with its live ticker")
async def market_detail(symbol: str, request: Request,
                        db: Session = Depends(get_db)) -> dict:
    """Detail for a single pair. Accepts "BTC/USDT" or "BTC-USDT"."""
    market = _load_market(db, symbol)
    user = get_current_user_optional(request, db)
    favorite_symbols = _favorite_symbols(db, user)

    try:
        row = await market_data.get_provider().get_ticker(market.provider_symbol)
        available = True
    except UpstreamUnavailableError:
        row, available = None, False

    payload = {"market": _market_row(market, row, market.symbol in favorite_symbols),
               "dataAvailable": available}
    if not available:
        payload["message"] = UNAVAILABLE_MESSAGE
    return ok(payload)
