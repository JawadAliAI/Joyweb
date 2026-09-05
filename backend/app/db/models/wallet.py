from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.db.models.user import User

# All monetary columns use NUMERIC. Floating point is never used for balances.
MONEY = Numeric(30, 10)


class Wallet(UUIDMixin, TimestampMixin, Base):
    """One simulated balance row per (user, demo asset).

    `available` is spendable; `locked` is reserved by an open demo trade or a
    pending demo withdrawal. Neither represents custody of real cryptocurrency.
    """

    __tablename__ = "wallets"
    __table_args__ = (UniqueConstraint("user_id", "asset", name="uq_wallet_user_asset"),)

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    asset: Mapped[str] = mapped_column(String(20), nullable=False)
    available: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"), nullable=False)
    locked: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0"), nullable=False)

    user: Mapped["User"] = relationship(back_populates="wallets")

    @property
    def total(self) -> Decimal:
        return self.available + self.locked
