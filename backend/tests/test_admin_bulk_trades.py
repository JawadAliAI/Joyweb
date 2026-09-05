"""Administrator bulk controls for open demo trades.

Two of these operations close positions and one queues QA scenarios. None of
them can decide an ordinary customer's outcome, and the last test in this file
exists to keep it that way: after a bulk test scenario is created, a real demo
customer's trade must still settle from ``MARKET_DATA``.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.db.models import (
    AuditLog, Trade, TradeStatus, TradeTestScenario, TransactionType,
)
from app.services import trade_engine, wallet_service
from tests.conftest import login

USDT = "DEMO_USDT"


def audit_actions(db) -> list[str]:
    return [row.action for row in db.scalars(select(AuditLog))]


def open_trade(db, user, direction="UP", amount="100", symbol="BTC/USDT"):
    """Open one position synchronously, for use from a non-async test."""
    trade = asyncio.get_event_loop().run_until_complete(
        trade_engine.open_trade(db, user, symbol, direction, Decimal(amount), 60))
    db.commit()
    return trade


@pytest.fixture
def other_user(user_factory):
    return user_factory(email="other@example.com", username="otheruser")


class TestSettleAll:
    def test_closes_open_trades_for_every_user_at_the_market_price(
        self, client, seeded, admin_user, demo_user, other_user, provider,
    ):
        up = open_trade(seeded, demo_user, "UP")
        down = open_trade(seeded, other_user, "DOWN")

        # Price rises: UP wins, DOWN loses. Nothing an admin says changes that.
        provider.prices["BTCUSDT"] = Decimal("79000")

        login(client, admin_user.email)
        response = client.post("/api/admin/trades/settle-all",
                               json={"reason": "Closing the book for maintenance"})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["settled"] == 2
        assert data["won"] == 1
        assert data["lost"] == 1
        assert data["drawn"] == 0
        assert data["voided"] == 0
        assert data["failed"] == 0
        assert data["reason"] == "Closing the book for maintenance"
        assert data["message"]

        seeded.expire_all()
        assert seeded.get(Trade, up.id).outcome == "WIN"
        assert seeded.get(Trade, down.id).outcome == "LOSS"
        assert seeded.get(Trade, up.id).settlement_source == "MARKET_DATA"

    def test_unavailable_market_data_voids_and_returns_the_stake(
        self, client, seeded, admin_user, demo_user, provider,
    ):
        trade = open_trade(seeded, demo_user, "UP")
        provider.available = False

        login(client, admin_user.email)
        data = client.post("/api/admin/trades/settle-all",
                           json={"reason": "Upstream outage"}).json()["data"]
        assert data["voided"] == 1
        assert data["settled"] == 0

        seeded.expire_all()
        assert seeded.get(Trade, trade.id).status == TradeStatus.VOIDED.value
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")

    def test_a_blank_reason_is_refused(self, client, seeded, admin_user, demo_user):
        open_trade(seeded, demo_user)
        login(client, admin_user.email)
        response = client.post("/api/admin/trades/settle-all", json={"reason": "   "})
        assert response.status_code == 422
        seeded.expire_all()
        assert seeded.scalar(select(Trade)).status == TradeStatus.OPEN.value

    def test_an_ordinary_customer_cannot_call_it(
        self, client, seeded, demo_user,
    ):
        open_trade(seeded, demo_user)
        login(client, demo_user.email)
        response = client.post("/api/admin/trades/settle-all",
                               json={"reason": "Let me out"})
        assert response.status_code == 403
        seeded.expire_all()
        assert seeded.scalar(select(Trade)).status == TradeStatus.OPEN.value

    def test_it_writes_an_audit_row(self, client, seeded, admin_user, demo_user):
        open_trade(seeded, demo_user)
        login(client, admin_user.email)
        client.post("/api/admin/trades/settle-all", json={"reason": "Maintenance"})
        seeded.expire_all()
        assert "TRADES_BULK_SETTLED" in audit_actions(seeded)
        entry = seeded.scalar(select(AuditLog).where(
            AuditLog.action == "TRADES_BULK_SETTLED"))
        assert entry.reason == "Maintenance"
        assert entry.actor_email == "admin@example.com"


class TestVoidAll:
    def test_every_stake_comes_back_in_full(
        self, client, seeded, admin_user, demo_user, other_user,
    ):
        before = Decimal(str(wallet_service.get_wallet(seeded, demo_user.id, USDT).available))
        first = open_trade(seeded, demo_user, "UP", "100")
        second = open_trade(seeded, other_user, "DOWN", "250")

        login(client, admin_user.email)
        response = client.post("/api/admin/trades/void-all",
                               json={"reason": "Scheduled maintenance window"})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["voided"] == 2
        assert Decimal(data["returnedTotal"]) == Decimal("350")
        assert isinstance(data["returnedTotal"], str)
        assert data["reason"] == "Scheduled maintenance window"

        seeded.expire_all()
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == before
        assert wallet.locked == Decimal("0E-8")

        for trade_id in (first.id, second.id):
            trade = seeded.get(Trade, trade_id)
            assert trade.status == TradeStatus.VOIDED.value
            assert trade.outcome is None
            assert trade.exit_price is None
            assert "administrator" in (trade.settlement_note or "").lower()
            assert "Scheduled maintenance window" in trade.settlement_note

    def test_a_trade_return_transaction_is_written(
        self, client, seeded, admin_user, demo_user,
    ):
        open_trade(seeded, demo_user, "UP", "100")
        login(client, admin_user.email)
        client.post("/api/admin/trades/void-all", json={"reason": "Maintenance"})
        seeded.expire_all()
        from app.db.models import Transaction

        returns = list(seeded.scalars(select(Transaction).where(
            Transaction.type == TransactionType.TRADE_RETURN.value)))
        assert len(returns) == 1
        assert returns[0].amount == Decimal("100.00000000")

    def test_a_blank_reason_is_refused(self, client, seeded, admin_user, demo_user):
        open_trade(seeded, demo_user)
        login(client, admin_user.email)
        response = client.post("/api/admin/trades/void-all", json={"reason": ""})
        assert response.status_code == 422
        seeded.expire_all()
        assert seeded.scalar(select(Trade)).status == TradeStatus.OPEN.value

    def test_an_ordinary_customer_cannot_call_it(self, client, seeded, demo_user):
        open_trade(seeded, demo_user)
        login(client, demo_user.email)
        response = client.post("/api/admin/trades/void-all",
                               json={"reason": "Give it back"})
        assert response.status_code == 403
        seeded.expire_all()
        assert seeded.scalar(select(Trade)).status == TradeStatus.OPEN.value

    def test_it_writes_an_audit_row(self, client, seeded, admin_user, demo_user):
        open_trade(seeded, demo_user)
        login(client, admin_user.email)
        client.post("/api/admin/trades/void-all", json={"reason": "Maintenance"})
        seeded.expire_all()
        entry = seeded.scalar(select(AuditLog).where(
            AuditLog.action == "TRADES_BULK_VOIDED"))
        assert entry is not None
        assert entry.reason == "Maintenance"


class TestBulkTestScenarios:
    def test_one_scenario_per_test_account_and_none_for_customers(
        self, client, seeded, admin_user, demo_user, user_factory,
    ):
        qa_one = user_factory(email="qa1@example.com", username="qaone",
                              is_test_account=True)
        qa_two = user_factory(email="qa2@example.com", username="qatwo",
                              is_test_account=True)

        login(client, admin_user.email)
        response = client.post("/api/admin/test-scenarios/bulk",
                               json={"forcedOutcome": "win",
                                     "reason": "QA regression sweep"})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["created"] == 2
        assert data["forcedOutcome"] == "WIN"
        assert {t["userId"] for t in data["targets"]} == {qa_one.id, qa_two.id}
        assert {t["email"] for t in data["targets"]} == {qa_one.email, qa_two.email}
        assert "test account" in data["message"].lower()
        assert data["reason"] == "QA regression sweep"

        scenarios = list(seeded.scalars(select(TradeTestScenario)))
        assert len(scenarios) == 2
        assert all(s.forced_outcome == "WIN" for s in scenarios)
        # Not one scenario was created for the ordinary demo customer.
        assert demo_user.id not in {s.target_user_id for s in scenarios}

    def test_no_test_accounts_gives_a_clear_message_not_an_error(
        self, client, seeded, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        response = client.post("/api/admin/test-scenarios/bulk",
                               json={"forcedOutcome": "LOSS", "reason": "Sweep"})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["created"] == 0
        assert data["targets"] == []
        assert "no accounts" in data["message"].lower()
        assert seeded.scalar(select(TradeTestScenario)) is None

    def test_a_blank_reason_is_refused(self, client, seeded, admin_user):
        login(client, admin_user.email)
        response = client.post("/api/admin/test-scenarios/bulk",
                               json={"forcedOutcome": "WIN", "reason": " "})
        assert response.status_code == 422

    def test_an_invalid_outcome_is_refused(self, client, seeded, admin_user):
        login(client, admin_user.email)
        response = client.post("/api/admin/test-scenarios/bulk",
                               json={"forcedOutcome": "JACKPOT", "reason": "Sweep"})
        assert response.status_code == 422

    def test_an_ordinary_customer_cannot_call_it(self, client, seeded, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/admin/test-scenarios/bulk",
                               json={"forcedOutcome": "WIN", "reason": "Please"})
        assert response.status_code == 403

    def test_it_writes_an_audit_row(self, client, seeded, admin_user, user_factory):
        user_factory(email="qa3@example.com", username="qathree", is_test_account=True)
        login(client, admin_user.email)
        client.post("/api/admin/test-scenarios/bulk",
                    json={"forcedOutcome": "DRAW", "reason": "QA sweep"})
        entry = seeded.scalar(select(AuditLog).where(
            AuditLog.action == "TEST_SCENARIO_BULK_CREATED"))
        assert entry is not None
        assert entry.reason == "QA sweep"
        assert entry.new_value["forcedOutcome"] == "DRAW"


class TestOrdinaryCustomersAreUnaffected:
    def test_a_customer_trade_still_settles_from_market_data_after_a_bulk_scenario(
        self, client, seeded, admin_user, demo_user, user_factory, provider,
    ):
        """The boundary: no bulk control can script a real customer's outcome."""
        user_factory(email="qa4@example.com", username="qafour", is_test_account=True)

        login(client, admin_user.email)
        created = client.post("/api/admin/test-scenarios/bulk",
                              json={"forcedOutcome": "WIN",
                                    "reason": "QA sweep"}).json()["data"]
        assert created["created"] == 1

        # The customer bets UP; the price then falls. A forced WIN would show up
        # here as a win — it must not.
        trade = open_trade(seeded, demo_user, "UP", "100")
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        provider.prices["BTCUSDT"] = Decimal("70000")

        asyncio.get_event_loop().run_until_complete(
            trade_engine.settle_trade(seeded, trade))
        seeded.commit()

        assert trade.outcome == "LOSS"
        assert trade.settlement_source == "MARKET_DATA"
        assert trade.test_scenario_id is None
