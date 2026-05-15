"""Электротехнический расчёт для объекта проекта."""

import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ElectricalCalculation(Base, TimestampMixin):
    __tablename__ = "electrical_calculations"
    __table_args__ = (
        Index(
            "ix_electrical_calculations_project_variant",
            "project_id",
            "variant_number",
        ),
        Index(
            "ix_electrical_calculations_object_variant",
            "object_id",
            "variant_number",
            unique=True,
        ),
        Index(
            "ix_electrical_calculations_cable_type_source",
            "cable_type_source",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    object_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_objects.id", ondelete="CASCADE"),
        nullable=False,
    )
    variant_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cable_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cable_type_source: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    cable_mark: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cable_mark_source: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
