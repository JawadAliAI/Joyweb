"""Password hashing, token issuance and cookie helpers.

Passwords and fund passwords are hashed with Argon2id and are never stored,
logged or returned in plaintext — not even to an administrator.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError
from fastapi import Response

from app.core.config import settings

_hasher = PasswordHasher()

ACCESS_COOKIE = "cd_access"
REFRESH_COOKIE = "cd_refresh"
CSRF_COOKIE = "cd_csrf"
CSRF_HEADER = "x-csrf-token"

TokenType = Literal["access", "refresh"]


def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(raw: str, hashed: str | None) -> bool:
    if not hashed:
        return False
    try:
        return _hasher.verify(hashed, raw)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False


def needs_rehash(hashed: str) -> bool:
    try:
        return _hasher.check_needs_rehash(hashed)
    except InvalidHashError:
        return True


def create_token(subject: str, token_type: TokenType, *, role: str,
                 extra: dict[str, Any] | None = None) -> str:
    now = datetime.now(timezone.utc)
    ttl = (timedelta(minutes=settings.JWT_ACCESS_TTL_MINUTES) if token_type == "access"
           else timedelta(days=settings.JWT_REFRESH_TTL_DAYS))
    payload: dict[str, Any] = {
        "sub": subject,
        "type": token_type,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + ttl).timestamp()),
        "jti": secrets.token_urlsafe(16),
    }
    payload.update(extra or {})
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str, expected_type: TokenType) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET,
                             algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("type") != expected_type:
        return None
    return payload


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def new_reset_token() -> tuple[str, str]:
    """Return (plaintext, sha256 digest). Only the digest is persisted."""
    raw = secrets.token_urlsafe(48)
    return raw, hashlib.sha256(raw.encode()).hexdigest()


def hash_reset_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def _cookie_kwargs(max_age: int, http_only: bool = True) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "httponly": http_only,
        "secure": settings.COOKIE_SECURE,
        "samesite": settings.COOKIE_SAMESITE,
        "max_age": max_age,
        "path": "/",
    }
    if settings.COOKIE_DOMAIN:
        kwargs["domain"] = settings.COOKIE_DOMAIN
    return kwargs


def set_auth_cookies(response: Response, access: str, refresh: str, csrf: str) -> None:
    response.set_cookie(ACCESS_COOKIE, access,
                        **_cookie_kwargs(settings.JWT_ACCESS_TTL_MINUTES * 60))
    response.set_cookie(REFRESH_COOKIE, refresh,
                        **_cookie_kwargs(settings.JWT_REFRESH_TTL_DAYS * 86400))
    # Readable by JS on purpose: the double-submit half of CSRF protection.
    response.set_cookie(CSRF_COOKIE, csrf,
                        **_cookie_kwargs(settings.JWT_REFRESH_TTL_DAYS * 86400,
                                         http_only=False))


def clear_auth_cookies(response: Response) -> None:
    for name in (ACCESS_COOKIE, REFRESH_COOKIE, CSRF_COOKIE):
        response.delete_cookie(name, path="/",
                              domain=settings.COOKIE_DOMAIN or None)
        if settings.COOKIE_DOMAIN:
            response.delete_cookie(name, path="/", domain=None)
