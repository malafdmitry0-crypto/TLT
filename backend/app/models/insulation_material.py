"""Runtime catalog of insulation materials seeded from reference JSON."""

import uuid
from typing import Any

from sqlalchemy import Boolean, Float, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class InsulationMaterial(Base, TimestampMixin):
    __tablename__ = "insulation_materials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    material: Mapped[str] = mapped_column(String(128), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(512), nullable=False)
    conductivity: Mapped[float | None] = mapped_column(Float, nullable=True)
    density_kg_m3: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    temperature_range: Mapped[list[float] | None] = mapped_column(JSONB, nullable=True)
    conductivity_20_plus: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    conductivity_19_minus: Mapped[Any | None] = mapped_column(JSONB, nullable=True)
    selectable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    deprecated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    requires_material_reselection: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    material_family: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reselection_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str | None] = mapped_column(String(512), nullable=True)
    data_source: Mapped[str] = mapped_column(String(32), default="builtin_json", nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
