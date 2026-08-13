"""Slice 2 canonical pipe contract and dimensional characterization."""

import math
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.formulas.heat_loss.pipe import calc_pipe_heat_loss
from app.schemas.calculation import PipeHeatLossParams, StoredPipeHeatParams
from app.schemas.project import ProjectObjectCreate, ProjectObjectUpdate
from app.services.calculation_service import CalculationService
from app.services.heat_contract import replace_heat_owned_params
from app.services.project_object_params import prepare_project_object_params

MINERAL_WOOL = "mineral_wool_boards_120"


def _air(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.1,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "insulation_temperature_basis": "outdoor_winter",
        "pipe_length": 10.0,
        "num_local_elements": 2,
        "local_element_equiv_length": 1.5,
        "wind_speed": 4.0,
        "safety_factor": 1.1,
        "placement": "outdoor",
    }
    payload.update(overrides)
    return payload


def _underground(**overrides: object) -> dict[str, object]:
    payload = _air(
        placement="underground",
        ambient_temperature=None,
        wind_speed=None,
        insulation_temperature_basis="channel",
        ground_temperature=5.0,
        ground_conductivity=1.5,
        pipe_centerline_depth=1.2,
    )
    payload.update(overrides)
    return payload


@pytest.mark.parametrize(
    "legacy",
    [
        {"location": "outdoor"},
        {"burial_depth": 1.2},
        {"insulation_thickness": 0.05},
        {"insulation_material": MINERAL_WOOL},
    ],
)
def test_stored_pipe_rejects_every_legacy_input_without_alias(legacy):
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        StoredPipeHeatParams(**_air(**legacy))


def test_stored_pipe_rejects_manual_alpha() -> None:
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        StoredPipeHeatParams(**_air(alpha_vnesh=15.0))


def test_pipe_ground_conductivity_matches_frontend_product_range():
    with pytest.raises(ValidationError):
        StoredPipeHeatParams(**_underground(ground_conductivity=0.499))
    assert StoredPipeHeatParams(**_underground(ground_conductivity=0.5)).ground_conductivity == 0.5


def test_calculation_preview_rejects_legacy_even_with_complete_canonical_payload():
    with pytest.raises(ValueError, match="Forbidden pipe heat params"):
        CalculationService(None)._calc_heat_loss_with_coefficients(  # type: ignore[arg-type]
            "pipe", {**_air(), "location": "outdoor"}, {}, apply_climate_policy=False
        )


def test_calculation_preview_rejects_cross_type_heat_but_keeps_non_heat_metadata():
    service = CalculationService(None)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="shape"):
        service._calc_heat_loss_with_coefficients(
            "pipe", {**_air(), "shape": "cylindrical"}, {}, apply_climate_policy=False
        )

    result = service._calc_heat_loss_with_coefficients(
        "pipe", {**_air(), "volume": 12.5}, {}, apply_climate_policy=False
    )
    assert result["formula_model"] == "pipe_heat_loss"


def test_pipe_query_readers_use_only_canonical_placement_and_first_layer():
    from app.services.object_query_service import (
        _first_insulation_value,
        _insulation_layer_count,
        _placement,
    )

    canonical = SimpleNamespace(
        object_type="pipe",
        params={
            "placement": "underground",
            "location": "outdoor",
            "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
            "insulation_thickness": 0.01,
        },
    )
    legacy_only = SimpleNamespace(object_type="pipe", params={"location": "indoor"})

    assert _placement(canonical) == "underground"
    assert _placement(legacy_only) is None
    assert _first_insulation_value(canonical, "thickness") == 0.08
    assert _first_insulation_value(canonical, "material") == MINERAL_WOOL
    assert _insulation_layer_count(canonical) == 1
    legacy_only.params["insulation_layer_count"] = "3"
    assert _insulation_layer_count(legacy_only) == 0


def test_pipe_requires_one_to_three_canonical_layers():
    with pytest.raises(ValidationError):
        StoredPipeHeatParams(**_air(insulation_layers=[]))
    with pytest.raises(ValidationError):
        StoredPipeHeatParams(
            **_air(
                insulation_layers=[{"thickness": 0.01, "material": MINERAL_WOOL} for _ in range(4)]
            )
        )


