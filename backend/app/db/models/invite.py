from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class Invite(UUIDMixin, TimestampMixin, Base):
    """A single-use registration invitation.

    Registration is closed by default: an account can only be created by
    presenting a code that an administrator issued. Each code admits exactly one
    account — `used_at` is set in the same transaction that creates the user, and
    the claim is guarded by a conditional UPDATE so two people racing on the same
    link cannot both get through.
    """

    __tablename__ = "invites"

    # High-entropy, URL-safe, and unique so a guess cannot land on a live code.
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    created_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                   index=True, nullable=True)
    # Optionally lock the invite to one address; NULL means anyone holding it.
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                 index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    used_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True),
                                                        nullable=True)
    revoked_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                   nullable=True)
    revoke_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
