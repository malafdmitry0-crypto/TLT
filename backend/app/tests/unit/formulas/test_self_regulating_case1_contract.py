"""Case 1 Revision 4, sections 6.13-6.14, selector characterisation tests."""

from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.self_regulating import calc_self_regulating_tt
from app.schemas.calculation import SelfRegulatingTTParams

POWER_ROWS = [
    {"model": "10ТТН2", "series": "ТТН", "nominal_power": 10, "max_product_temp": 65},
    {"model": "25ТТН2", "series": "ТТН", "nominal_power": 25, "max_product_temp": 65},
    {"model": "31ТТН2", "series": "ТТН", "nominal_power": 31, "max_product_temp": 65},
    {"model": "60ТТВ2", "series": "ТТВ", "nominal_power": 60, "max_product_temp": 120},
]

SECTION_ROWS = [
    {
        "mark": power_row["model"],
        "cold_start_temp_c": -40,
        "l_max_m": 100,
        "i_st_ud_a_per_m": 0.1,
        "voltage_v": 230,
    }
    for power_row in POWER_ROWS
]

BOM_ROWS = [
    {"full_mark": "10ТТН2-СР", "nomenclature_code": "CASE1-10-SR"},
    {"full_mark": "10ТТН2-СТ", "nomenclature_code": "CASE1-10-ST"},
    {"full_mark": "25ТТН2-СТ", "nomenclature_code": "CASE1-25-ST"},
    {"full_mark": "31ТТН2-СТ", "nomenclature_code": "CASE1-31-ST"},
    {"full_mark": "60ТТВ2-СР", "nomenclature_code": "CASE1-60-SR"},
]


def _params(**updates: object) -> SelfRegulatingTTParams:
    values: dict[str, object] = {
        "required_power_per_meter": 20,
        "pipe_length": 10,
        "process_temperature": 20,
        "ambient_temperature": -20,
        "supply_voltage": 230,
        "safety_factor": 1,
    }
    values.update(updates)
    return SelfRegulatingTTParams(**values)


def _calculate(**updates: object):
    return calc_self_regulating_tt(
        _params(**updates),
        catalog_rows=deepcopy(POWER_ROWS),
        section_catalog_rows=deepcopy(SECTION_ROWS),
        bom_catalog_rows=deepcopy(BOM_ROWS),
    )


def test_auto_uses_passport_power_and_all_temperature_eligible_catalog_rows() -> None:
    one_thread = _calculate(required_power_per_meter=20)
    cross_series = _calculate(required_power_per_meter=120)

    assert (one_thread.cable_model, one_thread.num_circuits, one_thread.power_per_meter) == (
        "25ТТН2",
        1,
        25,
    )
    assert (cross_series.cable_model, cross_series.num_circuits) == ("60ТТВ2", 2)


def test_product_equal_to_catalog_maximum_is_eligible() -> None:
    result = _calculate(process_temperature=65, required_power_per_meter=10)

    assert result.cable_model == "10ТТН2"


def test_ambient_below_model_section_catalog_minimum_is_typed_temperature_error() -> None:
    with pytest.raises(ElectricalFormulaError) as raised:
        _calculate(ambient_temperature=-41)

    assert raised.value.code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"


def test_manual_mark_without_threads_means_exactly_one_thread_without_fallback() -> None:
    with pytest.raises(ElectricalFormulaError) as raised:
        _calculate(
            cable_mark="10ТТН2-СТ",
            number_of_threads=None,
            required_power_per_meter=15,
        )

    assert raised.value.code == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"


def test_t2_t3_and_aggressiveness_are_not_case1_selector_parameters() -> None:
    assert "maintain_temperature" not in SelfRegulatingTTParams.model_fields
    assert "vapor_temperature" not in SelfRegulatingTTParams.model_fields
    assert "aggressive_product" not in SelfRegulatingTTParams.model_fields


def test_voltage_changes_current_but_not_selected_cable_or_total_power() -> None:
    at_220 = _calculate(supply_voltage=220)
    at_380 = _calculate(supply_voltage=380)

    assert at_220.cable_model == at_380.cable_model == "25ТТН2"
    assert at_220.total_power == at_380.total_power
    assert at_220.current == pytest.approx(at_220.total_power / 220, abs=0.001)
    assert at_380.current == pytest.approx(at_380.total_power / 380, abs=0.001)


@pytest.mark.parametrize("missing_field", ["nominal_power", "max_product_temp"])
def test_missing_required_power_catalog_field_fails_closed(missing_field: str) -> None:
    rows = deepcopy(POWER_ROWS)
    rows[0].pop(missing_field)

    with pytest.raises(ElectricalFormulaError) as raised:
        calc_self_regulating_tt(
            _params(),
            catalog_rows=rows,
            section_catalog_rows=deepcopy(SECTION_ROWS),
            bom_catalog_rows=deepcopy(BOM_ROWS),
        )

    assert raised.value.code == "ELECTRICAL_CATALOG_ROW_INVALID"
    assert raised.value.details == {"model": "10ТТН2", "missing_fields": [missing_field]}


def test_missing_model_temperature_rows_fail_closed() -> None:
    section_rows = [row for row in SECTION_ROWS if row["mark"] != "10ТТН2"]

    with pytest.raises(ElectricalFormulaError) as raised:
        calc_self_regulating_tt(
            _params(),
            catalog_rows=deepcopy(POWER_ROWS),
            section_catalog_rows=section_rows,
            bom_catalog_rows=deepcopy(BOM_ROWS),
        )

    assert raised.value.code == "ELECTRICAL_CATALOG_ROW_INVALID"
    assert raised.value.details == {
        "model": "10ТТН2",
        "missing_fields": ["min_temperature"],
    }


def test_tank_geometry_uses_the_same_passport_power_selector() -> None:
    result = _calculate(
        pipe_length=1,
        tank_shape="cylindrical",
        tank_diameter=2,
        heating_height=3,
        laying_step=0.1,
    )

    assert result.cable_model == "25ТТН2"
    assert result.power_per_meter == 25


def test_winding_factor_is_computed_from_diameter_and_pitch_not_caller_coefficient() -> None:
    assert "winding_coefficient" not in SelfRegulatingTTParams.model_fields

    straight = _calculate(required_power_per_meter=27)
    wound = _calculate(
        required_power_per_meter=27,
        outer_diameter_mm=108,
        winding_pitch=350,
    )

    assert straight.cable_model == "31ТТН2"
    assert wound.cable_model == "25ТТН2"
    assert wound.winding_coefficient < 1.4

    with pytest.raises(ValidationError):
        _params(winding_coefficient=9)


def test_tank_forces_unit_winding_factor() -> None:
    result = _calculate(
        pipe_length=1,
        tank_shape="cylindrical",
        tank_diameter=2,
        heating_height=3,
        laying_step=0.1,
    )

    assert result.winding_coefficient == 1


@pytest.mark.parametrize(
    "updates",
    [
        {"tank_shape": "cylindrical"},
        {
            "tank_shape": "cylindrical",
            "tank_diameter": 2,
            "heating_height": 3,
            "laying_step": 0.1,
            "outer_diameter_mm": 108,
        },
        {
            "tank_shape": "cylindrical",
            "tank_diameter": 2,
            "heating_height": 3,
            "laying_step": 0.1,
            "winding_pitch": 350,
        },
        {
            "tank_shape": "rectangular",
            "tank_length": 4,
            "heating_height": 3,
            "laying_step": 0.1,
        },
    ],
)
def test_incomplete_or_pipe_winding_tank_input_fails_closed(updates: dict[str, object]) -> None:
    with pytest.raises(ValueError):
        _params(**updates)
