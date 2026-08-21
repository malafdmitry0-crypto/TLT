"""Add stale state to specifications.

Revision ID: 0020
Revises: 0019
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0020"
down_revision: str | None = "0019"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "specifications",
        sa.Column("is_stale", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column("specifications", sa.Column("stale_reason", sa.String(length=100), nullable=True))
    op.add_column(
        "specifications",
        sa.Column("stale_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "specifications",
        sa.Column("stale_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("specifications", "stale_details")
    op.drop_column("specifications", "stale_at")
    op.drop_column("specifications", "stale_reason")
    op.drop_column("specifications", "is_stale")
