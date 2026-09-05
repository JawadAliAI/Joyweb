"""Authentication and authorisation integration tests."""
from __future__ import annotations

import pytest

from app.db.models import Role, UserStatus
from app.services import settings_service
from tests.conftest import login

REGISTRATION = {
    "email": "newuser@example.com",
    "username": "newuser",
    "firstName": "New",
    "lastName": "User",
    "password": "StrongPass123",
    "confirmPassword": "StrongPass123",
}


class TestRegistration:
    """Registration mechanics.

    The invitation gate is covered in `test_invites.py`; these tests open
    registration so they exercise the account-creation path itself.
    """

    @pytest.fixture(autouse=True)
    def _open_registration(self, seeded):
        settings_service.set_value(seeded, "registration_requires_invite", False)
        seeded.commit()

    def test_registration_creates_a_session_and_returns_the_user(self, client):
        response = client.post("/api/auth/register", json=REGISTRATION)
        assert response.status_code in (200, 201), response.text
        body = response.json()
        assert body["success"] is True
        assert body["data"]["email"] == "newuser@example.com"
        assert client.cookies.get("cd_access")

    def test_registration_never_returns_a_password_or_hash(self, client):
        body = client.post("/api/auth/register", json=REGISTRATION).json()
        serialised = str(body).lower()
        assert "passwordhash" not in serialised
        assert "strongpass123" not in serialised

    def test_duplicate_email_is_refused(self, client):
        client.post("/api/auth/register", json=REGISTRATION)
        client.cookies.clear()
        duplicate = {**REGISTRATION, "username": "different"}
        response = client.post("/api/auth/register", json=duplicate)
        assert response.status_code >= 400
        assert response.json()["success"] is False

    def test_weak_password_is_refused(self, client):
        response = client.post("/api/auth/register",
                               json={**REGISTRATION, "password": "short",
                                     "confirmPassword": "short"})
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_a_new_account_starts_with_demo_wallets(self, client):
        client.post("/api/auth/register", json=REGISTRATION)
        csrf = client.cookies.get("cd_csrf")
        if csrf:
            client.headers["x-csrf-token"] = csrf
        wallet = client.get("/api/wallet").json()["data"]
        assets = {row["asset"] for row in wallet["assets"]}
        assert {"DEMO_USDT", "DEMO_BTC", "DEMO_ETH"} <= assets


class TestLogin:
    def test_valid_credentials_are_accepted(self, client, demo_user):
        response = client.post("/api/auth/login",
                               json={"email": demo_user.email, "password": "TestPass12345"})
        assert response.status_code == 200, response.text
        assert client.cookies.get("cd_access")

    def test_invalid_password_is_rejected(self, client, demo_user):
        response = client.post("/api/auth/login",
                               json={"email": demo_user.email, "password": "WrongPass123"})
        assert response.status_code == 401

    def test_the_error_does_not_reveal_whether_the_account_exists(self, client, demo_user):
        """Identical responses prevent account enumeration."""
        unknown = client.post("/api/auth/login",
                              json={"email": "nobody@example.com", "password": "WrongPass123"})
        wrong_password = client.post(
            "/api/auth/login", json={"email": demo_user.email, "password": "WrongPass123"})
        assert unknown.status_code == wrong_password.status_code
        assert unknown.json()["error"]["message"] == wrong_password.json()["error"]["message"]

    def test_a_suspended_account_cannot_sign_in(self, client, user_factory):
        user = user_factory(email="susp@example.com", username="suspended",
                            status=UserStatus.SUSPENDED)
        response = client.post("/api/auth/login",
                               json={"email": user.email, "password": "TestPass12345"})
        assert response.status_code == 403

    def test_a_frozen_account_can_still_sign_in(self, client, user_factory):
        """A restricted customer keeps read access and the route to support."""
        user = user_factory(email="frozen@example.com", username="frozenuser",
                            status=UserStatus.FROZEN)
        response = client.post("/api/auth/login",
                               json={"email": user.email, "password": "TestPass12345"})
        assert response.status_code == 200


class TestSession:
    def test_me_requires_authentication(self, client):
        assert client.get("/api/auth/me").status_code == 401

    def test_me_returns_the_signed_in_user(self, client, demo_user):
        login(client, demo_user.email)
        data = client.get("/api/auth/me").json()["data"]
        assert data["email"] == demo_user.email
        assert data["demoMode"] is True
        assert data["hasFundPassword"] is True

    def test_me_never_exposes_a_hash(self, client, demo_user):
        login(client, demo_user.email)
        serialised = str(client.get("/api/auth/me").json()).lower()
        assert "hash" not in serialised or "hasfundpassword" in serialised
        assert "argon2" not in serialised

    def test_logout_clears_the_session(self, client, demo_user):
        login(client, demo_user.email)
        assert client.post("/api/auth/logout").status_code == 200
        client.headers.pop("x-csrf-token", None)
        assert client.get("/api/auth/me").status_code == 401


