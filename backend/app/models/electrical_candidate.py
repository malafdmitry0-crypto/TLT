"""Варианты подбора кабеля для инженерного выбора на SC-04."""

import uuid
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ElectricalCandidate(Base, TimestampMixin):
    __tablename__ = "electrical_candidates"
    __table_args__ = (
        CheckConstraint(
            "variant_number >= 1 AND variant_number <= 5",
            name="ck_electrical_candidates_variant_number",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id", "variant_number"],
            [
                "electrical_variants.id",
                "electrical_variants.project_id",
                "electrical_variants.legacy_variant_number",
            ],
            name="fk_electrical_candidates_variant_project_legacy",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "object_id"],
            [
                "electrical_variant_objects.electrical_variant_id",
                "electrical_variant_objects.object_id",
            ],
            name="fk_electrical_candidates_variant_object_assignment",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "mode IN ('auto', 'manual')",
            name="ck_electrical_candidates_mode",
        ),
        CheckConstraint(
            "status IN ('applicable', 'error', 'not_applicable', 'excluded', 'stale')",
            name="ck_electrical_candidates_status",
        ),
        Index(
            "ix_electrical_candidates_project_object_variant",
            "project_id",
            "object_id",
            "variant_number",
        ),
        Index(
            "ux_electrical_candidates_applied_object_variant",
            "object_id",
            "variant_number",
            unique=True,
            postgresql_where=text("is_applied"),
        ),
        Index(
            "ux_electrical_candidates_object_variant_dedupe",
            "object_id",
            "variant_number",
            "dedupe_key",
            unique=True,
        ),
        Index(
            "ix_electrical_candidates_project_object_electrical_variant",
            "project_id",
            "object_id",
            "electrical_variant_id",
        ),
        Index(
            "ux_electrical_candidates_applied_object_electrical_variant",
            "object_id",
            "electrical_variant_id",
            unique=True,
            postgresql_where=text("is_applied AND electrical_variant_id IS NOT NULL"),
        ),
        Index(
            "ux_electrical_candidates_object_electrical_variant_dedupe",
            "object_id",
            "electrical_variant_id",
            "dedupe_key",
            unique=True,
            postgresql_where=text("electrical_variant_id IS NOT NULL"),
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
    electrical_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    cable_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cable_source: Mapped[str] = mapped_column(String(32), default="builtin", nullable=False)
    cable_mark: Mapped[str | None] = mapped_column(String(128), nullable=True)
    dedupe_key: Mapped[str] = mapped_column(String(128), nullable=False)
    mode: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="applicable", nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_recommended: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_applied: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reason_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    reason_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    engineer_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    cable_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    warnings: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    risk_flags: Mapped[list[Any]] = mapped_column(JSONB, nullable=False, default=list)
    candidate_meta: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
