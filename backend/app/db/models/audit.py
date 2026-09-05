from __future__ import annotations

from sqlalchemy import ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class AuditLog(UUIDMixin, TimestampMixin, Base):
    """Append-only record of every sensitive action.

    Nothing here is ever updated or deleted by application code.
    """

    __tablename__ = "audit_logs"

    actor_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                 index=True, nullable=True)
    actor_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    target_user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"),
                                                       index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    old_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    new_value: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(400), nullable=True)
