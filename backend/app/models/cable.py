"""Расширенный каталог кабелей (администрирование)."""

import enum
import uuid
from typing import Any

from sqlalchemy import Boolean, Float, String
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CableType(str, enum.Enum):
    self_regulating = "self_regulating"
    single_core = "single_core"
    three_core = "three_core"
    mineral = "mineral"
    skin = "skin"


cable_type_enum = ENUM(
    CableType,
    name="cable_type",
    values_callable=lambda x: [e.value for e in x],
    create_type=True,
)


class CableExtended(Base, TimestampMixin):
    __tablename__ = "cables_extended"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    cable_type: Mapped[str] = mapped_column(cable_type_enum, nullable=False)
    brand: Mapped[str] = mapped_column(String(128), nullable=False)
    model: Mapped[str] = mapped_column(String(128), nullable=False)
    power_per_meter: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    resistance_per_meter: Mapped[float | None] = mapped_column(Float, nullable=True)
    params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
