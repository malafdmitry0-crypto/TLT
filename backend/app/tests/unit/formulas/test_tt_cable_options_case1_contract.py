"""Case 1 eligibility metadata exposed by the manual cable-options builder."""

from decimal import Decimal
from typing import Any
from unittest.mock import Mock

import pytest
from heatcalc_electrical_core import (
    TTFormulaReport,
    catalog_bundle_from_payload,
    list_tt_cable_options,
)

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical import catalog_preparation, tt_cable_options
from app.formulas.electrical.catalog_preparation import prepare_tt_catalog_bundle
from app.formulas.electrical.tt_cable_options import build_tt_cable_options

POWER_ROWS = [
    {"model": "10ТТН2", "series": "ТТН", "nominal_power": 10, "max_product_temp": 65},
    {"model": "25ТТН2", "series": "ТТН", "nominal_power": 25, "max_product_temp": 65},
    {"model": "60ТТВ2", "series": "ТТВ", "nominal_power": 60, "max_product_temp": 120},
]
SECTION_ROWS = [
    {
        "mark": row["model"],
        "cold_start_temperature_c": -40,
        "l_max_m": 100,
        "i_st_ud_a_per_m": 0.1,
    }
    for row in POWER_ROWS
]
BOM_ROWS = [
    {"full_mark": "10ТТН2-СР", "nomenclature_code": "CASE1-10-SR"},
    {"full_mark": "10ТТН2-СТ", "nomenclature_code": "CASE1-10-ST"},
    {"full_mark": "25ТТН2-СТ", "nomenclature_code": "CASE1-25-ST"},
    {"full_mark": "60ТТВ2-СР", "nomenclature_code": "CASE1-60-SR"},
]


def _options(**updates: Any) -> list[dict[str, Any]]:
    inputs: dict[str, Any] = {
        "product_temperature_c": 65,
        "ambient_temperature_c": -20,
        "section_catalog_rows": SECTION_ROWS,
        "bom_catalog_rows": BOM_ROWS,
        "catalog_meta": {"status": "active", "authority": "database"},
    }
    inputs.update(updates)
    return build_tt_cable_options(POWER_ROWS, **inputs)


def test_options_use_per_row_case1_temperature_eligibility_and_expose_thresholds() -> None:
    by_model = {option["base_model"]: option for option in _options()}

    assert by_model["10ТТН2"]["eligible"] is True
    assert by_model["10ТТН2"]["passport_power_w_per_m"] == 10
    assert by_model["10ТТН2"]["max_product_temperature_c"] == 65
    assert by_model["10ТТН2"]["min_ambient_temperature_c"] == -40
    assert by_model["60ТТВ2"]["eligible"] is True


def test_options_mark_only_ambient_ineligible_rows_without_warmer_fallback() -> None:
    options = _options(ambient_temperature_c=-41)

    assert all(option["eligible"] is False for option in options)
    assert {option["unavailable_reason"] for option in options} == {
        "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"
    }


def test_options_return_exact_full_marks_from_bom_without_synthesizing_suffix() -> None:
    options = _options()

    assert {item["model"] for item in options if item["base_model"] == "10ТТН2"} == {
        "10ТТН2-СР",
        "10ТТН2-СТ",
    }


def test_options_call_shared_catalog_adapter_and_root_selector_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parser = Mock(wraps=catalog_bundle_from_payload)
    selector = Mock(wraps=list_tt_cable_options)
    adapter = Mock(wraps=prepare_tt_catalog_bundle)
    monkeypatch.setattr(catalog_preparation, "catalog_bundle_from_payload", parser)
    monkeypatch.setattr(tt_cable_options, "prepare_tt_catalog_bundle", adapter)
    monkeypatch.setattr(tt_cable_options, "list_tt_cable_options", selector)

    _options()

    adapter.assert_called_once_with(
        power_rows=POWER_ROWS,
        section_rows=SECTION_ROWS,
        bom_rows=BOM_ROWS,
    )
    parser.assert_called_once_with(
        power_rows=POWER_ROWS,
        section_rows=[
            {
                **row,
                "base_model": row["mark"],
                "cold_start_temperature_c": row["cold_start_temperature_c"],
            }
            for row in SECTION_ROWS
        ],
        bom_rows=BOM_ROWS,
    )
    selector.assert_called_once()


def test_options_preserve_core_engineering_outcome_in_legacy_payload() -> None:
    bundle = catalog_bundle_from_payload(
        power_rows=POWER_ROWS,
        section_rows=SECTION_ROWS,
        bom_rows=BOM_ROWS,
    )
    assert not isinstance(bundle, TTFormulaReport)
    core_options = list_tt_cable_options(
        bundle,
        product_temperature=Decimal("65"),
        ambient_temperature=Decimal("-20"),
    )
    assert not isinstance(core_options, TTFormulaReport)

    options = _options()

    assert [
        (
            option["model"],
            option["eligible"],
            option["unavailable_reason"],
            option["passport_power_w_per_m"],
            option["min_ambient_temperature_c"],
            option["max_product_temperature_c"],
        )
        for option in options
    ] == [
        (
            option.model,
            option.eligible,
            option.unavailable_reason,
            float(option.passport_power_per_meter),
            float(option.min_ambient_temperature),
            float(option.max_product_temperature),
        )
        for option in core_options
    ]
    assert all(option["catalog"]["production_approved"] is True for option in options)


def test_strict_provisional_is_an_application_policy_override() -> None:
    options = _options(
        catalog_meta={"status": "provisional", "authority": "static"},
        strict_provisional=True,
    )

    assert all(option["eligible"] is False for option in options)
    assert {option["unavailable_reason"] for option in options} == {
        "ELECTRICAL_POWER_CATALOG_PROVISIONAL"
    }
    assert all(option["catalog"]["production_approved"] is False for option in options)


def test_core_catalog_report_is_translated_to_the_application_error_contract() -> None:
    with pytest.raises(ElectricalFormulaError) as raised:
        _options(section_catalog_rows=[])

    assert raised.value.code == "ELECTRICAL_CATALOG_ROW_INVALID"
