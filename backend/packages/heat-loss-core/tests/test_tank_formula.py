"""New tank preparation/prepared path without changing existing evaluators."""

from __future__ import annotations

import pytest
from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.tank import CylindricalTankGeometry
from heatcalc_heat_loss_core.tank_evaluation import (
    ResolvedAirTankEvaluationInput,
    ResolvedTankLayer,
    evaluate_resolved_air_tank,
)
from heatcalc_heat_loss_core.tank_formula import (
    TankPreparationInput,
    TankPreparationLayer,
    prepare_tank_calculation,
    run_tank_formula,
)
from heatcalc_heat_loss_core.validation import FormulaValidationReport


def _layer(**changes: object) -> TankPreparationLayer:
    values: dict[str, object] = {
        "thickness_m": 0.08,
        "source": "manual",
        "conductivity_supplied": True,
        "manual_temperature_range_c": (-90.0, 600.0),
        "reference_temperature_range_c": None,
        "conductivity_law": ConstantConductivity(0.04),
    }
    values.update(changes)
    return TankPreparationLayer(**values)  # type: ignore[arg-type]


def _prep(**changes: object) -> TankPreparationInput:
    values: dict[str, object] = {
        "shape": "cylindrical",
        "placement": "outdoor",
        "insulation_temperature_basis": "outdoor_winter",
        "diameter": 2.0,
        "height": 3.0,
        "length": None,
        "width": None,
        "layers": (_layer(),),
        "ambient_temperature": -30.0,
        "ground_temperature": None,
        "process_temperature": 70.0,
        "wall_thickness": 0.008,
        "wall_lambda": 50.0,
        "tank_buried_height": None,
        "ground_conductivity": None,
        "wind_speed": 3.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
        "wall_conductivity_law": ConstantConductivity(50.0),
    }
    values.update(changes)
    return TankPreparationInput(**values)  # type: ignore[arg-type]


def test_tank_preparation_allows_missing_layer_law() -> None:
    assert _prep(layers=(_layer(conductivity_law=None),)).layers[0].conductivity_law is None


def test_tank_zero_safety_factor_is_rejected_by_range() -> None:
    outcome = run_tank_formula(_prep(safety_factor=0.0))
    assert outcome.result is None
    assert outcome.report.issues[0].code == "below_min_inclusive"
    assert outcome.report.issues[0].path == ("safety_factor",)


def test_tank_safety_factor_stays_required_on_preparation() -> None:
    with pytest.raises(TypeError):
        TankPreparationInput(  # type: ignore[misc]
            shape="cylindrical",
            placement="outdoor",
            insulation_temperature_basis="outdoor_winter",
            diameter=2.0,
            height=3.0,
            length=None,
            width=None,
            layers=(_layer(),),
            ambient_temperature=-30.0,
            ground_temperature=None,
            process_temperature=70.0,
            wall_thickness=0.008,
            wall_lambda=50.0,
            tank_buried_height=None,
            ground_conductivity=None,
            wind_speed=3.0,
            q_additional=0.0,
        )


def test_run_tank_formula_matches_old_air_evaluator() -> None:
    outcome = run_tank_formula(_prep())
    assert outcome.is_success
    assert outcome.result is not None
    legacy = evaluate_resolved_air_tank(
        ResolvedAirTankEvaluationInput(
            geometry=CylindricalTankGeometry(2.0, 3.0),
            wall_thickness_m=0.008,
            wall_conductivity_w_mk=50.0,
            insulation_layers=(
                ResolvedTankLayer(0.08, ConstantConductivity(0.04), -90.0, 600.0),
            ),
            process_temperature_c=70.0,
            ambient_temperature_c=-30.0,
            placement="outdoor",
            wind_speed_m_s=3.0,
            insulation_temperature_basis="outdoor_winter",
            safety_factor=1.1,
            additional_heat_loss_w=0.0,
        )
    )
    assert outcome.result.core_result == legacy.core_result


def test_tank_layer_temperature_failure_clears_result() -> None:
    outcome = run_tank_formula(
        _prep(layers=(_layer(manual_temperature_range_c=(-10.0, 10.0)),))
    )
    assert outcome.result is None
    assert [issue.code for issue in outcome.report.issues] == ["temperature_outside_interval"]


def test_tank_prepare_keeps_explicit_k() -> None:
    prepared = prepare_tank_calculation(_prep(safety_factor=1.2))
    assert not isinstance(prepared, FormulaValidationReport)
    assert prepared.safety_factor == pytest.approx(1.2)
