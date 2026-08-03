"""Persist ER catalog selections for multi-candidate groups (SPEC-FINAL-05).

Revision ID: 0040
Revises: 0039
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0040"
down_revision: str | None = "0039"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.create_table(
        "specification_catalog_selections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("electrical_variant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_group_key", sa.String(length=128), nullable=False),
        sa.Column("catalog_version_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("catalog_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("candidate_set_fingerprint", sa.String(length=71), nullable=False),
        sa.Column(
            "collection_version",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
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
            "collection_version >= 1",
            name="ck_spec_catalog_selections_collection_version",
        ),
        sa.CheckConstraint(
            "char_length(btrim(candidate_group_key)) > 0",
            name="ck_spec_catalog_selections_group_key_nonempty",
        ),
        sa.ForeignKeyConstraint(
            ["catalog_item_id"],
            ["specification_catalog_items.id"],
            name="fk_spec_catalog_selections_item",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["catalog_version_id"],
            ["specification_catalog_versions.id"],
            name="fk_spec_catalog_selections_catalog_version",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["electrical_variant_id", "project_id"],
            ["electrical_variants.id", "electrical_variants.project_id"],
            name="fk_spec_catalog_selections_variant_project",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name="fk_spec_catalog_selections_project",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "project_id",
            "electrical_variant_id",
            "candidate_group_key",
            name="uq_spec_catalog_selections_project_er_group",
        ),
    )
    op.create_index(
        "ix_spec_catalog_selections_project_er",
        "specification_catalog_selections",
        ["project_id", "electrical_variant_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_spec_catalog_selections_project_er",
        table_name="specification_catalog_selections",
    )
    op.drop_table("specification_catalog_selections")
