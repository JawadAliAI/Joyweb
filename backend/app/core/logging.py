"""Structured logging with secret redaction.

Passwords, fund passwords, tokens and API keys must never reach the logs.
"""
import logging
import re
import sys

REDACT_KEYS = ("password", "fund_password", "token", "secret", "api_key",
               "authorization", "cookie", "pin")
_PATTERN = re.compile(
    r'("?(?:%s)"?\s*[:=]\s*)("[^"]*"|\'[^\']*\'|[^\s,;}}]+)' % "|".join(REDACT_KEYS),
    re.IGNORECASE,
)


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        message = super().format(record)
        return _PATTERN.sub(r"\1***", message)


def configure_logging(level: str = "INFO") -> logging.Logger:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(RedactingFormatter(
        "%(asctime)s %(levelname)s %(name)s %(message)s"))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(level)
    return logging.getLogger("cryptodemo")


logger = configure_logging()
