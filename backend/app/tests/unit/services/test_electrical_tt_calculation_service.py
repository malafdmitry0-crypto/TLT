"""Case 1 calculation-service adapter tests."""

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.schemas.calculation import ElectricalRequest
from app.services.calculation_service import CalculationService
from app.services.electrical_catalog_service import ElectricalCatalogService
from app.services.electrical_input_resolver import ElectricalInputResolutionError


def _pipe() -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        object_type="pipe",
        version=7,
        is_valid=True,
        params={
            "process_temperature": 65.0,
            "ambient_temperature": -15.0,
            "min_switch_temperature": -30.0,
            "outer_diameter": 0.108,
        },
        results={
            "heat_loss_per_meter_base": 20.0,
            "effective_length": 200.0,
            "safety_factor_applied": 1.1,
        },
    )


def _tank(shape: str = "cylindrical") -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        object_type="tank",
        version=4,
        is_valid=True,
        params={
            "shape": shape,
            "diameter": 2.0,
            "height": 9.0,
            "process_temperature": 40.0,
            "ambient_temperature": -20.0,
            "ground_temperature": -30.0,
            "placement": "underground",
            "min_switch_temperature": -35.0,
            "heating_height": 3.0,
            "laying_step": 0.1,
        },
        results={
            "total_heat_loss_design": 1300.0,
            "safety_factor_applied": 1.2,
        },
    )


def _service(obj: SimpleNamespace, *, overrides: dict | None = None):
    service = CalculationService(AsyncMock())
    variant_id = uuid4()
    service._tt_project_settings_cache[obj.project_id] = SimpleNamespace(
        nominal_voltage_v=230,
        max_section_start_current_a=13.065,
        version=3,
    )
    service._tt_assignment_cache[(obj.project_id, variant_id, obj.id)] = SimpleNamespace(
        id=uuid4(),
        max_section_start_current_a=None,
        electrical_overrides=dict(overrides or {}),
        version=5,
    )
    service._tt_calculation_catalogs_cache = {
        kind: ElectricalCatalogService._static_calculation_fallback(kind)
        for kind in ("power", "section", "bom")
    }
    return service, variant_id


def _database_catalogs_with_custom_power(power_w_per_m: float) -> dict[str, dict]:
    catalogs = {
        kind: ElectricalCatalogService._static_calculation_fallback(kind)
        for kind in ("power", "section", "bom")
    }
    power = deepcopy(catalogs["power"])
    row = next(item for item in power["payload"]["rows"] if item["model"] == "25ТТН2")
    row["nominal_power"] = power_w_per_m
    power.update(
        {
            "id": str(uuid4()),
            "version": "custom-power-v1",
            "status": "active",
            "authority": "database",
            "source": "owner/custom-power-v1.json",
            "source_checksum": "sha256:" + "1" * 64,
            "payload_checksum": "sha256:" + "2" * 64,
            "production_approved": True,
        }
    )
    catalogs["power"] = power
    return catalogs


async def test_second_calculation_resolves_persisted_assignment_voltage_without_request_u() -> None:
    obj = _pipe()
    service, variant_id = _service(obj, overrides={"supply_voltage_v": "380"})
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
    _mark, result = service._calculate_electrical_result(request)

    assert result["resolved_inputs"]["nominal_voltage_v"] == "380"
    assert result["input_sources"]["nominal_voltage_v"] == "assignment_override"
    assert result["voltage"] == 380
    assert result["current"] == pytest.approx(result["total_power"] / 380, abs=0.001)


async def test_snapshot_uses_exact_custom_database_row_selected_by_pipeline() -> None:
    obj = _pipe()
    service, variant_id = _service(obj)
    service._tt_calculation_catalogs_cache = _database_catalogs_with_custom_power(26)
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
    cable_mark, result = service._calculate_electrical_result(request)
    snapshot = service._build_cable_snapshot_for_result(
        request=request,
        cable_mark=cable_mark,
        result_dict=result,
    )

    assert cable_mark == "25ТТН2-СР"
    assert result["power_per_meter"] == 26
    assert snapshot is not None
    assert snapshot["technical"]["nominal_power"] == 26
    assert snapshot["actual_catalog_source"] == "database"
    assert snapshot["catalog_identity"]["version"] == "custom-power-v1"
    assert snapshot["catalog_identity"]["payload_checksum"] == "sha256:" + "2" * 64


async def test_snapshot_uses_builtin_row_when_database_catalog_is_absent() -> None:
    obj = _pipe()
    service, variant_id = _service(obj)
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
    cable_mark, result = service._calculate_electrical_result(request)
    snapshot = service._build_cable_snapshot_for_result(
        request=request,
        cable_mark=cable_mark,
        result_dict=result,
    )

    assert snapshot is not None
    assert snapshot["technical"]["nominal_power"] == result["power_per_meter"]
    assert snapshot["actual_catalog_source"] == "builtin"
    assert snapshot["catalog_identity"]["authority"] == "static_fallback"


