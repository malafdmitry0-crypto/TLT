from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.services.calculation_service import CalculationService
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.electrical_input_resolver import ElectricalInputResolutionError


def _object(*, params: dict) -> SimpleNamespace:
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
    db.execute = AsyncMock(return_value=object_result)
    service = CalculationService(db)
    service._tt_calculation_catalogs_cache = {
        kind: ElectricalCatalogService._static_calculation_fallback(kind)
        for kind in ("power", "section", "bom")
    }
    return service


def _eligible(options: list[dict], series: str) -> dict:
    return next(option for option in options if option["eligible"] and option["series"] == series)


def _expected_power(option: dict, maintain_temperature_c: str) -> float:
    return float(
        Decimal(str(option["q1"])) * Decimal(maintain_temperature_c)
        + Decimal(str(option["q2"]))
    )


@pytest.mark.parametrize(
    ("params", "missing_field"),
    [
        (
            {"process_temperature": 50.0, "aggressive_product": False},
            "maintain_temperature_c",
        ),
        (
            {"process_temperature": 50.0, "maintain_temperature": 10.0},
            "aggressive_product",
        ),
    ],
)
async def test_options_fail_closed_without_required_t3_or_r(params, missing_field):
    obj = _object(params=params)

    with pytest.raises(ElectricalInputResolutionError) as exc:
        await _service(obj).get_cable_options(obj.id)

    assert exc.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert exc.value.details["field"] == missing_field


async def test_exact_er_assignment_t2_t3_and_r_drive_options():
    obj = _object(
        params={
            "process_temperature": 50.0,
            "steam_tracing": "yes",
            "vapor_temperature": 100.0,
            "maintain_temperature": 10.0,
            "aggressive_product": False,
        }
    )
    variant_id = uuid4()
    service = _service(obj)
    service._tt_assignment_cache[(obj.project_id, variant_id, obj.id)] = SimpleNamespace(
        electrical_overrides={
            "steam_temperature_c": 80.0,
            "maintain_temperature_c": 40.0,
            "aggressive_product": True,
        }
    )

    options = await service.get_cable_options(
        obj.id,
        electrical_variant_id=variant_id,
    )

    assert {option["required_series"] for option in options} == {"ТТН"}
    option = _eligible(options, "ТТН")
    assert option["full_mark_preview"].endswith("-СР")
    assert option["power_at_t3_w_per_m"] == pytest.approx(_expected_power(option, "40"))


async def test_assignment_from_another_er_is_isolated():
    obj = _object(
        params={
            "process_temperature": 50.0,
            "steam_tracing": "yes",
            "vapor_temperature": 80.0,
            "maintain_temperature": 10.0,
            "aggressive_product": False,
        }
    )
    requested_variant_id = uuid4()
    other_variant_id = uuid4()
    service = _service(obj)
    service._tt_assignment_cache[(obj.project_id, requested_variant_id, obj.id)] = None
    service._tt_assignment_cache[(obj.project_id, other_variant_id, obj.id)] = SimpleNamespace(
        electrical_overrides={
            "steam_temperature_c": 100.0,
            "maintain_temperature_c": 40.0,
            "aggressive_product": True,
        }
    )

    requested_options = await service.get_cable_options(
        obj.id,
        electrical_variant_id=requested_variant_id,
    )
    other_options = await service.get_cable_options(
        obj.id,
        electrical_variant_id=other_variant_id,
    )

    assert {option["required_series"] for option in requested_options} == {"ТТН"}
    requested = _eligible(requested_options, "ТТН")
    assert requested["full_mark_preview"].endswith("-СТ")
    assert requested["power_at_t3_w_per_m"] == pytest.approx(
        _expected_power(requested, "10")
    )
    assert {option["required_series"] for option in other_options} == {"ТТВ"}


async def test_steam_tracing_no_ignores_stale_assignment_t2():
    obj = _object(
        params={
            "process_temperature": 50.0,
            "steam_tracing": "no",
            "maintain_temperature": 10.0,
            "aggressive_product": False,
        }
    )
    variant_id = uuid4()
    service = _service(obj)
    service._tt_assignment_cache[(obj.project_id, variant_id, obj.id)] = SimpleNamespace(
        electrical_overrides={"steam_temperature_c": 300.0}
    )

    options = await service.get_cable_options(
        obj.id,
        electrical_variant_id=variant_id,
    )

    assert {option["required_series"] for option in options} == {"ТТН"}


async def test_steam_tracing_yes_requires_final_t2():
    obj = _object(
        params={
            "process_temperature": 50.0,
            "steam_tracing": "yes",
            "vapor_temperature": 80.0,
            "maintain_temperature": 10.0,
            "aggressive_product": False,
        }
    )
    variant_id = uuid4()
    service = _service(obj)
    service._tt_assignment_cache[(obj.project_id, variant_id, obj.id)] = SimpleNamespace(
        electrical_overrides={"steam_temperature_c": None}
    )

    with pytest.raises(ElectricalInputResolutionError) as exc:
        await service.get_cable_options(
            obj.id,
            electrical_variant_id=variant_id,
        )

    assert exc.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert exc.value.details["field"] == "steam_temperature_c"
