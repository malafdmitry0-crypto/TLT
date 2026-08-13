"""Tests for high-level resolved tank evaluation."""

from unittest.mock import patch

import pytest
from heatcalc_heat_loss_core.conductivity import ConstantConductivity, UnavailableConductivity
from heatcalc_heat_loss_core.errors import FormulaDomainError
from heatcalc_heat_loss_core.tank import (
    AirTankHeatLossInput,
    BuriedTankHeatLossInput,
    CylindricalTankGeometry,
    TankInsulationLayer,
    calculate_air_tank_heat_loss,
    calculate_buried_tank_heat_loss,
)
from heatcalc_heat_loss_core.tank_evaluation import (
    ResolvedAirTankEvaluationInput,
    ResolvedBuriedTankEvaluationInput,
    ResolvedTankLayer,
    evaluate_resolved_air_tank,
    evaluate_resolved_buried_tank,
)


def _layers() -> tuple[ResolvedTankLayer, ...]:
    return (
        ResolvedTankLayer(0.08, ConstantConductivity(0.04), -60.0, 200.0),
        ResolvedTankLayer(0.04, ConstantConductivity(0.05), -60.0, 200.0),
    )


def _air(**changes: object) -> ResolvedAirTankEvaluationInput:
    values: dict[str, object] = {
        "geometry": CylindricalTankGeometry(2.0, 3.0),
        "wall_thickness_m": 0.008,
        "wall_conductivity_w_mk": 50.0,
        "insulation_layers": _layers(),
        "process_temperature_c": 80.0,
        "ambient_temperature_c": -20.0,
        "placement": "outdoor",
        "wind_speed_m_s": 4.0,
        "insulation_temperature_basis": "outdoor_winter",
        "safety_factor": 1.1,
        "additional_heat_loss_w": 17.0,
    }
    values.update(changes)
    return ResolvedAirTankEvaluationInput(**values)  # type: ignore[arg-type]


def _buried(**changes: object) -> ResolvedBuriedTankEvaluationInput:
    values = dict(_air().__dict__)
    values.update(
        ground_temperature_c=5.0,
        buried_height_m=1.0,
        ground_conductivity_w_mk=1.5,
        insulation_temperature_basis="channel",
        placement="underground",
    )
    values.update(changes)
    return ResolvedBuriedTankEvaluationInput(**values)


def test_air_evaluation_equals_direct_low_level_branch() -> None:
    data = _air()
    result = evaluate_resolved_air_tank(data)
    direct = calculate_air_tank_heat_loss(
        AirTankHeatLossInput(
            data.geometry,
            data.wall_thickness_m,
            data.wall_conductivity_w_mk,
            tuple(
                TankInsulationLayer(layer.thickness_m, value)
                for layer, value in zip(
                    data.insulation_layers, result.layer_conductivities_w_mk, strict=True
                )
            ),
            data.process_temperature_c,
            data.ambient_temperature_c,
            result.external_alpha_w_m2k,
            data.safety_factor,
            data.additional_heat_loss_w,
        )
    )

    assert result.core_result == direct
    assert result.insulation_temperature_c == 40.0
    assert result.external_alpha_w_m2k == pytest.approx(25.6)
    assert result.layer_temperature_report.is_valid


def test_buried_evaluation_equals_direct_low_level_branch_and_profile_metadata() -> None:
    data = _buried()
    result = evaluate_resolved_buried_tank(data)
    direct = calculate_buried_tank_heat_loss(
        BuriedTankHeatLossInput(
            data.geometry,
            data.wall_thickness_m,
            data.wall_conductivity_w_mk,
            tuple(
                TankInsulationLayer(layer.thickness_m, value)
                for layer, value in zip(
                    data.insulation_layers, result.layer_conductivities_w_mk, strict=True
                )
            ),
            data.process_temperature_c,
            data.ambient_temperature_c,
            data.ground_temperature_c,
            result.external_alpha_w_m2k,
            data.buried_height_m,
            data.ground_conductivity_w_mk,
            data.safety_factor,
            data.additional_heat_loss_w,
        )
    )

    assert result.core_result == direct
    assert result.insulation_temperature_c == 60.0
    assert result.formula_model == "tank_heat_loss"
    assert result.formula_model_version == "3"
    assert result.model_assumptions == (
        "plane_wall_resistance_for_cylindrical_and_rectangular_tank",
    )


def test_air_issues_precede_ground_issues_with_numeric_evidence() -> None:
    result = evaluate_resolved_buried_tank(
        _buried(
            insulation_layers=(ResolvedTankLayer(0.08, ConstantConductivity(0.04), 100.0, 101.0),)
        )
    )

    assert [(issue.code, issue.path) for issue in result.layer_temperature_report.issues] == [
        ("temperature_outside_interval", ("insulation_layers", 0)),
        ("temperature_outside_interval", ("insulation_layers", 0)),
    ]
    assert result.layer_temperature_report.issues[0].details_dict()["temperature_c"] < 100.0
    assert result.layer_temperature_report.issues[1].details_dict()["temperature_c"] < 100.0


def test_resolvers_and_low_level_branch_are_each_called_once() -> None:
    with (
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.resolve_insulation_temperature",
            wraps=__import__(
                "heatcalc_heat_loss_core.tank_evaluation",
                fromlist=["resolve_insulation_temperature"],
            ).resolve_insulation_temperature,
        ) as tm,
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.evaluate_conductivity",
            wraps=__import__(
                "heatcalc_heat_loss_core.tank_evaluation", fromlist=["evaluate_conductivity"]
            ).evaluate_conductivity,
        ) as conductivity,
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.resolve_external_alpha",
            wraps=__import__(
                "heatcalc_heat_loss_core.tank_evaluation", fromlist=["resolve_external_alpha"]
            ).resolve_external_alpha,
        ) as alpha,
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.calculate_air_tank_heat_loss",
            wraps=calculate_air_tank_heat_loss,
        ) as branch,
    ):
        evaluate_resolved_air_tank(_air())

    tm.assert_called_once()
    assert conductivity.call_count == 2
    alpha.assert_called_once()
    branch.assert_called_once()


def test_nonfinite_conductivity_propagates_core_domain_error() -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        evaluate_resolved_air_tank(
            _air(
                insulation_layers=(
                    ResolvedTankLayer(0.08, ConstantConductivity(float("inf")), -60.0, 200.0),
                )
            )
        )


def test_unavailable_layer_law_reports_layer_and_temperature() -> None:
    with pytest.raises(FormulaDomainError, match="conductivity_law_unavailable") as exc_info:
        evaluate_resolved_air_tank(
            _air(
                insulation_layers=(
                    ResolvedTankLayer(0.08, UnavailableConductivity(), -60.0, 200.0),
                )
            )
        )

    assert exc_info.value.details == {"layer_index": 0, "temperature_c": 40.0}
