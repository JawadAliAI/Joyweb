"""Rename the demo_label setting key to banner_label.

Revision ID: 0007_rename_banner_label
Revises: 0006_credit_score_100
"""
from __future__ import annotations

from alembic import op

revision = "0007_rename_banner_label"
down_revision = "0006_credit_score_100"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE platform_settings SET key = 'banner_label' WHERE key = 'demo_label'")


def downgrade() -> None:
    op.execute("UPDATE platform_settings SET key = 'demo_label' WHERE key = 'banner_label'")
