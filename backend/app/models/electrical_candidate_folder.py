"""Пользовательские папки вариантов подбора кабеля."""

import uuid

from sqlalchemy import (
    CheckConstraint,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ElectricalCandidateFolder(Base, TimestampMixin):
    __tablename__ = "electrical_candidate_folders"
    __table_args__ = (
        CheckConstraint(
            "variant_number >= 1 AND variant_number <= 5",
            name="ck_electrical_candidate_folders_variant_number",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id", "variant_number"],
            [
                "electrical_variants.id",
                "electrical_variants.project_id",
                "electrical_variants.legacy_variant_number",
            ],
            name="fk_electrical_candidate_folders_variant_project_legacy",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["electrical_variant_id", "object_id"],
            [
                "electrical_variant_objects.electrical_variant_id",
                "electrical_variant_objects.object_id",
            ],
            name="fk_electrical_candidate_folders_variant_object_assignment",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "project_id",
            "object_id",
            "variant_number",
            "name",
            name="uq_electrical_candidate_folders_scope_name",
        ),
        Index(
            "ix_electrical_candidate_folders_scope",
            "project_id",
            "object_id",
            "variant_number",
            "sort_order",
        ),
        Index(
            "ix_electrical_candidate_folders_electrical_scope",
            "project_id",
            "object_id",
            "electrical_variant_id",
            "sort_order",
        ),
        Index(
            "ux_electrical_candidate_folders_electrical_scope_name",
            "project_id",
            "object_id",
            "electrical_variant_id",
            "name",
            unique=True,
            postgresql_where=text("electrical_variant_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
    )
    object_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("project_objects.id", ondelete="CASCADE"),
        nullable=False,
    )
    variant_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    electrical_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    name: Mapped[str] = mapped_column(String(64), nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_by_session_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("guest_sessions.session_id", ondelete="CASCADE"),
        nullable=True,
    )


class ElectricalCandidateFolderItem(Base, TimestampMixin):
    __tablename__ = "electrical_candidate_folder_items"
    __table_args__ = (
        Index(
            "ix_electrical_candidate_folder_items_candidate",
            "candidate_id",
        ),
    )

    folder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("electrical_candidate_folders.id", ondelete="CASCADE"),
        primary_key=True,
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("electrical_candidates.id", ondelete="CASCADE"),
        primary_key=True,
    )
