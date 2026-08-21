"""add production commercial cable fields

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-17 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014"
down_revision: str | None = "0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "cables_extended", sa.Column("supplier_name", sa.String(length=128), nullable=True)
    )
    op.add_column("cables_extended", sa.Column("article", sa.String(length=128), nullable=True))
    op.add_column("cables_extended", sa.Column("currency", sa.String(length=8), nullable=True))
    op.add_column("cables_extended", sa.Column("stock_status", sa.String(length=32), nullable=True))
    op.add_column("cables_extended", sa.Column("min_order_quantity_m", sa.Float(), nullable=True))
    op.add_column(
        "cables_extended",
        sa.Column("is_discontinued", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "cables_extended",
        sa.Column("replacement_group", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "cables_extended",
        sa.Column("price_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "cables_extended",
        sa.Column("stock_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "cables_extended",
        sa.Column("commercial_data_source", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("cables_extended", "commercial_data_source")
    op.drop_column("cables_extended", "stock_updated_at")
    op.drop_column("cables_extended", "price_updated_at")
    op.drop_column("cables_extended", "replacement_group")
    op.drop_column("cables_extended", "is_discontinued")
    op.drop_column("cables_extended", "min_order_quantity_m")
    op.drop_column("cables_extended", "stock_status")
    op.drop_column("cables_extended", "currency")
    op.drop_column("cables_extended", "article")
    op.drop_column("cables_extended", "supplier_name")
