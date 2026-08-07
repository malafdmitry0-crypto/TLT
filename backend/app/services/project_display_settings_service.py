"""Проектные настройки отображения (кейс §5.9 / §5.11).

Хранятся на проекте (паттерн `SpecificationProjectSettingsService`): гостю
доступны через обычное право мутации проекта, файл проекта переносит их как
секцию metadata. `version=0` — «никогда не задавались»; сброс «По умолчанию»
пишет канонический пустой payload и тоже бампает версию, чтобы факт сброса
переживал экспорт/импорт.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.project import Project
from app.schemas.project_display_settings import (
    DISPLAY_SETTINGS_MAX_BYTES,
    DISPLAY_SETTINGS_WORKSPACES,
    ProjectDisplaySettingsPayload,
    ProjectDisplaySettingsResponse,
    ProjectDisplaySettingsUpdateRequest,
)
from app.services.project_service import ProjectService


class ProjectDisplaySettingsConflictError(Exception):
    def __init__(self, *, expected_version: int, current_version: int) -> None:
        super().__init__("Настройки отображения проекта изменены параллельно")
        self.expected_version = expected_version
        self.current_version = current_version


class ProjectDisplaySettingsTooLargeError(Exception):
    def __init__(self, *, size_bytes: int, limit_bytes: int) -> None:
        super().__init__(
            f"Настройки отображения превышают лимит {limit_bytes} байт " f"(получено {size_bytes})"
        )
        self.size_bytes = size_bytes
        self.limit_bytes = limit_bytes


def canonicalize_display_settings(payload: ProjectDisplaySettingsPayload) -> dict[str, Any]:
    """Канонический payload: только заданные области, без серверных дефолтов.

    Пустой dict области (`{}`) сохраняется — это явный сброс, не отсутствие.
    """
    data = payload.model_dump(mode="json")
    return {key: data[key] for key in DISPLAY_SETTINGS_WORKSPACES if data.get(key) is not None}


def display_settings_canonical_size(canonical: dict[str, Any]) -> int:
    return len(
        json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode(
            "utf-8"
        )
    )


def ensure_display_settings_size(canonical: dict[str, Any]) -> None:
    size = display_settings_canonical_size(canonical)
    if size > DISPLAY_SETTINGS_MAX_BYTES:
        raise ProjectDisplaySettingsTooLargeError(
            size_bytes=size, limit_bytes=DISPLAY_SETTINGS_MAX_BYTES
        )


class ProjectDisplaySettingsService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def get(
        self, project_id: UUID, principal: CurrentPrincipal
    ) -> ProjectDisplaySettingsResponse:
        project = await ProjectService(self.db).get_project_basic(project_id, principal)
        return ProjectDisplaySettingsResponse(
            project_id=project_id,
            version=int(project.display_settings_version or 0),
            settings=dict(project.display_settings or {}),
        )

    async def update(
        self,
        project_id: UUID,
        data: ProjectDisplaySettingsUpdateRequest,
        principal: CurrentPrincipal,
    ) -> ProjectDisplaySettingsResponse:
        service = ProjectService(self.db)
        await service.get_project_for_write(
            project_id,
            principal,
            guard_calculation=False,
        )
        await self.db.execute(
            select(Project)
            .where(Project.id == project_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
        project = await self.db.get(Project, project_id)
        assert project is not None  # get_project_for_write уже проверил существование

        canonical = canonicalize_display_settings(data.settings)
        ensure_display_settings_size(canonical)

        current_version = int(project.display_settings_version or 0)
        if data.expected_version != current_version:
            raise ProjectDisplaySettingsConflictError(
                expected_version=data.expected_version,
                current_version=current_version,
            )

        if project.display_settings == canonical:
            # Идемпотентный PUT: канонический payload не изменился — версия не растёт.
            await self.db.commit()
            return ProjectDisplaySettingsResponse(
                project_id=project_id,
                version=current_version,
                settings=canonical,
            )

        project.display_settings = canonical
        project.display_settings_version = current_version + 1
        # Кейс §4.4/§4.6: изменение проектных настроек двигает «Последнее изменение».
        await service.touch_project(project_id)
        await self.db.commit()
        return ProjectDisplaySettingsResponse(
            project_id=project_id,
            version=current_version + 1,
            settings=canonical,
        )
