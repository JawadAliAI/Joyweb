"""Test fixtures.

Tests run against an in-memory SQLite database so the suite needs no external
services. `db/session.py` detects the driver and skips `SELECT ... FOR UPDATE`,
which SQLite does not support — the locking behaviour itself is exercised
against PostgreSQL in the integration environment.

The market-data provider is replaced with a deterministic stub, so no test ever
depends on the network or on what the real market happens to be doing.
"""
from __future__ import annotations

import os
from decimal import Decimal
from typing import Iterator

# Configure the environment before any application module reads settings.
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-not-used-anywhere-real")
# The reset-token flow is only exercisable in development, by design.
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault("DEMO_MODE", "true")
os.environ.setdefault("SEED_ADMIN_PASSWORD", "TestAdminPass123")
os.environ.setdefault("SEED_DEMO_PASSWORD", "TestDemoPass123")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.models import (
    Asset, Market, Role, TradingDuration, TransactionType, User, UserStatus,
)
from app.db.session import get_db
from app.services import market_data, settings_service, wallet_service
from app.services.market_data import Candle, MarketDataProvider, Ticker


class StubProvider(MarketDataProvider):
    """Deterministic prices, so an assertion about a trade outcome is stable."""

    name = "stub"

    def __init__(self) -> None:
        self.prices: dict[str, Decimal] = {
            "BTCUSDT": Decimal("78600.00"),
            "ETHUSDT": Decimal("2441.08"),
            "TRXUSDT": Decimal("0.3377"),
        }
        self.available = True

    def _ticker(self, symbol: str) -> Ticker:
        if not self.available:
            from app.core.errors import UpstreamUnavailableError

            raise UpstreamUnavailableError()
        price = self.prices.get(symbol, Decimal("100"))
        return Ticker(symbol=symbol, price=price, change24h=Decimal("-0.50"),
                      high24h=price * Decimal("1.02"), low24h=price * Decimal("0.98"),
                      volume24h=Decimal("1000000"), timestamp=1_700_000_000_000)

    async def get_ticker(self, provider_symbol: str) -> Ticker:
        return self._ticker(provider_symbol)

    async def get_tickers(self, provider_symbols) -> dict[str, Ticker]:
        if not self.available:
            from app.core.errors import UpstreamUnavailableError

            raise UpstreamUnavailableError()
        return {symbol: self._ticker(symbol) for symbol in provider_symbols}

    async def get_candles(self, provider_symbol: str, interval: str,
                          limit: int = 200) -> list[Candle]:
        base = self.prices.get(provider_symbol, Decimal("100"))
        return [
            Candle(time=1_700_000_000 + index * 60, open=base, high=base,
                   low=base, close=base, volume=Decimal("10"))
            for index in range(min(limit, 10))
        ]


@pytest.fixture(scope="session")
def engine():
    # StaticPool keeps one connection alive so an in-memory database survives
    # across sessions within a test.
    return create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


@pytest.fixture(autouse=True)
def _schema(engine):
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture
def db(engine) -> Iterator[Session]:
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """The limiter is a process-wide singleton keyed by client IP.

    Every test client shares one IP, so without this a test would inherit the
    request budget already spent by the previous one.
    """
    from app.api.deps import limiter

    limiter._hits.clear()
    yield
    limiter._hits.clear()


@pytest.fixture
def provider() -> StubProvider:
    stub = StubProvider()
    market_data.set_provider(stub)
    return stub


@pytest.fixture
def seeded(db: Session, provider: StubProvider) -> Session:
    """Minimum reference data every test needs: settings, markets, durations."""
    settings_service.ensure_defaults(db)

    for symbol, provider_symbol, decimals, order in (
        ("BTC/USDT", "BTCUSDT", 2, 1),
        ("ETH/USDT", "ETHUSDT", 2, 2),
        ("TRX/USDT", "TRXUSDT", 6, 3),
    ):
        base, quote = symbol.split("/")
        db.add(Market(symbol=symbol, base_asset=base, quote_asset=quote,
                      provider_symbol=provider_symbol, display_name=symbol,
                      price_decimals=decimals, is_enabled=True, is_tradable=True,
                      sort_order=order))

    for seconds, label, payout in ((30, "30 Second", "20"), (60, "60 Second", "25"),
                                   (300, "5 Minute", "60")):
        db.add(TradingDuration(seconds=seconds, label=label,
                               payout_percent=Decimal(payout),
                               min_amount=Decimal("10"), max_amount=Decimal("10000"),
                               is_enabled=True, sort_order=seconds))
    db.commit()
    return db


def make_user(db: Session, *, email: str, username: str, password: str = "TestPass12345",
              role: Role = Role.USER, balance: str = "1000",
              fund_password: str | None = None, is_test_account: bool = False,
              status: UserStatus = UserStatus.ACTIVE) -> User:
    """Create a user with a starting simulated balance recorded in the ledger."""
    user = User(
        email=email, username=username, first_name=username.title(), last_name="Tester",
        password_hash=hash_password(password), role=role.value, status=status.value,
        credit_score=70, is_test_account=is_test_account,
        fund_password_hash=hash_password(fund_password) if fund_password else None,
    )
    db.add(user)
    db.flush()
    wallet_service.ensure_wallets(db, user.id)
    if Decimal(balance) > 0:
        wallet_service.credit(db, user.id, Asset.DEMO_USDT.value, Decimal(balance),
                              tx_type=TransactionType.ADMIN_CREDIT,
                              description="Test opening balance")
    db.commit()
    return user


@pytest.fixture
def user_factory(seeded: Session):
    def _factory(**kwargs) -> User:
        return make_user(seeded, **kwargs)

    return _factory


@pytest.fixture
def demo_user(user_factory) -> User:
    return user_factory(email="demo@example.com", username="demouser",
                        fund_password="Fund1234")


@pytest.fixture
def admin_user(user_factory) -> User:
    return user_factory(email="admin@example.com", username="adminuser",
                        role=Role.SUPER_ADMIN, balance="0")


@pytest.fixture
def client(seeded: Session, provider: StubProvider) -> Iterator[TestClient]:
    """API client sharing the test's database session."""
    from app.main import app

    def _override_db() -> Iterator[Session]:
        yield seeded

    app.dependency_overrides[get_db] = _override_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def login(client: TestClient, email: str, password: str = "TestPass12345") -> None:
    """Authenticate the client and mirror the CSRF cookie into a header."""
    response = client.post("/api/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    csrf = client.cookies.get("cd_csrf")
    if csrf:
        client.headers["x-csrf-token"] = csrf
