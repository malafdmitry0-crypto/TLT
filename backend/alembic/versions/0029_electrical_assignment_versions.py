"""Add optimistic revisions and semantic checks to ER object assignments.

Revision ID: 0029
Revises: 0028
Create Date: 2026-07-18
"""

from __future__ import annotations

from typing import Any

import sqlalchemy as sa

from alembic import op

revision: str = "0029"
down_revision: str | None = "0028"
branch_labels: str | None = None
depends_on: str | None = None


def _phase3_assignment_projection(
    cable_type: str | None,
    cable_mark: str | None,
    results: dict[str, Any] | None,
) -> tuple[str | None, str]:
    """Pure mirror of the 0029 deployed-calculation reconciliation."""
    if cable_type in {"self_regulating", "self_regulating_tt"}:
        system_type = "self_regulating"
    elif cable_type in {"single_core", "three_core"}:
        system_type = "resistive"
    else:
        system_type = None

    payload = results or {}
    if payload.get("category") == "unsupported":
        return system_type, "unsupported"
    if payload.get("category") == "stale" or payload.get("stale") is True:
        return system_type, "stale"
    if payload.get("error_code") or payload.get("category"):
        return system_type, "error"
    snapshot = payload.get("cable_snapshot")
    snapshot_mark = snapshot.get("cable_mark") if isinstance(snapshot, dict) else None
    has_mark = bool(
        cable_mark or payload.get("cable_mark") or payload.get("selected_cable") or snapshot_mark
    )
    return (
        (system_type, "ready")
        if results is not None and has_mark and system_type
        else (system_type, "error")
    )


def _reconcile_exact_uuid_calculations(bind: sa.engine.Connection) -> None:
    """Make assignments authoritative for calculations written after 0027."""
    bind.execute(
        sa.text(
            """
            UPDATE electrical_variant_objects AS assignment
            SET
                system_type = CASE
                    WHEN calculation.cable_type IN (
                        'self_regulating', 'self_regulating_tt'
                    ) THEN 'self_regulating'
                    WHEN calculation.cable_type IN ('single_core', 'three_core')
                        THEN 'resistive'
                    ELSE NULL
                END,
                assignment_state = CASE
                    WHEN calculation.results ->> 'category' = 'unsupported'
                        THEN 'unsupported'
                    WHEN calculation.results ->> 'category' = 'stale'
                         OR calculation.results -> 'stale' = 'true'::jsonb
                        THEN 'stale'
                    WHEN COALESCE(calculation.results ->> 'error_code', '') <> ''
                         OR COALESCE(calculation.results ->> 'category', '') <> ''
                        THEN 'error'
                    WHEN calculation.cable_type IN (
                            'self_regulating', 'self_regulating_tt',
                            'single_core', 'three_core'
                         )
                         AND calculation.results IS NOT NULL
                         AND COALESCE(calculation.results ->> 'error_code', '') = ''
                         AND COALESCE(calculation.results ->> 'category', '') = ''
                         AND calculation.results -> 'stale' IS DISTINCT FROM 'true'::jsonb
                         AND COALESCE(
                            NULLIF(calculation.cable_mark, ''),
                            NULLIF(calculation.results ->> 'cable_mark', ''),
                            NULLIF(calculation.results ->> 'selected_cable', ''),
                            NULLIF(
                                calculation.results -> 'cable_snapshot' ->> 'cable_mark',
                                ''
                            )
                         ) IS NOT NULL
                        THEN 'ready'
                    ELSE 'error'
                END,
                requested_cable_type = calculation.cable_type,
                object_version_snapshot = object_row.version,
                diagnostics = assignment.diagnostics || jsonb_strip_nulls(
                    jsonb_build_object(
                        'migration_revision', '0029',
                        'calculation_id', calculation.id::text,
                        'result_category', calculation.results ->> 'category',
                        'error_code', calculation.results ->> 'error_code',
                        'message', calculation.results ->> 'message',
                        'stale_reason', calculation.results ->> 'stale_reason'
                    )
                ),
                version = 1
            FROM electrical_calculations AS calculation
            JOIN project_objects AS object_row
              ON object_row.id = calculation.object_id
             AND object_row.project_id = calculation.project_id
            WHERE calculation.electrical_variant_id IS NOT NULL
              AND assignment.electrical_variant_id = calculation.electrical_variant_id
              AND assignment.object_id = calculation.object_id
              AND assignment.project_id = calculation.project_id
            """
        )
    )


def upgrade() -> None:
    op.add_column(
        "electrical_variant_objects",
        sa.Column(
            "version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
    )
    _reconcile_exact_uuid_calculations(op.get_bind())
    op.create_check_constraint(
        "ck_electrical_variant_objects_assignment_version_positive",
        "electrical_variant_objects",
        "version >= 1",
    )
    op.create_check_constraint(
        "ck_electrical_variant_objects_unassigned_system_null",
        "electrical_variant_objects",
        "assignment_state <> 'unassigned' OR system_type IS NULL",
    )
    op.create_check_constraint(
        "ck_electrical_variant_objects_ready_supported_system",
        "electrical_variant_objects",
        "assignment_state <> 'ready' " "OR system_type IN ('self_regulating', 'resistive')",
    )
    op.create_index(
        "ix_electrical_variant_objects_variant_system_state",
        "electrical_variant_objects",
        ["electrical_variant_id", "system_type", "assignment_state"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_electrical_variant_objects_variant_system_state",
        table_name="electrical_variant_objects",
    )
    op.drop_constraint(
        "ck_electrical_variant_objects_ready_supported_system",
        "electrical_variant_objects",
        type_="check",
    )
    op.drop_constraint(
        "ck_electrical_variant_objects_unassigned_system_null",
        "electrical_variant_objects",
        type_="check",
    )
    op.drop_constraint(
        "ck_electrical_variant_objects_assignment_version_positive",
        "electrical_variant_objects",
        type_="check",
    )
    op.drop_column("electrical_variant_objects", "version")
