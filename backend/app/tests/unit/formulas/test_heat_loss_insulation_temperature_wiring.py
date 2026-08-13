"""Prove backend tm policy delegates numerical evaluation to the core."""

from unittest.mock import MagicMock

import pytest
from heatcalc_heat_loss_core.profile import resolve_insulation_temperature

from app.formulas.heat_loss import insulation as insulation_policy


@pytest.mark.parametrize(
    ("basis", "location", "placement"),
    [
        (
            "outdoor_winter",
            None,
            "outdoor",
        ),
        (
            "indoor",
            "indoor",
            "indoor",
        ),
        (
            "channel",
            None,
            "underground",
        ),
    ],
)
def test_resolved_policy_calls_core_formula_once(
    monkeypatch: pytest.MonkeyPatch,
    basis: str,
    location: str | None,
    placement: str,
) -> None:
    formula_spy = MagicMock(wraps=resolve_insulation_temperature)
    monkeypatch.setattr(insulation_policy, "resolve_insulation_temperature", formula_spy)

    insulation_policy.resolve_insulation_tm(
        process_temperature=80.0,
        basis=basis,
        location=location,
        placement=placement,
    )

    formula_spy.assert_called_once_with(80.0, basis=basis)
