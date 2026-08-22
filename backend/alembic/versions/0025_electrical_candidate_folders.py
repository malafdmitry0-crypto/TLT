"""Add custom folders for electrical candidates.

Revision ID: 0025
Revises: 0024
Create Date: 2026-05-21
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "electrical_candidate_folders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("color", sa.String(length=32), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_by_session_id", sa.String(length=64), nullable=True),
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
        sa.ForeignKeyConstraint(
            ["created_by_session_id"], ["guest_sessions.session_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["object_id"], ["project_objects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_electrical_candidate_folders_electrical_scope",
        "electrical_candidate_folders",
        ["project_id", "object_id", "electrical_variant_id", "sort_order"],
    )
    op.create_index(
        "ux_electrical_candidate_folders_electrical_scope_name",
        "electrical_candidate_folders",
        ["project_id", "object_id", "electrical_variant_id", "name"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )
    op.create_table(
        "electrical_candidate_folder_items",
        sa.Column("folder_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.ForeignKeyConstraint(["candidate_id"], ["electrical_candidates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["folder_id"], ["electrical_candidate_folders.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("folder_id", "candidate_id"),
    )
    op.create_index(
        "ix_electrical_candidate_folder_items_candidate",
        "electrical_candidate_folder_items",
        ["candidate_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_electrical_candidate_folder_items_candidate",
        table_name="electrical_candidate_folder_items",
    )
    op.drop_table("electrical_candidate_folder_items")
    op.drop_index(
        "ux_electrical_candidate_folders_electrical_scope_name",
        table_name="electrical_candidate_folders",
    )
    op.drop_index(
        "ix_electrical_candidate_folders_electrical_scope",
        table_name="electrical_candidate_folders",
    )
    op.drop_table("electrical_candidate_folders")
