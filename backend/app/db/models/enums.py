"""Domain enumerations.

Everything here describes SIMULATED activity. No value in this module maps to a
real blockchain, a real custodian, or real customer funds.
"""
from enum import Enum


class StrEnum(str, Enum):
    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value


class UserStatus(StrEnum):
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    SUSPENDED = "SUSPENDED"


class Role(StrEnum):
    USER = "USER"
    ADMIN = "ADMIN"
    SUPER_ADMIN = "SUPER_ADMIN"


class Asset(StrEnum):
    DEMO_USDT = "DEMO_USDT"
    DEMO_USDC = "DEMO_USDC"
    DEMO_BTC = "DEMO_BTC"
    DEMO_ETH = "DEMO_ETH"


class TransactionType(StrEnum):
    DEMO_DEPOSIT = "DEMO_DEPOSIT"
    DEMO_WITHDRAWAL = "DEMO_WITHDRAWAL"
    DEMO_TRANSFER_IN = "DEMO_TRANSFER_IN"
    DEMO_TRANSFER_OUT = "DEMO_TRANSFER_OUT"
    DEMO_CONVERSION = "DEMO_CONVERSION"
    TRADE_STAKE = "TRADE_STAKE"
    TRADE_RETURN = "TRADE_RETURN"
    ADMIN_CREDIT = "ADMIN_CREDIT"
    ADMIN_DEBIT = "ADMIN_DEBIT"


class TransactionStatus(StrEnum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TradeDirection(StrEnum):
    UP = "UP"
    DOWN = "DOWN"


class TradeStatus(StrEnum):
    OPEN = "OPEN"
    SETTLED = "SETTLED"
    VOIDED = "VOIDED"


class TradeOutcome(StrEnum):
    WIN = "WIN"
    LOSS = "LOSS"
    DRAW = "DRAW"


class SettlementSource(StrEnum):
    """How a trade's exit price was determined — always disclosed to the user."""
    MARKET_DATA = "MARKET_DATA"          # live public market price at expiry
    SIMULATED_RANDOM = "SIMULATED_RANDOM"  # disclosed RNG fallback
    ADMIN_TEST_SCENARIO = "ADMIN_TEST_SCENARIO"  # test accounts only, audit-logged


class WithdrawalStatus(StrEnum):
    PENDING = "PENDING"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class TicketStatus(StrEnum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    RESOLVED = "RESOLVED"
    CLOSED = "CLOSED"


class KycLevel(StrEnum):
    """Which simulated verification tier a submission belongs to."""
    BASIC = "BASIC"
    ADVANCED = "ADVANCED"


class KycStatus(StrEnum):
    """Simulated review state. No real identity check is ever performed."""
    NOT_SUBMITTED = "NOT_SUBMITTED"
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class AuditAction(StrEnum):
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    ACCOUNT_FROZEN = "ACCOUNT_FROZEN"
    ACCOUNT_UNFROZEN = "ACCOUNT_UNFROZEN"
    BALANCE_CREDITED = "BALANCE_CREDITED"
    BALANCE_DEBITED = "BALANCE_DEBITED"
    CREDIT_SCORE_CHANGED = "CREDIT_SCORE_CHANGED"
    PASSWORD_RESET_REQUESTED = "PASSWORD_RESET_REQUESTED"
    PASSWORD_RESET_COMPLETED = "PASSWORD_RESET_COMPLETED"
    FUND_PASSWORD_SET = "FUND_PASSWORD_SET"
    DEPOSIT_CREATED = "DEPOSIT_CREATED"
    WITHDRAWAL_CREATED = "WITHDRAWAL_CREATED"
    WITHDRAWAL_CANCELLED = "WITHDRAWAL_CANCELLED"
    WITHDRAWAL_REVIEWED = "WITHDRAWAL_REVIEWED"
    TRANSFER_CREATED = "TRANSFER_CREATED"
    CONVERSION_CREATED = "CONVERSION_CREATED"
    TRADE_CREATED = "TRADE_CREATED"
    TRADE_COMPLETED = "TRADE_COMPLETED"
    TEST_SCENARIO_CREATED = "TEST_SCENARIO_CREATED"
    TEST_SCENARIO_BULK_CREATED = "TEST_SCENARIO_BULK_CREATED"
    TRADES_BULK_SETTLED = "TRADES_BULK_SETTLED"
    TRADES_BULK_VOIDED = "TRADES_BULK_VOIDED"
    INVITE_CREATED = "INVITE_CREATED"
    INVITE_REVOKED = "INVITE_REVOKED"
    INVITE_USED = "INVITE_USED"
    SETTINGS_UPDATED = "SETTINGS_UPDATED"
    SUPPORT_TICKET_CREATED = "SUPPORT_TICKET_CREATED"
    SUPPORT_TICKET_UPDATED = "SUPPORT_TICKET_UPDATED"
    KYC_SUBMITTED = "KYC_SUBMITTED"
    KYC_REVIEWED = "KYC_REVIEWED"
