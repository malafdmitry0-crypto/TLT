"""Add immutable versioned specification catalog and items.

Revision ID: 0036
Revises: 0035
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0036"
down_revision: str | None = "0035"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "specification_catalog_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("catalog_key", sa.String(length=64), nullable=False),
        sa.Column("version", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="draft", nullable=False),
        sa.Column("authority", sa.String(length=16), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_checksum", sa.String(length=71), nullable=False),
        sa.Column("payload_checksum", sa.String(length=71), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False),
        sa.Column("item_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "is_complete",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column(
            "validation_issues",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
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
            "status IN ('draft', 'active', 'retired')",
            name="ck_specification_catalog_versions_status",
        ),
        sa.CheckConstraint(
            "authority IN ('approved', 'provisional', 'synthetic', 'demo', 'guessed')",
            name="ck_specification_catalog_versions_authority",
        ),
        sa.CheckConstraint(
            "schema_version >= 1",
            name="ck_specification_catalog_versions_schema_version",
        ),
        sa.CheckConstraint(
            "item_count >= 0",
            name="ck_specification_catalog_versions_item_count",
        ),
        sa.CheckConstraint(
            "status <> 'active' OR (authority = 'approved' AND is_complete IS TRUE)",
            name="ck_specification_catalog_versions_active_authoritative",
        ),
        sa.CheckConstraint(
            "source_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_specification_catalog_versions_source_checksum",
        ),
        sa.CheckConstraint(
            "payload_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_specification_catalog_versions_payload_checksum",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "catalog_key",
            "version",
            name="uq_specification_catalog_versions_key_version",
        ),
    )
    op.create_index(
        "ux_specification_catalog_versions_active_key",
        "specification_catalog_versions",
        ["catalog_key"],
        unique=True,
        postgresql_where=sa.text("status = 'active'"),
    )
    op.create_table(
        "specification_catalog_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("catalog_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("item_key", sa.String(length=128), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("mark", sa.String(length=255), nullable=False),
        sa.Column("nomenclature_code", sa.String(length=128), nullable=False),
        sa.Column("supply_unit", sa.String(length=32), nullable=False),
        sa.Column(
            "applicability",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "package_parameters",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "formula_parameters",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("source_ref", sa.Text(), nullable=False),
        sa.Column("row_checksum", sa.String(length=71), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "category IN ('cable', 'connection_kit', 'repair_kit', 'sealant', "
            "'fiberglass_tape', 'aluminium_tape', 'box')",
            name="ck_specification_catalog_items_category",
        ),
        sa.CheckConstraint(
            "row_checksum ~ '^sha256:[0-9a-f]{64}$'",
            name="ck_specification_catalog_items_row_checksum",
        ),
        sa.ForeignKeyConstraint(
            ["catalog_version_id"],
            ["specification_catalog_versions.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "catalog_version_id",
            "item_key",
            name="uq_specification_catalog_items_version_key",
        ),
        sa.UniqueConstraint(
            "catalog_version_id",
            "nomenclature_code",
            name="uq_specification_catalog_items_version_code",
        ),
    )
    op.create_index(
        "ix_specification_catalog_items_lookup",
        "specification_catalog_items",
        ["catalog_version_id", "category"],
        unique=False,
    )

    op.execute(
        """
        CREATE FUNCTION tlt_0036_guard_specification_catalog_version()
        RETURNS trigger AS $$
        BEGIN
            IF TG_OP = 'DELETE' AND OLD.status IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active or retired specification catalog is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status IN ('active', 'retired') AND (
                NEW.catalog_key IS DISTINCT FROM OLD.catalog_key OR
                NEW.version IS DISTINCT FROM OLD.version OR
                NEW.authority IS DISTINCT FROM OLD.authority OR
                NEW.source IS DISTINCT FROM OLD.source OR
                NEW.source_checksum IS DISTINCT FROM OLD.source_checksum OR
                NEW.payload_checksum IS DISTINCT FROM OLD.payload_checksum OR
                NEW.schema_version IS DISTINCT FROM OLD.schema_version OR
                NEW.item_count IS DISTINCT FROM OLD.item_count OR
                NEW.is_complete IS DISTINCT FROM OLD.is_complete OR
                NEW.validation_issues IS DISTINCT FROM OLD.validation_issues OR
                NEW.imported_at IS DISTINCT FROM OLD.imported_at OR
                NEW.imported_by IS DISTINCT FROM OLD.imported_by OR
                NEW.activated_at IS DISTINCT FROM OLD.activated_at OR
                NEW.activated_by IS DISTINCT FROM OLD.activated_by
            ) THEN
                RAISE EXCEPTION 'active or retired specification catalog is immutable';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'active'
               AND NEW.status NOT IN ('active', 'retired') THEN
                RAISE EXCEPTION 'active specification catalog may only be retired';
            END IF;
            IF TG_OP = 'UPDATE' AND OLD.status = 'retired' AND NEW.status <> 'retired' THEN
                RAISE EXCEPTION 'retired specification catalog cannot be reactivated';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_specification_catalog_versions_immutable
        BEFORE UPDATE OR DELETE ON specification_catalog_versions
        FOR EACH ROW EXECUTE FUNCTION tlt_0036_guard_specification_catalog_version()
        """
    )
    op.execute(
        """
        CREATE FUNCTION tlt_0036_guard_specification_catalog_item()
        RETURNS trigger AS $$
        DECLARE parent_status text;
        BEGIN
            SELECT status INTO parent_status
            FROM specification_catalog_versions
            WHERE id = COALESCE(NEW.catalog_version_id, OLD.catalog_version_id);
            IF parent_status IN ('active', 'retired') THEN
                RAISE EXCEPTION 'items of active or retired specification catalog are immutable';
            END IF;
            RETURN COALESCE(NEW, OLD);
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(
        """
        CREATE TRIGGER tr_specification_catalog_items_immutable
        BEFORE INSERT OR UPDATE OR DELETE ON specification_catalog_items
        FOR EACH ROW EXECUTE FUNCTION tlt_0036_guard_specification_catalog_item()
        """
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS tr_specification_catalog_items_immutable "
        "ON specification_catalog_items"
    )
    op.execute("DROP FUNCTION IF EXISTS tlt_0036_guard_specification_catalog_item()")
    op.execute(
        "DROP TRIGGER IF EXISTS tr_specification_catalog_versions_immutable "
        "ON specification_catalog_versions"
    )
    op.execute("DROP FUNCTION IF EXISTS tlt_0036_guard_specification_catalog_version()")
    op.drop_index(
        "ix_specification_catalog_items_lookup",
        table_name="specification_catalog_items",
    )
    op.drop_table("specification_catalog_items")
    op.drop_index(
        "ux_specification_catalog_versions_active_key",
        table_name="specification_catalog_versions",
    )
    op.drop_table("specification_catalog_versions")
