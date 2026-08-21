"""Case 1 eligibility metadata exposed by the manual cable-options builder."""

from app.formulas.electrical.tt_cable_options import build_tt_cable_options

POWER_ROWS = [
    {"model": "10ТТН2", "series": "ТТН", "nominal_power": 10, "max_product_temp": 65},
    {"model": "25ТТН2", "series": "ТТН", "nominal_power": 25, "max_product_temp": 65},
    {"model": "60ТТВ2", "series": "ТТВ", "nominal_power": 60, "max_product_temp": 120},
]
SECTION_ROWS = [
    {
        "mark": row["model"],
        "cold_start_temp_c": -40,
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


def _options(**updates: object) -> list[dict]:
    inputs: dict[str, object] = {
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
