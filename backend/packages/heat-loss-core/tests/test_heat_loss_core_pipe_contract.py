"""Tests for the dependency-free pipe input contract."""

import math

import pytest
from heatcalc_heat_loss_core.pipe_contract import (
    PipeContractInput,
    PipeLayerContract,
    validate_pipe_contract,
)
from heatcalc_heat_loss_core.validation import FormulaValidationIssue


def _data(**changes: object) -> PipeContractInput:
    values: dict[str, object] = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_lambda": None,
        "has_pipe_material": True,
        "layers": (PipeLayerContract(0.05, "reference", False, None, None),),
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "pipe_length": 10.0,
        "pipe_centerline_depth": None,
        "num_local_elements": 0,
        "local_element_equiv_length": None,
        "wind_speed": 4.0,
        "ground_conductivity": None,
        "ground_temperature": None,
        "safety_factor": 1.1,
        "placement": "outdoor",
        "insulation_temperature_basis": "outdoor_winter",
    }
    values.update(changes)
    return PipeContractInput(**values)  # type: ignore[arg-type]


def _one(**changes: object) -> FormulaValidationIssue:
    report = validate_pipe_contract(_data(**changes))
    assert len(report.issues) == 1
    return report.issues[0]


@pytest.mark.parametrize(
    ("changes", "code", "path"),
    [
        ({"outer_diameter": 0.0}, "below_min_inclusive", ("outer_diameter",)),
        (
            {"insulation_temperature_basis": "channel"},
            "insulation_basis_not_allowed_for_placement",
            ("insulation_temperature_basis",),
        ),
        ({"pipe_lambda": 45.0}, "pipe_conductivity_source_xor", ()),
        (
            {"layers": (PipeLayerContract(0.05, "manual", False, None, None),)},
            "manual_layer_conductivity_required",
            ("insulation_layers", 0, "conductivity"),
        ),
        (
            {"layers": (PipeLayerContract(0.05, "manual", True, None, None),)},
            "manual_layer_temperature_range_required",
            ("insulation_layers", 0, "temperature_range"),
        ),
        (
            {"layers": (PipeLayerContract(0.05, "reference", True, None, None),)},
            "reference_layer_has_manual_properties",
            ("insulation_layers", 0),
        ),
        (
            {"num_local_elements": 1},
            "local_elements_require_equivalent_length",
            ("local_element_equiv_length",),
        ),
        (
            {
                "placement": "underground",
                "insulation_temperature_basis": "channel",
                "ambient_temperature": None,
                "wind_speed": None,
            },
            "underground_field_required",
            ("ground_temperature",),
        ),
        (
            {"ambient_temperature": None},
            "air_pipe_ambient_temperature_required",
            ("ambient_temperature",),
        ),
        (
            {"pipe_centerline_depth": 1.0},
            "air_pipe_forbids_centerline_depth",
            ("pipe_centerline_depth",),
        ),
        (
            {"ground_temperature": 5.0},
            "air_pipe_forbids_ground_parameters",
            (),
        ),
        ({"wind_speed": None}, "outdoor_wind_speed_required", ("wind_speed",)),
    ],
)
def test_contract_short_circuits_in_legacy_order(
    changes: dict[str, object], code: str, path: tuple[str | int, ...]
) -> None:
    issue = _one(**changes)

    assert issue.code == code
    assert issue.path == path


def test_manual_layer_interval_is_checked_after_presence() -> None:
    issue = _one(layers=(PipeLayerContract(0.05, "manual", True, (20.0, 20.0), None),))

    assert issue.code == "invalid_temperature_interval"
    assert issue.path == ("insulation_layers", 0, "temperature_range")


def test_range_phase_stops_before_contract_checks_and_collects_all_ranges() -> None:
    report = validate_pipe_contract(
        _data(outer_diameter=0.0, pipe_lambda=math.nan, insulation_temperature_basis="channel")
    )

    assert [issue.code for issue in report.issues] == ["below_min_inclusive", "not_finite"]


def test_reference_interval_is_checked_after_manual_property_conflict() -> None:
    report = validate_pipe_contract(
        _data(
            process_temperature=80.0,
            layers=(PipeLayerContract(0.05, "reference", False, None, (-60.0, 50.0)),),
        )
    )

    assert [(issue.code, issue.path, issue.details_dict()) for issue in report.issues] == [
        (
            "temperature_outside_interval",
            ("insulation_layers", 0),
            {"temperature_c": 80.0, "minimum_c": -60.0, "maximum_c": 50.0},
        )
    ]


def test_reference_manual_property_conflict_precedes_reference_interval() -> None:
    issue = _one(
        layers=(PipeLayerContract(0.05, "reference", False, (-70.0, 200.0), (-60.0, 50.0)),)
    )

    assert str(issue.code) == "reference_layer_has_manual_properties"


def test_underground_formula_domain_aggregates_after_contract_rules() -> None:
    report = validate_pipe_contract(
        _data(
            outer_diameter=0.05,
            wall_thickness=0.03,
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=-20.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=0.01,
            layers=(PipeLayerContract(0.05, "reference", False, None, None),),
            process_temperature=-20.0,
        )
    )

    assert [issue.code for issue in report.issues] == [
        "wall_exceeds_pipe_radius",
        "process_temperature_not_above_ground",
        "ground_centerline_inside_pipe",
    ]


def test_valid_manual_underground_contract() -> None:
    assert validate_pipe_contract(
        _data(
            has_pipe_material=False,
            pipe_lambda=45.0,
            layers=(PipeLayerContract(0.05, "manual", True, (-70.0, 200.0), None),),
            placement="underground",
            insulation_temperature_basis="channel",
            ambient_temperature=None,
            wind_speed=None,
            ground_temperature=5.0,
            ground_conductivity=1.5,
            pipe_centerline_depth=1.0,
        )
    ).is_valid
