"""add optimistic lock version to project objects

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-17 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "project_objects",
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )
    op.alter_column("project_objects", "version", server_default=None)


def downgrade() -> None:
    op.drop_column("project_objects", "version")
