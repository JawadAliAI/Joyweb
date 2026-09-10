"""Integration tests for simulated money movement.

Together these walk the customer journey end to end: deposit, trade, transfer,
convert and withdraw — checking both that the happy path works and that the
guard rails hold.
"""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.db.models import Asset, UserStatus
from app.services import settings_service, wallet_service
from tests.conftest import login

USDT = Asset.DEMO_USDT.value


def balance(db, user_id: str, asset: str = USDT) -> Decimal:
    return wallet_service.get_wallet(db, user_id, asset).available


class TestDeposit:
    def test_a_simulated_deposit_credits_the_wallet(self, client, seeded, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/deposits/demo",
                               json={"asset": USDT, "amount": "500"})
        assert response.status_code in (200, 201), response.text

        seeded.expire_all()
        assert balance(seeded, demo_user.id) == Decimal("1500.00000000")

    def test_the_reference_is_obviously_a_simulation(self, client, seeded, demo_user):
        login(client, demo_user.email)
        data = client.post("/api/deposits/demo",
                           json={"asset": USDT, "amount": "100"}).json()["data"]
        assert data["reference"].startswith("DEMO-")
        # Nothing here may look like a real chain address or hash.
        assert "DEMO" in data.get("simulatedAddress", "DEMO")

    def test_a_zero_deposit_is_refused(self, client, demo_user):
        login(client, demo_user.email)
        assert client.post("/api/deposits/demo",
                           json={"asset": USDT, "amount": "0"}).status_code == 422

    def test_an_unknown_asset_is_refused(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/deposits/demo", json={"asset": "BTC", "amount": "10"})
        assert response.status_code >= 400

    def test_deposits_can_be_switched_off_by_an_administrator(
        self, client, seeded, demo_user,
    ):
        settings_service.set_value(seeded, "deposits_enabled", False)
        seeded.commit()
        login(client, demo_user.email)

        response = client.post("/api/deposits/demo", json={"asset": USDT, "amount": "10"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FEATURE_DISABLED"


class TestWithdrawal:
    def test_options_list_the_configured_simulated_networks(self, client, demo_user):
        login(client, demo_user.email)
        data = client.get("/api/withdrawals/options").json()["data"]
        assert data["enabled"] is True
        labels = {network["label"] for network in data["networks"]}
        assert any("DEMO USDT" in label for label in labels)

    def test_a_withdrawal_locks_funds_and_awaits_review(self, client, seeded, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "500",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code in (200, 201), response.text

        seeded.expire_all()
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        # Funds are reserved, not yet spent.
        assert wallet.available == Decimal("500.00000000")
        assert wallet.locked == Decimal("500.00000000")

    def test_the_fee_is_deducted_from_the_amount_received(self, client, demo_user):
        login(client, demo_user.email)
        data = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "500",
            "address": "DemoAddress1234567890",
            "fundPassword": "Fund1234"}).json()["data"]
        assert Decimal(data["fee"]) == Decimal("5")
        assert Decimal(data["netAmount"]) == Decimal("495")

    def test_a_wrong_fund_password_is_refused(self, client, seeded, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "WrongPassword"})
        assert response.status_code >= 400
        assert response.json()["error"]["code"] == "INVALID_FUND_PASSWORD"
        seeded.expire_all()
        assert balance(seeded, demo_user.id) == Decimal("1000.00000000")

    def test_a_user_without_a_fund_password_is_told_to_set_one(
        self, client, user_factory,
    ):
        user = user_factory(email="nofund@example.com", username="nofund")
        login(client, user.email)
        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "anything"})
        assert response.json()["error"]["code"] == "FUND_PASSWORD_NOT_SET"

    def test_withdrawing_more_than_the_balance_is_refused(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "5000",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code >= 400

    def test_below_the_configured_minimum_is_refused(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "1",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code >= 400

    def test_cancelling_returns_the_locked_funds(self, client, seeded, demo_user):
        login(client, demo_user.email)
        created = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "500",
            "address": "DemoAddress1234567890",
            "fundPassword": "Fund1234"}).json()["data"]

        cancelled = client.post(f"/api/withdrawals/{created['id']}/cancel")
        assert cancelled.status_code == 200, cancelled.text

        seeded.expire_all()
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")
        assert wallet.locked == Decimal("0E-8")

    def test_options_report_the_disabled_state_instead_of_failing(
        self, client, seeded, demo_user,
    ):
        """The UI needs to render a disabled screen, so this stays a 200."""
        settings_service.set_value(seeded, "withdrawals_enabled", False)
        seeded.commit()
        login(client, demo_user.email)

        data = client.get("/api/withdrawals/options").json()["data"]
        assert data["enabled"] is False
        assert "unavailable" in data["message"].lower()

    def test_submitting_while_disabled_is_refused(self, client, seeded, demo_user):
        settings_service.set_value(seeded, "withdrawals_enabled", False)
        seeded.commit()
        login(client, demo_user.email)

        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code == 403


