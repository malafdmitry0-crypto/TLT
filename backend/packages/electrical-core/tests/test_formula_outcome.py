import pytest
from heatcalc_electrical_core.formula_outcome import TTFormulaOutcome
from heatcalc_electrical_core.validation import TTFormulaIssue, TTFormulaReport


def test_outcome_enforces_success_failure_xor() -> None:
    assert TTFormulaOutcome(result=1).is_success
    failed = TTFormulaOutcome[int](None, TTFormulaReport((TTFormulaIssue("x"),)))
    assert not failed.is_success
    with pytest.raises(ValueError):
        TTFormulaOutcome(result=1, report=failed.report)
    with pytest.raises(ValueError):
        TTFormulaOutcome[int](result=None)
