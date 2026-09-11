"""Authentication request/response schemas.

Passwords and fund passwords only ever travel INBOUND. No schema in this module
exposes a hash, a token digest or a plaintext secret.
"""
from __future__ import annotations

import re
from datetime import datetime

from pydantic import EmailStr, Field, TypeAdapter, field_validator
from pydantic import ValidationError as PydanticValidationError

from app.schemas.common import CamelModel

PASSWORD_MIN_LENGTH = 10
PASSWORD_RULE = (
    "Password must be at least 10 characters long and contain at least one "
    "letter and one digit."
)

FUND_PASSWORD_MIN_LENGTH = 6
FUND_PASSWORD_MAX_LENGTH = 64
FUND_PASSWORD_RULE = "Fund password must be between 6 and 64 characters."

_USERNAME_RE = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")
_EMAIL = TypeAdapter(EmailStr)


def validate_password_strength(value: str) -> str:
    """Shared password policy: length, one letter, one digit."""
    if value is None or len(value) < PASSWORD_MIN_LENGTH:
        raise ValueError(PASSWORD_RULE)
    if not any(char.isalpha() for char in value):
        raise ValueError(PASSWORD_RULE)
    if not any(char.isdigit() for char in value):
        raise ValueError(PASSWORD_RULE)
    return value


def validate_fund_password(value: str) -> str:
    if value is None or not (FUND_PASSWORD_MIN_LENGTH <= len(value)
                             <= FUND_PASSWORD_MAX_LENGTH):
        raise ValueError(FUND_PASSWORD_RULE)
    return value


class RegisterIn(CamelModel):
    """New demo account. Creates simulated wallets only — no real funds.

    The form asks for one sign-in name: `identifier` is an email address or a
    username, and the route derives the other half.
    """

    identifier: str = Field(min_length=3, max_length=255,
                            description="Email address or username.")
    password: str
    confirm_password: str
    invite_code: str | None = Field(None, max_length=128,
                                    description="The shared invitation code, or the "
                                                "code from a single-use link.")

    @field_validator("identifier")
    @classmethod
    def _check_identifier(cls, value: str) -> str:
        value = value.strip()
        if "@" in value:
            try:
                return _EMAIL.validate_python(value).lower()
            except PydanticValidationError:
                raise ValueError("Enter a valid email address.") from None
        if not _USERNAME_RE.match(value):
            raise ValueError(
                "Username must be 3-32 characters using letters, digits, "
                "dot, dash or underscore.")
        return value

    @field_validator("password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("confirm_password")
    @classmethod
    def _check_match(cls, value: str, info):
        password = info.data.get("password")
        if password is not None and value != password:
            raise ValueError("Passwords do not match.")
        return value


class LoginIn(CamelModel):
    # An email address or a username. The key stays `email` so existing
    # clients keep working.
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1)


class ForgotPasswordIn(CamelModel):
    email: EmailStr


class ResetPasswordIn(CamelModel):
    token: str = Field(min_length=1, max_length=200)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class ChangePasswordIn(CamelModel):
    current_password: str = Field(min_length=1)
    new_password: str

    @field_validator("new_password")
    @classmethod
    def _check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class SetFundPasswordIn(CamelModel):
    """The login password authorises setting or replacing the fund password."""

    fund_password: str
    current_password: str = Field(min_length=1)

    @field_validator("fund_password")
    @classmethod
    def _check_fund_password(cls, value: str) -> str:
        return validate_fund_password(value)


class MeOut(CamelModel):
    """The signed-in demo account. Never carries a hash or a token."""

    id: str
    email: str
    username: str
    first_name: str
    last_name: str
    full_name: str
    role: str
    status: str
    credit_score: int
    credit_score_band: str
    avatar_url: str | None = None
    is_test_account: bool = False
    must_change_password: bool = False
    has_fund_password: bool = False
    freeze_reason: str | None = None
    created_at: datetime | None = None
    last_login_at: datetime | None = None
    demo_mode: bool = True
    demo_label: str = ""


class UpdateProfileIn(CamelModel):
    """Editable profile fields.

    Email is deliberately not editable here: changing the address a session is
    keyed to needs a verification flow this simulator does not implement.
    """

    first_name: str = Field(min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    username: str = Field(min_length=3, max_length=32)
    avatar_url: str | None = Field(default=None, max_length=500)

    @field_validator("username")
    @classmethod
    def _check_username(cls, value: str) -> str:
        value = value.strip()
        if not _USERNAME_RE.match(value):
            raise ValueError(
                "Username must be 3-32 characters using letters, digits, "
                "dot, dash or underscore.")
        return value

    @field_validator("first_name", "last_name")
    @classmethod
    def _strip_names(cls, value: str) -> str:
        return (value or "").strip()
