"""Public contracts for project-scoped ER object assignments."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

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


class ElectricalAssignmentCurrentLimitPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    max_section_start_current_a: Decimal | None = Field(gt=0)


class ElectricalAssignmentOverridesPatch(BaseModel):
    """Sparse patch for TT inputs persisted inside one exact UUID ER.

    ``model_fields_set`` is part of the contract: omitted keys are unchanged,
    while an explicit null either clears an object-fallback override or remains
    a normative null, depending on the field.
    """

    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    steam_temperature_c: Decimal | None = None
    maintain_temperature_c: Decimal | None = None
    aggressive_product: bool | None = None
    winding_pitch_mm: Decimal | None = Field(default=None, gt=0)
    thread_count: int | None = Field(default=None, ge=1, le=3)
    manual_cable_model: str | None = Field(default=None, min_length=1, max_length=128)
    tank_heating_height_m: Decimal | None = Field(default=None, gt=0)
    tank_laying_step_m: Decimal | None = Field(default=None, ge=Decimal("0.1"), le=Decimal("0.4"))

    @model_validator(mode="after")
    def require_at_least_one_override(self) -> "ElectricalAssignmentOverridesPatch":
        if self.model_fields_set == {"expected_version"}:
            raise ValueError("at least one electrical override field is required")
        return self


class ElectricalAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    electrical_variant_id: UUID
    object_id: UUID
    system_type: ElectricalSystemType | None
    assignment_state: ElectricalAssignmentState
    requested_cable_type: str | None
    max_section_start_current_a: Decimal | None
    electrical_overrides: dict[str, Any]
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
