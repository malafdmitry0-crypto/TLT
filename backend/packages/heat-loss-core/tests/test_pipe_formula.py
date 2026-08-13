"""Canonical pipe formula interface."""

from __future__ import annotations

import math

import pytest
from heatcalc_heat_loss_core.conductivity import ConstantConductivity
from heatcalc_heat_loss_core.formula_outcome import FormulaOutcome
from heatcalc_heat_loss_core.pipe_evaluation import (
    AirPipeEvaluationInput,
    UndergroundPipeEvaluationInput,
)
from heatcalc_heat_loss_core.pipe_formula import (
    PipePreparationInput,
    PipePreparationLayer,
    assemble_prepared_pipe,
    evaluate_prepared_pipe,
    prepare_pipe_calculation,
    run_pipe_formula,
)
from heatcalc_heat_loss_core.profile import CASE_1_PROFILE, HeatLossFormulaProfile
from heatcalc_heat_loss_core.validation import FormulaValidationReport


def _layer(**changes: object) -> PipePreparationLayer:
    values: dict[str, object] = {
        "thickness_m": 0.05,
        "source": "manual",
        "conductivity_supplied": True,
        "manual_temperature_range_c": (-90.0, 600.0),
        "reference_temperature_interval_c": None,
        "conductivity_law": ConstantConductivity(0.04),
    }
    values.update(changes)
    return PipePreparationLayer(**values)  # type: ignore[arg-type]


def _prep(**changes: object) -> PipePreparationInput:
    values: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_lambda": 45.0,
        "has_pipe_material": False,
        "layers": (_layer(),),
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 50.0,
        "pipe_centerline_depth": None,
        "num_local_elements": 2,
        "local_element_equiv_length": 1.5,
        "wind_speed": 3.0,
        "ground_conductivity": None,
        "ground_temperature": None,
        "safety_factor": 1.2,
        "placement": "outdoor",
        "insulation_temperature_basis": "outdoor_winter",
        "wall_conductivity_law": ConstantConductivity(45.0),
    }
    values.update(changes)
    return PipePreparationInput(**values)  # type: ignore[arg-type]


def test_preparation_allows_missing_conductivity_law() -> None:
    candidate = _prep(layers=(_layer(conductivity_law=None),), wall_conductivity_law=None)
    assert candidate.layers[0].conductivity_law is None
    assert candidate.wall_conductivity_law is None


def test_prepare_rejects_missing_law_after_contract_passes() -> None:
    report = prepare_pipe_calculation(_prep(wall_conductivity_law=None))
    assert isinstance(report, FormulaValidationReport)
    assert report.issues[0].code == "conductivity_law_required"


def test_zero_safety_factor_is_rejected_by_range_on_new_path() -> None:
    outcome = run_pipe_formula(_prep(safety_factor=0.0))
    assert outcome.result is None
    assert [issue.code for issue in outcome.report.issues] == ["below_min_inclusive"]
    assert outcome.report.issues[0].path == ("safety_factor",)


def test_missing_safety_factor_uses_profile_default() -> None:
    prepared = prepare_pipe_calculation(_prep(safety_factor=None))
    assert not isinstance(prepared, FormulaValidationReport)
    assert prepared.safety_factor == pytest.approx(1.1)


def test_invalid_profile_default_is_a_structured_preparation_error() -> None:
    outcome = run_pipe_formula(
        _prep(
            safety_factor=None,
            profile=HeatLossFormulaProfile(default_safety_factor=0.0),
        )
    )

    assert outcome.result is None
    assert outcome.report.issues[0].code == "below_min_inclusive"
    assert outcome.report.issues[0].path == ("profile", "default_safety_factor")


