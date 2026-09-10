"""The reseller back office.

The panel is administrator-only: the AGENT role is a data relationship, not a
login into it. An administrator opens the panel and names whose downline to
read via `agentId`.

The property that matters most is still scoping — one reseller's customers must
never surface under another, and an unscoped request must answer empty rather
than falling back to the whole platform. The negative cases here are the point.
"""
from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from app.db.base import utcnow
from app.db.models import Role, Trade, TradeStatus, TransactionType, User
from app.services import invite_service, wallet_service
from tests.conftest import login


@pytest.fixture
def agent_user(user_factory) -> User:
    return user_factory(email="agent@example.com", username="agentone",
                        role=Role.AGENT, balance="0")


@pytest.fixture
def rival_agent(user_factory) -> User:
    return user_factory(email="rival@example.com", username="rivalagent",
                        role=Role.AGENT, balance="0")


def attach(db, member: User, agent: User) -> User:
    """Put a member in an agent's downline the way registration does."""
    member.agent_id = agent.id
    db.commit()
    db.refresh(member)
    return member


class TestAccessGate:
    def test_a_plain_member_cannot_reach_the_agent_api(self, client, demo_user):
        login(client, demo_user.email)
        for path in ("/api/agent/dashboard", "/api/agent/users", "/api/agent/trades"):
            assert client.get(path).status_code == 403, path

    def test_an_agent_account_cannot_open_the_panel(self, client, agent_user):
        """The AGENT role names a downline; it is not a login into the panel."""
        login(client, agent_user.email)
        for path in ("/api/agent/dashboard", "/api/agent/users", "/api/agent/directory"):
            assert client.get(path).status_code == 403, path

    def test_an_agent_cannot_reach_the_admin_api(self, client, agent_user):
        login(client, agent_user.email)
        for path in ("/api/admin/users", "/api/admin/dashboard", "/api/admin/settings"):
            assert client.get(path).status_code == 403, path

    def test_an_administrator_may_open_the_panel(self, client, admin_user):
        login(client, admin_user.email)
        assert client.get("/api/agent/dashboard").status_code == 200

    def test_an_unscoped_request_answers_empty_not_everything(
        self, client, seeded, admin_user, demo_user, agent_user
    ):
        """Without an agentId the panel shows nothing, never the whole platform."""
        attach(seeded, demo_user, agent_user)
        login(client, admin_user.email)
        for path in ("/api/agent/users", "/api/agent/trades", "/api/agent/deposits"):
            assert client.get(path).json()["data"]["meta"]["total"] == 0, path

    def test_the_directory_lists_agents_with_their_member_counts(
        self, client, seeded, admin_user, agent_user, user_factory
    ):
        attach(seeded, user_factory(email="m1@example.com", username="m1"), agent_user)
        login(client, admin_user.email)
        items = client.get("/api/agent/directory").json()["data"]["items"]
        row = next(i for i in items if i["id"] == agent_user.id)
        assert row["memberCount"] == 1


class TestScoping:
    def test_the_member_list_holds_only_this_agent_s_downline(
        self, client, seeded, admin_user, agent_user, rival_agent, user_factory
    ):
        mine = attach(seeded, user_factory(email="mine@example.com", username="mine"),
                      agent_user)
        theirs = user_factory(email="theirs@example.com", username="theirs")
        attach(seeded, theirs, rival_agent)
        user_factory(email="orphan@example.com", username="orphan")

        login(client, admin_user.email)
        body = client.get(f"/api/agent/users?agentId={agent_user.id}").json()["data"]

        assert body["meta"]["total"] == 1
        assert [row["id"] for row in body["items"]] == [mine.id]

    def test_reading_an_account_outside_the_downline_is_a_404_not_a_403(
        self, client, seeded, admin_user, agent_user, rival_agent, user_factory
    ):
        """A 403 would confirm the account exists. It must be indistinguishable
        from an id that was never real."""
        theirs = user_factory(email="theirs@example.com", username="theirs")
        attach(seeded, theirs, rival_agent)

        login(client, admin_user.email)
        outside = client.get(f"/api/agent/users/{theirs.id}?agentId={agent_user.id}")
        invented = client.get(
            f"/api/agent/users/00000000-0000-0000-0000-000000000000"
            f"?agentId={agent_user.id}")

        assert outside.status_code == 404
        assert invented.status_code == 404
        assert outside.json()["error"]["code"] == invented.json()["error"]["code"]

    def test_an_agent_reads_their_own_member(self, client, seeded, admin_user, agent_user, user_factory):
        mine = attach(seeded, user_factory(email="mine@example.com", username="mine"),
                      agent_user)
        login(client, admin_user.email)
        response = client.get(f"/api/agent/users/{mine.id}?agentId={agent_user.id}")
        assert response.status_code == 200
        assert response.json()["data"]["user"]["id"] == mine.id

    def test_positions_are_scoped_to_the_downline(
        self, client, seeded, admin_user, agent_user, rival_agent, user_factory
    ):
        mine = attach(seeded, user_factory(email="mine@example.com", username="mine",
                                           balance="500"), agent_user)
        theirs = user_factory(email="theirs@example.com", username="theirs", balance="500")
        attach(seeded, theirs, rival_agent)

        opened = utcnow()
        for owner in (mine, theirs):
            seeded.add(Trade(user_id=owner.id, symbol="BTC/USDT", direction="UP",
                             asset="DEMO_USDT", amount=Decimal("50"),
                             duration_seconds=30, payout_percent=Decimal("25"),
                             entry_price=Decimal("78600"), opens_at=opened,
                             expires_at=opened + timedelta(seconds=30),
                             status=TradeStatus.OPEN.value))
        seeded.commit()

        login(client, admin_user.email)
        body = client.get(f"/api/agent/trades?agentId={agent_user.id}").json()["data"]

        assert body["meta"]["total"] == 1
        assert body["items"][0]["userId"] == mine.id
        assert body["items"][0]["username"] == "mine"

    def test_an_agent_with_no_members_sees_empty_lists_not_everything(
        self, client, seeded, admin_user, agent_user, demo_user
    ):
        """The dangerous failure mode: an empty `IN ()` filter that matches all
        rows instead of none."""
        login(client, admin_user.email)
        for path in ("/api/agent/users", "/api/agent/trades", "/api/agent/deposits",
                     "/api/agent/withdrawals", "/api/agent/kyc"):
            body = client.get(f"{path}?agentId={agent_user.id}").json()["data"]
            assert body["meta"]["total"] == 0, path


