"""Centralised API error types and handlers.

Every response follows:
    success:  {"success": true, "data": {...}}
    error:    {"success": false, "error": {"code": "...", "message": "..."}}
"""
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import logger


class APIError(Exception):
    """Base class for all expected, user-visible failures."""

    status_code: int = status.HTTP_400_BAD_REQUEST
    code: str = "BAD_REQUEST"
    message: str = "Request could not be processed."

    def __init__(self, message: str | None = None, *, code: str | None = None,
                 status_code: int | None = None, details: dict | None = None):
        self.message = message or self.message
        self.code = code or self.code
        self.status_code = status_code or self.status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(APIError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"
    message = "Resource not found."


class ValidationError(APIError):
    status_code = status.HTTP_422_UNPROCESSABLE_ENTITY
    code = "VALIDATION_ERROR"
    message = "The submitted data is invalid."


class AuthError(APIError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "UNAUTHENTICATED"
    message = "Authentication required."


class ForbiddenError(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


class InsufficientBalanceError(APIError):
    code = "INSUFFICIENT_BALANCE"
    message = "Insufficient balance."


class AccountRestrictedError(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "ACCOUNT_RESTRICTED"
    message = "Your account is currently restricted."


class FeatureDisabledError(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FEATURE_DISABLED"
    message = "This feature is currently unavailable."


class RateLimitError(APIError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "RATE_LIMITED"
    message = "Too many requests. Please slow down."


class UpstreamUnavailableError(APIError):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "MARKET_DATA_UNAVAILABLE"
    message = "Market data unavailable."


def error_body(code: str, message: str, details: dict | None = None) -> dict:
    payload = {"success": False, "error": {"code": code, "message": message}}
    if details:
        payload["error"]["details"] = details
    return payload


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def _api_error(request: Request, exc: APIError):
        logger.info("api_error", extra={"code": exc.code, "path": request.url.path})
        return JSONResponse(status_code=exc.status_code,
                            content=error_body(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        details = {"fields": [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]}
        return JSONResponse(status_code=422,
                            content=error_body("VALIDATION_ERROR",
                                               "The submitted data is invalid.", details))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code = {401: "UNAUTHENTICATED", 403: "FORBIDDEN",
                404: "NOT_FOUND", 429: "RATE_LIMITED"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse(status_code=exc.status_code,
                            content=error_body(code, str(exc.detail)))

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception):
        logger.exception("unhandled_error path=%s", request.url.path)
        return JSONResponse(status_code=500,
                            content=error_body("INTERNAL_ERROR",
                                               "An unexpected error occurred."))
