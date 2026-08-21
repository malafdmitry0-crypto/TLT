"""Электротехнический расчёт для объекта проекта."""

import uuid
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ElectricalCalculation(Base, TimestampMixin):
    __tablename__ = "electrical_calculations"
    __table_args__ = (
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_electrical_calculations_variant_project",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "object_id"],
            [
                "electrical_variant_objects.electrical_variant_id",
                "electrical_variant_objects.object_id",
            ],
            name="fk_electrical_calculations_variant_object_assignment",
            ondelete="CASCADE",
        ),
        Index(
            "ix_electrical_calculations_project_electrical_variant",
            "project_id",
            "electrical_variant_id",
        ),
        Index(
            "ux_electrical_calculations_object_electrical_variant",
            "object_id",
            "electrical_variant_id",
            unique=True,
            postgresql_where=text("electrical_variant_id IS NOT NULL"),
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
    electrical_variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    cable_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cable_type_source: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    cable_mark: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cable_mark_source: Mapped[str] = mapped_column(String(32), default="auto", nullable=False)
    cable_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
