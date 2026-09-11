"""SIMULATED identity verification (KYC).

This is a DEMO / PAPER-TRADING platform. These routes perform NO real identity
verification: nothing is checked against an issuer, a registry or a verification
bureau, and an approval only flips a flag in this demo. Every user-facing
message says so and tells the user not to upload real identity documents.

Two levels:
  * BASIC    — name plus a document reference.
  * ADVANCED — front and back images; requires an approved BASIC level.

Document numbers and stored image ids are never written to a log line, an audit
payload or a notification body.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import rate_limit, require_active_user, require_admin, require_user
from app.core.errors import NotFoundError
from app.db.models import (
    AuditAction, KycLevel, KycStatus, KycSubmission, User,
)
from app.db.session import get_db
from app.schemas.admin import ReasonIn
from app.schemas.common import PaginationParams, ok, paginate
from app.schemas.kyc import BasicKycIn, KycStatusOut, KycSubmissionOut
from app.services import audit_service, kyc_service, notification_service

router = APIRouter()
admin_router = APIRouter()

DEMO_NOTICE = kyc_service.DEMO_NOTICE


def _submission_model(submission: KycSubmission) -> KycSubmissionOut:
    return KycSubmissionOut(
        id=submission.id,
        level=submission.level,
        status=submission.status,
        full_name=submission.full_name,
        document_type=submission.document_type,
        document_number=submission.document_number,
        has_front_image=bool(submission.front_image_id),
        has_back_image=bool(submission.back_image_id),
        review_note=submission.review_note,
        created_at=submission.created_at,
        reviewed_at=submission.reviewed_at,
    )


def _submission_out(submission: KycSubmission) -> dict[str, Any]:
    return _submission_model(submission).model_dump(by_alias=True)


def _status_payload(db: Session, user: User) -> dict[str, Any]:
    return KycStatusOut(
        basic_status=kyc_service.status_for(db, user.id, KycLevel.BASIC),
        advanced_status=kyc_service.status_for(db, user.id, KycLevel.ADVANCED),
        can_submit_basic=kyc_service.can_submit(db, user.id, KycLevel.BASIC),
        can_submit_advanced=kyc_service.can_submit(db, user.id, KycLevel.ADVANCED),
        submissions=[_submission_model(s)
                     for s in kyc_service.list_submissions(db, user.id)],
        demo_notice=DEMO_NOTICE,
    ).model_dump(by_alias=True)


# --------------------------------------------------------------------------- #
# Customer routes
# --------------------------------------------------------------------------- #


@router.get("", summary="My verification status")
def get_status(user: User = Depends(require_user),
               db: Session = Depends(get_db)) -> dict[str, Any]:
    """Per-level simulated verification status and this account's history.

    Nothing here reflects a real identity check."""
    return ok(_status_payload(db, user))


@router.post("/basic", summary="Submit basic verification")
def submit_basic(payload: BasicKycIn, request: Request,
                 user: User = Depends(require_active_user),
                 db: Session = Depends(get_db),
                 _: None = Depends(rate_limit(5, 300, "kyc"))) -> dict[str, Any]:
    """Record a pending BASIC submission for simulated review.

    No document is validated against any issuer or registry."""
    submission = kyc_service.submit_basic(
        db, user, full_name=payload.full_name,
        document_type=payload.document_type,
        document_number=payload.document_number)

    # Deliberately excludes the document number.
    audit_service.record(
        db, AuditAction.KYC_SUBMITTED, actor=user, request=request,
        new_value={"submissionId": submission.id, "level": submission.level,
                   "documentType": submission.document_type,
                   "simulated": True})
    notification_service.notify(
        db, user.id, "Verification submitted",
        "Your basic verification details are pending review. "
        + DEMO_NOTICE,
        notification_service.ACCOUNT)
    db.commit()
    db.refresh(submission)
    return ok({"submission": _submission_out(submission),
               "status": _status_payload(db, user),
               "demoNotice": DEMO_NOTICE})


@router.post("/advanced", summary="Submit advanced verification")
def submit_advanced(request: Request,
                    front_image: UploadFile = File(..., alias="frontImage"),
                    back_image: UploadFile = File(..., alias="backImage"),
                    user: User = Depends(require_active_user),
                    db: Session = Depends(get_db),
                    _: None = Depends(rate_limit(5, 300, "kyc"))) -> dict[str, Any]:
    """Store the front and back images for simulated review.

    Requires an approved BASIC level. File type is decided by magic bytes, not
    by the client's filename or content type, and the client's filename is
    discarded. This is a demo — do not upload real identity documents."""
    kyc_service.assert_can_submit(db, user.id, KycLevel.ADVANCED)
    front = front_image.file.read(kyc_service.MAX_FILE_BYTES + 1)
    back = back_image.file.read(kyc_service.MAX_FILE_BYTES + 1)
    submission = kyc_service.submit_advanced(db, user, front=front, back=back)

    # Deliberately excludes the stored image ids and any personal data.
    audit_service.record(
        db, AuditAction.KYC_SUBMITTED, actor=user, request=request,
        new_value={"submissionId": submission.id, "level": submission.level,
                   "simulated": True})
    notification_service.notify(
        db, user.id, "Verification submitted",
        "Your document images are pending review. " + DEMO_NOTICE,
        notification_service.ACCOUNT)
    db.commit()
    db.refresh(submission)
    return ok({"submission": _submission_out(submission),
               "status": _status_payload(db, user),
               "demoNotice": DEMO_NOTICE})


@router.get("/documents/{submission_id}/{side}",
            summary="Stream one verification image")
def get_document(submission_id: str, side: str,
                 user: User = Depends(require_user),
                 db: Session = Depends(get_db)) -> FileResponse:
    """Stream the front or back image. Owner or administrator only.

    Anyone else gets 404, not 403, so a submission id cannot be probed."""
    not_found = NotFoundError("Document not found.", code="DOCUMENT_NOT_FOUND")
    submission = db.get(KycSubmission, submission_id)
    if submission is None:
        raise not_found
    if submission.user_id != user.id and not user.is_admin:
        raise not_found
    if side not in ("front", "back"):
        raise not_found

    stored_id = (submission.front_image_id if side == "front"
                 else submission.back_image_id)
    if not stored_id:
        raise not_found
    path = kyc_service.stored_path(stored_id)
    if not path.is_file():
        raise not_found
    return FileResponse(
        path, media_type=kyc_service.media_type_for(stored_id),
        headers={"Cache-Control": "private, no-store"})


# --------------------------------------------------------------------------- #
# Administration
# --------------------------------------------------------------------------- #


@admin_router.get("", summary="List verification submissions")
def admin_list(page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
               status: str | None = Query(None),
               level: str | None = Query(None),
               admin: User = Depends(require_admin),
               db: Session = Depends(get_db)) -> dict[str, Any]:
    """Paginated submissions, newest first, with the submitting user's identity.

    These are simulated submissions; approving one verifies nothing real."""
    params = PaginationParams(page=page, page_size=page_size)
    stmt = select(KycSubmission, User).join(User, User.id == KycSubmission.user_id)
    if status:
        stmt = stmt.where(KycSubmission.status == status.strip().upper())
    if level:
        stmt = stmt.where(KycSubmission.level == level.strip().upper())

    total = int(db.scalar(select(func.count()).select_from(stmt.subquery())) or 0)
    rows = db.execute(
        stmt.order_by(KycSubmission.created_at.desc(), KycSubmission.id.desc())
        .limit(params.page_size).offset(params.offset)).all()

    items = []
    for submission, owner in rows:
        row = _submission_out(submission)
        row.update({"userId": owner.id, "email": owner.email,
                    "username": owner.username})
        items.append(row)
    return ok(paginate(items, total, params))


def _review(db: Session, request: Request, admin: User, submission_id: str,
            body: ReasonIn, *, approved: bool) -> dict[str, Any]:
    submission = kyc_service.get_pending(db, submission_id)
    old_status = submission.status
    kyc_service.review(db, submission, approved=approved, reviewer=admin,
                       reason=body.reason.strip())

    # Deliberately excludes the document number and the stored image ids.
    audit_service.record(
        db, AuditAction.KYC_REVIEWED, actor=admin,
        target_user_id=submission.user_id,
        old_value={"status": old_status},
        new_value={"submissionId": submission.id, "level": submission.level,
                   "status": submission.status, "simulated": True},
        reason=body.reason.strip(), request=request)

    verb = "approved" if approved else "rejected"
    notification_service.notify(
        db, submission.user_id, f"Verification {verb}",
        f"Your {submission.level.lower()} verification was {verb}: "
        f"{body.reason.strip()}",
        notification_service.ACCOUNT)
    db.commit()
    db.refresh(submission)
    return ok({"submission": _submission_out(submission),
               "reason": body.reason.strip(),
               "demoNotice": DEMO_NOTICE})


@admin_router.post("/{submission_id}/approve",
                   summary="Approve a verification submission")
def admin_approve(submission_id: str, body: ReasonIn, request: Request,
                  admin: User = Depends(require_admin),
                  db: Session = Depends(get_db)) -> dict[str, Any]:
    """Mark a submission APPROVED. Requires a reason and writes an audit row.

    This confirms nothing about the person's real identity."""
    return _review(db, request, admin, submission_id, body, approved=True)


@admin_router.post("/{submission_id}/reject",
                   summary="Reject a verification submission")
def admin_reject(submission_id: str, body: ReasonIn, request: Request,
                 admin: User = Depends(require_admin),
                 db: Session = Depends(get_db)) -> dict[str, Any]:
    """Mark a submission REJECTED. The reason is shown to the user as reviewNote.

    The level may then be resubmitted."""
    return _review(db, request, admin, submission_id, body, approved=False)
