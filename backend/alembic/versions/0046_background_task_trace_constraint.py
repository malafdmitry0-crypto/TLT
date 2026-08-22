"""Align background-task tracing with the UUID contract.

Revision ID: 0046
Revises: 0045
Create Date: 2026-08-06
"""

from __future__ import annotations

from alembic import op

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels: str | None = None
depends_on: str | None = None

_CONSTRAINT = "ck_background_tasks_electrical_variant_trace"
_CHECK = """
type NOT IN ('electrical_batch', 'report_export')
OR (
    electrical_variant_id IS NOT NULL
    AND project_id IS NOT NULL
    AND request_payload ->> 'project_id' = project_id::text
    AND lower(request_payload ->> 'electrical_variant_id') = electrical_variant_id::text
)
"""


def upgrade() -> None:
    op.create_check_constraint(_CONSTRAINT, "background_tasks", _CHECK)


def downgrade() -> None:
    pass
