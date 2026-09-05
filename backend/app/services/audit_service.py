"""Audit logging.

Every sensitive action funnels through `record()`. The row is added to the
caller's session so it commits atomically with the change it describes — an
action and its audit entry either both land or neither does.
"""
from __future__ import annotations

from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.logging import logger
from app.db.models import AuditLog, AuditAction, User


def request_context(request: Request | None) -> dict[str, str | None]:
    if request is None:
        return {"ip_address": None, "user_agent": None}
    forwarded = request.headers.get("x-forwarded-for")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else None)
    return {"ip_address": ip, "user_agent": request.headers.get("user-agent", "")[:400]}


def record(
    db: Session,
    action: AuditAction | str,
    *,
    actor: User | None = None,
    target_user_id: str | None = None,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    reason: str | None = None,
    request: Request | None = None,
) -> AuditLog:
    ctx = request_context(request)
    entry = AuditLog(
        actor_id=actor.id if actor else None,
        actor_email=actor.email if actor else None,
        target_user_id=target_user_id or (actor.id if actor else None),
        action=str(action),
        old_value=old_value,
        new_value=new_value,
        reason=reason,
        **ctx,
    )
    db.add(entry)
    logger.info("audit action=%s actor=%s target=%s",
                entry.action, entry.actor_email, entry.target_user_id)
    return entry
