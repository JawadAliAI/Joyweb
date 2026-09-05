"""SQLAlchemy models. Importing this package registers every table on Base."""
from app.db.models.audit import AuditLog
from app.db.models.enums import (
    Asset, AuditAction, KycLevel, KycStatus, Role, SettlementSource,
    TicketStatus, TradeDirection,
    TradeOutcome, TradeStatus, TransactionStatus, TransactionType, UserStatus,
    WithdrawalStatus,
)
from app.db.models.invite import Invite
from app.db.models.kyc import KycSubmission
from app.db.models.market import FavoriteMarket, Market, TradingDuration
from app.db.models.platform import PlatformSetting
from app.db.models.support import Notification, SupportMessage, SupportTicket
from app.db.models.trade import Trade, TradeTestScenario
from app.db.models.transaction import (
    Conversion, Deposit, Transaction, Transfer, Withdrawal,
)
from app.db.models.user import (
    AccountRestriction, CreditScoreHistory, PasswordResetToken, User,
)
from app.db.models.wallet import MONEY, Wallet

__all__ = [
    "AccountRestriction", "Asset", "AuditAction", "AuditLog", "Conversion",
    "CreditScoreHistory", "Deposit", "FavoriteMarket", "MONEY", "Market",
    "Invite", "KycLevel", "KycStatus", "KycSubmission",
    "Notification", "PasswordResetToken", "PlatformSetting", "Role",
    "SettlementSource", "SupportMessage", "SupportTicket", "TicketStatus",
    "Trade", "TradeDirection", "TradeOutcome", "TradeStatus",
    "TradeTestScenario", "TradingDuration", "Transaction", "TransactionStatus",
    "TransactionType", "Transfer", "User", "UserStatus", "Wallet", "Withdrawal",
]
