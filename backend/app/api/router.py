"""Aggregate API router. One include per feature area."""
from fastapi import APIRouter

from app.api.routes import (
    admin, agent, auth, kyc, markets, notifications, platform, support, trades,
    transactions, wallet,
)

api_router = APIRouter(prefix="/api")

api_router.include_router(platform.router, prefix="/platform", tags=["platform"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(markets.router, prefix="/markets", tags=["markets"])
api_router.include_router(wallet.router, tags=["wallet"])
api_router.include_router(transactions.router, tags=["money movement"])
api_router.include_router(trades.router, prefix="/trades", tags=["trading"])
api_router.include_router(notifications.router, prefix="/notifications",
                          tags=["notifications"])
api_router.include_router(support.router, prefix="/support", tags=["support"])
api_router.include_router(kyc.router, prefix="/kyc", tags=["kyc"])
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(admin.router, prefix="/admin", tags=["admin"])
api_router.include_router(kyc.admin_router, prefix="/admin/kyc", tags=["admin"])
