from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.schemas.calculation import ElectricalRequest
from app.services import calculation_service as calculation_service_module
from app.services.calculation_service import CalculationService
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.electrical_input_resolver import (
    ELECTRICAL_NOMINAL_VOLTAGE_FORCED_230,
    ElectricalInputResolutionError,
    ElectricalInputResolver,
)


def _object():
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        object_type="pipe",
        version=7,
        is_valid=True,
        params={
            "process_temperature": 80.0,
            "outer_diameter": 0.108,
        },
        results={
            "heat_loss_per_meter_base": 20.0,
            "effective_length": 200.0,
            "safety_factor_applied": 1.1,
        },
    )


def _service_with_sources(obj, *, project_current=13.065, assignment_current=None):
    service = CalculationService(AsyncMock())
    variant_id = uuid4()
    service._tt_project_settings_cache[obj.project_id] = SimpleNamespace(
        max_section_start_current_a=project_current,
        version=3,
    )
    service._tt_assignment_cache[(obj.project_id, variant_id, obj.id)] = SimpleNamespace(
        max_section_start_current_a=assignment_current,
        version=5,
    )
    service._tt_calculation_catalogs_cache = {
        kind: ElectricalCatalogService._static_calculation_fallback(kind)
        for kind in ("power", "section", "bom")
    }
    return service, variant_id


@pytest.mark.asyncio
async def test_dev_mocked_frontend_inputs_run_one_canonical_tt_pipeline(monkeypatch):
    obj = _object()
    service, variant_id = _service_with_sources(obj)
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="test"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {}, "cable_source": "builtin"},
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )
    cable_mark, result = service._calculate_electrical_result(request)

    assert cable_mark == "30ТТВ2-СР"
    assert result["voltage"] == 230
    assert result["section_count"] > 0
    assert result["cable_length"] == result["section_l_fact_m"]
    assert result["order_cable_length"] == result["layout"]["required_order_length_m"]
    assert result["input_sources"]["max_section_start_current_a"] == "project_setting"
    assert result["input_sources"]["product_temperature_c"] == "object_heat"
    assert result["production_eligible"] is False
    assert "maintain_temperature_c" in result["mocked_fields"]
    assert request.data["supply_voltage"] == 230
    assert "_tt_pipeline_result" not in request.data


@pytest.mark.asyncio
async def test_assignment_and_explicit_current_precedence(monkeypatch):
    obj = _object()
    service, variant_id = _service_with_sources(
        obj,
        project_current=13.065,
        assignment_current=20.0,
    )
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="dev"),
    )
    assignment_request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {}},
    )
    await service._prepare_self_regulating_tt_request(
        assignment_request,
        obj,
        electrical_variant_id=variant_id,
    )
    assignment_result = assignment_request.data["_tt_pipeline_result"]
    assert assignment_result["input_sources"]["max_section_start_current_a"] == (
        "assignment_override"
    )
    assert assignment_result["resolved_inputs"]["max_section_start_current_a"] == "20.0"

    explicit_request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "max_start_current_per_section": 30.0,
                "supply_voltage": 220,
            }
        },
    )
    await service._prepare_self_regulating_tt_request(
        explicit_request,
        obj,
        electrical_variant_id=variant_id,
    )
    explicit_result = explicit_request.data["_tt_pipeline_result"]
    assert explicit_result["input_sources"]["max_section_start_current_a"] == ("explicit_request")
    assert explicit_result["resolved_inputs"]["max_section_start_current_a"] == "30.0"
    assert explicit_result["voltage"] == 230
    assert ELECTRICAL_NOMINAL_VOLTAGE_FORCED_230 in explicit_result["warnings"]


@pytest.mark.asyncio
async def test_strict_tt_pipeline_fails_closed_without_current_limit(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
            "winding_pitch": None,
            "number_of_threads": None,
        }
    )
    service, variant_id = _service_with_sources(
        obj,
        project_current=None,
        assignment_current=None,
    )
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="off"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "vapor_temperature": None,
                "cable_mark": None,
                "selection_policy": "technical_minimum",
            }
        },
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "SECTION_CURRENT_LIMIT_REQUIRED"


@pytest.mark.asyncio
async def test_production_rejects_provisional_power_catalog(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
        }
    )
    service, variant_id = _service_with_sources(obj)
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="off"),
    )
    monkeypatch.setattr(calculation_service_module.app_settings, "APP_ENV", "production")
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "vapor_temperature": None,
                "winding_pitch": None,
                "number_of_threads": None,
                "cable_mark": None,
                "selection_policy": "technical_minimum",
            }
        },
    )

    with pytest.raises(ElectricalFormulaError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED"
    assert raised.value.details["status"] == "draft"


@pytest.mark.asyncio
async def test_tt_pipeline_rejects_stale_heat_before_resolution(monkeypatch):
    obj = _object()
    obj.results["stale"] = True
    service, variant_id = _service_with_sources(obj)
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="test"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {}},
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_HEAT_LOSS_REQUIRED"


@pytest.mark.asyncio
async def test_production_rejects_mocked_inputs_before_catalog_use(monkeypatch):
    obj = _object()
    service, variant_id = _service_with_sources(obj)
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="test"),
    )
    monkeypatch.setattr(calculation_service_module.app_settings, "APP_ENV", "production")
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {}},
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_MOCK_INPUTS_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_tt_error_provenance_records_missing_catalogs_once(monkeypatch):
    service = CalculationService(AsyncMock())
    service._tt_calculation_catalogs_error = ElectricalFormulaError(
        "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
        "missing active catalogs",
        status_code=503,
    )
    metadata = AsyncMock(return_value=SimpleNamespace(catalogs=[]))
    monkeypatch.setattr(ElectricalCatalogService, "metadata", metadata)

    first = await service._tt_error_provenance()
    second = await service._tt_error_provenance()

    assert first == second
    assert first["voltage"] == first["normalized_voltage_v"] == 230
    assert first["provenance"]["formula_version"] == "electrical-tt-v2"
    assert set(first["catalogs"]) == {"power", "section", "bom"}
    assert {item["status"] for item in first["catalogs"].values()} == {"missing"}
    metadata.assert_awaited_once()
