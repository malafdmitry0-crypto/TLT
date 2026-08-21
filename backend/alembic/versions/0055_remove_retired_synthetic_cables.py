"""Remove synthetic cable rows no longer owned by runtime seeds.

Revision ID: 0055
Revises: 0054
Create Date: 2026-08-22
"""

from __future__ import annotations

from alembic import op

revision: str = "0055"
down_revision: str | None = "0054"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        DELETE FROM cables_extended
        WHERE commercial_data_source IN ('seed', 'demo_seed', 'test', 'e2e')
          AND (
              (cable_type = 'self_regulating' AND brand IN ('ТЛТ', 'ВНШ-СР'))
              OR cable_type IN ('single_core', 'three_core', 'mineral', 'skin')
          )
        """
    )


def downgrade() -> None:
    pass
