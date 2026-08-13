"""Tests for the dependency-free tank input contract."""

import math

import pytest
from heatcalc_heat_loss_core.tank_contract import (
    TankContractInput,
    TankContractLayer,
    validate_tank_contract,
)
from heatcalc_heat_loss_core.validation import FormulaValidationIssue


def _data(**changes: object) -> TankContractInput:
    values: dict[str, object] = {
        "shape": "cylindrical",
        "placement": "outdoor",
        "insulation_temperature_basis": "outdoor_winter",
        "diameter": 2.0,
        "height": 3.0,
        "length": None,
        "width": None,
        "insulation_layers": (TankContractLayer("reference", False, None, (-60.0, 180.0)),),
        "ambient_temperature": -20.0,
        "ground_temperature": None,
        "process_temperature": 80.0,
        "wall_thickness": None,
        "wall_lambda": None,
        "tank_buried_height": None,
        "ground_conductivity": None,
        "wind_speed": 4.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
    }
    values.update(changes)
    return TankContractInput(**values)  # type: ignore[arg-type]


def _one(**changes: object) -> FormulaValidationIssue:
    report = validate_tank_contract(_data(**changes))
    assert len(report.issues) == 1
    return report.issues[0]


def test_valid_air_and_underground_contracts_are_accepted() -> None:
    assert validate_tank_contract(_data()).is_valid
    assert validate_tank_contract(
        _data(
            placement="underground",
            insulation_temperature_basis="channel",
            ground_temperature=5.0,
            ground_conductivity=1.5,
            tank_buried_height=1.0,
        )
    ).is_valid


def test_ranges_are_collected_first_and_stop_contract_validation() -> None:
    report = validate_tank_contract(
        _data(diameter=0.0, wind_speed=-1.0, insulation_temperature_basis="indoor")
    )

    assert [issue.code for issue in report.issues] == ["below_min_inclusive", "below_min_inclusive"]


@pytest.mark.parametrize("basis", ["indoor", "channel"])
def test_basis_is_checked_before_layers_and_placement(basis: str) -> None:
    issue = _one(insulation_temperature_basis=basis, wind_speed=None)

    assert str(issue.code) == "insulation_basis_not_allowed_for_placement"
    assert issue.path == ("insulation_temperature_basis",)


def test_reference_conflict_precedes_its_resolved_temperature_check() -> None:
    issue = _one(
        process_temperature=200.0,
        insulation_layers=(TankContractLayer("reference", True, None, (-60.0, 180.0)),),
    )

    assert str(issue.code) == "reference_layer_has_manual_properties"
    assert issue.path == ("insulation_layers", 0)


def test_reference_resolved_interval_uses_core_temperature_issue_and_canonical_path() -> None:
    issue = _one(
        process_temperature=200.0,
        insulation_layers=(TankContractLayer("reference", False, None, (-60.0, 180.0)),),
    )

    assert issue.code == "temperature_outside_interval"
    assert issue.path == ("insulation_layers", 0)
    assert issue.details_dict() == {
        "temperature_c": 200.0,
        "minimum_c": -60.0,
        "maximum_c": 180.0,
    }


@pytest.mark.parametrize(
    ("layer", "code", "path"),
    [
        (
            TankContractLayer("manual", False, None),
            "manual_layer_conductivity_required",
            ("insulation_layers", 0, "conductivity"),
        ),
        (
            TankContractLayer("manual", True, None),
            "manual_layer_temperature_range_required",
            ("insulation_layers", 0, "temperature_range"),
        ),
        (
            TankContractLayer("manual", True, (20.0, 20.0)),
            "invalid_temperature_interval",
            ("insulation_layers", 0, "temperature_range"),
        ),
    ],
)
def test_manual_layer_contract_rules(
    layer: TankContractLayer, code: str, path: tuple[str | int, ...]
) -> None:
    issue = _one(insulation_layers=(layer,))

    assert issue.code == code
    assert issue.path == path


@pytest.mark.parametrize(
    ("changes", "code", "path"),
    [
        (
            {"placement": "underground", "insulation_temperature_basis": "channel"},
            "underground_field_required",
            ("ground_temperature",),
        ),
        ({"ground_temperature": 5.0}, "air_tank_forbids_ground_parameters", ()),
        ({"tank_buried_height": 1.0}, "air_tank_forbids_buried_height", ("tank_buried_height",)),
        ({"wind_speed": None}, "outdoor_wind_speed_required", ("wind_speed",)),
    ],
)
def test_placement_rules_preserve_current_first_error_policy(
    changes: dict[str, object], code: str, path: tuple[str | int, ...]
) -> None:
    issue = _one(**changes)

    assert issue.code == code
    assert issue.path == path


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ({"wall_thickness": 0.01}, "tank_wall_properties_must_be_paired"),
        ({"diameter": None}, "cylindrical_tank_requires_diameter_and_height"),
        ({"length": 2.0}, "cylindrical_tank_forbids_length_and_width"),
        (
            {"shape": "rectangular", "diameter": None, "length": None, "width": 2.0},
            "rectangular_tank_requires_length_width_and_height",
        ),
        (
            {"shape": "rectangular", "length": 2.0, "width": 2.0},
            "rectangular_tank_forbids_diameter",
        ),
    ],
)
def test_wall_and_geometry_rules_follow_placement(changes: dict[str, object], code: str) -> None:
    assert _one(**changes).code == code


def test_formula_domain_issues_aggregate_after_contract_rules_pass() -> None:
    report = validate_tank_contract(
        _data(
            diameter=0.1,
            height=0.1,
            wall_thickness=0.05,
            wall_lambda=45.0,
            process_temperature=-20.0,
            ambient_temperature=-20.0,
            insulation_layers=(TankContractLayer("reference", False, None, (-60.0, 180.0)),),
        )
    )

    assert [issue.code for issue in report.issues] == [
        "wall_exceeds_tank_radius",
        "process_temperature_not_above_ambient",
    ]


def test_q_additional_legacy_infinity_range_is_preserved() -> None:
    assert validate_tank_contract(_data(q_additional=math.inf)).is_valid