class TestConsole:
    def test_the_console_counts_only_this_agent_s_people(
        self, client, seeded, admin_user, agent_user, rival_agent, user_factory
    ):
        attach(seeded, user_factory(email="a@example.com", username="a"), agent_user)
        attach(seeded, user_factory(email="b@example.com", username="b"), agent_user)
        attach(seeded, user_factory(email="c@example.com", username="c"), rival_agent)

        login(client, admin_user.email)
        data = client.get(
            f"/api/agent/dashboard?agentId={agent_user.id}").json()["data"]

        assert data["memberCount"] == 2
        assert data["activeMemberCount"] == 2
        assert data["subAgentCount"] == 0

    def test_sub_agents_are_counted_from_the_upline_column(
        self, client, seeded, admin_user, agent_user, user_factory
    ):
        sub = user_factory(email="sub@example.com", username="sub", role=Role.AGENT)
        sub.agent_parent_id = agent_user.id
        seeded.commit()

        login(client, admin_user.email)
        data = client.get(
            f"/api/agent/dashboard?agentId={agent_user.id}").json()["data"]
        assert data["subAgentCount"] == 1

        listing = client.get(
            f"/api/agent/agents?agentId={agent_user.id}").json()["data"]
        assert [row["id"] for row in listing["items"]] == [sub.id]


class TestInvites:
    def test_an_agent_invite_attaches_the_new_account_to_that_agent(
        self, client, seeded, admin_user, agent_user
    ):
        login(client, admin_user.email)
        created = client.post(
            f"/api/agent/invites?expiresInHours=48&agentId={agent_user.id}")
        assert created.status_code == 201, created.text
        code = created.json()["data"]["invite"]["code"]

        registered = client.post("/api/auth/register", json={
            "email": "recruit@example.com", "username": "recruit",
            "firstName": "Re", "lastName": "Cruit",
            "password": "StrongPass123", "confirmPassword": "StrongPass123",
            "inviteCode": code,
        })
        assert registered.status_code in (200, 201), registered.text

        recruit = seeded.query(User).filter_by(email="recruit@example.com").one()
        assert recruit.agent_id == agent_user.id

    def test_an_admin_invite_leaves_the_account_unattached(
        self, client, seeded, admin_user
    ):
        """Only an agent's invite creates a downline link — an administrator
        signing someone up does not silently make themselves their agent."""
        invite = invite_service.create(seeded, admin=admin_user)
        seeded.commit()

        registered = client.post("/api/auth/register", json={
            "email": "direct@example.com", "username": "direct",
            "firstName": "Di", "lastName": "Rect",
            "password": "StrongPass123", "confirmPassword": "StrongPass123",
            "inviteCode": invite.code,
        })
        assert registered.status_code in (200, 201), registered.text

        account = seeded.query(User).filter_by(email="direct@example.com").one()
        assert account.agent_id is None

    def test_an_invite_without_an_agent_is_refused(self, client, admin_user):
        """There would be no downline for the account to land in, so the
        route refuses rather than creating a dangling invite."""
        login(client, admin_user.email)
        response = client.post("/api/agent/invites")
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "AGENT_REQUIRED"


class TestNoPrivilegedActions:
    def test_the_agent_router_exposes_one_write_and_it_is_an_invitation(self):
        """A structural check on what the panel can change.

        The list is asserted exactly so that adding a second write route fails
        here first, and the decision gets made deliberately rather than by
        accident. Nothing on this router moves money, adjusts a balance, or
        touches a trade outcome — those stay with administrators.
        """
        from app.api.routes import agent as agent_routes

        writes = sorted(
            f"{sorted(route.methods)[0]} {route.path}"
            for route in agent_routes.router.routes
            if getattr(route, "methods", set()) - {"GET", "HEAD", "OPTIONS"}
        )
        assert writes == ["POST /invites"], writes


class TestBalanceTotals:
    def test_member_rows_carry_their_simulated_balance(
        self, client, seeded, admin_user, agent_user, user_factory
    ):
        member = attach(seeded, user_factory(email="rich@example.com", username="rich"),
                        agent_user)
        wallet_service.credit(seeded, member.id, "DEMO_USDT", Decimal("250"),
                              tx_type=TransactionType.ADMIN_CREDIT,
                              description="Test opening balance")
        seeded.commit()

        login(client, admin_user.email)
        body = client.get(f"/api/agent/users?agentId={agent_user.id}").json()["data"]
        assert body["items"][0]["totalDemoValue"] is not None
