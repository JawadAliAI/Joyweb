"""Administrator API integration tests.

Beyond checking that the back office works, these pin down the limits on
administrator power: no plaintext passwords, no unexplained balance changes, and
no scripted outcomes against ordinary customers.
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select

from app.db.models import AuditLog, TradeOutcome, UserStatus
from app.services import wallet_service
from tests.conftest import login

USDT = "DEMO_USDT"


def audit_actions(db) -> list[str]:
    return [row.action for row in db.scalars(select(AuditLog))]


class TestDashboard:
    def test_returns_metrics_and_chart_series(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        data = client.get("/api/admin/dashboard").json()["data"]
        assert data["metrics"]["totalUsers"] >= 2
        for series in ("registrations", "tradeVolume", "deposits", "withdrawals"):
            assert isinstance(data[series], list)


class TestUserManagement:
    def test_users_are_listed_with_their_demo_balance(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        data = client.get("/api/admin/users").json()["data"]
        row = next(item for item in data["items"] if item["email"] == demo_user.email)
        assert Decimal(row["totalDemoValue"]) == Decimal("1000")

    def test_user_detail_never_exposes_a_password_hash(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        body = client.get(f"/api/admin/users/{demo_user.id}").json()
        serialised = str(body).lower()
        assert "password_hash" not in serialised
        # An Argon2 digest always starts with this prefix; the word "argon2" on
        # its own is fine, since the response explains the hashing policy.
        assert "$argon2" not in serialised
        assert "testpass12345" not in serialised

    def test_search_filters_the_list(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        data = client.get("/api/admin/users", params={"search": demo_user.username}).json()["data"]
        assert all(demo_user.username in item["username"] for item in data["items"])


class TestBalanceAdjustment:
    def test_crediting_raises_the_balance_and_is_audited(
        self, client, seeded, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/balance/credit",
                               json={"asset": USDT, "amount": "500",
                                     "reason": "Testing top-up"})
        assert response.status_code == 200, response.text

        seeded.expire_all()
        assert wallet_service.get_wallet(seeded, demo_user.id, USDT).available == \
            Decimal("1500.00000000")
        assert "BALANCE_CREDITED" in audit_actions(seeded)

    def test_debiting_lowers_the_balance(self, client, seeded, admin_user, demo_user):
        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/balance/debit",
                    json={"asset": USDT, "amount": "300", "reason": "Correction"})
        seeded.expire_all()
        assert wallet_service.get_wallet(seeded, demo_user.id, USDT).available == \
            Decimal("700.00000000")

    def test_a_debit_cannot_overdraw(self, client, seeded, admin_user, demo_user):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/balance/debit",
                               json={"asset": USDT, "amount": "99999",
                                     "reason": "Should fail"})
        assert response.status_code >= 400
        seeded.expire_all()
        assert wallet_service.get_wallet(seeded, demo_user.id, USDT).available == \
            Decimal("1000.00000000")

    def test_an_adjustment_without_a_reason_is_refused(self, client, admin_user, demo_user):
        """Nothing may change a balance silently."""
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/balance/credit",
                               json={"asset": USDT, "amount": "100", "reason": ""})
        assert response.status_code >= 400

    def test_a_customer_cannot_adjust_a_balance(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/balance/credit",
                               json={"asset": USDT, "amount": "1000000",
                                     "reason": "Nice try"})
        assert response.status_code == 403


class TestFreeze:
    def test_freezing_records_the_reason_and_who_did_it(
        self, client, seeded, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/freeze",
                               json={"reason": "Suspicious demo activity"})
        assert response.status_code == 200, response.text

        seeded.expire_all()
        seeded.refresh(demo_user)
        assert demo_user.status == UserStatus.FROZEN.value
        assert demo_user.freeze_reason == "Suspicious demo activity"
        assert demo_user.frozen_at is not None
        assert demo_user.frozen_by == admin_user.id
        assert "ACCOUNT_FROZEN" in audit_actions(seeded)

    def test_freezing_without_a_reason_is_refused(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        assert client.post(f"/api/admin/users/{demo_user.id}/freeze",
                           json={"reason": "   "}).status_code >= 400

    def test_unfreezing_restores_access(self, client, seeded, admin_user, demo_user):
        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/freeze",
                    json={"reason": "Temporary hold"})
        client.post(f"/api/admin/users/{demo_user.id}/unfreeze",
                    json={"reason": "Review complete"})

        seeded.expire_all()
        seeded.refresh(demo_user)
        assert demo_user.status == UserStatus.ACTIVE.value
        assert "ACCOUNT_UNFROZEN" in audit_actions(seeded)


class TestCreditScore:
    def test_changing_the_score_writes_history_and_an_audit_entry(
        self, client, seeded, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/credit-score",
                               json={"score": 85, "reason": "Demo account adjustment"})
        assert response.status_code == 200, response.text

        seeded.expire_all()
        seeded.refresh(demo_user)
        assert demo_user.credit_score == 85
        assert "CREDIT_SCORE_CHANGED" in audit_actions(seeded)

        history = client.get(f"/api/admin/users/{demo_user.id}").json()["data"]
        assert history["creditScoreHistory"][0]["oldScore"] == 70
        assert history["creditScoreHistory"][0]["newScore"] == 85

    def test_the_score_is_clamped_to_its_documented_range(
        self, client, seeded, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/credit-score",
                    json={"score": 9999, "reason": "Out of range"})
        seeded.expire_all()
        seeded.refresh(demo_user)
        assert 1 <= demo_user.credit_score <= 100


class TestPasswordReset:
    def test_an_admin_can_only_issue_a_reset_never_read_a_password(
        self, client, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        body = client.post(f"/api/admin/users/{demo_user.id}/password-reset",
                           json={"reason": "User request"}).json()
        assert body["success"] is True
        serialised = str(body).lower()
        assert "testpass12345" not in serialised
        assert "passwordhash" not in serialised


class TestWithdrawalReview:
    def _create_withdrawal(self, client, demo_user) -> str:
        login(client, demo_user.email)
        created = client.post("/api/withdrawals/demo", json={
            "networkId": "DEMO_USDT-TRC", "amount": "500",
            "address": "DemoAddress1234567890",
            "fundPassword": "Fund1234"}).json()["data"]
        client.post("/api/auth/logout")
        client.cookies.clear()
        client.headers.pop("x-csrf-token", None)
        return created["id"]

    def test_approving_consumes_the_locked_funds(
        self, client, seeded, admin_user, demo_user,
    ):
        withdrawal_id = self._create_withdrawal(client, demo_user)
        login(client, admin_user.email)

        response = client.post(f"/api/admin/withdrawals/{withdrawal_id}/approve",
                               json={"reason": "Reviewed"})
        assert response.status_code == 200, response.text

        seeded.expire_all()
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("500.00000000")
        assert wallet.locked == Decimal("0E-8")

    def test_rejecting_returns_the_locked_funds(
        self, client, seeded, admin_user, demo_user,
    ):
        withdrawal_id = self._create_withdrawal(client, demo_user)
        login(client, admin_user.email)

        client.post(f"/api/admin/withdrawals/{withdrawal_id}/reject",
                    json={"reason": "Invalid demo address"})

        seeded.expire_all()
        wallet = wallet_service.get_wallet(seeded, demo_user.id, USDT)
        assert wallet.available == Decimal("1000.00000000")
        assert wallet.locked == Decimal("0E-8")


class TestTestScenarios:
    """The scripted-outcome feature must stay confined to QA accounts."""

    def test_a_scenario_can_target_a_designated_test_account(
        self, client, admin_user, user_factory,
    ):
        qa_user = user_factory(email="qa2@example.com", username="qa2",
                               is_test_account=True)
        login(client, admin_user.email)

        response = client.post("/api/admin/test-scenarios", json={
            "targetUserId": qa_user.id, "forcedOutcome": TradeOutcome.WIN.value,
            "label": "QA win path", "reason": "Regression testing"})
        assert response.status_code in (200, 201), response.text
        assert response.json()["data"]["isTestScenario"] is True

    def test_a_scenario_is_refused_against_an_ordinary_customer(
        self, client, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        response = client.post("/api/admin/test-scenarios", json={
            "targetUserId": demo_user.id, "forcedOutcome": TradeOutcome.WIN.value,
            "label": "Should be impossible", "reason": "Attempt"})
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "NOT_A_TEST_ACCOUNT"

    def test_creating_a_scenario_is_audited(
        self, client, seeded, admin_user, user_factory,
    ):
        qa_user = user_factory(email="qa3@example.com", username="qa3",
                               is_test_account=True)
        login(client, admin_user.email)
        client.post("/api/admin/test-scenarios", json={
            "targetUserId": qa_user.id, "forcedOutcome": TradeOutcome.LOSS.value,
            "label": "QA loss path", "reason": "Regression testing"})

        assert "TEST_SCENARIO_CREATED" in audit_actions(seeded)


class TestSettings:
    def test_settings_are_grouped_for_the_admin_ui(self, client, admin_user):
        login(client, admin_user.email)
        data = client.get("/api/admin/settings").json()["data"]
        groups = {item["group"] for item in data["groups"]}
        assert {"branding", "trading", "withdrawal"} <= groups

    def test_updating_a_setting_takes_effect_and_is_audited(
        self, client, seeded, admin_user,
    ):
        login(client, admin_user.email)
        response = client.patch("/api/admin/settings",
                                json={"values": {"withdrawal_min_amount": "25"},
                                      "reason": "Raising the demo minimum"})
        assert response.status_code == 200, response.text

        from app.services import settings_service

        assert settings_service.get(seeded, "withdrawal_min_amount") == "25"
        assert "SETTINGS_UPDATED" in audit_actions(seeded)

    def test_an_unknown_setting_key_is_refused(self, client, admin_user):
        login(client, admin_user.email)
        response = client.patch("/api/admin/settings",
                                json={"values": {"not_a_real_setting": "x"},
                                      "reason": "Should be refused"})
        assert response.status_code >= 400


class TestAuditLog:
    def test_the_log_is_queryable_and_records_the_actor(
        self, client, admin_user, demo_user,
    ):
        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/credit-score",
                    json={"score": 80, "reason": "Adjustment"})

        data = client.get("/api/admin/audit-logs",
                          params={"action": "CREDIT_SCORE_CHANGED"}).json()["data"]
        assert data["items"], "the adjustment should appear in the audit log"
        entry = data["items"][0]
        assert entry["actorEmail"] == admin_user.email
        assert entry["targetUserId"] == demo_user.id
        assert entry["reason"] == "Adjustment"

    def test_a_customer_cannot_read_the_audit_log(self, client, demo_user):
        login(client, demo_user.email)
        assert client.get("/api/admin/audit-logs").status_code == 403


class TestTestAccountFlag:
    """Flagging is the only route to a scripted outcome, and it stays visible."""

    def test_admin_can_flag_and_unflag_an_account(self, client, seeded, admin_user,
                                                  demo_user):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/test-account",
                               json={"isTestAccount": True, "reason": "QA cycle"})
        assert response.status_code == 200, response.text
        assert response.json()["data"]["isTestAccount"] is True

        seeded.expire_all()
        seeded.refresh(demo_user)
        assert demo_user.is_test_account is True

        client.post(f"/api/admin/users/{demo_user.id}/test-account",
                    json={"isTestAccount": False, "reason": "QA finished"})
        seeded.expire_all()
        seeded.refresh(demo_user)
        assert demo_user.is_test_account is False

    def test_flagging_requires_a_reason(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/test-account",
                               json={"isTestAccount": True, "reason": "  "})
        assert response.status_code >= 400

    def test_flagging_is_audited(self, client, seeded, admin_user, demo_user):
        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/test-account",
                    json={"isTestAccount": True, "reason": "QA cycle"})
        assert "USER_UPDATED" in audit_actions(seeded)

    def test_a_customer_cannot_flag_themselves(self, client, demo_user):
        login(client, demo_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/test-account",
                               json={"isTestAccount": True, "reason": "let me win"})
        assert response.status_code == 403

    def test_flagging_unlocks_scenarios_for_that_account_only(
        self, client, seeded, admin_user, demo_user, user_factory,
    ):
        other = user_factory(email="other@example.com", username="otheruser")
        login(client, admin_user.email)

        # Refused before the flag is set.
        before = client.post("/api/admin/test-scenarios", json={
            "targetUserId": demo_user.id, "forcedOutcome": "WIN",
            "label": "QA", "reason": "test"})
        assert before.status_code == 403
        assert before.json()["error"]["code"] == "NOT_A_TEST_ACCOUNT"

        client.post(f"/api/admin/users/{demo_user.id}/test-account",
                    json={"isTestAccount": True, "reason": "QA cycle"})

        after = client.post("/api/admin/test-scenarios", json={
            "targetUserId": demo_user.id, "forcedOutcome": "WIN",
            "label": "QA", "reason": "test"})
        assert after.status_code in (200, 201), after.text

        # An unflagged account is still refused.
        still = client.post("/api/admin/test-scenarios", json={
            "targetUserId": other.id, "forcedOutcome": "WIN",
            "label": "QA", "reason": "test"})
        assert still.status_code == 403


class TestForceNextTrade:
    """One-click QA setup keeps every guarantee the two-step flow had."""

    def test_it_flags_the_account_and_queues_the_outcome(self, client, seeded,
                                                         admin_user, demo_user):
        login(client, admin_user.email)
        response = client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                               json={"forcedOutcome": "WIN", "reason": "Demo run"})
        assert response.status_code == 200, response.text
        data = response.json()["data"]
        assert data["forcedOutcome"] == "WIN"
        assert data["accountNewlyFlagged"] is True
        assert data["isTestScenario"] is True
        # No open trade, so it is queued for the next one.
        assert data["appliedToOpenTrade"] is False

        seeded.expire_all()
        seeded.refresh(demo_user)
        assert demo_user.is_test_account is True

    def test_the_customer_is_told_their_account_is_flagged(self, client, seeded,
                                                           admin_user, demo_user):
        from sqlalchemy import select

        from app.db.models import Notification

        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                    json={"forcedOutcome": "LOSS", "reason": "Demo run"})

        titles = [n.title for n in seeded.scalars(
            select(Notification).where(Notification.user_id == demo_user.id))]
        assert any("test account" in title.lower() for title in titles)

    def test_it_requires_a_reason(self, client, admin_user, demo_user):
        login(client, admin_user.email)
        assert client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                           json={"forcedOutcome": "WIN",
                                 "reason": "  "}).status_code >= 400

    def test_a_customer_cannot_call_it(self, client, demo_user):
        login(client, demo_user.email)
        assert client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                           json={"forcedOutcome": "WIN",
                                 "reason": "let me win"}).status_code == 403

    def test_both_steps_are_audited(self, client, seeded, admin_user, demo_user):
        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                    json={"forcedOutcome": "WIN", "reason": "Demo run"})
        actions = audit_actions(seeded)
        assert "USER_UPDATED" in actions
        assert "TEST_SCENARIO_CREATED" in actions

    def test_it_supersedes_an_already_queued_outcome(self, client, seeded,
                                                     admin_user, demo_user):
        """The button says "next trade", so the newest press must be the one that fires."""
        from sqlalchemy import select

        from app.db.models import TradeTestScenario

        login(client, admin_user.email)
        client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                    json={"forcedOutcome": "DRAW", "reason": "First"})
        response = client.post(f"/api/admin/users/{demo_user.id}/force-next-trade",
                               json={"forcedOutcome": "WIN", "reason": "Second"})
        assert response.status_code == 200, response.text
        assert response.json()["data"]["supersededScenarios"] == 1

        seeded.expire_all()
        pending = list(seeded.scalars(
            select(TradeTestScenario).where(
                TradeTestScenario.target_user_id == demo_user.id,
                TradeTestScenario.consumed.is_(False))))
        assert len(pending) == 1
        assert pending[0].forced_outcome == "WIN"
