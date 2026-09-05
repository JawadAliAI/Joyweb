"""Shared response envelope and pagination helpers.

Every successful response is `{"success": true, "data": ...}`; every failure is
`{"success": false, "error": {"code", "message"}}` (see `app.core.errors`).
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any, Generic, Sequence, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class CamelModel(BaseModel):
    """Base schema: snake_case in Python, camelCase on the wire."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
        alias_generator=lambda name: "".join(
            part if index == 0 else part.capitalize()
            for index, part in enumerate(name.split("_"))
        ),
    )


class Envelope(BaseModel, Generic[T]):
    success: bool = True
    data: T


def ok(data: Any) -> dict[str, Any]:
    return {"success": True, "data": data}


class PageMeta(CamelModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class Page(CamelModel, Generic[T]):
    items: list[T]
    meta: PageMeta


class PaginationParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def paginate(items: Sequence[Any], total: int, params: PaginationParams) -> dict[str, Any]:
    total_pages = max(1, -(-total // params.page_size))
    return {
        "items": list(items),
        "meta": {
            "page": params.page,
            "pageSize": params.page_size,
            "total": total,
            "totalPages": total_pages,
        },
    }


def money(value: Decimal | None, places: int = 8) -> str | None:
    """Render a Decimal for the wire as a string, never a float."""
    if value is None:
        return None
    return f"{Decimal(value):.{places}f}"
