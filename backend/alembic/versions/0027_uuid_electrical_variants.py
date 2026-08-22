"""Create the UUID-native electrical variant graph.

Revision ID: 0027
Revises: 0026
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("electrical_initialized_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_project_objects_id_project", "project_objects", ["id", "project_id"]
    )
    op.create_table(
        "electrical_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("name_normalized", sa.String(512), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("copied_from_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("creation_idempotency_key_hash", sa.String(64), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "name = btrim(name) AND char_length(name) > 0",
            name="ck_electrical_variants_name_trimmed_nonempty",
        ),
        sa.CheckConstraint(
            "name_normalized = btrim(name_normalized) AND char_length(name_normalized) > 0",
            name="ck_electrical_variants_normalized_name_nonempty",
        ),
        sa.CheckConstraint("sort_order >= 0", name="ck_electrical_variants_sort_order_nonnegative"),
        sa.CheckConstraint(
            "creation_idempotency_key_hash IS NULL OR creation_idempotency_key_hash ~ '^[0-9a-f]{64}$'",
            name="ck_electrical_variants_creation_idempotency_hash",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_electrical_variants_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["copied_from_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_electrical_variants_copied_from_project",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "project_id", name="uq_electrical_variants_id_project"),
        sa.UniqueConstraint(
            "project_id", "sort_order", name="uq_electrical_variants_project_sort_order"
        ),
        sa.UniqueConstraint(
            "project_id", "name_normalized", name="ux_electrical_variants_project_normalized_name"
        ),
        sa.UniqueConstraint(
            "project_id",
            "creation_idempotency_key_hash",
            name="uq_electrical_variants_project_creation_idempotency_hash",
        ),
    )
    op.create_index(
        "ux_electrical_variants_project_active",
        "electrical_variants",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("is_active IS TRUE"),
    )
    op.create_table(
        "electrical_variant_objects",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("system_type", sa.String(32), nullable=True),
        sa.Column(
            "assignment_state",
            sa.String(32),
            server_default=sa.text("'unassigned'"),
            nullable=False,
        ),
        sa.Column("requested_cable_type", sa.String(64), nullable=True),
        sa.Column(
            "object_version_snapshot", sa.Integer(), server_default=sa.text("1"), nullable=False
        ),
        sa.Column(
            "diagnostics",
            postgresql.JSONB(),  # type: ignore[no-untyped-call]
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "system_type IS NULL OR system_type IN ('self_regulating', 'resistive', 'skin', 'mineral')",
            name="ck_electrical_variant_objects_system_type",
        ),
        sa.CheckConstraint(
            "assignment_state IN ('unassigned', 'ready', 'unsupported', 'stale', 'error')",
            name="ck_electrical_variant_objects_assignment_state",
        ),
        sa.CheckConstraint(
            "object_version_snapshot >= 1", name="ck_electrical_variant_objects_version_positive"
        ),
        sa.ForeignKeyConstraint(
            ["electrical_variant_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_electrical_variant_objects_variant_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["object_id", "project_id"],
            ["project_objects.id", "project_objects.project_id"],
            name="fk_electrical_variant_objects_object_project",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "electrical_variant_id",
            "object_id",
            name="uq_electrical_variant_objects_variant_object",
        ),
    )
    op.create_index(
        "ix_electrical_variant_objects_project_object",
        "electrical_variant_objects",
        ["project_id", "object_id"],
    )
    op.create_index(
        "ix_electrical_variant_objects_variant_state",
        "electrical_variant_objects",
        ["electrical_variant_id", "assignment_state"],
    )

    op.execute(
        """
        CREATE FUNCTION tlt_0027_sync_project_object_assignments()
        RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
            PERFORM 1 FROM projects WHERE id = NEW.project_id FOR NO KEY UPDATE;
            INSERT INTO electrical_variant_objects (
                id, project_id, electrical_variant_id, object_id, system_type,
                assignment_state, requested_cable_type, object_version_snapshot,
                diagnostics
            )
            SELECT
                md5(item.id::text || ':' || NEW.id::text || '-project-object-sync')::uuid,
                NEW.project_id, item.id, NEW.id, NULL, 'unassigned', NULL, NEW.version,
                jsonb_build_object(
                    'migration_revision', '0027',
                    'sections_status', 'not_ready',
                    'sections_error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
                )
            FROM electrical_variants AS item
            WHERE item.project_id = NEW.project_id
            ON CONFLICT (electrical_variant_id, object_id) DO NOTHING;
            RETURN NEW;
        END
        $function$
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_0027_sync_project_object_assignments
        AFTER INSERT ON project_objects
        FOR EACH ROW EXECUTE FUNCTION tlt_0027_sync_project_object_assignments()
        """
    )

    for table in (
        "electrical_calculations",
        "electrical_candidates",
        "electrical_candidate_folders",
    ):
        op.create_foreign_key(
            f"fk_{table}_variant_project",
            table,
            "electrical_variants",
            ["electrical_variant_id", "project_id"],
            ["id", "project_id"],
            ondelete="CASCADE",
        )
        op.alter_column(
            table,
            "electrical_variant_id",
            existing_type=postgresql.UUID(as_uuid=True),
            nullable=False,
        )

    op.create_foreign_key(
        "fk_specifications_electrical_variant_project",
        "specifications",
        "electrical_variants",
        ["electrical_variant_id", "project_id"],
        ["id", "project_id"],
        ondelete="CASCADE",
    )
    op.alter_column(
        "specifications",
        "electrical_variant_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    for table in (
        "electrical_calculations",
        "electrical_candidates",
        "electrical_candidate_folders",
    ):
        op.create_foreign_key(
            f"fk_{table}_variant_object_assignment",
            table,
            "electrical_variant_objects",
            ["electrical_variant_id", "object_id"],
            ["electrical_variant_id", "object_id"],
            ondelete="CASCADE",
        )

    op.create_index(
        "ix_electrical_calculations_project_electrical_variant",
        "electrical_calculations",
        ["project_id", "electrical_variant_id"],
    )
    op.create_index(
        "ux_electrical_calculations_object_electrical_variant",
        "electrical_calculations",
        ["object_id", "electrical_variant_id"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )
    op.create_index(
        "ix_specifications_electrical_variant_id",
        "specifications",
        ["electrical_variant_id"],
    )
    op.create_index(
        "ix_specifications_project_id",
        "specifications",
        ["project_id"],
    )


def downgrade() -> None:
    pass
