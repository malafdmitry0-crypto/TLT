"""Central logging configuration.

The application writes structured logs to stdout so Docker/Alloy/Loki can collect
one stream for backend, worker, database and Redis containers.
"""

from __future__ import annotations

import json
import logging
import logging.config
from datetime import UTC, datetime
from typing import Any

from app.core.config import settings
from app.core.request_context import get_request_id

_STANDARD_RECORD_KEYS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
    "taskName",
}


class RequestContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = get_request_id()
        return True


def _json_default(value: Any) -> str:
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


class JsonLogFormatter(logging.Formatter):
    """Small JSON formatter using only the stdlib logging package."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", None),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
            "process": record.process,
            "thread": record.threadName,
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        if record.stack_info:
            payload["stack"] = self.formatStack(record.stack_info)

        for key, value in record.__dict__.items():
            if key in _STANDARD_RECORD_KEYS or key in payload or key.startswith("_"):
                continue
            payload[key] = value

        return json.dumps(payload, ensure_ascii=False, default=_json_default, separators=(",", ":"))


def configure_logging() -> None:
    level = settings.LOG_LEVEL.upper()
    formatter = "json" if settings.LOG_FORMAT == "json" else "plain"
    access_level = "INFO" if settings.LOG_ACCESS else "WARNING"

    logging.config.dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "filters": {
                "request_context": {
                    "()": "app.core.logging_config.RequestContextFilter",
                }
            },
            "formatters": {
                "json": {
                    "()": "app.core.logging_config.JsonLogFormatter",
                },
                "plain": {
                    "format": (
                        "%(asctime)s %(levelname)s [%(name)s] "
                        "[request_id=%(request_id)s] %(message)s"
                    ),
                },
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "stream": "ext://sys.stdout",
                    "filters": ["request_context"],
                    "formatter": formatter,
                }
            },
            "root": {
                "level": level,
                "handlers": ["default"],
            },
            "loggers": {
                "heatcalc": {"level": level, "handlers": [], "propagate": True},
                "uvicorn": {"level": level, "handlers": ["default"], "propagate": False},
                "uvicorn.error": {"level": level, "handlers": ["default"], "propagate": False},
                "uvicorn.access": {
                    "level": access_level,
                    "handlers": ["default"],
                    "propagate": False,
                },
            },
        }
    )
