"""Add dedupe_key to electrical_candidates with backfill and unique index.

Revision ID: 0024
Revises: 0023
Create Date: 2026-05-21
"""

from collections import defaultdict

import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.orm import Session

from alembic import op
from app.services.electrical_candidate_dedupe import (
    build_dedupe_key,
    merge_duplicate_candidate_fields,
)


def _pick_survivor_index(rows: list) -> int:
    def sort_key(index: int) -> tuple:
        row = rows[index]
        updated = row["updated_at"]
        created = row["created_at"]
        updated_ts = updated.timestamp() if updated is not None else 0.0
        created_ts = created.timestamp() if created is not None else 0.0
        return (
            1 if row["is_applied"] else 0,
            1 if row["is_pinned"] else 0,
            updated_ts,
            created_ts,
        )

    return max(range(len(rows)), key=sort_key)


revision: str = "0024"
down_revision: str | None = "0023"
branch_labels: str | None = None
depends_on: str | None = None


def _backfill_and_merge() -> None:
    bind = op.get_bind()
    session = Session(bind=bind)
    rows = (
        session.execute(
            text(
                """
            SELECT ec.id, ec.object_id, ec.electrical_variant_id, ec.cable_type, ec.cable_source, ec.cable_mark,
                   ec.status, ec.reason_code, ec.params, ec.results, ec.cable_snapshot,
                   ec.priority, ec.is_recommended, ec.is_pinned, ec.is_applied, ec.engineer_comment,
                   ec.updated_at, ec.created_at, po.object_type
            FROM electrical_candidates ec
            JOIN project_objects po ON po.id = ec.object_id
            ORDER BY ec.object_id, ec.electrical_variant_id, ec.updated_at, ec.created_at
            """
            )
        )
        .mappings()
        .all()
    )

    keyed: dict[tuple, list] = defaultdict(list)
    for row in rows:
        dedupe_key = build_dedupe_key(
            object_type=row["object_type"],
            cable_type=row["cable_type"],
            cable_source=row["cable_source"],
            cable_mark=row["cable_mark"],
            results=row["results"],
            params=row["params"] or {},
            cable_snapshot=row["cable_snapshot"],
            reason_code=row["reason_code"],
            status=row["status"],
        )
        keyed[(row["object_id"], row["electrical_variant_id"], dedupe_key)].append(
            (row, dedupe_key)
        )

    delete_ids: list = []
    for group in keyed.values():
        if len(group) == 1:
            row, dedupe_key = group[0]
            session.execute(
                text("UPDATE electrical_candidates SET dedupe_key = :dedupe_key WHERE id = :id"),
                {"dedupe_key": dedupe_key, "id": row["id"]},
            )
            continue

        survivor_idx = _pick_survivor_index([item[0] for item in group])
        survivor_row, survivor_key = group[survivor_idx]
        survivor_id = survivor_row["id"]

        class _RowAdapter:
            def __init__(self, data: dict) -> None:
                self.priority = data["priority"]
                self.is_recommended = data["is_recommended"]
                self.is_pinned = data["is_pinned"]
                self.is_applied = data["is_applied"]
                self.engineer_comment = data["engineer_comment"]

        keeper = _RowAdapter(survivor_row)
        for index, (row, _dedupe_key) in enumerate(group):
            if index == survivor_idx:
                continue
            merge_duplicate_candidate_fields(keeper, _RowAdapter(row))
            delete_ids.append(row["id"])

        session.execute(
            text(
                """
                UPDATE electrical_candidates
                SET dedupe_key = :dedupe_key,
                    priority = :priority,
                    is_recommended = :is_recommended,
                    is_pinned = :is_pinned,
                    is_applied = :is_applied,
                    engineer_comment = :engineer_comment
                WHERE id = :id
                """
            ),
            {
                "dedupe_key": survivor_key,
                "priority": keeper.priority,
                "is_recommended": keeper.is_recommended,
                "is_pinned": keeper.is_pinned,
                "is_applied": keeper.is_applied,
                "engineer_comment": keeper.engineer_comment,
                "id": survivor_id,
            },
        )
    for row_id in delete_ids:
        session.execute(text("DELETE FROM electrical_candidates WHERE id = :id"), {"id": row_id})

    session.commit()


def upgrade() -> None:
    op.add_column(
        "electrical_candidates",
        sa.Column("dedupe_key", sa.String(length=128), nullable=True),
    )
    _backfill_and_merge()
    op.alter_column("electrical_candidates", "dedupe_key", nullable=False)
    op.create_index(
        "ux_electrical_candidates_object_electrical_variant_dedupe",
        "electrical_candidates",
        ["object_id", "electrical_variant_id", "dedupe_key"],
        unique=True,
        postgresql_where=sa.text("electrical_variant_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "ux_electrical_candidates_object_electrical_variant_dedupe",
        table_name="electrical_candidates",
    )
    op.drop_column("electrical_candidates", "dedupe_key")
