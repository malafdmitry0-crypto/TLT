"""Allow explicitly marked demo catalogs to be active outside production.

Revision ID: 0043
Revises: 0042
"""

from __future__ import annotations

from alembic import op

revision = "0043"
down_revision = "0042"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_specification_catalog_versions_active_authoritative",
        "specification_catalog_versions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_specification_catalog_versions_active_authoritative",
        "specification_catalog_versions",
        "status <> 'active' OR (authority IN ('approved', 'demo') AND is_complete IS TRUE)",
    )


def downgrade() -> None:
    # The previous constraint cannot represent an active demo version.  Status
    # changes are allowed for immutable catalog versions; payload rows remain
    # untouched.
    op.execute(
        "UPDATE specification_catalog_versions "
        "SET status = 'retired' "
        "WHERE status = 'active' AND authority = 'demo'"
    )
    op.drop_constraint(
        "ck_specification_catalog_versions_active_authoritative",
        "specification_catalog_versions",
        type_="check",
    )
    op.create_check_constraint(
        "ck_specification_catalog_versions_active_authoritative",
        "specification_catalog_versions",
        "status <> 'active' OR (authority = 'approved' AND is_complete IS TRUE)",
    )
