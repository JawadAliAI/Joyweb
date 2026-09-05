"""Customer support tickets.

Support is available to every account, including frozen ones — a restricted
demo account must still be able to ask why.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_user
from app.core.errors import NotFoundError
from app.db.models import (
    AuditAction, SupportMessage, SupportTicket, TicketStatus, User,
)
from app.db.session import get_db
from app.schemas.common import PaginationParams, ok, paginate
from app.schemas.support import (
    CATEGORY_LABELS, TICKET_CATEGORIES, MessageOut, TicketCreate, TicketOut,
    TicketReply,
)
from app.services import audit_service, notification_service

router = APIRouter()


def _message_model(message: SupportMessage) -> MessageOut:
    return MessageOut(
        id=message.id,
        ticket_id=message.ticket_id,
        author_id=message.author_id,
        is_staff_reply=message.is_staff_reply,
        body=message.body,
        created_at=message.created_at,
    )


def _message_out(message: SupportMessage) -> dict:
    return _message_model(message).model_dump(by_alias=True)


def _ticket_out(ticket: SupportTicket, *, with_messages: bool) -> dict:
    messages = list(ticket.messages or [])
    return TicketOut(
        id=ticket.id,
        subject=ticket.subject,
        category=ticket.category,
        category_label=CATEGORY_LABELS.get(ticket.category, ticket.category),
        status=ticket.status,
        created_at=ticket.created_at,
        updated_at=ticket.updated_at,
        message_count=len(messages),
        messages=[_message_model(m) for m in messages] if with_messages else [],
    ).model_dump(by_alias=True)


def _owned_ticket(db: Session, user: User, ticket_id: str) -> SupportTicket:
    ticket = db.scalar(select(SupportTicket).where(
        SupportTicket.id == ticket_id, SupportTicket.user_id == user.id))
    if ticket is None:
        # Same response whether it does not exist or belongs to someone else.
        raise NotFoundError("Support ticket not found.", code="TICKET_NOT_FOUND")
    return ticket


@router.get("/categories", summary="Support ticket categories")
def list_categories() -> dict:
    """The categories the ticket form may submit."""
    return ok({"categories": [{"value": value,
                               "label": CATEGORY_LABELS.get(value, value)}
                              for value in TICKET_CATEGORIES]})


@router.get("", summary="List my support tickets")
def list_tickets(page: int = Query(1, ge=1),
                 page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
                 status: str | None = Query(None),
                 user: User = Depends(require_user),
                 db: Session = Depends(get_db)) -> dict:
    """Paginated tickets belonging to the signed-in account, newest first."""
    params = PaginationParams(page=page, page_size=page_size)
    stmt = select(SupportTicket).where(SupportTicket.user_id == user.id)
    if status:
        stmt = stmt.where(SupportTicket.status == status.strip().upper())

    total = int(db.scalar(
        select(func.count()).select_from(stmt.subquery())) or 0)
    rows = list(db.scalars(stmt.order_by(SupportTicket.created_at.desc())
                           .limit(params.page_size).offset(params.offset)))
    return ok(paginate([_ticket_out(t, with_messages=False) for t in rows],
                       total, params))


@router.post("", summary="Open a support ticket")
def create_ticket(payload: TicketCreate, request: Request,
                  user: User = Depends(require_user),
                  db: Session = Depends(get_db)) -> dict:
    """Create a ticket with its first message and confirm it in-app."""
    ticket = SupportTicket(user_id=user.id, subject=payload.subject,
                           category=payload.category,
                           status=TicketStatus.OPEN.value)
    db.add(ticket)
    db.flush()

    db.add(SupportMessage(ticket_id=ticket.id, author_id=user.id,
                          is_staff_reply=False, body=payload.message))
    audit_service.record(db, AuditAction.SUPPORT_TICKET_CREATED, actor=user,
                         request=request,
                         new_value={"ticketId": ticket.id,
                                    "category": ticket.category})
    notification_service.notify(
        db, user.id, "Support ticket received",
        f'We have received your ticket "{ticket.subject}" and will reply here.',
        notification_service.ACCOUNT)
    db.commit()
    db.refresh(ticket)
    return ok(_ticket_out(ticket, with_messages=True))


@router.get("/{ticket_id}", summary="One of my support tickets")
def get_ticket(ticket_id: str, user: User = Depends(require_user),
               db: Session = Depends(get_db)) -> dict:
    """Full ticket with its message thread. Owner only."""
    ticket = _owned_ticket(db, user, ticket_id)
    return ok(_ticket_out(ticket, with_messages=True))


@router.post("/{ticket_id}/messages", summary="Reply to my support ticket")
def reply_to_ticket(ticket_id: str, payload: TicketReply,
                    user: User = Depends(require_user),
                    db: Session = Depends(get_db)) -> dict:
    """Append a reply. A resolved ticket reopens as IN_PROGRESS."""
    ticket = _owned_ticket(db, user, ticket_id)
    message = SupportMessage(ticket_id=ticket.id, author_id=user.id,
                             is_staff_reply=False, body=payload.message)
    db.add(message)
    if ticket.status == TicketStatus.RESOLVED.value:
        ticket.status = TicketStatus.IN_PROGRESS.value
    db.commit()
    db.refresh(ticket)
    db.refresh(message)
    return ok({"ticket": _ticket_out(ticket, with_messages=True),
               "message": _message_out(message)})
