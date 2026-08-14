"""Tests for the internal prepared tank execution kernel."""

from unittest.mock import patch

import pytest
from heatcalc_heat_loss_core.conductivity import (
    AffineConductivity,
    ConstantConductivity,
    PiecewiseConductivity,
    UnavailableConductivity,
)
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
    AirTankFormulaEnvironment,
    BuriedTankFormulaEnvironment,
    PreparedTankCalculation,
    PreparedTankLayer,
    execute_prepared_tank,
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


def _layers() -> tuple[PreparedTankLayer, ...]:
    return (
        PreparedTankLayer(0.08, "manual", ConstantConductivity(0.04), -60.0, 200.0),
        PreparedTankLayer(0.04, "manual", ConstantConductivity(0.05), -60.0, 200.0),
    )


def _air(**changes: object) -> PreparedTankCalculation:
    values: dict[str, object] = {
        "geometry": CylindricalTankGeometry(2.0, 3.0),
        "wall_thickness_m": 0.008,
        "wall_conductivity_w_mk": 50.0,
        "layers": _layers(),
        "process_temperature_c": 80.0,
        "environment": AirTankFormulaEnvironment("outdoor", -20.0, 4.0),
        "insulation_temperature_basis": "outdoor_winter",
        "safety_factor": 1.1,
        "additional_heat_loss_w": 17.0,
    }
    values.update(changes)
    return PreparedTankCalculation(**values)  # type: ignore[arg-type]


def _buried(**changes: object) -> PreparedTankCalculation:
    values = dict(_air().__dict__)
    values.update(
        environment=BuriedTankFormulaEnvironment("underground", -20.0, 5.0, 1.0, 1.5, 4.0),
        insulation_temperature_basis="channel",
    )
    values.update(changes)
    return PreparedTankCalculation(**values)


def test_air_execution_equals_direct_low_level_branch() -> None:
    data = _air()
    result = execute_prepared_tank(data)
    environment = data.environment
    assert isinstance(environment, AirTankFormulaEnvironment)
    direct = calculate_air_tank_heat_loss(
        AirTankHeatLossInput(
            data.geometry,
            data.wall_thickness_m,
            data.wall_conductivity_w_mk,
            tuple(
                TankInsulationLayer(layer.thickness_m, value)
                for layer, value in zip(data.layers, result.layer_conductivities_w_mk, strict=True)
            ),
            data.process_temperature_c,
            environment.ambient_temperature_c,
            result.external_alpha_w_m2k,
            data.safety_factor,
            data.additional_heat_loss_w,
        )
    )

    assert result.core_result == direct
    assert result.insulation_temperature_c == 40.0
    assert result.external_alpha_w_m2k == pytest.approx(25.6)
    assert result.layer_temperature_report.is_valid


def test_buried_execution_equals_direct_low_level_branch_and_metadata() -> None:
    data = _buried()
    result = execute_prepared_tank(data)
    environment = data.environment
    assert isinstance(environment, BuriedTankFormulaEnvironment)
    direct = calculate_buried_tank_heat_loss(
        BuriedTankHeatLossInput(
            data.geometry,
            data.wall_thickness_m,
            data.wall_conductivity_w_mk,
            tuple(
                TankInsulationLayer(layer.thickness_m, value)
                for layer, value in zip(data.layers, result.layer_conductivities_w_mk, strict=True)
            ),
            data.process_temperature_c,
            environment.ambient_temperature_c,
            environment.ground_temperature_c,
            result.external_alpha_w_m2k,
            environment.buried_height_m,
            environment.ground_conductivity_w_mk,
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
    result = execute_prepared_tank(
        _buried(
            layers=(PreparedTankLayer(0.08, "manual", ConstantConductivity(0.04), 100.0, 101.0),)
        )
    )

    assert [(issue.code, issue.path) for issue in result.layer_temperature_report.issues] == [
        ("temperature_outside_interval", ("insulation_layers", 0)),
        ("temperature_outside_interval", ("insulation_layers", 0)),
    ]
    assert result.layer_temperature_report.issues[0].details_dict()["temperature_c"] < 100.0
    assert result.layer_temperature_report.issues[1].details_dict()["temperature_c"] < 100.0


def test_air_cold_boundary_below_material_minimum_is_reported() -> None:
    result = execute_prepared_tank(
        _air(
            layers=(
                PreparedTankLayer(0.08, "manual", ConstantConductivity(0.04), -10.0, 200.0),
            )
        )
    )

    assert len(result.layer_temperature_report.issues) == 1
    issue = result.layer_temperature_report.issues[0]
    assert (issue.code, issue.path) == (
        "temperature_outside_interval",
        ("insulation_layers", 0),
    )
    assert issue.details_dict()["temperature_c"] < -10.0


def test_buried_air_and_ground_cold_boundaries_below_minimum_are_reported() -> None:
    result = execute_prepared_tank(
        _buried(
            layers=(
                PreparedTankLayer(0.08, "manual", ConstantConductivity(0.04), 30.0, 200.0),
            )
        )
    )

    assert len(result.layer_temperature_report.issues) == 2
    assert all(
        (issue.code, issue.path)
        == ("temperature_outside_interval", ("insulation_layers", 0))
        for issue in result.layer_temperature_report.issues
    )
    assert all(
        issue.details_dict()["temperature_c"] < 30.0
        for issue in result.layer_temperature_report.issues
    )


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
            "heatcalc_heat_loss_core.tank_evaluation.evaluate_insulation_conductivity",
            wraps=__import__(
                "heatcalc_heat_loss_core.tank_evaluation",
                fromlist=["evaluate_insulation_conductivity"],
            ).evaluate_insulation_conductivity,
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
        ) as air_branch,
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.calculate_buried_tank_heat_loss",
            wraps=calculate_buried_tank_heat_loss,
        ) as buried_branch,
    ):
        execute_prepared_tank(
            _air(
                layers=(
                    PreparedTankLayer(
                        0.08,
                        "reference",
                        mineral_wool_boards_120_law(),
                        -60.0,
                        400.0,
                    ),
                )
            )
        )

    tm.assert_called_once()
    assert conductivity.call_count == 1
    alpha.assert_called_once()
    air_branch.assert_called_once()
    buried_branch.assert_not_called()


