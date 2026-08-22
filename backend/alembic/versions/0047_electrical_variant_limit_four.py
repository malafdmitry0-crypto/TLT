"""Limit each project to four electrical variants.

Revision ID: 0047
Revises: 0046
Create Date: 2026-08-06
"""

from __future__ import annotations

from alembic import op

revision: str = "0047"
down_revision: str | None = "0046"
branch_labels: str | None = None
depends_on: str | None = None


def upgrade() -> None:
    op.execute(
        """
        CREATE FUNCTION tlt_0047_enforce_electrical_variant_limit()
        RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
            PERFORM 1 FROM projects WHERE id = NEW.project_id FOR UPDATE;
            IF (
                SELECT count(*) FROM electrical_variants AS item
                WHERE item.project_id = NEW.project_id
                  AND item.id IS DISTINCT FROM NEW.id
            ) >= 4 THEN
                RAISE EXCEPTION 'A project may contain no more than four electrical variants'
                    USING ERRCODE = '23514',
                          CONSTRAINT = 'ck_electrical_variants_project_limit';
            END IF;
            RETURN NEW;
        END
        $function$
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_0047_enforce_electrical_variant_limit
        BEFORE INSERT OR UPDATE OF project_id ON electrical_variants
        FOR EACH ROW EXECUTE FUNCTION tlt_0047_enforce_electrical_variant_limit()
        """
    )


def downgrade() -> None:
    pass
