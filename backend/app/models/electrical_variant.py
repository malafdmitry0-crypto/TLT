"""Dynamic electrical variants and their per-object assignments."""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    DDL,
    Boolean,
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.project import Project


class ElectricalVariant(Base, TimestampMixin):
    """Named project-scoped electrical solution (ЭР)."""

    __tablename__ = "electrical_variants"
    __table_args__ = (
        CheckConstraint(
            "name = btrim(name) AND char_length(name) > 0",
            name="ck_electrical_variants_name_trimmed_nonempty",
        ),
        CheckConstraint(
            "name_normalized = btrim(name_normalized) " "AND char_length(name_normalized) > 0",
            name="ck_electrical_variants_normalized_name_nonempty",
        ),
        CheckConstraint(
            "sort_order >= 0",
            name="ck_electrical_variants_sort_order_nonnegative",
        ),
        CheckConstraint(
            "legacy_variant_number IS NULL "
            "OR (legacy_variant_number >= 1 AND legacy_variant_number <= 5)",
            name="ck_electrical_variants_legacy_number",
        ),
        CheckConstraint(
            "creation_idempotency_key_hash IS NULL OR "
            "creation_idempotency_key_hash ~ '^[0-9a-f]{64}$'",
            name="ck_electrical_variants_creation_idempotency_hash",
        ),
        ForeignKeyConstraint(
            ["copied_from_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_electrical_variants_copied_from_project",
            deferrable=True,
            initially="DEFERRED",
        ),
        UniqueConstraint(
            "id",
            "project_id",
            name="uq_electrical_variants_id_project",
        ),
        UniqueConstraint(
            "id",
            "project_id",
            "legacy_variant_number",
            name="uq_electrical_variants_id_project_legacy",
        ),
        UniqueConstraint(
            "project_id",
            "sort_order",
            name="uq_electrical_variants_project_sort_order",
        ),
        UniqueConstraint(
            "project_id",
            "legacy_variant_number",
            name="uq_electrical_variants_project_legacy_number",
        ),
        UniqueConstraint(
            "project_id",
            "name_normalized",
            name="ux_electrical_variants_project_normalized_name",
        ),
        UniqueConstraint(
            "project_id",
            "creation_idempotency_key_hash",
            name="uq_electrical_variants_project_creation_idempotency_hash",
        ),
        Index(
            "ux_electrical_variants_project_active",
            "project_id",
            unique=True,
            postgresql_where=text("is_active IS TRUE"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # Full Unicode casefold can expand one display code point to several.
    name_normalized: Mapped[str] = mapped_column(String(512), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    copied_from_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    # Temporary bridge for the expand/contract rollout. New UUID-only rows may
    # leave this NULL after the legacy variant_number cutover.
    legacy_variant_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    creation_idempotency_key_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
    )

    project: Mapped["Project"] = relationship(back_populates="electrical_variants")
    copied_from: Mapped["ElectricalVariant | None"] = relationship(
        remote_side="ElectricalVariant.id",
        foreign_keys=[copied_from_id],
    )
    assignments: Mapped[list["ElectricalVariantObject"]] = relationship(
        back_populates="electrical_variant",
        cascade="all, delete-orphan",
    )


class ElectricalVariantObject(Base, TimestampMixin):
    """Assignment of one project object to one dynamic electrical variant."""

    __tablename__ = "electrical_variant_objects"
    __table_args__ = (
        CheckConstraint(
            "system_type IS NULL OR system_type IN "
            "('self_regulating', 'resistive', 'skin', 'mineral')",
            name="ck_electrical_variant_objects_system_type",
        ),
        CheckConstraint(
            "assignment_state IN ('unassigned', 'ready', 'unsupported', 'stale', 'error')",
            name="ck_electrical_variant_objects_assignment_state",
        ),
        CheckConstraint(
            "object_version_snapshot >= 1",
            name="ck_electrical_variant_objects_version_positive",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_electrical_variant_objects_assignment_version_positive",
        ),
        CheckConstraint(
            "max_section_start_current_a IS NULL OR max_section_start_current_a > 0",
            name="ck_electrical_variant_objects_current_positive",
        ),
        CheckConstraint(
            "assignment_state <> 'unassigned' OR system_type IS NULL",
            name="ck_electrical_variant_objects_unassigned_system_null",
        ),
        CheckConstraint(
            "assignment_state <> 'ready' "
            "OR system_type IN ('self_regulating', 'resistive')",
            name="ck_electrical_variant_objects_ready_supported_system",
        ),
        CheckConstraint(
            "system_type NOT IN ('skin', 'mineral') "
            "OR assignment_state = 'unsupported'",
            name="ck_electrical_variant_objects_unsupported_system_state",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_electrical_variant_objects_variant_project",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["object_id", "project_id"],
            ["project_objects.id", "project_objects.project_id"],
            name="fk_electrical_variant_objects_object_project",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "electrical_variant_id",
            "object_id",
            name="uq_electrical_variant_objects_variant_object",
        ),
        Index(
            "ix_electrical_variant_objects_project_object",
            "project_id",
            "object_id",
        ),
        Index(
            "ix_electrical_variant_objects_variant_state",
            "electrical_variant_id",
            "assignment_state",
        ),
        Index(
            "ix_electrical_variant_objects_variant_system_state",
            "electrical_variant_id",
            "system_type",
            "assignment_state",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    electrical_variant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    object_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    system_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    assignment_state: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        default="unassigned",
        server_default=text("'unassigned'"),
    )
    requested_cable_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # Assignment revision for optimistic concurrency. This is deliberately
    # independent from object_version_snapshot, which tracks heat/object input
    # freshness rather than concurrent edits to this ER assignment.
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    object_version_snapshot: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    diagnostics: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    max_section_start_current_a: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 3),
        nullable=True,
    )

    electrical_variant: Mapped[ElectricalVariant] = relationship(back_populates="assignments")


_LEGACY_SYNC_TABLES = (
    "electrical_calculations",
    "electrical_candidates",
    "electrical_candidate_folders",
    "specifications",
)


def _postgresql_ddl(statement: str) -> Any:
    return DDL(statement).execute_if(dialect="postgresql")  # type: ignore[no-untyped-call]


_CREATE_SYNC_TRIGGER_DDLS = [
    _postgresql_ddl(
        """
        CREATE OR REPLACE FUNCTION tlt_0027_sync_legacy_electrical_variant_id()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$
        BEGIN
            IF NEW.electrical_variant_id IS NULL THEN
                SELECT variant.id
                INTO NEW.electrical_variant_id
                FROM electrical_variants AS variant
                WHERE variant.project_id = NEW.project_id
                  AND variant.legacy_variant_number = NEW.variant_number;
            END IF;
            RETURN NEW;
        END
        $function$
        """
    ),
]
for _legacy_table in _LEGACY_SYNC_TABLES:
    _CREATE_SYNC_TRIGGER_DDLS.extend(
        (
            _postgresql_ddl(
                f"""
                DROP TRIGGER IF EXISTS trg_0027_sync_electrical_variant_id
                ON {_legacy_table}
                """
            ),
            _postgresql_ddl(
                f"""
                CREATE TRIGGER trg_0027_sync_electrical_variant_id
                BEFORE INSERT OR UPDATE OF
                    project_id, variant_number, electrical_variant_id
                ON {_legacy_table}
                FOR EACH ROW
                EXECUTE FUNCTION tlt_0027_sync_legacy_electrical_variant_id()
                """
            ),
        )
    )

_CREATE_SYNC_TRIGGER_DDLS.extend(
    (
        _postgresql_ddl(
            """
            CREATE OR REPLACE FUNCTION tlt_0027_sync_project_object_assignments()
            RETURNS trigger
            LANGUAGE plpgsql
            AS $function$
            BEGIN
                -- Serialize this project's object graph against ER lifecycle
                -- mutations, which take FOR UPDATE on the same project row.
                -- NO KEY UPDATE is compatible with the FK's KEY SHARE lock and
                -- avoids a global/advisory lock across unrelated projects.
                PERFORM 1
                FROM projects
                WHERE id = NEW.project_id
                FOR NO KEY UPDATE;

                INSERT INTO electrical_variant_objects (
                    id,
                    project_id,
                    electrical_variant_id,
                    object_id,
                    system_type,
                    assignment_state,
                    requested_cable_type,
                    object_version_snapshot,
                    diagnostics
                )
                SELECT
                    md5(
                        variant.id::text || ':' || NEW.id::text ||
                        '-project-object-sync'
                    )::uuid,
                    NEW.project_id,
                    variant.id,
                    NEW.id,
                    NULL,
                    'unassigned',
                    NULL,
                    NEW.version,
                    jsonb_strip_nulls(jsonb_build_object(
                        'migration_revision', '0027',
                        'legacy_variant_number', variant.legacy_variant_number,
                        'legacy_success', false,
                        'sections_status', 'not_ready',
                        'sections_error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
                    ))
                FROM electrical_variants AS variant
                WHERE variant.project_id = NEW.project_id
                ON CONFLICT (electrical_variant_id, object_id) DO NOTHING;
                RETURN NEW;
            END
            $function$
            """
        ),
        _postgresql_ddl(
            """
            DROP TRIGGER IF EXISTS trg_0027_sync_project_object_assignments
            ON project_objects
            """
        ),
        _postgresql_ddl(
            """
            CREATE TRIGGER trg_0027_sync_project_object_assignments
            AFTER INSERT ON project_objects
            FOR EACH ROW
            EXECUTE FUNCTION tlt_0027_sync_project_object_assignments()
            """
        ),
    )
)

_DROP_SYNC_TRIGGER_DDLS = [
    _postgresql_ddl(
        """
        DROP TRIGGER IF EXISTS trg_0027_sync_project_object_assignments
        ON project_objects
        """
    ),
    _postgresql_ddl("DROP FUNCTION IF EXISTS tlt_0027_sync_project_object_assignments()"),
]
for _legacy_table in _LEGACY_SYNC_TABLES:
    _DROP_SYNC_TRIGGER_DDLS.append(
        _postgresql_ddl(
            f"""
            DROP TRIGGER IF EXISTS trg_0027_sync_electrical_variant_id
            ON {_legacy_table}
            """
        )
    )
_DROP_SYNC_TRIGGER_DDLS.append(
    _postgresql_ddl("DROP FUNCTION IF EXISTS tlt_0027_sync_legacy_electrical_variant_id()")
)

for _ddl in _CREATE_SYNC_TRIGGER_DDLS:
    event.listen(Base.metadata, "after_create", _ddl)
for _ddl in _DROP_SYNC_TRIGGER_DDLS:
    event.listen(Base.metadata, "before_drop", _ddl)
