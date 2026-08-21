"""Project-scoped display settings (case 5.9 / 5.11).

Display settings live on the project so the guest (single session project)
keeps them across reloads and the project file can carry them to another
machine. version=0 means "never set"; reset writes a canonical empty payload
and still bumps the version.

Revision ID: 0038
Revises: 0037
Create Date: 2026-08-03
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0038"
down_revision: str | None = "0037"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("display_settings", postgresql.JSONB(), nullable=True),
    )
    op.add_column(
        "projects",
        sa.Column(
            "display_settings_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "display_settings_version")
    op.drop_column("projects", "display_settings")
