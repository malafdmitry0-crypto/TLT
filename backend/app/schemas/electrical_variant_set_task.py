"""Public contract for a durable explicit electrical ER-set task."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS

ElectricalVariantSetTaskStatus = Literal[
    "queued", "enqueued", "running", "succeeded", "failed", "cancelled", "timed_out"
]


class ElectricalVariantSetTaskStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    electrical_variant_ids: list[UUID] = Field(
        min_length=1,
        max_length=MAX_ELECTRICAL_VARIANTS,
    )

    @field_validator("electrical_variant_ids")
    @classmethod
    def unique_variant_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("electrical_variant_ids must be unique")
        return value


class ElectricalVariantSetTaskRetryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_task_version: int = Field(ge=1)


class ElectricalVariantSetTaskProgress(BaseModel):
    current: int = 0
    total: int | None = None
    percent: float | None = None


class ElectricalVariantSetResult(BaseModel):
    requested_electrical_variant_ids: list[UUID]
    completed_electrical_variant_ids: list[UUID]
    failed_electrical_variant_ids: list[UUID]
    per_variant: dict[str, dict[str, object]] = Field(default_factory=dict)


class ElectricalVariantSetTaskResponse(BaseModel):
    id: UUID
    project_id: UUID
    status: ElectricalVariantSetTaskStatus
    stage: str
    task_version: int
    electrical_variant_ids: list[UUID]
    progress: ElectricalVariantSetTaskProgress
    queue_deadline_at: datetime | None = None
    execution_deadline_at: datetime | None = None
    result: ElectricalVariantSetResult
    error_message: str | None = None
    cancel_requested: bool = False
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    status_url: str
    cancel_url: str
    retry_url: str
