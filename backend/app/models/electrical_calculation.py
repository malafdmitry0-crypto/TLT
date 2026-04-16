"""Электротехнический расчёт для объекта проекта."""

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ElectricalCalculation(Base, TimestampMixin):
    __tablename__ = "electrical_calculations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    object_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_objects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cable_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cable_mark: Mapped[str | None] = mapped_column(String(128), nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
