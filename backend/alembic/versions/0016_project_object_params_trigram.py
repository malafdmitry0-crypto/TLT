"""add trigram indexes for project object params search

Revision ID: 0016
Revises: 0015
Create Date: 2026-05-17 00:00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_project_objects_params_text_trgm
        ON project_objects USING gin (lower((params)::text) gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS ix_project_objects_name_trgm
        ON project_objects USING gin (lower((params->>'name')) gin_trgm_ops)
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_project_objects_name_trgm")
    op.execute("DROP INDEX IF EXISTS ix_project_objects_params_text_trgm")
