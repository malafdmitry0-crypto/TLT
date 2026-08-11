"""remove manual external heat-transfer coefficient overrides

Revision ID: 0050
Revises: 0049
"""

from alembic import op

revision: str = "0050"
down_revision: str | None = "0049"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE project_objects
        SET params = params - 'alpha_vnesh'
        WHERE params ? 'alpha_vnesh'
        """
    )


def downgrade() -> None:
    # Removed manual overrides cannot be reconstructed; calculated results are preserved.
    pass
