"""Contracts for sparse per-assignment electrical override patches."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.electrical_assignment import ElectricalAssignmentOverridesPatch
from app.services.electrical_assignment_service import ElectricalAssignmentService


def test_sparse_patch_distinguishes_missing_from_explicit_null() -> None:
    patch = ElectricalAssignmentOverridesPatch(
        expected_version=3,
        steam_temperature_c=None,
        maintain_temperature_c=Decimal("10.5"),
    )

    assert patch.model_fields_set == {
        "expected_version",
        "steam_temperature_c",
        "maintain_temperature_c",
    }
    assert "aggressive_product" not in patch.model_fields_set


def test_merge_preserves_normative_nulls_and_removes_object_fallback_overrides() -> None:
    current = {
        "steam_temperature_c": "180",
        "maintain_temperature_c": "10",
        "aggressive_product": True,
        "winding_pitch_mm": "250",
        "thread_count": 2,
        "manual_cable_model": "30ТТН2-СТ",
        "tank_heating_height_m": "2.5",
        "tank_laying_step_m": "0.1",
    }
    patch = ElectricalAssignmentOverridesPatch(
        expected_version=4,
        steam_temperature_c=None,
        maintain_temperature_c=None,
        aggressive_product=None,
        winding_pitch_mm=None,
        thread_count=None,
        manual_cable_model=None,
        tank_heating_height_m=None,
        tank_laying_step_m=None,
    )

    assert ElectricalAssignmentService._merge_electrical_overrides(current, patch) == {
        "steam_temperature_c": None,
        "winding_pitch_mm": None,
        "thread_count": None,
        "manual_cable_model": None,
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"expected_version": 1},
        {"expected_version": 1, "thread_count": 4},
        {"expected_version": 1, "winding_pitch_mm": 0},
        {"expected_version": 1, "tank_laying_step_m": "0.099"},
        {"expected_version": 1, "tank_laying_step_m": "0.401"},
        {"expected_version": 1, "manual_cable_model": ""},
        {"expected_version": 1, "nominal_voltage_v": 230},
    ],
)
def test_patch_rejects_empty_invalid_and_voltage_payloads(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        ElectricalAssignmentOverridesPatch.model_validate(payload)
