"""Contract project electrical variants and compatibility slots to four.

Revision ID: 0047
Revises: 0046
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0047"
down_revision: str | None = "0046"
branch_labels: str | None = None
depends_on: str | None = None

_BACKGROUND_TRACE_CONSTRAINT = "ck_background_tasks_electrical_variant_trace"
_STRICT_TRACE_CHECK_FOUR = """
type NOT IN ('electrical_batch', 'report_export')
OR (
    electrical_variant_id IS NOT NULL
    AND (
        request_payload ->> 'variant_number' IS NULL
        OR (request_payload ->> 'variant_number') ~ '^[1-4]$'
    )
    AND (
        request_payload ->> 'payload_version' IS DISTINCT FROM '3'
        OR (
            project_id IS NOT NULL
            AND request_payload ->> 'project_id' IS NOT NULL
            AND request_payload ->> 'project_id' = project_id::text
            AND request_payload ->> 'electrical_variant_id' IS NOT NULL
            AND lower(request_payload ->> 'electrical_variant_id') =
                electrical_variant_id::text
        )
    )
)
"""
_STRICT_TRACE_CHECK_0046 = """
type NOT IN ('electrical_batch', 'report_export')
OR (
    electrical_variant_id IS NOT NULL
    AND (
        request_payload ->> 'payload_version' IS DISTINCT FROM '3'
        OR (
            project_id IS NOT NULL
            AND request_payload ->> 'project_id' IS NOT NULL
            AND request_payload ->> 'project_id' = project_id::text
            AND request_payload ->> 'electrical_variant_id' IS NOT NULL
            AND lower(request_payload ->> 'electrical_variant_id') =
                electrical_variant_id::text
        )
    )
)
"""


def _count(bind: sa.engine.Connection, sql: str) -> int:
    return int(bind.execute(sa.text(sql)).scalar_one() or 0)


def _preflight(bind: sa.engine.Connection) -> None:
    checks = {
        "projects_over_limit": """
            SELECT count(*)
            FROM (
                SELECT project_id
                FROM electrical_variants
                GROUP BY project_id
                HAVING count(*) > 4
            ) AS invalid_project
        """,
        "electrical_variants": """
            SELECT count(*) FROM electrical_variants
            WHERE legacy_variant_number IS NOT NULL
              AND legacy_variant_number NOT BETWEEN 1 AND 4
        """,
        "electrical_calculations": """
            SELECT count(*) FROM electrical_calculations
            WHERE variant_number NOT BETWEEN 1 AND 4
        """,
        "electrical_candidates": """
            SELECT count(*) FROM electrical_candidates
            WHERE variant_number NOT BETWEEN 1 AND 4
        """,
        "electrical_candidate_folders": """
            SELECT count(*) FROM electrical_candidate_folders
            WHERE variant_number NOT BETWEEN 1 AND 4
        """,
        "electrical_calculation_revisions": """
            SELECT count(*) FROM electrical_calculation_revisions
            WHERE variant_number NOT BETWEEN 1 AND 4
        """,
        "background_tasks": """
            SELECT count(*) FROM background_tasks
            WHERE type IN ('electrical_batch', 'report_export')
              AND request_payload ->> 'variant_number' IS NOT NULL
              AND NOT ((request_payload ->> 'variant_number') ~ '^[1-4]$')
        """,
    }
    violations = {name: _count(bind, sql) for name, sql in checks.items()}
    violations = {name: count for name, count in violations.items() if count}
    if violations:
        details = ", ".join(f"{name}={count}" for name, count in violations.items())
        raise RuntimeError(
            "0047 electrical variant limit refused: rows outside the four-ER "
            f"product contract ({details})"
        )


def _swap_check(table: str, name: str, expression: str) -> None:
    op.drop_constraint(name, table, type_="check")
    op.create_check_constraint(name, table, expression)


def _create_limit_trigger() -> None:
    op.execute(
        """
        CREATE OR REPLACE FUNCTION tlt_0047_enforce_electrical_variant_limit()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $function$
        BEGIN
            PERFORM 1 FROM projects WHERE id = NEW.project_id FOR UPDATE;
            IF (
                SELECT count(*)
                FROM electrical_variants AS variant
                WHERE variant.project_id = NEW.project_id
                  AND variant.id IS DISTINCT FROM NEW.id
            ) >= 4 THEN
                RAISE EXCEPTION 'A project may contain no more than four electrical variants'
                    USING ERRCODE = '23514',
                          CONSTRAINT = 'ck_electrical_variants_project_limit';
            END IF;
            RETURN NEW;
        END
        $function$
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_0047_enforce_electrical_variant_limit
        BEFORE INSERT OR UPDATE OF project_id ON electrical_variants
        FOR EACH ROW
        EXECUTE FUNCTION tlt_0047_enforce_electrical_variant_limit()
        """
    )


def upgrade() -> None:
    _preflight(op.get_bind())
    _swap_check(
        "electrical_variants",
        "ck_electrical_variants_legacy_number",
        "legacy_variant_number IS NULL "
        "OR (legacy_variant_number >= 1 AND legacy_variant_number <= 4)",
    )
    for table, name in (
        ("electrical_calculations", "ck_electrical_calculations_variant_number"),
        ("electrical_candidates", "ck_electrical_candidates_variant_number"),
        ("electrical_candidate_folders", "ck_electrical_candidate_folders_variant_number"),
        (
            "electrical_calculation_revisions",
            "ck_electrical_calculation_revisions_variant_number",
        ),
    ):
        _swap_check(table, name, "variant_number >= 1 AND variant_number <= 4")
    _swap_check(
        "background_tasks",
        _BACKGROUND_TRACE_CONSTRAINT,
        _STRICT_TRACE_CHECK_FOUR,
    )
    _create_limit_trigger()


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_0047_enforce_electrical_variant_limit "
        "ON electrical_variants"
    )
    op.execute("DROP FUNCTION IF EXISTS tlt_0047_enforce_electrical_variant_limit()")
    _swap_check(
        "background_tasks",
        _BACKGROUND_TRACE_CONSTRAINT,
        _STRICT_TRACE_CHECK_0046,
    )
    for table, name in (
        ("electrical_calculations", "ck_electrical_calculations_variant_number"),
        ("electrical_candidates", "ck_electrical_candidates_variant_number"),
        ("electrical_candidate_folders", "ck_electrical_candidate_folders_variant_number"),
        (
            "electrical_calculation_revisions",
            "ck_electrical_calculation_revisions_variant_number",
        ),
    ):
        _swap_check(table, name, "variant_number >= 1 AND variant_number <= 5")
    _swap_check(
        "electrical_variants",
        "ck_electrical_variants_legacy_number",
        "legacy_variant_number IS NULL "
        "OR (legacy_variant_number >= 1 AND legacy_variant_number <= 5)",
    )
