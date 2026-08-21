"""Append-only business audit events."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        CheckConstraint(
            "category IN ("
            "'auth','project','object','calculation','task','report',"
            "'specification','frontend','system','security'"
            ")",
            name="ck_audit_events_category",
        ),
        CheckConstraint(
            "severity IN ('debug','info','warning','error','critical')",
            name="ck_audit_events_severity",
        ),
        CheckConstraint(
            "result IN ('success','failure','queued','skipped','cancelled')",
            name="ck_audit_events_result",
        ),
        CheckConstraint(
            "source IN ('backend','frontend','worker','database','redis')",
            name="ck_audit_events_source",
        ),
        Index("ix_audit_events_created_at", "created_at"),
        Index("ix_audit_events_event_type_created", "event_type", "created_at"),
        Index("ix_audit_events_project_created", "project_id", "created_at"),
        Index("ix_audit_events_object_created", "object_id", "created_at"),
        Index("ix_audit_events_user_created", "user_id", "created_at"),
        Index("ix_audit_events_session_created", "session_id", "created_at"),
        Index("ix_audit_events_request_id", "request_id"),
        Index("ix_audit_events_category_created", "category", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        nullable=False,
    )
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    event_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    category: Mapped[str] = mapped_column(String(32), nullable=False)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, default="info")
    result: Mapped[str] = mapped_column(String(16), nullable=False, default="success")
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="backend")

    actor_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    session_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    object_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(128), nullable=True)

    requirement_refs: Mapped[list[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=list,
        server_default=text("'[]'::jsonb"),
    )
    details: Mapped[dict[str, Any]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    before_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(128), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
