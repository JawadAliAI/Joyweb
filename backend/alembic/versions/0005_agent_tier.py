"""Reseller hierarchy: an agent's members and an agent's own upline.

Both columns are nullable self-references on `users`, so no backfill is needed
— every account that exists today simply belongs to nobody. The AGENT role is a
value in the existing `role` string column and needs no schema change.

Revision ID: 0005_agent_tier
Revises: 0004_trade_forced_outcome
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0005_agent_tier"
down_revision = "0004_trade_forced_outcome"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("agent_id", sa.String(length=36), nullable=True))
    op.add_column("users", sa.Column("agent_parent_id", sa.String(length=36), nullable=True))

    # Indexed because every agent-scoped query filters on agent_id.
    op.create_index("ix_users_agent_id", "users", ["agent_id"])
    op.create_index("ix_users_agent_parent_id", "users", ["agent_parent_id"])

    op.create_foreign_key("fk_users_agent_id", "users", "users",
                          ["agent_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_users_agent_parent_id", "users", "users",
                          ["agent_parent_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_users_agent_parent_id", "users", type_="foreignkey")
    op.drop_constraint("fk_users_agent_id", "users", type_="foreignkey")
    op.drop_index("ix_users_agent_parent_id", table_name="users")
    op.drop_index("ix_users_agent_id", table_name="users")
    op.drop_column("users", "agent_parent_id")
    op.drop_column("users", "agent_id")
