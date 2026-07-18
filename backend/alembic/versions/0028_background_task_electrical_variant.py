"""Trace background electrical/report tasks by dynamic ER UUID.

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-18
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | None = None
depends_on: str | None = None


def _background_task_count(bind: sa.engine.Connection) -> int:
    return int(bind.execute(sa.text("SELECT count(*) FROM background_tasks")).scalar_one())


def _scalar(bind: sa.engine.Connection, sql: str) -> int:
    return int(bind.execute(sa.text(sql)).scalar_one() or 0)


def _assert_zero(bind: sa.engine.Connection, sql: str, message: str) -> None:
    count = _scalar(bind, sql)
    if count:
        raise RuntimeError(f"0028 background task ER migration refused: {message} ({count} rows)")


def _backfill_tasks(bind: sa.engine.Connection) -> None:
    """Map every supported task trace to the project-scoped 0027 ER UUID."""
    before_count = _background_task_count(bind)
    bind.execute(
        sa.text(
            """
            UPDATE background_tasks AS task
            SET electrical_variant_id = variant.id
            FROM electrical_variants AS variant
            WHERE task.electrical_variant_id IS NULL
              AND task.type IN ('electrical_batch', 'report_export')
              AND task.project_id = variant.project_id
              AND (
                    task.request_payload ->> 'payload_version' IS NULL
                    OR task.request_payload ->> 'payload_version' = '2'
                  )
              AND (task.request_payload ->> 'variant_number') ~ '^[1-4]$'
              AND variant.legacy_variant_number =
                  (task.request_payload ->> 'variant_number')::integer
            """
        )
    )
    bind.execute(
        sa.text(
            """
            UPDATE background_tasks AS task
            SET electrical_variant_id = variant.id
            FROM electrical_variants AS variant
            WHERE task.electrical_variant_id IS NULL
              AND task.type IN ('electrical_batch', 'report_export')
              AND task.request_payload ->> 'payload_version' = '3'
              AND task.project_id = variant.project_id
              AND task.request_payload ->> 'project_id' = task.project_id::text
              AND lower(task.request_payload ->> 'electrical_variant_id') =
                  variant.id::text
            """
        )
    )
    after_count = _background_task_count(bind)
    if after_count != before_count:
        raise RuntimeError(
            "0028 background task ER backfill changed row count: "
            f"before={before_count}, after={after_count}"
        )

    legacy_task = """
        task.type IN ('electrical_batch', 'report_export')
        AND (
              task.request_payload ->> 'payload_version' IS NULL
              OR task.request_payload ->> 'payload_version' = '2'
            )
    """
    _assert_zero(
        bind,
        f"""
        SELECT count(*)
        FROM background_tasks AS task
        LEFT JOIN electrical_variants AS variant
          ON variant.id = task.electrical_variant_id
        WHERE {legacy_task}
          AND (
                task.project_id IS NULL
                OR NOT (
                    (task.request_payload ->> 'variant_number') ~ '^[1-4]$'
                )
                OR variant.id IS NULL
                OR variant.project_id IS DISTINCT FROM task.project_id
                OR variant.legacy_variant_number IS DISTINCT FROM
                   CASE
                       WHEN (task.request_payload ->> 'variant_number') ~ '^[1-4]$'
                       THEN (task.request_payload ->> 'variant_number')::integer
                       ELSE NULL
                   END
              )
        """,
        "legacy electrical/report task trace has no exact project/slot UUID mapping",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks
        WHERE type NOT IN ('electrical_batch', 'report_export')
          AND electrical_variant_id IS NOT NULL
        """,
        "non-electrical/report tasks received an ER UUID",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks AS task
        LEFT JOIN electrical_variants AS variant
          ON variant.id = task.electrical_variant_id
        WHERE task.type IN ('electrical_batch', 'report_export')
          AND task.request_payload ->> 'payload_version' = '3'
          AND (
                task.project_id IS NULL
                OR task.electrical_variant_id IS NULL
                OR task.request_payload ->> 'project_id'
                    IS DISTINCT FROM task.project_id::text
                OR lower(task.request_payload ->> 'electrical_variant_id')
                    IS DISTINCT FROM task.electrical_variant_id::text
                OR variant.id IS NULL
                OR variant.project_id IS DISTINCT FROM task.project_id
              )
        """,
        "every v3 electrical/report task must trace an existing same-project UUID",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks
        WHERE type IN ('electrical_batch', 'report_export')
          AND electrical_variant_id IS NULL
        """,
        "every electrical/report task must have a non-NULL ER UUID trace",
    )


