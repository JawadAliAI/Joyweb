from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, JSON, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.models.enums import TransactionStatus
from app.db.models.wallet import MONEY


class Transaction(UUIDMixin, TimestampMixin, Base):
    """Immutable ledger entry for a balance movement."""

    __tablename__ = "transactions"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    fee: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=TransactionStatus.COMPLETED.value,
                                        nullable=False, index=True)
    # Human-readable simulation reference. Deliberately NOT shaped like a
    # blockchain transaction hash, so it can never be mistaken for one.
    reference: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    meta: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)


class Deposit(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "deposits"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=TransactionStatus.PENDING.value,
                                        nullable=False)
    reference: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # A display-only placeholder string. Not a wallet on any chain.
    simulated_address: Mapped[str] = mapped_column(String(120), nullable=False)
    transaction_id: Mapped[str | None] = mapped_column(String(36),
                                                       ForeignKey("transactions.id"),
                                                       nullable=True)


class Withdrawal(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "withdrawals"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    network: Mapped[str] = mapped_column(String(40), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    fee: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"), nullable=False)
    net_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    # Free-text destination captured for realism. Never submitted anywhere.
    destination_address: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    reference: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                    nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)


class Transfer(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "transfers"

    sender_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                           index=True, nullable=False)
    recipient_id: Mapped[str] = mapped_column(String(36),
                                              ForeignKey("users.id", ondelete="CASCADE"),
                                              index=True, nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reference: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)


class Conversion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "conversions"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    from_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    to_asset: Mapped[str] = mapped_column(String(20), nullable=False)
    from_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    to_amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(30, 12), nullable=False)
    reference: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
