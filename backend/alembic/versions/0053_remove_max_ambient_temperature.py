"""Remove the retired maximum ambient-temperature field.

Revision ID: 0053
Revises: 0052
Create Date: 2026-08-14
"""

from __future__ import annotations

from alembic import op

revision: str = "0053"
down_revision: str | None = "0052"
branch_labels: str | None = None
depends_on: str | None = None

_FIELD_KEY = "max_ambient_temperature"
_SCOPES = ("pipe", "tank", "all")


def _remove_user_table_column(scope: str) -> None:
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
                    WHERE item.value <> '"{_FIELD_KEY}"'::jsonb
                ),
                '[]'::jsonb
            ),
            false
        )
        WHERE key LIKE 'heatcalc.tableColumns.%'
          AND jsonb_typeof(value #> '{visible_path}') = 'array'
          AND (value #> '{visible_path}') ? '{_FIELD_KEY}'
        """
    )
    op.execute(
        f"""
        UPDATE user_preferences
        SET value = jsonb_set(
            value,
            '{columns_path}',
            (value #> '{columns_path}') - '{_FIELD_KEY}',
            false
        )
        WHERE key LIKE 'heatcalc.tableColumns.%'
          AND jsonb_typeof(value #> '{columns_path}') = 'object'
          AND (value #> '{columns_path}') ? '{_FIELD_KEY}'
        """
    )


def _remove_project_table_column(scope: str) -> None:
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
                    WHERE item.value <> '"{_FIELD_KEY}"'::jsonb
                ),
                '[]'::jsonb
            ),
            false
        )
        WHERE jsonb_typeof(display_settings #> '{visible_path}') = 'array'
          AND (display_settings #> '{visible_path}') ? '{_FIELD_KEY}'
        """
    )
    op.execute(
        f"""
        UPDATE projects
        SET display_settings = jsonb_set(
            display_settings,
            '{columns_path}',
            (display_settings #> '{columns_path}') - '{_FIELD_KEY}',
            false
        )
        WHERE jsonb_typeof(display_settings #> '{columns_path}') = 'object'
          AND (display_settings #> '{columns_path}') ? '{_FIELD_KEY}'
        """
    )


def upgrade() -> None:
    op.execute(
        f"""
        UPDATE project_objects
        SET params = params - '{_FIELD_KEY}'
        WHERE jsonb_typeof(params) = 'object'
          AND params ? '{_FIELD_KEY}'
        """
    )
    op.execute(
        f"""
        UPDATE user_preferences
        SET value = jsonb_set(
            value,
            '{{fields}}',
            (value -> 'fields') - '{_FIELD_KEY}',
            false
        )
        WHERE key LIKE 'heatcalc.fieldInputs.%'
          AND jsonb_typeof(value -> 'fields') = 'object'
          AND (value -> 'fields') ? '{_FIELD_KEY}'
        """
    )
    for scope in _SCOPES:
        _remove_user_table_column(scope)
        _remove_project_table_column(scope)


def downgrade() -> None:
    # Deleted inert values and layout entries cannot be reconstructed truthfully.
    pass
