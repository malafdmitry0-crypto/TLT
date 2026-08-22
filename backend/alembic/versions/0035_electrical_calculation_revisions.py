"""Add append-only electrical calculation revisions.

Revision ID: 0035
Revises: 0034
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0035"
down_revision: str | None = "0034"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Keep backfill and trigger installation gap-free for concurrent writers.
    op.execute("LOCK TABLE electrical_calculations IN SHARE ROW EXCLUSIVE MODE")
    op.create_table(
        "electrical_calculation_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("electrical_calculation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("revision_number", sa.BigInteger(), nullable=False),
        sa.Column("supersedes_result_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cable_type", sa.String(length=64), nullable=False),
        sa.Column("cable_type_source", sa.String(length=32), nullable=False),
        sa.Column("cable_mark", sa.String(length=128), nullable=True),
        sa.Column("cable_mark_source", sa.String(length=32), nullable=False),
        sa.Column(
            "cable_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),  # type: ignore[no-untyped-call]
            nullable=True,
        ),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),  # type: ignore[no-untyped-call]
            nullable=False,
        ),
        sa.Column(
            "results",
            postgresql.JSONB(astext_type=sa.Text()),  # type: ignore[no-untyped-call]
            nullable=True,
        ),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("source_created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "recorded_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "revision_number >= 1",
            name="ck_electrical_calculation_revisions_number",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'success', 'error', 'stale')",
            name="ck_electrical_calculation_revisions_status",
        ),
        sa.CheckConstraint(
            "cable_type IN ('self_regulating', 'self_regulating_tt', "
            "'single_core', 'three_core')",
            name="ck_electrical_calculation_revisions_supported_cable_type",
        ),
        sa.ForeignKeyConstraint(
            ["supersedes_result_id"],
            ["electrical_calculation_revisions.id"],
            name="fk_electrical_calculation_revisions_supersedes",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ux_electrical_calculation_revisions_source_number",
        "electrical_calculation_revisions",
        ["electrical_calculation_id", "revision_number"],
        unique=True,
    )
    op.create_index(
        "ux_electrical_calculation_revisions_supersedes",
        "electrical_calculation_revisions",
        ["supersedes_result_id"],
        unique=True,
    )
    op.create_index(
        "ix_electrical_calculation_revisions_scope",
        "electrical_calculation_revisions",
        ["project_id", "electrical_variant_id", "object_id", "revision_number"],
        unique=False,
    )

    op.execute(
        """
        CREATE FUNCTION tlt_0035_capture_electrical_calculation_revision()
        RETURNS trigger AS $$
        DECLARE
            previous_revision_id uuid;
            previous_revision_number bigint;
            revision_status varchar(16);
        BEGIN
            SELECT id, revision_number
              INTO previous_revision_id, previous_revision_number
              FROM electrical_calculation_revisions
             WHERE electrical_calculation_id = NEW.id
             ORDER BY revision_number DESC, recorded_at DESC, id DESC
             LIMIT 1
             FOR UPDATE;

            revision_status := CASE
                WHEN NEW.results IS NULL THEN 'pending'
                WHEN NEW.results ->> 'stale' = 'true'
                  OR NEW.results ->> 'category' = 'stale' THEN 'stale'
                WHEN NULLIF(NEW.results ->> 'error_code', '') IS NOT NULL
                  OR NULLIF(BTRIM(COALESCE(NEW.results ->> 'error', '')), '') IS NOT NULL
                  OR NEW.results ->> 'category' IN (
                      'calculation_error', 'external', 'formula', 'unsupported', 'validation'
                  ) THEN 'error'
                ELSE 'success'
            END;

            INSERT INTO electrical_calculation_revisions (
                id,
                electrical_calculation_id,
                revision_number,
                supersedes_result_id,
                project_id,
                object_id,
                electrical_variant_id,
                cable_type,
                cable_type_source,
                cable_mark,
                cable_mark_source,
                cable_snapshot,
                params,
                results,
                status,
                source_created_at,
                source_updated_at,
                recorded_at
            ) VALUES (
                uuid_generate_v4(),
                NEW.id,
                COALESCE(previous_revision_number, 0) + 1,
                previous_revision_id,
                NEW.project_id,
                NEW.object_id,
                NEW.electrical_variant_id,
                NEW.cable_type,
                NEW.cable_type_source,
                NEW.cable_mark,
                NEW.cable_mark_source,
                NEW.cable_snapshot,
                NEW.params,
                NEW.results,
                revision_status,
                NEW.created_at,
                NEW.updated_at,
                clock_timestamp()
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_electrical_calculations_capture_revision
        AFTER INSERT OR UPDATE ON electrical_calculations
        FOR EACH ROW EXECUTE FUNCTION tlt_0035_capture_electrical_calculation_revision()
        """
    )

    op.execute(
        """
        INSERT INTO electrical_calculation_revisions (
            id,
            electrical_calculation_id,
            revision_number,
            supersedes_result_id,
            project_id,
            object_id,
            electrical_variant_id,
            cable_type,
            cable_type_source,
            cable_mark,
            cable_mark_source,
            cable_snapshot,
            params,
            results,
            status,
            source_created_at,
            source_updated_at,
            recorded_at
        )
        SELECT
            uuid_generate_v4(),
            ec.id,
            1,
            NULL,
            ec.project_id,
            ec.object_id,
            ec.electrical_variant_id,
            ec.cable_type,
            ec.cable_type_source,
            ec.cable_mark,
            ec.cable_mark_source,
            ec.cable_snapshot,
            ec.params,
            ec.results,
            CASE
                WHEN ec.results IS NULL THEN 'pending'
                WHEN ec.results ->> 'stale' = 'true'
                  OR ec.results ->> 'category' = 'stale' THEN 'stale'
                WHEN NULLIF(ec.results ->> 'error_code', '') IS NOT NULL
                  OR NULLIF(BTRIM(COALESCE(ec.results ->> 'error', '')), '') IS NOT NULL
                  OR ec.results ->> 'category' IN (
                      'calculation_error', 'external', 'formula', 'unsupported', 'validation'
                  ) THEN 'error'
                ELSE 'success'
            END,
            ec.created_at,
            ec.updated_at,
            ec.updated_at
        FROM electrical_calculations AS ec
        """
    )

    op.execute(
        """
        CREATE FUNCTION tlt_0035_guard_electrical_calculation_revisions()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'electrical calculation revisions are append-only';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_electrical_calculation_revisions_immutable
        BEFORE UPDATE OR DELETE ON electrical_calculation_revisions
        FOR EACH ROW EXECUTE FUNCTION tlt_0035_guard_electrical_calculation_revisions()
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS tr_electrical_calculation_revisions_immutable "
        "ON electrical_calculation_revisions"
    )
    op.execute("DROP FUNCTION IF EXISTS tlt_0035_guard_electrical_calculation_revisions()")
    op.execute(
        "DROP TRIGGER IF EXISTS tr_electrical_calculations_capture_revision "
        "ON electrical_calculations"
    )
    op.execute("DROP FUNCTION IF EXISTS tlt_0035_capture_electrical_calculation_revision()")
    op.drop_table("electrical_calculation_revisions")