def test_standalone_pipe_path_does_not_call_late_bound_assembler(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_assembler(
        data: PipePreparationInput,
    ) -> object:
        del data
        raise AssertionError("standalone path repeated late-bound validation")

    monkeypatch.setattr(
        "heatcalc_heat_loss_core.pipe_formula.assemble_prepared_pipe",
        unexpected_assembler,
    )

    assert run_pipe_formula(_prep()).is_success


def test_direct_pipe_assembler_still_rejects_invalid_late_bound_k() -> None:
    report = assemble_prepared_pipe(_prep(safety_factor=2.0))
    assert isinstance(report, FormulaValidationReport)
    assert report.issues[0].code == "above_max_inclusive"


def test_run_pipe_formula_returns_unrounded_result_without_error_payload() -> None:
    outcome = run_pipe_formula(_prep())
    assert outcome.is_success
    assert outcome.result is not None
    assert outcome.report.is_valid

    assert outcome.result.external_alpha_w_m2k == pytest.approx(11.6 + 7.0 * math.sqrt(3.0))
    assert outcome.result.safety_factor == pytest.approx(1.2)
    assert outcome.result.formula_model == "pipe_heat_loss"
    assert outcome.result.formula_model_version == "2"


def test_layer_temperature_failure_is_not_a_successful_result() -> None:
    outcome = run_pipe_formula(_prep(layers=(_layer(manual_temperature_range_c=(-10.0, 10.0)),)))
    assert outcome.result is None
    assert [issue.code for issue in outcome.report.issues] == ["temperature_outside_interval"]
    with pytest.raises(ValueError, match="successful formula result cannot carry"):
        FormulaOutcome(result=object(), report=outcome.report)


def test_underground_preparation_uses_ground_environment() -> None:
    outcome = run_pipe_formula(
        _prep(
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=5.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=1.2,
            num_local_elements=0,
            local_element_equiv_length=None,
        )
    )
    assert outcome.is_success
    assert outcome.result is not None
    assert outcome.result.external_alpha_w_m2k is None
    assert outcome.result.ground_conductivity_w_mk == pytest.approx(1.5)


def test_new_pipe_path_has_one_effective_safety_factor_and_no_admin_vocabulary() -> None:
    assert "safety_factor_primary" not in PipePreparationInput.__dataclass_fields__
    assert "safety_factor_override" not in PipePreparationInput.__dataclass_fields__
    assert "environment" not in PipePreparationInput.__dataclass_fields__
    assert "admin" not in PipePreparationInput.__doc__.lower()  # type: ignore[union-attr]


def test_prepared_pipe_derives_environment_from_the_same_scalars() -> None:
    prepared = prepare_pipe_calculation(_prep())
    assert not isinstance(prepared, FormulaValidationReport)
    assert isinstance(prepared.environment, AirPipeEvaluationInput)
    assert prepared.environment.ambient_temperature_c == pytest.approx(-20.0)
    assert prepared.environment.wind_speed_m_s == pytest.approx(3.0)
    assert "ambient_temperature_c" not in prepared.__dataclass_fields__
    assert "ground_temperature_c" not in prepared.__dataclass_fields__


def test_prepared_underground_pipe_contains_required_ground_environment() -> None:
    prepared = prepare_pipe_calculation(
        _prep(
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=5.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=1.2,
            num_local_elements=0,
            local_element_equiv_length=None,
        )
    )
    assert not isinstance(prepared, FormulaValidationReport)
    assert isinstance(prepared.environment, UndergroundPipeEvaluationInput)
    assert prepared.environment.ground_temperature_c == pytest.approx(5.0)
    assert prepared.environment.centerline_depth_m == pytest.approx(1.2)


def test_custom_profile_supplies_default_k_and_indoor_alpha() -> None:
    profile = HeatLossFormulaProfile(
        indoor_external_alpha_w_m2k=8.5,
        default_safety_factor=1.3,
    )
    outcome = run_pipe_formula(
        _prep(
            placement="indoor",
            insulation_temperature_basis="indoor",
            wind_speed=None,
            safety_factor=None,
            profile=profile,
        )
    )
    assert outcome.is_success
    assert outcome.result is not None
    assert outcome.result.safety_factor == pytest.approx(1.3)
    assert outcome.result.external_alpha_w_m2k == pytest.approx(8.5)
    assert CASE_1_PROFILE.default_safety_factor == pytest.approx(1.1)


def test_evaluate_prepared_pipe_rejects_optional_law_type() -> None:
    prepared = prepare_pipe_calculation(_prep())
    assert not isinstance(prepared, FormulaValidationReport)
    outcome = evaluate_prepared_pipe(prepared)
    assert outcome.is_success
    assert all(layer.conductivity_law is not None for layer in prepared.layers)
