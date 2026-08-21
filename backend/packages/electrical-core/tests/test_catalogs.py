from decimal import Decimal

import pytest
from heatcalc_electrical_core import catalog_bundle_from_payload
from heatcalc_electrical_core.sections import lookup_section_row
from heatcalc_electrical_core.selection import build_tt_catalog_candidates
from heatcalc_electrical_core.validation import TTFormulaReport


def test_catalog_adapter_keeps_only_engineering_rows() -> None:
    value = catalog_bundle_from_payload(
        power_rows=[{"model": "10ТТН2", "nominal_power": 10, "max_product_temp": 65, "id": "db"}],
        section_rows=[
            {
                "mark": "10ТТН2",
                "cold_start_temp_c": -40,
                "l_max_m": 100,
                "i_st_ud_a_per_m": 0.1,
                "voltage_v": 230,
            }
        ],
        bom_rows=[{"full_mark": "10ТТН2-СТ", "nomenclature_code": "n", "status": "active"}],
    )
    assert not isinstance(value, TTFormulaReport)
    assert value.power_rows[0].nominal_power == Decimal("10")
    assert not hasattr(value.power_rows[0], "id")


def test_catalog_adapter_reports_missing_and_malformed_evidence() -> None:
    missing = catalog_bundle_from_payload(
        power_rows=[{"model": "x", "max_product_temp": 1}], section_rows=[], bom_rows=[]
    )
    assert isinstance(missing, TTFormulaReport)
    assert missing.issues[0].details["missing_fields"] == ("nominal_power",)
    malformed = catalog_bundle_from_payload(
        power_rows=[{"model": "x", "nominal_power": "no", "max_product_temp": 1}],
        section_rows=[],
        bom_rows=[],
    )
    assert isinstance(malformed, TTFormulaReport)
    assert malformed.issues[0].details["invalid_fields"] == ("nominal_power",)


def _raw_section(**updates: object) -> dict[str, object]:
    row: dict[str, object] = {
        "mark": "10ТТН2",
        "cold_start_temp_c": -40,
        "l_max_m": 100,
        "i_st_ud_a_per_m": 0.1,
        "voltage_v": 230,
    }
    row.update(updates)
    return row


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("l_max_m", None),
        ("l_max_m", "NaN"),
        ("i_st_ud_a_per_m", "broken"),
        ("voltage_v", "Infinity"),
        ("i_dop_a", "not-a-number"),
    ],
)
def test_raw_malformed_section_keeps_temperature_but_is_planning_ineligible(
    field: str, value: object
) -> None:
    bundle = catalog_bundle_from_payload(
        power_rows=[{"model": "10ТТН2", "nominal_power": 10, "max_product_temp": 65}],
        section_rows=[_raw_section(**{field: value})],
        bom_rows=[{"full_mark": "10ТТН2-СТ", "nomenclature_code": "n"}],
    )

    assert not isinstance(bundle, TTFormulaReport)
    assert bundle.section_rows[0].cold_start_temperature == Decimal("-40")
    assert bundle.section_rows[0].planning_eligible is False


def test_warmer_malformed_section_does_not_hide_a_colder_valid_planning_row() -> None:
    bundle = catalog_bundle_from_payload(
        power_rows=[{"model": "10ТТН2", "nominal_power": 10, "max_product_temp": 65}],
        section_rows=[
            _raw_section(cold_start_temp_c=-40),
            _raw_section(cold_start_temp_c=-10, l_max_m="broken"),
        ],
        bom_rows=[{"full_mark": "10ТТН2-СТ", "nomenclature_code": "n"}],
    )

    assert not isinstance(bundle, TTFormulaReport)
    candidates = build_tt_catalog_candidates(bundle)
    assert not isinstance(candidates, TTFormulaReport)
    assert candidates[0].min_ambient_temperature == Decimal("-40")
    selected = lookup_section_row(
        mark="10ТТН2-СТ",
        cold_start_temperature=Decimal("-5"),
        catalog_rows=bundle.section_rows,
    )
    assert selected is not None
    assert selected.cold_start_temperature == Decimal("-40")


def test_raw_section_missing_voltage_retains_legacy_default() -> None:
    raw = _raw_section()
    raw.pop("voltage_v")
    bundle = catalog_bundle_from_payload(
        power_rows=[{"model": "10ТТН2", "nominal_power": 10, "max_product_temp": 65}],
        section_rows=[raw],
        bom_rows=[{"full_mark": "10ТТН2-СТ", "nomenclature_code": "n"}],
    )

    assert not isinstance(bundle, TTFormulaReport)
    assert bundle.section_rows[0].voltage_v == Decimal("230")
    assert bundle.section_rows[0].planning_eligible
