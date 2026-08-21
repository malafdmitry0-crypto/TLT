from decimal import Decimal

from heatcalc_electrical_core.selection import CableSelectionInput, select_tt_cable
from heatcalc_electrical_core.validation import TTFormulaReport

from .test_tt_formula import _catalog


def _selection(**updates: object) -> CableSelectionInput:
    values: dict[str, object] = {
        "required_power_per_meter": Decimal("10"),
        "product_temperature": Decimal("20"),
        "ambient_temperature": Decimal("-20"),
        "safety_factor": Decimal("1"),
        "winding_factor": Decimal("1"),
    }
    values.update(updates)
    return CableSelectionInput(**values)  # type: ignore[arg-type]


def test_selection_prefers_standard_execution_and_manual_has_one_thread() -> None:
    auto = select_tt_cable(_catalog(), _selection())
    assert not isinstance(auto, TTFormulaReport)
    assert (auto.candidate.full_mark, auto.execution_defaulted) == ("10ТТН2-СТ", True)
    manual = select_tt_cable(
        _catalog(),
        _selection(manual_cable_mark="10ТТН2-СР", required_power_per_meter=Decimal("45")),
    )
    assert isinstance(manual, TTFormulaReport)
    assert manual.issues[0].code == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"
    assert manual.issues[0].details["maximum_threads"] == 1


def test_selection_temperature_and_unknown_mark_keep_required_evidence() -> None:
    temperature = select_tt_cable(_catalog(), _selection(ambient_temperature=Decimal("-41")))
    assert isinstance(temperature, TTFormulaReport)
    assert temperature.issues[0].details["violations"] == ("ambient_below_minimum",)
    unknown = select_tt_cable(_catalog(), _selection(manual_cable_mark="nope"))
    assert isinstance(unknown, TTFormulaReport)
    assert unknown.issues[0].details["requested_model"] == "NOPE"
