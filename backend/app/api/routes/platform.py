"""Public platform configuration.

Unauthenticated. This is what the frontend boots from: branding, feature
switches, the permanent simulation label, and the list of supported demo assets.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import get_db
from app.schemas.common import ok
from app.services import settings_service, wallet_service

router = APIRouter()


@router.get("/config", summary="Public branding and feature configuration")
def public_config(db: Session = Depends(get_db)) -> dict:
    """Branding, feature switches and supported simulated assets.

    Every asset is prefixed `DEMO_`: this platform never holds, transfers or
    withdraws real cryptocurrency.
    """
    config = dict(settings_service.public_branding(db))
    config["environment"] = settings.ENVIRONMENT
    config["assets"] = [
        {
            "asset": asset,
            "label": meta["label"],
            "decimals": meta["decimals"],
            "market": meta["market"],
            "icon": meta["icon"],
        }
        for asset, meta in wallet_service.ASSET_META.items()
    ]
    config["simulationNotice"] = (
        "Simulation only. Balances, deposits, withdrawals and trades on this "
        "platform are paper-trading records. No real funds are involved and no "
        "blockchain transaction is ever created."
    )
    return ok(config)
