"""Endpoints справочников."""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.core.database import get_db
from app.core.dependencies import (
    CurrentPrincipal,
    require_any,
    require_employee,
)
from app.models.accessory import AccessoryExtended
from app.models.cable import CableExtended
from app.reference_data.loader import (
    list_basic_accessories,
    list_climate_cities,
    list_insulation_materials,
    list_tlt_cables,
)

# TTL для статичных JSON-справочников: 24 часа (изменения = пересборка образа).
_BUILTIN_TTL = 24 * 3600
# TTL для расширенных каталогов из БД: 5 минут (админ-CRUD инвалидирует ключ).
_EXTENDED_TTL = 5 * 60

router = APIRouter()


@router.get("/climate", summary="Справочник климата (536 городов РФ)")
@cache.cached("references:climate", ttl=_BUILTIN_TTL)
async def climate(_: CurrentPrincipal = Depends(require_any())):
    return list_climate_cities()


@router.get("/insulation", summary="Справочник теплоизоляции")
@cache.cached("references:insulation", ttl=_BUILTIN_TTL)
async def insulation(_: CurrentPrincipal = Depends(require_any())):
    return list_insulation_materials()


@router.get(
    "/cables",
    summary="Кабели. source=builtin|extended|all — для сотрудника",
)
async def cables(
    source: Literal["builtin", "extended", "all"] = "builtin",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if source != "builtin" and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Расширенный каталог доступен только сотрудникам",
        )
    builtin = [{**c, "source": "builtin"} for c in list_tlt_cables()]
    if source == "builtin":
        return builtin
    result = await db.execute(select(CableExtended).where(CableExtended.is_active.is_(True)))
    extended = [
        {
            "id": str(c.id),
            "source": "extended",
            "cable_type": c.cable_type,
            "brand": c.brand,
            "model": c.model,
            "power_per_meter": c.power_per_meter,
            "max_temperature": c.max_temperature,
            "min_temperature": c.min_temperature,
            "resistance_per_meter": c.resistance_per_meter,
        }
        for c in result.scalars().all()
    ]
    if source == "extended":
        return extended
    return builtin + extended


@router.get(
    "/cables/extended",
    summary="Расширенный каталог кабелей (только сотрудник)",
)
async def cables_extended(
    _: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CableExtended).where(CableExtended.is_active.is_(True)))
    return [
        {
            "id": str(c.id),
            "cable_type": c.cable_type,
            "brand": c.brand,
            "model": c.model,
            "power_per_meter": c.power_per_meter,
            "max_temperature": c.max_temperature,
            "min_temperature": c.min_temperature,
            "resistance_per_meter": c.resistance_per_meter,
        }
        for c in result.scalars().all()
    ]


@router.get("/accessories", summary="Базовые аксессуары")
async def accessories(_: CurrentPrincipal = Depends(require_any())):
    return list_basic_accessories()


@router.get(
    "/accessories/extended",
    summary="Расширенные аксессуары (только сотрудник)",
)
async def accessories_extended(
    _: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AccessoryExtended).where(AccessoryExtended.is_active.is_(True))
    )
    return [
        {
            "id": str(a.id),
            "category": a.category,
            "name": a.name,
            "article": a.article,
        }
        for a in result.scalars().all()
    ]
