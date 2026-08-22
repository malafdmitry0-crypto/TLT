"""add indexes for large project tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-09 23:30:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_project_objects_project_type_sort",
        "project_objects",
        ["project_id", "object_type", "sort_order"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_project_objects_project_type_sort",
        table_name="project_objects",
    )
