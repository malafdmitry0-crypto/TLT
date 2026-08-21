"""Read-only API contracts for append-only electrical result history."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ElectricalCalculationRevisionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    electrical_calculation_id: UUID
    revision_number: int
    supersedes_result_id: UUID | None
    project_id: UUID
    object_id: UUID
    electrical_variant_id: UUID
    cable_type: str
    cable_type_source: str
    cable_mark: str | None
    cable_mark_source: str
    cable_snapshot: dict[str, Any] | None
    params: dict[str, Any]
    results: dict[str, Any] | None
    status: Literal["pending", "success", "error", "stale"]
    source_created_at: datetime
    source_updated_at: datetime
    recorded_at: datetime


class ElectricalCalculationHistoryResponse(BaseModel):
    calculation_id: UUID
    project_id: UUID
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=200)
    items: list[ElectricalCalculationRevisionResponse]
