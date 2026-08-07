"""Public contract for the durable project calculation workflow."""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.electrical_variant_limits import MAX_ELECTRICAL_VARIANTS
from app.schemas.specification import (
    SpecificationGenerationResponse,
    SpecificationRequestedOptions,
    SpecificationVariantPreflightResult,
)

CalculationWorkflowStatus = Literal[
    "queued",
    "enqueued",
    "running",
    "waiting_input",
    "succeeded",
    "failed",
    "cancelled",
    "timed_out",
]


class CalculationWorkflowStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variant_ids: list[UUID] = Field(min_length=1, max_length=MAX_ELECTRICAL_VARIANTS)
    options: SpecificationRequestedOptions = Field(default_factory=SpecificationRequestedOptions)

    @field_validator("variant_ids")
    @classmethod
    def unique_variant_ids(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("variant_ids must be unique")
        return value


class CalculationWorkflowResumeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_workflow_version: int = Field(ge=1)
    exclude_unassigned_confirmed: bool = False
    catalog_selections: dict[str, UUID] = Field(default_factory=dict)


class CalculationWorkflowRetryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_workflow_version: int = Field(ge=1)


class CalculationWorkflowProgress(BaseModel):
    current: int = 0
    total: int | None = None
    percent: float | None = None


class CalculationWorkflowResponse(BaseModel):
    id: UUID
    project_id: UUID
    status: CalculationWorkflowStatus
    stage: str
    workflow_version: int
    variant_ids: list[UUID]
    progress: CalculationWorkflowProgress
    queue_deadline_at: datetime | None = None
    execution_deadline_at: datetime | None = None
    interaction_deadline_at: datetime | None = None
    waiting_results: list[SpecificationVariantPreflightResult] = Field(default_factory=list)
    result: SpecificationGenerationResponse | None = None
    error_message: str | None = None
    cancel_requested: bool = False
    created_at: datetime
    started_at: datetime | None = None
    finished_at: datetime | None = None
    status_url: str
    cancel_url: str
    resume_url: str
    retry_url: str
