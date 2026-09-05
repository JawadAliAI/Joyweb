"""Single-use registration invitations.

Revision ID: 0003_invites
Revises: 0002_kyc
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0003_invites"
down_revision = "0002_kyc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invites",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("created_by", sa.String(length=36), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("used_by", sa.String(length=36), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_by", sa.String(length=36), nullable=True),
        sa.Column("revoke_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["used_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["revoked_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    # Unique so a guessed code cannot collide with a live one, indexed because
    # every registration looks a code up by value.
    op.create_index(op.f("ix_invites_code"), "invites", ["code"], unique=True)
    op.create_index(op.f("ix_invites_created_by"), "invites", ["created_by"])
    op.create_index(op.f("ix_invites_expires_at"), "invites", ["expires_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_invites_expires_at"), table_name="invites")
    op.drop_index(op.f("ix_invites_created_by"), table_name="invites")
    op.drop_index(op.f("ix_invites_code"), table_name="invites")
    op.drop_table("invites")
