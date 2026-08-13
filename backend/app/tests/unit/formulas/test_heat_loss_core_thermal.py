"""Backend integration guard for canonical thermal primitives."""

import pytest

from app.formulas.heat_loss.insulation import resolve_insulation_tm
from app.reference_data.loader import get_insulation_conductivity, get_pipe_material_lambda


def test_backend_policy_paths_keep_using_core_thermal_primitives() -> None:
    assert resolve_insulation_tm(
        process_temperature=80.0,
        basis="outdoor_winter",
        location=None,
        placement="outdoor",
    ) == pytest.approx(40.0)
    assert resolve_insulation_tm(
        process_temperature=80.0,
        basis="indoor",
        location="indoor",
        placement="indoor",
    ) == pytest.approx(60.0)
    assert get_insulation_conductivity("mineral_wool_boards_120", 60.0) > 0
    assert get_insulation_conductivity("mineral_wool_boards_120", -20.0) > 0
    assert get_pipe_material_lambda("carbon_steel", 80.0) > 0
