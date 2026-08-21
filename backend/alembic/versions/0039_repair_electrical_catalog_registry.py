"""Repair electrical catalog registry drift from early 0034 deployments.

Revision ID: 0039
Revises: 0038
Create Date: 2026-08-03
"""

from __future__ import annotations

from alembic import op

revision: str = "0039"
down_revision: str | None = "0038"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    # Some environments applied an early 0034 shape before import_checksum and
    # the final immutability constraints were added.  Repair them in place;
    # clean installations already satisfy every statement below.
    op.execute(
        "ALTER TABLE electrical_catalog_versions "
        "ADD COLUMN IF NOT EXISTS import_checksum VARCHAR(71)"
    )
    op.execute(
        "UPDATE electrical_catalog_versions "
        "SET import_checksum = payload_checksum "
        "WHERE import_checksum IS NULL"
    )
    op.execute(
        "ALTER TABLE electrical_catalog_versions " "ALTER COLUMN import_checksum SET NOT NULL"
    )

    # An unapproved active power row cannot survive the production invariant.
    # Retiring it is fail-closed and frees the unique active-kind slot for an
    # explicitly approved replacement.
    op.execute(
        "UPDATE electrical_catalog_versions "
        "SET status = 'retired' "
        "WHERE kind = 'power' AND status = 'active' "
        "AND production_approved IS NOT TRUE"
    )
    op.execute(
        """
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_electrical_catalog_versions_import_checksum'
                  AND conrelid = 'electrical_catalog_versions'::regclass
            ) THEN
                ALTER TABLE electrical_catalog_versions
                ADD CONSTRAINT ck_electrical_catalog_versions_import_checksum
                CHECK (import_checksum ~ '^sha256:[0-9a-f]{64}$');
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'ck_electrical_catalog_versions_active_power_approved'
                  AND conrelid = 'electrical_catalog_versions'::regclass
            ) THEN
                ALTER TABLE electrical_catalog_versions
                ADD CONSTRAINT ck_electrical_catalog_versions_active_power_approved
                CHECK (kind <> 'power' OR status <> 'active' OR production_approved IS TRUE);
            END IF;
        END
        $$
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION tlt_0034_guard_electrical_catalog_immutability()
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
        "DROP TRIGGER IF EXISTS tr_electrical_catalog_versions_immutable "
        "ON electrical_catalog_versions"
    )
    op.execute(
        """
        CREATE TRIGGER tr_electrical_catalog_versions_immutable
        BEFORE UPDATE OR DELETE ON electrical_catalog_versions
        FOR EACH ROW EXECUTE FUNCTION tlt_0034_guard_electrical_catalog_immutability()
        """
    )


def downgrade() -> None:
    # This migration restores the schema already declared by revision 0034.
    # Removing the repaired column or guards would make a downgraded 0038
    # database inconsistent with its own migration contract.
    pass
