"""Endpoints пользовательских UI-настроек."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_employee
from app.models.user_preference import UserPreference
from app.schemas.user_preference import UserPreferenceResponse, UserPreferenceUpdate

router = APIRouter()

PreferenceKey = Annotated[
    str,
    Path(min_length=1, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$"),
]


@router.get(
    "/{key}",
    response_model=UserPreferenceResponse,
    summary="Получить UI-настройку текущего пользователя",
)
async def get_preference(
    key: PreferenceKey,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceResponse:
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == principal.user_id,
            UserPreference.key == key,
        )
    )
    preference = result.scalar_one_or_none()
    if preference is None:
        return UserPreferenceResponse(key=key, value=None, user_id=principal.user_id)
    return UserPreferenceResponse.model_validate(preference)


@router.put(
    "/{key}",
    response_model=UserPreferenceResponse,
    summary="Сохранить UI-настройку текущего пользователя",
)
async def update_preference(
    key: PreferenceKey,
    data: UserPreferenceUpdate,
    principal: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceResponse:
    result = await db.execute(
        select(UserPreference).where(
            UserPreference.user_id == principal.user_id,
            UserPreference.key == key,
        )
    )
    preference = result.scalar_one_or_none()
    if preference is None:
        preference = UserPreference(user_id=principal.user_id, key=key, value=data.value)
        db.add(preference)
    else:
        preference.value = data.value
    await db.commit()
    await db.refresh(preference)
    return UserPreferenceResponse.model_validate(preference)
