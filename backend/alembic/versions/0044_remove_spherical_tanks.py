"""Remove legacy spherical tanks and their derived data.

Revision ID: 0044
Revises: 0043
"""

from __future__ import annotations

import logging

import sqlalchemy as sa

from alembic import op

revision = "0044"
down_revision = "0043"
branch_labels = None
depends_on = None

_LOGGER = logging.getLogger("alembic.runtime.migration")
_REVISION_GUARD_TRIGGER = "tr_electrical_calculation_revisions_immutable"
_EXPECTED_PROJECT_OBJECT_FOREIGN_KEYS = {
    (
        "electrical_calculations",
        "electrical_calculations_object_id_fkey",
        "c",
    ),
    (
        "electrical_candidate_folders",
        "electrical_candidate_folders_object_id_fkey",
        "c",
    ),
    (
        "electrical_candidates",
        "electrical_candidates_object_id_fkey",
        "c",
    ),
    (
        "electrical_variant_objects",
        "fk_electrical_variant_objects_object_project",
        "c",
    ),
}


def _verify_project_object_foreign_keys(bind: sa.engine.Connection) -> None:
    rows = bind.execute(
        sa.text(
            """
            SELECT
                constraint_table.relname AS table_name,
                constraint_row.conname AS constraint_name,
                constraint_row.confdeltype AS delete_action
            FROM pg_constraint AS constraint_row
            JOIN pg_class AS constraint_table
              ON constraint_table.oid = constraint_row.conrelid
            WHERE constraint_row.contype = 'f'
              AND constraint_row.confrelid = 'project_objects'::regclass
            ORDER BY constraint_table.relname, constraint_row.conname
            """
        )
    ).all()
    actual = {
        (
            str(row[0]),
            str(row[1]),
            row[2].decode("ascii") if isinstance(row[2], bytes) else str(row[2]),
        )
        for row in rows
    }
    if actual != _EXPECTED_PROJECT_OBJECT_FOREIGN_KEYS:
        raise RuntimeError(
            "0044 project_objects foreign-key contract changed; "
            f"expected={sorted(_EXPECTED_PROJECT_OBJECT_FOREIGN_KEYS)!r}, "
            f"actual={sorted(actual)!r}"
        )


def _verify_revision_guard_trigger(bind: sa.engine.Connection) -> None:
    trigger_exists = bind.execute(
        sa.text(
            """
            SELECT EXISTS (
                SELECT 1
                FROM pg_trigger
                WHERE tgrelid = 'electrical_calculation_revisions'::regclass
                  AND tgname = :trigger_name
                  AND NOT tgisinternal
            )
            """
        ),
        {"trigger_name": _REVISION_GUARD_TRIGGER},
    ).scalar_one()
    if not trigger_exists:
        raise RuntimeError("0044 expected the electrical revision immutability trigger")


def _execute(bind: sa.engine.Connection, statement: str) -> int:
    result = bind.execute(sa.text(statement))
    return int(result.rowcount or 0)


