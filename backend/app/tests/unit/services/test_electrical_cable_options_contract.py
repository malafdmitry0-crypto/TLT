"""Case 1 service-path tests for manual TT cable options."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.calculation_service import CalculationService
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.electrical_input_resolver import ElectricalInputResolutionError


def _object(*, ambient: float | None = -20) -> SimpleNamespace:
    params = {
        "process_temperature": 65.0,
        "min_switch_temperature": -30.0,
        "outer_diameter": 0.108,
    }
    if ambient is not None:
        params["ambient_temperature"] = ambient
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        object_type="pipe",
        version=1,
        is_valid=True,
        params=params,
        results={
            "heat_loss_per_meter_base": 20.0,
            "effective_length": 50.0,
            "safety_factor_applied": 1.1,
        },
    )


def _service(obj: SimpleNamespace) -> CalculationService:
    db = AsyncMock()
    object_result = MagicMock()
    object_result.scalar_one_or_none.return_value = obj
    db.execute.return_value = object_result
    service = CalculationService(db)
    service._tt_context._tt_calculation_catalogs_cache = {
        kind: ElectricalCatalogService._static_calculation_fallback(kind)
        for kind in ("power", "section", "bom")
    }
    return service


async def test_service_options_expose_exact_bom_marks_and_case1_metadata() -> None:
    obj = _object()
    options = await _service(obj).get_cable_options(obj.id)

    eligible = [option for option in options if option["eligible"]]
    assert eligible
    assert all(option["model"].endswith(("-СР", "-СТ")) for option in eligible)
    assert all(option["nomenclature_code"] for option in eligible)
    assert all(option["passport_power_w_per_m"] > 0 for option in eligible)
    assert all(option["max_product_temperature_c"] >= 65 for option in eligible)
    assert all("power_at_t3_w_per_m" not in option for option in eligible)


async def test_voltage_override_in_an_exact_er_does_not_change_candidate_options() -> None:
    obj = _object()
    first_variant = uuid4()
    second_variant = uuid4()
    service = _service(obj)
    service._tt_context._tt_assignment_cache[(obj.project_id, first_variant, obj.id)] = (
        SimpleNamespace(electrical_overrides={"supply_voltage_v": 230})
    )
    service._tt_context._tt_assignment_cache[(obj.project_id, second_variant, obj.id)] = (
        SimpleNamespace(electrical_overrides={"supply_voltage_v": 380})
    )

    at_230 = await service.get_cable_options(obj.id, electrical_variant_id=first_variant)
    at_380 = await service.get_cable_options(obj.id, electrical_variant_id=second_variant)

    assert at_230 == at_380


async def test_options_fail_closed_without_ambient_temperature() -> None:
    obj = _object(ambient=None)

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await _service(obj).get_cable_options(obj.id)

    assert raised.value.details["field"] == "ambient_temperature_c"
