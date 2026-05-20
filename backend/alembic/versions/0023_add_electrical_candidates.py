"""Add electrical cable candidates.

Revision ID: 0023
Revises: 0022
Create Date: 2026-05-20
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0023"
down_revision: str | None = "0022"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "ck_electrical_calculations_variant_number",
        "electrical_calculations",
        "variant_number >= 1 AND variant_number <= 4",
    )
    op.create_table(
        "electrical_candidates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("object_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("variant_number", sa.Integer(), nullable=False),
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
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "variant_number >= 1 AND variant_number <= 4",
            name="ck_electrical_candidates_variant_number",
        ),
        sa.CheckConstraint(
            "mode IN ('auto', 'manual')",
            name="ck_electrical_candidates_mode",
        ),
        sa.CheckConstraint(
            "status IN ('applicable', 'error', 'not_applicable', 'excluded', 'stale')",
            name="ck_electrical_candidates_status",
        ),
        sa.ForeignKeyConstraint(["object_id"], ["project_objects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_electrical_candidates_project_object_variant",
        "electrical_candidates",
        ["project_id", "object_id", "variant_number"],
    )
    op.create_index(
        "ux_electrical_candidates_applied_object_variant",
        "electrical_candidates",
        ["object_id", "variant_number"],
        unique=True,
        postgresql_where=sa.text("is_applied"),
    )


def downgrade() -> None:
    op.drop_index(
        "ux_electrical_candidates_applied_object_variant",
        table_name="electrical_candidates",
    )
    op.drop_index(
        "ix_electrical_candidates_project_object_variant",
        table_name="electrical_candidates",
    )
    op.drop_table("electrical_candidates")
    op.drop_constraint(
        "ck_electrical_calculations_variant_number",
        "electrical_calculations",
        type_="check",
    )
