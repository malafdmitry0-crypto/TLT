"""Application-owned raw TT catalog preparation for the electrical core."""

from copy import deepcopy

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.catalog_preparation import prepare_tt_catalog_bundle


def test_preparation_normalizes_supported_section_keys_without_mutating_catalog_authority() -> None:
    power_rows = [{"model": "10ТТН2", "series": "ТТН", "nominal_power": 10, "max_product_temp": 65}]
    section_rows = [
        {
            "mark": "10ТТН2",
            "cold_start_temperature_c": -40,
            "l_max_m": 100,
            "specific_start_current_a_per_m": 0.1,
        }
    ]
    bom_rows = [{"full_mark": "10ТТН2-СТ", "nomenclature_code": "CASE1-10-ST"}]
    original = deepcopy((power_rows, section_rows, bom_rows))

    bundle = prepare_tt_catalog_bundle(
        power_rows=power_rows,
        section_rows=section_rows,
        bom_rows=bom_rows,
    )

    section = bundle.section_rows[0]
    assert section.base_model == "10ТТН2"
    assert str(section.cold_start_temperature) == "-40"
    assert str(section.i_st_ud_a_per_m) == "0.1"
    assert (power_rows, section_rows, bom_rows) == original


def test_preparation_rejects_legacy_cold_start_temperature_alias() -> None:
    with pytest.raises(ElectricalFormulaError) as raised:
        prepare_tt_catalog_bundle(
            power_rows=[
                {"model": "10ТТН2", "series": "ТТН", "nominal_power": 10, "max_product_temp": 65}
            ],
            section_rows=[
                {
                    "mark": "10ТТН2",
                    "cold_start_temp_c": -40,
                    "l_max_m": 100,
                    "specific_start_current_a_per_m": 0.1,
                }
            ],
            bom_rows=[],
        )

    assert raised.value.code == "ELECTRICAL_CATALOG_ROW_INVALID"
    assert raised.value.details["invalid_fields"] == ["cold_start_temperature_c"]
    assert raised.value.details["reason"] == "unsupported_legacy_field"


def test_preparation_translates_core_catalog_report_to_legacy_error() -> None:
    with pytest.raises(ElectricalFormulaError) as raised:
        prepare_tt_catalog_bundle(
            power_rows=[{"model": "10ТТН2", "series": "ТТН", "nominal_power": 10}],
            section_rows=[],
            bom_rows=[],
        )

    assert raised.value.code == "ELECTRICAL_CATALOG_ROW_INVALID"
