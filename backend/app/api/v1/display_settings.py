"""Project display settings endpoints (кейс §5.9 / §5.11)."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.schemas.project_display_settings import (
    ProjectDisplaySettingsResponse,
    ProjectDisplaySettingsUpdateRequest,
)
from app.services.project_display_settings_service import (
    ProjectDisplaySettingsConflictError,
    ProjectDisplaySettingsService,
    ProjectDisplaySettingsTooLargeError,
)
from app.services.project_service import ProjectAccessError, ProjectNotFoundError

router = APIRouter()
_require_any = require_any()


@router.get(
    "/{project_id}/display-settings",
    response_model=ProjectDisplaySettingsResponse,
    summary="Get project display settings",
)
async def get_project_display_settings(
    project_id: UUID,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ProjectDisplaySettingsResponse:
    try:
        return await ProjectDisplaySettingsService(db).get(project_id, principal)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc


@router.put(
    "/{project_id}/display-settings",
    response_model=ProjectDisplaySettingsResponse,
    summary="Update project display settings (optimistic version)",
)
async def update_project_display_settings(
    project_id: UUID,
    data: ProjectDisplaySettingsUpdateRequest,
    principal: CurrentPrincipal = Depends(_require_any),
    db: AsyncSession = Depends(get_db),
) -> ProjectDisplaySettingsResponse:
    try:
        return await ProjectDisplaySettingsService(db).update(project_id, data, principal)
    except ProjectDisplaySettingsConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "PROJECT_DISPLAY_SETTINGS_VERSION_CONFLICT",
                "message": str(exc),
                "details": {
                    "expected_version": exc.expected_version,
                    "current_version": exc.current_version,
                },
            },
        ) from exc
    except ProjectDisplaySettingsTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail={
                "code": "PROJECT_DISPLAY_SETTINGS_TOO_LARGE",
                "message": str(exc),
                "details": {
                    "size_bytes": exc.size_bytes,
                    "limit_bytes": exc.limit_bytes,
                },
            },
        ) from exc
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ProjectAccessError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
