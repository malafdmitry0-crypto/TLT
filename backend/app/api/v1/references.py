"""Endpoints справочников."""

import hashlib
import json
import re
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response
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
from app.models.insulation_material import InsulationMaterial
from app.reference_data.loader import (
    list_basic_accessories,
    list_climate_cities,
    list_insulation_materials,
    list_pipe_materials,
    list_resistive_cables,
    list_soil_conductivity,
    list_tlt_cables,
    list_tt_cables,
)
from app.services.calculation_service import (
    RESISTIVE_DEFAULT_MAX_TEMPERATURE,
    RESISTIVE_DEFAULT_MIN_TEMPERATURE,
    CalculationService,
)

ReferenceCableType = Literal[
    "self_regulating",
    "self_regulating_tt",
    "single_core",
    "three_core",
    "mineral",
    "skin",
]

# TTL для статичных JSON-справочников: 24 часа (изменения = пересборка образа).
_BUILTIN_TTL = 24 * 3600
_HTTP_CACHE_SECONDS = 3600
# TTL для расширенных каталогов из БД: 5 минут (админ-CRUD инвалидирует ключ).
_EXTENDED_TTL = 5 * 60

router = APIRouter()


def _etag(payload: object) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")
    return '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'


_BUILTIN_ETAGS = {
    "climate": _etag(list_climate_cities()),
    "insulation": _etag(list_insulation_materials()),
    "pipe-materials": _etag(list_pipe_materials()),
    "soil-conductivity": _etag(list_soil_conductivity()),
    "resistive-cables": _etag(list_resistive_cables()),
    "tt-cables": _etag(list_tt_cables()),
    "internal": _etag(
        {
            "climate": list_climate_cities(),
            "insulation": list_insulation_materials(),
            "pipe_materials": list_pipe_materials(),
            "soil_conductivity": list_soil_conductivity(),
            "cables": list_tlt_cables(),
            "tt_cables": list_tt_cables(),
            "resistive_cables": list_resistive_cables(),
            "accessories": list_basic_accessories(),
        }
    ),
    "accessories": _etag(list_basic_accessories()),
    "cables:builtin": _etag([{**c, "source": "builtin"} for c in list_tlt_cables()]),
}


def _extended_cable_payload(cable: CableExtended) -> dict[str, object]:
    return {
        "id": str(cable.id),
        "source": "extended",
        "cable_type": cable.cable_type,
        "brand": cable.brand,
        "model": cable.model,
        "power_per_meter": cable.power_per_meter,
        "max_temperature": cable.max_temperature,
        "min_temperature": cable.min_temperature,
        "resistance_per_meter": cable.resistance_per_meter,
        "supplier_name": cable.supplier_name,
        "article": cable.article,
        "currency": cable.currency,
        "price_per_meter": cable.price_per_meter,
        "stock_quantity_m": cable.stock_quantity_m,
        "stock_status": cable.stock_status,
        "lead_time_days": cable.lead_time_days,
        "supplier_priority": cable.supplier_priority,
        "is_preferred": cable.is_preferred,
        "order_multiple_m": cable.order_multiple_m,
        "min_order_quantity_m": cable.min_order_quantity_m,
        "is_discontinued": cable.is_discontinued,
        "replacement_group": cable.replacement_group,
        "price_updated_at": cable.price_updated_at,
        "stock_updated_at": cable.stock_updated_at,
        "commercial_data_source": cable.commercial_data_source,
    }


def _commercial_cable_payload(
    base: dict[str, object], cable: CableExtended | None
) -> dict[str, object]:
    payload = {
        **base,
        "source": "commercial",
        "cable_type": "self_regulating",
        "price_per_meter": None,
        "stock_status": "unknown",
        "lead_time_days": None,
        "supplier_priority": None,
        "is_preferred": False,
        "order_multiple_m": None,
        "min_order_quantity_m": None,
        "is_discontinued": False,
        "commercial_data_source": None,
        "price_updated_at": None,
        "stock_updated_at": None,
    }
    if cable is None:
        return payload
    payload.update(
        {
            "brand": cable.brand or base.get("brand"),
            "price_per_meter": cable.price_per_meter,
            "currency": cable.currency,
            "stock_status": cable.stock_status,
            "lead_time_days": cable.lead_time_days,
            "supplier_priority": cable.supplier_priority,
            "is_preferred": cable.is_preferred,
            "order_multiple_m": cable.order_multiple_m,
            "min_order_quantity_m": cable.min_order_quantity_m,
            "is_discontinued": cable.is_discontinued,
            "article": cable.article,
            "supplier_name": cable.supplier_name,
            "commercial_data_source": cable.commercial_data_source,
            "price_updated_at": cable.price_updated_at,
            "stock_updated_at": cable.stock_updated_at,
        }
    )
    return payload


