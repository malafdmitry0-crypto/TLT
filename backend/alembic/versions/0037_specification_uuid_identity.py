"""Specification persistence by UUID identity (CANON-06).

Revision ID: 0037
Revises: 0036
Create Date: 2026-08-03

Policy for existing rows:
  a) electrical_variant_id set and belongs to project → keep
  b) UUID null but variant_number uniquely maps to one ER in project → backfill
  c) ambiguous auto rows → delete with count log; ambiguous/manual without map → hard stop
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0037"
down_revision: str | None = "0036"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Drop triple FK that forces legacy_variant_number slot.
    op.drop_constraint(
        "fk_specifications_variant_project_legacy",
        "specifications",
        type_="foreignkey",
    )

    # 2) Backfill electrical_variant_id from unique (project_id, legacy_variant_number).
    conn.execute(
        sa.text(
            """
            UPDATE specifications AS spec
            SET electrical_variant_id = ev.id
            FROM electrical_variants AS ev
            WHERE spec.electrical_variant_id IS NULL
              AND ev.project_id = spec.project_id
              AND ev.legacy_variant_number = spec.variant_number
            """
        )
    )

    # Detect ambiguous unmapped rows (null UUID still).
    residual = conn.execute(
        sa.text(
            """
            SELECT
                id,
                project_id,
                variant_number,
                items
            FROM specifications
            WHERE electrical_variant_id IS NULL
            """
        )
    ).mappings().all()

    deleted_auto = 0
    manual_or_ambiguous: list[str] = []
    for row in residual:
        items = row["items"] or []
        if not isinstance(items, list):
            items = []
        has_manual = any(
            isinstance(item, dict) and item.get("source") == "manual" for item in items
        )
        if has_manual:
            manual_or_ambiguous.append(str(row["id"]))
            continue
        # Auto-only / empty residual without ER map → delete.
        conn.execute(
            sa.text("DELETE FROM specifications WHERE id = :id"),
            {"id": row["id"]},
        )
        deleted_auto += 1

    if deleted_auto:
        # Visible in alembic logs when running upgrade.
        print(  # noqa: T201
            f"0037_specification_uuid_identity: deleted {deleted_auto} "
            "unmapped auto specification row(s)"
        )

    if manual_or_ambiguous:
        raise RuntimeError(
            "0037_specification_uuid_identity: cannot make electrical_variant_id "
            "NOT NULL; manual specification rows lack a unique ER mapping: "
            + ", ".join(manual_or_ambiguous)
        )

    remaining_null = conn.execute(
        sa.text(
            "SELECT count(*) FROM specifications WHERE electrical_variant_id IS NULL"
        )
    ).scalar()
    if remaining_null:
        raise RuntimeError(
            f"0037_specification_uuid_identity: {remaining_null} specification "
            "row(s) still have null electrical_variant_id after backfill"
        )

    # Drop partial unique index if present; replace with hard unique constraint.
    op.execute(
        sa.text(
            "DROP INDEX IF EXISTS ux_specifications_project_electrical_variant"
        )
    )

    # Guard: no duplicate (project_id, electrical_variant_id) pairs.
    dupes = conn.execute(
        sa.text(
            """
            SELECT project_id, electrical_variant_id, count(*) AS n
            FROM specifications
            GROUP BY project_id, electrical_variant_id
            HAVING count(*) > 1
            """
        )
    ).mappings().all()
    if dupes:
        raise RuntimeError(
            "0037_specification_uuid_identity: duplicate "
            "(project_id, electrical_variant_id) before unique constraint: "
            + ", ".join(
                f"{row['project_id']}/{row['electrical_variant_id']}×{row['n']}"
                for row in dupes
            )
        )

    op.create_unique_constraint(
        "uq_specifications_project_electrical_variant",
        "specifications",
        ["project_id", "electrical_variant_id"],
    )

    op.alter_column(
        "specifications",
        "electrical_variant_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=False,
    )

    op.create_foreign_key(
        "fk_specifications_electrical_variant_id",
        "specifications",
        "electrical_variants",
        ["electrical_variant_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.create_index(
        "ix_specifications_electrical_variant_id",
        "specifications",
        ["electrical_variant_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_specifications_electrical_variant_id", table_name="specifications")
    op.drop_constraint(
        "fk_specifications_electrical_variant_id",
        "specifications",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_specifications_project_electrical_variant",
        "specifications",
        type_="unique",
    )
    op.alter_column(
        "specifications",
        "electrical_variant_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.create_index(
        "ux_specifications_project_electrical_variant",
        "specifications",
        ["project_id", "electrical_variant_id"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )
    op.create_foreign_key(
        "fk_specifications_variant_project_legacy",
        "specifications",
        "electrical_variants",
        ["electrical_variant_id", "project_id", "variant_number"],
        ["id", "project_id", "legacy_variant_number"],
        ondelete="CASCADE",
    )
