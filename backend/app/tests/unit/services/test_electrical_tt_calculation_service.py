import math
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


def _tank_object(shape: str = "cylindrical"):
    dimensions = (
        {"diameter": 2.0, "height": 9.0}
        if shape != "rectangular"
        else {"length": 4.0, "width": 3.0, "height": 9.0}
    )
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        object_type="tank",
        version=4,
        is_valid=True,
        params={
            "shape": shape,
            **dimensions,
            "process_temperature": 80.0,
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
        },
        results={
            "total_heat_loss_base": 1000.0,
            "total_heat_loss_design": 1300.0,
            "q_additional_applied": 100.0,
            "safety_factor_applied": 1.2,
        },
    )


def _service_with_sources(
    obj,
    *,
    project_current=13.065,
    assignment_current=None,
    assignment_overrides=None,
):
    service = CalculationService(AsyncMock())
    variant_id = uuid4()
    service._tt_project_settings_cache[obj.project_id] = SimpleNamespace(
        max_section_start_current_a=project_current,
        version=3,
    )
    service._tt_assignment_cache[(obj.project_id, variant_id, obj.id)] = SimpleNamespace(
        id=uuid4(),
        max_section_start_current_a=assignment_current,
        electrical_overrides=dict(assignment_overrides or {}),
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
    assert "supply_voltage" not in request.data
    assert "nominal_voltage_v" not in result["resolved_inputs"]
    assert result["provenance"]["system_voltage_v"] == 230
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
    assert "nominal_voltage_v" not in explicit_result["resolved_inputs"]
    assert not any("VOLTAGE" in warning for warning in explicit_result["warnings"])


@pytest.mark.asyncio
async def test_strict_tt_pipeline_requires_t3_without_product_fallback(monkeypatch):
    obj = _object()
    obj.params.update(
        {
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
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {"selection_policy": "technical_minimum"}},
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert raised.value.details == {"field": "maintain_temperature_c"}


@pytest.mark.asyncio
async def test_steam_tracing_no_ignores_stale_object_and_request_t2(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
            "steam_tracing": "no",
            "vapor_temperature": 240.0,
        }
    )
    service, variant_id = _service_with_sources(
        obj,
        assignment_overrides={"steam_temperature_c": 200.0},
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
                "vapor_temperature": 210.0,
                "selection_policy": "technical_minimum",
            }
        },
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )

    result = request.data["_tt_pipeline_result"]
    assert result["resolved_inputs"]["steam_temperature_c"] is None
    assert result["input_sources"]["steam_temperature_c"] == "object_heat"
    assert result["provenance"]["heat_snapshot"]["steam_tracing"] is False
    assert "steam_temperature_c" not in result["provenance"]["assignment_snapshot"][
        "applied_fields"
    ]


@pytest.mark.asyncio
async def test_steam_tracing_yes_requires_effective_t2(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
            "steam_tracing": "yes",
        }
    )
    service, variant_id = _service_with_sources(obj)
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="off"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {"selection_policy": "technical_minimum"}},
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert raised.value.details == {"field": "steam_temperature_c"}


@pytest.mark.asyncio
async def test_steam_tracing_yes_empty_override_falls_back_to_object_t2(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
            "steam_tracing": "yes",
            "vapor_temperature": 90.0,
        }
    )
    service, variant_id = _service_with_sources(obj)
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
                "selection_policy": "technical_minimum",
            }
        },
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )

    result = request.data["_tt_pipeline_result"]
    assert result["resolved_inputs"]["steam_temperature_c"] == "90.0"
    assert result["input_sources"]["steam_temperature_c"] == "object_heat"


@pytest.mark.asyncio
async def test_assignment_canonical_tt_overrides_reach_resolver(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "process_temperature": 20.0,
            "maintain_temperature": 5.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
            "steam_tracing": "yes",
            "vapor_temperature": 70.0,
        }
    )
    assignment_overrides = {
        "steam_temperature_c": "80.0",
        "maintain_temperature_c": "10.0",
        "aggressive_product": True,
        "winding_pitch_mm": "400.0",
        "thread_count": 2,
        "manual_cable_model": "31ТТН2",
    }
    service, variant_id = _service_with_sources(
        obj,
        assignment_overrides=assignment_overrides,
    )
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="off"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {"selection_policy": "technical_minimum"}},
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )

    result = request.data["_tt_pipeline_result"]
    expected_values = {
        "steam_temperature_c": "80.0",
        "maintain_temperature_c": "10.0",
        "aggressive_product": True,
        "winding_pitch_mm": "400.0",
        "thread_count": 2,
        "manual_cable_model": "31ТТН2",
    }
    for field, expected in expected_values.items():
        assert result["resolved_inputs"][field] == expected
        assert result["input_sources"][field] == "assignment_override"
    snapshot = result["provenance"]["assignment_snapshot"]
    assert snapshot["version"] == 5
    assert snapshot["source"] == "electrical_variant_object"
    assert snapshot["electrical_overrides"] == assignment_overrides
    assert snapshot["applied_fields"] == sorted(expected_values)


