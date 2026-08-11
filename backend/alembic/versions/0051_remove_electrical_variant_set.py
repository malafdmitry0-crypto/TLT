"""Remove the retired multi-ER electrical calculation task.

Revision ID: 0051
Revises: 0050
Create Date: 2026-08-12
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0051"
down_revision: str | None = "0050"
branch_labels: str | None = None
depends_on: str | None = None

_ACTIVE = "('queued', 'enqueued', 'running', 'waiting_input')"


def upgrade() -> None:
    bind = op.get_bind()
    active_retired = int(
        bind.execute(
            sa.text(
                "SELECT count(*) FROM background_tasks "
                "WHERE type = 'electrical_variant_set' AND status IN " + _ACTIVE
            )
        ).scalar_one()
    )
    if active_retired:
        raise RuntimeError(
            "0051 refused: active electrical_variant_set tasks must finish or be cancelled"
        )

    op.drop_index("uq_background_tasks_active_calculation_project", table_name="background_tasks")
    op.create_index(
        "uq_background_tasks_active_calculation_project",
        "background_tasks",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text(
            "project_id IS NOT NULL AND type IN ('heat_loss_batch', 'electrical_batch') "
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
            "('heat_loss_batch', 'electrical_batch', 'electrical_variant_set') "
            f"AND status IN {_ACTIVE}"
        ),
    )
