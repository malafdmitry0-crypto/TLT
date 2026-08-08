"""Replace the removed project pipeline task with explicit electrical ER-set tasks.

Revision ID: 0049
Revises: 0048
Create Date: 2026-08-08
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0049"
down_revision: str | None = "0048"
branch_labels: str | None = None
depends_on: str | None = None

_ACTIVE = "('queued', 'enqueued', 'running', 'waiting_input')"


def upgrade() -> None:
    bind = op.get_bind()
    active_legacy = int(
        bind.execute(
            sa.text(
                "SELECT count(*) FROM background_tasks "
                "WHERE type = 'project_pipeline' AND status IN " + _ACTIVE
            )
        ).scalar_one()
    )
    if active_legacy:
        raise RuntimeError(
            "0049 refused: active project_pipeline tasks must not exist in the target environment"
        )
    op.drop_index("uq_background_tasks_active_calculation_project", table_name="background_tasks")
    op.create_index(
        "uq_background_tasks_active_calculation_project",
        "background_tasks",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text(
            "project_id IS NOT NULL AND type IN "
            "('heat_loss_batch', 'electrical_batch', 'electrical_variant_set') "
            f"AND status IN {_ACTIVE}"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_background_tasks_active_calculation_project", table_name="background_tasks")
    op.create_index(
        "uq_background_tasks_active_calculation_project",
        "background_tasks",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text(
            "project_id IS NOT NULL AND type IN "
            "('heat_loss_batch', 'electrical_batch', 'project_pipeline') "
            f"AND status IN {_ACTIVE}"
        ),
    )
