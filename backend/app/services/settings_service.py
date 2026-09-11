"""Runtime platform settings.

Anything an administrator can change at runtime lives in `platform_settings`.
`DEFAULTS` is the single source of truth for the shape and initial value of each
key — the seed script and the admin API both read from it, so a new setting only
has to be declared once.
"""
from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings as env
from app.db.models import PlatformSetting

# key -> (default value, group, description)
DEFAULTS: dict[str, tuple[Any, str, str]] = {
    # --- Branding ---
    "app_name": (env.APP_NAME, "branding", "Product name shown throughout the UI."),
    "logo_url": ("/brand/logo.svg", "branding", "Header logo image URL."),
    "favicon_url": ("/brand/favicon.svg", "branding", "Browser favicon URL."),
    "primary_color": ("#18B887", "branding", "Primary accent colour."),
    "secondary_color": ("#F0B90B", "branding", "Secondary accent colour."),
    "support_email": (env.SUPPORT_EMAIL, "branding", "Support contact address."),
    "display_currency": ("USD", "branding", "Currency used for estimated values."),
    "banner_label": (env.DEMO_LABEL, "branding", "Header banner text (leave blank to hide)."),

    # --- System ---
    "maintenance_mode": (False, "system", "Block customer access for maintenance."),
    "maintenance_message": ("Platform is currently under maintenance.", "system",
                            "Message shown while maintenance mode is on."),

    # --- Registration ---
    "registration_requires_invite": (
        True, "registration",
        "When on, a new account needs an invitation code: the shared code below, "
        "or the code from a single-use invitation link."),
    "registration_invite_code": (
        "", "registration",
        "The one invitation code everyone registers with. Leave blank to accept "
        "only single-use invitation links."),
    "public_base_url": (
        "", "registration",
        "Base URL used to build invitation links, e.g. https://demo.example.com. "
        "Falls back to the first configured CORS origin when blank."),

    # --- Trading ---
    "trading_enabled": (True, "trading", "Master switch for trading."),
    "default_duration_seconds": (60, "trading", "Pre-selected trade duration."),
    "trade_min_amount": ("10", "trading", "Minimum stake."),
    "trade_max_amount": ("10000", "trading", "Maximum stake."),
    "trade_quick_amounts": ([10, 50, 100, 500, 1000], "trading",
                            "Quick-pick stake buttons."),
    "simulation_disclosure": (
        "Outcomes are decided by comparing the entry price to the public market "
        "price at expiry. If market data is unavailable at expiry the trade is "
        "voided and the stake returned in full.",
        "trading", "Text shown to users explaining how outcomes are decided."),

    # --- Withdrawals ---
    "withdrawals_enabled": (True, "withdrawal", "Master switch for withdrawals."),
    "withdrawals_disabled_message": (
        "Withdrawals are currently unavailable.", "withdrawal",
        "Shown to customers when withdrawals_enabled is OFF. Say what is "
        "actually happening and when it will be back."),
    "withdrawal_requests_paused": (
        False, "withdrawal",
        "Keeps the withdraw screen open and the form usable, but refuses every "
        "new request at the moment it is submitted. Use this when payouts are "
        "not being processed but you still want customers to see the screen. "
        "`withdrawals_enabled` OFF hides the screen entirely instead."),
    "withdrawal_paused_message": (
        "Withdrawals are not being processed at the moment, so this request "
        "could not be submitted. Nothing has been deducted from your "
        "balance and no funds are locked. Please try again later.",
        "withdrawal",
        "Shown when withdrawal_requests_paused is ON and a customer submits. "
        "Say what is actually happening; do not describe it as a fault if it "
        "is a deliberate pause."),
    "withdrawal_notice": (
        "", "withdrawal",
        "Optional notice shown on the withdraw screen while withdrawals are "
        "open, e.g. processing times or fee details. Leave blank to hide it."),
    "withdrawal_min_amount": ("10", "withdrawal", "Minimum withdrawal."),
    "withdrawal_max_amount": ("10000", "withdrawal", "Maximum withdrawal."),
    "withdrawal_fee_flat": ("5", "withdrawal", "Flat withdrawal fee."),
    "withdrawal_fee_percent": ("0", "withdrawal", "Percentage fee."),
    "withdrawal_networks": (
        [
            {"id": "DEMO_USDT-ERC", "asset": "DEMO_USDT", "network": "ERC",
             "label": "USDT - ERC", "enabled": True},
            {"id": "DEMO_USDT-TRC", "asset": "DEMO_USDT", "network": "TRC",
             "label": "USDT - TRC", "enabled": True},
            {"id": "DEMO_ETH-ERC", "asset": "DEMO_ETH", "network": "ERC",
             "label": "ETH", "enabled": True},
            {"id": "DEMO_BTC-BTC", "asset": "DEMO_BTC", "network": "BTC",
             "label": "BTC", "enabled": True},
        ],
        "withdrawal", "Asset/network options offered on the withdraw screen."),

    # --- Deposits / transfers / conversion ---
    "deposits_enabled": (True, "wallet", "Master switch for deposits."),
    "transfers_enabled": (True, "wallet", "Master switch for internal transfers."),
    "conversions_enabled": (True, "wallet", "Master switch for conversions."),
    "conversion_fee_percent": ("0.1", "wallet", "Conversion spread, percent."),
    "demo_deposit_auto_credit": (True, "wallet",
                                 "Credit deposits immediately instead of "
                                 "leaving them pending admin review."),
    "demo_deposit_max": ("100000", "wallet", "Largest single deposit."),
}


