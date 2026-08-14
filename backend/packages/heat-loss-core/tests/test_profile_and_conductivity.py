"""Pure contracts for profile resolution and typed conductivity laws."""

from __future__ import annotations

import math
from dataclasses import FrozenInstanceError

import pytest
from heatcalc_heat_loss_core.conductivity import (
    AffineConductivity,
    ConstantConductivity,
    InsulationConductivityTemperatures,
    PiecewiseConductivity,
    UnavailableConductivity,
    evaluate_conductivity,
    evaluate_insulation_conductivity,
)
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.profile import (
    CASE_1_PROFILE,
    HeatLossFormulaProfile,
    resolve_external_alpha,
    resolve_insulation_temperature,
    validate_heat_loss_formula_profile,
)


def test_case_1_profile_is_frozen_and_has_legacy_defaults() -> None:
    assert HeatLossFormulaProfile() == CASE_1_PROFILE
    with pytest.raises(FrozenInstanceError):
        CASE_1_PROFILE.default_safety_factor = 2.0  # type: ignore[misc]


WARM_INSULATION_BASES = (
    "indoor",
    "outdoor_summer",
    "channel",
    "tunnel",
    "technical_subfloor",
    "attic",
    "basement",
)


def mineral_wool_boards_120_law() -> PiecewiseConductivity:
    return PiecewiseConductivity(
        threshold_c=20.0,
        at_or_above=AffineConductivity(0.045, 0.00021),
        below=PiecewiseConductivity(
            threshold_c=-60.0,
            at_or_above=ConstantConductivity(0.044),
            below=ConstantConductivity(0.035),
        ),
    )


@pytest.mark.parametrize("basis", WARM_INSULATION_BASES)
@pytest.mark.parametrize("process_temperature_c", [10.0, 19.0, 20.0, 30.0, 80.0])
def test_warm_bases_use_profile_reference(basis: str, process_temperature_c: float) -> None:
    assert resolve_insulation_temperature(
        process_temperature_c,
        basis=basis,  # type: ignore[arg-type]
    ) == pytest.approx((process_temperature_c + 40.0) / 2.0)


@pytest.mark.parametrize("process_temperature_c", [10.0, 19.0, 20.0, 30.0, 80.0, -60.0])
def test_outdoor_winter_uses_half_process_formula(process_temperature_c: float) -> None:
    assert resolve_insulation_temperature(
        process_temperature_c, basis="outdoor_winter"
    ) == pytest.approx(process_temperature_c / 2.0)


def test_outdoor_winter_is_half_process_and_preserves_signed_zero() -> None:
    value = resolve_insulation_temperature(-0.0, basis="outdoor_winter")

    assert value == 0.0
    assert math.copysign(1.0, value) == -1.0


def test_alpha_uses_indoor_constant_and_outdoor_correlation() -> None:
    assert resolve_external_alpha(placement="indoor", wind_speed_m_s=None) == 9.0
    assert resolve_external_alpha(placement="outdoor", wind_speed_m_s=4.0) == pytest.approx(25.6)
    assert resolve_external_alpha(placement="underground", wind_speed_m_s=0.0) == pytest.approx(
        11.6
    )
    assert resolve_external_alpha(placement="outdoor", wind_speed_m_s=-5.0) == pytest.approx(11.6)


def test_profile_resolvers_reject_unknown_modes_with_domain_codes() -> None:
    with pytest.raises(FormulaDomainError, match="unknown_insulation_temperature_basis"):
        resolve_insulation_temperature(80.0, basis="unknown")  # type: ignore[arg-type]
    with pytest.raises(FormulaDomainError, match="unknown_external_alpha_placement"):
        resolve_external_alpha(placement="unknown", wind_speed_m_s=0.0)  # type: ignore[arg-type]
    with pytest.raises(FormulaDomainError, match="wind_speed_required"):
        resolve_external_alpha(placement="outdoor", wind_speed_m_s=None)