@pytest.mark.asyncio
async def test_explicit_canonical_tt_overrides_beat_assignment(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "process_temperature": 20.0,
            "maintain_temperature": 5.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": True,
            "steam_tracing": "yes",
            "vapor_temperature": 70.0,
        }
    )
    service, variant_id = _service_with_sources(
        obj,
        assignment_overrides={
            "steam_temperature_c": "80.0",
            "maintain_temperature_c": "10.0",
            "aggressive_product": True,
            "winding_pitch_mm": "400.0",
            "thread_count": 2,
            "manual_cable_model": "31ТТН2",
        },
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
                "vapor_temperature": 75.0,
                "maintain_temperature": 15.0,
                "aggressive_product": False,
                "winding_pitch": None,
                "number_of_threads": 1,
                "cable_mark": None,
                "selection_policy": "technical_minimum",
            }
        },
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )

    result = request.data["_tt_pipeline_result"]
    expected_values = {
        "steam_temperature_c": "75.0",
        "maintain_temperature_c": "15.0",
        "aggressive_product": False,
        "winding_pitch_mm": None,
        "thread_count": 1,
        "manual_cable_model": None,
    }
    for field, expected in expected_values.items():
        assert result["resolved_inputs"][field] == expected
        assert result["input_sources"][field] == "explicit_request"
    assert result["provenance"]["assignment_snapshot"]["applied_fields"] == []


@pytest.mark.asyncio
async def test_assignment_null_t2_is_required_error_when_steam_tracing_yes(monkeypatch):
    obj = _object()
    obj.params.update(
        {
            "maintain_temperature": 10.0,
            "min_switch_temperature": -20.0,
            "aggressive_product": False,
            "steam_tracing": "yes",
            "vapor_temperature": 90.0,
        }
    )
    service, variant_id = _service_with_sources(
        obj,
        assignment_overrides={"steam_temperature_c": None},
    )
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="off"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {"selection_policy": "technical_minimum"}},
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert raised.value.details == {"field": "steam_temperature_c"}


@pytest.mark.asyncio
async def test_tank_assignment_layout_drives_base_length_and_provenance(monkeypatch):
    obj = _tank_object()
    assignment_overrides = {
        "tank_heating_height_m": "3.0",
        "tank_laying_step_m": "0.1",
    }
    service, variant_id = _service_with_sources(
        obj,
        assignment_overrides=assignment_overrides,
    )
    monkeypatch.setattr(
        calculation_service_module,
        "configured_electrical_input_resolver",
        lambda: ElectricalInputResolver(mock_mode="off"),
    )
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={"_tt_explicit_overrides": {"selection_policy": "technical_minimum"}},
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )

    result = request.data["_tt_pipeline_result"]
    expected_base_length = math.pi * 2.0 / 2.0 * (3.0 / 0.1)
    assert float(result["resolved_inputs"]["base_length_m"]) == pytest.approx(
        expected_base_length
    )
    assert result["input_sources"]["base_length_m"] == "assignment_layout"
    assert result["layout"]["tank"] == {
        "shape": "cylindrical",
        "heating_height_m": 3.0,
        "laying_step_m": 0.1,
        "base_length_m": expected_base_length,
        "base_length_source": "assignment_layout",
        "input_sources": {
            "heating_height": "assignment_override",
            "laying_step": "assignment_override",
        },
    }
    snapshot = result["provenance"]["assignment_snapshot"]
    assert snapshot["version"] == 5
    assert snapshot["electrical_overrides"] == assignment_overrides
    assert snapshot["applied_fields"] == [
        "tank_heating_height_m",
        "tank_laying_step_m",
    ]


