"""Durable background tasks executed by worker processes."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BackgroundTask(Base, TimestampMixin):
    __tablename__ = "background_tasks"
    __table_args__ = (
        CheckConstraint(
            "status IN ('queued', 'enqueued', 'running', 'waiting_input', "
            "'succeeded', 'failed', 'cancelled', 'timed_out')",
            name="ck_background_tasks_status",
        ),
        CheckConstraint(
            "user_id IS NOT NULL OR session_id IS NOT NULL",
            name="ck_background_tasks_owner_present",
        ),
        CheckConstraint(
            "type NOT IN ('electrical_batch', 'report_export') OR ("
            "electrical_variant_id IS NOT NULL AND "
            "project_id IS NOT NULL AND "
            "request_payload ->> 'project_id' IS NOT NULL AND "
            "request_payload ->> 'project_id' = project_id::text AND "
            "request_payload ->> 'electrical_variant_id' IS NOT NULL AND "
            "lower(request_payload ->> 'electrical_variant_id') = "
            "electrical_variant_id::text AND "
            "NOT request_payload ? 'payload_version')",
            name="ck_background_tasks_electrical_variant_trace",
        ),
        Index("ix_background_tasks_status_next_retry", "status", "next_retry_at"),
        Index("ix_background_tasks_project_status", "project_id", "status"),
        Index("ix_background_tasks_user_created", "user_id", "created_at"),
        Index("ix_background_tasks_session_created", "session_id", "created_at"),
        Index(
            "uq_background_tasks_active_idempotency",
            "idempotency_key",
            unique=True,
            postgresql_where=text(
                "idempotency_key IS NOT NULL AND status IN "
                "('queued', 'enqueued', 'running', 'waiting_input')"
            ),
        ),
        Index(
            "uq_background_tasks_active_calculation_project",
            "project_id",
            unique=True,
            postgresql_where=text(
                "project_id IS NOT NULL AND type IN "
                "('heat_loss_batch', 'electrical_batch') AND status IN "
                "('queued', 'enqueued', 'running', 'waiting_input')"
            ),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="queued", index=True)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # Deliberately not a foreign key: completed task history must retain the
    # selected ER UUID even after that electrical variant is deleted.
    electrical_variant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    session_id: Mapped[str | None] = mapped_column(
        String(64),
        ForeignKey("guest_sessions.session_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    request_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    result_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_current: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    progress_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    progress_phase: Mapped[str | None] = mapped_column(String(64), nullable=True)
    arq_job_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    enqueue_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_enqueue_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by: Mapped[str | None] = mapped_column(String(128), nullable=True)
    lock_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    heartbeat_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    workflow_stage: Mapped[str | None] = mapped_column(String(64), nullable=True)
    workflow_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    queue_deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    execution_deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    interaction_deadline_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