def upgrade() -> None:
    op.add_column(
        "background_tasks",
        sa.Column(
            "electrical_variant_id",
            postgresql.UUID(as_uuid=True),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_background_tasks_electrical_variant_id",
        "background_tasks",
        ["electrical_variant_id"],
        unique=False,
    )
    _backfill_tasks(op.get_bind())
    op.create_check_constraint(
        "ck_background_tasks_electrical_variant_trace",
        "background_tasks",
        """
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
        """,
    )


def _convert_lossless_v3_tasks(bind: sa.engine.Connection) -> None:
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks
        WHERE type IN ('electrical_batch', 'report_export')
          AND COALESCE(request_payload ->> 'payload_version', '2')
              NOT IN ('2', '3')
        """,
        "an electrical/report task payload version is not representable by v2",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks
        WHERE type IN ('electrical_batch', 'report_export')
          AND (
                request_payload ->> 'payload_version' IS NULL
                OR request_payload ->> 'payload_version' = '2'
              )
          AND NOT COALESCE(
              (request_payload ->> 'variant_number') ~ '^[1-4]$',
              false
          )
        """,
        "a legacy electrical/report task has no representable slot",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks AS task
        JOIN electrical_variants AS variant
          ON variant.id = task.electrical_variant_id
        WHERE task.type IN ('electrical_batch', 'report_export')
          AND (
                task.request_payload ->> 'payload_version' IS NULL
                OR task.request_payload ->> 'payload_version' = '2'
              )
          AND (
                variant.project_id IS DISTINCT FROM task.project_id
                OR variant.legacy_variant_number IS DISTINCT FROM
                   (task.request_payload ->> 'variant_number')::integer
              )
        """,
        "a legacy task UUID disagrees with its retained v2 project/slot trace",
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks AS task
        LEFT JOIN electrical_variants AS variant
          ON variant.id = task.electrical_variant_id
         AND variant.project_id = task.project_id
        WHERE task.type IN ('electrical_batch', 'report_export')
          AND task.request_payload ->> 'payload_version' = '3'
          AND (
                variant.id IS NULL
                OR variant.legacy_variant_number IS NULL
                OR variant.legacy_variant_number < 1
                OR variant.legacy_variant_number > 4
              )
        """,
        "a v3 task points to an ER that cannot be converted to a legacy slot",
    )

    bind.execute(
        sa.text(
            """
            UPDATE background_tasks AS task
            SET request_payload =
                (
                    task.request_payload
                    - 'electrical_variant_id'
                    - 'variant_number'
                    - 'payload_version'
                ) || jsonb_build_object(
                    'payload_version', 2,
                    'variant_number', variant.legacy_variant_number
                )
            FROM electrical_variants AS variant
            WHERE task.type IN ('electrical_batch', 'report_export')
              AND task.request_payload ->> 'payload_version' = '3'
              AND variant.id = task.electrical_variant_id
              AND variant.project_id = task.project_id
            """
        )
    )
    _assert_zero(
        bind,
        """
        SELECT count(*)
        FROM background_tasks
        WHERE type IN ('electrical_batch', 'report_export')
          AND request_payload ->> 'payload_version' = '3'
        """,
        "a v3 task remained after lossless v2 conversion",
    )


def downgrade() -> None:
    bind = op.get_bind()
    _convert_lossless_v3_tasks(bind)
    op.drop_constraint(
        "ck_background_tasks_electrical_variant_trace",
        "background_tasks",
        type_="check",
    )
    op.drop_index(
        "ix_background_tasks_electrical_variant_id",
        table_name="background_tasks",
    )
    op.drop_column("background_tasks", "electrical_variant_id")
