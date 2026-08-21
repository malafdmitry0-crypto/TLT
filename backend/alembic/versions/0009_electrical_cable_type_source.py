"""store electrical cable type source

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-15 12:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "electrical_calculations",
        sa.Column(
            "cable_type_source",
            sa.String(length=32),
            server_default="auto",
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE electrical_calculations
        SET cable_type_source = COALESCE(NULLIF(params->>'cable_type_source', ''), 'auto')
        WHERE params ? 'cable_type_source'
        """
    )
    op.alter_column(
        "electrical_calculations",
        "cable_type_source",
        server_default=None,
    )
    op.create_index(
        "ix_electrical_calculations_cable_type_source",
        "electrical_calculations",
        ["cable_type_source"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_electrical_calculations_cable_type_source",
        table_name="electrical_calculations",
    )
    op.drop_column("electrical_calculations", "cable_type_source")
