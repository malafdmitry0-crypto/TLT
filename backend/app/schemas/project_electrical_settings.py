"""API schemas for project electrical settings."""

from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectElectricalSettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=1)
    max_section_start_current_a: Decimal | None = Field(gt=0)


class ProjectElectricalSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    nominal_voltage_v: int
    max_section_start_current_a: Decimal | None
    version: int
    updated_by: str | None
    created_at: datetime
    updated_at: datetime
