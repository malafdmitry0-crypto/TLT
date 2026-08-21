"""Persist specification generation mode and options.

«Пересчитать» не должен молча подменять полный BOM базовым: режим и опции
последней генерации сохраняются вместе со спецификацией.

Revision ID: 0026
Revises: 0025
Create Date: 2026-06-09
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "specifications",
        sa.Column("generation_mode", sa.String(length=10), nullable=True),
    )
    op.add_column(
        "specifications",
        sa.Column("generation_options", postgresql.JSONB(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("specifications", "generation_options")
    op.drop_column("specifications", "generation_mode")
