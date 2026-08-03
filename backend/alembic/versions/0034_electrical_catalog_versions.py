"""Add immutable versioned electrical catalog registry.

Revision ID: 0034
Revises: 0033
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "electrical_catalog_versions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("version", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_checksum", sa.String(length=71), nullable=False),
        sa.Column("import_checksum", sa.String(length=71), nullable=False),
        sa.Column("payload_checksum", sa.String(length=71), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("valid_row_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("rejected_row_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "diagnostics",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "production_approved", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.Column(
            "imported_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("imported_by", sa.String(length=255), nullable=True),
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("activated_by", sa.String(length=255), nullable=True),
        sa.CheckConstraint(
            "kind IN ('power', 'section', 'bom')",
            name="ck_electrical_catalog_versions_kind",
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'retired')",
            name="ck_electrical_catalog_versions_status",
        ),
        sa.CheckConstraint(
            "schema_version >= 1",
            name="ck_electrical_catalog_versions_schema_version",
        ),
        sa.CheckConstraint(
            "valid_row_count >= 0 AND rejected_row_count >= 0",
            name="ck_electrical_catalog_versions_row_counts",
        ),
        sa.CheckConstraint(
            "kind <> 'power' OR status <> 'active' OR production_approved IS TRUE",
            name="ck_electrical_catalog_versions_active_power_approved",
        ),
        sa.CheckConstraint(
            "source_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_electrical_catalog_versions_source_checksum",
        ),
        sa.CheckConstraint(
            "payload_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_electrical_catalog_versions_payload_checksum",
        ),
        sa.CheckConstraint(
            "import_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_electrical_catalog_versions_import_checksum",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ux_electrical_catalog_versions_kind_version",
        "electrical_catalog_versions",
        ["kind", "version"],
        unique=True,
    )
    op.create_index(
        "ux_electrical_catalog_versions_active_kind",
        "electrical_catalog_versions",
        ["kind"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.execute(
        """
        CREATE FUNCTION tlt_0034_guard_electrical_catalog_immutability()
        RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND OLD.status IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active or retired electrical catalog payload is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'retired') AND (
                NEW.kind IS DISTINCT FROM OLD.kind OR
                NEW.version IS DISTINCT FROM OLD.version OR
                NEW.source IS DISTINCT FROM OLD.source OR
                NEW.source_checksum IS DISTINCT FROM OLD.source_checksum OR
                NEW.import_checksum IS DISTINCT FROM OLD.import_checksum OR
                NEW.payload_checksum IS DISTINCT FROM OLD.payload_checksum OR
                NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
                NEW.payload IS DISTINCT FROM OLD.payload OR
                NEW.valid_row_count IS DISTINCT FROM OLD.valid_row_count OR
                NEW.rejected_row_count IS DISTINCT FROM OLD.rejected_row_count OR
                NEW.diagnostics IS DISTINCT FROM OLD.diagnostics OR
                NEW.production_approved IS DISTINCT FROM OLD.production_approved OR
                NEW.imported_at IS DISTINCT FROM OLD.imported_at OR
                NEW.imported_by IS DISTINCT FROM OLD.imported_by OR
                NEW.activated_at IS DISTINCT FROM OLD.activated_at OR
                NEW.activated_by IS DISTINCT FROM OLD.activated_by
            ) THEN
                RAISE EXCEPTION 'active or retired electrical catalog payload is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'active'
               AND NEW.status NOT IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active electrical catalog may only be retired';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'retired' AND NEW.status <> 'retired' THEN
                RAISE EXCEPTION 'retired electrical catalog cannot be reactivated';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_electrical_catalog_versions_immutable
        BEFORE UPDATE OR DELETE ON electrical_catalog_versions
        FOR EACH ROW EXECUTE FUNCTION tlt_0034_guard_electrical_catalog_immutability()
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS tr_electrical_catalog_versions_immutable "
        "ON electrical_catalog_versions"
    )
    op.execute("DROP FUNCTION IF EXISTS tlt_0034_guard_electrical_catalog_immutability()")
    op.drop_index(
        "ux_electrical_catalog_versions_active_kind",
        table_name="electrical_catalog_versions",
    )
    op.drop_index(
        "ux_electrical_catalog_versions_kind_version",
        table_name="electrical_catalog_versions",
    )
    op.drop_table("electrical_catalog_versions")
