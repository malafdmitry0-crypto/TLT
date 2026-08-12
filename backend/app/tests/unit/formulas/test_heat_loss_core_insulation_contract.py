"""Tests for the catalog-free insulation-layer contract."""

from __future__ import annotations

from dataclasses import FrozenInstanceError

import pytest

from app.formulas.heat_loss.core.insulation_contract import (
    InsulationContractInput,
    validate_insulation_contract,
)


def _data(**changes: object) -> InsulationContractInput:
    values: dict[str, object] = {
        "thickness_m": 0.05,
        "source": "manual",
        "conductivity_w_mk": 0.04,
        "temperature_range_c": (-70.0, 200.0),
    }
    values.update(changes)
    return InsulationContractInput(**values)  # type: ignore[arg-type]


def test_input_is_frozen() -> None:
    data = _data()

    with pytest.raises(FrozenInstanceError):
        data.thickness_m = 0.1  # type: ignore[misc]


def test_manual_layer_with_valid_values_is_valid() -> None:
    assert validate_insulation_contract(_data()).is_valid


def test_range_phase_collects_numeric_issues_before_manual_policy() -> None:
    report = validate_insulation_contract(
        _data(thickness_m=0.0, conductivity_w_mk=0.0, temperature_range_c=None),
        path=("insulation_layers", 2),
    )

    assert [(issue.code, issue.path) for issue in report.issues] == [
        ("below_min_exclusive", ("insulation_layers", 2, "thickness")),
        ("below_min_exclusive", ("insulation_layers", 2, "conductivity")),
    ]


@pytest.mark.parametrize(
    ("changes", "code", "path"),
    [
        (
            {"conductivity_w_mk": None, "temperature_range_c": None},
            "manual_layer_conductivity_required",
            ("conductivity",),
        ),
        (
            {"temperature_range_c": None},
            "manual_layer_temperature_range_required",
            ("temperature_range",),
        ),
    ],
)
def test_manual_requirements_have_deterministic_order(
    changes: dict[str, object], code: str, path: tuple[str, ...]
) -> None:
    report = validate_insulation_contract(_data(**changes))

    assert [(issue.code, issue.path) for issue in report.issues] == [(code, path)]


def test_manual_interval_uses_existing_structured_interval_issue() -> None:
    report = validate_insulation_contract(_data(temperature_range_c=(50.0, 50.0)))

    issue = report.issues[0]
    assert issue.code == "invalid_temperature_interval"
    assert issue.path == ("temperature_range",)
    assert issue.details_dict() == {"minimum_c": 50.0, "maximum_c": 50.0}


def test_reference_layer_permits_presence_flags_without_catalog_policy() -> None:
    report = validate_insulation_contract(
        _data(
            source="reference",
            conductivity_supplied=True,
            temperature_range_supplied=True,
        )
    )

    assert report.is_valid


def test_reference_layer_does_not_require_catalog_identity() -> None:
    assert validate_insulation_contract(
        _data(
            source="reference",
            conductivity_w_mk=None,
            temperature_range_c=None,
        )
    ).is_valid