class TestCsrf:
    def test_a_cookie_authenticated_mutation_without_the_header_is_refused(
        self, client, demo_user,
    ):
        client.post("/api/auth/login",
                    json={"email": demo_user.email, "password": "TestPass12345"})
        # Deliberately omit the x-csrf-token header the browser client would send.
        response = client.post("/api/deposits/demo",
                               json={"asset": "DEMO_USDT", "amount": "100"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "CSRF_FAILED"


class TestPasswordReset:
    def test_forgot_password_responds_identically_for_unknown_accounts(
        self, client, demo_user,
    ):
        known = client.post("/api/auth/forgot-password", json={"email": demo_user.email})
        unknown = client.post("/api/auth/forgot-password",
                              json={"email": "ghost@example.com"})
        assert known.status_code == unknown.status_code == 200

    def test_a_reset_token_lets_the_user_set_a_new_password(self, client, demo_user):
        issued = client.post("/api/auth/forgot-password",
                             json={"email": demo_user.email}).json()["data"]
        token = issued.get("devToken")
        assert token, "the development environment should surface the token for testing"

        reset = client.post("/api/auth/reset-password",
                            json={"token": token, "newPassword": "BrandNewPass123"})
        assert reset.status_code == 200

        assert client.post("/api/auth/login",
                           json={"email": demo_user.email,
                                 "password": "BrandNewPass123"}).status_code == 200

    def test_a_reset_token_cannot_be_replayed(self, client, demo_user):
        token = client.post("/api/auth/forgot-password",
                            json={"email": demo_user.email}).json()["data"]["devToken"]
        client.post("/api/auth/reset-password",
                    json={"token": token, "newPassword": "BrandNewPass123"})
        second = client.post("/api/auth/reset-password",
                             json={"token": token, "newPassword": "AnotherPass123"})
        assert second.status_code >= 400


class TestAuthorisation:
    def test_a_customer_cannot_reach_the_admin_api(self, client, demo_user):
        login(client, demo_user.email)
        assert client.get("/api/admin/users").status_code == 403

    def test_an_administrator_can(self, client, admin_user):
        login(client, admin_user.email)
        assert client.get("/api/admin/users").status_code == 200

    def test_the_admin_api_requires_authentication(self, client):
        assert client.get("/api/admin/dashboard").status_code == 401


class TestSystem:
    def test_health_reports_demo_mode(self, client):
        body = client.get("/health").json()
        assert body["data"]["demoMode"] is True

    def test_every_response_advertises_demo_mode(self, client):
        assert client.get("/health").headers["x-demo-mode"] == "true"

    def test_security_headers_are_present(self, client):
        headers = client.get("/health").headers
        assert headers["x-content-type-options"] == "nosniff"
        assert headers["x-frame-options"] == "DENY"

    def test_platform_config_is_public(self, client):
        body = client.get("/api/platform/config").json()
        assert body["success"] is True
        assert body["data"]["demoMode"] is True


class TestProfileUpdate:
    def test_a_user_can_update_their_own_details(self, client, demo_user):
        login(client, demo_user.email)
        response = client.patch("/api/auth/profile", json={
            "firstName": "Updated", "lastName": "Name",
            "username": "updatedname", "avatarUrl": None})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["firstName"] == "Updated"
        assert data["username"] == "updatedname"

    def test_a_username_already_in_use_is_refused(self, client, demo_user, user_factory):
        user_factory(email="taken@example.com", username="takenname", balance="0")
        login(client, demo_user.email)
        response = client.patch("/api/auth/profile", json={
            "firstName": "A", "lastName": "B", "username": "takenname"})
        assert response.status_code >= 400
        assert response.json()["error"]["code"] == "USERNAME_TAKEN"

    def test_keeping_your_own_username_is_allowed(self, client, demo_user):
        login(client, demo_user.email)
        response = client.patch("/api/auth/profile", json={
            "firstName": "Same", "lastName": "User",
            "username": demo_user.username})
        assert response.status_code == 200, response.text

    def test_the_update_is_audited(self, client, seeded, demo_user):
        from sqlalchemy import select

        from app.db.models import AuditLog

        login(client, demo_user.email)
        client.patch("/api/auth/profile", json={
            "firstName": "Audited", "lastName": "Change", "username": "auditedname"})

        actions = [row.action for row in seeded.scalars(select(AuditLog))]
        assert "USER_UPDATED" in actions

    def test_it_requires_authentication(self, client):
        response = client.patch("/api/auth/profile", json={
            "firstName": "X", "lastName": "Y", "username": "anon123"})
        assert response.status_code == 401
