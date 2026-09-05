"""Invitation-only registration.

An invite admits exactly one account. The single-use guarantee is the whole
point of the feature, so it is enforced at the database level rather than by a
read-then-write in Python: `claim()` issues a conditional UPDATE that only
matches a row still marked unused, and treats "no rows updated" as "somebody
else got there first".
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models import Invite, User

# Status values exposed to the UI. Derived, never stored, so a row cannot drift
# out of sync with the clock.
ACTIVE = "ACTIVE"
USED = "USED"
EXPIRED = "EXPIRED"
REVOKED = "REVOKED"

DEFAULT_EXPIRY_HOURS = 72
MAX_EXPIRY_HOURS = 8760          # one year
CODE_BYTES = 24                  # ~32 url-safe characters


def _aware(value: datetime | None) -> datetime | None:
    """SQLite hands back naive datetimes; compare everything in UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def new_code() -> str:
    return secrets.token_urlsafe(CODE_BYTES)


def status_of(invite: Invite, *, now: datetime | None = None) -> str:
    now = now or utcnow()
    if invite.revoked_at is not None:
        return REVOKED
    if invite.used_at is not None:
        return USED
    expires = _aware(invite.expires_at)
    if expires is not None and expires <= now:
        return EXPIRED
    return ACTIVE


# Why a code cannot be used, keyed by status. Wording is deliberately plain.
_REJECTIONS = {
    USED: ("INVITE_ALREADY_USED",
           "This invitation has already been used to create an account."),
    EXPIRED: ("INVITE_EXPIRED", "This invitation has expired."),
    REVOKED: ("INVITE_REVOKED", "This invitation was cancelled by an administrator."),
}


def invite_url(code: str, base_url: str) -> str:
    return f"{base_url.rstrip('/')}/register?invite={code}"


def create(db: Session, *, admin: User, expires_in_hours: int = DEFAULT_EXPIRY_HOURS,
           email: str | None = None, note: str | None = None) -> Invite:
    """Issue a new single-use invitation."""
    hours = int(expires_in_hours or DEFAULT_EXPIRY_HOURS)
    if hours < 1 or hours > MAX_EXPIRY_HOURS:
        raise ValidationError(
            f"Expiry must be between 1 and {MAX_EXPIRY_HOURS} hours.",
            code="INVALID_EXPIRY")

    invite = Invite(
        code=new_code(),
        created_by=admin.id,
        email=(email or "").strip().lower() or None,
        note=(note or "").strip() or None,
        expires_at=utcnow() + timedelta(hours=hours),
    )
    db.add(invite)
    db.flush()
    return invite


def get_by_code(db: Session, code: str) -> Invite | None:
    cleaned = (code or "").strip()
    if not cleaned:
        return None
    return db.scalar(select(Invite).where(Invite.code == cleaned))


def check(db: Session, code: str, *, email: str | None = None) -> tuple[bool, str | None,
                                                                       Invite | None]:
    """Validate a code without consuming it.

    Returns `(valid, human_reason, invite)`. Used by the public preview endpoint
    so the registration form can explain itself before anything is submitted.
    """
    invite = get_by_code(db, code)
    if invite is None:
        return False, "This invitation link is not valid.", None

    state = status_of(invite)
    if state in _REJECTIONS:
        return False, _REJECTIONS[state][1], invite

    if invite.email and email and invite.email != email.strip().lower():
        return False, "This invitation was issued for a different email address.", invite

    return True, None, invite


def claim(db: Session, code: str, *, email: str, user_id: str) -> Invite:
    """Consume an invitation for the account being created.

    Raises `ValidationError` with a specific code if the invite cannot be used.
    The conditional UPDATE is what makes this safe against two simultaneous
    registrations using the same link.
    """
    invite = get_by_code(db, code)
    if invite is None:
        raise ValidationError("This invitation link is not valid.", code="INVITE_INVALID")

    state = status_of(invite)
    if state in _REJECTIONS:
        error_code, message = _REJECTIONS[state]
        raise ValidationError(message, code=error_code)

    if invite.email and invite.email != email.strip().lower():
        raise ValidationError(
            "This invitation was issued for a different email address.",
            code="INVITE_EMAIL_MISMATCH")

    now = utcnow()
    result = db.execute(
        update(Invite)
        .where(Invite.id == invite.id,
               Invite.used_at.is_(None),
               Invite.revoked_at.is_(None))
        .values(used_at=now, used_by=user_id)
    )
    if result.rowcount != 1:
        # Another registration claimed it between the check and the update.
        raise ValidationError(
            "This invitation has already been used to create an account.",
            code="INVITE_ALREADY_USED")

    db.refresh(invite)
    return invite


def revoke(db: Session, invite_id: str, *, admin: User, reason: str) -> Invite:
    invite = db.get(Invite, invite_id)
    if invite is None:
        raise NotFoundError("Invitation not found.")

    state = status_of(invite)
    if state == USED:
        raise ValidationError("A used invitation cannot be revoked.",
                              code="INVITE_ALREADY_USED")
    if state == REVOKED:
        raise ValidationError("This invitation is already revoked.",
                              code="INVITE_ALREADY_REVOKED")

    invite.revoked_at = utcnow()
    invite.revoked_by = admin.id
    invite.revoke_reason = reason
    return invite


def to_dict(db: Session, invite: Invite, *, base_url: str) -> dict[str, Any]:
    """Serialise for the admin UI, resolving the related account emails."""
    used_by_email = None
    if invite.used_by:
        user = db.get(User, invite.used_by)
        used_by_email = user.email if user else None

    created_by_email = None
    if invite.created_by:
        creator = db.get(User, invite.created_by)
        created_by_email = creator.email if creator else None

    return {
        "id": invite.id,
        "code": invite.code,
        "inviteUrl": invite_url(invite.code, base_url),
        "email": invite.email,
        "note": invite.note,
        "status": status_of(invite),
        "expiresAt": invite.expires_at,
        "createdAt": invite.created_at,
        "usedAt": invite.used_at,
        "usedByEmail": used_by_email,
        "createdByEmail": created_by_email,
    }
