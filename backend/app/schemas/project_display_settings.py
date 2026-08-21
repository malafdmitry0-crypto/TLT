"""API schemas for project display settings (кейс §5.9 / §5.11)."""

from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# Верхнеуровневые ключи payload — по рабочим областям; внутри opaque JSON.
DISPLAY_SETTINGS_WORKSPACES = ("heatcalc", "electrical", "specification")
# Лимит размера канонического payload (после канонизации).
DISPLAY_SETTINGS_MAX_BYTES = 32 * 1024


class ProjectDisplaySettingsPayload(BaseModel):
    """Whitelist рабочих областей; наполнение области сервер не интерпретирует."""

    model_config = ConfigDict(extra="forbid")

    heatcalc: dict[str, Any] | None = None
    electrical: dict[str, Any] | None = None
    specification: dict[str, Any] | None = None


class ProjectDisplaySettingsUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int = Field(ge=0)
    settings: ProjectDisplaySettingsPayload


class ProjectDisplaySettingsResponse(BaseModel):
    project_id: UUID
    version: int
    settings: dict[str, Any]
