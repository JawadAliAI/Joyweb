from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.models.enums import Role, UserStatus

if TYPE_CHECKING:
    from app.db.models.wallet import Wallet


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String(80), nullable=False)
    last_name: Mapped[str] = mapped_column(String(80), nullable=False, default="")

    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    # Separate PIN for demo money movements. Hashed, never stored in the clear.
    fund_password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[str] = mapped_column(String(20), default=Role.USER.value, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=UserStatus.ACTIVE.value,
                                        nullable=False, index=True)
    credit_score: Mapped[int] = mapped_column(Integer, default=70, nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Test accounts are the ONLY accounts an admin may run scripted trade
    # scenarios against. Real demo customers always get rule-based settlement.
    is_test_account: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret: Mapped[str | None] = mapped_column(String(64), nullable=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Reseller hierarchy. `agent_id` is the agent this member was signed up
    # under, set when the invite that created the account was issued by an
    # agent. `agent_parent_id` is an agent's own upline. Both are nullable:
    # accounts created before the agent tier, and members signed up directly by
    # an administrator, simply belong to nobody.
    agent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                 index=True, nullable=True)
    agent_parent_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                        index=True, nullable=True)

    freeze_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    frozen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    frozen_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                  nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),
                                                           nullable=True)

    wallets: Mapped[list["Wallet"]] = relationship(back_populates="user",
                                                   cascade="all, delete-orphan")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def is_admin(self) -> bool:
        return self.role in (Role.ADMIN.value, Role.SUPER_ADMIN.value)

    @property
    def is_agent(self) -> bool:
        return self.role == Role.AGENT.value

    @property
    def is_frozen(self) -> bool:
        return self.status in (UserStatus.FROZEN.value, UserStatus.SUSPENDED.value)


class PasswordResetToken(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "password_reset_tokens"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    # Only the SHA-256 digest is stored; the raw token exists solely in the link.
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CreditScoreHistory(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "credit_score_history"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    old_score: Mapped[int] = mapped_column(Integer, nullable=False)
    new_score: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    changed_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                   nullable=True)


class AccountRestriction(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "account_restrictions"

    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"),
                                         index=True, nullable=False)
    restriction: Mapped[str] = mapped_column(String(40), nullable=False)  # FREEZE / SUSPEND
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    applied_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                   nullable=True)
    lifted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lifted_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                  nullable=True)
