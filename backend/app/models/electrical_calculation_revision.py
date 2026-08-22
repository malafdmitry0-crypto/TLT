"""Append-only snapshots of the electrical calculation current projection."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ElectricalCalculationRevision(Base):
    """Immutable audit revision captured by the database projection trigger."""

    __tablename__ = "electrical_calculation_revisions"
    __table_args__ = (
        CheckConstraint(
            "revision_number >= 1",
            name="ck_electrical_calculation_revisions_number",
        ),
        CheckConstraint(
            "status IN ('pending', 'success', 'error', 'stale')",
            name="ck_electrical_calculation_revisions_status",
        ),
        CheckConstraint(
            "cable_type IN ('self_regulating', 'self_regulating_tt', "
            "'single_core', 'three_core')",
            name="ck_electrical_calculation_revisions_supported_cable_type",
        ),
        Index(
            "ux_electrical_calculation_revisions_source_number",
            "electrical_calculation_id",
            "revision_number",
            unique=True,
        ),
        Index(
            "ux_electrical_calculation_revisions_supersedes",
            "supersedes_result_id",
            unique=True,
        ),
        Index(
            "ix_electrical_calculation_revisions_scope",
            "project_id",
            "electrical_variant_id",
            "object_id",
            "revision_number",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Deliberately not an FK: audit history survives deletion of the current projection.
    electrical_calculation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    revision_number: Mapped[int] = mapped_column(BigInteger, nullable=False)
    supersedes_result_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("electrical_calculation_revisions.id", ondelete="RESTRICT"),
        nullable=True,
    )

    # Scope identifiers are immutable snapshot values, not lifecycle-cascading relations.
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    object_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    electrical_variant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    cable_type: Mapped[str] = mapped_column(String(64), nullable=False)
    cable_type_source: Mapped[str] = mapped_column(String(32), nullable=False)
    cable_mark: Mapped[str | None] = mapped_column(String(128), nullable=True)
    cable_mark_source: Mapped[str] = mapped_column(String(32), nullable=False)
    cable_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)

    source_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
