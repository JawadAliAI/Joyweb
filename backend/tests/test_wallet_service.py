"""Wallet ledger unit tests.

These cover the invariants that matter most: money never becomes a float, a
balance never goes negative, and no balance moves without a ledger entry.
"""
from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.core.errors import InsufficientBalanceError, ValidationError
from app.db.models import Asset, Transaction, TransactionType
from app.services import wallet_service

USDT = Asset.DEMO_USDT.value


class TestQuantize:
    def test_rounds_down_so_value_is_never_created(self):
        # Rounding up here would mint fractions out of nothing.
        assert wallet_service.quantize("1.999999999") == Decimal("1.99999999")

    def test_accepts_string_int_and_decimal(self):
        assert wallet_service.quantize("10") == Decimal("10.00000000")
        assert wallet_service.quantize(10) == Decimal("10.00000000")
        assert wallet_service.quantize(Decimal("10.5")) == Decimal("10.50000000")

    def test_result_is_always_decimal_never_float(self):
        assert isinstance(wallet_service.quantize("0.1"), Decimal)


class TestValidateAmount:
    @pytest.mark.parametrize("amount", ["0", "-1", "-0.00000001"])
    def test_rejects_zero_and_negative(self, amount):
        with pytest.raises(ValidationError):
            wallet_service.validate_amount(amount)

    def test_rejects_non_numeric(self):
        with pytest.raises(ValidationError):
            wallet_service.validate_amount("not-a-number")

    def test_accepts_positive(self):
        assert wallet_service.validate_amount("25.5") == Decimal("25.50000000")


class TestValidateAsset:
    def test_rejects_unknown_asset(self):
        with pytest.raises(ValidationError):
            wallet_service.validate_asset("BTC")

    def test_accepts_every_demo_asset(self):
        for asset in wallet_service.SUPPORTED_ASSETS:
            assert wallet_service.validate_asset(asset) == asset


class TestReferences:
    def test_reference_has_the_expected_prefix(self):
        reference = wallet_service.new_reference("WD")
        assert reference.startswith("TXN-WD-")
        # Must not resemble a 64-character blockchain transaction hash.
        assert len(reference) < 40

    def test_references_are_unique(self):
        references = {wallet_service.new_reference("TX") for _ in range(200)}
        assert len(references) == 200


class TestCreditAndDebit:
    def test_credit_increases_available_and_writes_ledger_entry(self, seeded, demo_user):
        transaction = wallet_service.credit(
            seeded, demo_user.id, USDT, Decimal("500"),
            tx_type=TransactionType.DEMO_DEPOSIT)
        seeded.commit()

        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1500.00000000")
        assert transaction.amount == Decimal("500.00000000")
        assert transaction.type == TransactionType.DEMO_DEPOSIT.value

    def test_debit_decreases_available_and_records_a_negative_amount(self, seeded, demo_user):
        transaction = wallet_service.debit(
            seeded, demo_user.id, USDT, Decimal("250"),
            tx_type=TransactionType.DEMO_WITHDRAWAL)
        seeded.commit()

        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("750.00000000")
        assert transaction.amount == Decimal("-250.00000000")

    def test_debit_beyond_balance_is_refused(self, seeded, demo_user):
        with pytest.raises(InsufficientBalanceError):
            wallet_service.debit(seeded, demo_user.id, USDT, Decimal("1000.00000001"),
                                 tx_type=TransactionType.DEMO_WITHDRAWAL)

    def test_a_refused_debit_leaves_the_balance_untouched(self, seeded, demo_user):
        with pytest.raises(InsufficientBalanceError):
            wallet_service.debit(seeded, demo_user.id, USDT, Decimal("99999"),
                                 tx_type=TransactionType.DEMO_WITHDRAWAL)
        seeded.rollback()
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")

    def test_balance_can_never_go_negative_across_repeated_debits(self, seeded, demo_user):
        for _ in range(10):
            try:
                wallet_service.debit(seeded, demo_user.id, USDT, Decimal("150"),
                                     tx_type=TransactionType.TRADE_STAKE)
            except InsufficientBalanceError:
                seeded.rollback()
                break
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available >= Decimal("0")


