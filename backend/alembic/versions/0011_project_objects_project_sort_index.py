"""add project-wide project object sort index

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-15 18:30:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0011"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_project_objects_project_sort",
        "project_objects",
        ["project_id", "sort_order", "id"],
    )


def downgrade() -> None:
    op.drop_index("ix_project_objects_project_sort", table_name="project_objects")
