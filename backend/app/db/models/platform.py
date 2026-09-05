from __future__ import annotations

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class PlatformSetting(UUIDMixin, TimestampMixin, Base):
    """Key/value store backing every runtime-configurable platform value.

    Grouped so the admin UI can render Branding / Trading / Withdrawal / System
    tabs without hard-coding which keys exist.
    """

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    group: Mapped[str] = mapped_column(String(40), default="general", nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
