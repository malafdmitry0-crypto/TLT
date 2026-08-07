"""Add a single durable calculation workflow per project.

Revision ID: 0048
Revises: 0047
Create Date: 2026-08-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision: str = "0048"
down_revision: str | None = "0047"
branch_labels: str | None = None
depends_on: str | None = None

_ACTIVE = "('queued', 'enqueued', 'running', 'waiting_input')"
_CALC_TYPES = "('heat_loss_batch', 'electrical_batch', 'project_pipeline')"


def upgrade() -> None:
    bind = op.get_bind()
    conflicts = int(
        bind.execute(
            sa.text(
                """
                SELECT count(*)
                FROM (
                    SELECT project_id
                    FROM background_tasks
                    WHERE project_id IS NOT NULL
                      AND type IN ('heat_loss_batch', 'electrical_batch')
                      AND status IN ('queued', 'enqueued', 'running')
                    GROUP BY project_id
                    HAVING count(*) > 1
                ) AS conflicting_project
                """
            )
        ).scalar_one()
    )
    if conflicts:
        raise RuntimeError(
            "0048 workflow migration refused: projects with concurrent active calculation tasks "
            f"exist ({conflicts})"
        )

    op.add_column(
        "background_tasks",
        sa.Column("workflow_stage", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "background_tasks",
        sa.Column("workflow_version", sa.Integer(), server_default="1", nullable=False),
    )
    op.add_column(
        "background_tasks",
        sa.Column("queue_deadline_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "background_tasks",
        sa.Column("execution_deadline_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "background_tasks",
        sa.Column("interaction_deadline_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.drop_constraint("ck_background_tasks_status", "background_tasks", type_="check")
    op.create_check_constraint(
        "ck_background_tasks_status",
        "background_tasks",
        "status IN ('queued', 'enqueued', 'running', 'waiting_input', "
        "'succeeded', 'failed', 'cancelled', 'timed_out')",
    )
    op.drop_index("uq_background_tasks_active_idempotency", table_name="background_tasks")
    op.create_index(
        "uq_background_tasks_active_idempotency",
        "background_tasks",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text(f"idempotency_key IS NOT NULL AND status IN {_ACTIVE}"),
    )
    op.create_index(
        "uq_background_tasks_active_calculation_project",
        "background_tasks",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text(
            f"project_id IS NOT NULL AND type IN {_CALC_TYPES} AND status IN {_ACTIVE}"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_background_tasks_active_calculation_project",
        table_name="background_tasks",
    )
    op.drop_index("uq_background_tasks_active_idempotency", table_name="background_tasks")
    op.create_index(
        "uq_background_tasks_active_idempotency",
        "background_tasks",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text(
            "idempotency_key IS NOT NULL AND status IN ('queued', 'enqueued', 'running')"
        ),
    )
    op.drop_constraint("ck_background_tasks_status", "background_tasks", type_="check")
    op.create_check_constraint(
        "ck_background_tasks_status",
        "background_tasks",
        "status IN ('queued', 'enqueued', 'running', 'succeeded', 'failed', 'cancelled')",
    )
    for column in (
        "interaction_deadline_at",
        "execution_deadline_at",
        "queue_deadline_at",
        "workflow_version",
        "workflow_stage",
    ):
        op.drop_column("background_tasks", column)
