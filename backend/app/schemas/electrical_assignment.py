"""Public contracts for project-scoped ER object assignments."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.electrical_variant import (
    ElectricalAssignmentState,
    ElectricalSpecificationState,
    ElectricalSystemType,
)
from app.schemas.project import ProjectObjectResponse, ProjectObjectsPageInfo

ElectricalAssignmentView = Literal[
    "all",
    "unassigned",
    "self_regulating",
    "resistive",
    "skin",
    "mineral",
]


class ElectricalAssignmentMutationItem(BaseModel):
    object_id: UUID
    expected_version: int = Field(ge=1)


class ElectricalAssignmentsPatchRequest(BaseModel):
    system_type: ElectricalSystemType
    items: list[ElectricalAssignmentMutationItem] = Field(min_length=1, max_length=500)


class ElectricalAssignmentsUnassignRequest(BaseModel):
    confirm: bool = False
    items: list[ElectricalAssignmentMutationItem] = Field(min_length=1, max_length=500)


class ElectricalAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    electrical_variant_id: UUID
    object_id: UUID
    system_type: ElectricalSystemType | None
    assignment_state: ElectricalAssignmentState
    requested_cable_type: str | None
    object_version_snapshot: int
    version: int
    diagnostics: dict[str, Any]
    object: ProjectObjectResponse
    created_at: datetime
    updated_at: datetime


class ElectricalAssignmentSystemCounts(BaseModel):
    unassigned: int = 0
    self_regulating: int = 0
    resistive: int = 0
    skin: int = 0
    mineral: int = 0


class ElectricalAssignmentStateCounts(BaseModel):
    unassigned: int = 0
    ready: int = 0
    unsupported: int = 0
    stale: int = 0
    error: int = 0


class ElectricalAssignmentCounts(BaseModel):
    total: int
    filtered: int
    by_system: ElectricalAssignmentSystemCounts
    by_state: ElectricalAssignmentStateCounts


class ElectricalAssignmentsListResponse(BaseModel):
    project_id: UUID
    electrical_variant_id: UUID
    items: list[ElectricalAssignmentResponse]
    counts: ElectricalAssignmentCounts
    page_info: ProjectObjectsPageInfo


class ElectricalAssignmentsMutationResponse(BaseModel):
    project_id: UUID
    electrical_variant_id: UUID
    changed_count: int
    assignments: list[ElectricalAssignmentResponse]
    cleanup: dict[str, int] = Field(default_factory=dict)
    specification_state: ElectricalSpecificationState
