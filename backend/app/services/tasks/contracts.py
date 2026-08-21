"""Shared task workflow constants and errors."""

from dataclasses import dataclass
from typing import Literal

from app.core.config import settings

TASK_ELECTRICAL_BATCH = "electrical_batch"
TASK_HEAT_LOSS_BATCH = "heat_loss_batch"
TASK_REPORT_EXPORT = "report_export"
ACTIVE_STATUSES = ("queued", "enqueued", "running", "waiting_input")
TERMINAL_STATUSES = ("succeeded", "failed", "cancelled", "timed_out")
SUPPORTED_TASK_TYPES = (
    TASK_ELECTRICAL_BATCH,
    TASK_HEAT_LOSS_BATCH,
    TASK_REPORT_EXPORT,
)
MAX_TASK_ERROR_MESSAGE_LENGTH = 4_000
MAX_AUDIT_MESSAGE_LENGTH = 1_000
ELECTRICAL_VARIANT_NOT_FOUND = "ELECTRICAL_VARIANT_NOT_FOUND"
TASK_IDEMPOTENCY_KEY_REUSED = "TASK_IDEMPOTENCY_KEY_REUSED"
IDEMPOTENCY_REPLAY_ATTR = "_idempotency_replay"
WorkerFailureAction = Literal["ack", "retry", "dead_letter"]


@dataclass(frozen=True)
class ProgressWritePolicy:
    min_interval_ms: int = settings.WORKER_PROGRESS_MIN_INTERVAL_MS
    min_percent_delta: float = settings.WORKER_PROGRESS_MIN_PERCENT_DELTA


def compact_task_error_message(
    error_message: str,
    *,
    max_length: int = MAX_TASK_ERROR_MESSAGE_LENGTH,
) -> str:
    if len(error_message) <= max_length:
        return error_message
    suffix = f"... [truncated, original length: {len(error_message)} chars]"
    return f"{error_message[: max_length - len(suffix)]}{suffix}"


class TaskNotFoundError(Exception):
    pass


class TaskAccessError(Exception):
    pass


class TaskLimitError(Exception):
    pass


class TaskIdempotencyConflictError(Exception):
    code = TASK_IDEMPOTENCY_KEY_REUSED
    message = "Idempotency-Key уже использован для другой операции"

    def __init__(self) -> None:
        super().__init__(self.message)

    def as_detail(self) -> dict[str, str]:
        return {"code": self.code, "message": self.message}
