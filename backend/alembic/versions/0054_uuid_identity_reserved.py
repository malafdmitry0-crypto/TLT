"""Reserve revision after fresh-install UUID identity cutover.

Revision ID: 0054
Revises: 0053
Create Date: 2026-08-22
"""

from __future__ import annotations

revision: str = "0054"
down_revision: str | None = "0053"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
