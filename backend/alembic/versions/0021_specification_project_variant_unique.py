"""Make specification project variant unique.

Revision ID: 0021
Revises: 0020
Create Date: 2026-05-20
"""

from alembic import op

revision: str = "0021"
down_revision: str | None = "0020"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM specifications old
        USING specifications keep
        WHERE old.project_id = keep.project_id
          AND old.electrical_variant_id = keep.electrical_variant_id
          AND (
            old.updated_at,
            old.created_at,
            old.id::text
          ) < (
            keep.updated_at,
            keep.created_at,
            keep.id::text
          )
        """
    )
    op.create_unique_constraint(
        "uq_specifications_project_electrical_variant",
        "specifications",
        ["project_id", "electrical_variant_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_specifications_project_electrical_variant",
        "specifications",
        type_="unique",
    )
