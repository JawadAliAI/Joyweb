"""Rules for the SIMULATED identity-verification (KYC) flow.

This is a DEMO / PAPER-TRADING platform. Nothing here verifies anybody's
identity: no document is checked against an issuer or a registry, an approval is
a human clicking a button in the demo admin panel, and it unlocks demo features
only. Users must be told never to upload real identity documents.

Nothing in this module commits — the routes own the transaction, matching the
rest of the codebase.
"""
from __future__ import annotations

import secrets
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as env
from app.core.errors import NotFoundError, ValidationError
from app.db.base import utcnow
from app.db.models import KycLevel, KycStatus, KycSubmission, User

DEMO_NOTICE = (
    "This is a simulated verification flow on a demo platform. No real identity "
    "check is performed and no data leaves this demo. Do not upload real "
    "identity documents."
)

DOCUMENT_TYPES: tuple[str, ...] = ("LICENSE", "ID_CARD")

MAX_FILE_BYTES = 5 * 1024 * 1024

# Detected by magic bytes only — the client-supplied content type and filename
# are never trusted.
_JPEG = b"\xff\xd8\xff"
_PNG = b"\x89PNG\r\n\x1a\n"
_RIFF = b"RIFF"
_WEBP = b"WEBP"

_EXTENSIONS = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def detect_image_type(data: bytes) -> str | None:
    """Return the media type implied by the file's magic bytes, or None."""
    if data.startswith(_PNG):
        return "image/png"
    if data.startswith(_JPEG):
        return "image/jpeg"
    if len(data) >= 12 and data.startswith(_RIFF) and data[8:12] == _WEBP:
        return "image/webp"
    return None


def upload_dir() -> Path:
    """The configured upload directory, created on demand."""
    directory = Path(env.KYC_UPLOAD_DIR)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def save_image(data: bytes) -> str:
    """Validate and store one image, returning its opaque stored id.

    The client filename is discarded; the stored name is random. The media type
    is derived from the file's magic bytes, never from what the client claimed.
    """
    if not data:
        raise ValidationError("The uploaded file is empty.", code="FILE_EMPTY")
    if len(data) > MAX_FILE_BYTES:
        raise ValidationError(
            "Each image must be 5 MB or smaller.", code="FILE_TOO_LARGE")
    media_type = detect_image_type(data)
    if media_type is None:
        raise ValidationError(
            "Only JPEG, PNG or WebP images are accepted. "
            "This is a demo — do not upload real identity documents.",
            code="UNSUPPORTED_FILE_TYPE")

    stored_id = secrets.token_hex(16) + _EXTENSIONS[media_type]
    (upload_dir() / stored_id).write_bytes(data)
    return stored_id


def stored_path(stored_id: str) -> Path:
    """Resolve a stored image id to a path, refusing anything path-like."""
    if not stored_id or "/" in stored_id or "\\" in stored_id or ".." in stored_id:
        raise NotFoundError("Document not found.", code="DOCUMENT_NOT_FOUND")
    return Path(env.KYC_UPLOAD_DIR) / stored_id


def media_type_for(stored_id: str) -> str:
    suffix = Path(stored_id).suffix.lower()
    return {".jpg": "image/jpeg", ".png": "image/png",
            ".webp": "image/webp"}.get(suffix, "application/octet-stream")


# --------------------------------------------------------------------------- #
# Status
# --------------------------------------------------------------------------- #


def latest_submission(db: Session, user_id: str, level: KycLevel | str
                      ) -> KycSubmission | None:
    """The most recent submission at one level, or None."""
    return db.scalars(
        select(KycSubmission)
        .where(KycSubmission.user_id == user_id,
               KycSubmission.level == str(level))
        .order_by(KycSubmission.created_at.desc(), KycSubmission.id.desc())
        .limit(1)
    ).first()


def status_for(db: Session, user_id: str, level: KycLevel | str) -> str:
    submission = latest_submission(db, user_id, level)
    return submission.status if submission else KycStatus.NOT_SUBMITTED.value