def test_pipe_material_and_manual_lambda_are_xor_and_wall_fits_inside_pipe():
    with pytest.raises(ValidationError, match="ровно один источник"):
        StoredPipeHeatParams(**_air(pipe_lambda=45.0))
    with pytest.raises(ValidationError, match="ровно один источник"):
        StoredPipeHeatParams(**_air(pipe_material=None))
    with pytest.raises(ValidationError, match="меньше половины"):
        StoredPipeHeatParams(**_air(outer_diameter=0.05, wall_thickness=0.03))
    assert StoredPipeHeatParams(**_air(pipe_material=None, pipe_lambda=45.0)).pipe_lambda == 45.0


def test_air_branches_resolve_alpha_and_preserve_pipe_dimensions():
    indoor = calc_pipe_heat_loss(
        PipeHeatLossParams(
            **_air(
                placement="indoor",
                wind_speed=None,
                insulation_temperature_basis="indoor",
            )
        )
    )
    outdoor = calc_pipe_heat_loss(PipeHeatLossParams(**_air()))
    assert indoor.alpha_vnesh_applied == 9.0
    assert outdoor.alpha_vnesh_applied == pytest.approx(11.6 + 7 * math.sqrt(4.0))
    assert outdoor.wind_speed_applied == 4.0
    assert outdoor.applied_units["thermal_resistance"] == "m*K/W"
    assert outdoor.applied_units["heat_loss_per_meter_base"] == "W/m"
    assert outdoor.applied_units["total_heat_loss_base"] == "W"
    assert outdoor.total_heat_loss_design == pytest.approx(
        outdoor.total_heat_loss_base * 1.1, abs=0.002
    )


def test_underground_uses_ground_temperature_and_centerline_depth_only():
    cold_ground = calc_pipe_heat_loss(PipeHeatLossParams(**_underground(ground_temperature=0.0)))
    warm_ground = calc_pipe_heat_loss(PipeHeatLossParams(**_underground(ground_temperature=20.0)))

    assert cold_ground.total_heat_loss_base > warm_ground.total_heat_loss_base
    assert cold_ground.ambient_temperature_applied is None
    assert cold_ground.ground_temperature_applied == 0.0
    assert cold_ground.alpha_vnesh_applied is None
    assert cold_ground.wind_speed_applied is None
    assert cold_ground.ground_conductivity_applied == 1.5


def test_underground_manual_golden_matches_cylindrical_and_ground_resistances():
    params = PipeHeatLossParams(
        **_underground(
            pipe_material=None,
            pipe_lambda=45.0,
            insulation_layers=[
                {
                    "thickness": 0.05,
                    "material": "other",
                    "conductivity": 0.05,
                    "temperature_range": [-70.0, 200.0],
                }
            ],
            ground_temperature=5.0,
            pipe_centerline_depth=1.0,
            ground_conductivity=1.5,
        )
    )

    result = calc_pipe_heat_loss(params)
    pipe_outer_radius = 0.05
    pipe_inner_radius = 0.046
    insulation_outer_radius = 0.10
    wall_resistance = math.log(pipe_outer_radius / pipe_inner_radius) / (2 * math.pi * 45.0)
    insulation_resistance = math.log(insulation_outer_radius / pipe_outer_radius) / (
        2 * math.pi * 0.05
    )
    ground_resistance = math.acosh(1.0 / insulation_outer_radius) / (2 * math.pi * 1.5)
    total_resistance = wall_resistance + insulation_resistance + ground_resistance
    heat_loss_per_meter_base = (80.0 - 5.0) / total_resistance
    effective_length = 10.0 + 2 * 1.5

    assert result.wall_resistance == pytest.approx(wall_resistance, abs=5e-7)
    assert result.insulation_resistance == pytest.approx(insulation_resistance, abs=5e-7)
    assert result.external_resistance == pytest.approx(ground_resistance, abs=5e-7)
    assert result.thermal_resistance == pytest.approx(total_resistance, abs=5e-7)
    assert result.heat_loss_per_meter_base == pytest.approx(heat_loss_per_meter_base, abs=5e-4)
    assert result.total_heat_loss_base == pytest.approx(
        heat_loss_per_meter_base * effective_length,
        abs=5e-4,
    )
    assert result.total_heat_loss_design == pytest.approx(
        heat_loss_per_meter_base * effective_length * 1.1,
        abs=5e-4,
    )


