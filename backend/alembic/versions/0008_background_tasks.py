"""add durable background tasks

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-10 18:30:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "background_tasks",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("type", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=24), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", sa.String(length=64), nullable=True),
        sa.Column("request_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("result_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("progress_current", sa.Integer(), nullable=False),
        sa.Column("progress_total", sa.Integer(), nullable=True),
        sa.Column("progress_phase", sa.String(length=64), nullable=True),
        sa.Column("arq_job_id", sa.String(length=128), nullable=True),
        sa.Column("idempotency_key", sa.String(length=128), nullable=True),
        sa.Column("cancel_requested", sa.Boolean(), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("enqueue_attempts", sa.Integer(), nullable=False),
        sa.Column("last_enqueue_error", sa.Text(), nullable=True),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.String(length=128), nullable=True),
        sa.Column("lock_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True),
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
            "status IN ('queued', 'enqueued', 'running', 'succeeded', 'failed', 'cancelled')",
            name="ck_background_tasks_status",
        ),
        sa.CheckConstraint(
            "user_id IS NOT NULL OR session_id IS NOT NULL",
            name="ck_background_tasks_owner_present",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["guest_sessions.session_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_background_tasks_idempotency_key",
        "background_tasks",
        ["idempotency_key"],
    )
    op.create_index("ix_background_tasks_project_id", "background_tasks", ["project_id"])
    op.create_index(
        "ix_background_tasks_project_status",
        "background_tasks",
        ["project_id", "status"],
    )
    op.create_index(
        "ix_background_tasks_session_created",
        "background_tasks",
        ["session_id", "created_at"],
    )
    op.create_index("ix_background_tasks_session_id", "background_tasks", ["session_id"])
    op.create_index("ix_background_tasks_status", "background_tasks", ["status"])
    op.create_index(
        "ix_background_tasks_status_next_retry",
        "background_tasks",
        ["status", "next_retry_at"],
    )
    op.create_index("ix_background_tasks_type", "background_tasks", ["type"])
    op.create_index(
        "ix_background_tasks_user_created",
        "background_tasks",
        ["user_id", "created_at"],
    )
    op.create_index("ix_background_tasks_user_id", "background_tasks", ["user_id"])
    op.create_index(
        "uq_background_tasks_active_idempotency",
        "background_tasks",
        ["idempotency_key"],
        unique=True,
        postgresql_where=sa.text(
            "idempotency_key IS NOT NULL AND status IN ('queued', 'enqueued', 'running')"
        ),
    )


def downgrade() -> None:
    op.drop_index("uq_background_tasks_active_idempotency", table_name="background_tasks")
    op.drop_index("ix_background_tasks_user_id", table_name="background_tasks")
    op.drop_index("ix_background_tasks_user_created", table_name="background_tasks")
    op.drop_index("ix_background_tasks_type", table_name="background_tasks")
    op.drop_index("ix_background_tasks_status_next_retry", table_name="background_tasks")
    op.drop_index("ix_background_tasks_status", table_name="background_tasks")
    op.drop_index("ix_background_tasks_session_id", table_name="background_tasks")
    op.drop_index("ix_background_tasks_session_created", table_name="background_tasks")
    op.drop_index("ix_background_tasks_project_status", table_name="background_tasks")
    op.drop_index("ix_background_tasks_project_id", table_name="background_tasks")
    op.drop_index("ix_background_tasks_idempotency_key", table_name="background_tasks")
    op.drop_table("background_tasks")
