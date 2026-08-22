"""Reserve revision after UUID-native specification identity.

Revision ID: 0037
Revises: 0036
Create Date: 2026-08-03
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.drop_column("specifications", "generation_mode")
    op.alter_column(
        "specifications",
        "generation_options",
        new_column_name="snapshot",
        existing_type=postgresql.JSONB(),  # type: ignore[no-untyped-call]
        existing_nullable=True,
    )


def downgrade() -> None:
    pass