@pytest.mark.parametrize(
    ("changes", "expected_code", "expected_path"),
    [
        (
            {"indoor_external_alpha_w_m2k": 0.0},
            "below_min_exclusive",
            ("profile", "indoor_external_alpha_w_m2k"),
        ),
        (
            {"indoor_external_alpha_w_m2k": math.nan},
            "not_finite",
            ("profile", "indoor_external_alpha_w_m2k"),
        ),
        (
            {"outdoor_alpha_intercept_w_m2k": -1.0},
            "below_min_exclusive",
            ("profile", "outdoor_alpha_intercept_w_m2k"),
        ),
        (
            {"outdoor_alpha_intercept_w_m2k": math.inf},
            "not_finite",
            ("profile", "outdoor_alpha_intercept_w_m2k"),
        ),
        (
            {"outdoor_alpha_sqrt_coefficient": -1.0},
            "below_min_inclusive",
            ("profile", "outdoor_alpha_sqrt_coefficient"),
        ),
        (
            {"outdoor_alpha_sqrt_coefficient": math.nan},
            "not_finite",
            ("profile", "outdoor_alpha_sqrt_coefficient"),
        ),
        (
            {"default_safety_factor": 0.0},
            "below_min_inclusive",
            ("profile", "default_safety_factor"),
        ),
        (
            {"default_safety_factor": math.inf},
            "not_finite",
            ("profile", "default_safety_factor"),
        ),
        (
            {"warm_insulation_reference_temperature_c": math.nan},
            "not_finite",
            ("profile", "warm_insulation_reference_temperature_c"),
        ),
        (
            {"warm_insulation_reference_temperature_c": -math.inf},
            "not_finite",
            ("profile", "warm_insulation_reference_temperature_c"),
        ),
    ],
)
def test_formula_profile_reports_invalid_constants(
    changes: dict[str, float],
    expected_code: str,
    expected_path: tuple[str, str],
) -> None:
    values = {
        "indoor_external_alpha_w_m2k": 9.0,
        "outdoor_alpha_intercept_w_m2k": 11.6,
        "outdoor_alpha_sqrt_coefficient": 7.0,
        "default_safety_factor": 1.1,
        "warm_insulation_reference_temperature_c": 40.0,
    }
    values.update(changes)

    report = validate_heat_loss_formula_profile(HeatLossFormulaProfile(**values))

    assert not report.is_valid
    assert report.issues[0].code == expected_code
    assert report.issues[0].path == expected_path


def test_case_1_profile_passes_public_profile_validation() -> None:
    assert validate_heat_loss_formula_profile(CASE_1_PROFILE).is_valid


def test_zero_outdoor_sqrt_coefficient_is_a_valid_constant_profile() -> None:
    profile = HeatLossFormulaProfile(outdoor_alpha_sqrt_coefficient=0.0)
    assert validate_heat_loss_formula_profile(profile).is_valid


def test_affine_law_supports_offset_and_floor() -> None:
    law = AffineConductivity(
        intercept_w_mk=0.02,
        slope_w_mk_per_c=0.001,
        temperature_offset_c=-20.0,
        minimum_w_mk=0.04,
    )

    assert evaluate_conductivity(law, 50.0) == pytest.approx(0.05)
    assert evaluate_conductivity(law, 0.0) == pytest.approx(0.04)


def test_piecewise_law_recurses_at_exact_threshold() -> None:
    law = PiecewiseConductivity(
        threshold_c=20.0,
        at_or_above=AffineConductivity(0.03, 0.001),
        below=ConstantConductivity(0.04),
    )

    assert evaluate_conductivity(law, 19.0) == 0.04
    assert evaluate_conductivity(law, 20.0) == pytest.approx(0.05)


def test_piecewise_law_rejects_non_finite_threshold() -> None:
    law = PiecewiseConductivity(
        threshold_c=math.nan,
        at_or_above=ConstantConductivity(0.05),
        below=ConstantConductivity(0.04),
    )

    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        evaluate_conductivity(law, 20.0)


def test_piecewise_law_only_rejects_the_selected_unavailable_branch() -> None:
    law = PiecewiseConductivity(
        threshold_c=20.0,
        at_or_above=ConstantConductivity(0.05),
        below=UnavailableConductivity(),
    )

    assert evaluate_conductivity(law, 20.0) == 0.05
    with pytest.raises(FormulaDomainError, match="conductivity_law_unavailable"):
        evaluate_conductivity(law, 19.0)


@pytest.mark.parametrize("value", [0.0, -0.01])
def test_conductivity_law_rejects_non_positive_result(value: float) -> None:
    with pytest.raises(FormulaDomainError, match="conductivity_not_positive"):
        evaluate_conductivity(ConstantConductivity(value), 20.0)


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_non_finite_temperature_or_law_result_raises(value: float) -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        evaluate_conductivity(ConstantConductivity(0.04), value)
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        evaluate_conductivity(ConstantConductivity(value), 20.0)


@pytest.mark.parametrize(
    ("process_temperature_c", "insulation_temperature_c", "expected"),
    [
        (80.0, 40.0, 0.0534),
        (30.0, 15.0, 0.04815),
        (10.0, 25.0, 0.044),
        (20.0, 10.0, 0.0471),
        (19.0, 9.5, 0.044),
        (-60.0, -30.0, 0.044),
        (-80.0, -40.0, 0.035),
    ],
)
def test_reference_law_selects_by_process_temperature_and_evaluates_tm(
    process_temperature_c: float,
    insulation_temperature_c: float,
    expected: float,
) -> None:
    value = evaluate_insulation_conductivity(
        mineral_wool_boards_120_law(),
        InsulationConductivityTemperatures(
            process_temperature_c=process_temperature_c,
            insulation_temperature_c=insulation_temperature_c,
        ),
    )

    assert value == pytest.approx(expected)


def test_single_temperature_helper_keeps_shared_selector_and_formula_temperature() -> None:
    law = mineral_wool_boards_120_law()

    assert evaluate_conductivity(law, 15.0) == pytest.approx(0.044)
    assert evaluate_conductivity(law, 30.0) == pytest.approx(0.045 + 0.00021 * 30.0)
    assert evaluate_conductivity(law, -80.0) == pytest.approx(0.035)
