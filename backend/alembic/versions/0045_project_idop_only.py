"""Make the section current limit a project-only setting.

Revision ID: 0045
Revises: 0044
Create Date: 2026-08-06
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0045"
down_revision: str | None = "0044"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_electrical_variant_objects_current_positive",
        "electrical_variant_objects",
        type_="check",
    )
    op.drop_column("electrical_variant_objects", "max_section_start_current_a")


def downgrade() -> None:
    op.add_column(
        "electrical_variant_objects",
        sa.Column("max_section_start_current_a", sa.Numeric(12, 3), nullable=True),
    )
    op.create_check_constraint(
        "ck_electrical_variant_objects_current_positive",
        "electrical_variant_objects",
        "max_section_start_current_a IS NULL OR max_section_start_current_a > 0",
    )
