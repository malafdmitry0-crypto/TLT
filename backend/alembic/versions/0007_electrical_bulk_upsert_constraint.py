"""make electrical calculation upsert key unique

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-10 01:25:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM electrical_calculations old
        USING electrical_calculations keep
        WHERE old.object_id = keep.object_id
          AND old.variant_number = keep.variant_number
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
    op.drop_index(
        "ix_electrical_calculations_object_variant",
        table_name="electrical_calculations",
    )
    op.create_index(
        "ix_electrical_calculations_object_variant",
        "electrical_calculations",
        ["object_id", "variant_number"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_electrical_calculations_object_variant",
        table_name="electrical_calculations",
    )
    op.create_index(
        "ix_electrical_calculations_object_variant",
        "electrical_calculations",
        ["object_id", "variant_number"],
    )
