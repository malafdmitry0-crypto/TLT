"""Схемы корректирующих коэффициентов."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class CoefficientBase(BaseModel):
    key: str = Field(min_length=1, max_length=64)
    value: float
    description: str | None = None


class CoefficientCreate(CoefficientBase):
    pass


class CoefficientUpdate(BaseModel):
    value: float
    description: str | None = None


class CoefficientResponse(CoefficientBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    updated_by: UUID | None
    updated_at: datetime
