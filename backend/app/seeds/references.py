"""Synchronize bundled reference data with its database projection."""

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import cache
from app.models.insulation_material import InsulationMaterial
from app.reference_data.loader import list_insulation_materials

logger = logging.getLogger("seeds")
_MANAGED_SOURCES = {None, "builtin_json", "seed", "demo_seed", "test"}


def insulation_seed_row(entry: dict[str, object]) -> dict[str, object]:
    column_keys = {
        "material",
        "name",
        "conductivity",
        "density_kg_m3",
        "temperature_range",
        "conductivity_20_plus",
        "conductivity_19_minus",
        "selectable",
        "deprecated",
        "requires_material_reselection",
        "material_family",
        "reselection_message",
        "source",
    }
    params = {key: value for key, value in entry.items() if key not in column_keys}
    return {
        "material": str(entry["material"]),
        "name": str(entry["name"]),
        "conductivity": entry.get("conductivity"),
        "density_kg_m3": entry.get("density_kg_m3"),
        "temperature_range": entry.get("temperature_range"),
        "conductivity_20_plus": entry.get("conductivity_20_plus"),
        "conductivity_19_minus": entry.get("conductivity_19_minus"),
        "selectable": entry.get("selectable") is not False,
        "deprecated": entry.get("deprecated") is True,
        "requires_material_reselection": entry.get("requires_material_reselection") is True,
        "material_family": entry.get("material_family"),
        "reselection_message": entry.get("reselection_message"),
        "source": entry.get("source"),
        "data_source": "builtin_json",
        "params": params,
        "is_active": True,
    }


async def seed_insulation_materials(db: AsyncSession) -> None:
    current_materials: set[str] = set()
    for entry in list_insulation_materials():
        data = insulation_seed_row(entry)
        material = str(data["material"])
        current_materials.add(material)
        result = await db.execute(
            select(InsulationMaterial).where(InsulationMaterial.material == material)
        )
        existing = result.scalar_one_or_none()
        if existing is None:
            db.add(InsulationMaterial(**data))
            logger.info("  + insulation material %s", material)
            continue
        if existing.data_source not in _MANAGED_SOURCES:
            logger.info(
                "  ~ keep insulation material %s from source=%s", material, existing.data_source
            )
            continue
        for key, value in data.items():
            setattr(existing, key, value)
        logger.info("  ~ insulation material %s", material)

    result = await db.execute(
        select(InsulationMaterial).where(InsulationMaterial.data_source == "builtin_json")
    )
    for existing in result.scalars().all():
        if existing.material not in current_materials and existing.is_active:
            existing.is_active = False
            logger.info("  - deactivate insulation material %s", existing.material)

    await db.flush()
    await cache.ainvalidate("references:insulation")
    await cache.ainvalidate("references:internal")
