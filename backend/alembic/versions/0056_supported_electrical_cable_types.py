"""Reserve the supported electrical cable-type contract revision.

The repository has no production migration history to preserve. The supported
type set is therefore defined at the tables' creation revisions instead of by
a compatibility transition at the end of the chain.

Revision ID: 0056
Revises: 0055
Create Date: 2026-08-22
"""

from __future__ import annotations

revision: str = "0056"
down_revision: str | None = "0055"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