class TestLocking:
    def test_lock_moves_funds_from_available_to_locked(self, seeded, demo_user):
        wallet_service.lock_funds(seeded, demo_user.id, USDT, Decimal("300"))
        seeded.commit()

        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("700.00000000")
        assert wallet.locked == Decimal("300.00000000")
        # Locking reserves funds; it does not change the total.
        assert wallet.total == Decimal("1000.00000000")

    def test_cannot_lock_more_than_available(self, seeded, demo_user):
        with pytest.raises(InsufficientBalanceError):
            wallet_service.lock_funds(seeded, demo_user.id, USDT, Decimal("1001"))

    def test_release_can_return_funds_to_the_user(self, seeded, demo_user):
        wallet_service.lock_funds(seeded, demo_user.id, USDT, Decimal("300"))
        wallet_service.release_locked(seeded, demo_user.id, USDT, Decimal("300"),
                                      back_to_available=True)
        seeded.commit()

        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")
        assert wallet.locked == Decimal("0E-8")

    def test_release_can_retire_funds(self, seeded, demo_user):
        wallet_service.lock_funds(seeded, demo_user.id, USDT, Decimal("300"))
        wallet_service.release_locked(seeded, demo_user.id, USDT, Decimal("300"),
                                      back_to_available=False)
        seeded.commit()

        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("700.00000000")
        assert wallet.locked == Decimal("0E-8")

    def test_cannot_release_more_than_is_locked(self, seeded, demo_user):
        with pytest.raises(ValidationError):
            wallet_service.release_locked(seeded, demo_user.id, USDT, Decimal("1"),
                                          back_to_available=True)


class TestTransfer:
    def test_transfer_conserves_total_value(self, seeded, user_factory, demo_user):
        recipient = user_factory(email="rec@example.com", username="recipient",
                                 balance="500")
        wallet_service.transfer_between_users(seeded, demo_user, recipient, USDT,
                                              Decimal("200"))
        seeded.commit()

        sender_wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        recipient_wallet = wallet_service.get_wallet(seeded, recipient.id, USDT)
        assert sender_wallet.available == Decimal("800.00000000")
        assert recipient_wallet.available == Decimal("700.00000000")
        # Nothing was created or destroyed in the move.
        assert sender_wallet.available + recipient_wallet.available == Decimal("1500.00000000")

    def test_transfer_writes_both_sides_of_the_ledger(self, seeded, user_factory, demo_user):
        recipient = user_factory(email="rec2@example.com", username="recipient2",
                                 balance="0")
        wallet_service.transfer_between_users(seeded, demo_user, recipient, USDT,
                                              Decimal("100"))
        seeded.commit()

        out_count = seeded.scalar(select(func.count()).select_from(Transaction).where(
            Transaction.type == TransactionType.DEMO_TRANSFER_OUT.value))
        in_count = seeded.scalar(select(func.count()).select_from(Transaction).where(
            Transaction.type == TransactionType.DEMO_TRANSFER_IN.value))
        assert out_count == 1
        assert in_count == 1

    def test_self_transfer_is_refused(self, seeded, demo_user):
        with pytest.raises(ValidationError):
            wallet_service.transfer_between_users(seeded, demo_user, demo_user, USDT,
                                                  Decimal("10"))

    def test_transfer_beyond_balance_is_refused(self, seeded, user_factory, demo_user):
        recipient = user_factory(email="rec3@example.com", username="recipient3",
                                 balance="0")
        with pytest.raises(InsufficientBalanceError):
            wallet_service.transfer_between_users(seeded, demo_user, recipient, USDT,
                                                  Decimal("5000"))


class TestPortfolioValue:
    def test_values_holdings_using_supplied_prices(self, seeded, demo_user):
        wallet_service.credit(seeded, demo_user.id, Asset.DEMO_BTC.value,
                              Decimal("0.5"), tx_type=TransactionType.ADMIN_CREDIT)
        seeded.commit()

        wallets = wallet_service.list_wallets(seeded, demo_user.id)
        total = wallet_service.portfolio_value(wallets, {
            Asset.DEMO_BTC.value: Decimal("60000"),
        })
        assert total == Decimal("31000.00")

    def test_an_asset_with_no_price_contributes_nothing_rather_than_a_guess(
        self, seeded, demo_user,
    ):
        wallet_service.credit(seeded, demo_user.id, Asset.DEMO_ETH.value,
                              Decimal("2"), tx_type=TransactionType.ADMIN_CREDIT)
        seeded.commit()

        wallets = wallet_service.list_wallets(seeded, demo_user.id)
        assert wallet_service.portfolio_value(wallets, {}) == Decimal("1000.00")
