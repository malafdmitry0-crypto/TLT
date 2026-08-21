"""Persist per-object electrical input overrides in exact UUID ER assignments.

Revision ID: 0042
Revises: 0041
Create Date: 2026-08-05
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0042"
down_revision: str | None = "0041"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "electrical_variant_objects",
        sa.Column(
            "electrical_overrides",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("electrical_variant_objects", "electrical_overrides")
