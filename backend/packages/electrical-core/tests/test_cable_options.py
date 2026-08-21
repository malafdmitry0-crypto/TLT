from decimal import Decimal

from heatcalc_electrical_core.cable_options import list_tt_cable_options
from heatcalc_electrical_core.validation import TTFormulaReport

from .test_tt_formula import _catalog


def test_options_are_candidate_based_and_eligible_first() -> None:
    options = list_tt_cable_options(
        _catalog(), product_temperature=Decimal("60"), ambient_temperature=Decimal("-35")
    )
    assert not isinstance(options, TTFormulaReport)
    assert [option.model for option in options][:2] == ["10ТТН2-СР", "10ТТН2-СТ"]
    assert options[0].eligible


def test_options_return_report_for_catalog_failure() -> None:
    from heatcalc_electrical_core import CatalogBundle

    result = list_tt_cable_options(
        CatalogBundle((), (), ()),
        product_temperature=Decimal("20"),
        ambient_temperature=Decimal("20"),
    )
    assert isinstance(result, TTFormulaReport)
