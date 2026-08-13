"""Prove backend material policy delegates all temperature math to the core."""

from collections.abc import Callable
from typing import Any
from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.conductivity import UnavailableConductivity
from heatcalc_heat_loss_core.insulation_contract import validate_insulation_contract
from heatcalc_heat_loss_core.pipe_contract import validate_pipe_contract
from heatcalc_heat_loss_core.tank_contract import validate_tank_contract
from pydantic import ValidationError

from app.formulas.heat_loss import pipe as pipe_formulas
from app.formulas.heat_loss import pipe_preparation as pipe_preparation
from app.formulas.heat_loss import tank as tank_formulas
from app.formulas.heat_loss import tank_preparation as tank_preparation
from app.schemas import calculation as calculation_schemas
from app.schemas.calculation import InsulationLayer, PipeHeatLossParams, TankHeatLossParams

MINERAL_WOOL = "mineral_wool_boards_120"


def _pipe() -> PipeHeatLossParams:
    return PipeHeatLossParams(
        outer_diameter=0.108,
        wall_thickness=0.004,
        pipe_material="carbon_steel",
        insulation_layers=[{"thickness": 0.05, "material": MINERAL_WOOL}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        pipe_length=10.0,
        wind_speed=4.0,
        placement="outdoor",
    )


def _tank() -> TankHeatLossParams:
    return TankHeatLossParams(
        shape="cylindrical",
        diameter=2.0,
        height=3.0,
        insulation_layers=[{"thickness": 0.05, "material": MINERAL_WOOL}],
        insulation_temperature_basis="outdoor_winter",
        ambient_temperature=-20.0,
        process_temperature=80.0,
        wind_speed=4.0,
        safety_factor=1.1,
        placement="outdoor",
    )


def test_manual_material_interval_shape_delegates_to_core_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    validator = MagicMock(wraps=validate_insulation_contract)
    monkeypatch.setattr(calculation_schemas, "validate_insulation_contract", validator)

    layer = InsulationLayer(
        thickness=0.05,
        material="other",
        conductivity=0.04,
        temperature_range=(-90.0, 600.0),
    )

    assert layer.temperature_range == (-90.0, 600.0)
    validator.assert_called_once()
    contract = validator.call_args.args[0]
    assert contract.temperature_range_c == (-90.0, 600.0)


def test_invalid_manual_interval_keeps_existing_pydantic_error() -> None:
    payload = {
        "thickness": 0.05,
        "material": "other",
        "conductivity": 0.04,
        "temperature_range": [100.0, -60.0],
    }

    with pytest.raises(ValidationError) as exc_info:
        InsulationLayer.model_validate(payload)

    error = exc_info.value.errors(include_url=False)[0]
    assert error["type"] == "value_error"
    assert error["loc"] == ()
    assert error["input"] == payload
    assert error["msg"] == (
        "Value error, Температурный диапазон материала изоляции 'other': "
        "нижняя граница должна быть меньше верхней"
    )


@pytest.mark.parametrize(
    ("factory", "validator_name", "validator"),
    [
        (_pipe, "validate_pipe_contract", validate_pipe_contract),
        (_tank, "validate_tank_contract", validate_tank_contract),
    ],
)
def test_reference_material_temperature_check_delegates_to_core(
    monkeypatch: pytest.MonkeyPatch,
    factory: Callable[[], Any],
    validator_name: str,
    validator: Callable[[Any], Any],
) -> None:
    validator_spy = MagicMock(wraps=validator)
    monkeypatch.setattr(calculation_schemas, validator_name, validator_spy)

    factory()

    validator_spy.assert_called_once()
    contract = validator_spy.call_args.args[0]
    layers = getattr(contract, "layers", getattr(contract, "insulation_layers", ()))
    interval = getattr(
        layers[0],
        "reference_temperature_interval_c",
        getattr(layers[0], "reference_temperature_range_c", None),
    )
    assert interval == (-60.0, 400.0)


@pytest.mark.parametrize(
    ("module", "calculate", "factory", "evaluator_name"),
    [
        (pipe_formulas, pipe_formulas.calc_pipe_heat_loss, _pipe, "run_validated_pipe_formula"),
        (
            tank_formulas,
            tank_formulas.calc_tank_heat_loss,
            _tank,
            "run_validated_tank_formula",
        ),
    ],
)
def test_facade_calls_its_canonical_evaluator_once_without_direct_material_validation(
    monkeypatch: pytest.MonkeyPatch,
    module: Any,
    calculate: Callable[[Any], Any],
    factory: Callable[[], Any],
    evaluator_name: str,
) -> None:
    evaluator = getattr(module, evaluator_name)
    evaluator_spy = MagicMock(wraps=evaluator)
    monkeypatch.setattr(module, evaluator_name, evaluator_spy)
    direct_validator = getattr(module, "validate_hot_side_temperature_in_interval", None)
    if direct_validator is not None:
        direct_validator_spy = MagicMock(wraps=direct_validator)
        monkeypatch.setattr(
            module, "validate_hot_side_temperature_in_interval", direct_validator_spy
        )

    calculate(factory())

    evaluator_spy.assert_called_once()
    if direct_validator is not None:
        direct_validator_spy.assert_not_called()


@pytest.mark.parametrize(
    ("module", "calculate", "factory"),
    [
        (pipe_formulas, pipe_formulas.calc_pipe_heat_loss, _pipe),
        (tank_formulas, tank_formulas.calc_tank_heat_loss, _tank),
    ],
)
def test_facade_preserves_reference_lambda_error_for_selected_unavailable_branch(
    monkeypatch: pytest.MonkeyPatch,
    module: Any,
    calculate: Callable[[Any], Any],
    factory: Callable[[], Any],
) -> None:
    lookup_owner = pipe_preparation if module is pipe_formulas else tank_preparation
    monkeypatch.setattr(
        lookup_owner,
        "resolve_reference_insulation",
        lambda _material: (UnavailableConductivity(), (-60.0, 400.0)),
    )

    with pytest.raises(
        ValueError,
        match=r"Для материала изоляции 'mineral_wool_boards_120' "
        r"не задана расчётная λ\(tm\) при tm=40 °C",
    ):
        calculate(factory())
