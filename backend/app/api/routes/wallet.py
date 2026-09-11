"""Read-only wallet endpoints: supported demo assets, portfolio and history.

Nothing here moves money — see `app.api.routes.transactions` for that. Every
balance returned by these routes is simulated; no real cryptocurrency is held,
custodied or transferred by this platform.
"""
from __future__ import annotations

from decimal import ROUND_DOWN, Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_user
from app.core.errors import ValidationError
from app.db.models import Asset, Transaction, TransactionType, User
from app.db.session import get_db
from app.schemas.common import PaginationParams, money, ok, paginate
from app.services import pricing_service, settings_service, wallet_service

router = APIRouter()

DISPLAY_SCALE = Decimal("0.01")


def _wallet_payload(wallet, price: Decimal | None) -> dict:
    meta = wallet_service.ASSET_META.get(wallet.asset, {})
    decimals = int(meta.get("decimals", 8))
    estimated = None
    if price is not None:
        estimated = money(
            (wallet.total * price).quantize(DISPLAY_SCALE, rounding=ROUND_DOWN), 2)
    return {
        "asset": wallet.asset,
        "label": meta.get("label", wallet.asset),
        "available": money(wallet.available, decimals),
        "locked": money(wallet.locked, decimals),
        "total": money(wallet.total, decimals),
        "estimatedValue": estimated,
        "decimals": decimals,
    }


@router.get("/assets", summary="List supported assets")
def list_assets(user: Annotated[User, Depends(require_user)]) -> dict:
    """Metadata for every simulated asset this demo platform supports.

    These are paper-trading assets (DEMO_USDT, DEMO_BTC, DEMO_ETH). They exist
    only inside this simulator and are not backed by any real cryptocurrency.
    """
    return ok({
        "assets": [
            {
                "asset": asset,
                "label": meta["label"],
                "decimals": meta["decimals"],
                "icon": meta.get("icon"),
                "market": meta.get("market"),
            }
            for asset, meta in wallet_service.ASSET_META.items()
        ],
        "quoteAsset": Asset.DEMO_USDT.value,
        "note": "All balances on this platform are funds.",
    })


@router.get("/wallet", summary="Get the caller's portfolio")
async def get_portfolio(user: Annotated[User, Depends(require_user)],
                        db: Annotated[Session, Depends(get_db)]) -> dict:
    """The caller's simulated balances plus an estimated value in DEMO USDT.

    Estimated values are derived from live public market prices. If market data
    is unavailable, `pricesAvailable` is false and assets without a price
    contribute nothing to the total — the platform never guesses a price.
    """
    wallets = wallet_service.list_wallets(db, user.id)
    snapshot = await pricing_service.asset_prices(db)
    total = wallet_service.portfolio_value(wallets, snapshot.prices)
    db.commit()

    return ok({
        "totalEstimatedValue": money(total, 2),
        "displayCurrency": settings_service.get(db, "display_currency", "USD"),
        "pricesAvailable": snapshot.available,
        "assets": [_wallet_payload(w, snapshot.get(w.asset)) for w in wallets],
        "demoLabel": settings_service.get(db, "banner_label"),
        "message": snapshot.message,
    })


@router.get("/wallet/history", summary="List the caller's ledger entries")
def wallet_history(
    user: Annotated[User, Depends(require_user)],
    db: Annotated[Session, Depends(get_db)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, alias="pageSize")] = 20,
    type: Annotated[str | None, Query(description="Filter by transaction type.")] = None,
    asset: Annotated[str | None, Query(description="Filter by asset.")] = None,
) -> dict:
    """Paginated history of every simulated balance movement on this account.

    Each row is a ledger entry explaining one demo credit or debit. References
    are deliberately shaped as `DEMO-...` so they can never be mistaken for a
    blockchain transaction hash.
    """
    params = PaginationParams(page=page, page_size=page_size)
    filters = [Transaction.user_id == user.id]
    if type:
        wanted = type.strip().upper()
        if wanted not in {t.value for t in TransactionType}:
            raise ValidationError(f"Unknown transaction type: {type}",
                                  code="UNSUPPORTED_TYPE")
        filters.append(Transaction.type == wanted)
    if asset:
        filters.append(Transaction.asset == wallet_service.validate_asset(
            asset.strip().upper()))

    total = int(db.scalar(select(func.count()).select_from(Transaction)
                          .where(*filters)) or 0)
    rows = db.scalars(
        select(Transaction).where(*filters)
        .order_by(Transaction.created_at.desc())
        .limit(params.page_size).offset(params.offset)
    )
    items = [
        {
            "id": row.id,
            "type": row.type,
            "asset": row.asset,
            "amount": money(row.amount),
            "fee": money(row.fee),
            "status": row.status,
            "reference": row.reference,
            "description": row.description,
            "createdAt": row.created_at,
        }
        for row in rows
    ]
    return ok(paginate(items, total, params))
