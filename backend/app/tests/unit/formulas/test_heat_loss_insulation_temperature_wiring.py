"""Prove backend tm policy delegates numerical evaluation to the core."""

from unittest.mock import MagicMock

import pytest

from app.formulas.heat_loss import insulation as insulation_policy
from app.formulas.heat_loss.core.insulation_temperature import (
    calculate_insulation_temperature,
)


@pytest.mark.parametrize(
    ("basis", "location", "placement", "expected_call"),
    [
        (
            "outdoor_winter",
            None,
            "outdoor",
            {"formula": "half_process"},
        ),
        (
            "indoor",
            "indoor",
            "indoor",
            {"formula": "mean_with_reference", "reference_temperature_c": 40.0},
        ),
        (
            "channel",
            None,
            "underground",
            {"formula": "mean_with_reference", "reference_temperature_c": 40.0},
        ),
    ],
)
def test_resolved_policy_calls_core_formula_once(
    monkeypatch: pytest.MonkeyPatch,
    basis: str,
    location: str | None,
    placement: str,
    expected_call: dict[str, object],
) -> None:
    formula_spy = MagicMock(wraps=calculate_insulation_temperature)
    monkeypatch.setattr(insulation_policy, "calculate_insulation_temperature", formula_spy)

    insulation_policy.resolve_insulation_tm(
        process_temperature=80.0,
        basis=basis,
        location=location,
        placement=placement,
    )

    formula_spy.assert_called_once_with(80.0, **expected_call)
