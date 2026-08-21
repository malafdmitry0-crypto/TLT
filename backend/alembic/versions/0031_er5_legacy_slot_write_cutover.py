"""Expand legacy electrical slots 1..4 → 1..5 (ER5 write cutover).

Phase 5 product requires five writable named ERs. Expand-window still keeps
numeric compatibility slots, but the fifth slot is now a full data plane
(calculations/candidates/folders/specs) instead of UUID-lifecycle-only.

Revision ID: 0031
Revises: 0030
Create Date: 2026-07-19
"""

from __future__ import annotations

from alembic import op

revision: str = "0031"
down_revision: str | None = "0030"
branch_labels: str | None = None
depends_on: str | None = None


def _swap_check(table: str, name: str, sql: str) -> None:
    op.drop_constraint(name, table, type_="check")
    op.create_check_constraint(name, table, sql)


def upgrade() -> None:
    _swap_check(
        "electrical_variants",
        "ck_electrical_variants_legacy_number",
        "legacy_variant_number IS NULL "
        "OR (legacy_variant_number >= 1 AND legacy_variant_number <= 5)",
    )
    for table, name in (
        ("electrical_calculations", "ck_electrical_calculations_variant_number"),
        ("electrical_candidates", "ck_electrical_candidates_variant_number"),
        ("electrical_candidate_folders", "ck_electrical_candidate_folders_variant_number"),
    ):
        _swap_check(table, name, "variant_number >= 1 AND variant_number <= 5")

    # Background task payload may reference legacy slot 5 after cutover.
    op.execute("ALTER TABLE background_tasks DROP CONSTRAINT IF EXISTS ck_background_tasks_electrical_variant_trace")
    op.execute(
        """
        ALTER TABLE background_tasks
        ADD CONSTRAINT ck_background_tasks_electrical_variant_trace
        CHECK (
          electrical_variant_id IS NULL
          OR (
            (request_payload ->> 'variant_number') IS NULL
            OR (request_payload ->> 'variant_number') ~ '^[1-5]$'
          )
        )
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE background_tasks DROP CONSTRAINT IF EXISTS ck_background_tasks_electrical_variant_trace")
    op.execute(
        """
        ALTER TABLE background_tasks
        ADD CONSTRAINT ck_background_tasks_electrical_variant_trace
        CHECK (
          electrical_variant_id IS NULL
          OR (
            (request_payload ->> 'variant_number') IS NULL
            OR (request_payload ->> 'variant_number') ~ '^[1-4]$'
          )
        )
        """
    )
    for table, name in (
        ("electrical_candidate_folders", "ck_electrical_candidate_folders_variant_number"),
        ("electrical_candidates", "ck_electrical_candidates_variant_number"),
        ("electrical_calculations", "ck_electrical_calculations_variant_number"),
    ):
        _swap_check(table, name, "variant_number >= 1 AND variant_number <= 4")
    _swap_check(
        "electrical_variants",
        "ck_electrical_variants_legacy_number",
        "legacy_variant_number IS NULL "
        "OR (legacy_variant_number >= 1 AND legacy_variant_number <= 4)",
    )
