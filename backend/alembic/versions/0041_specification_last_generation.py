"""Persist last generation status/diagnostics per ER (SPEC-REM-02).

Revision ID: 0041
Revises: 0040
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "specifications",
        sa.Column("generation_status", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "specifications",
        sa.Column(
            "generation_diagnostics",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "specifications",
        sa.Column(
            "generation_candidate_groups",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column(
        "specifications",
        sa.Column("generation_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_specifications_generation_status",
        "specifications",
        "generation_status IS NULL OR generation_status IN "
        "('generated', 'blocked', 'confirmation_required', 'selection_required')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_specifications_generation_status", "specifications", type_="check")
    op.drop_column("specifications", "generation_at")
    op.drop_column("specifications", "generation_candidate_groups")
    op.drop_column("specifications", "generation_diagnostics")
    op.drop_column("specifications", "generation_status")