def test_buried_execution_calls_only_buried_branch() -> None:
    with (
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.calculate_air_tank_heat_loss",
            wraps=calculate_air_tank_heat_loss,
        ) as air_branch,
        patch(
            "heatcalc_heat_loss_core.tank_evaluation.calculate_buried_tank_heat_loss",
            wraps=calculate_buried_tank_heat_loss,
        ) as buried_branch,
    ):
        execute_prepared_tank(_buried())

    air_branch.assert_not_called()
    buried_branch.assert_called_once()


def test_nonfinite_conductivity_propagates_core_domain_error() -> None:
    with pytest.raises(FormulaDomainError, match="non_finite_result"):
        execute_prepared_tank(
            _air(
                layers=(
                    PreparedTankLayer(
                        0.08,
                        "manual",
                        ConstantConductivity(float("inf")),
                        -60.0,
                        200.0,
                    ),
                )
            )
        )


def test_unavailable_layer_law_reports_layer_and_temperature() -> None:
    with pytest.raises(FormulaDomainError, match="conductivity_law_unavailable") as exc_info:
        execute_prepared_tank(
            _air(
                layers=(PreparedTankLayer(0.08, "manual", UnavailableConductivity(), -60.0, 200.0),)
            )
        )

    assert exc_info.value.details == {"layer_index": 0, "temperature_c": 40.0}


@pytest.mark.parametrize(
    (
        "process_temperature_c",
        "basis",
        "ambient_temperature_c",
        "expected_tm",
        "expected_lambda",
    ),
    [
        (80.0, "outdoor_winter", -20.0, 40.0, 0.0534),
        (30.0, "outdoor_winter", -20.0, 15.0, 0.04815),
        (10.0, "indoor", -20.0, 25.0, 0.044),
        (20.0, "outdoor_winter", -20.0, 10.0, 0.0471),
        (19.0, "outdoor_winter", -20.0, 9.5, 0.044),
        (-60.0, "outdoor_winter", -70.0, -30.0, 0.044),
    ],
)
def test_prepared_tank_uses_process_temperature_to_select_reference_branch(
    process_temperature_c: float,
    basis: str,
    ambient_temperature_c: float,
    expected_tm: float,
    expected_lambda: float,
) -> None:
    placement = "indoor" if basis == "indoor" else "outdoor"
    result = execute_prepared_tank(
        _air(
            layers=(
                PreparedTankLayer(
                    0.08,
                    "reference",
                    mineral_wool_boards_120_law(),
                    -60.0,
                    400.0,
                ),
            ),
            process_temperature_c=process_temperature_c,
            insulation_temperature_basis=basis,
            environment=AirTankFormulaEnvironment(
                placement,  # type: ignore[arg-type]
                ambient_temperature_c,
                None if basis == "indoor" else 4.0,
            ),
        )
    )

    assert result.insulation_temperature_c == pytest.approx(expected_tm)
    assert result.layer_conductivities_w_mk[0] == pytest.approx(expected_lambda)


def test_prepared_tank_keeps_manual_constant_conductivity() -> None:
    result = execute_prepared_tank(_air(process_temperature_c=30.0))

    assert result.insulation_temperature_c == pytest.approx(15.0)
    assert result.layer_conductivities_w_mk == (0.04, 0.05)


def test_prepared_tank_keeps_manual_piecewise_tm_semantics() -> None:
    result = execute_prepared_tank(
        _air(
            layers=(
                PreparedTankLayer(
                    0.08,
                    "manual",
                    PiecewiseConductivity(
                        threshold_c=20.0,
                        at_or_above=ConstantConductivity(0.05),
                        below=ConstantConductivity(0.04),
                    ),
                    -90.0,
                    600.0,
                ),
            ),
            process_temperature_c=30.0,
        )
    )

    assert result.insulation_temperature_c == pytest.approx(15.0)
    assert result.layer_conductivities_w_mk == (0.04,)
