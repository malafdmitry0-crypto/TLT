"""store electrical cable mark source

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-15 13:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: str | None = "0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "electrical_calculations",
        sa.Column(
            "cable_mark_source",
            sa.String(length=32),
            server_default="auto",
            nullable=False,
        ),
    )
    op.execute(
        """
        UPDATE electrical_calculations
        SET cable_mark_source = CASE
            WHEN params->>'cable_mark' IS NOT NULL THEN 'manual'
            ELSE 'auto'
        END
        """
    )
    op.alter_column(
        "electrical_calculations",
        "cable_mark_source",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("electrical_calculations", "cable_mark_source")
