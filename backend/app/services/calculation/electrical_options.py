"""Manual TT cable-option listing use case."""

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.tt_cable_options import (
    build_tt_cable_options,
    extract_tt_catalog_rows,
)
from app.models.project_object import ProjectObject
from app.services.calculation.electrical_tt_context import ElectricalTTContext
from app.services.calculation.electrical_tt_inputs import ElectricalInputMapper
from app.services.calculation_errors import CalculationError
from app.services.electrical_input_resolver import ElectricalInputResolutionError


class ElectricalCableOptionsService:
    """List eligible TT models using the same context as calculation."""

    def __init__(
        self,
        db: AsyncSession,
        context: ElectricalTTContext,
        inputs: ElectricalInputMapper,
    ) -> None:
        self.db = db
        self.context = context
        self.inputs = inputs

    def temperatures(
        self,
        obj: ProjectObject,
        assignment_overrides: dict[str, Any] | None = None,
    ) -> tuple[float, float]:
        object_heat = self.inputs._tt_object_heat_inputs(obj, {}, assignment_overrides or {})

        product = self.inputs._num(object_heat.get("product_temperature_c"))
        if product is None:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_REQUIRED",
                "Для списка моделей требуется температура продукта (T1)",
                details={"field": "product_temperature_c", "object_id": str(obj.id)},
            )

        ambient = self.inputs._num(object_heat.get("ambient_temperature_c"))
        if ambient is None:
            raise ElectricalInputResolutionError(
                "ELECTRICAL_INPUT_REQUIRED",
                "Для списка моделей требуется температура окружающей среды",
                details={"field": "ambient_temperature_c", "object_id": str(obj.id)},
            )
        return product, ambient

    async def get(
        self,
        object_id: UUID,
        *,
        electrical_variant_id: UUID | None = None,
    ) -> list[dict[str, Any]]:
        obj_result = await self.db.execute(
            select(ProjectObject).where(ProjectObject.id == object_id)
        )
        obj = obj_result.scalar_one_or_none()
        if obj is None:
            raise CalculationError("Объект не найден")
        if not obj.is_valid or not obj.results or obj.results.get("stale"):
            raise ElectricalInputResolutionError(
                "ELECTRICAL_HEAT_LOSS_REQUIRED",
                "Для списка моделей требуются актуальные теплопотери объекта",
                details={"object_id": str(obj.id)},
            )

        assignment = await self.context._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        assignment_overrides = (
            dict(getattr(assignment, "electrical_overrides", {}) or {})
            if assignment is not None
            else {}
        )
        product_c, ambient_c = self.temperatures(obj, assignment_overrides)

        catalogs = await self.context._tt_calculation_catalogs()
        power_catalog = catalogs.get("power") or {}
        rows, meta = extract_tt_catalog_rows(power_catalog, "power")
        section_rows, _section_meta = extract_tt_catalog_rows(
            catalogs.get("section") or {}, "section"
        )
        bom_rows, _bom_meta = extract_tt_catalog_rows(catalogs.get("bom") or {}, "bom")
        if not rows or not section_rows or not bom_rows:
            raise ElectricalFormulaError(
                "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
                "Активный набор каталогов не содержит данных для выбора кабеля",
                details={
                    "missing_catalog_kinds": [
                        kind
                        for kind, values in (
                            ("power", rows),
                            ("section", section_rows),
                            ("bom", bom_rows),
                        )
                        if not values
                    ]
                },
                status_code=503,
            )

        options = build_tt_cable_options(
            rows,
            product_temperature_c=product_c,
            ambient_temperature_c=ambient_c,
            section_catalog_rows=section_rows,
            bom_catalog_rows=bom_rows,
            catalog_meta=meta,
            strict_provisional=bool(app_settings.is_production),
        )
        for option in options:
            option["object_product_temperature_c"] = product_c
            option["object_ambient_temperature_c"] = ambient_c
        return options
