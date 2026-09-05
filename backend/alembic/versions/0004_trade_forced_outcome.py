"""Per-trade forced outcome for QA scenarios.

Revision ID: 0004_trade_forced_outcome
Revises: 0003_invites
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0004_trade_forced_outcome"
down_revision = "0003_invites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("trades", sa.Column("forced_outcome", sa.String(length=10),
                                      nullable=True))


def downgrade() -> None:
    op.drop_column("trades", "forced_outcome")