class TestTransfer:
    def test_a_transfer_moves_funds_between_demo_accounts(
        self, client, seeded, demo_user, user_factory,
    ):
        recipient = user_factory(email="friend@example.com", username="friend",
                                 balance="0")
        login(client, demo_user.email)

        response = client.post("/api/transfers", json={
            "recipient": "friend", "asset": USDT, "amount": "250",
            "fundPassword": "Fund1234"})
        assert response.status_code in (200, 201), response.text

        seeded.expire_all()
        assert balance(seeded, demo_user.id) == Decimal("750.00000000")
        assert balance(seeded, recipient.id) == Decimal("250.00000000")

    def test_the_recipient_can_be_given_as_an_email(
        self, client, seeded, demo_user, user_factory,
    ):
        recipient = user_factory(email="byemail@example.com", username="byemail",
                                 balance="0")
        login(client, demo_user.email)
        response = client.post("/api/transfers", json={
            "recipient": "byemail@example.com", "asset": USDT, "amount": "100",
            "fundPassword": "Fund1234"})
        assert response.status_code in (200, 201)
        seeded.expire_all()
        assert balance(seeded, recipient.id) == Decimal("100.00000000")

    def test_an_unknown_recipient_is_refused(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/transfers", json={
            "recipient": "nobody", "asset": USDT, "amount": "10",
            "fundPassword": "Fund1234"})
        assert response.status_code >= 400

    def test_transferring_to_yourself_is_refused(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/transfers", json={
            "recipient": demo_user.username, "asset": USDT, "amount": "10",
            "fundPassword": "Fund1234"})
        assert response.status_code >= 400

    def test_transferring_more_than_the_balance_is_refused(
        self, client, seeded, demo_user, user_factory,
    ):
        user_factory(email="friend2@example.com", username="friend2", balance="0")
        login(client, demo_user.email)
        response = client.post("/api/transfers", json={
            "recipient": "friend2", "asset": USDT, "amount": "99999",
            "fundPassword": "Fund1234"})
        assert response.status_code >= 400
        seeded.expire_all()
        assert balance(seeded, demo_user.id) == Decimal("1000.00000000")


