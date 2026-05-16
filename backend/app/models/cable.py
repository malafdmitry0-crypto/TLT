"""Расширенный каталог кабелей (администрирование)."""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, Float, Integer, String
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
    supplier_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    article: Mapped[str | None] = mapped_column(String(128), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(8), nullable=True)
    price_per_meter: Mapped[float | None] = mapped_column(Float, nullable=True)
    stock_quantity_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    stock_status: Mapped[str | None] = mapped_column(String(32), nullable=True)
    lead_time_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    supplier_priority: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_preferred: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    order_multiple_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    min_order_quantity_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_discontinued: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    replacement_group: Mapped[str | None] = mapped_column(String(128), nullable=True)
    price_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    stock_updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    commercial_data_source: Mapped[str | None] = mapped_column(String(32), nullable=True)
    params: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
