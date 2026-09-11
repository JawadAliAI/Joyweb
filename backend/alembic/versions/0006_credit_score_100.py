"""Credit scores start at 100.

New accounts were being opened at 700 on a 1-100 scale, and the model default
was 70. Both now start at 100. Existing accounts are brought in line:

* any score above 100 is out of range and becomes 100;
* any account whose score an administrator has never set — no row in
  `credit_score_history` — moves from the old default to 100.

Scores an administrator chose deliberately are left exactly as they are.

Revision ID: 0006_credit_score_100
Revises: 0005_agent_tier
"""
from __future__ import annotations

from alembic import op

revision = "0006_credit_score_100"
down_revision = "0005_agent_tier"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE users
           SET credit_score = 100
         WHERE credit_score > 100
            OR NOT EXISTS (
                   SELECT 1 FROM credit_score_history h WHERE h.user_id = users.id
               )
        """
    )


def downgrade() -> None:
    # The previous values were defaults, not decisions, and are not recorded
    # anywhere; there is nothing meaningful to restore.
    pass
