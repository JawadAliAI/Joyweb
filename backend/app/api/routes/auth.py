"""Authentication routes for the demo exchange.

Registration creates a paper-trading account with simulated wallets; no real
identity, funds or blockchain address is involved.

Security notes:
* Passwords and fund passwords are hashed with Argon2id and are never logged,
  echoed back, or returned in any response.
* Login failures are deliberately indistinguishable from "no such account".
* Password reset tokens are stored only as a SHA-256 digest.
"""
from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import rate_limit, require_user
from app.core.config import settings
from app.core.errors import AuthError, ValidationError
from app.core.logging import logger
from app.core.security import (
    REFRESH_COOKIE, clear_auth_cookies, create_token, decode_token,
    hash_password, hash_reset_token, needs_rehash, new_csrf_token,
    new_reset_token, set_auth_cookies, verify_password,
)
from app.db.base import utcnow
from app.db.models import AuditAction, PasswordResetToken, Role, User, UserStatus
from app.db.session import get_db
from app.schemas.auth import (
    ChangePasswordIn, ForgotPasswordIn, LoginIn, MeOut, RegisterIn,
    ResetPasswordIn, SetFundPasswordIn, UpdateProfileIn,
)
from app.schemas.common import ok
from app.services import (
    audit_service, invite_service, settings_service, wallet_service,
)

router = APIRouter()

GENERIC_LOGIN_ERROR = "Email or password is incorrect."
GENERIC_FORGOT_MESSAGE = (
    "If an account exists for that email address, a password reset link has "
    "been sent."
)
DEFAULT_CREDIT_SCORE = 700


def credit_score_band(score: int) -> str:
    """Map a demo account score (1-100) to the band shown in the UI."""
    if score >= 85:
        return "Excellent"
    if score >= 70:
        return "Good"
    if score >= 50:
        return "Fair"
    return "Building"


def me_payload(db: Session, user: User) -> dict:
    """Serialise the signed-in account. Never includes hashes or tokens."""
    return MeOut(
        id=user.id,
        email=user.email,
        username=user.username,
        first_name=user.first_name,
        last_name=user.last_name or "",
        full_name=user.full_name,
        role=user.role,
        status=user.status,
        credit_score=user.credit_score,
        credit_score_band=credit_score_band(user.credit_score),
        avatar_url=user.avatar_url,
        is_test_account=user.is_test_account,
        must_change_password=user.must_change_password,
        has_fund_password=bool(user.fund_password_hash),
        freeze_reason=user.freeze_reason,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
        demo_mode=settings.DEMO_MODE,
        demo_label=settings.DEMO_LABEL,
    ).model_dump(by_alias=True)


def _issue_cookies(response: Response, user: User) -> None:
    access = create_token(user.id, "access", role=user.role)
    refresh = create_token(user.id, "refresh", role=user.role)
    set_auth_cookies(response, access, refresh, new_csrf_token())


@router.post("/register", summary="Create a demo account",
             dependencies=[Depends(rate_limit(10, 60, "register"))])
def register(payload: RegisterIn, request: Request, response: Response,
             db: Session = Depends(get_db)) -> dict:
    """Register a paper-trading account and open its simulated wallets."""
    email = payload.email.strip().lower()
    username = payload.username.strip()

    if db.scalar(select(User).where(func.lower(User.email) == email)) is not None:
        raise ValidationError("An account with that email already exists.",
                              code="EMAIL_TAKEN")
    if db.scalar(select(User).where(
            func.lower(User.username) == username.lower())) is not None:
        raise ValidationError("That username is already taken.",
                              code="USERNAME_TAKEN")

    # Registration is invitation-only unless an administrator opens it up.
    invite_required = settings_service.get_bool(db, "registration_requires_invite")
    invite_code = (payload.invite_code or "").strip()
    if invite_required and not invite_code:
        raise ValidationError(
            "Registration is by invitation only. Ask an administrator for an "
            "invitation link.",
            code="INVITE_REQUIRED")
    if invite_code:
        # Validate before creating anything, so a bad code never leaves a user behind.
        valid, reason, _ = invite_service.check(db, invite_code, email=email)
        if not valid:
            raise ValidationError(reason or "This invitation link is not valid.",
                                  code="INVITE_INVALID")

    user = User(
        email=email,
        username=username,
        first_name=payload.first_name,
        last_name=payload.last_name or "",
        password_hash=hash_password(payload.password),
        credit_score=DEFAULT_CREDIT_SCORE,
        status=UserStatus.ACTIVE.value,
    )
    db.add(user)
    db.flush()

    if invite_code:
        # Consumed in the same transaction that creates the account, so an
        # invite can never admit two users.
        invite = invite_service.claim(db, invite_code, email=email, user_id=user.id)

        # An invite issued by an agent attaches the new account to that agent's
        # downline. This is the only way a member acquires an agent, so the
        # hierarchy can never disagree with the invite record it came from.
        inviter = (db.get(User, invite.created_by) if invite.created_by else None)
        if inviter is not None and inviter.role == Role.AGENT.value:
            user.agent_id = inviter.id

        audit_service.record(db, AuditAction.INVITE_USED, actor=user,
                             target_user_id=user.id, request=request,
                             new_value={"inviteId": invite.id,
                                        "agentId": user.agent_id},
                             reason="Invitation consumed during registration.")

    wallet_service.ensure_wallets(db, user.id)
    user.last_login_at = utcnow()
    audit_service.record(db, AuditAction.USER_CREATED, actor=user, request=request,
                         new_value={"email": user.email, "username": user.username})
    db.commit()
    db.refresh(user)

    _issue_cookies(response, user)
    return ok(me_payload(db, user))


