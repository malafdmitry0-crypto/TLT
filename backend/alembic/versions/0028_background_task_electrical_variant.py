"""Trace electrical background tasks by electrical variant UUID.

Revision ID: 0028
Revises: 0027
Create Date: 2026-07-18
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0028"
down_revision: str | None = "0027"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "background_tasks",
        sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        "ix_background_tasks_electrical_variant_id",
        "background_tasks",
        ["electrical_variant_id"],
        unique=False,
    )


def downgrade() -> None:
    pass
