"""tune autovacuum for churn-heavy tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-10 12:20:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE guest_sessions SET (
            autovacuum_vacuum_scale_factor = 0.01,
            autovacuum_vacuum_insert_threshold = 1000
        )
        """
    )
    op.execute(
        """
        ALTER TABLE project_objects SET (
            autovacuum_vacuum_scale_factor = 0.05
        )
        """
    )
    op.execute(
        """
        ALTER TABLE electrical_calculations SET (
            autovacuum_vacuum_scale_factor = 0.05
        )
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE electrical_calculations RESET (
            autovacuum_vacuum_scale_factor
        )
        """
    )
    op.execute(
        """
        ALTER TABLE project_objects RESET (
            autovacuum_vacuum_scale_factor
        )
        """
    )
    op.execute(
        """
        ALTER TABLE guest_sessions RESET (
            autovacuum_vacuum_scale_factor,
            autovacuum_vacuum_insert_threshold
        )
        """
    )