def _coerce(value: Any) -> Any:
    return value


def get_all(db: Session) -> dict[str, Any]:
    """Every setting, with defaults filling any gap."""
    stored = {row.key: row.value for row in db.scalars(select(PlatformSetting))}
    return {key: stored.get(key, default) for key, (default, _, _) in DEFAULTS.items()}


def get(db: Session, key: str, default: Any = None) -> Any:
    row = db.scalar(select(PlatformSetting).where(PlatformSetting.key == key))
    if row is not None:
        return row.value
    if key in DEFAULTS:
        return DEFAULTS[key][0]
    return default


def get_decimal(db: Session, key: str) -> Decimal:
    return Decimal(str(get(db, key, "0")))


def get_bool(db: Session, key: str) -> bool:
    return bool(get(db, key, False))


def set_value(db: Session, key: str, value: Any) -> PlatformSetting:
    """Upsert one setting. Callers are responsible for the audit log entry."""
    row = db.scalar(select(PlatformSetting).where(PlatformSetting.key == key))
    if row is None:
        _, group, description = DEFAULTS.get(key, (None, "general", None))
        row = PlatformSetting(key=key, value=_coerce(value), group=group,
                              description=description)
        db.add(row)
    else:
        row.value = _coerce(value)
    return row


def ensure_defaults(db: Session) -> int:
    """Insert any setting that does not exist yet. Returns how many were added."""
    existing = {row.key for row in db.scalars(select(PlatformSetting))}
    added = 0
    for key, (default, group, description) in DEFAULTS.items():
        if key not in existing:
            db.add(PlatformSetting(key=key, value=default, group=group,
                                   description=description))
            added += 1
    return added


def public_branding(db: Session) -> dict[str, Any]:
    """The subset safe to expose to unauthenticated clients."""
    values = get_all(db)
    return {
        "appName": values["app_name"],
        "logoUrl": values["logo_url"],
        "faviconUrl": values["favicon_url"],
        "primaryColor": values["primary_color"],
        "secondaryColor": values["secondary_color"],
        "supportEmail": values["support_email"],
        "displayCurrency": values["display_currency"],
        "demoLabel": values["banner_label"],
        "demoMode": env.DEMO_MODE,
        "maintenanceMode": bool(values["maintenance_mode"]),
        "maintenanceMessage": values["maintenance_message"],
        "tradingEnabled": bool(values["trading_enabled"]),
        "withdrawalsEnabled": bool(values["withdrawals_enabled"]),
        "depositsEnabled": bool(values["deposits_enabled"]),
        "transfersEnabled": bool(values["transfers_enabled"]),
        "conversionsEnabled": bool(values["conversions_enabled"]),
    }
