"""Case 1 sparse per-assignment electrical override contracts."""

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.electrical_assignment import ElectricalAssignmentOverridesPatch
from app.services.electrical_assignment_service import ElectricalAssignmentService


def test_sparse_patch_persists_public_supply_voltage_key() -> None:
    patch = ElectricalAssignmentOverridesPatch(
        expected_version=3,
        supply_voltage_v=Decimal("380"),
    )

    assert patch.model_fields_set == {"expected_version", "supply_voltage_v"}
    assert ElectricalAssignmentService._merge_electrical_overrides({}, patch) == {
        "supply_voltage_v": "380",
    }


def test_explicit_null_clears_object_fallback_voltage_but_preserves_normative_nulls() -> None:
    current = {
        "supply_voltage_v": "380",
        "winding_pitch_mm": "250",
        "thread_count": 2,
        "manual_cable_model": "30ТТВ2-СР",
    }
    patch = ElectricalAssignmentOverridesPatch(
        expected_version=4,
        supply_voltage_v=None,
        winding_pitch_mm=None,
        thread_count=None,
        manual_cable_model=None,
    )

    assert ElectricalAssignmentService._merge_electrical_overrides(current, patch) == {
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
        {"expected_version": 1, "supply_voltage_v": 0},
        {"expected_version": 1, "tank_laying_step_m": "0.099"},
        {"expected_version": 1, "tank_laying_step_m": "0.401"},
        {"expected_version": 1, "manual_cable_model": ""},
        {"expected_version": 1, "maintain_temperature_c": 10},
    ],
)
def test_patch_rejects_empty_invalid_and_removed_contract_fields(
    payload: dict[str, object],
) -> None:
    with pytest.raises(ValidationError):
        ElectricalAssignmentOverridesPatch.model_validate(payload)
