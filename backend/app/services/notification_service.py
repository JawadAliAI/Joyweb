"""In-app notifications for simulated account activity.

Notifications are written into the caller's session and committed with the
change they describe, so a user never sees a message about a demo movement that
did not actually land. Every message body is expected to name the activity as
simulated — nothing on this platform touches real funds.
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Notification

# --- Categories -------------------------------------------------------------
GENERAL = "GENERAL"
DEMO_DEPOSIT = "DEMO_DEPOSIT"
DEMO_WITHDRAWAL = "DEMO_WITHDRAWAL"
DEMO_TRADE = "DEMO_TRADE"
DEMO_BALANCE = "DEMO_BALANCE"
ACCOUNT = "ACCOUNT"
SECURITY = "SECURITY"

CATEGORIES: tuple[str, ...] = (
    GENERAL, DEMO_DEPOSIT, DEMO_WITHDRAWAL, DEMO_TRADE, DEMO_BALANCE,
    ACCOUNT, SECURITY,
)


def notify(db: Session, user_id: str, title: str, body: str,
           category: str = GENERAL) -> Notification:
    """Queue a notification on the caller's session. Does not commit."""
    if category not in CATEGORIES:
        category = GENERAL
    entry = Notification(user_id=user_id, title=title[:160], body=body,
                         category=category, read=False)
    db.add(entry)
    return entry


def list_for_user(db: Session, user_id: str, *, unread_only: bool = False,
                  limit: int = 20, offset: int = 0) -> list[Notification]:
    stmt = select(Notification).where(Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    stmt = stmt.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
    return list(db.scalars(stmt))


def count_for_user(db: Session, user_id: str, *, unread_only: bool = False) -> int:
    stmt = select(func.count()).select_from(Notification).where(
        Notification.user_id == user_id)
    if unread_only:
        stmt = stmt.where(Notification.read.is_(False))
    return int(db.scalar(stmt) or 0)


def unread_count(db: Session, user_id: str) -> int:
    return count_for_user(db, user_id, unread_only=True)


def mark_read(db: Session, user_id: str, notification_id: str) -> Notification | None:
    entry = db.scalar(select(Notification).where(
        Notification.id == notification_id, Notification.user_id == user_id))
    if entry is not None:
        entry.read = True
    return entry


def mark_all_read(db: Session, user_id: str) -> int:
    rows = list(db.scalars(select(Notification).where(
        Notification.user_id == user_id, Notification.read.is_(False))))
    for row in rows:
        row.read = True
    return len(rows)