async def test_snapshot_status_uses_current_resolved_catalog_identity() -> None:
    obj = _pipe()
    service, variant_id = _service(obj)
    service._tt_calculation_catalogs_cache = _database_catalogs_with_custom_power(26)
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
    cable_mark, result = service._calculate_electrical_result(request)
    snapshot = service._build_cable_snapshot_for_result(
        request=request,
        cable_mark=cable_mark,
        result_dict=result,
    )
    assert snapshot is not None

    current = deepcopy(service._tt_calculation_catalogs_cache)
    current["power"]["version"] = "custom-power-v2"
    current["power"]["payload_checksum"] = "sha256:" + "3" * 64
    service._tt_calculation_catalogs_cache = current
    calc_id = uuid4()

    statuses = await service.cable_snapshot_statuses(
        [
            SimpleNamespace(
                id=calc_id,
                cable_type="self_regulating_tt",
                cable_mark=cable_mark,
                cable_snapshot=snapshot,
            )
        ]
    )

    assert statuses[calc_id]["technical_status"] == "changed"
    assert statuses[calc_id]["severity"] == "critical"
    assert "catalog.payload_checksum" in statuses[calc_id]["changed_fields"]


def test_tt_snapshot_is_not_partially_built_without_resolved_catalog_row() -> None:
    service = CalculationService(AsyncMock())
    request = ElectricalRequest(
        object_id=uuid4(),
        cable_type="self_regulating_tt",
        data={"cable_mark_source": "manual"},
    )

    snapshot = service._build_cable_snapshot_for_result(
        request=request,
        cable_mark="25ТТН2-СР",
        result_dict=None,
    )

    assert snapshot is None


async def test_explicit_voltage_is_reflected_in_effective_assignment_provenance() -> None:
    obj = _pipe()
    service, variant_id = _service(obj)
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "supply_voltage": 380,
                "selection_policy": "technical_minimum",
            }
        },
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )
    _mark, result = service._calculate_electrical_result(request)

    assert result["input_sources"]["nominal_voltage_v"] == "explicit_request"
    assert result["provenance"]["assignment_version"] == 6
    assert result["provenance"]["assignment_snapshot"]["electrical_overrides"] == {
        "supply_voltage_v": "380"
    }


def test_object_adapter_keeps_ambient_and_cold_start_as_distinct_case1_inputs() -> None:
    obj = _pipe()
    service = CalculationService(AsyncMock())

    values = service._tt_object_heat_inputs(obj, {})

    assert values["ambient_temperature_c"] == -15
    assert values["cold_start_temperature_c"] == -30
    assert not {"steam_temperature_c", "maintain_temperature_c", "aggressive_product"} & set(values)


async def test_tank_uses_same_selector_after_geometry_and_forces_direct_layout() -> None:
    obj = _tank()
    service, variant_id = _service(obj)
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "selection_policy": "technical_minimum",
            }
        },
    )

    await service._prepare_self_regulating_tt_request(
        request,
        obj,
        electrical_variant_id=variant_id,
    )
    _mark, result = service._calculate_electrical_result(request)

    assert result["input_sources"]["ambient_temperature_c"] == "object_heat"
    assert result["resolved_inputs"]["ambient_temperature_c"] == "-30.0"
    assert result["resolved_inputs"]["cold_start_temperature_c"] == "-35.0"
    assert result["layout"]["winding_factor"] == 1
    assert result["layout"]["tank"]["shape"] == "cylindrical"
    assert "winding_pitch" not in result
    assert "winding_pitch_mm" not in result["layout"]
    assert "winding_pitch" not in request.data
    assert "outer_diameter_mm" not in request.data


async def test_tank_rejects_explicit_pipe_winding_instead_of_silently_ignoring_it() -> None:
    obj = _tank()
    service, variant_id = _service(obj)
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "winding_pitch": 999,
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

    assert raised.value.code == "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED"
    assert raised.value.details == {"fields": ["winding_pitch"]}


@pytest.mark.parametrize("source", ["object", "assignment"])
async def test_tank_rejects_saved_pipe_winding_instead_of_silently_ignoring_it(
    source: str,
) -> None:
    obj = _tank()
    overrides = None
    if source == "object":
        obj.params["winding_pitch"] = 999
    else:
        overrides = {"winding_pitch_mm": 999}
    service, variant_id = _service(obj, overrides=overrides)
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

    assert raised.value.code == "ELECTRICAL_TANK_LAYOUT_INPUT_UNSUPPORTED"
    expected_field = "winding_pitch" if source == "object" else "winding_pitch_mm"
    assert raised.value.details == {"fields": [expected_field]}


def test_unsupported_tank_shape_is_typed_and_never_falls_back_to_pipe() -> None:
    with pytest.raises(ElectricalInputResolutionError) as raised:
        CalculationService(AsyncMock())._tt_object_heat_inputs(_tank("hexagonal"), {})

    assert raised.value.code == "ELECTRICAL_TANK_SHAPE_UNSUPPORTED"


def test_failed_tt_provenance_never_invents_hidden_230_voltage() -> None:
    payload = CalculationService._tt_error_provenance_payload(
        {kind: {"kind": kind, "version": "test"} for kind in ("power", "section", "bom")}
    )

    assert "voltage" not in payload
    assert "normalized_voltage_v" not in payload
    assert "normalized_voltage_v" not in payload["provenance"]


async def test_generic_electrical_request_rejects_retired_tt_input() -> None:
    obj = _pipe()
    service, variant_id = _service(obj)
    request = ElectricalRequest(
        object_id=obj.id,
        cable_type="self_regulating_tt",
        data={
            "_tt_explicit_overrides": {
                "selection_policy": "technical_minimum",
                "winding_coefficient": 1.2,
            }
        },
    )

    with pytest.raises(ElectricalInputResolutionError) as raised:
        await service._prepare_self_regulating_tt_request(
            request,
            obj,
            electrical_variant_id=variant_id,
        )

    assert raised.value.code == "ELECTRICAL_INPUT_RETIRED"
