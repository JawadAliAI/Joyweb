"""Schemas for the SIMULATED identity-verification (KYC) flow.

Nothing here describes a real identity check. This is a demo platform: users
must never upload real identity documents.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class BasicKycIn(CamelModel):
    """Level 1 of the flow: a name and a document reference."""

    full_name: str = Field(min_length=2, max_length=160)
    document_type: Literal["LICENSE", "ID_CARD"]
    document_number: str = Field(min_length=4, max_length=80)

    @field_validator("full_name", "document_number", mode="before")
    @classmethod
    def _strip(cls, value):
        return value.strip() if isinstance(value, str) else value


class KycSubmissionOut(CamelModel):
    id: str
    level: str
    status: str
    full_name: str | None = None
    document_type: str | None = None
    document_number: str | None = None
    has_front_image: bool = False
    has_back_image: bool = False
    review_note: str | None = None
    created_at: datetime
    reviewed_at: datetime | None = None


class KycStatusOut(CamelModel):
    basic_status: str
    advanced_status: str
    can_submit_basic: bool
    can_submit_advanced: bool
    submissions: list[KycSubmissionOut] = []
    demo_notice: str