def test_underground_rejects_air_fields_and_shallow_axis():
    with pytest.raises(ValidationError, match="ambient_temperature запрещена"):
        StoredPipeHeatParams(**_underground(ambient_temperature=-50.0))
    with pytest.raises(ValidationError, match="больше наружного радиуса"):
        StoredPipeHeatParams(**_underground(pipe_centerline_depth=0.09))
    with pytest.raises(ValidationError, match="больше наружного радиуса"):
        StoredPipeHeatParams(**_underground(pipe_centerline_depth=0.1))
    with pytest.raises(ValidationError, match="Метаданные температуры воздуха"):
        StoredPipeHeatParams(**_underground(wind_speed_source="climate"))


def test_air_pipe_rejects_hidden_ground_metadata():
    with pytest.raises(ValidationError, match="Метаданные грунта"):
        StoredPipeHeatParams(**_air(ground_temperature_source="manual"))


def test_pipe_heat_replacement_preserves_non_heat_and_volume_and_removes_legacy():
    existing = {
        "volume": 12.5,
        "supply_voltage": 380,
        "min_switch_temperature": -20.0,
        "location": "outdoor",
        "burial_depth": 1.2,
        "insulation_thickness": 0.05,
    }
    replaced = replace_heat_owned_params(existing, _air())
    prepared = prepare_project_object_params("pipe", replaced)

    assert prepared["volume"] == 12.5
    assert prepared["supply_voltage"] == 380
    assert "location" not in prepared
    assert "burial_depth" not in prepared
    assert "insulation_thickness" not in prepared
    assert "volume" not in PipeHeatLossParams.model_fields


def test_calculation_service_projects_shared_object_params_to_formula_only():
    shared = {
        **_air(),
        "volume": 12.5,
        "supply_voltage": 380,
        "environment": "normal",
    }

    result = CalculationService(None)._calc_heat_loss_with_coefficients(  # type: ignore[arg-type]
        "pipe", shared, {}, apply_climate_policy=False
    )

    assert result["formula_model"] == "pipe_heat_loss"
    assert "volume" not in result["input_units"]


def test_underground_climate_policy_never_injects_ambient_temperature():
    result = CalculationService._apply_climate_policy(
        "pipe",
        {
            **_underground(),
            "climate_city": "Москва",
            "climate_region": "Москва",
            "ambient_temperature": -30,
            "ambient_temperature_source": "climate",
        },
    )

    assert "ambient_temperature" not in result
    assert "ambient_temperature_source" not in result
    assert result["ground_temperature"] == 5.0


@pytest.mark.parametrize("operation", ["create", "update"])
async def test_invalid_pipe_formula_persists_api_validation_state(monkeypatch, operation):
    from app.api.v1 import objects as objects_api

    obj = SimpleNamespace(
        id=uuid4(),
        object_type="pipe",
        params=_air(),
        results=None,
        is_valid=True,
        validation_errors=None,
        version=1,
    )
    project_service = SimpleNamespace(
        add_object=AsyncMock(return_value=obj),
        update_object=AsyncMock(return_value=obj),
    )

    class FakeCalculationService:
        def __init__(self, _db):
            pass

        async def recalculate_object(self, target):
            target.is_valid = False
            target.validation_errors = {"message": "formula-time invalid"}

        async def mark_electrical_calculations_stale(self, *_args, **_kwargs):
            return 0

    class FakeAuditService:
        def __init__(self, _db):
            pass

        async def stage(self, **_kwargs):
            return None

    monkeypatch.setattr(objects_api, "ProjectService", lambda _db: project_service)
    monkeypatch.setattr(objects_api, "CalculationService", FakeCalculationService)
    monkeypatch.setattr(objects_api, "AuditService", FakeAuditService)
    db = SimpleNamespace(commit=AsyncMock(), refresh=AsyncMock(), rollback=AsyncMock())

    project_id = uuid4()
    if operation == "create":
        result = await objects_api.add_object(
            project_id,
            ProjectObjectCreate(object_type="pipe", params=_air()),
            principal=object(),
            db=db,
        )
    else:
        result = await objects_api.update_object(
            project_id,
            obj.id,
            ProjectObjectUpdate(version=1, params=_air()),
            principal=object(),
            db=db,
        )

    assert result is obj
    assert obj.is_valid is False
    assert obj.results is None
    assert obj.validation_errors == {"message": "formula-time invalid"}
    db.commit.assert_awaited_once()
    db.refresh.assert_awaited_once_with(obj)
    db.rollback.assert_not_awaited()
