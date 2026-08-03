"""Спецификация проекта."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Specification(Base, TimestampMixin):
    __tablename__ = "specifications"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "electrical_variant_id",
            name="uq_specifications_project_electrical_variant",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_specifications_electrical_variant_project",
            ondelete="CASCADE",
        ),
        Index(
            "ix_specifications_electrical_variant_id",
            "electrical_variant_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    electrical_variant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_stale: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    stale_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stale_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stale_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)


class SpecificationCatalogVersion(Base):
    """Immutable после активации версия полного BOM-каталога."""

    __tablename__ = "specification_catalog_versions"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_specification_catalog_versions_status",
        ),
        CheckConstraint(
            "authority IN ('approved', 'provisional', 'synthetic', 'demo', 'guessed')",
            name="ck_specification_catalog_versions_authority",
        ),
        CheckConstraint(
            "schema_version >= 1",
            name="ck_specification_catalog_versions_schema_version",
        ),
        CheckConstraint(
            "item_count >= 0",
            name="ck_specification_catalog_versions_item_count",
        ),
        CheckConstraint(
            "status <> 'active' OR (authority = 'approved' AND is_complete IS TRUE)",
            name="ck_specification_catalog_versions_active_authoritative",
        ),
        CheckConstraint(
            "source_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_specification_catalog_versions_source_checksum",
        ),
        CheckConstraint(
            "payload_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_specification_catalog_versions_payload_checksum",
        ),
        Index(
            "ux_specification_catalog_versions_active_key",
            "catalog_key",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        UniqueConstraint(
            "catalog_key",
            "version",
            name="uq_specification_catalog_versions_key_version",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalog_key: Mapped[str] = mapped_column(String(64), nullable=False)
    version: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="draft", server_default=text("'draft'")
    )
    authority: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(Text, nullable=False)
    source_checksum: Mapped[str] = mapped_column(String(71), nullable=False)
    payload_checksum: Mapped[str] = mapped_column(String(71), nullable=False)
    schema_version: Mapped[int] = mapped_column(Integer, nullable=False)
    item_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_complete: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    validation_issues: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    imported_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)


class SpecificationCatalogItem(Base):
    """Одна immutable номенклатурная строка конкретной версии."""

    __tablename__ = "specification_catalog_items"
    __table_args__ = (
        CheckConstraint(
            "category IN ('cable', 'connection_kit', 'repair_kit', 'sealant', "
            "'fiberglass_tape', 'aluminium_tape', 'box')",
            name="ck_specification_catalog_items_category",
        ),
        CheckConstraint(
            "row_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_specification_catalog_items_row_checksum",
        ),
        UniqueConstraint(
            "catalog_version_id",
            "item_key",
            name="uq_specification_catalog_items_version_key",
        ),
        UniqueConstraint(
            "catalog_version_id",
            "nomenclature_code",
            name="uq_specification_catalog_items_version_code",
        ),
        Index(
            "ix_specification_catalog_items_lookup",
            "catalog_version_id",
            "category",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    catalog_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("specification_catalog_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_key: Mapped[str] = mapped_column(String(128), nullable=False)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    mark: Mapped[str] = mapped_column(String(255), nullable=False)
    nomenclature_code: Mapped[str] = mapped_column(String(128), nullable=False)
    supply_unit: Mapped[str] = mapped_column(String(32), nullable=False)
    applicability: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    package_parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    formula_parameters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    source_ref: Mapped[str] = mapped_column(Text, nullable=False)
    row_checksum: Mapped[str] = mapped_column(String(71), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)


class SpecificationCatalogSelection(Base, TimestampMixin):
    """Persisted explicit multi-candidate catalog choice for one ER group.

    Auto-single selections are derived at preflight time and are not stored here.
    """

    __tablename__ = "specification_catalog_selections"
    __table_args__ = (
        UniqueConstraint(
            "project_id",
            "electrical_variant_id",
            "candidate_group_key",
            name="uq_spec_catalog_selections_project_er_group",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_spec_catalog_selections_variant_project",
            ondelete="CASCADE",
        ),
        CheckConstraint(
            "collection_version >= 1",
            name="ck_spec_catalog_selections_collection_version",
        ),
        CheckConstraint(
            "char_length(btrim(candidate_group_key)) > 0",
            name="ck_spec_catalog_selections_group_key_nonempty",
        ),
        Index(
            "ix_spec_catalog_selections_project_er",
            "project_id",
            "electrical_variant_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    electrical_variant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    candidate_group_key: Mapped[str] = mapped_column(String(128), nullable=False)
    catalog_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("specification_catalog_versions.id", ondelete="CASCADE"),
        nullable=False,
    )
    catalog_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("specification_catalog_items.id", ondelete="CASCADE"),
        nullable=False,
    )
    candidate_set_fingerprint: Mapped[str] = mapped_column(String(71), nullable=False)
    collection_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
