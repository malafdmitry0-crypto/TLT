"""Immutable versioned catalogs used by the canonical electrical pipeline."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ElectricalCatalogVersion(Base):
    __tablename__ = "electrical_catalog_versions"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('power', 'section', 'bom')",
            name="ck_electrical_catalog_versions_kind",
        ),
        CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_electrical_catalog_versions_status",
        ),
        CheckConstraint(
            "schema_version >= 1",
            name="ck_electrical_catalog_versions_schema_version",
        ),
        CheckConstraint(
            "valid_row_count >= 0 AND rejected_row_count >= 0",
            name="ck_electrical_catalog_versions_row_counts",
        ),
        CheckConstraint(
            "kind <> 'power' OR status <> 'active' OR production_approved IS TRUE",
            name="ck_electrical_catalog_versions_active_power_approved",
        ),
        CheckConstraint(
            "source_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_electrical_catalog_versions_source_checksum",
        ),
        CheckConstraint(
            "payload_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_electrical_catalog_versions_payload_checksum",
        ),
        CheckConstraint(
            "import_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_electrical_catalog_versions_import_checksum",
        ),
        Index(
            "ux_electrical_catalog_versions_active_kind",
            "kind",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        Index(
            "ux_electrical_catalog_versions_kind_version",
            "kind",
            "version",
            unique=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    version: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", server_default=text("'draft'")
    )
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_checksum: Mapped[str] = mapped_column(String(71), nullable=False)
    import_checksum: Mapped[str] = mapped_column(String(71), nullable=False)
    payload_checksum: Mapped[str] = mapped_column(String(71), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    valid_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    rejected_row_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    diagnostics: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    production_approved: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    imported_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
