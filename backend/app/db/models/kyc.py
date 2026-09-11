"""Simulated identity-verification (KYC) submissions.

This is a DEMO / PAPER-TRADING platform. Nothing in this module performs a real
identity check: no document is sent to an issuer, a registry or a verification
bureau, and an "approval" only unlocks demo features. Users are told, on every
screen and in every message, not to upload real identity documents.

The document number is stored in plaintext because a reviewing administrator has
to be able to read it back. It must therefore never be written to a log line,
an audit payload or a notification body.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.db.models.enums import KycStatus


class KycSubmission(UUIDMixin, TimestampMixin, Base):
    """One verification attempt at one level, for one user."""

    __tablename__ = "kyc_submissions"

    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"),
        index=True, nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default=KycStatus.PENDING.value,
                                        nullable=False, index=True)

    # BASIC level fields
    full_name: Mapped[str | None] = mapped_column(String(160), nullable=True)
    document_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    document_number: Mapped[str | None] = mapped_column(String(80), nullable=True)

    # ADVANCED level fields — opaque stored ids, never client filenames.
    front_image_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    back_image_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True)
