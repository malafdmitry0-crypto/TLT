"""Remove retired numeric electrical variant identity.

Revision ID: 0057
Revises: 0056
Create Date: 2026-08-22
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0057"
down_revision: str | None = "0056"
branch_labels: str | None = None
depends_on: str | None = None

_SCOPED_TABLES = (
    "electrical_calculations",
    "electrical_candidates",
    "electrical_candidate_folders",
)


def _capture_revision_function(*, include_numeric_identity: bool) -> str:
    numeric_column = ", variant_number" if include_numeric_identity else ""
    numeric_value = ", NEW.variant_number" if include_numeric_identity else ""
    return f"""
        CREATE OR REPLACE FUNCTION tlt_0035_capture_electrical_calculation_revision()
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
                id, electrical_calculation_id, revision_number, supersedes_result_id,
                project_id, object_id{numeric_column}, electrical_variant_id,
                cable_type, cable_type_source, cable_mark, cable_mark_source,
                cable_snapshot, params, results, status,
                source_created_at, source_updated_at, recorded_at
            ) VALUES (
                uuid_generate_v4(), NEW.id,
                COALESCE(previous_revision_number, 0) + 1, previous_revision_id,
                NEW.project_id, NEW.object_id{numeric_value}, NEW.electrical_variant_id,
                NEW.cable_type, NEW.cable_type_source, NEW.cable_mark, NEW.cable_mark_source,
                NEW.cable_snapshot, NEW.params, NEW.results, revision_status,
                NEW.created_at, NEW.updated_at, clock_timestamp()
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
    """


def _project_object_assignment_function(*, include_legacy_diagnostic: bool) -> str:
    legacy_diagnostic = (
        "'legacy_variant_number', variant.legacy_variant_number,"
        if include_legacy_diagnostic
        else ""
    )
    return f"""
        CREATE OR REPLACE FUNCTION tlt_0027_sync_project_object_assignments()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            PERFORM 1 FROM projects WHERE id = NEW.project_id FOR NO KEY UPDATE;
            INSERT INTO electrical_variant_objects (
                id, project_id, electrical_variant_id, object_id,
                system_type, assignment_state, requested_cable_type,
                object_version_snapshot, diagnostics
            )
            SELECT
                md5(variant.id::text || ':' || NEW.id::text ||
                    '-project-object-sync')::uuid,
                NEW.project_id, variant.id, NEW.id, NULL, 'unassigned', NULL, NEW.version,
                jsonb_strip_nulls(jsonb_build_object(
                    'migration_revision', '0027', {legacy_diagnostic}
                    'legacy_success', false,
                    'sections_status', 'not_ready',
                    'sections_error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
                ))
            FROM electrical_variants AS variant
            WHERE variant.project_id = NEW.project_id
            ON CONFLICT (electrical_variant_id, object_id) DO NOTHING;
            RETURN NEW;
        END;
        $$
    """


def upgrade() -> None:
    op.execute(
        "LOCK TABLE electrical_calculations, electrical_candidates, "
        "electrical_candidate_folders, electrical_calculation_revisions, "
        "electrical_variants IN SHARE ROW EXCLUSIVE MODE"
    )

    op.execute(
        "DROP TRIGGER IF EXISTS tr_electrical_calculation_revisions_immutable "
        "ON electrical_calculation_revisions"
    )
    op.execute(
        """
        UPDATE electrical_calculation_revisions AS revision
        SET electrical_variant_id = calculation.electrical_variant_id
        FROM electrical_calculations AS calculation
        WHERE revision.electrical_variant_id IS NULL
          AND calculation.id = revision.electrical_calculation_id
          AND calculation.electrical_variant_id IS NOT NULL
        """
    )
    op.execute(
        """
        UPDATE electrical_calculation_revisions AS revision
        SET electrical_variant_id = variant.id
        FROM electrical_variants AS variant
        WHERE revision.electrical_variant_id IS NULL
          AND variant.project_id = revision.project_id
          AND variant.legacy_variant_number = revision.variant_number
        """
    )
    for table in (*_SCOPED_TABLES, "electrical_calculation_revisions"):
        op.execute(
            f"""
            DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM {table} WHERE electrical_variant_id IS NULL) THEN
                    RAISE EXCEPTION '{table} contains rows without UUID identity';
                END IF;
            END $$
            """
        )
    op.execute(
        "CREATE TRIGGER tr_electrical_calculation_revisions_immutable "
        "BEFORE UPDATE OR DELETE ON electrical_calculation_revisions FOR EACH ROW "
        "EXECUTE FUNCTION tlt_0035_guard_electrical_calculation_revisions()"
    )

    op.execute(_capture_revision_function(include_numeric_identity=False))
    op.execute(_project_object_assignment_function(include_legacy_diagnostic=False))
    for table in _SCOPED_TABLES:
        op.execute(
            f"DROP TRIGGER IF EXISTS trg_0027_sync_electrical_variant_id ON {table}"
        )
    op.execute("DROP FUNCTION IF EXISTS tlt_0027_sync_legacy_electrical_variant_id()")

    for table, constraint, index in (
        (
            "electrical_calculations",
            "ck_electrical_calculations_variant_number",
            "ix_electrical_calculations_project_variant",
        ),
        (
            "electrical_candidates",
            "ck_electrical_candidates_variant_number",
            "ix_electrical_candidates_project_object_variant",
        ),
        (
            "electrical_candidate_folders",
            "ck_electrical_candidate_folders_variant_number",
            "ix_electrical_candidate_folders_scope",
        ),
    ):
        op.drop_constraint(constraint, table, type_="check")
        op.drop_index(index, table_name=table)
        op.drop_column(table, "variant_number")

    op.drop_constraint(
        "ck_electrical_calculation_revisions_variant_number",
        "electrical_calculation_revisions",
        type_="check",
    )
    op.alter_column(
        "electrical_calculation_revisions",
        "electrical_variant_id",
        existing_type=sa.UUID(),
        nullable=False,
    )
    op.drop_column("electrical_calculation_revisions", "variant_number")
    op.drop_constraint(
        "uq_electrical_variants_project_legacy_number",
        "electrical_variants",
        type_="unique",
    )
    op.drop_constraint(
        "ck_electrical_variants_legacy_number",
        "electrical_variants",
        type_="check",
    )
    op.drop_column("electrical_variants", "legacy_variant_number")


def downgrade() -> None:
    op.add_column(
        "electrical_variants",
        sa.Column("legacy_variant_number", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_electrical_variants_legacy_number",
        "electrical_variants",
        "legacy_variant_number IS NULL OR legacy_variant_number BETWEEN 1 AND 4",
    )
    op.create_unique_constraint(
        "uq_electrical_variants_project_legacy_number",
        "electrical_variants",
        ["project_id", "legacy_variant_number"],
    )

    op.add_column(
        "electrical_calculation_revisions",
        sa.Column("variant_number", sa.Integer(), nullable=True),
    )
    op.create_check_constraint(
        "ck_electrical_calculation_revisions_variant_number",
        "electrical_calculation_revisions",
        "variant_number IS NULL OR variant_number BETWEEN 1 AND 4",
    )
    for table, constraint, index, columns in (
        (
            "electrical_calculations",
            "ck_electrical_calculations_variant_number",
            "ix_electrical_calculations_project_variant",
            ["project_id", "variant_number"],
        ),
        (
            "electrical_candidates",
            "ck_electrical_candidates_variant_number",
            "ix_electrical_candidates_project_object_variant",
            ["project_id", "object_id", "variant_number"],
        ),
        (
            "electrical_candidate_folders",
            "ck_electrical_candidate_folders_variant_number",
            "ix_electrical_candidate_folders_scope",
            ["project_id", "object_id", "variant_number", "sort_order"],
        ),
    ):
        op.add_column(table, sa.Column("variant_number", sa.Integer(), nullable=True))
        op.create_check_constraint(
            constraint,
            table,
            "variant_number IS NULL OR variant_number BETWEEN 1 AND 4",
        )
        op.create_index(index, table, columns, unique=False)

    op.execute(_project_object_assignment_function(include_legacy_diagnostic=True))
    op.execute(
        """
        CREATE OR REPLACE FUNCTION tlt_0027_sync_legacy_electrical_variant_id()
        RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
            IF NEW.electrical_variant_id IS NULL THEN
                SELECT variant.id INTO NEW.electrical_variant_id
                FROM electrical_variants AS variant
                WHERE variant.project_id = NEW.project_id
                  AND variant.legacy_variant_number = NEW.variant_number;
            END IF;
            RETURN NEW;
        END $$
        """
    )
    for table in _SCOPED_TABLES:
        op.execute(
            f"""
            CREATE TRIGGER trg_0027_sync_electrical_variant_id
            BEFORE INSERT OR UPDATE OF project_id, variant_number, electrical_variant_id
            ON {table} FOR EACH ROW
            EXECUTE FUNCTION tlt_0027_sync_legacy_electrical_variant_id()
            """
        )
    op.execute(_capture_revision_function(include_numeric_identity=True))
