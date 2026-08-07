"""Align the background-task ER trace constraint with the ORM contract.

Revision ID: 0046
Revises: 0045
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels: str | None = None
depends_on: str | None = None

_CONSTRAINT_NAME = "ck_background_tasks_electrical_variant_trace"
_STRICT_TRACE_CHECK = """
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
_ER5_COMPATIBILITY_CHECK = """
electrical_variant_id IS NULL
OR (
    request_payload ->> 'variant_number' IS NULL
    OR (request_payload ->> 'variant_number') ~ '^[1-5]$'
)
"""


def upgrade() -> None:
    bind = op.get_bind()
    violations = int(
        bind.execute(
            sa.text(
                f"""
                SELECT count(*)
                FROM background_tasks
                WHERE ({_STRICT_TRACE_CHECK}) IS NOT TRUE
                """
            )
        ).scalar_one()
    )
    if violations:
        raise RuntimeError(
            "0046 background task trace constraint refused: "
            f"{violations} electrical/report task row(s) violate the UUID trace contract"
        )

    op.drop_constraint(_CONSTRAINT_NAME, "background_tasks", type_="check")
    op.create_check_constraint(
        _CONSTRAINT_NAME,
        "background_tasks",
        _STRICT_TRACE_CHECK,
    )


def downgrade() -> None:
    op.drop_constraint(_CONSTRAINT_NAME, "background_tasks", type_="check")
    op.create_check_constraint(
        _CONSTRAINT_NAME,
        "background_tasks",
        _ER5_COMPATIBILITY_CHECK,
    )
