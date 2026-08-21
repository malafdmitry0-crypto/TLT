from dataclasses import FrozenInstanceError

import pytest
from heatcalc_electrical_core.validation import TTFormulaIssue, TTFormulaReport


def test_issue_deep_freezes_details_and_thaws_for_adapter() -> None:
    issue = TTFormulaIssue.with_details(
        "x", path=("field", 0), missing_fields=["a"], nested={"v": [1]}
    )
    assert issue.details["missing_fields"] == ("a",)
    assert issue.details_dict() == {"missing_fields": ["a"], "nested": {"v": [1]}}
    with pytest.raises(TypeError):
        issue.details["x"] = 1  # type: ignore[index]
    with pytest.raises(FrozenInstanceError):
        issue.code = "y"  # type: ignore[misc]


def test_report_requires_immutable_issue_tuple() -> None:
    assert TTFormulaReport((TTFormulaIssue("x"),)).is_valid is False
    with pytest.raises(TypeError):
        TTFormulaReport([TTFormulaIssue("x")])  # type: ignore[arg-type]
