"""Central application configuration.

Every brandable / tunable value lives here or in the `platform_settings` table.
Nothing user-facing should hard-code a brand string, colour or limit.
"""
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ---- Brand / product ----
    APP_NAME: str = "cptcryptoiin"
    DEMO_MODE: bool = True
    DEMO_LABEL: str = ""
    ENVIRONMENT: str = "development"
    SUPPORT_EMAIL: str = "support@cptcryptoiin.com"

    # ---- Database ----
    DATABASE_URL: str = "postgresql+psycopg://cryptodemo:cryptodemo@localhost:5432/cryptodemo"

    # ---- Security ----
    JWT_SECRET: str = "insecure-development-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TTL_MINUTES: int = 30
    JWT_REFRESH_TTL_DAYS: int = 7
    COOKIE_SECURE: bool = False
    COOKIE_DOMAIN: str = ""
    COOKIE_SAMESITE: str = "lax"
    # Stored as a raw comma-separated string on purpose: pydantic-settings
    # JSON-decodes list-typed fields before any validator runs, so a plain
    # "a,b" value from .env or a container env var would fail to parse.
    # Read the parsed form through `cors_origins`.
    CORS_ORIGINS: str = "http://localhost:3000"
    PASSWORD_RESET_TTL_MINUTES: int = 60

    # ---- Seed / bootstrap (development only) ----
    SEED_ADMIN_EMAIL: str = "admin@example.com"
    SEED_ADMIN_PASSWORD: str = ""
    SEED_DEMO_EMAIL: str = "demo@example.com"
    SEED_DEMO_PASSWORD: str = ""

    # ---- Simulated KYC uploads (demo only; never real identity documents) ----
    KYC_UPLOAD_DIR: str = "/app/uploads/kyc"

    # ---- Market data ----
    MARKET_DATA_PROVIDER: str = "binance"
    # Binance blocks many datacenter IPs on api.binance.com. This is their
    # official public market-data host: identical API, no account needed.
    MARKET_DATA_BASE_URL: str = "https://data-api.binance.vision"
    MARKET_DATA_API_KEY: str = ""
    MARKET_DATA_CACHE_SECONDS: int = 10

    @property
    def cors_origins(self) -> List[str]:
        """Allowed browser origins, parsed from the comma-separated setting."""
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")
                if origin.strip()]

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() in {"production", "prod"}


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
