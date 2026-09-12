"""FastAPI dependencies: authentication, authorisation and guard rails.

Route handlers state their requirements declaratively, e.g.

    user: User = Depends(require_active_user)
    admin: User = Depends(require_admin)
    _: None = Depends(require_feature("withdrawals_enabled"))
"""
from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque
from typing import Callable, Iterable

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import (
    AccountRestrictedError, AuthError, FeatureDisabledError, ForbiddenError,
    RateLimitError,
)
from app.core.security import ACCESS_COOKIE, CSRF_COOKIE, CSRF_HEADER, decode_token
from app.db.models import Role, User, UserStatus
from app.db.session import get_db
from app.services import settings_service

SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def _token_from_request(request: Request) -> str | None:
    """Cookie first (browser clients); bearer header second (docs and tooling)."""
    cookie = request.cookies.get(ACCESS_COOKIE)
    if cookie:
        return cookie
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def verify_csrf(request: Request) -> None:
    """Double-submit CSRF check for cookie-authenticated mutations.

    Skipped for bearer-token callers, which are not subject to ambient
    credentials, and for safe methods.
    """
    if request.method in SAFE_METHODS:
        return
    if not request.cookies.get(ACCESS_COOKIE):
        return

    # 1. Check double-submit token
    header_token = request.headers.get(CSRF_HEADER)
    cookie_token = request.cookies.get(CSRF_COOKIE)

    if header_token and cookie_token and hmac.compare_digest(cookie_token, header_token):
        return

    # When cookies exist for both domain (.cptcryptoiin.com) and host (admin.cptcryptoiin.com),
    # the browser sends multiple cd_csrf cookies in the Cookie header.
    # Check if header_token matches ANY cd_csrf cookie in the raw Cookie header.
    raw_cookie = request.headers.get("cookie", "")
    if header_token and raw_cookie:
        for part in raw_cookie.split(";"):
            if "=" in part:
                k, v = part.strip().split("=", 1)
                if k.strip() == CSRF_COOKIE and hmac.compare_digest(v.strip(), header_token):
                    return

    # 2. Origin / Referer verification
    # Browsers strictly forbid cross-origin spoofing of Origin / Referer on fetch mutations.
    # If the request originates from our trusted platform origins, allow it.
    origin = request.headers.get("origin")
    if origin:
        norm_origin = origin.rstrip("/").casefold()
        for allowed in settings.cors_origins:
            if norm_origin == allowed.rstrip("/").casefold():
                return

    referer = request.headers.get("referer")
    if referer:
        for allowed in settings.cors_origins:
            if referer.startswith(allowed):
                return

    raise ForbiddenError("CSRF token missing or invalid.", code="CSRF_FAILED")


def get_current_user_optional(request: Request,
                              db: Session = Depends(get_db)) -> User | None:
    token = _token_from_request(request)
    if not token:
        return None
    payload = decode_token(token, "access")
    if not payload:
        return None
    return db.get(User, payload.get("sub"))


def require_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Authenticated, but possibly frozen — used by read-only account screens."""
    verify_csrf(request)
    user = get_current_user_optional(request, db)
    if user is None:
        raise AuthError()
    if user.status == UserStatus.SUSPENDED.value:
        raise AccountRestrictedError("This account has been suspended.")
    return user


def require_active_user(user: User = Depends(require_user)) -> User:
    """Authenticated and unrestricted — required to move demo funds or trade.

    A frozen account can still log in, browse and contact support; it just
    cannot trade, transfer, withdraw or convert.
    """
    if user.is_frozen:
        raise AccountRestrictedError(
            user.freeze_reason or "Your account is currently restricted.")
    return user


def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise ForbiddenError("Administrator access required.")
    return user


def require_super_admin(user: User = Depends(require_user)) -> User:
    if user.role != Role.SUPER_ADMIN.value:
        raise ForbiddenError("Super administrator access required.")
    return user


def require_agent(user: User = Depends(require_user)) -> User:
    """Gate for the reseller back office.

    Administrators only. The AGENT role is a data relationship — it says which
    members belong to which reseller — not a login into this panel. An admin
    opens the panel and chooses whose downline to look at, so there is exactly
    one set of hands on it.
    """
    if not user.is_admin:
        raise ForbiddenError("Administrator access required.")
    return user


def require_feature(*keys: str) -> Callable[..., None]:
    """Guard a route behind one or more admin-controlled feature switches."""

    def _guard(db: Session = Depends(get_db)) -> None:
        for key in keys:
            if not settings_service.get_bool(db, key):
                # Prefer the administrator's own wording when they have set one.
                custom = str(settings_service.get(db, _CUSTOM_MESSAGE_KEYS.get(key, ""),
                                                  "") or "").strip()
                raise FeatureDisabledError(custom or _FEATURE_MESSAGES.get(
                    key, "This feature is currently unavailable."))

    return _guard


# Feature switch -> the setting holding the admin's own message for it.
_CUSTOM_MESSAGE_KEYS = {
    "withdrawals_enabled": "withdrawals_disabled_message",
}

_FEATURE_MESSAGES = {
    "withdrawals_enabled": "Withdrawals are currently unavailable.",
    "trading_enabled": "Trading is currently unavailable.",
    "deposits_enabled": "Deposits are currently unavailable.",
    "transfers_enabled": "Transfers are currently unavailable.",
    "conversions_enabled": "Conversions are currently unavailable.",
}


class SlidingWindowLimiter:
    """In-process rate limiter.

    Adequate for a single-node demo deployment. A multi-node deployment should
    point this at Redis — see README "Scaling notes".
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int, window_seconds: int) -> None:
        now = time.monotonic()
        bucket = self._hits[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            raise RateLimitError()
        bucket.append(now)


limiter = SlidingWindowLimiter()


def rate_limit(limit: int, window_seconds: int, scope: str) -> Callable[..., None]:
    def _guard(request: Request) -> None:
        forwarded = request.headers.get("x-forwarded-for")
        client = (forwarded.split(",")[0].strip() if forwarded
                  else (request.client.host if request.client else "unknown"))
        limiter.check(f"{scope}:{client}", limit, window_seconds)

    return _guard


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def assert_not_maintenance(db: Session, user: User | None) -> None:
    """Customers are locked out during maintenance; administrators are not."""
    if user is not None and user.is_admin:
        return
    if settings_service.get_bool(db, "maintenance_mode"):
        raise FeatureDisabledError(
            settings_service.get(db, "maintenance_message"),
            code="MAINTENANCE_MODE")


def csv_params(value: str | None) -> Iterable[str]:
    return [item.strip() for item in (value or "").split(",") if item.strip()]
