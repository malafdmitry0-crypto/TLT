"""add cable commercial selection fields

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-17 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("cables_extended", sa.Column("price_per_meter", sa.Float(), nullable=True))
    op.add_column("cables_extended", sa.Column("stock_quantity_m", sa.Float(), nullable=True))
    op.add_column("cables_extended", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    op.add_column("cables_extended", sa.Column("supplier_priority", sa.Integer(), nullable=True))
    op.add_column(
        "cables_extended",
        sa.Column("is_preferred", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("cables_extended", sa.Column("order_multiple_m", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("cables_extended", "order_multiple_m")
    op.drop_column("cables_extended", "is_preferred")
    op.drop_column("cables_extended", "supplier_priority")
    op.drop_column("cables_extended", "lead_time_days")
    op.drop_column("cables_extended", "stock_quantity_m")
    op.drop_column("cables_extended", "price_per_meter")
