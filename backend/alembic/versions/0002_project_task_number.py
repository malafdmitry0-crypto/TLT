"""add task_number to projects

Revision ID: 0002
Revises: 0001
Create Date: 2026-04-13 00:00:00

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("task_number", sa.String(length=64), nullable=True),
    )
    op.create_index(
        "ix_projects_task_number",
        "projects",
        ["task_number"],
    )


def downgrade() -> None:
    op.drop_index("ix_projects_task_number", table_name="projects")
    op.drop_column("projects", "task_number")
