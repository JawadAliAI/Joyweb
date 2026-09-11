"""CryptoDemo Exchange API.

A DEMO / PAPER-TRADING platform. Nothing in this service touches a blockchain,
holds customer funds, or settles real money. Every balance, trade, deposit and
withdrawal it records is a simulation, labelled as such in the data model and in
every response.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import logger
from app.services.trade_engine import settle_due_trades_loop

DESCRIPTION = """
**Simulation only.** This API powers a paper-trading demo of a crypto exchange.

* No real cryptocurrency is deposited, held, transferred or withdrawn.
* No blockchain transaction is ever created or broadcast.
* Balances are prefixed `DEMO_` and references are prefixed `DEMO-`.
* Market **prices** are real (read from a public market-data provider); the
  positions taken against them are not.

Responses follow one envelope: `{"success": true, "data": ...}` on success and
`{"success": false, "error": {"code", "message"}}` on failure.
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("startup app=%s demo_mode=%s env=%s",
                settings.APP_NAME, settings.DEMO_MODE, settings.ENVIRONMENT)
    if not settings.DEMO_MODE:
        # The application has no non-simulated code path; refuse to pretend.
        raise RuntimeError(
            "DEMO_MODE must be true. This platform only implements "
            "trading and has no real-money or blockchain functionality.")
    settler = await settle_due_trades_loop.start()
    try:
        yield
    finally:
        await settle_due_trades_loop.stop(settler)
        logger.info("shutdown")


app = FastAPI(
    title=f"{settings.APP_NAME} API",
    description=DESCRIPTION,
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy",
                                "geolocation=(), microphone=(), camera=()")
    response.headers.setdefault("X-Demo-Mode", str(settings.DEMO_MODE).lower())
    if settings.COOKIE_SECURE:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


register_exception_handlers(app)
app.include_router(api_router)


@app.get("/health", tags=["system"], summary="Liveness probe")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "data": {
        "status": "ok",
        "demoMode": settings.DEMO_MODE,
        "environment": settings.ENVIRONMENT,
    }})