def _insulation_material_payload(material: InsulationMaterial) -> dict[str, object]:
    payload: dict[str, object] = {
        "material": material.material,
        "name": material.name,
        "selectable": material.selectable,
        "deprecated": material.deprecated,
        "requires_material_reselection": material.requires_material_reselection,
    }
    optional_values: dict[str, object | None] = {
        "conductivity": material.conductivity,
        "density_kg_m3": material.density_kg_m3,
        "temperature_range": material.temperature_range,
        "conductivity_20_plus": material.conductivity_20_plus,
        "conductivity_19_minus": material.conductivity_19_minus,
        "material_family": material.material_family,
        "reselection_message": material.reselection_message,
        "source": material.source,
    }
    for key, value in optional_values.items():
        if value is not None:
            payload[key] = value
    if material.params:
        payload.update(material.params)
    return payload


async def _insulation_catalog(db: AsyncSession) -> list[dict[str, object]]:
    result = await db.execute(
        select(InsulationMaterial)
        .where(InsulationMaterial.is_active.is_(True))
        .order_by(InsulationMaterial.material.asc())
    )
    rows = result.scalars().all()
    if rows:
        return [_insulation_material_payload(row) for row in rows]
    return list_insulation_materials()


async def _commercial_cable_catalog(db: AsyncSession) -> list[dict[str, object]]:
    result = await db.execute(
        select(CableExtended).where(
            CableExtended.is_active.is_(True),
            CableExtended.cable_type == "self_regulating",
        )
    )
    extended_by_model = {c.model: c for c in result.scalars().all()}
    return [
        _commercial_cable_payload(dict(c), extended_by_model.get(str(c.get("model"))))
        for c in list_tlt_cables()
    ]


def _resistive_section_from_model(model: object) -> float | None:
    match = re.search(r"х\s*(\d+(?:[,.]\d+)?)\s*-", str(model))
    if not match:
        return None
    return float(match.group(1).replace(",", "."))


def _resistive_technical_payload(cable: dict[str, object]) -> dict[str, object]:
    payload = dict(cable)
    payload.setdefault("max_temperature", RESISTIVE_DEFAULT_MAX_TEMPERATURE)
    payload.setdefault("min_temperature", RESISTIVE_DEFAULT_MIN_TEMPERATURE)
    resistance = payload.get("resistance_ohm_km")
    resistance_per_meter = payload.get("resistance_per_meter")
    if resistance is None and isinstance(resistance_per_meter, int | float):
        resistance = float(resistance_per_meter) * 1000.0
        payload["resistance_ohm_km"] = resistance

    section = (
        payload.get("conductor_section_mm2")
        or payload.get("conductor_cross_section")
        or _resistive_section_from_model(payload.get("model"))
    )
    if section is not None:
        payload["conductor_section_mm2"] = section

    missing: list[str] = []
    if resistance is None:
        missing.append("resistance_ohm_km")
    if section is None:
        missing.append("conductor_section_mm2")

    payload["technical_data_complete"] = len(missing) == 0
    payload["technical_data_missing"] = missing
    return payload


def _annotate_resistive_catalog(catalog: dict[str, object]) -> dict[str, object]:
    return {
        **catalog,
        "single_core": [
            _resistive_technical_payload(dict(c))
            for c in catalog.get("single_core", [])
            if isinstance(c, dict)
        ],
        "three_core": [
            _resistive_technical_payload(dict(c))
            for c in catalog.get("three_core", [])
            if isinstance(c, dict)
        ],
    }


def _builtin_cables_for_type(cable_type: ReferenceCableType) -> list[dict[str, object]]:
    if cable_type == "self_regulating":
        return [{**c, "source": "builtin", "cable_type": cable_type} for c in list_tlt_cables()]
    if cable_type == "self_regulating_tt":
        return [{**c, "source": "builtin", "cable_type": cable_type} for c in list_tt_cables()]
    if cable_type in ("single_core", "three_core"):
        key = "single_core" if cable_type == "single_core" else "three_core"
        return [
            {
                **_resistive_technical_payload(dict(c)),
                "source": "builtin",
                "cable_type": cable_type,
            }
            for c in list_resistive_cables().get(key, [])
            if isinstance(c, dict)
        ]
    return []


async def _cables_for_type(
    db: AsyncSession,
    source: Literal["builtin", "commercial", "extended", "all"],
    cable_type: ReferenceCableType,
) -> list[dict[str, object]]:
    if source == "builtin":
        return _builtin_cables_for_type(cable_type)

    service = CalculationService(db)
    if cable_type == "self_regulating":
        return await service.load_cable_catalog(source)
    if cable_type in ("single_core", "three_core"):
        rows = await service.load_resistive_cable_catalog(cable_type, source)
        return [_resistive_technical_payload(dict(row)) for row in rows]
    if cable_type == "self_regulating_tt":
        return _builtin_cables_for_type(cable_type) if source == "all" else []

    if source == "commercial":
        return []
    result = await db.execute(
        select(CableExtended).where(
            CableExtended.is_active.is_(True),
            CableExtended.cable_type == cable_type,
        )
    )
    return [_extended_cable_payload(c) for c in result.scalars().all()]