@router.get("/invite/{code}", summary="Check an invitation link")
def check_invite(code: str, db: Session = Depends(get_db)) -> dict:
    """Report whether an invitation can still be used.

    Public on purpose: the registration form calls it before showing the fields.
    It reveals only whether the code works and which address it is locked to —
    never who issued it or anything about other accounts.
    """
    valid, reason, invite = invite_service.check(db, code)
    return ok({
        "valid": valid,
        "reason": reason,
        "email": invite.email if (invite and valid) else None,
        "expiresAt": invite.expires_at if (invite and valid) else None,
    })


@router.post("/login", summary="Sign in to a demo account",
             dependencies=[Depends(rate_limit(10, 60, "login"))])
def login(payload: LoginIn, request: Request, response: Response,
          db: Session = Depends(get_db)) -> dict:
    """Authenticate. Frozen accounts may sign in; suspended accounts may not."""
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))

    if user is None or not verify_password(payload.password, user.password_hash):
        audit_service.record(db, AuditAction.LOGIN_FAILED, actor=user,
                             request=request, reason="Invalid credentials.")
        db.commit()
        # Deliberately generic: never reveal whether the account exists.
        raise AuthError(GENERIC_LOGIN_ERROR, code="INVALID_CREDENTIALS")

    if user.status == UserStatus.SUSPENDED.value:
        audit_service.record(db, AuditAction.LOGIN_FAILED, actor=user,
                             request=request, reason="Account suspended.")
        db.commit()
        raise AuthError("This demo account has been suspended.",
                        code="ACCOUNT_SUSPENDED", status_code=403)

    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)
    user.last_login_at = utcnow()
    audit_service.record(db, AuditAction.LOGIN, actor=user, request=request)
    db.commit()
    db.refresh(user)

    _issue_cookies(response, user)
    return ok(me_payload(db, user))


@router.post("/logout", summary="Sign out and clear the session cookies")
def logout(request: Request, response: Response,
           db: Session = Depends(get_db)) -> dict:
    """Clear the auth cookies. Safe to call when already signed out."""
    from app.api.deps import get_current_user_optional

    user = get_current_user_optional(request, db)
    if user is not None:
        audit_service.record(db, AuditAction.LOGOUT, actor=user, request=request)
        db.commit()
    clear_auth_cookies(response)
    return ok({"loggedOut": True})


@router.post("/refresh", summary="Exchange the refresh cookie for new tokens")
def refresh(request: Request, response: Response,
            db: Session = Depends(get_db)) -> dict:
    """Reissue the access, refresh and CSRF cookies from a valid refresh token."""
    token = request.cookies.get(REFRESH_COOKIE)
    if not token:
        raise AuthError("Your session has expired. Please sign in again.",
                        code="REFRESH_REQUIRED")
    payload = decode_token(token, "refresh")
    if not payload:
        clear_auth_cookies(response)
        raise AuthError("Your session has expired. Please sign in again.",
                        code="REFRESH_INVALID")
    user = db.get(User, payload.get("sub"))
    if user is None or user.status == UserStatus.SUSPENDED.value:
        clear_auth_cookies(response)
        raise AuthError("Your session is no longer valid.", code="REFRESH_INVALID")

    _issue_cookies(response, user)
    return ok(me_payload(db, user))


@router.get("/me", summary="The signed-in demo account")
def me(user: User = Depends(require_user), db: Session = Depends(get_db)) -> dict:
    """Return the current account profile. Never includes secrets."""
    return ok(me_payload(db, user))


@router.post("/forgot-password", summary="Request a password reset link",
             dependencies=[Depends(rate_limit(5, 300, "forgot"))])
