"""Trade engine tests.

The most important property under test is fairness: an outcome is a function of
the recorded entry price and the observed exit price, and of nothing else — not
the customer, not their balance, not an administrator's preference.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from app.core.errors import (
    InsufficientBalanceError, NotFoundError, ValidationError,
)
from app.db.models import (
    Asset, SettlementSource, TradeDirection, TradeOutcome, TradeStatus,
    TradeTestScenario,
)
from app.db.models import TransactionType
from app.services import trade_engine, wallet_service

USDT = Asset.DEMO_USDT.value
UP = TradeDirection.UP.value
DOWN = TradeDirection.DOWN.value


class TestCalculateOutcome:
    @pytest.mark.parametrize(
        "direction,entry,exit_price,expected",
        [
            (UP, "100", "101", TradeOutcome.WIN),
            (UP, "100", "99", TradeOutcome.LOSS),
            (DOWN, "100", "99", TradeOutcome.WIN),
            (DOWN, "100", "101", TradeOutcome.LOSS),
            (UP, "100", "100", TradeOutcome.DRAW),
            (DOWN, "100", "100", TradeOutcome.DRAW),
        ],
    )
    def test_outcome_follows_only_the_price_movement(
        self, direction, entry, exit_price, expected,
    ):
        result = trade_engine.calculate_outcome(direction, Decimal(entry),
                                                Decimal(exit_price))
        assert str(result) == str(expected)

    def test_the_smallest_movement_still_decides(self):
        assert str(trade_engine.calculate_outcome(
            UP, Decimal("100.000000000001"), Decimal("100.000000000002"),
        )) == str(TradeOutcome.WIN)


class TestCalculateSettlement:
    def test_a_win_returns_stake_plus_payout(self):
        profit, returned = trade_engine.calculate_settlement(
            Decimal("100"), Decimal("15"), TradeOutcome.WIN)
        assert profit == Decimal("15.00000000")
        assert returned == Decimal("115.00000000")

    def test_a_loss_returns_nothing_and_records_the_full_stake(self):
        profit, returned = trade_engine.calculate_settlement(
            Decimal("100"), Decimal("15"), TradeOutcome.LOSS)
        assert profit == Decimal("-100.00000000")
        assert returned == Decimal("0E-8")

    def test_a_draw_returns_the_stake_with_no_profit(self):
        profit, returned = trade_engine.calculate_settlement(
            Decimal("100"), Decimal("15"), TradeOutcome.DRAW)
        assert profit == Decimal("0E-8")
        assert returned == Decimal("100.00000000")

    def test_payout_uses_decimal_arithmetic(self):
        profit, returned = trade_engine.calculate_settlement(
            Decimal("33.33"), Decimal("15"), TradeOutcome.WIN)
        assert isinstance(profit, Decimal)
        assert profit == Decimal("4.99950000")
        assert returned == Decimal("38.32950000")

    @pytest.mark.parametrize("payout", ["20", "25", "35", "45", "60", "70", "90"])
    def test_every_configured_payout_tier_is_consistent(self, payout):
        stake = Decimal("100")
        profit, returned = trade_engine.calculate_settlement(
            stake, Decimal(payout), TradeOutcome.WIN)
        assert returned == stake + profit


@pytest.mark.asyncio
class TestOpenTrade:
    async def test_opening_locks_the_stake_rather_than_spending_it(self, seeded, demo_user):
        trade = await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                              Decimal("100"), 60)
        seeded.commit()

        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("900.00000000")
        assert wallet.locked == Decimal("100.00000000")
        assert trade.status == TradeStatus.OPEN.value
        assert trade.entry_price == Decimal("78600.000000000000")

    async def test_expiry_is_the_configured_duration_after_opening(self, seeded, demo_user):
        trade = await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                              Decimal("100"), 60)
        assert (trade.expires_at - trade.opens_at).total_seconds() == pytest.approx(60, abs=1)

    async def test_stake_beyond_balance_is_refused(self, seeded, demo_user):
        with pytest.raises(InsufficientBalanceError):
            await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                          Decimal("9000"), 60)

    async def test_unknown_market_is_refused(self, seeded, demo_user):
        with pytest.raises((NotFoundError, ValidationError)):
            await trade_engine.open_trade(seeded, demo_user, "DOGE/USDT", UP,
                                          Decimal("100"), 60)

    async def test_unconfigured_duration_is_refused(self, seeded, demo_user):
        with pytest.raises((NotFoundError, ValidationError)):
            await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                          Decimal("100"), 47)

    async def test_stake_below_the_configured_minimum_is_refused(self, seeded, demo_user):
        with pytest.raises(ValidationError):
            await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                          Decimal("1"), 60)


@pytest.mark.asyncio
class TestSettlement:
    async def _open_and_expire(self, seeded, user, direction=UP, amount="100"):
        trade = await trade_engine.open_trade(seeded, user, "BTC/USDT", direction,
                                              Decimal(amount), 60)
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        return trade

    async def test_a_winning_position_pays_the_stake_back_plus_profit(
        self, seeded, demo_user, provider,
    ):
        trade = await self._open_and_expire(seeded, demo_user, UP)
        provider.prices["BTCUSDT"] = Decimal("79000")

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        assert trade.outcome == TradeOutcome.WIN.value
        assert trade.status == TradeStatus.SETTLED.value
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.locked == Decimal("0E-8")
        # 900 remaining + 100 stake + 25% payout
        assert wallet.available == Decimal("1025.00000000")

    async def test_a_losing_position_returns_nothing(self, seeded, demo_user, provider):
        trade = await self._open_and_expire(seeded, demo_user, UP)
        provider.prices["BTCUSDT"] = Decimal("78000")

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        assert trade.outcome == TradeOutcome.LOSS.value
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("900.00000000")
        assert wallet.locked == Decimal("0E-8")

    async def test_an_unchanged_price_draws_and_returns_the_stake(
        self, seeded, demo_user, provider,
    ):
        trade = await self._open_and_expire(seeded, demo_user, UP)
        # Price is left exactly as it was at entry.

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        assert trade.outcome == TradeOutcome.DRAW.value
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")

    async def test_settlement_records_where_the_exit_price_came_from(
        self, seeded, demo_user, provider,
    ):
        trade = await self._open_and_expire(seeded, demo_user, UP)
        provider.prices["BTCUSDT"] = Decimal("79000")
        await trade_engine.settle_trade(seeded, trade)
        assert trade.settlement_source == SettlementSource.MARKET_DATA.value

    async def test_settlement_is_idempotent(self, seeded, demo_user, provider):
        trade = await self._open_and_expire(seeded, demo_user, UP)
        provider.prices["BTCUSDT"] = Decimal("79000")

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()
        balance_after_first = wallet_service.get_wallet(seeded, demo_user.id, USDT).available

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()
        assert wallet_service.get_wallet(seeded, demo_user.id, USDT).available == \
            balance_after_first

    async def test_missing_market_data_voids_rather_than_inventing_a_price(
        self, seeded, demo_user, provider,
    ):
        trade = await self._open_and_expire(seeded, demo_user, UP)
        provider.available = False

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        assert trade.status == TradeStatus.VOIDED.value
        assert trade.exit_price is None
        # The stake comes back in full.
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")
        assert wallet.locked == Decimal("0E-8")

    async def test_due_trades_are_swept(self, seeded, demo_user, provider):
        await self._open_and_expire(seeded, demo_user, UP)
        await self._open_and_expire(seeded, demo_user, DOWN)
        provider.prices["BTCUSDT"] = Decimal("79000")

        settled = await trade_engine.settle_due_trades(seeded)
        seeded.commit()
        assert settled == 2

    async def test_a_trade_that_has_not_expired_is_left_alone(
        self, seeded, demo_user, provider,
    ):
        trade = await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                              Decimal("100"), 60)
        seeded.commit()
        assert await trade_engine.settle_due_trades(seeded) == 0
        assert trade.status == TradeStatus.OPEN.value


@pytest.mark.asyncio
class TestTestScenarioIsolation:
    """A scripted outcome must never reach an ordinary customer."""

    async def test_scenario_applies_on_a_designated_test_account(
        self, seeded, user_factory, admin_user, provider,
    ):
        qa_user = user_factory(email="qa@example.com", username="qauser",
                               is_test_account=True)
        seeded.add(TradeTestScenario(target_user_id=qa_user.id,
                                     forced_outcome=TradeOutcome.WIN.value,
                                     label="QA win path", created_by=admin_user.id))
        seeded.commit()

        trade = await trade_engine.open_trade(seeded, qa_user, "BTC/USDT", UP,
                                              Decimal("100"), 60)
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        # Price moves against the position; the scenario should still force a win.
        provider.prices["BTCUSDT"] = Decimal("70000")

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        assert trade.outcome == TradeOutcome.WIN.value
        assert trade.settlement_source == SettlementSource.ADMIN_TEST_SCENARIO.value
        # The override is disclosed, not hidden.
        assert trade.settlement_note

    async def test_scenario_is_ignored_on_an_ordinary_account(
        self, seeded, demo_user, admin_user, provider,
    ):
        seeded.add(TradeTestScenario(target_user_id=demo_user.id,
                                     forced_outcome=TradeOutcome.WIN.value,
                                     label="Should never apply",
                                     created_by=admin_user.id))
        seeded.commit()

        trade = await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                              Decimal("100"), 60)
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        provider.prices["BTCUSDT"] = Decimal("70000")  # position loses on the market

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        # The market decided, not the scenario.
        assert trade.outcome == TradeOutcome.LOSS.value
        assert trade.settlement_source == SettlementSource.MARKET_DATA.value


@pytest.mark.asyncio
class TestStakeAsset:
    """A trade may be staked in either simulated stablecoin."""

    async def test_defaults_to_demo_usdt(self, seeded, demo_user):
        trade = await trade_engine.open_trade(seeded, demo_user, "BTC/USDT", UP,
                                              Decimal("100"), 60)
        assert trade.asset == Asset.DEMO_USDT.value

    async def test_can_be_staked_in_demo_usdc(self, seeded, demo_user):
        wallet_service.credit(seeded, demo_user.id, Asset.DEMO_USDC.value,
                              Decimal("500"), tx_type=TransactionType.ADMIN_CREDIT)
        seeded.commit()

        trade = await trade_engine.open_trade(
            seeded, demo_user, "BTC/USDT", UP, Decimal("100"), 60,
            stake_asset=Asset.DEMO_USDC.value)
        seeded.commit()

        assert trade.asset == Asset.DEMO_USDC.value
        usdc = wallet_service.get_wallet(seeded, demo_user.id, Asset.DEMO_USDC.value)
        assert usdc.available == Decimal("400.00000000")
        assert usdc.locked == Decimal("100.00000000")
        # The USDT wallet is untouched.
        usdt = wallet_service.get_wallet(seeded, demo_user.id, Asset.DEMO_USDT.value)
        assert usdt.locked == Decimal("0E-8")

    async def test_a_usdc_win_returns_into_the_usdc_wallet(self, seeded, demo_user,
                                                           provider):
        wallet_service.credit(seeded, demo_user.id, Asset.DEMO_USDC.value,
                              Decimal("500"), tx_type=TransactionType.ADMIN_CREDIT)
        seeded.commit()

        trade = await trade_engine.open_trade(
            seeded, demo_user, "BTC/USDT", UP, Decimal("100"), 60,
            stake_asset=Asset.DEMO_USDC.value)
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        provider.prices["BTCUSDT"] = Decimal("79000")

        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

        assert trade.outcome == TradeOutcome.WIN.value
        usdc = wallet_service.get_wallet(seeded, demo_user.id, Asset.DEMO_USDC.value)
        assert usdc.available == Decimal("525.00000000")   # 400 + 100 + 25%

    async def test_an_unsupported_stake_asset_is_refused(self, seeded, demo_user):
        with pytest.raises(ValidationError):
            await trade_engine.open_trade(
                seeded, demo_user, "BTC/USDT", UP, Decimal("100"), 60,
                stake_asset=Asset.DEMO_BTC.value)

    async def test_the_stake_asset_does_not_change_the_outcome(self, seeded, demo_user,
                                                               provider):
        """Same market move, same result, whichever stablecoin funds it."""
        wallet_service.credit(seeded, demo_user.id, Asset.DEMO_USDC.value,
                              Decimal("500"), tx_type=TransactionType.ADMIN_CREDIT)
        seeded.commit()

        outcomes = []
        for asset in (Asset.DEMO_USDT.value, Asset.DEMO_USDC.value):
            # Reset to the same entry price so both runs see the identical move.
            provider.prices["BTCUSDT"] = Decimal("78600")
            trade = await trade_engine.open_trade(
                seeded, demo_user, "BTC/USDT", UP, Decimal("100"), 60,
                stake_asset=asset)
            trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
            seeded.commit()
            provider.prices["BTCUSDT"] = Decimal("79000")
            await trade_engine.settle_trade(seeded, trade)
            seeded.commit()
            outcomes.append(trade.outcome)

        assert outcomes[0] == outcomes[1] == TradeOutcome.WIN.value


@pytest.mark.asyncio
class TestForcedOutcomeOnRunningTrade:
    """Pressing WIN/LOSS must decide the trade that is on screen right now."""

    async def _open(self, seeded, user, direction=UP):
        trade = await trade_engine.open_trade(seeded, user, "BTC/USDT", direction,
                                              Decimal("100"), 60)
        seeded.commit()
        return trade

    async def _expire_and_settle(self, seeded, trade):
        trade.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        seeded.commit()
        await trade_engine.settle_trade(seeded, trade)
        seeded.commit()

    async def test_win_pinned_to_the_open_trade_wins(self, seeded, user_factory, provider):
        user = user_factory(email="pin1@example.com", username="pin1",
                            is_test_account=True)
        trade = await self._open(seeded, user, UP)
        provider.prices["BTCUSDT"] = Decimal("70000")   # market says LOSS

        trade.forced_outcome = "WIN"
        await self._expire_and_settle(seeded, trade)

        assert trade.outcome == TradeOutcome.WIN.value
        assert trade.settlement_source == SettlementSource.ADMIN_TEST_SCENARIO.value

    async def test_loss_pinned_to_the_open_trade_loses(self, seeded, user_factory,
                                                      provider):
        user = user_factory(email="pin2@example.com", username="pin2",
                            is_test_account=True)
        trade = await self._open(seeded, user, UP)
        provider.prices["BTCUSDT"] = Decimal("90000")   # market says WIN

        trade.forced_outcome = "LOSS"
        await self._expire_and_settle(seeded, trade)

        assert trade.outcome == TradeOutcome.LOSS.value

    async def test_a_pinned_outcome_beats_anything_queued(self, seeded, user_factory,
                                                          admin_user, provider):
        """No off-by-one: the pin wins even with a stale scenario in the queue."""
        user = user_factory(email="pin3@example.com", username="pin3",
                            is_test_account=True)
        seeded.add(TradeTestScenario(target_user_id=user.id, forced_outcome="DRAW",
                                     label="stale", created_by=admin_user.id))
        seeded.commit()

        trade = await self._open(seeded, user, UP)
        trade.forced_outcome = "WIN"
        await self._expire_and_settle(seeded, trade)

        assert trade.outcome == TradeOutcome.WIN.value

    async def test_a_pin_is_ignored_on_an_ordinary_customer(self, seeded, demo_user,
                                                            provider):
        """The test-account guard still holds for the per-trade path."""
        trade = await self._open(seeded, demo_user, UP)
        provider.prices["BTCUSDT"] = Decimal("70000")   # market says LOSS

        trade.forced_outcome = "WIN"
        await self._expire_and_settle(seeded, trade)

        assert trade.outcome == TradeOutcome.LOSS.value
        assert trade.settlement_source == SettlementSource.MARKET_DATA.value
