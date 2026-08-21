"""Reusable progress, cancellation, and chunking mechanics for batch use cases."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from inspect import isawaitable
from time import monotonic
from typing import Any

from app.services.calculation.contracts import CancelChecker
from app.services.calculation.errors import BatchCancelledError

BATCH_CANCEL_CHECK_MIN_OBJECTS = 500
BATCH_CANCEL_CHECK_MIN_INTERVAL_SECONDS = 0.5


async def maybe_await(value: Awaitable[Any] | Any) -> Any:
    if isawaitable(value):
        return await value
    return value


def chunked_rows(
    rows: list[dict[str, Any]],
    chunk_size: int,
) -> list[list[dict[str, Any]]]:
    return [rows[index : index + chunk_size] for index in range(0, len(rows), chunk_size)]


class BatchCancelChecker:
    def __init__(
        self,
        should_cancel: CancelChecker | None,
        *,
        min_objects: int = BATCH_CANCEL_CHECK_MIN_OBJECTS,
        min_interval_seconds: float = BATCH_CANCEL_CHECK_MIN_INTERVAL_SECONDS,
        now_func: Callable[[], float] = monotonic,
        cancel_message: str = "Пакетный электрорасчёт отменён",
    ) -> None:
        self._should_cancel = should_cancel
        self._min_objects = min_objects
        self._min_interval_seconds = min_interval_seconds
        self._now = now_func
        self._cancel_message = cancel_message
        self._last_checked_processed: int | None = None
        self._last_checked_at: float | None = None

    async def check(self, processed: int, *, force: bool = False) -> None:
        if self._should_cancel is None:
            return
        now = self._now()
        if not force and self._last_checked_processed is not None:
            processed_delta = processed - self._last_checked_processed
            last_checked_at = self._last_checked_at if self._last_checked_at is not None else now
            elapsed = now - last_checked_at
            if processed_delta < self._min_objects and elapsed < self._min_interval_seconds:
                return
        self._last_checked_processed = processed
        self._last_checked_at = now
        if bool(await maybe_await(self._should_cancel())):
            raise BatchCancelledError(self._cancel_message)
