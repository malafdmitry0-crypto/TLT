"""add audit events

Revision ID: 0017
Revises: 0016
Create Date: 2026-05-18 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0017"
down_revision: str | None = "0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("event_version", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("result", sa.String(length=16), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("actor_type", sa.String(length=32), nullable=True),
        sa.Column("actor_id", sa.String(length=128), nullable=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("session_id", sa.String(length=128), nullable=True),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("request_id", sa.String(length=128), nullable=True),
        sa.Column(
            "requirement_refs",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("before_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("after_state", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("error_code", sa.String(length=128), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "category IN ('auth','project','object','calculation','task','report','specification','frontend','system','security')",
            name="ck_audit_events_category",
        ),
        sa.CheckConstraint(
            "severity IN ('debug','info','warning','error','critical')",
            name="ck_audit_events_severity",
        ),
        sa.CheckConstraint(
            "result IN ('success','failure','queued','skipped','cancelled')",
            name="ck_audit_events_result",
        ),
        sa.CheckConstraint(
            "source IN ('backend','frontend','worker','database','redis')",
            name="ck_audit_events_source",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_events_created_at", "audit_events", ["created_at"])
    op.create_index("ix_audit_events_event_type_created", "audit_events", ["event_type", "created_at"])
    op.create_index("ix_audit_events_project_created", "audit_events", ["project_id", "created_at"])
    op.create_index("ix_audit_events_object_created", "audit_events", ["object_id", "created_at"])
    op.create_index("ix_audit_events_user_created", "audit_events", ["user_id", "created_at"])
    op.create_index("ix_audit_events_session_created", "audit_events", ["session_id", "created_at"])
    op.create_index("ix_audit_events_request_id", "audit_events", ["request_id"])
    op.create_index("ix_audit_events_category_created", "audit_events", ["category", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_audit_events_category_created", table_name="audit_events")
    op.drop_index("ix_audit_events_request_id", table_name="audit_events")
    op.drop_index("ix_audit_events_session_created", table_name="audit_events")
    op.drop_index("ix_audit_events_user_created", table_name="audit_events")
    op.drop_index("ix_audit_events_object_created", table_name="audit_events")
    op.drop_index("ix_audit_events_project_created", table_name="audit_events")
    op.drop_index("ix_audit_events_event_type_created", table_name="audit_events")
    op.drop_index("ix_audit_events_created_at", table_name="audit_events")
    op.drop_table("audit_events")
