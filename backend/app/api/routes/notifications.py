"""In-app notification routes.

Notifications describe simulated account activity only.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import require_user
from app.core.errors import NotFoundError
from app.db.models import User
from app.db.session import get_db
from app.schemas.common import PaginationParams, ok, paginate
from app.services import notification_service

router = APIRouter()


def _serialise(entry) -> dict:
    return {
        "id": entry.id,
        "title": entry.title,
        "body": entry.body,
        "category": entry.category,
        "read": entry.read,
        "createdAt": entry.created_at,
    }


@router.get("", summary="List my notifications")
def list_notifications(page: int = Query(1, ge=1),
                       page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                       unread_only: bool = Query(False, alias="unreadOnly"),
                       user: User = Depends(require_user),
                       db: Session = Depends(get_db)) -> dict:
    """Paginated notifications for the signed-in account, newest first."""
    params = PaginationParams(page=page, page_size=page_size)
    total = notification_service.count_for_user(db, user.id, unread_only=unread_only)
    rows = notification_service.list_for_user(
        db, user.id, unread_only=unread_only,
        limit=params.page_size, offset=params.offset)
    return ok(paginate([_serialise(row) for row in rows], total, params))


@router.get("/unread-count", summary="How many notifications are unread")
def unread_count(user: User = Depends(require_user),
                 db: Session = Depends(get_db)) -> dict:
    """Badge count for the notifications bell."""
    return ok({"unread": notification_service.unread_count(db, user.id)})


@router.post("/{notification_id}/read", summary="Mark one notification as read")
def mark_read(notification_id: str, user: User = Depends(require_user),
              db: Session = Depends(get_db)) -> dict:
    """Mark a single notification read. Only the owner may do so."""
    entry = notification_service.mark_read(db, user.id, notification_id)
    if entry is None:
        raise NotFoundError("Notification not found.")
    db.commit()
    return ok({"id": notification_id, "read": True,
               "unread": notification_service.unread_count(db, user.id)})


@router.post("/read-all", summary="Mark every notification as read")
def mark_all_read(user: User = Depends(require_user),
                  db: Session = Depends(get_db)) -> dict:
    """Clear the unread badge for the signed-in account."""
    updated = notification_service.mark_all_read(db, user.id)
    db.commit()
    return ok({"updated": updated, "unread": 0})
