"""tighten indexes for large project query paths

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-10 12:00:00

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_index("ix_project_objects_project_type_sort", table_name="project_objects")
    op.create_index(
        "ix_project_objects_project_type_sort",
        "project_objects",
        ["project_id", "object_type", "sort_order", "id"],
    )
    op.create_index(
        "ix_electrical_calculations_object_variant",
        "electrical_calculations",
        ["object_id", "variant_number"],
    )
    op.create_index(
        "ix_projects_user_updated",
        "projects",
        ["user_id", "updated_at"],
    )
    op.create_index(
        "ix_projects_session_updated",
        "projects",
        ["session_id", "updated_at"],
    )
    op.create_index(
        "ix_guest_sessions_last_activity",
        "guest_sessions",
        ["last_activity"],
    )


def downgrade() -> None:
    op.drop_index("ix_guest_sessions_last_activity", table_name="guest_sessions")
    op.drop_index("ix_projects_session_updated", table_name="projects")
    op.drop_index("ix_projects_user_updated", table_name="projects")
    op.drop_index(
        "ix_electrical_calculations_object_variant",
        table_name="electrical_calculations",
    )
    op.drop_index("ix_project_objects_project_type_sort", table_name="project_objects")
    op.create_index(
        "ix_project_objects_project_type_sort",
        "project_objects",
        ["project_id", "object_type", "sort_order"],
    )
