"""Remove the retired DN display key from persisted JSON settings.

Revision ID: 0052
Revises: 0051
Create Date: 2026-08-12
"""

from __future__ import annotations

from alembic import op

revision: str = "0052"
down_revision: str | None = "0051"
branch_labels: str | None = None
depends_on: str | None = None

_SCOPES = ("pipe", "tank", "all")


def _remove_user_preference_key(scope: str) -> None:
    visible_path = f"{{types,{scope},visibleOrder}}"
    columns_path = f"{{types,{scope},columns}}"
    op.execute(
        f"""
        UPDATE user_preferences
        SET value = jsonb_set(
            value,
            '{visible_path}',
            COALESCE(
                (
                    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
                    FROM jsonb_array_elements(value #> '{visible_path}')
                        WITH ORDINALITY AS item(value, ordinality)
                    WHERE item.value <> '"pipe_dn"'::jsonb
                ),
                '[]'::jsonb
            ),
            false
        )
        WHERE key LIKE 'heatcalc.tableColumns.%'
          AND jsonb_typeof(value #> '{visible_path}') = 'array'
          AND (value #> '{visible_path}') ? 'pipe_dn'
        """
    )
    op.execute(
        f"""
        UPDATE user_preferences
        SET value = jsonb_set(
            value,
            '{columns_path}',
            (value #> '{columns_path}') - 'pipe_dn',
            false
        )
        WHERE key LIKE 'heatcalc.tableColumns.%'
          AND jsonb_typeof(value #> '{columns_path}') = 'object'
          AND (value #> '{columns_path}') ? 'pipe_dn'
        """
    )


def _remove_project_display_key(scope: str) -> None:
    visible_path = f"{{heatcalc,tableColumns,types,{scope},visibleOrder}}"
    columns_path = f"{{heatcalc,tableColumns,types,{scope},columns}}"
    op.execute(
        f"""
        UPDATE projects
        SET display_settings = jsonb_set(
            display_settings,
            '{visible_path}',
            COALESCE(
                (
                    SELECT jsonb_agg(item.value ORDER BY item.ordinality)
                    FROM jsonb_array_elements(display_settings #> '{visible_path}')
                        WITH ORDINALITY AS item(value, ordinality)
                    WHERE item.value <> '"pipe_dn"'::jsonb
                ),
                '[]'::jsonb
            ),
            false
        )
        WHERE jsonb_typeof(display_settings #> '{visible_path}') = 'array'
          AND (display_settings #> '{visible_path}') ? 'pipe_dn'
        """
    )
    op.execute(
        f"""
        UPDATE projects
        SET display_settings = jsonb_set(
            display_settings,
            '{columns_path}',
            (display_settings #> '{columns_path}') - 'pipe_dn',
            false
        )
        WHERE jsonb_typeof(display_settings #> '{columns_path}') = 'object'
          AND (display_settings #> '{columns_path}') ? 'pipe_dn'
        """
    )


def upgrade() -> None:
    for scope in _SCOPES:
        _remove_user_preference_key(scope)
        _remove_project_display_key(scope)


def downgrade() -> None:
    # Deleted per-user layout data cannot be reconstructed truthfully.
    pass
