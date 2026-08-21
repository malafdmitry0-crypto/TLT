"""Remove source from electrical table view cable picker fields.

Revision ID: 0022
Revises: 0021
Create Date: 2026-05-20
"""

from alembic import op


revision: str = "0022"
down_revision: str | None = "0021"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE user_preferences
        SET value = jsonb_set(
            value,
            '{cablePickerCableFields}',
            COALESCE(
                (
                    SELECT jsonb_agg(field.value ORDER BY field.ordinality)
                    FROM jsonb_array_elements(value->'cablePickerCableFields')
                        WITH ORDINALITY AS field(value, ordinality)
                    WHERE field.value <> '"source"'::jsonb
                ),
                '[]'::jsonb
            ),
            true
        )
        WHERE key = 'electrical.tableView.v3'
          AND jsonb_typeof(value) = 'object'
          AND jsonb_typeof(value->'cablePickerCableFields') = 'array'
          AND value->'cablePickerCableFields' ? 'source'
        """
    )


def downgrade() -> None:
    pass
