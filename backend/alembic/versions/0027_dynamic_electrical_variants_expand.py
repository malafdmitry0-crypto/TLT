"""Expand legacy electrical slots into named dynamic variants.

This is the additive half of an expand/contract rollout. Legacy
``variant_number`` columns and their constraints intentionally remain in place;
the new UUID columns are nullable until dual-read/dual-write has been deployed.

Revision ID: 0027
Revises: 0026
Create Date: 2026-07-18
"""

from __future__ import annotations

import uuid
from typing import Any

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | None = None
depends_on: str | None = None

_LEGACY_TABLES = (
    "electrical_calculations",
    "electrical_candidates",
    "electrical_candidate_folders",
    "specifications",
)


def _is_successful_legacy_result(
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> bool:
    """Migration-local mirror of the persisted-result success contract."""
    if not results:
        return False
    if results.get("error_code") or results.get("category") or results.get("stale") is True:
        return False
    snapshot = results.get("cable_snapshot")
    snapshot_mark = snapshot.get("cable_mark") if isinstance(snapshot, dict) else None
    return bool(
        cable_mark or results.get("cable_mark") or results.get("selected_cable") or snapshot_mark
    )


def _legacy_assignment_projection(
    cable_type: str | None,
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> tuple[str | None, str]:
    """Return ``(system_type, assignment_state)`` for legacy backfill tests."""
    if cable_type in {"skin", "mineral"}:
        return cable_type, "unsupported"

    result = results or {}
    if result.get("category") == "stale" or result.get("stale") is True:
        return None, "stale"
    if result.get("category") == "unsupported":
        return None, "unsupported"
    if result.get("error_code") or result.get("category"):
        return None, "error"
    if not _is_successful_legacy_result(cable_mark, results):
        return None, "unassigned"
    if cable_type in {"self_regulating", "self_regulating_tt"}:
        return "self_regulating", "ready"
    if cable_type in {"single_core", "three_core"}:
        return "resistive", "ready"
    return None, "unassigned"


def _legacy_success_sql(calculation_alias: str = "c") -> str:
    alias = calculation_alias
    return f"""(
        {alias}.results IS NOT NULL
        AND COALESCE({alias}.results ->> 'error_code', '') = ''
        AND COALESCE({alias}.results ->> 'category', '') = ''
        AND {alias}.results -> 'stale' IS DISTINCT FROM 'true'::jsonb
        AND COALESCE(
            NULLIF({alias}.cable_mark, ''),
            NULLIF({alias}.results ->> 'cable_mark', ''),
            NULLIF({alias}.results ->> 'selected_cable', ''),
            NULLIF({alias}.results -> 'cable_snapshot' ->> 'cable_mark', '')
        ) IS NOT NULL
    )"""


def _system_type_sql(calculation_alias: str = "c") -> str:
    alias = calculation_alias
    success = _legacy_success_sql(alias)
    return f"""CASE
        WHEN {alias}.cable_type = 'skin' THEN 'skin'
        WHEN {alias}.cable_type = 'mineral' THEN 'mineral'
        WHEN {success}
             AND {alias}.cable_type IN ('self_regulating', 'self_regulating_tt')
            THEN 'self_regulating'
        WHEN {success}
             AND {alias}.cable_type IN ('single_core', 'three_core')
            THEN 'resistive'
        ELSE NULL
    END"""


def _assignment_state_sql(calculation_alias: str = "c") -> str:
    alias = calculation_alias
    success = _legacy_success_sql(alias)
    return f"""CASE
        WHEN {alias}.cable_type IN ('skin', 'mineral') THEN 'unsupported'
        WHEN {alias}.results ->> 'category' = 'stale'
             OR {alias}.results -> 'stale' = 'true'::jsonb
            THEN 'stale'
        WHEN {alias}.results ->> 'category' = 'unsupported' THEN 'unsupported'
        WHEN COALESCE({alias}.results ->> 'error_code', '') <> ''
             OR COALESCE({alias}.results ->> 'category', '') <> ''
            THEN 'error'
        WHEN {success}
             AND {alias}.cable_type IN (
                 'self_regulating', 'self_regulating_tt', 'single_core', 'three_core'
             )
            THEN 'ready'
        ELSE 'unassigned'
    END"""


def _diagnostics_sql(calculation_alias: str = "c", variant_alias: str = "v") -> str:
    alias = calculation_alias
    variant = variant_alias
    success = _legacy_success_sql(alias)
    return f"""jsonb_strip_nulls(jsonb_build_object(
        'migration_revision', '0027',
        'legacy_variant_number', {variant}.legacy_variant_number,
        'legacy_calculation_id', {alias}.id::text,
        'legacy_cable_type', {alias}.cable_type,
        'legacy_result_category', {alias}.results ->> 'category',
        'legacy_error_code', {alias}.results ->> 'error_code',
        'legacy_stale', {alias}.results -> 'stale',
        'legacy_success', {success},
        'sections_status', 'not_ready',
        'sections_error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
    ))"""


def _occupied_variants_sql() -> str:
    legacy_rows = "\nUNION\n".join(
        f"SELECT project_id, variant_number FROM {table}" for table in _LEGACY_TABLES
    )
    return f"""{legacy_rows}
UNION
SELECT
    project_id,
    (request_payload ->> 'variant_number')::integer AS variant_number
FROM background_tasks
WHERE type IN ('electrical_batch', 'report_export')
  AND project_id IS NOT NULL
  AND (
        request_payload ->> 'payload_version' IS NULL
        OR request_payload ->> 'payload_version' = '2'
      )
  AND (request_payload ->> 'variant_number') ~ '^[1-4]$'"""


def _scalar(bind: sa.engine.Connection, sql: str) -> int:
    value = bind.execute(sa.text(sql)).scalar_one()
    return int(value or 0)


def _assert_zero(bind: sa.engine.Connection, sql: str, message: str) -> None:
    count = _scalar(bind, sql)
    if count:
        raise RuntimeError(f"0027 dynamic ER migration refused: {message} ({count} rows)")


def _preflight(bind: sa.engine.Connection) -> dict[str, int]:
    for table in _LEGACY_TABLES:
        _assert_zero(
            bind,
            f"""
            SELECT count(*)
            FROM {table}
            WHERE variant_number < 1 OR variant_number > 4
            """,
            f"{table}.variant_number is outside 1..4",
        )

    for table in (
        "electrical_calculations",
        "electrical_candidates",
        "electrical_candidate_folders",
    ):
        _assert_zero(
            bind,
            f"""
            SELECT count(*)
            FROM {table} AS legacy_row
            JOIN project_objects AS object_row ON object_row.id = legacy_row.object_id
            WHERE object_row.project_id <> legacy_row.project_id
            """,
            f"{table} contains a cross-project object reference",
        )

    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM electrical_candidate_folder_items AS item
        JOIN electrical_candidate_folders AS folder ON folder.id = item.folder_id
        JOIN electrical_candidates AS candidate ON candidate.id = item.candidate_id
        WHERE folder.project_id <> candidate.project_id
           OR folder.object_id <> candidate.object_id
           OR folder.variant_number <> candidate.variant_number
        """,
        "candidate folder items cross project/object/legacy-variant scope",
    )

    return {table: _scalar(bind, f"SELECT count(*) FROM {table}") for table in _LEGACY_TABLES}


def _create_schema() -> None:
    op.add_column(
        "projects",
        sa.Column("electrical_initialized_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_unique_constraint(
        "uq_project_objects_id_project",
        "project_objects",
        ["id", "project_id"],
    )

    op.create_table(
        "electrical_variants",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("name_normalized", sa.String(length=512), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("copied_from_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("legacy_variant_number", sa.Integer(), nullable=True),
        sa.Column(
            "creation_idempotency_key_hash",
            sa.String(length=64),
            nullable=True,
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
            "name = btrim(name) AND char_length(name) > 0",
            name="ck_electrical_variants_name_trimmed_nonempty",
        ),
        sa.CheckConstraint(
            "name_normalized = btrim(name_normalized) " "AND char_length(name_normalized) > 0",
            name="ck_electrical_variants_normalized_name_nonempty",
        ),
        sa.CheckConstraint(
            "sort_order >= 0",
            name="ck_electrical_variants_sort_order_nonnegative",
        ),
        sa.CheckConstraint(
            "legacy_variant_number IS NULL "
            "OR (legacy_variant_number >= 1 AND legacy_variant_number <= 4)",
            name="ck_electrical_variants_legacy_number",
        ),
        sa.CheckConstraint(
            "creation_idempotency_key_hash IS NULL OR "
            "creation_idempotency_key_hash ~ '^[0-9a-f]{64}$'",
            name="ck_electrical_variants_creation_idempotency_hash",
        ),
        sa.ForeignKeyConstraint(
            ["copied_from_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_electrical_variants_copied_from_project",
            deferrable=True,
            initially="DEFERRED",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_electrical_variants_project",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "id",
            "project_id",
            name="uq_electrical_variants_id_project",
        ),
        sa.UniqueConstraint(
            "id",
            "project_id",
            "legacy_variant_number",
            name="uq_electrical_variants_id_project_legacy",
        ),
        sa.UniqueConstraint(
            "project_id",
            "sort_order",
            name="uq_electrical_variants_project_sort_order",
        ),
        sa.UniqueConstraint(
            "project_id",
            "legacy_variant_number",
            name="uq_electrical_variants_project_legacy_number",
        ),
        sa.UniqueConstraint(
            "project_id",
            "name_normalized",
            name="ux_electrical_variants_project_normalized_name",
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
        sa.Column("system_type", sa.String(length=32), nullable=True),
        sa.Column(
            "assignment_state",
            sa.String(length=32),
            server_default=sa.text("'unassigned'"),
            nullable=False,
        ),
        sa.Column("requested_cable_type", sa.String(length=64), nullable=True),
        sa.Column(
            "object_version_snapshot",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column(
            "diagnostics",
            postgresql.JSONB(),
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
            "system_type IS NULL OR system_type IN "
            "('self_regulating', 'resistive', 'skin', 'mineral')",
            name="ck_electrical_variant_objects_system_type",
        ),
        sa.CheckConstraint(
            "assignment_state IN ('unassigned', 'ready', 'unsupported', 'stale', 'error')",
            name="ck_electrical_variant_objects_assignment_state",
        ),
        sa.CheckConstraint(
            "object_version_snapshot >= 1",
            name="ck_electrical_variant_objects_version_positive",
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

    for table, constraint_name in (
        (
            "electrical_calculations",
            "fk_electrical_calculations_variant_project_legacy",
        ),
        (
            "electrical_candidates",
            "fk_electrical_candidates_variant_project_legacy",
        ),
        (
            "electrical_candidate_folders",
            "fk_electrical_candidate_folders_variant_project_legacy",
        ),
        ("specifications", "fk_specifications_variant_project_legacy"),
    ):
        op.add_column(
            table,
            sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            constraint_name,
            table,
            "electrical_variants",
            ["electrical_variant_id", "project_id", "variant_number"],
            ["id", "project_id", "legacy_variant_number"],
            ondelete="CASCADE",
        )


def _backfill_variants(bind: sa.engine.Connection) -> None:
    rows = bind.execute(
        sa.text(
            f"""
            WITH desired AS (
                SELECT id AS project_id, 1 AS variant_number
                FROM projects
                UNION
                {_occupied_variants_sql()}
            )
            SELECT project_id, variant_number
            FROM desired
            ORDER BY project_id, variant_number
            """
        )
    ).mappings()

    values: list[dict[str, Any]] = []
    current_project: Any = None
    sort_order = 0
    for row in rows:
        project_id = row["project_id"]
        if project_id != current_project:
            current_project = project_id
            sort_order = 0
        else:
            sort_order += 1
        variant_number = int(row["variant_number"])
        values.append(
            {
                "id": uuid.uuid4(),
                "project_id": project_id,
                "name": f"ЭР{variant_number}",
                "name_normalized": f"ЭР{variant_number}".casefold(),
                "sort_order": sort_order,
                "is_active": sort_order == 0,
                "legacy_variant_number": variant_number,
            }
        )

    if values:
        bind.execute(
            sa.text(
                """
                INSERT INTO electrical_variants (
                    id,
                    project_id,
                    name,
                    name_normalized,
                    sort_order,
                    is_active,
                    legacy_variant_number
                ) VALUES (
                    :id,
                    :project_id,
                    :name,
                    :name_normalized,
                    :sort_order,
                    :is_active,
                    :legacy_variant_number
                )
                """
            ),
            values,
        )

    bind.execute(
        sa.text(
            """
            UPDATE projects
            SET electrical_initialized_at = COALESCE(electrical_initialized_at, now())
            """
        )
    )


def _backfill_dependents(bind: sa.engine.Connection) -> None:
    for table in _LEGACY_TABLES:
        bind.execute(
            sa.text(
                f"""
                UPDATE {table} AS legacy_row
                SET electrical_variant_id = variant.id
                FROM electrical_variants AS variant
                WHERE variant.project_id = legacy_row.project_id
                  AND variant.legacy_variant_number = legacy_row.variant_number
                """
            )
        )

    bind.execute(
        sa.text(
            f"""
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
                    variant.id::text || ':' || object_row.id::text || '-' || '0027'
                )::uuid,
                variant.project_id,
                variant.id,
                object_row.id,
                {_system_type_sql('calculation')},
                {_assignment_state_sql('calculation')},
                calculation.cable_type,
                object_row.version,
                {_diagnostics_sql('calculation', 'variant')}
            FROM electrical_variants AS variant
            JOIN project_objects AS object_row
              ON object_row.project_id = variant.project_id
            LEFT JOIN electrical_calculations AS calculation
              ON calculation.object_id = object_row.id
             AND calculation.variant_number = variant.legacy_variant_number
            """
        )
    )

    bind.execute(
        sa.text(
            """
            WITH previous AS (
                SELECT
                    id,
                    jsonb_build_object(
                        'is_stale', is_stale,
                        'stale_reason', stale_reason,
                        'stale_at', stale_at,
                        'stale_details', stale_details,
                        'stale_details_is_sql_null', stale_details IS NULL
                    ) AS stale_state
                FROM specifications
            )
            UPDATE specifications AS specification
            SET
                is_stale = true,
                stale_reason = 'electrical_sections_not_ready',
                stale_at = now(),
                stale_details = jsonb_build_object(
                    '_0027_previous_stale', previous.stale_state,
                    '_0027_previous_stale_md5', md5(previous.stale_state::text),
                    'migration_revision', '0027',
                    'migration_stale_at', to_jsonb(now()),
                    'sections_status', 'not_ready',
                    'error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
                )
            FROM previous
            WHERE previous.id = specification.id
            """
        )
    )


def _create_sync_triggers(bind: sa.engine.Connection) -> None:
    """Keep legacy writers and newly inserted objects on the UUID graph."""
    bind.execute(
        sa.text(
            """
            CREATE FUNCTION tlt_0027_sync_legacy_electrical_variant_id()
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
        )
    )

    for table in _LEGACY_TABLES:
        bind.execute(
            sa.text(
                f"""
                CREATE TRIGGER trg_0027_sync_electrical_variant_id
                BEFORE INSERT OR UPDATE OF
                    project_id, variant_number, electrical_variant_id
                ON {table}
                FOR EACH ROW
                EXECUTE FUNCTION tlt_0027_sync_legacy_electrical_variant_id()
                """
            )
        )

    bind.execute(
        sa.text(
            """
            CREATE FUNCTION tlt_0027_sync_project_object_assignments()
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
        )
    )
    bind.execute(
        sa.text(
            """
            CREATE TRIGGER trg_0027_sync_project_object_assignments
            AFTER INSERT ON project_objects
            FOR EACH ROW
            EXECUTE FUNCTION tlt_0027_sync_project_object_assignments()
            """
        )
    )


def _drop_sync_triggers(bind: sa.engine.Connection) -> None:
    bind.execute(
        sa.text(
            """
            DROP TRIGGER IF EXISTS trg_0027_sync_project_object_assignments
            ON project_objects
            """
        )
    )
    bind.execute(sa.text("DROP FUNCTION IF EXISTS tlt_0027_sync_project_object_assignments()"))
    for table in _LEGACY_TABLES:
        bind.execute(
            sa.text(
                f"""
                DROP TRIGGER IF EXISTS trg_0027_sync_electrical_variant_id
                ON {table}
                """
            )
        )
    bind.execute(sa.text("DROP FUNCTION IF EXISTS tlt_0027_sync_legacy_electrical_variant_id()"))


def _create_assignment_scope_foreign_keys() -> None:
    for table, constraint_name in (
        (
            "electrical_calculations",
            "fk_electrical_calculations_variant_object_assignment",
        ),
        (
            "electrical_candidates",
            "fk_electrical_candidates_variant_object_assignment",
        ),
        (
            "electrical_candidate_folders",
            "fk_electrical_candidate_folders_variant_object_assignment",
        ),
    ):
        op.create_foreign_key(
            constraint_name,
            table,
            "electrical_variant_objects",
            ["electrical_variant_id", "object_id"],
            ["electrical_variant_id", "object_id"],
            ondelete="CASCADE",
        )


def _create_downstream_indexes() -> None:
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
        "ix_electrical_candidates_project_object_electrical_variant",
        "electrical_candidates",
        ["project_id", "object_id", "electrical_variant_id"],
    )
    op.create_index(
        "ux_electrical_candidates_applied_object_electrical_variant",
        "electrical_candidates",
        ["object_id", "electrical_variant_id"],
        unique=True,
        postgresql_where=sa.text("is_applied AND electrical_variant_id IS NOT NULL"),
    )
    op.create_index(
        "ux_electrical_candidates_object_electrical_variant_dedupe",
        "electrical_candidates",
        ["object_id", "electrical_variant_id", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )
    op.create_index(
        "ix_electrical_candidate_folders_electrical_scope",
        "electrical_candidate_folders",
        ["project_id", "object_id", "electrical_variant_id", "sort_order"],
    )
    op.create_index(
        "ux_electrical_candidate_folders_electrical_scope_name",
        "electrical_candidate_folders",
        ["project_id", "object_id", "electrical_variant_id", "name"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )
    op.create_index(
        "ux_specifications_project_electrical_variant",
        "specifications",
        ["project_id", "electrical_variant_id"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )


def _validate_backfill(bind: sa.engine.Connection, preserved_counts: dict[str, int]) -> None:
    for table, before_count in preserved_counts.items():
        after_count = _scalar(bind, f"SELECT count(*) FROM {table}")
        if after_count != before_count:
            raise RuntimeError(
                "0027 dynamic ER migration lost or duplicated "
                f"{table} rows: before={before_count}, after={after_count}"
            )
        _assert_zero(
            bind,
            f"SELECT count(*) FROM {table} WHERE electrical_variant_id IS NULL",
            f"{table} UUID backfill is incomplete",
        )
        _assert_zero(
            bind,
            f"""
            SELECT count(*)
            FROM {table} AS legacy_row
            JOIN electrical_variants AS variant
              ON variant.id = legacy_row.electrical_variant_id
            WHERE variant.project_id <> legacy_row.project_id
               OR variant.legacy_variant_number IS DISTINCT FROM legacy_row.variant_number
            """,
            f"{table} UUID mapping does not match project/legacy variant",
        )

    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM (
            SELECT project_id
            FROM electrical_variants
            GROUP BY project_id
            HAVING count(*) > 5
               OR count(*) FILTER (WHERE is_active) <> 1
        ) AS invalid_project
        """,
        "a project has too many variants or not exactly one active variant",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM projects AS project_row
        LEFT JOIN electrical_variants AS variant ON variant.project_id = project_row.id
        WHERE project_row.electrical_initialized_at IS NULL
           OR variant.id IS NULL
        """,
        "an existing project was not initialized with at least ЭР1",
    )

    expected_assignments = _scalar(
        bind,
        """
        SELECT count(*)
        FROM electrical_variants AS variant
        JOIN project_objects AS object_row ON object_row.project_id = variant.project_id
        """,
    )
    actual_assignments = _scalar(bind, "SELECT count(*) FROM electrical_variant_objects")
    if actual_assignments != expected_assignments:
        raise RuntimeError(
            "0027 dynamic ER migration produced an incomplete assignment graph: "
            f"expected={expected_assignments}, actual={actual_assignments}"
        )


def upgrade() -> None:
    bind = op.get_bind()
    preserved_counts = _preflight(bind)
    _create_schema()
    _backfill_variants(bind)
    _backfill_dependents(bind)
    _create_assignment_scope_foreign_keys()
    _create_downstream_indexes()
    _create_sync_triggers(bind)
    _validate_backfill(bind, preserved_counts)


def _assert_lossless_downgrade(bind: sa.engine.Connection) -> None:
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM (
            SELECT
                variant.*,
                row_number() OVER (
                    PARTITION BY project_id ORDER BY legacy_variant_number
                ) - 1 AS expected_sort_order,
                min(legacy_variant_number) OVER (PARTITION BY project_id) AS first_number
            FROM electrical_variants AS variant
        ) AS ranked
        WHERE legacy_variant_number IS NULL
           OR name IS DISTINCT FROM ('ЭР' || legacy_variant_number::text)
           OR name_normalized IS DISTINCT FROM lower('ЭР' || legacy_variant_number::text)
           OR copied_from_id IS NOT NULL
           OR creation_idempotency_key_hash IS NOT NULL
           OR sort_order <> expected_sort_order
           OR is_active IS DISTINCT FROM (legacy_variant_number = first_number)
           OR updated_at IS DISTINCT FROM created_at
        """,
        "dynamic variant names/order/active/copy state cannot be represented by legacy slots",
    )

    _assert_zero(
        bind,
        f"""
        WITH occupied AS (
            {_occupied_variants_sql()}
        ),
        desired AS (
            SELECT id AS project_id, 1 AS variant_number
            FROM projects
            WHERE electrical_initialized_at IS NOT NULL
            UNION
            SELECT project_id, variant_number FROM occupied
        ),
        actual AS (
            SELECT project_id, legacy_variant_number AS variant_number
            FROM electrical_variants
        ),
        difference AS (
            (SELECT * FROM desired EXCEPT SELECT * FROM actual)
            UNION ALL
            (SELECT * FROM actual EXCEPT SELECT * FROM desired)
        )
        SELECT count(*) FROM difference
        """,
        "dynamic variant graph is not a lossless projection of legacy slots",
    )

    for table in _LEGACY_TABLES:
        _assert_zero(
            bind,
            f"""
            SELECT count(*)
            FROM {table} AS legacy_row
            LEFT JOIN electrical_variants AS variant
              ON variant.id = legacy_row.electrical_variant_id
            WHERE legacy_row.electrical_variant_id IS NULL
               OR variant.project_id IS DISTINCT FROM legacy_row.project_id
               OR variant.legacy_variant_number IS DISTINCT FROM legacy_row.variant_number
            """,
            f"{table} contains UUID state that cannot be restored to a legacy slot",
        )

    _assert_zero(
        bind,
        f"""
        WITH expected AS (
            SELECT
                variant.id AS electrical_variant_id,
                object_row.id AS object_id,
                variant.project_id,
                {_system_type_sql('calculation')} AS system_type,
                {_assignment_state_sql('calculation')} AS assignment_state,
                calculation.cable_type AS requested_cable_type,
                object_row.version AS object_version_snapshot,
                {_diagnostics_sql('calculation', 'variant')} AS diagnostics
            FROM electrical_variants AS variant
            JOIN project_objects AS object_row
              ON object_row.project_id = variant.project_id
            LEFT JOIN electrical_calculations AS calculation
              ON calculation.object_id = object_row.id
             AND calculation.variant_number = variant.legacy_variant_number
        ),
        compared AS (
            SELECT
                assignment.id AS assignment_id,
                expected.electrical_variant_id AS expected_variant_id,
                assignment.project_id AS assignment_project_id,
                expected.project_id AS expected_project_id,
                assignment.system_type AS assignment_system_type,
                expected.system_type AS expected_system_type,
                assignment.assignment_state AS actual_state,
                expected.assignment_state AS expected_state,
                assignment.requested_cable_type AS actual_requested_type,
                expected.requested_cable_type AS expected_requested_type,
                assignment.object_version_snapshot AS actual_version,
                expected.object_version_snapshot AS expected_version,
                assignment.diagnostics AS actual_diagnostics,
                expected.diagnostics AS expected_diagnostics,
                assignment.created_at,
                assignment.updated_at
            FROM electrical_variant_objects AS assignment
            FULL OUTER JOIN expected
              ON expected.electrical_variant_id = assignment.electrical_variant_id
             AND expected.object_id = assignment.object_id
        )
        SELECT count(*)
        FROM compared
        WHERE assignment_id IS NULL
           OR expected_variant_id IS NULL
           OR assignment_project_id IS DISTINCT FROM expected_project_id
           OR assignment_system_type IS DISTINCT FROM expected_system_type
           OR actual_state IS DISTINCT FROM expected_state
           OR actual_requested_type IS DISTINCT FROM expected_requested_type
           OR actual_version IS DISTINCT FROM expected_version
           OR actual_diagnostics IS DISTINCT FROM expected_diagnostics
           OR updated_at IS DISTINCT FROM created_at
        """,
        "assignment state changed after expand and would be lost on downgrade",
    )

    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM specifications
        WHERE stale_reason = 'electrical_sections_not_ready'
          AND NOT COALESCE(stale_details ? '_0027_previous_stale', false)
        """,
        "a migration-staled specification lost its restoration marker",
    )

    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM specifications
        WHERE stale_details ? '_0027_previous_stale'
          AND (
              is_stale IS DISTINCT FROM true
              OR stale_reason IS DISTINCT FROM 'electrical_sections_not_ready'
              OR to_jsonb(stale_at) IS DISTINCT FROM
                 stale_details -> 'migration_stale_at'
              OR stale_details ->> 'migration_revision' IS DISTINCT FROM '0027'
              OR stale_details ->> 'sections_status' IS DISTINCT FROM 'not_ready'
              OR stale_details ->> 'error_code' IS DISTINCT FROM
                 'ELECTRICAL_SECTIONS_NOT_READY'
              OR stale_details ->> '_0027_previous_stale_md5' IS DISTINCT FROM
                 md5((stale_details -> '_0027_previous_stale')::text)
              OR stale_details IS DISTINCT FROM jsonb_build_object(
                    '_0027_previous_stale',
                    stale_details -> '_0027_previous_stale',
                    '_0027_previous_stale_md5',
                    stale_details -> '_0027_previous_stale_md5',
                    'migration_revision', '0027',
                    'migration_stale_at',
                    stale_details -> 'migration_stale_at',
                    'sections_status', 'not_ready',
                    'error_code', 'ELECTRICAL_SECTIONS_NOT_READY'
                 )
          )
        """,
        "a migration-staled specification changed and cannot be restored safely",
    )


