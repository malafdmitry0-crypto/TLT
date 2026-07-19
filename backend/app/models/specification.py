"""Спецификация проекта."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Specification(Base, TimestampMixin):
    __tablename__ = "specifications"
    __table_args__ = (
        ForeignKeyConstraint(
            ["electrical_variant_id", "project_id", "variant_number"],
            [
                "electrical_variants.id",
                "electrical_variants.project_id",
                "electrical_variants.legacy_variant_number",
            ],
            name="fk_specifications_variant_project_legacy",
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "project_id",
            "variant_number",
            name="uq_specifications_project_variant",
        ),
        Index(
            "ux_specifications_project_electrical_variant",
            "project_id",
            "electrical_variant_id",
            unique=True,
            postgresql_where=text("electrical_variant_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    variant_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    electrical_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )
    items: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    # Режим последней генерации ('basic'/'full') и её опции (R,гр, Ex, К1i/К2i/Кiu).
    # Нужны, чтобы «Пересчитать» не подменял полный BOM базовым после перезагрузки UI.
    generation_mode: Mapped[str | None] = mapped_column(String(10), nullable=True)
    generation_options: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    is_stale: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=text("false"),
    )
    stale_reason: Mapped[str | None] = mapped_column(String(100), nullable=True)
    stale_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stale_details: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
