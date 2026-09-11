"""Rename deposit setting keys off the demo_ prefix.

Revision ID: 0008_rename_deposit_settings
Revises: 0007_rename_banner_label
"""
from __future__ import annotations

from alembic import op

revision = "0008_rename_deposit_settings"
down_revision = "0007_rename_banner_label"
branch_labels = None
depends_on = None

RENAMES = {
    "demo_deposit_max": "deposit_max",
    "demo_deposit_auto_credit": "deposit_auto_credit",
}


def upgrade() -> None:
    for old, new in RENAMES.items():
        op.execute(f"UPDATE platform_settings SET key = '{new}' WHERE key = '{old}'")


def downgrade() -> None:
    for old, new in RENAMES.items():
        op.execute(f"UPDATE platform_settings SET key = '{old}' WHERE key = '{new}'")
