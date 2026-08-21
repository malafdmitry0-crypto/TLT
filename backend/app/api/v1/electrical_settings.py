"""Project electrical settings endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.schemas.project_electrical_settings import (
    ProjectElectricalSettingsPatch,
    ProjectElectricalSettingsResponse,
)
from app.services.project_electrical_settings_service import (
    ProjectElectricalSettingsConflictError,
    ProjectElectricalSettingsService,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError

router = APIRouter()
_require_any = require_any()


@router.get(
    "/{project_id}/electrical-settings",
    response_model=ProjectElectricalSettingsResponse,
    summary="Get project electrical settings",
)
async def get_project_electrical_settings(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ProjectElectricalSettings:
    try:
        return await ProjectElectricalSettingsService(db).get(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.patch(
    "/{project_id}/electrical-settings",
    response_model=ProjectElectricalSettingsResponse,
    summary="Update project electrical settings",
)
async def patch_project_electrical_settings(
    project_id: UUID,
    data: ProjectElectricalSettingsPatch,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ProjectElectricalSettings:
    try:
        return await ProjectElectricalSettingsService(db).patch(project_id, data, principal)
    except ProjectElectricalSettingsConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ELECTRICAL_SETTINGS_VERSION_CONFLICT",
                "message": str(exc),
                "issues": [],
                "details": {
                    "expected_version": exc.expected_version,
                    "current_version": exc.current_version,
                },
            },
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
