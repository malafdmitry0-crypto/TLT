"""Схемы пользователей."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None


class UserCreate(UserBase):
    password: str = Field(min_length=6)
    role: str = Field(default="employee", pattern="^(employee|admin)$")


class UserUpdate(BaseModel):
    full_name: str | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=6)


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
