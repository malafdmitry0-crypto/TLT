"""Схемы спецификации."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SpecificationItem(BaseModel):
    category: str
    name: str
    article: str | None = None
    unit: str = "шт."
    quantity: float
    params: dict[str, Any] = Field(default_factory=dict)
    # 'auto' — построено генератором из электрорасчёта; 'manual' — добавлено сотрудником.
    # При перегенерации auto-позиции пересоздаются, manual — сохраняются.
    source: str | None = None


class SpecificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    variant_number: int
    items: list[dict[str, Any]]
    created_at: datetime
    updated_at: datetime


class SpecificationGenerateResponse(BaseModel):
    project_id: UUID
    items: list[SpecificationItem]


class SpecificationUpdateRequest(BaseModel):
    items: list[SpecificationItem]
