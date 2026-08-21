"""Shared typed contracts for heat and electrical calculation use cases."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class BatchProgress:
    current: int
    total: int
    phase: str
    calculated: int = 0
    skipped: int = 0
    heat_loss_failed: int = 0
    object_id: UUID | None = None


@dataclass(frozen=True, slots=True)
class PreparedElectricalTTCalculation:
    """Prepared TT result kept separate from persisted request parameters."""

    cable_mark: str
    result: dict[str, Any]


ProgressCallback = Callable[[BatchProgress], Awaitable[None] | None]
CancelChecker = Callable[[], Awaitable[bool] | bool]