@pytest.mark.asyncio
async def test_cylindrical_tank_runs_with_explicit_layout_and_preserves_q_additional(
    monkeypatch,
):
    obj = _tank_object()
    service, variant_id = _service_with_sources(
        obj,
        assignment_overrides={
            "tank_heating_height_m": 2.0,
            "tank_laying_step_m": 0.2,
        },
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
                "heating_height": 3.0,
                "laying_step": 0.1,
                "winding_pitch": 200.0,
                "selection_policy": "technical_minimum",
            }
        },
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )

    result = request.data["_tt_pipeline_result"]
    expected_base_length = math.pi * 2.0 / 2.0 * (3.0 / 0.1)
    assert result["resolved_inputs"]["base_length_m"] == str(expected_base_length)
    assert result["input_sources"]["base_length_m"] == "explicit_request_layout"
    assert result["resolved_inputs"]["winding_pitch_mm"] is None
    assert result["layout"]["winding_factor"] == 1
    assert result["electrical"]["required_power_per_meter_w"] * expected_base_length == (
        pytest.approx(1300.0, abs=0.1)
    )
    assert result["provenance"]["heat_snapshot"]["tank_layout"] == {
        "tank_shape": "cylindrical",
        "heating_height": 3.0,
        "laying_step": 0.1,
        "tank_diameter": 2.0,
        "base_length_m": expected_base_length,
        "base_length_source": "explicit_request_layout",
        "input_sources": {
            "heating_height": "explicit_request",
            "laying_step": "explicit_request",
        },
    }
    assert result["layout"]["tank"] == {
        "shape": "cylindrical",
        "heating_height_m": 3.0,
        "laying_step_m": 0.1,
        "base_length_m": expected_base_length,
        "base_length_source": "explicit_request_layout",
        "input_sources": {
            "heating_height": "explicit_request",
            "laying_step": "explicit_request",
        },
    }


@pytest.mark.parametrize(
    ("shape", "expected_base_length"),
    [
        ("cylindrical", math.pi * 2.0 / 2.0 * (3.0 / 0.1)),
        ("rectangular", (2.0 * (4.0 + 3.0) / 2.0) * (3.0 / 0.1)),
    ],
)
def test_tt_tank_mapping_uses_explicit_layout_and_design_heat(
    shape: str,
    expected_base_length: float,
):
    service = CalculationService(AsyncMock())
    values = service._tt_object_heat_inputs(
        _tank_object(shape),
        {"heating_height": 3.0, "laying_step": 0.1},
    )

    assert values["base_length_m"] == pytest.approx(expected_base_length)
    assert values["heat_loss_per_meter_w"] * values["base_length_m"] * 1.2 == (
        pytest.approx(1300.0)
    )
    assert "winding_pitch_mm" not in values


@pytest.mark.parametrize(
    ("payload", "field"),
    [
        ({"winding_pitch": 100.0}, "heating_height"),
        ({"heating_height": 3.0, "winding_pitch": 100.0}, "laying_step"),
    ],
)
def test_tt_tank_layout_has_no_height_or_pipe_pitch_fallback(payload, field):
    service = CalculationService(AsyncMock())

    with pytest.raises(ElectricalInputResolutionError) as raised:
        service._tt_object_heat_inputs(_tank_object(), payload)

    assert raised.value.code == "ELECTRICAL_INPUT_REQUIRED"
    assert raised.value.details == {"field": field}


def test_spherical_tt_tank_fails_closed_with_typed_error():
    service = CalculationService(AsyncMock())

    with pytest.raises(ElectricalInputResolutionError) as raised:
        service._tt_object_heat_inputs(
            _tank_object("spherical"),
            {"heating_height": 3.0, "laying_step": 0.1},
        )

    assert raised.value.code == "ELECTRICAL_TANK_SHAPE_UNSUPPORTED"
    assert raised.value.status_code == 422
    assert raised.value.details == {"shape": "spherical"}


def test_tt_candidate_identity_excludes_voltage_and_legacy_winding_coefficient():
    obj = _object()
    obj.params.update({"supply_voltage": 380.0, "winding_coefficient": 1.4})
    service = CalculationService(AsyncMock())

    identity = service._candidate_identity_fallback_data(
        obj=obj,
        cable_type="self_regulating_tt",
        cable_mark=None,
        cable_source="builtin",
        tlt_catalog=[],
        overrides={"supply_voltage": 220.0, "winding_coefficient": 1.2},
    )

    assert "supply_voltage" not in identity
    assert "nominal_voltage_v" not in identity
    assert "winding_coefficient" not in identity


def test_tt_tank_candidate_identity_excludes_pipe_winding_pitch():
    service = CalculationService(AsyncMock())

    identity = service._candidate_identity_fallback_data(
        obj=_tank_object(),
        cable_type="self_regulating_tt",
        cable_mark=None,
        cable_source="builtin",
        tlt_catalog=[],
        overrides={"winding_pitch": 200.0, "winding_pitch_mm": 300.0},
    )

    assert "winding_pitch" not in identity
    assert "winding_pitch_mm" not in identity


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
