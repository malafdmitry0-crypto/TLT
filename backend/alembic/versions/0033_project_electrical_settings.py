"""Add project electrical settings and assignment current override.

Revision ID: 0033
Revises: 0032
Create Date: 2026-08-02
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0033"
down_revision: str | None = "0032"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "project_electrical_settings",
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("nominal_voltage_v", sa.Integer(), server_default="230", nullable=False),
        sa.Column("max_section_start_current_a", sa.Numeric(12, 3), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_by", sa.String(length=255), nullable=True),
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
        sa.CheckConstraint(
            "nominal_voltage_v = 230",
            name="ck_project_electrical_settings_voltage_230",
        ),
        sa.CheckConstraint(
            "max_section_start_current_a IS NULL OR max_section_start_current_a > 0",
            name="ck_project_electrical_settings_current_positive",
        ),
        sa.CheckConstraint(
            "version >= 1",
            name="ck_project_electrical_settings_version_positive",
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("project_id"),
    )
    # Backfill is retry-safe at the data level and never invents Iдоп.
    op.execute(
        """
        INSERT INTO project_electrical_settings (project_id)
        SELECT id FROM projects
        ON CONFLICT (project_id) DO NOTHING
        """
    )
    op.add_column(
        "electrical_variant_objects",
        sa.Column("max_section_start_current_a", sa.Numeric(12, 3), nullable=True),
    )
    op.create_check_constraint(
        "ck_electrical_variant_objects_current_positive",
        "electrical_variant_objects",
        "max_section_start_current_a IS NULL OR max_section_start_current_a > 0",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_electrical_variant_objects_current_positive",
        "electrical_variant_objects",
        type_="check",
    )
    op.drop_column("electrical_variant_objects", "max_section_start_current_a")
    op.drop_table("project_electrical_settings")