class TestConversion:
    def test_a_quote_is_priced_from_live_market_data(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post("/api/conversions/quote", json={
            "fromAsset": USDT, "toAsset": Asset.DEMO_BTC.value, "amount": "1000"})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert Decimal(data["rate"]) > 0

    def test_converting_moves_value_between_two_demo_assets(
        self, client, seeded, demo_user,
    ):
        login(client, demo_user.email)
        response = client.post("/api/conversions", json={
            "fromAsset": USDT, "toAsset": Asset.DEMO_BTC.value, "amount": "786"})
        assert response.status_code in (200, 201), response.text

        seeded.expire_all()
        assert balance(seeded, demo_user.id) == Decimal("214.00000000")
        assert balance(seeded, demo_user.id, Asset.DEMO_BTC.value) > 0

    def test_conversion_fails_loudly_when_prices_are_unavailable(
        self, client, demo_user, provider,
    ):
        """A guessed rate would be worse than an error."""
        login(client, demo_user.email)
        provider.available = False
        response = client.post("/api/conversions/quote", json={
            "fromAsset": USDT, "toAsset": Asset.DEMO_BTC.value, "amount": "100"})
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "MARKET_DATA_UNAVAILABLE"


@pytest.mark.asyncio
class TestTradeJourney:
    async def test_a_trade_can_be_opened_and_settled_through_the_api(
        self, client, seeded, demo_user, provider,
    ):
        login(client, demo_user.email)

        config = client.get("/api/trades/config").json()["data"]
        assert config["durations"], "durations must come from configuration"

        opened = client.post("/api/trades", json={
            "symbol": "BTC/USDT", "direction": "UP", "amount": "100",
            "durationSeconds": 60})
        assert opened.status_code in (200, 201), opened.text
        trade_id = opened.json()["data"]["id"]

        # Fast-forward past expiry and move the market in the position's favour.
        from datetime import datetime, timedelta, timezone

        from app.db.models import Trade

        trade = seeded.get(Trade, trade_id)
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        provider.prices["BTCUSDT"] = Decimal("79000")

        result = client.get(f"/api/trades/{trade_id}/result")
        assert result.status_code == 200, result.text
        assert result.json()["data"]["outcome"] == "WIN"

    def test_the_trade_history_is_scoped_to_the_caller(
        self, client, demo_user, user_factory,
    ):
        login(client, demo_user.email)
        body = client.get("/api/trades").json()["data"]
        assert body["items"] == []
        assert body["meta"]["total"] == 0


class TestFrozenAccount:
    """A restricted customer keeps read access but cannot move simulated funds."""

    @pytest.fixture
    def frozen_user(self, user_factory):
        return user_factory(email="frozen2@example.com", username="frozen2",
                            fund_password="Fund1234", status=UserStatus.FROZEN)

    def test_can_still_read_their_wallet(self, client, frozen_user):
        login(client, frozen_user.email)
        assert client.get("/api/wallet").status_code == 200

    def test_cannot_trade(self, client, frozen_user):
        login(client, frozen_user.email)
        response = client.post("/api/trades", json={
            "symbol": "BTC/USDT", "direction": "UP", "amount": "100",
            "durationSeconds": 60})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "ACCOUNT_RESTRICTED"

    def test_cannot_withdraw(self, client, frozen_user):
        login(client, frozen_user.email)
        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code == 403

    def test_cannot_transfer(self, client, frozen_user, user_factory):
        user_factory(email="target@example.com", username="target", balance="0")
        login(client, frozen_user.email)
        response = client.post("/api/transfers", json={
            "recipient": "target", "asset": USDT, "amount": "10",
            "fundPassword": "Fund1234"})
        assert response.status_code == 403

    def test_cannot_convert(self, client, frozen_user):
        login(client, frozen_user.email)
        response = client.post("/api/conversions", json={
            "fromAsset": USDT, "toAsset": Asset.DEMO_BTC.value, "amount": "10"})
        assert response.status_code == 403

    def test_can_still_reach_support(self, client, frozen_user):
        login(client, frozen_user.email)
        assert client.get("/api/support").status_code == 200


class TestMarkets:
    def test_markets_are_listed_with_live_prices(self, client, demo_user):
        login(client, demo_user.email)
        data = client.get("/api/markets").json()["data"]
        assert data["dataAvailable"] is True
        assert any(row["symbol"] == "BTC/USDT" for row in data["items"])

    def test_missing_market_data_is_reported_not_invented(
        self, client, demo_user, provider,
    ):
        login(client, demo_user.email)
        provider.available = False
        data = client.get("/api/markets").json()["data"]

        assert data["dataAvailable"] is False
        assert data["message"] == "Market data unavailable."
        # The rows still render, but with no price rather than a made-up one.
        assert all(row["price"] is None for row in data["items"])


class TestAdminWithdrawalMessages:
    """The administrator controls the wording customers see on withdraw."""

    def test_the_disabled_message_is_the_admin_s_own_text(self, client, seeded,
                                                          demo_user):
        settings_service.set_value(seeded, "withdrawals_enabled", False)
        settings_service.set_value(
            seeded, "withdrawals_disabled_message",
            "Withdrawals are paused for maintenance until Monday 09:00.")
        seeded.commit()
        login(client, demo_user.email)

        data = client.get("/api/withdrawals/options").json()["data"]
        assert data["enabled"] is False
        assert data["message"] == "Withdrawals are paused for maintenance until Monday 09:00."

    def test_submitting_while_disabled_returns_the_same_wording(self, client, seeded,
                                                                demo_user):
        settings_service.set_value(seeded, "withdrawals_enabled", False)
        settings_service.set_value(seeded, "withdrawals_disabled_message",
                                   "Paused for maintenance until Monday.")
        seeded.commit()
        login(client, demo_user.email)

        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code == 403
        assert response.json()["error"]["message"] == "Paused for maintenance until Monday."

    def test_pausing_requests_keeps_the_screen_open_but_refuses_a_submission(
            self, client, seeded, demo_user):
        """The screen and its networks stay available; submitting is what fails."""
        settings_service.set_value(seeded, "withdrawal_requests_paused", True)
        settings_service.set_value(
            seeded, "withdrawal_paused_message",
            "Payouts are on hold. Nothing has been deducted.")
        seeded.commit()
        login(client, demo_user.email)

        options = client.get("/api/withdrawals/options").json()["data"]
        assert options["enabled"] is True
        assert options["paused"] is True
        assert options["networks"]

        response = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        assert response.status_code == 403
        error = response.json()["error"]
        assert error["code"] == "WITHDRAWALS_PAUSED"
        assert error["message"] == "Payouts are on hold. Nothing has been deducted."

    def test_a_paused_request_locks_nothing(self, client, seeded, demo_user):
        """A refusal must leave the ledger exactly as it found it."""
        settings_service.set_value(seeded, "withdrawal_requests_paused", True)
        seeded.commit()
        login(client, demo_user.email)

        before = client.get("/api/wallet").json()["data"]
        client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "100",
            "address": "DemoAddress1234567890", "fundPassword": "Fund1234"})
        after = client.get("/api/wallet").json()["data"]
        assert after == before
        assert client.get("/api/withdrawals").json()["data"]["items"] == []

    def test_the_open_notice_is_shown_when_set(self, client, seeded, demo_user):
        settings_service.set_value(seeded, "withdrawal_notice",
                                   "Requests are reviewed within 24 hours.")
        seeded.commit()
        login(client, demo_user.email)

        data = client.get("/api/withdrawals/options").json()["data"]
        assert data["enabled"] is True
        assert data["notice"] == "Requests are reviewed within 24 hours."

    def test_a_blank_notice_is_hidden(self, client, demo_user):
        login(client, demo_user.email)
        assert client.get("/api/withdrawals/options").json()["data"]["notice"] is None

    def test_a_rejection_reason_reaches_the_customer(self, client, seeded, demo_user,
                                                     admin_user):
        """The reason an admin types on reject is what the customer is shown."""
        login(client, demo_user.email)
        created = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "500",
            "address": "DemoAddress1234567890",
            "fundPassword": "Fund1234"}).json()["data"]

        client.post("/api/auth/logout")
        client.cookies.clear()
        client.headers.pop("x-csrf-token", None)
        login(client, admin_user.email)
        client.post(f"/api/admin/withdrawals/{created['id']}/reject",
                    json={"reason": "Destination address could not be verified."})

        client.post("/api/auth/logout")
        client.cookies.clear()
        client.headers.pop("x-csrf-token", None)
        login(client, demo_user.email)

        rows = client.get("/api/withdrawals").json()["data"]["items"]
        mine = next(row for row in rows if row["id"] == created["id"])
        assert mine["status"] == "REJECTED"
        assert mine["reviewNote"] == "Destination address could not be verified."
