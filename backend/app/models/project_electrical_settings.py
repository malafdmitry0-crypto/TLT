"""Project-scoped electrical defaults."""

import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.project import Project


class ProjectElectricalSettings(Base, TimestampMixin):
    __tablename__ = "project_electrical_settings"
    __table_args__ = (
        CheckConstraint(
            "nominal_voltage_v = 230",
            name="ck_project_electrical_settings_voltage_230",
        ),
        CheckConstraint(
            "max_section_start_current_a IS NULL OR max_section_start_current_a > 0",
            name="ck_project_electrical_settings_current_positive",
        ),
        CheckConstraint(
            "version >= 1",
            name="ck_project_electrical_settings_version_positive",
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        primary_key=True,
    )
    nominal_voltage_v: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=230,
        server_default="230",
    )
    max_section_start_current_a: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 3),
        nullable=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    updated_by: Mapped[str | None] = mapped_column(String(255), nullable=True)

    project: Mapped["Project"] = relationship(back_populates="electrical_settings")
