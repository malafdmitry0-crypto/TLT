"""Объекты проекта (трубы, резервуары и т.д.)."""

import enum
import uuid
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import ENUM, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin


class ObjectType(str, enum.Enum):
    pipe = "pipe"
    tank = "tank"
    pump = "pump"
    platform = "platform"
    other = "other"


object_type_enum = ENUM(
    ObjectType,
    name="object_type",
    values_callable=lambda x: [e.value for e in x],
    create_type=True,
)


class ProjectObject(Base, TimestampMixin):
    __tablename__ = "project_objects"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    object_type: Mapped[str] = mapped_column(object_type_enum, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    params: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    results: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_valid: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    validation_errors: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    project: Mapped["Project"] = relationship(back_populates="objects")  # noqa: F821
