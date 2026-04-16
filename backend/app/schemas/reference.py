"""Схемы справочников и расширенных БД (кабели, аксессуары)."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ClimateEntry(BaseModel):
    region: str
    min_temperature: float
    avg_temperature: float
    wind_zone: int


class InsulationEntry(BaseModel):
    material: str
    conductivity: float
    temperature_range: tuple[float, float] | None = None


class CableTltEntry(BaseModel):
    brand: str
    model: str
    power_per_meter: float
    max_temperature: float
    min_temperature: float


class AccessoryEntry(BaseModel):
    category: str
    name: str
    article: str | None = None


# --- Расширенные БД (админка) ---


class CableExtendedBase(BaseModel):
    cable_type: str = Field(pattern="^(self_regulating|single_core|three_core|mineral|skin)$")
    brand: str
    model: str
    power_per_meter: float | None = None
    max_temperature: float | None = None
    min_temperature: float | None = None
    resistance_per_meter: float | None = None
    params: dict[str, Any] | None = None
    is_active: bool = True


class CableExtendedCreate(CableExtendedBase):
    pass


class CableExtendedUpdate(BaseModel):
    brand: str | None = None
    model: str | None = None
    power_per_meter: float | None = None
    max_temperature: float | None = None
    min_temperature: float | None = None
    resistance_per_meter: float | None = None
    params: dict[str, Any] | None = None
    is_active: bool | None = None


class CableExtendedResponse(CableExtendedBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class AccessoryExtendedBase(BaseModel):
    category: str
    name: str
    article: str | None = None
    params: dict[str, Any] | None = None
    is_active: bool = True


class AccessoryExtendedCreate(AccessoryExtendedBase):
    pass


class AccessoryExtendedUpdate(BaseModel):
    category: str | None = None
    name: str | None = None
    article: str | None = None
    params: dict[str, Any] | None = None
    is_active: bool | None = None


class AccessoryExtendedResponse(AccessoryExtendedBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime
