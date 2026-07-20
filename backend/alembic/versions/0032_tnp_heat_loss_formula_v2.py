"""Retire unsupported heat-loss factors and invalidate legacy calculations.

Revision ID: 0032
Revises: 0031
Create Date: 2026-07-20
"""

from __future__ import annotations

from alembic import op

revision: str = "0032"
down_revision: str | None = "0031"
branch_labels: str | None = None
depends_on: str | None = None


_LEGACY_HEAT_RESULT = """
object_type IN ('pipe', 'tank')
AND results IS NOT NULL
AND results ? 'total_heat_loss'
AND (
    results ? 'location_factor'
    OR COALESCE(results #>> '{calculation_trace,formula_version}', '') <> '2'
)
"""


def upgrade() -> None:
    # Only the two location keys are deleted. `wind_factor` is retained as a
    # legacy DB value so this migration never deletes an unrelated coefficient.
    op.execute(
        "DELETE FROM correction_coefficients "
        "WHERE key IN ('location_indoor', 'location_outdoor')"
    )

    # Preserve prior values for audit, but make their stale status explicit and
    # block them from feeding a fresh electrical selection.
    op.execute(
        f"""
        UPDATE project_objects
        SET results = results || jsonb_build_object(
                'stale', true,
                'stale_reason', 'heat_loss_formula_v2',
                'error_code', 'STALE_HEAT_LOSS',
                'category', 'stale',
                'message', 'Формула теплопотерь обновлена по ТНП. Требуется пересчёт.',
                'hint', 'Пересчитайте теплопотери и зависимый электрорасчёт.'
            ),
            is_valid = false,
            validation_errors = jsonb_build_object(
                'error_code', 'STALE_HEAT_LOSS',
                'category', 'stale',
                'message', 'Формула теплопотерь обновлена по ТНП. Требуется пересчёт.',
                'hint', 'Пересчитайте теплопотери и зависимый электрорасчёт.'
            )
        WHERE {_LEGACY_HEAT_RESULT}
          AND COALESCE(results ->> 'stale_reason', '') <> 'heat_loss_formula_v2'
        """
    )
    op.execute(
        """
        UPDATE electrical_calculations AS calculation
        SET results = COALESCE(calculation.results, '{}'::jsonb) || jsonb_build_object(
                'stale', true,
                'stale_reason', 'heat_loss_formula_v2',
                'error_code', 'STALE_HEAT_LOSS',
                'category', 'stale',
                'message', 'Теплопотери обновлены по ТНП. Требуется пересчёт электрорасчёта.'
            )
        WHERE calculation.object_id IN (
            SELECT id FROM project_objects
            WHERE results ->> 'stale_reason' = 'heat_loss_formula_v2'
        )
          AND COALESCE(calculation.results ->> 'stale_reason', '') <> 'heat_loss_formula_v2'
        """
    )
    op.execute(
        """
        UPDATE electrical_candidates AS candidate
        SET status = 'stale',
            is_applied = false,
            reason_code = 'STALE_HEAT_LOSS',
            reason_message = 'Теплопотери обновлены по ТНП. Требуется пересчёт.',
            risk_flags = COALESCE(risk_flags, '[]'::jsonb) || jsonb_build_array(
                jsonb_build_object('code', 'STALE_HEAT_LOSS', 'message', 'Теплопотери обновлены по ТНП.')
            )
        WHERE candidate.object_id IN (
            SELECT id FROM project_objects
            WHERE results ->> 'stale_reason' = 'heat_loss_formula_v2'
        )
          AND candidate.status <> 'stale'
        """
    )
    op.execute(
        """
        UPDATE electrical_variant_objects AS assignment
        SET assignment_state = 'stale',
            diagnostics = jsonb_build_object(
                'error_code', 'ELECTRICAL_RECALCULATION_REQUIRED',
                'category', 'stale',
                'reason', 'heat_loss_formula_v2',
                'message', 'Теплопотери обновлены по ТНП. Требуется пересчёт.'
            ),
            version = version + 1
        WHERE assignment.system_type IS NOT NULL
          AND assignment.assignment_state <> 'stale'
          AND assignment.object_id IN (
              SELECT id FROM project_objects
              WHERE results ->> 'stale_reason' = 'heat_loss_formula_v2'
          )
        """
    )
    op.execute(
        """
        UPDATE specifications
        SET is_stale = true,
            stale_reason = 'heat_loss_formula_v2',
            stale_at = NOW(),
            stale_details = jsonb_build_object(
                'reason', 'heat_loss_formula_v2',
                'message', 'Связанные теплопотери обновлены по ТНП. Требуется регенерация.'
            )
        WHERE project_id IN (
            SELECT DISTINCT project_id FROM project_objects
            WHERE results ->> 'stale_reason' = 'heat_loss_formula_v2'
        )
          AND COALESCE(stale_reason, '') <> 'heat_loss_formula_v2'
        """
    )


def downgrade() -> None:
    # Old numeric results cannot be made current safely without recalculation.
    pass
