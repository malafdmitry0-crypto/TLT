"""Add electrical cable candidates.

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-20
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "electrical_candidates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("cable_type", sa.String(length=64), nullable=False),
        sa.Column("cable_source", sa.String(length=32), nullable=False),
        sa.Column("cable_mark", sa.String(length=128), nullable=True),
        sa.Column("mode", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False),
        sa.Column("is_recommended", sa.Boolean(), nullable=False),
        sa.Column("is_pinned", sa.Boolean(), nullable=False),
        sa.Column("is_applied", sa.Boolean(), nullable=False),
        sa.Column("reason_code", sa.String(length=128), nullable=True),
        sa.Column("reason_message", sa.Text(), nullable=True),
        sa.Column("engineer_comment", sa.Text(), nullable=True),
        sa.Column("params", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("results", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("cable_snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("warnings", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("risk_flags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("candidate_meta", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "mode IN ('auto', 'manual')",
            name="ck_electrical_candidates_mode",
        ),
        sa.CheckConstraint(
            "status IN ('applicable', 'error', 'not_applicable', 'excluded', 'stale')",
            name="ck_electrical_candidates_status",
        ),
        sa.CheckConstraint(
            "cable_type IN ('self_regulating', 'self_regulating_tt', "
            "'single_core', 'three_core')",
            name="ck_electrical_candidates_supported_cable_type",
        ),
        sa.ForeignKeyConstraint(["object_id"], ["project_objects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_electrical_candidates_project_object_electrical_variant",
        "electrical_candidates",
        ["project_id", "object_id", "electrical_variant_id"],
    )
    op.create_index(
        "ux_electrical_candidates_applied_object_electrical_variant",
        "electrical_candidates",
        ["object_id", "electrical_variant_id"],
        unique=True,
        postgresql_where=sa.text("is_applied AND electrical_variant_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ux_electrical_candidates_applied_object_electrical_variant",
        table_name="electrical_candidates",
    )
    op.drop_index(
        "ix_electrical_candidates_project_object_electrical_variant",
        table_name="electrical_candidates",
    )
    op.drop_table("electrical_candidates")
