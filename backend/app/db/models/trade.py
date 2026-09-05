from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.models.enums import TradeStatus
from app.db.models.wallet import MONEY

PRICE = Numeric(30, 12)


class Trade(UUIDMixin, TimestampMixin, Base):
    """A simulated fixed-duration position.

    The outcome is decided by comparing the entry price to the exit price, both
    recorded here. `settlement_source` documents where the exit price came from,
    so any settlement is reproducible and explainable to the user.
    """

    __tablename__ = "trades"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    symbol: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    payout_percent: Mapped[Decimal] = mapped_column(Numeric(10, 4), nullable=False)

    entry_price: Mapped[Decimal] = mapped_column(PRICE, nullable=False)
    exit_price: Mapped[Decimal | None] = mapped_column(PRICE, nullable=True)

    status: Mapped[str] = mapped_column(String(20), default=TradeStatus.OPEN.value,
                                        nullable=False, index=True)
    outcome: Mapped[str | None] = mapped_column(String(10), nullable=True, index=True)
    profit_loss: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)
    returned_amount: Mapped[Decimal | None] = mapped_column(MONEY, nullable=True)

    opens_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                 index=True)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set by an administrator against THIS specific trade. Checked first at
    # settlement, so pressing the button applies to the position on screen
    # rather than to some later one.
    forced_outcome: Mapped[str | None] = mapped_column(String(10), nullable=True)

    settlement_source: Mapped[str | None] = mapped_column(String(30), nullable=True)
    settlement_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Set only for explicit admin test scenarios on test accounts.
    test_scenario_id: Mapped[str | None] = mapped_column(String(36), nullable=True)


class TradeTestScenario(UUIDMixin, TimestampMixin, Base):
    """An openly-labelled scripted outcome, permitted on test accounts only.

    This exists so QA can exercise WIN / LOSS / DRAW paths. It cannot be applied
    to a non-test account, and every use is written to the audit log.
    """

    __tablename__ = "trade_test_scenarios"

    target_user_id: Mapped[str] = mapped_column(String(36),
                                                ForeignKey("users.id", ondelete="CASCADE"),
                                                index=True, nullable=False)
    forced_outcome: Mapped[str] = mapped_column(String(10), nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    created_by: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    consumed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