def forgot_password(payload: ForgotPasswordIn, request: Request,
                    db: Session = Depends(get_db)) -> dict:
    """Always returns the same body, whether or not the account exists.

    This demo has no mail transport: the link is written to the application log.
    In development only, the raw token is also echoed as `data.devToken` so the
    flow can be exercised locally. It is never included in production.
    """
    email = payload.email.strip().lower()
    user = db.scalar(select(User).where(func.lower(User.email) == email))
    body: dict = {"requested": True, "message": GENERIC_FORGOT_MESSAGE}

    if user is None:
        return ok(body)

    raw, digest = new_reset_token()
    reset = PasswordResetToken(
        user_id=user.id,
        token_hash=digest,
        expires_at=utcnow() + timedelta(minutes=settings.PASSWORD_RESET_TTL_MINUTES),
    )
    db.add(reset)
    audit_service.record(db, AuditAction.PASSWORD_RESET_REQUESTED, actor=user,
                         request=request)
    db.commit()

    logger.info("password_reset_link user=%s link=/reset-password?token=%s",
                user.id, raw)
    if not settings.is_production and settings.ENVIRONMENT.lower() == "development":
        body["devToken"] = raw
        body["devNote"] = ("Development convenience only. This field is never "
                           "returned outside a development environment.")
    return ok(body)


@router.post("/reset-password", summary="Complete a password reset")
def reset_password(payload: ResetPasswordIn, request: Request,
                   db: Session = Depends(get_db)) -> dict:
    """Consume a reset token and set a new password."""
    digest = hash_reset_token(payload.token)
    reset = db.scalar(select(PasswordResetToken).where(
        PasswordResetToken.token_hash == digest))
    if reset is None or reset.used_at is not None:
        raise ValidationError("This reset link is invalid or has already been used.",
                              code="RESET_TOKEN_INVALID")

    expires_at = reset.expires_at
    now = utcnow()
    if expires_at.tzinfo is None:
        now = now.replace(tzinfo=None)
    if expires_at < now:
        raise ValidationError("This reset link has expired.",
                              code="RESET_TOKEN_EXPIRED")

    user = db.get(User, reset.user_id)
    if user is None:
        raise ValidationError("This reset link is invalid or has already been used.",
                              code="RESET_TOKEN_INVALID")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    reset.used_at = utcnow()

    # Invalidate every other outstanding token for this account.
    for other in db.scalars(select(PasswordResetToken).where(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None))):
        other.used_at = utcnow()

    audit_service.record(db, AuditAction.PASSWORD_RESET_COMPLETED, actor=user,
                         request=request)
    db.commit()
    return ok({"reset": True, "message": "Your password has been updated."})


@router.patch("/profile", summary="Update the signed-in user's profile")
def update_profile(payload: UpdateProfileIn, request: Request,
                   user: User = Depends(require_user),
                   db: Session = Depends(get_db)) -> dict:
    """Update the caller's own display details.

    Only the account holder can call this, and only for themselves. Email is not
    editable here — moving a session to a new address needs a verification flow
    this simulator does not implement.
    """
    username = payload.username
    if username.lower() != user.username.lower():
        taken = db.scalar(select(User).where(
            func.lower(User.username) == username.lower(), User.id != user.id))
        if taken is not None:
            raise ValidationError("That username is already taken.",
                                  code="USERNAME_TAKEN")

    before = {"firstName": user.first_name, "lastName": user.last_name,
              "username": user.username, "avatarUrl": user.avatar_url}
    user.first_name = payload.first_name
    user.last_name = payload.last_name
    user.username = username
    user.avatar_url = payload.avatar_url
    after = {"firstName": user.first_name, "lastName": user.last_name,
             "username": user.username, "avatarUrl": user.avatar_url}

    audit_service.record(db, AuditAction.USER_UPDATED, actor=user, request=request,
                         old_value=before, new_value=after,
                         reason="Profile updated by the account holder.")
    db.commit()
    db.refresh(user)
    return ok(me_payload(db, user))


@router.post("/change-password", summary="Change the login password")
def change_password(payload: ChangePasswordIn, request: Request,
                    user: User = Depends(require_user),
                    db: Session = Depends(get_db)) -> dict:
    """Requires the current password. The new password is stored only as a hash."""
    if not verify_password(payload.current_password, user.password_hash):
        raise ValidationError("Your current password is incorrect.",
                              code="INVALID_CURRENT_PASSWORD")
    if payload.new_password == payload.current_password:
        raise ValidationError("The new password must differ from the current one.",
                              code="PASSWORD_UNCHANGED")

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    audit_service.record(db, AuditAction.USER_UPDATED, actor=user, request=request,
                         reason="Password changed.")
    db.commit()
    return ok({"changed": True, "message": "Your password has been updated."})


@router.post("/fund-password", summary="Set or replace the fund password")
def set_fund_password(payload: SetFundPasswordIn, request: Request,
                      user: User = Depends(require_user),
                      db: Session = Depends(get_db)) -> dict:
    """The fund password authorises simulated money movements.

    Authorised by the login password; stored only as an Argon2id hash.
    """
    if not verify_password(payload.current_password, user.password_hash):
        raise ValidationError("Your current password is incorrect.",
                              code="INVALID_CURRENT_PASSWORD")

    replaced = bool(user.fund_password_hash)
    user.fund_password_hash = hash_password(payload.fund_password)
    audit_service.record(db, AuditAction.FUND_PASSWORD_SET, actor=user,
                         request=request,
                         new_value={"replaced": replaced})
    db.commit()
    return ok({"hasFundPassword": True,
               "message": "Your fund password has been set."})