def _restore_specification_stale_state(bind: sa.engine.Connection) -> None:
    bind.execute(
        sa.text(
            """
            UPDATE specifications
            SET
                is_stale = COALESCE(
                    (stale_details #>> '{_0027_previous_stale,is_stale}')::boolean,
                    false
                ),
                stale_reason = stale_details #>> '{_0027_previous_stale,stale_reason}',
                stale_at = (
                    stale_details #>> '{_0027_previous_stale,stale_at}'
                )::timestamptz,
                stale_details = CASE
                    WHEN COALESCE(
                        (
                            stale_details #>>
                            '{_0027_previous_stale,stale_details_is_sql_null}'
                        )::boolean,
                        false
                    )
                    THEN NULL
                    ELSE stale_details #>
                         '{_0027_previous_stale,stale_details}'
                END
            WHERE stale_details ? '_0027_previous_stale'
            """
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    _assert_lossless_downgrade(bind)
    _restore_specification_stale_state(bind)
    _drop_sync_triggers(bind)

    op.drop_index(
        "ux_specifications_project_electrical_variant",
        table_name="specifications",
    )
    op.drop_constraint(
        "fk_specifications_variant_project_legacy",
        "specifications",
        type_="foreignkey",
    )
    op.drop_column("specifications", "electrical_variant_id")

    op.drop_index(
        "ux_electrical_candidate_folders_electrical_scope_name",
        table_name="electrical_candidate_folders",
    )
    op.drop_index(
        "ix_electrical_candidate_folders_electrical_scope",
        table_name="electrical_candidate_folders",
    )
    op.drop_constraint(
        "fk_electrical_candidate_folders_variant_object_assignment",
        "electrical_candidate_folders",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_electrical_candidate_folders_variant_project_legacy",
        "electrical_candidate_folders",
        type_="foreignkey",
    )
    op.drop_column("electrical_candidate_folders", "electrical_variant_id")

    op.drop_index(
        "ux_electrical_candidates_object_electrical_variant_dedupe",
        table_name="electrical_candidates",
    )
    op.drop_index(
        "ux_electrical_candidates_applied_object_electrical_variant",
        table_name="electrical_candidates",
    )
    op.drop_index(
        "ix_electrical_candidates_project_object_electrical_variant",
        table_name="electrical_candidates",
    )
    op.drop_constraint(
        "fk_electrical_candidates_variant_object_assignment",
        "electrical_candidates",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_electrical_candidates_variant_project_legacy",
        "electrical_candidates",
        type_="foreignkey",
    )
    op.drop_column("electrical_candidates", "electrical_variant_id")

    op.drop_index(
        "ux_electrical_calculations_object_electrical_variant",
        table_name="electrical_calculations",
    )
    op.drop_index(
        "ix_electrical_calculations_project_electrical_variant",
        table_name="electrical_calculations",
    )
    op.drop_constraint(
        "fk_electrical_calculations_variant_object_assignment",
        "electrical_calculations",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_electrical_calculations_variant_project_legacy",
        "electrical_calculations",
        type_="foreignkey",
    )
    op.drop_column("electrical_calculations", "electrical_variant_id")

    op.drop_index(
        "ix_electrical_variant_objects_variant_state",
        table_name="electrical_variant_objects",
    )
    op.drop_index(
        "ix_electrical_variant_objects_project_object",
        table_name="electrical_variant_objects",
    )
    op.drop_table("electrical_variant_objects")

    op.drop_index(
        "ux_electrical_variants_project_active",
        table_name="electrical_variants",
    )
    op.drop_table("electrical_variants")
    op.drop_constraint(
        "uq_project_objects_id_project",
        "project_objects",
        type_="unique",
    )
    op.drop_column("projects", "electrical_initialized_at")
