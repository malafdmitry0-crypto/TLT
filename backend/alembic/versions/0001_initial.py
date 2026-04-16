"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-10 00:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")

    user_role = postgresql.ENUM(
        "employee", "admin", name="user_role", create_type=False
    )
    user_role.create(op.get_bind(), checkfirst=True)

    project_status = postgresql.ENUM(
        "draft", "completed", name="project_status", create_type=False
    )
    project_status.create(op.get_bind(), checkfirst=True)

    object_type = postgresql.ENUM(
        "pipe",
        "tank",
        "pump",
        "platform",
        "other",
        name="object_type",
        create_type=False,
    )
    object_type.create(op.get_bind(), checkfirst=True)

    cable_type = postgresql.ENUM(
        "self_regulating",
        "single_core",
        "three_core",
        "mineral",
        "skin",
        name="cable_type",
        create_type=False,
    )
    cable_type.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255), nullable=True),
        sa.Column("role", user_role, nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "guest_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_id", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("last_activity", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_guest_sessions_session_id", "guest_sessions", ["session_id"], unique=True)

    op.create_table(
        "projects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "session_id",
            sa.String(64),
            sa.ForeignKey("guest_sessions.session_id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("status", project_status, nullable=False, server_default="draft"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "user_id IS NOT NULL OR session_id IS NOT NULL",
            name="ck_project_owner_present",
        ),
    )

    op.create_table(
        "project_objects",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("object_type", object_type, nullable=False),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("params", postgresql.JSONB, nullable=False),
        sa.Column("results", postgresql.JSONB, nullable=True),
        sa.Column("is_valid", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("validation_errors", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_project_objects_project_id", "project_objects", ["project_id"])

    op.create_table(
        "electrical_calculations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "object_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("project_objects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("variant_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("cable_type", sa.String(64), nullable=False),
        sa.Column("cable_mark", sa.String(128), nullable=True),
        sa.Column("params", postgresql.JSONB, nullable=False),
        sa.Column("results", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "specifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "project_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("variant_number", sa.Integer, nullable=False, server_default="1"),
        sa.Column("items", postgresql.JSONB, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "correction_coefficients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("key", sa.String(64), nullable=False, unique=True),
        sa.Column("value", sa.Float, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column(
            "updated_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "cables_extended",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("cable_type", cable_type, nullable=False),
        sa.Column("brand", sa.String(128), nullable=False),
        sa.Column("model", sa.String(128), nullable=False),
        sa.Column("power_per_meter", sa.Float, nullable=True),
        sa.Column("max_temperature", sa.Float, nullable=True),
        sa.Column("min_temperature", sa.Float, nullable=True),
        sa.Column("resistance_per_meter", sa.Float, nullable=True),
        sa.Column("params", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "accessories_extended",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("category", sa.String(64), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("article", sa.String(64), nullable=True),
        sa.Column("params", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_accessories_extended_category", "accessories_extended", ["category"])


def downgrade() -> None:
    op.drop_table("accessories_extended")
    op.drop_table("cables_extended")
    op.drop_table("correction_coefficients")
    op.drop_table("specifications")
    op.drop_table("electrical_calculations")
    op.drop_table("project_objects")
    op.drop_table("projects")
    op.drop_table("guest_sessions")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS cable_type")
    op.execute("DROP TYPE IF EXISTS object_type")
    op.execute("DROP TYPE IF EXISTS project_status")
    op.execute("DROP TYPE IF EXISTS user_role")
