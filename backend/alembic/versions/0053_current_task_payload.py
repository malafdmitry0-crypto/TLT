"""Enforce UUID-only payloads for electrical background tasks.

Revision ID: 0053
Revises: 0052
Create Date: 2026-08-22
"""

from __future__ import annotations

from alembic import op

revision: str = "0053"
down_revision: str | None = "0052"
branch_labels: str | None = None
depends_on: str | None = None

_CONSTRAINT = "ck_background_tasks_electrical_variant_trace"


def upgrade() -> None:
    op.execute(f"ALTER TABLE background_tasks DROP CONSTRAINT IF EXISTS {_CONSTRAINT}")
    op.execute(
        f"""
        ALTER TABLE background_tasks
        ADD CONSTRAINT {_CONSTRAINT}
        CHECK (
            type NOT IN ('electrical_batch', 'report_export') OR (
                electrical_variant_id IS NOT NULL
                AND project_id IS NOT NULL
                AND request_payload ->> 'project_id' IS NOT NULL
                AND request_payload ->> 'project_id' = project_id::text
                AND request_payload ->> 'electrical_variant_id' IS NOT NULL
                AND lower(request_payload ->> 'electrical_variant_id') =
                    electrical_variant_id::text
                AND NOT request_payload ? 'payload_version'
            )
        ) NOT VALID
        """
    )


def downgrade() -> None:
    op.execute(f"ALTER TABLE background_tasks DROP CONSTRAINT IF EXISTS {_CONSTRAINT}")
