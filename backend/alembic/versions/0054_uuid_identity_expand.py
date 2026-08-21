"""Make UUID the required electrical variant identity.

Revision ID: 0054
Revises: 0053
Create Date: 2026-08-22
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision: str = "0054"
down_revision: str | None = "0053"
branch_labels: str | None = None
depends_on: str | None = None

_TABLES = (
    "electrical_calculations",
    "electrical_candidates",
    "electrical_candidate_folders",
)


def _backfill_uuid(table: str) -> None:
    op.execute(
        f"""
        UPDATE {table} AS target
        SET electrical_variant_id = variant.id
        FROM electrical_variants AS variant
        WHERE target.electrical_variant_id IS NULL
          AND variant.project_id = target.project_id
          AND variant.legacy_variant_number = target.variant_number
        """
    )
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM {table} WHERE electrical_variant_id IS NULL) THEN
                RAISE EXCEPTION '{table} contains rows without UUID electrical variant identity';
            END IF;
        END
        $$
        """
    )


def upgrade() -> None:
    for table in _TABLES:
        _backfill_uuid(table)

    op.drop_constraint(
        "fk_electrical_calculations_variant_project_legacy",
        "electrical_calculations",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_electrical_candidates_variant_project_legacy",
        "electrical_candidates",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_electrical_candidate_folders_variant_project_legacy",
        "electrical_candidate_folders",
        type_="foreignkey",
    )
    op.drop_index("ix_electrical_calculations_object_variant", table_name="electrical_calculations")
    op.drop_index(
        "ux_electrical_candidates_applied_object_variant",
        table_name="electrical_candidates",
    )
    op.drop_index(
        "ux_electrical_candidates_object_variant_dedupe",
        table_name="electrical_candidates",
    )
    op.drop_constraint(
        "uq_electrical_candidate_folders_scope_name",
        "electrical_candidate_folders",
        type_="unique",
    )
    op.drop_constraint(
        "uq_electrical_variants_id_project_legacy",
        "electrical_variants",
        type_="unique",
    )

    for table in _TABLES:
        op.alter_column(table, "electrical_variant_id", existing_type=sa.UUID(), nullable=False)
        op.alter_column(table, "variant_number", existing_type=sa.Integer(), nullable=True)

    for table, name in (
        ("electrical_calculations", "fk_electrical_calculations_variant_project"),
        ("electrical_candidates", "fk_electrical_candidates_variant_project"),
        ("electrical_candidate_folders", "fk_electrical_candidate_folders_variant_project"),
    ):
        op.create_foreign_key(
            name,
            table,
            "electrical_variants",
            ["electrical_variant_id", "project_id"],
            ["id", "project_id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    for table, name in (
        ("electrical_calculations", "fk_electrical_calculations_variant_project"),
        ("electrical_candidates", "fk_electrical_candidates_variant_project"),
        ("electrical_candidate_folders", "fk_electrical_candidate_folders_variant_project"),
    ):
        op.drop_constraint(name, table, type_="foreignkey")
        op.execute(
            f"""
            UPDATE {table} AS target
            SET variant_number = variant.legacy_variant_number
            FROM electrical_variants AS variant
            WHERE target.variant_number IS NULL
              AND variant.id = target.electrical_variant_id
              AND variant.project_id = target.project_id
            """
        )
        op.execute(
            f"""
            DO $$
            BEGIN
                IF EXISTS (SELECT 1 FROM {table} WHERE variant_number IS NULL) THEN
                    RAISE EXCEPTION '{table} cannot restore numeric variant identity';
                END IF;
            END
            $$
            """
        )
        op.alter_column(table, "variant_number", existing_type=sa.Integer(), nullable=False)
        op.alter_column(table, "electrical_variant_id", existing_type=sa.UUID(), nullable=True)

    op.create_unique_constraint(
        "uq_electrical_variants_id_project_legacy",
        "electrical_variants",
        ["id", "project_id", "legacy_variant_number"],
    )
    op.create_foreign_key(
        "fk_electrical_calculations_variant_project_legacy",
        "electrical_calculations",
        "electrical_variants",
        ["electrical_variant_id", "project_id", "variant_number"],
        ["id", "project_id", "legacy_variant_number"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_electrical_candidates_variant_project_legacy",
        "electrical_candidates",
        "electrical_variants",
        ["electrical_variant_id", "project_id", "variant_number"],
        ["id", "project_id", "legacy_variant_number"],
        ondelete="CASCADE",
    )
    op.create_foreign_key(
        "fk_electrical_candidate_folders_variant_project_legacy",
        "electrical_candidate_folders",
        "electrical_variants",
        ["electrical_variant_id", "project_id", "variant_number"],
        ["id", "project_id", "legacy_variant_number"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_electrical_calculations_object_variant",
        "electrical_calculations",
        ["object_id", "variant_number"],
        unique=True,
    )
    op.create_index(
        "ux_electrical_candidates_applied_object_variant",
        "electrical_candidates",
        ["object_id", "variant_number"],
        unique=True,
        postgresql_where=sa.text("is_applied"),
    )
    op.create_index(
        "ux_electrical_candidates_object_variant_dedupe",
        "electrical_candidates",
        ["object_id", "variant_number", "dedupe_key"],
        unique=True,
    )
    op.create_unique_constraint(
        "uq_electrical_candidate_folders_scope_name",
        "electrical_candidate_folders",
        ["project_id", "object_id", "variant_number", "name"],
    )
