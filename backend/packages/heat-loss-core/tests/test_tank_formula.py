"""Canonical tank formula interface."""

from __future__ import annotations

import pytest
from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.profile import HeatLossFormulaProfile
from heatcalc_heat_loss_core.tank_formula import (
    AirTankFormulaEnvironment,
    BuriedTankFormulaEnvironment,
    TankPreparationInput,
    TankPreparationLayer,
    assemble_prepared_tank,
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
        TankPreparationInput(  # type: ignore[call-arg]
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


def test_run_tank_formula_returns_unrounded_result_without_error_payload() -> None:
    outcome = run_tank_formula(_prep())
    assert outcome.is_success
    assert outcome.result is not None
    assert outcome.report.is_valid
    assert outcome.result.formula_model == "tank_heat_loss"
    assert outcome.result.formula_model_version == "3"
    assert outcome.result.safety_factor_applied == pytest.approx(1.1)


def test_tank_layer_temperature_failure_clears_result() -> None:
    outcome = run_tank_formula(_prep(layers=(_layer(manual_temperature_range_c=(-10.0, 10.0)),)))
    assert outcome.result is None
    assert [issue.code for issue in outcome.report.issues] == ["temperature_outside_interval"]


def test_tank_prepare_keeps_explicit_k() -> None:
    prepared = prepare_tank_calculation(_prep(safety_factor=1.2))
    assert not isinstance(prepared, FormulaValidationReport)
    assert prepared.safety_factor == pytest.approx(1.2)


def test_invalid_tank_profile_is_a_structured_preparation_error() -> None:
    outcome = run_tank_formula(
        _prep(profile=HeatLossFormulaProfile(indoor_external_alpha_w_m2k=0.0))
    )

    assert outcome.result is None
    assert outcome.report.issues[0].code == "below_min_exclusive"
    assert outcome.report.issues[0].path == ("profile", "indoor_external_alpha_w_m2k")


def test_standalone_tank_path_does_not_call_late_bound_assembler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_assembler(
        data: TankPreparationInput,
    ) -> object:
        del data
        raise AssertionError("standalone path repeated late-bound validation")

    monkeypatch.setattr(
        "heatcalc_heat_loss_core.tank_formula.assemble_prepared_tank",
        unexpected_assembler,
    )

    assert run_tank_formula(_prep()).is_success


def test_direct_tank_assembler_still_rejects_invalid_late_bound_k() -> None:
    report = assemble_prepared_tank(_prep(safety_factor=2.0))
    assert isinstance(report, FormulaValidationReport)
    assert report.issues[0].code == "above_max_inclusive"


def test_prepared_tank_contains_one_resolved_environment_branch() -> None:
    prepared = prepare_tank_calculation(_prep())
    assert not isinstance(prepared, FormulaValidationReport)
    assert isinstance(prepared.environment, AirTankFormulaEnvironment)
    assert prepared.environment.ambient_temperature_c == pytest.approx(-30.0)
    assert "ambient_temperature_c" not in prepared.__dataclass_fields__
    assert "ground_temperature_c" not in prepared.__dataclass_fields__


def test_prepared_underground_tank_contains_required_ground_environment() -> None:
    prepared = prepare_tank_calculation(
        _prep(
            placement="underground",
            insulation_temperature_basis="channel",
            ground_temperature=5.0,
            tank_buried_height=1.0,
            ground_conductivity=1.5,
        )
    )
    assert not isinstance(prepared, FormulaValidationReport)
    assert isinstance(prepared.environment, BuriedTankFormulaEnvironment)
    assert prepared.environment.ground_temperature_c == pytest.approx(5.0)
    assert prepared.environment.buried_height_m == pytest.approx(1.0)
