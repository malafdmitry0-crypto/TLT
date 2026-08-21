"""Project-level versioned specification defaults (PDL-ER-07).

Settings live on the project; each generation stores a full snapshot on the
specification. Saving defaults bumps the version and must not auto-regenerate
all ERs — specs whose snapshot version differs become stale.

Revision ID: 0030
Revises: 0029
Create Date: 2026-07-19
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column(
            "specification_settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "projects",
        sa.Column(
            "specification_settings_version",
            sa.Integer(),
            nullable=False,
            server_default="1",
        ),
    )


def downgrade() -> None:
    op.drop_column("projects", "specification_settings_version")
    op.drop_column("projects", "specification_settings")
