"""Pure contracts for profile resolution and typed conductivity laws."""

from __future__ import annotations

import math
from dataclasses import FrozenInstanceError

import pytest
from heatcalc_heat_loss_core.conductivity import (
    AffineConductivity,
    ConstantConductivity,
    PiecewiseConductivity,
    UnavailableConductivity,
    evaluate_conductivity,
)
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.profile import (
    CASE_1_PROFILE,
    HeatLossFormulaProfile,
    resolve_external_alpha,
    resolve_insulation_temperature,
    resolve_safety_factor,
)


def test_case_1_profile_is_frozen_and_has_legacy_defaults() -> None:
    assert HeatLossFormulaProfile() == CASE_1_PROFILE
    with pytest.raises(FrozenInstanceError):
        CASE_1_PROFILE.default_safety_factor = 2.0  # type: ignore[misc]


@pytest.mark.parametrize(
    "basis",
    [
        "indoor",
        "outdoor_summer",
        "channel",
        "tunnel",
        "technical_subfloor",
        "attic",
        "basement",
    ],
)
def test_warm_bases_use_profile_reference(basis: str) -> None:
    assert resolve_insulation_temperature(80.0, basis=basis) == 60.0  # type: ignore[arg-type]


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


def test_safety_factor_preserves_truthy_primary_then_present_override_precedence() -> None:
    assert resolve_safety_factor(primary=1.2, override=1.3) == 1.2
    assert resolve_safety_factor(primary=0.0, override=1.3) == 1.3
    assert resolve_safety_factor(primary=0.0, override=0.0) == 0.0
    assert resolve_safety_factor(primary=None) == 1.1


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
