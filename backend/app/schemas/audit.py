"""Schemas for business audit events."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

AuditCategory = Literal[
    "auth",
    "project",
    "object",
    "calculation",
    "task",
    "report",
    "specification",
    "frontend",
    "system",
    "security",
]
AuditSeverity = Literal["debug", "info", "warning", "error", "critical"]
AuditResult = Literal["success", "failure", "queued", "skipped", "cancelled"]
AuditSource = Literal["backend", "frontend", "worker", "database", "redis"]


class AuditEventCreate(BaseModel):
    event_type: str = Field(min_length=3, max_length=128)
    category: AuditCategory
    severity: AuditSeverity = "info"
    result: AuditResult = "success"
    source: AuditSource = "backend"
    event_version: int = Field(default=1, ge=1)

    actor_type: str | None = Field(default=None, max_length=32)
    actor_id: str | None = Field(default=None, max_length=128)
    user_id: UUID | None = None
    session_id: str | None = Field(default=None, max_length=128)
    project_id: UUID | None = None
    object_id: UUID | None = None
    task_id: UUID | None = None
    request_id: str | None = Field(default=None, max_length=128)

    requirement_refs: list[str] = Field(default_factory=list, max_length=20)
    details: dict[str, Any] = Field(default_factory=dict)
    before_state: dict[str, Any] | None = None
    after_state: dict[str, Any] | None = None
    error_code: str | None = Field(default=None, max_length=128)
    message: str | None = Field(default=None, max_length=1000)


class AuditEventResponse(AuditEventCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime


class ClientAuditEvent(BaseModel):
    event_type: str = Field(min_length=3, max_length=128)
    severity: AuditSeverity = "info"
    result: AuditResult = "success"
    project_id: UUID | None = None
    object_id: UUID | None = None
    task_id: UUID | None = None
    requirement_refs: list[str] = Field(default_factory=list, max_length=20)
    details: dict[str, Any] = Field(default_factory=dict)
    error_code: str | None = Field(default=None, max_length=128)
    message: str | None = Field(default=None, max_length=1000)


class ClientAuditEventsRequest(BaseModel):
    events: list[ClientAuditEvent] = Field(min_length=1, max_length=50)


class ClientAuditEventsResponse(BaseModel):
    accepted: int
