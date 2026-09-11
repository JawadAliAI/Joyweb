"""Tests for the SIMULATED identity-verification flow.

Nothing here exercises a real identity check — the platform performs none.
"""
from __future__ import annotations

import io

import pytest

from tests.conftest import login

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 256
NOT_AN_IMAGE = b"%PDF-1.7\n" + b"\x00" * 64

BASIC_BODY = {"fullName": "Demo Tester", "documentType": "LICENSE",
              "documentNumber": "DL-99887766"}


@pytest.fixture(autouse=True)
def _upload_dir(tmp_path, monkeypatch):
    """Keep uploaded demo images inside the test's temporary directory."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "KYC_UPLOAD_DIR", str(tmp_path / "kyc"))


def _images(front: bytes = PNG, back: bytes = PNG) -> dict:
    return {"frontImage": ("f.png", io.BytesIO(front), "image/png"),
            "backImage": ("b.png", io.BytesIO(back), "image/png")}


def _approve_basic(client, demo_user, admin_user) -> str:
    """Submit basic KYC as the demo user and approve it as the admin."""
    login(client, demo_user.email)
    submission_id = client.post("/api/kyc/basic", json=BASIC_BODY
                                ).json()["data"]["submission"]["id"]
    login(client, admin_user.email)
    response = client.post(f"/api/admin/kyc/{submission_id}/approve",
                           json={"reason": "Simulated demo approval."})
    assert response.status_code == 200, response.text
    login(client, demo_user.email)
    return submission_id


def test_status_starts_unsubmitted(client, demo_user):
    login(client, demo_user.email)
    data = client.get("/api/kyc").json()["data"]
    assert data["basicStatus"] == "NOT_SUBMITTED"
    assert data["advancedStatus"] == "NOT_SUBMITTED"
    assert data["canSubmitBasic"] is True
    assert data["canSubmitAdvanced"] is False
    assert data["submissions"] == []
    assert isinstance(data["demoNotice"], str)


def test_basic_submit_is_pending(client, demo_user):
    login(client, demo_user.email)
    response = client.post("/api/kyc/basic", json=BASIC_BODY)
    assert response.status_code == 200, response.text
    submission = response.json()["data"]["submission"]
    assert submission["status"] == "PENDING"
    assert submission["level"] == "BASIC"
    assert submission["fullName"] == "Demo Tester"

    status = client.get("/api/kyc").json()["data"]
    assert status["basicStatus"] == "PENDING"
    assert status["canSubmitBasic"] is False


def test_duplicate_basic_while_pending_is_refused(client, demo_user):
    login(client, demo_user.email)
    client.post("/api/kyc/basic", json=BASIC_BODY)
    response = client.post("/api/kyc/basic", json=BASIC_BODY)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "KYC_ALREADY_PENDING"


def test_advanced_requires_approved_basic(client, demo_user):
    login(client, demo_user.email)
    response = client.post("/api/kyc/advanced", files=_images())
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "BASIC_KYC_REQUIRED"


def test_advanced_flow_after_basic_approval(client, demo_user, admin_user):
    _approve_basic(client, demo_user, admin_user)
    status = client.get("/api/kyc").json()["data"]
    assert status["basicStatus"] == "APPROVED"
    assert status["canSubmitAdvanced"] is True

    response = client.post("/api/kyc/advanced", files=_images())
    assert response.status_code == 200, response.text
    submission = response.json()["data"]["submission"]
    assert submission["status"] == "PENDING"
    assert submission["hasFrontImage"] is True
    assert submission["hasBackImage"] is True

    document = client.get(f"/api/kyc/documents/{submission['id']}/front")
    assert document.status_code == 200
    assert document.headers["cache-control"] == "private, no-store"


def test_non_image_upload_is_refused(client, demo_user, admin_user):
    _approve_basic(client, demo_user, admin_user)
    response = client.post("/api/kyc/advanced",
                           files=_images(front=NOT_AN_IMAGE))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"


def test_reject_then_resubmit(client, demo_user, admin_user):
    login(client, demo_user.email)
    submission_id = client.post("/api/kyc/basic", json=BASIC_BODY
                                ).json()["data"]["submission"]["id"]

    login(client, admin_user.email)
    response = client.post(f"/api/admin/kyc/{submission_id}/reject",
                           json={"reason": "Simulated rejection: unreadable."})
    assert response.status_code == 200, response.text
    assert response.json()["data"]["submission"]["status"] == "REJECTED"

    login(client, demo_user.email)
    status = client.get("/api/kyc").json()["data"]
    assert status["basicStatus"] == "REJECTED"
    assert status["canSubmitBasic"] is True
    assert status["submissions"][0]["reviewNote"] == "Simulated rejection: unreadable."

    again = client.post("/api/kyc/basic", json=BASIC_BODY)
    assert again.status_code == 200
    assert again.json()["data"]["submission"]["status"] == "PENDING"


def test_admin_review_requires_reason(client, demo_user, admin_user):
    login(client, demo_user.email)
    submission_id = client.post("/api/kyc/basic", json=BASIC_BODY
                                ).json()["data"]["submission"]["id"]
    login(client, admin_user.email)
    response = client.post(f"/api/admin/kyc/{submission_id}/approve",
                           json={"reason": ""})
    assert response.status_code == 422


def test_non_owner_gets_404_on_document(client, demo_user, admin_user,
                                        user_factory):
    _approve_basic(client, demo_user, admin_user)
    submission_id = client.post("/api/kyc/advanced", files=_images()
                                ).json()["data"]["submission"]["id"]

    other = user_factory(email="other@example.com", username="otheruser")
    login(client, other.email)
    response = client.get(f"/api/kyc/documents/{submission_id}/front")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "DOCUMENT_NOT_FOUND"


def test_customer_cannot_reach_admin_kyc_routes(client, demo_user):
    login(client, demo_user.email)
    assert client.get("/api/admin/kyc").status_code == 403
    assert client.post("/api/admin/kyc/whatever/approve",
                       json={"reason": "nope"}).status_code == 403


def test_admin_list_includes_user_identity(client, demo_user, admin_user):
    login(client, demo_user.email)
    client.post("/api/kyc/basic", json=BASIC_BODY)
    login(client, admin_user.email)
    data = client.get("/api/admin/kyc", params={"status": "PENDING",
                                                "level": "BASIC"}).json()["data"]
    assert data["meta"]["total"] == 1
    row = data["items"][0]
    assert row["email"] == demo_user.email
    assert row["username"] == demo_user.username
