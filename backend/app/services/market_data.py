"""Market data adapter.

The rest of the application talks only to `MarketDataProvider`. Swapping the
upstream vendor means adding one class here and changing an env var — no route,
service or component needs to know where prices come from.

Prices are always read from a real public source. When the upstream is
unreachable the provider raises `UpstreamUnavailableError`; callers surface
"Market data unavailable" rather than inventing a number.
"""
from __future__ import annotations

import asyncio
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, asdict
from decimal import Decimal
from typing import Any, Sequence

import httpx

from app.core.config import settings
from app.core.errors import UpstreamUnavailableError
from app.core.logging import logger

VALID_INTERVALS = ("1m", "5m", "15m", "1h", "4h", "1d")


@dataclass(frozen=True)
class Ticker:
    symbol: str
    price: Decimal
    change24h: Decimal
    high24h: Decimal
    low24h: Decimal
    volume24h: Decimal
    timestamp: int

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        for key in ("price", "change24h", "high24h", "low24h", "volume24h"):
            data[key] = str(data[key])
        return data


@dataclass(frozen=True)
class Candle:
    time: int          # unix seconds, as Lightweight Charts expects
    open: Decimal
    high: Decimal
    low: Decimal
    close: Decimal
    volume: Decimal

    def to_dict(self) -> dict[str, Any]:
        return {
            "time": self.time,
            "open": float(self.open),
            "high": float(self.high),
            "low": float(self.low),
            "close": float(self.close),
            "volume": float(self.volume),
        }


class MarketDataProvider(ABC):
    """Interface every upstream vendor must satisfy."""

    name: str = "abstract"

    @abstractmethod
    async def get_ticker(self, provider_symbol: str) -> Ticker: ...

    @abstractmethod
    async def get_tickers(self, provider_symbols: Sequence[str]) -> dict[str, Ticker]: ...

    @abstractmethod
    async def get_candles(self, provider_symbol: str, interval: str,
                          limit: int = 200) -> list[Candle]: ...


class _TTLCache:
    """Tiny in-process cache so a burst of page loads makes one upstream call."""

    def __init__(self, ttl_seconds: int) -> None:
        self._ttl = ttl_seconds
        self._store: dict[str, tuple[float, Any]] = {}
        self._lock = asyncio.Lock()

    async def get(self, key: str) -> Any | None:
        async with self._lock:
            hit = self._store.get(key)
            if hit and (time.monotonic() - hit[0]) < self._ttl:
                return hit[1]
            return None

    async def put(self, key: str, value: Any) -> None:
        async with self._lock:
            self._store[key] = (time.monotonic(), value)


class BinancePublicProvider(MarketDataProvider):
    """Reads Binance's public REST endpoints. No API key, no account, read-only."""

    name = "binance"

    def __init__(self, base_url: str, cache_seconds: int, *,
                 timeout: float = 6.0, max_attempts: int = 2) -> None:
        self._base_url = base_url.rstrip("/")
        self._cache = _TTLCache(cache_seconds)
        self._timeout = timeout
        self._max_attempts = max_attempts

    async def _get(self, path: str, params: dict[str, Any]) -> Any:
        """Fetch from the upstream, retrying briefly on a transient failure.

        A public endpoint occasionally times out or rate-limits. Retrying once
        or twice turns a momentary blip into a normal response instead of an
        unnecessary "market data unavailable" for the user. When every attempt
        fails we still refuse to invent a price.
        """
        last_error: Exception | None = None
        for attempt in range(1, self._max_attempts + 1):
            try:
                async with httpx.AsyncClient(timeout=self._timeout) as client:
                    response = await client.get(f"{self._base_url}{path}",
                                                params=params)
                    response.raise_for_status()
                    return response.json()
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
                # Timeout exceptions often stringify to "", so log the type too.
                logger.warning(
                    "market_data_attempt_failed path=%s attempt=%s/%s type=%s error=%r",
                    path, attempt, self._max_attempts, type(exc).__name__, str(exc))
                if attempt < self._max_attempts:
                    await asyncio.sleep(0.4 * attempt)

        logger.warning("market_data_upstream_failed path=%s type=%s",
                       path, type(last_error).__name__)
        raise UpstreamUnavailableError() from last_error

    @staticmethod
    def _to_ticker(payload: dict[str, Any]) -> Ticker:
        return Ticker(
            symbol=payload["symbol"],
            price=Decimal(payload["lastPrice"]),
            change24h=Decimal(payload["priceChangePercent"]),
            high24h=Decimal(payload["highPrice"]),
            low24h=Decimal(payload["lowPrice"]),
            volume24h=Decimal(payload["quoteVolume"]),
            timestamp=int(payload.get("closeTime", time.time() * 1000)),
        )

    async def get_ticker(self, provider_symbol: str) -> Ticker:
        cached = await self._cache.get(f"t:{provider_symbol}")
        if cached:
            return cached
        payload = await self._get("/api/v3/ticker/24hr", {"symbol": provider_symbol})
        ticker = self._to_ticker(payload)
        await self._cache.put(f"t:{provider_symbol}", ticker)
        return ticker

    async def get_tickers(self, provider_symbols: Sequence[str]) -> dict[str, Ticker]:
        if not provider_symbols:
            return {}
        key = "ts:" + ",".join(sorted(provider_symbols))
        cached = await self._cache.get(key)
        if cached:
            return cached
        symbols_param = "[" + ",".join(f'"{s}"' for s in provider_symbols) + "]"
        payload = await self._get("/api/v3/ticker/24hr", {"symbols": symbols_param})
        result = {item["symbol"]: self._to_ticker(item) for item in payload}
        await self._cache.put(key, result)
        return result

    async def get_candles(self, provider_symbol: str, interval: str,
                          limit: int = 200) -> list[Candle]:
        if interval not in VALID_INTERVALS:
            interval = "1h"
        key = f"c:{provider_symbol}:{interval}:{limit}"
        cached = await self._cache.get(key)
        if cached:
            return cached
        rows = await self._get("/api/v3/klines", {
            "symbol": provider_symbol, "interval": interval, "limit": min(limit, 1000)})
        candles = [
            Candle(time=int(row[0] // 1000), open=Decimal(row[1]), high=Decimal(row[2]),
                   low=Decimal(row[3]), close=Decimal(row[4]), volume=Decimal(row[5]))
            for row in rows
        ]
        await self._cache.put(key, candles)
        return candles


_provider: MarketDataProvider | None = None


def get_provider() -> MarketDataProvider:
    global _provider
    if _provider is None:
        _provider = BinancePublicProvider(settings.MARKET_DATA_BASE_URL,
                                          settings.MARKET_DATA_CACHE_SECONDS)
    return _provider


def set_provider(provider: MarketDataProvider) -> None:
    """Used by tests and by any future vendor swap."""
    global _provider
    _provider = provider
