"""Проекты пользователей и гостей."""

import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.electrical_variant import ElectricalVariant
    from app.models.project_electrical_settings import ProjectElectricalSettings
    from app.models.project_object import ProjectObject


class ProjectStatus(str, enum.Enum):
    draft = "draft"
    completed = "completed"


project_status_enum = ENUM(
    ProjectStatus,
    name="project_status",
    values_callable=lambda x: [e.value for e in x],
    create_type=True,
)


class Project(Base, TimestampMixin):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint(
            "user_id IS NOT NULL OR session_id IS NOT NULL",
            name="ck_project_owner_present",
        ),
        Index("ix_projects_user_updated", "user_id", "updated_at"),
        Index("ix_projects_session_updated", "session_id", "updated_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    task_number: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    session_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("guest_sessions.session_id", ondelete="CASCADE"),
        nullable=True,
    )
    status: Mapped[str] = mapped_column(
        project_status_enum, default=ProjectStatus.draft.value, nullable=False
    )
    electrical_initialized_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    # PDL-ER-07: project-level specification defaults; generation stores a snapshot.
    specification_settings: Mapped[dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default="{}",
    )
    specification_settings_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )

    objects: Mapped[list["ProjectObject"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ProjectObject.sort_order",
    )
    electrical_variants: Mapped[list["ElectricalVariant"]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ElectricalVariant.sort_order",
    )
    electrical_settings: Mapped["ProjectElectricalSettings | None"] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        uselist=False,
    )
