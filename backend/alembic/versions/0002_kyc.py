"""simulated KYC submissions

Adds `kyc_submissions`, backing the SIMULATED identity-verification flow. This
is a demo platform: no row in this table represents a real identity check, and
users are told never to upload real identity documents.

Revision ID: 0002_kyc
Revises: 0001_initial_schema
Create Date: 2026-01-02 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0002_kyc"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

NOW = sa.text("CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "kyc_submissions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("level", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("full_name", sa.String(160), nullable=True),
        sa.Column("document_type", sa.String(20), nullable=True),
        sa.Column("document_number", sa.String(80), nullable=True),
        sa.Column("front_image_id", sa.String(64), nullable=True),
        sa.Column("back_image_id", sa.String(64), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.String(36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW,
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW,
                  nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_kyc_submissions"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_kyc_submissions_user_id_users"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"],
                                name="fk_kyc_submissions_reviewed_by_users"),
    )
    op.create_index("ix_kyc_submissions_user_id", "kyc_submissions", ["user_id"])
    op.create_index("ix_kyc_submissions_status", "kyc_submissions", ["status"])


def downgrade() -> None:
    op.drop_index("ix_kyc_submissions_status", table_name="kyc_submissions")
    op.drop_index("ix_kyc_submissions_user_id", table_name="kyc_submissions")
    op.drop_table("kyc_submissions")