def _builtin_http_cache(name: str):
    def dependency(response: Response) -> None:
        response.headers["Cache-Control"] = f"public, max-age={_HTTP_CACHE_SECONDS}"
        response.headers["ETag"] = _BUILTIN_ETAGS[name]

    return dependency


@router.get("/climate", summary="Справочник климата")
@cache.cached("references:climate", ttl=_BUILTIN_TTL)
async def climate(
    _: CurrentPrincipal = Depends(require_any()),
    _cache_headers: None = Depends(_builtin_http_cache("climate")),
):
    return list_climate_cities()


@router.get("/insulation", summary="Справочник теплоизоляции")
async def insulation(
    response: Response,
    _: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    payload = await _insulation_catalog(db)
    response.headers["Cache-Control"] = f"public, max-age={_HTTP_CACHE_SECONDS}"
    response.headers["ETag"] = _etag(payload)
    return payload


@router.get("/pipe-materials", summary="Справочник материалов трубы и λ(T)")
@cache.cached("references:pipe-materials", ttl=_BUILTIN_TTL)
async def pipe_materials(
    _: CurrentPrincipal = Depends(require_any()),
    _cache_headers: None = Depends(_builtin_http_cache("pipe-materials")),
):
    return list_pipe_materials()


@router.get("/soil-conductivity", summary="Справочник теплопроводности грунтов")
@cache.cached("references:soil-conductivity", ttl=_BUILTIN_TTL)
async def soil_conductivity(
    _: CurrentPrincipal = Depends(require_any()),
    _cache_headers: None = Depends(_builtin_http_cache("soil-conductivity")),
):
    return list_soil_conductivity()


@router.get("/resistive-cables", summary="Справочник резистивных кабелей ТТ Р1/ТТ Р3")
async def resistive_cables(
    response: Response,
    source: Literal["builtin", "commercial", "extended", "all"] = "builtin",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Расширенный каталог доступен только сотрудникам",
        )
    if source == "builtin":
        response.headers["Cache-Control"] = f"public, max-age={_HTTP_CACHE_SECONDS}"
        response.headers["ETag"] = _BUILTIN_ETAGS["resistive-cables"]
        return _annotate_resistive_catalog(list_resistive_cables())

    service = CalculationService(db)
    return _annotate_resistive_catalog(
        {
            "single_core": await service.load_resistive_cable_catalog("single_core", source),
            "three_core": await service.load_resistive_cable_catalog("three_core", source),
            "common": list_resistive_cables().get("common", {}),
        }
    )


@router.get("/tt-cables", summary="Справочник саморегулирующихся кабелей ТТН/ТТВ/ТТХ")
@cache.cached("references:tt-cables", ttl=_BUILTIN_TTL)
async def tt_cables(
    _: CurrentPrincipal = Depends(require_any()),
    _cache_headers: None = Depends(_builtin_http_cache("tt-cables")),
):
    return list_tt_cables()


@router.get("/internal", summary="Все встроенные внутренние справочники")
async def internal_references(
    response: Response,
    _: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    payload = {
        "climate": list_climate_cities(),
        "insulation": await _insulation_catalog(db),
        "pipe_materials": list_pipe_materials(),
        "soil_conductivity": list_soil_conductivity(),
        "cables": list_tlt_cables(),
        "tt_cables": list_tt_cables(),
        "resistive_cables": list_resistive_cables(),
        "accessories": list_basic_accessories(),
    }
    response.headers["Cache-Control"] = f"public, max-age={_HTTP_CACHE_SECONDS}"
    response.headers["ETag"] = _etag(payload)
    return payload


@router.get(
    "/cables",
    summary="Кабели выбранного типа. source=builtin|commercial|extended|all",
)
async def cables(
    response: Response,
    source: Literal["builtin", "commercial", "extended", "all"] = "builtin",
    cable_type: ReferenceCableType = "self_regulating",
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    if source in ("extended", "all") and principal.role not in ("employee", "admin"):
        raise HTTPException(
            status_code=403,
            detail="Расширенный каталог доступен только сотрудникам",
        )
    if source == "builtin":
        builtin = _builtin_cables_for_type(cable_type)
        response.headers["Cache-Control"] = f"public, max-age={_HTTP_CACHE_SECONDS}"
        response.headers["ETag"] = _etag(builtin)
        return builtin
    return await _cables_for_type(db, source, cable_type)


@router.get(
    "/cables/commercial",
    summary="Публичная commercial projection кабелей для всех ролей",
)
async def cables_commercial(
    _: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
):
    return await _commercial_cable_catalog(db)


@router.get(
    "/cables/extended",
    summary="Расширенный каталог кабелей (только сотрудник)",
)
async def cables_extended(
    _: CurrentPrincipal = Depends(require_employee()),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(CableExtended).where(CableExtended.is_active.is_(True)))
    return [_extended_cable_payload(c) for c in result.scalars().all()]


@router.get("/accessories", summary="Базовые аксессуары")
async def accessories(
    _: CurrentPrincipal = Depends(require_any()),
    _cache_headers: None = Depends(_builtin_http_cache("accessories")),
):
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
