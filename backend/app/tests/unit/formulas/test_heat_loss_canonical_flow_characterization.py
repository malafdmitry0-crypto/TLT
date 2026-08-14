"""Freeze current heat-loss flow before the canonical-input cutover.

This suite characterizes behavior that later slices must not change unless the
plan explicitly allows a contract change. It complements existing facade and
range snapshots instead of replacing them.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from heatcalc_heat_loss_core.pipe_contract import validate_pipe_formula_domain
from pydantic import ValidationError

from app.formulas.heat_loss import pipe as pipe_facade
from app.formulas.heat_loss import pipe_preparation as pipe_preparation
from app.formulas.heat_loss import tank as tank_facade
from app.formulas.heat_loss.catalog_preparation import HeatLossPreparationError
from app.models.project_object import ProjectObject
from app.reference_data import loader as reference_loader
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, TankHeatLossParams
from app.services.calculation_service import (
    CalculationService,
    pipe_params_with_effective_safety_factor,
)

MINERAL_WOOL = "mineral_wool_boards_120"


def _pipe_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "pipe_length": 10.0,
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _tank_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 0.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _error_fields(error: ValidationError) -> list[dict[str, Any]]:
    return [
        {
            "loc": item["loc"],
            "type": item["type"],
            "msg": item["msg"],
            "input": item.get("input"),
            "error_text": str(item.get("ctx", {}).get("error", "")),
        }
        for item in error.errors(include_url=False)
    ]


def test_insulation_layer_model_validate_is_a_supported_public_contract() -> None:
    """Direct layer validation is part of the public schema, not an internal helper."""

    valid = InsulationLayer.model_validate({"thickness": 0.05, "material": MINERAL_WOOL})
    assert valid.material == MINERAL_WOOL
    assert valid.conductivity is None


def test_insulation_layer_unknown_material_is_catalog_free() -> None:
    payload = {"thickness": 0.05, "material": "not_a_catalog_material"}

    layer = InsulationLayer.model_validate(payload)
    assert layer.material == "not_a_catalog_material"

    params = PipeHeatLossParams.model_validate(_pipe_payload(insulation_layers=[payload]))
    with pytest.raises(HeatLossPreparationError) as caught:
        pipe_facade.calc_pipe_heat_loss(params)
    assert caught.value.code == "unknown_insulation_material"
    assert caught.value.path == "insulation_layers.0.material"
    assert str(caught.value) == "Неизвестный материал изоляции: not_a_catalog_material"


def test_insulation_layer_manual_and_reference_contract_errors_are_frozen() -> None:
    missing_lambda = {
        "thickness": 0.05,
        "material": "other",
        "temperature_range": [-90.0, 600.0],
    }
    with pytest.raises(ValidationError) as missing:
        InsulationLayer.model_validate(missing_lambda)
    assert _error_fields(missing.value) == [
        {
            "loc": (),
            "type": "value_error",
            "msg": "Value error, Для материала изоляции 'other' необходимо задать λ слоя",
            "input": missing_lambda,
            "error_text": "Для материала изоляции 'other' необходимо задать λ слоя",
        }
    ]

    # Layer-only validation currently accepts a reference material plus manual λ.
    # The parent pipe/tank contract rejects that combination.
    reference_with_manual = {"thickness": 0.05, "material": MINERAL_WOOL, "conductivity": 0.04}
    assert InsulationLayer.model_validate(reference_with_manual).conductivity == pytest.approx(0.04)
    with pytest.raises(ValidationError) as extra:
        PipeHeatLossParams.model_validate(_pipe_payload(insulation_layers=[reference_with_manual]))
    assert _error_fields(extra.value) == [
        {
            "loc": (),
            "type": "value_error",
            "msg": (
                "Value error, Справочный слой #1 не должен содержать "
                "ручные conductivity/temperature_range"
            ),
            "input": _pipe_payload(insulation_layers=[reference_with_manual]),
            "error_text": (
                "Справочный слой #1 не должен содержать ручные conductivity/temperature_range"
            ),
        }
    ]


def test_process_temperature_outside_material_range_fails_before_formula(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_evaluation

    calculate_spy = MagicMock(wraps=pipe_evaluation.calculate_aboveground_pipe)
    monkeypatch.setattr(pipe_evaluation, "calculate_aboveground_pipe", calculate_spy)

    payload = _pipe_payload(process_temperature=500.0)
    params = PipeHeatLossParams.model_validate(payload)
    with pytest.raises(HeatLossPreparationError) as caught:
        pipe_facade.calc_pipe_heat_loss(params)

    assert caught.value.code == "process_temperature_outside_interval"
    assert caught.value.path == "insulation_layers.0.material"
    assert str(caught.value) == (
        "Температура продукта 500 °C вне диапазона материала "
        "изоляции #1 'mineral_wool_boards_120': -60…400 °C"
    )
    calculate_spy.assert_not_called()


def test_air_pipe_domain_check_receives_empty_insulation_thicknesses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spy = MagicMock(wraps=validate_pipe_formula_domain)
    monkeypatch.setattr(
        "heatcalc_heat_loss_core.pipe_contract.validate_pipe_formula_domain",
        spy,
    )

    PipeHeatLossParams.model_validate(_pipe_payload())

    spy.assert_called_once()
    assert spy.call_args.kwargs["insulation_layer_thicknesses_m"] == ()
    assert spy.call_args.kwargs["environment"] == "ambient"


def test_underground_pipe_domain_check_receives_actual_layer_thicknesses(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    spy = MagicMock(wraps=validate_pipe_formula_domain)
    monkeypatch.setattr(
        "heatcalc_heat_loss_core.pipe_contract.validate_pipe_formula_domain",
        spy,
    )

    PipeHeatLossParams.model_validate(
        _pipe_payload(
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=5.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=1.2,
        )
    )

    spy.assert_called_once()
    assert spy.call_args.kwargs["insulation_layer_thicknesses_m"] == (0.05,)
    assert spy.call_args.kwargs["environment"] == "ground"


def test_pipe_facade_catalog_lookup_count_for_one_reference_layer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    range_spy = MagicMock(wraps=reference_loader.get_insulation_temperature_range)
    resolve_spy = MagicMock(wraps=reference_loader.resolve_reference_insulation)
    wall_spy = MagicMock(wraps=reference_loader.get_pipe_material_conductivity_law)
    monkeypatch.setattr(reference_loader, "get_insulation_temperature_range", range_spy)
    monkeypatch.setattr(
        "app.formulas.heat_loss.catalog_preparation.resolve_reference_insulation",
        resolve_spy,
    )
    monkeypatch.setattr(pipe_preparation, "get_pipe_material_conductivity_law", wall_spy)

    params = PipeHeatLossParams.model_validate(_pipe_payload())
    pipe_facade.calc_pipe_heat_loss(params)

    assert range_spy.call_count == 0
    assert resolve_spy.call_count == 1
    assert wall_spy.call_count == 1


def test_pipe_facade_does_not_repeat_core_contract_validation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from heatcalc_heat_loss_core import pipe_formula as pipe_formula_module

    params = PipeHeatLossParams.model_validate(_pipe_payload())
    spy = MagicMock(wraps=pipe_formula_module.validate_pipe_contract)
    monkeypatch.setattr(pipe_formula_module, "validate_pipe_contract", spy)
    pipe_facade.calc_pipe_heat_loss(params)
    spy.assert_not_called()


def test_pipe_user_safety_factor_wins_over_admin_coefficient() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=1.2))
    formula_params = pipe_params_with_effective_safety_factor(params, {"safety_factor": 1.4})
    result = pipe_facade.calc_pipe_heat_loss(formula_params)
    assert formula_params is params
    assert result.safety_factor_applied == pytest.approx(1.2)


def test_pipe_admin_zero_safety_factor_raises_user_facing_range_error() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=None))
    formula_params = pipe_params_with_effective_safety_factor(params, {"safety_factor": 0.0})
    assert params.safety_factor is None
    with pytest.raises(ValueError, match="safety_factor должно быть не меньше 1"):
        pipe_facade.calc_pipe_heat_loss(formula_params)


def test_pipe_admin_safety_factor_applies_only_when_user_value_is_absent() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=None))
    formula_params = pipe_params_with_effective_safety_factor(params, {"safety_factor": 1.4})
    result = pipe_facade.calc_pipe_heat_loss(formula_params)
    assert params.safety_factor is None
    assert formula_params is not params
    assert formula_params.safety_factor == pytest.approx(1.4)
    assert result.safety_factor_applied == pytest.approx(1.4)


def test_pipe_profile_default_applies_when_user_and_admin_are_absent() -> None:
    params = PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=None))
    formula_params = pipe_params_with_effective_safety_factor(params, {})
    result = pipe_facade.calc_pipe_heat_loss(formula_params)
    assert formula_params is params
    assert result.safety_factor_applied == pytest.approx(1.1)


def test_pipe_zero_safety_factor_is_rejected_by_range_before_resolver() -> None:
    with pytest.raises(ValidationError) as caught:
        PipeHeatLossParams.model_validate(_pipe_payload(safety_factor=0.0))

    error = next(
        item for item in caught.value.errors(include_url=False) if item["loc"] == ("safety_factor",)
    )
    assert error["type"] == "greater_than_equal"
    assert error["input"] == 0.0
    assert error["ctx"] == {"ge": 1.0}


def test_admin_ground_conductivity_does_not_change_pipe_result() -> None:
    params = PipeHeatLossParams.model_validate(
        _pipe_payload(
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=5.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=1.2,
        )
    )
    baseline = pipe_facade.calc_pipe_heat_loss(params)
    overridden = pipe_facade.calc_pipe_heat_loss(
        pipe_params_with_effective_safety_factor(params, {"ground_conductivity": 2.9})
    )
    assert overridden.model_dump() == baseline.model_dump()
    assert overridden.ground_conductivity_applied == pytest.approx(1.5)


def test_tank_ignores_admin_coefficients() -> None:
    payload = _tank_payload(safety_factor=1.1)
    params = TankHeatLossParams.model_validate(payload)
    facade_result = tank_facade.calc_tank_heat_loss(params)
    assert facade_result.safety_factor_applied == pytest.approx(1.1)

    service_result = CalculationService(AsyncMock())._calc_heat_loss_with_coefficients(
        "tank",
        payload,
        {"safety_factor": 1.4, "ground_conductivity": 2.9},
        apply_climate_policy=False,
    )
    assert service_result["safety_factor_applied"] == pytest.approx(1.1)
    assert service_result["total_heat_loss_design"] == facade_result.total_heat_loss_design


def test_tank_requires_safety_factor() -> None:
    payload = _tank_payload()
    payload.pop("safety_factor")
    with pytest.raises(ValidationError) as caught:
        TankHeatLossParams.model_validate(payload)
    assert any(item["loc"] == ("safety_factor",) for item in caught.value.errors(include_url=False))


def test_pipe_rounds_facade_json_tank_does_not() -> None:
    pipe_params = PipeHeatLossParams.model_validate(_pipe_payload())
    pipe_result = pipe_facade.calc_pipe_heat_loss(pipe_params)
    pipe_outcome = pipe_preparation.run_validated_pipe_formula(pipe_params)
    assert pipe_outcome.result is not None
    pipe_eval = pipe_outcome.result
    assert pipe_result.heat_loss_per_meter_base == round(
        pipe_eval.core_result.heat_loss_per_meter_base_w_m, 3
    )
    assert pipe_result.thermal_resistance == round(pipe_eval.core_result.thermal_resistance_mk_w, 6)

    tank_params = TankHeatLossParams.model_validate(_tank_payload())
    tank_result = tank_facade.calc_tank_heat_loss(tank_params)
    dumped = tank_result.model_dump()
    assert dumped["total_heat_loss_base"] == tank_result.total_heat_loss_base
    assert dumped["total_heat_loss_base"] != round(tank_result.total_heat_loss_base, 3)


def test_indoor_outdoor_and_three_layer_pipe_paths_stay_distinct() -> None:
    indoor = pipe_facade.calc_pipe_heat_loss(
        PipeHeatLossParams.model_validate(
            _pipe_payload(
                placement="indoor", wind_speed=None, insulation_temperature_basis="indoor"
            )
        )
    )
    outdoor = pipe_facade.calc_pipe_heat_loss(PipeHeatLossParams.model_validate(_pipe_payload()))
    three_layers = pipe_facade.calc_pipe_heat_loss(
        PipeHeatLossParams.model_validate(
            _pipe_payload(
                insulation_layers=[
                    {"thickness": 0.03, "material": MINERAL_WOOL},
                    {"thickness": 0.02, "material": MINERAL_WOOL},
                    {"thickness": 0.01, "material": MINERAL_WOOL},
                ]
            )
        )
    )

    assert indoor.alpha_vnesh_applied == pytest.approx(9.0)
    assert outdoor.alpha_vnesh_applied != indoor.alpha_vnesh_applied
    assert outdoor.wind_speed_applied == pytest.approx(0.0)
    assert indoor.wind_speed_applied is None
    assert len(three_layers.insulation_layers_applied) == 3
    assert three_layers.heat_loss_per_meter_base != outdoor.heat_loss_per_meter_base


async def test_recalculate_keeps_climate_k_and_ignores_admin_when_k_already_set() -> None:
    obj = cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type="pipe",
            params=_pipe_payload(
                safety_factor=1.1,
                safety_factor_source="climate_policy",
                min_switch_temperature=-20.0,
            ),
            results=None,
            is_valid=False,
            validation_errors=None,
        ),
    )

    outcome = await CalculationService(AsyncMock()).try_recalculate(
        obj, coefficients={"safety_factor": 1.4}
    )

    assert outcome.is_ok is True
    assert obj.is_valid is True
    assert obj.validation_errors is None
    assert obj.results is not None
    assert obj.results["safety_factor_applied"] == pytest.approx(1.1)
    assert obj.params["safety_factor"] == pytest.approx(1.1)


async def test_invalid_recalculate_clears_results_and_keeps_object() -> None:
    obj = cast(
        ProjectObject,
        SimpleNamespace(
            id=uuid4(),
            object_type="pipe",
            params=_pipe_payload(safety_factor=0.0, min_switch_temperature=-20.0),
            results={"stale": True},
            is_valid=True,
            validation_errors=None,
        ),
    )

    outcome = await CalculationService(AsyncMock()).try_recalculate(obj, coefficients={})

    assert outcome.is_err is True
    assert obj.is_valid is False
    assert obj.results is None
    assert obj.validation_errors is not None
    assert obj.validation_errors["category"] == "validation"
