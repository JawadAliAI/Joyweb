"""Invitation-only registration.

The property that matters most is that one invitation admits exactly one
account — including when two registrations race for the same link.
"""
from __future__ import annotations

from datetime import timedelta

import pytest

from app.db.base import utcnow
from app.db.models import Invite
from app.services import invite_service, settings_service
from tests.conftest import login

BASE_ACCOUNT = {
    "username": "invitee",
    "firstName": "In",
    "lastName": "Vitee",
    "password": "StrongPass123",
    "confirmPassword": "StrongPass123",
}


def make_invite(db, admin, **kwargs) -> Invite:
    invite = invite_service.create(db, admin=admin, **kwargs)
    db.commit()
    return invite


class TestRegistrationGate:
    def test_registration_without_an_invite_is_refused_by_default(self, client):
        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "nobody@example.com"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVITE_REQUIRED"

    def test_a_valid_invite_lets_one_account_through(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "invitee@example.com",
            "inviteCode": invite.code})
        assert response.status_code in (200, 201), response.text
        assert response.json()["data"]["email"] == "invitee@example.com"

    def test_admin_can_open_registration_to_everyone(self, client, seeded):
        settings_service.set_value(seeded, "registration_requires_invite", False)
        seeded.commit()
        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "open@example.com"})
        assert response.status_code in (200, 201), response.text


class TestSingleUse:
    def test_an_invite_cannot_create_a_second_account(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        first = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "first@example.com", "inviteCode": invite.code})
        assert first.status_code in (200, 201), first.text

        client.cookies.clear()
        second = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "username": "second", "email": "second@example.com",
            "inviteCode": invite.code})
        assert second.status_code == 422
        assert second.json()["error"]["code"] in ("INVITE_INVALID", "INVITE_ALREADY_USED")

    def test_claim_is_atomic(self, seeded, admin_user, user_factory):
        """A second claim on the same row must fail even without the pre-check."""
        invite = make_invite(seeded, admin_user)
        one = user_factory(email="racer1@example.com", username="racer1")
        two = user_factory(email="racer2@example.com", username="racer2")

        invite_service.claim(seeded, invite.code, email=one.email, user_id=one.id)
        seeded.commit()

        from app.core.errors import ValidationError

        with pytest.raises(ValidationError):
            invite_service.claim(seeded, invite.code, email=two.email, user_id=two.id)

    def test_using_an_invite_marks_it_used(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "marked@example.com", "inviteCode": invite.code})

        seeded.expire_all()
        stored = seeded.get(Invite, invite.id)
        assert stored.used_at is not None
        assert stored.used_by is not None
        assert invite_service.status_of(stored) == invite_service.USED


class TestExpiryAndRevocation:
    def test_an_expired_invite_is_refused(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        invite.expires_at = utcnow() - timedelta(minutes=1)
        seeded.commit()

        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "late@example.com", "inviteCode": invite.code})
        assert response.status_code == 422

    def test_a_revoked_invite_is_refused(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        invite_service.revoke(seeded, invite.id, admin=admin_user, reason="No longer needed")
        seeded.commit()

        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "revoked@example.com", "inviteCode": invite.code})
        assert response.status_code == 422

    def test_an_unknown_code_is_refused(self, client):
        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "fake@example.com", "inviteCode": "not-a-real-code"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "INVITE_INVALID"

    def test_a_used_invite_cannot_be_revoked(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "done@example.com", "inviteCode": invite.code})
        seeded.expire_all()

        from app.core.errors import ValidationError

        with pytest.raises(ValidationError):
            invite_service.revoke(seeded, invite.id, admin=admin_user, reason="too late")


class TestEmailLock:
    def test_an_invite_locked_to_an_email_refuses_another(self, client, seeded,
                                                          admin_user):
        invite = make_invite(seeded, admin_user, email="wanted@example.com")
        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "someone.else@example.com",
            "inviteCode": invite.code})
        assert response.status_code == 422

    def test_the_matching_email_is_accepted(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user, email="wanted@example.com")
        response = client.post("/api/auth/register", json={
            **BASE_ACCOUNT, "email": "wanted@example.com", "inviteCode": invite.code})
        assert response.status_code in (200, 201), response.text


class TestPublicPreview:
    def test_a_valid_code_reports_valid(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        data = client.get(f"/api/auth/invite/{invite.code}").json()["data"]
        assert data["valid"] is True
        assert data["reason"] is None

    def test_an_unknown_code_reports_why(self, client):
        data = client.get("/api/auth/invite/nope").json()["data"]
        assert data["valid"] is False
        assert data["reason"]

    def test_the_preview_needs_no_authentication(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        assert client.get(f"/api/auth/invite/{invite.code}").status_code == 200

    def test_the_preview_does_not_leak_who_issued_it(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user, note="internal note")
        body = str(client.get(f"/api/auth/invite/{invite.code}").json())
        assert admin_user.email not in body
        assert "internal note" not in body


class TestAdminApi:
    def test_admin_can_generate_a_link(self, client, admin_user):
        login(client, admin_user.email)
        response = client.post("/api/admin/invites", json={
            "expiresInHours": 24, "reason": "New tester"})
        assert response.status_code in (200, 201), response.text
        invite = response.json()["data"]["invite"]
        assert invite["status"] == "ACTIVE"
        assert "/register?invite=" in invite["inviteUrl"]

    def test_generating_requires_a_reason(self, client, admin_user):
        login(client, admin_user.email)
        assert client.post("/api/admin/invites",
                           json={"reason": "  "}).status_code >= 400

    def test_a_customer_cannot_generate_invites(self, client, demo_user):
        login(client, demo_user.email)
        assert client.post("/api/admin/invites",
                           json={"reason": "let me in"}).status_code == 403

    def test_admin_can_list_and_filter(self, client, seeded, admin_user):
        make_invite(seeded, admin_user)
        login(client, admin_user.email)
        data = client.get("/api/admin/invites", params={"status": "ACTIVE"}).json()["data"]
        assert data["meta"]["total"] >= 1
        assert all(row["status"] == "ACTIVE" for row in data["items"])

    def test_admin_can_revoke(self, client, seeded, admin_user):
        invite = make_invite(seeded, admin_user)
        login(client, admin_user.email)
        response = client.post(f"/api/admin/invites/{invite.id}/revoke",
                               json={"reason": "Sent to the wrong person"})
        assert response.status_code == 200, response.text
        assert response.json()["data"]["invite"]["status"] == "REVOKED"

    def test_creating_an_invite_is_audited(self, client, seeded, admin_user):
        from sqlalchemy import select

        from app.db.models import AuditLog

        login(client, admin_user.email)
        client.post("/api/admin/invites", json={"reason": "Audit check"})
        actions = [row.action for row in seeded.scalars(select(AuditLog))]
        assert "INVITE_CREATED" in actions
