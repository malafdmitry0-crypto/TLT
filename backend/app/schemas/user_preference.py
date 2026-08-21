"""Схемы пользовательских UI-настроек."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class UserPreferenceUpdate(BaseModel):
    value: dict[str, Any]


class UserPreferenceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: str
    value: dict[str, Any] | None = None
    user_id: UUID | None = None
