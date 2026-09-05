"""initial schema

Creates every table declared in app/db/models.

All monetary columns are NUMERIC(30, 10) and all price columns NUMERIC(30, 12):
floating point never touches money. Every balance this schema records is
SIMULATED - no table here maps to a real custodian, chain or ledger.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-01-01 00:00:00.000000
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

MONEY = sa.Numeric(30, 10)
PRICE = sa.Numeric(30, 12)
PAYOUT = sa.Numeric(10, 4)
NOW = sa.text("CURRENT_TIMESTAMP")


def _timestamps() -> list:
    """The TimestampMixin columns, identical on every table."""
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=NOW,
                  nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=NOW,
                  nullable=False),
    ]


def upgrade() -> None:
    # ---------------- users ----------------
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("username", sa.String(64), nullable=False),
        sa.Column("first_name", sa.String(80), nullable=False),
        sa.Column("last_name", sa.String(80), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("fund_password_hash", sa.String(255), nullable=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("credit_score", sa.Integer(), nullable=False),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("is_test_account", sa.Boolean(), nullable=False),
        sa.Column("mfa_secret", sa.String(64), nullable=True),
        sa.Column("must_change_password", sa.Boolean(), nullable=False),
        sa.Column("freeze_reason", sa.Text(), nullable=True),
        sa.Column("frozen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("frozen_by", sa.String(36), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.ForeignKeyConstraint(["frozen_by"], ["users.id"],
                                name="fk_users_frozen_by_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_status", "users", ["status"])

    # ---------------- password_reset_tokens ----------------
    op.create_table(
        "password_reset_tokens",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_password_reset_tokens"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_password_reset_tokens_user_id_users"),
    )
    op.create_index("ix_password_reset_tokens_user_id", "password_reset_tokens",
                    ["user_id"])
    op.create_index("ix_password_reset_tokens_token_hash", "password_reset_tokens",
                    ["token_hash"], unique=True)

    # ---------------- credit_score_history ----------------
    op.create_table(
        "credit_score_history",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("old_score", sa.Integer(), nullable=False),
        sa.Column("new_score", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("changed_by", sa.String(36), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_credit_score_history"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_credit_score_history_user_id_users"),
        sa.ForeignKeyConstraint(["changed_by"], ["users.id"],
                                name="fk_credit_score_history_changed_by_users"),
    )
    op.create_index("ix_credit_score_history_user_id", "credit_score_history",
                    ["user_id"])

    # ---------------- account_restrictions ----------------
    op.create_table(
        "account_restrictions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("restriction", sa.String(40), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("applied_by", sa.String(36), nullable=True),
        sa.Column("lifted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("lifted_by", sa.String(36), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_account_restrictions"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_account_restrictions_user_id_users"),
        sa.ForeignKeyConstraint(["applied_by"], ["users.id"],
                                name="fk_account_restrictions_applied_by_users"),
        sa.ForeignKeyConstraint(["lifted_by"], ["users.id"],
                                name="fk_account_restrictions_lifted_by_users"),
    )
    op.create_index("ix_account_restrictions_user_id", "account_restrictions",
                    ["user_id"])

    # ---------------- wallets ----------------
    op.create_table(
        "wallets",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("asset", sa.String(20), nullable=False),
        sa.Column("available", MONEY, nullable=False),
        sa.Column("locked", MONEY, nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_wallets"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_wallets_user_id_users"),
        sa.UniqueConstraint("user_id", "asset", name="uq_wallet_user_asset"),
    )
    op.create_index("ix_wallets_user_id", "wallets", ["user_id"])

    # ---------------- transactions ----------------
    # NOTE: the Python attribute is `meta`; the database column is `metadata`.
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("asset", sa.String(20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("fee", MONEY, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(64), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_transactions"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_transactions_user_id_users"),
    )
    op.create_index("ix_transactions_user_id", "transactions", ["user_id"])
    op.create_index("ix_transactions_type", "transactions", ["type"])
    op.create_index("ix_transactions_status", "transactions", ["status"])
    op.create_index("ix_transactions_reference", "transactions", ["reference"],
                    unique=True)

    # ---------------- deposits ----------------
    op.create_table(
        "deposits",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("asset", sa.String(20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(64), nullable=False),
        sa.Column("simulated_address", sa.String(120), nullable=False),
        sa.Column("transaction_id", sa.String(36), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_deposits"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_deposits_user_id_users"),
        sa.ForeignKeyConstraint(["transaction_id"], ["transactions.id"],
                                name="fk_deposits_transaction_id_transactions"),
        sa.UniqueConstraint("reference", name="uq_deposits_reference"),
    )
    op.create_index("ix_deposits_user_id", "deposits", ["user_id"])

    # ---------------- withdrawals ----------------
    op.create_table(
        "withdrawals",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("asset", sa.String(20), nullable=False),
        sa.Column("network", sa.String(40), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("fee", MONEY, nullable=False),
        sa.Column("net_amount", MONEY, nullable=False),
        sa.Column("destination_address", sa.String(200), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("reference", sa.String(64), nullable=False),
        sa.Column("reviewed_by", sa.String(36), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_withdrawals"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_withdrawals_user_id_users"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"],
                                name="fk_withdrawals_reviewed_by_users"),
        sa.UniqueConstraint("reference", name="uq_withdrawals_reference"),
    )
    op.create_index("ix_withdrawals_user_id", "withdrawals", ["user_id"])
    op.create_index("ix_withdrawals_status", "withdrawals", ["status"])

    # ---------------- transfers ----------------
    op.create_table(
        "transfers",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("sender_id", sa.String(36), nullable=False),
        sa.Column("recipient_id", sa.String(36), nullable=False),
        sa.Column("asset", sa.String(20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("reference", sa.String(64), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_transfers"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_transfers_sender_id_users"),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_transfers_recipient_id_users"),
        sa.UniqueConstraint("reference", name="uq_transfers_reference"),
    )
    op.create_index("ix_transfers_sender_id", "transfers", ["sender_id"])
    op.create_index("ix_transfers_recipient_id", "transfers", ["recipient_id"])

    # ---------------- conversions ----------------
    op.create_table(
        "conversions",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("from_asset", sa.String(20), nullable=False),
        sa.Column("to_asset", sa.String(20), nullable=False),
        sa.Column("from_amount", MONEY, nullable=False),
        sa.Column("to_amount", MONEY, nullable=False),
        sa.Column("rate", PRICE, nullable=False),
        sa.Column("reference", sa.String(64), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_conversions"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_conversions_user_id_users"),
        sa.UniqueConstraint("reference", name="uq_conversions_reference"),
    )
    op.create_index("ix_conversions_user_id", "conversions", ["user_id"])

    # ---------------- markets ----------------
    op.create_table(
        "markets",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("base_asset", sa.String(20), nullable=False),
        sa.Column("quote_asset", sa.String(20), nullable=False),
        sa.Column("provider_symbol", sa.String(30), nullable=False),
        sa.Column("display_name", sa.String(40), nullable=False),
        sa.Column("price_decimals", sa.Integer(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("is_tradable", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_markets"),
    )
    op.create_index("ix_markets_symbol", "markets", ["symbol"], unique=True)

    # ---------------- favorite_markets ----------------
    op.create_table(
        "favorite_markets",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_favorite_markets"),
    )
    op.create_index("ix_favorite_markets_user_id", "favorite_markets", ["user_id"])

    # ---------------- trading_durations ----------------
    op.create_table(
        "trading_durations",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("seconds", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(30), nullable=False),
        sa.Column("payout_percent", PAYOUT, nullable=False),
        sa.Column("min_amount", MONEY, nullable=False),
        sa.Column("max_amount", MONEY, nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_trading_durations"),
        sa.UniqueConstraint("seconds", name="uq_trading_durations_seconds"),
    )

    # ---------------- platform_settings ----------------
    op.create_table(
        "platform_settings",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("key", sa.String(80), nullable=False),
        sa.Column("value", sa.JSON(), nullable=False),
        sa.Column("group", sa.String(40), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_platform_settings"),
    )
    op.create_index("ix_platform_settings_key", "platform_settings", ["key"],
                    unique=True)
    op.create_index("ix_platform_settings_group", "platform_settings", ["group"])

    # ---------------- support_tickets ----------------
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_support_tickets"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_support_tickets_user_id_users"),
    )
    op.create_index("ix_support_tickets_user_id", "support_tickets", ["user_id"])
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])

    # ---------------- support_messages ----------------
    op.create_table(
        "support_messages",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("ticket_id", sa.String(36), nullable=False),
        sa.Column("author_id", sa.String(36), nullable=False),
        sa.Column("is_staff_reply", sa.Boolean(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_support_messages"),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"],
                                ondelete="CASCADE",
                                name="fk_support_messages_ticket_id_support_tickets"),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"],
                                name="fk_support_messages_author_id_users"),
    )
    op.create_index("ix_support_messages_ticket_id", "support_messages", ["ticket_id"])

    # ---------------- notifications ----------------
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(40), nullable=False),
        sa.Column("read", sa.Boolean(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_notifications"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_notifications_user_id_users"),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_read", "notifications", ["read"])

    # ---------------- trades ----------------
    op.create_table(
        "trades",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("user_id", sa.String(36), nullable=False),
        sa.Column("symbol", sa.String(20), nullable=False),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("asset", sa.String(20), nullable=False),
        sa.Column("amount", MONEY, nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("payout_percent", PAYOUT, nullable=False),
        sa.Column("entry_price", PRICE, nullable=False),
        sa.Column("exit_price", PRICE, nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("outcome", sa.String(10), nullable=True),
        sa.Column("profit_loss", MONEY, nullable=True),
        sa.Column("returned_amount", MONEY, nullable=True),
        sa.Column("opens_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("settlement_source", sa.String(30), nullable=True),
        sa.Column("settlement_note", sa.Text(), nullable=True),
        sa.Column("test_scenario_id", sa.String(36), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_trades"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_trades_user_id_users"),
    )
    op.create_index("ix_trades_user_id", "trades", ["user_id"])
    op.create_index("ix_trades_symbol", "trades", ["symbol"])
    op.create_index("ix_trades_status", "trades", ["status"])
    op.create_index("ix_trades_outcome", "trades", ["outcome"])
    op.create_index("ix_trades_expires_at", "trades", ["expires_at"])

    # ---------------- trade_test_scenarios ----------------
    op.create_table(
        "trade_test_scenarios",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("target_user_id", sa.String(36), nullable=False),
        sa.Column("forced_outcome", sa.String(10), nullable=False),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("created_by", sa.String(36), nullable=False),
        sa.Column("consumed", sa.Boolean(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_trade_test_scenarios"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"], ondelete="CASCADE",
                                name="fk_trade_test_scenarios_target_user_id_users"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"],
                                name="fk_trade_test_scenarios_created_by_users"),
    )
    op.create_index("ix_trade_test_scenarios_target_user_id", "trade_test_scenarios",
                    ["target_user_id"])

    # ---------------- audit_logs ----------------
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("actor_id", sa.String(36), nullable=True),
        sa.Column("actor_email", sa.String(255), nullable=True),
        sa.Column("target_user_id", sa.String(36), nullable=True),
        sa.Column("action", sa.String(60), nullable=False),
        sa.Column("old_value", sa.JSON(), nullable=True),
        sa.Column("new_value", sa.JSON(), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("ip_address", sa.String(64), nullable=True),
        sa.Column("user_agent", sa.String(400), nullable=True),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_audit_logs"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"],
                                name="fk_audit_logs_actor_id_users"),
        sa.ForeignKeyConstraint(["target_user_id"], ["users.id"],
                                name="fk_audit_logs_target_user_id_users"),
    )
    op.create_index("ix_audit_logs_actor_id", "audit_logs", ["actor_id"])
    op.create_index("ix_audit_logs_target_user_id", "audit_logs", ["target_user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])


def downgrade() -> None:
    """Drop everything in reverse dependency order."""
    for table in (
        "audit_logs",
        "trade_test_scenarios",
        "trades",
        "notifications",
        "support_messages",
        "support_tickets",
        "platform_settings",
        "trading_durations",
        "favorite_markets",
        "markets",
        "conversions",
        "transfers",
        "withdrawals",
        "deposits",
        "transactions",
        "wallets",
        "account_restrictions",
        "credit_score_history",
        "password_reset_tokens",
        "users",
    ):
        op.drop_table(table)
