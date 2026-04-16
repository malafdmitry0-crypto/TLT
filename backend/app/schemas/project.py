"""Схемы проектов и объектов проекта."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    task_number: str | None = Field(default=None, max_length=64)


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    task_number: str | None = Field(default=None, max_length=64)
    status: str | None = Field(default=None, pattern="^(draft|completed)$")


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID | None
    session_id: str | None
    status: str
    owner_email: str | None = None
    object_types: list[str] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class ProjectObjectBase(BaseModel):
    object_type: str = Field(pattern="^(pipe|tank|pump|platform|other)$")
    sort_order: int = 0
    params: dict[str, Any] = Field(default_factory=dict)


class ProjectObjectCreate(ProjectObjectBase):
    pass


class ProjectObjectUpdate(BaseModel):
    params: dict[str, Any] | None = None
    sort_order: int | None = None


class ProjectObjectResponse(ProjectObjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    project_id: UUID
    results: dict[str, Any] | None
    is_valid: bool
    validation_errors: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime


class ReorderRequest(BaseModel):
    order: list[UUID]
