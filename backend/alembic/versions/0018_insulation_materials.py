"""add insulation materials catalog

Revision ID: 0018
Revises: 0017
Create Date: 2026-05-18 00:00:00

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0018"
down_revision: str | None = "0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "insulation_materials",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("material", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=512), nullable=False),
        sa.Column("conductivity", sa.Float(), nullable=True),
        sa.Column("density_kg_m3", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("temperature_range", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("conductivity_20_plus", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("conductivity_19_minus", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("selectable", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("deprecated", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column(
            "requires_material_reselection",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        sa.Column("material_family", sa.String(length=128), nullable=True),
        sa.Column("reselection_message", sa.Text(), nullable=True),
        sa.Column("source", sa.String(length=512), nullable=True),
        sa.Column(
            "data_source", sa.String(length=32), server_default="builtin_json", nullable=False
        ),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("material", name="uq_insulation_materials_material"),
    )
    op.create_index("ix_insulation_materials_material", "insulation_materials", ["material"])
    op.create_index("ix_insulation_materials_active", "insulation_materials", ["is_active"])


def downgrade() -> None:
    op.drop_index("ix_insulation_materials_active", table_name="insulation_materials")
    op.drop_index("ix_insulation_materials_material", table_name="insulation_materials")
    op.drop_table("insulation_materials")
