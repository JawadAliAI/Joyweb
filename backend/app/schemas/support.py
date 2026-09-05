"""Support ticket schemas."""
from __future__ import annotations

from datetime import datetime

from pydantic import Field, field_validator

from app.schemas.common import CamelModel

TICKET_CATEGORIES: tuple[str, ...] = (
    "ACCOUNT", "DEPOSIT", "WITHDRAWAL", "TRADING", "TECHNICAL", "OTHER",
)

CATEGORY_LABELS: dict[str, str] = {
    "ACCOUNT": "Account",
    "DEPOSIT": "Demo deposits",
    "WITHDRAWAL": "Demo withdrawals",
    "TRADING": "Demo trading",
    "TECHNICAL": "Technical problem",
    "OTHER": "Something else",
}


class TicketCreate(CamelModel):
    subject: str = Field(min_length=3, max_length=200)
    category: str = Field(default="OTHER", max_length=40)
    message: str = Field(min_length=1, max_length=5000)

    @field_validator("category")
    @classmethod
    def _check_category(cls, value: str) -> str:
        value = (value or "OTHER").strip().upper()
        if value not in TICKET_CATEGORIES:
            raise ValueError("Category must be one of: "
                             + ", ".join(TICKET_CATEGORIES))
        return value

    @field_validator("subject", "message")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("This field cannot be empty.")
        return value


class TicketReply(CamelModel):
    message: str = Field(min_length=1, max_length=5000)

    @field_validator("message")
    @classmethod
    def _strip(cls, value: str) -> str:
        value = (value or "").strip()
        if not value:
            raise ValueError("A reply cannot be empty.")
        return value


class MessageOut(CamelModel):
    id: str
    ticket_id: str
    author_id: str
    is_staff_reply: bool
    body: str
    created_at: datetime | None = None


class TicketOut(CamelModel):
    id: str
    subject: str
    category: str
    category_label: str = ""
    status: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
    message_count: int = 0
    messages: list[MessageOut] = []