def upgrade() -> None:
    bind = op.get_bind()
    _verify_project_object_foreign_keys(bind)
    _verify_revision_guard_trigger(bind)

    op.execute(
        """
        LOCK TABLE
            project_objects,
            electrical_variant_objects,
            electrical_calculations,
            electrical_calculation_revisions,
            electrical_candidates,
            electrical_candidate_folders,
            electrical_candidate_folder_items,
            specifications,
            specification_catalog_selections
        IN SHARE ROW EXCLUSIVE MODE
        """
    )
    op.execute(
        """
        CREATE TEMPORARY TABLE tlt_0044_removed_tank_ids
        ON COMMIT DROP
        AS
        SELECT id, project_id
        FROM project_objects
        WHERE object_type = 'tank'
          AND params ->> 'shape' = 'spherical'
        ORDER BY id
        """
    )
    target_count = int(
        bind.execute(sa.text("SELECT count(*) FROM tlt_0044_removed_tank_ids")).scalar_one()
    )
    op.execute(
        """
        CREATE TEMPORARY TABLE tlt_0044_affected_variants
        ON COMMIT DROP
        AS
        SELECT
            assignment.project_id,
            assignment.electrical_variant_id,
            to_jsonb(array_agg(assignment.object_id ORDER BY assignment.object_id::text))
                AS object_ids
        FROM electrical_variant_objects AS assignment
        JOIN tlt_0044_removed_tank_ids AS target
          ON target.id = assignment.object_id
         AND target.project_id = assignment.project_id
        WHERE assignment.assignment_state <> 'unassigned'
           OR EXISTS (
                SELECT 1
                FROM electrical_calculations AS calculation
                WHERE calculation.project_id = assignment.project_id
                  AND calculation.electrical_variant_id = assignment.electrical_variant_id
                  AND calculation.object_id = assignment.object_id
           )
           OR EXISTS (
                SELECT 1
                FROM electrical_candidates AS candidate
                WHERE candidate.project_id = assignment.project_id
                  AND candidate.electrical_variant_id = assignment.electrical_variant_id
                  AND candidate.object_id = assignment.object_id
           )
           OR EXISTS (
                SELECT 1
                FROM electrical_candidate_folders AS folder
                WHERE folder.project_id = assignment.project_id
                  AND folder.electrical_variant_id = assignment.electrical_variant_id
                  AND folder.object_id = assignment.object_id
           )
           OR EXISTS (
                SELECT 1
                FROM specifications AS specification
                WHERE specification.project_id = assignment.project_id
                  AND specification.electrical_variant_id = assignment.electrical_variant_id
                  AND specification.items @> jsonb_build_array(
                      jsonb_build_object('object_id', assignment.object_id::text)
                  )
           )
        GROUP BY assignment.project_id, assignment.electrical_variant_id
        """
    )

    _execute(
        bind,
        """
        DELETE FROM specification_catalog_selections AS selection
        USING tlt_0044_affected_variants AS affected
        WHERE selection.project_id = affected.project_id
          AND selection.electrical_variant_id = affected.electrical_variant_id
        """,
    )
    _execute(
        bind,
        """
        UPDATE specifications AS specification
        SET
            items = '[]'::jsonb,
            snapshot = NULL,
            is_stale = TRUE,
            stale_reason = 'object_deleted',
            stale_at = now(),
            stale_details = jsonb_build_object(
                'reason', 'object_deleted',
                'operation', 'migration',
                'migration_revision', '0044',
                'object_ids', affected.object_ids
            ),
            generation_status = NULL,
            generation_diagnostics = '[]'::jsonb,
            generation_candidate_groups = '[]'::jsonb,
            generation_at = NULL,
            updated_at = now()
        FROM tlt_0044_affected_variants AS affected
        WHERE specification.project_id = affected.project_id
          AND specification.electrical_variant_id = affected.electrical_variant_id
        """,
    )

    op.execute(f"DROP TRIGGER {_REVISION_GUARD_TRIGGER} ON electrical_calculation_revisions")
    _execute(
        bind,
        """
        DELETE FROM electrical_calculation_revisions
        WHERE object_id IN (SELECT id FROM tlt_0044_removed_tank_ids)
        """,
    )
    op.execute(
        f"""
        CREATE TRIGGER {_REVISION_GUARD_TRIGGER}
        BEFORE UPDATE OR DELETE ON electrical_calculation_revisions
        FOR EACH ROW EXECUTE FUNCTION tlt_0035_guard_electrical_calculation_revisions()
        """
    )

    _execute(
        bind,
        """
        DELETE FROM electrical_candidate_folder_items AS item
        WHERE item.folder_id IN (
            SELECT folder.id
            FROM electrical_candidate_folders AS folder
            JOIN tlt_0044_removed_tank_ids AS target ON target.id = folder.object_id
        )
           OR item.candidate_id IN (
            SELECT candidate.id
            FROM electrical_candidates AS candidate
            JOIN tlt_0044_removed_tank_ids AS target ON target.id = candidate.object_id
        )
        """,
    )
    _execute(
        bind,
        """
        DELETE FROM electrical_candidates
        WHERE object_id IN (SELECT id FROM tlt_0044_removed_tank_ids)
        """,
    )
    _execute(
        bind,
        """
        DELETE FROM electrical_candidate_folders
        WHERE object_id IN (SELECT id FROM tlt_0044_removed_tank_ids)
        """,
    )
    _execute(
        bind,
        """
        DELETE FROM electrical_calculations
        WHERE object_id IN (SELECT id FROM tlt_0044_removed_tank_ids)
        """,
    )
    _execute(
        bind,
        """
        DELETE FROM electrical_variant_objects
        WHERE object_id IN (SELECT id FROM tlt_0044_removed_tank_ids)
        """,
    )
    deleted_count = _execute(
        bind,
        """
        DELETE FROM project_objects AS object_row
        USING tlt_0044_removed_tank_ids AS target
        WHERE object_row.id = target.id
          AND object_row.project_id = target.project_id
          AND object_row.object_type = 'tank'
          AND object_row.params ->> 'shape' = 'spherical'
        """,
    )
    if deleted_count != target_count:
        raise RuntimeError(
            "0044 deleted an unexpected number of spherical tank objects: "
            f"selected={target_count}, deleted={deleted_count}"
        )
    _LOGGER.info("0044 removed %d spherical tank project object(s)", deleted_count)


def downgrade() -> None:
    _LOGGER.warning(
        "0044 downgrade cannot restore removed spherical tank data; no data changes applied"
    )