def list_submissions(db: Session, user_id: str) -> list[KycSubmission]:
    return list(db.scalars(
        select(KycSubmission)
        .where(KycSubmission.user_id == user_id)
        .order_by(KycSubmission.created_at.desc(), KycSubmission.id.desc())))


def can_submit(db: Session, user_id: str, level: KycLevel | str) -> bool:
    """A level is submittable when it is unsubmitted or previously rejected."""
    current = status_for(db, user_id, level)
    if current in (KycStatus.PENDING.value, KycStatus.APPROVED.value):
        return False
    if str(level) == KycLevel.ADVANCED.value:
        return status_for(db, user_id, KycLevel.BASIC.value) == KycStatus.APPROVED.value
    return True


def assert_can_submit(db: Session, user_id: str, level: KycLevel | str) -> None:
    """Raise the specific reason this level cannot be submitted right now."""
    current = status_for(db, user_id, level)
    if current == KycStatus.PENDING.value:
        raise ValidationError(
            "A simulated review of this level is already pending.",
            code="KYC_ALREADY_PENDING")
    if current == KycStatus.APPROVED.value:
        raise ValidationError(
            "This level has already been approved in the demo.",
            code="KYC_ALREADY_APPROVED")
    if (str(level) == KycLevel.ADVANCED.value
            and status_for(db, user_id, KycLevel.BASIC.value)
            != KycStatus.APPROVED.value):
        raise ValidationError(
            "Basic verification must be approved before the advanced step. "
            "This is a simulated check on a demo platform.",
            code="BASIC_KYC_REQUIRED")


# --------------------------------------------------------------------------- #
# Submission and review
# --------------------------------------------------------------------------- #


def submit_basic(db: Session, user: User, *, full_name: str, document_type: str,
                 document_number: str) -> KycSubmission:
    """Record a pending BASIC submission. Does not commit."""
    assert_can_submit(db, user.id, KycLevel.BASIC)
    if document_type not in DOCUMENT_TYPES:
        raise ValidationError("Document type must be LICENSE or ID_CARD.",
                              code="INVALID_DOCUMENT_TYPE")
    submission = KycSubmission(
        user_id=user.id, level=KycLevel.BASIC.value,
        status=KycStatus.PENDING.value, full_name=full_name,
        document_type=document_type, document_number=document_number)
    db.add(submission)
    db.flush()
    return submission


def submit_advanced(db: Session, user: User, *, front: bytes, back: bytes
                    ) -> KycSubmission:
    """Store both images and record a pending ADVANCED submission."""
    assert_can_submit(db, user.id, KycLevel.ADVANCED)
    front_id = save_image(front)
    back_id = save_image(back)
    submission = KycSubmission(
        user_id=user.id, level=KycLevel.ADVANCED.value,
        status=KycStatus.PENDING.value,
        front_image_id=front_id, back_image_id=back_id)
    db.add(submission)
    db.flush()
    return submission


def get_pending(db: Session, submission_id: str) -> KycSubmission:
    submission = db.get(KycSubmission, submission_id)
    if submission is None:
        raise NotFoundError("Submission not found.", code="KYC_NOT_FOUND")
    if submission.status != KycStatus.PENDING.value:
        raise ValidationError("This submission has already been reviewed.",
                              code="KYC_NOT_PENDING")
    return submission


def review(db: Session, submission: KycSubmission, *, approved: bool,
           reviewer: User, reason: str) -> KycSubmission:
    """Apply a simulated review decision. Does not commit."""
    reason = (reason or "").strip()
    if not reason:
        raise ValidationError("A reason is required.", code="REASON_REQUIRED")
    submission.status = (KycStatus.APPROVED.value if approved
                         else KycStatus.REJECTED.value)
    submission.review_note = reason
    submission.reviewed_by = reviewer.id
    submission.reviewed_at = utcnow()
    return submission
