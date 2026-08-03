"""Focused goldens for the normative ТТН/ТТВ/ТТХ formula."""

import math
from decimal import Decimal

import pytest

from app.electrical_domain import ElectricalFormulaError
from app.formulas.electrical.self_regulating import (
    calc_self_regulating_tt,
    compute_winding_factor,
    max_winding_factor,
)
from app.reference_data.loader import clear_cache, get_tt_cable_by_model
from app.schemas.calculation import SelfRegulatingTTParams


def _params(**kwargs) -> SelfRegulatingTTParams:
    defaults = {
        "required_power_per_meter": 5.0,
        "pipe_length": 50.0,
        "process_temperature": 20.0,
        "maintain_temperature": 10.0,
        "supply_voltage": 230.0,
        "safety_factor": 1.0,
        "winding_coefficient": 1.0,
    }
    defaults.update(kwargs)
    return SelfRegulatingTTParams(**defaults)


@pytest.mark.parametrize(
    ("t1", "t2", "series"),
    [(20, None, "ТТН"), (65, None, "ТТВ"), (20, 85, "ТТВ"), (120, None, "ТТХ")],
)
def test_strict_temperature_series_boundaries(t1, t2, series):
    result = calc_self_regulating_tt(_params(process_temperature=t1, vapor_temperature=t2))
    assert result.series == series


@pytest.mark.parametrize(("t1", "t2"), [(150, None), (20, 250)])
def test_temperature_above_ttx_is_typed_error(t1, t2):
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(_params(process_temperature=t1, vapor_temperature=t2))
    assert exc.value.code == "ELECTRICAL_CABLE_TEMPERATURE_LIMIT_EXCEEDED"


def test_power_curve_uses_exact_catalog_coefficients():
    result = calc_self_regulating_tt(_params(cable_mark="25ТТН2"))
    assert result.power_per_meter == 25.08


@pytest.mark.parametrize(("aggressive", "suffix"), [(False, "СТ"), (True, "СР")])
def test_ttn_suffix_depends_on_aggressiveness(aggressive, suffix):
    result = calc_self_regulating_tt(_params(cable_mark="25ТТН2", aggressive_product=aggressive))
    assert result.cable_mark == f"25ТТН2-{suffix}"


@pytest.mark.parametrize("series_temperature", [80, 130])
@pytest.mark.parametrize("aggressive", [False, True])
def test_ttv_and_ttx_are_always_sr(series_temperature, aggressive):
    result = calc_self_regulating_tt(
        _params(process_temperature=series_temperature, aggressive_product=aggressive)
    )
    assert result.cable_mark.endswith("-СР")


def test_manual_input_is_exact_base_model_only():
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(_params(cable_mark="25ТТН2-СТ"))
    assert exc.value.code == "ELECTRICAL_CABLE_CONSTRUCTION_UNSUPPORTED"


@pytest.mark.parametrize("legacy_mark", ["ТЛТ-25", "  тлт - 25  "])
def test_legacy_tlt_mark_is_rejected_without_catalog_lookup(legacy_mark, monkeypatch):
    def fail_lookup(_model):
        raise AssertionError("legacy mark must be rejected before TT catalog lookup")

    monkeypatch.setattr(
        "app.formulas.electrical.self_regulating.get_tt_cable_by_model",
        fail_lookup,
    )

    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(_params(cable_mark=legacy_mark))

    assert exc.value.code == "ELECTRICAL_LEGACY_CABLE_MARK_UNSUPPORTED"
    assert exc.value.details == {"requested_model": "ТЛТ-25"}


def test_manual_model_must_belong_to_computed_series():
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(_params(process_temperature=80, cable_mark="25ТТН2"))
    assert exc.value.code == "ELECTRICAL_CABLE_SERIES_MISMATCH"


@pytest.mark.parametrize(("required", "threads"), [(8, 1), (40, 2), (70, 3)])
def test_auto_selects_minimum_sufficient_thread_count(required, threads):
    result = calc_self_regulating_tt(_params(required_power_per_meter=required))
    assert result.num_circuits == threads


def test_three_threads_insufficient_is_typed_error():
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(_params(required_power_per_meter=1000))
    assert exc.value.code == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"


@pytest.mark.parametrize("threads", [0, 4])
def test_formula_rejects_manual_thread_count_outside_one_to_three(threads):
    params = _params().model_copy(update={"number_of_threads": threads})
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(params)
    assert exc.value.code == "ELECTRICAL_THREAD_COUNT_INVALID"


def test_new_calculation_requires_230_v():
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(_params(supply_voltage=220))
    assert exc.value.code == "ELECTRICAL_NOMINAL_VOLTAGE_UNSUPPORTED"


def test_only_technical_minimum_policy_is_accepted():
    params = _params().model_copy(update={"selection_policy": "cheapest"})
    with pytest.raises(ElectricalFormulaError) as exc:
        calc_self_regulating_tt(params)
    assert exc.value.code == "ELECTRICAL_SELECTION_POLICY_UNSUPPORTED"


def test_no_pitch_means_straight_laying_even_with_legacy_coefficient():
    result = calc_self_regulating_tt(_params(winding_coefficient=1.1, winding_pitch=None))
    assert result.winding_coefficient == 1


@pytest.mark.parametrize(
    ("diameter", "expected_limit"),
    [(56.999, "1.0"), (57, "1.1"), (75, "1.2"), (89, "1.3"), (108, "1.4")],
)
def test_winding_diameter_boundaries(diameter, expected_limit):
    assert max_winding_factor(diameter) == Decimal(expected_limit)


def test_winding_pitch_must_exceed_diameter():
    with pytest.raises(ElectricalFormulaError) as exc:
        compute_winding_factor(outer_diameter_mm=57, winding_pitch_mm=57)
    assert exc.value.code == "ELECTRICAL_WINDING_PITCH_INVALID"


class TestIndependentCableCalculations:
    def test_auto_uses_multiple_threads_without_escalating_temperature_series(self):
        result = calc_self_regulating_tt(
            _params(
                process_temperature=50,
                maintain_temperature=50,
                required_power_per_meter=18,
                safety_factor=1.1,
            )
        )
        assert result.series == "ТТН"
        assert result.selected_cable == "31ТТН2"
        assert result.num_circuits == 2
        assert result.power_per_meter == pytest.approx(-0.491 * 50 + 37.5, rel=1e-3)

    def test_auto_uses_minimum_power_model_for_one_thread(self):
        result = calc_self_regulating_tt(
            _params(
                process_temperature=40,
                maintain_temperature=40,
                required_power_per_meter=5,
                safety_factor=1.1,
            )
        )
        assert result.selected_cable == "17ТТН2"
        assert result.num_circuits == 1
        assert result.installed_power_per_meter >= 5.5

    def test_power_curve_uses_t3_not_t1(self):
        result = calc_self_regulating_tt(
            _params(cable_mark="31ТТН2", process_temperature=60, maintain_temperature=40)
        )
        assert result.power_per_meter == pytest.approx(-0.491 * 40 + 37.5, rel=1e-3)

    def test_missing_t3_is_typed_curve_error(self):
        with pytest.raises(ElectricalFormulaError) as exc:
            calc_self_regulating_tt(_params(maintain_temperature=None))
        assert exc.value.code == "ELECTRICAL_CABLE_POWER_CURVE_INVALID"

    def test_current_is_derived_from_total_power_at_230_v(self):
        result = calc_self_regulating_tt(
            _params(cable_mark="30ТТВ2", process_temperature=80, maintain_temperature=50)
        )
        assert result.voltage == 230
        assert result.current == pytest.approx(result.total_power / 230, abs=0.001)

    def test_manual_coverage_uses_winding_factor(self):
        result = calc_self_regulating_tt(
            _params(
                cable_mark="30ТТВ2",
                process_temperature=80,
                maintain_temperature=50,
                required_power_per_meter=27,
                winding_coefficient=1.1,
                winding_pitch=100,
                number_of_threads=1,
            )
        )
        assert result.power_per_meter == 24.95
        assert result.installed_power_per_meter == pytest.approx(24.95 * 1.1)

    def test_auto_coverage_uses_winding_factor(self):
        result = calc_self_regulating_tt(
            _params(
                process_temperature=80,
                maintain_temperature=50,
                required_power_per_meter=27,
                winding_coefficient=1.1,
                winding_pitch=100,
            )
        )
        assert result.selected_cable == "30ТТВ2"
        assert result.num_circuits == 1

    def test_manual_lookup_uses_model_index(self, monkeypatch):
        clear_cache()
        assert get_tt_cable_by_model("30ТТВ2") is not None

        def fail_full_scan():
            raise AssertionError("manual lookup must not rescan the full catalog")

        monkeypatch.setattr("app.reference_data.loader._cables_tt", fail_full_scan)
        result = calc_self_regulating_tt(
            _params(cable_mark="30ТТВ2", process_temperature=80, maintain_temperature=50)
        )
        assert result.cable_mark == "30ТТВ2-СР"

    def test_explicit_threads_participate_in_auto_selection(self):
        result = calc_self_regulating_tt(
            _params(
                process_temperature=80,
                maintain_temperature=50,
                required_power_per_meter=30,
                number_of_threads=2,
            )
        )
        assert result.selected_cable == "30ТТВ2"
        assert result.num_circuits == 2
        assert result.installed_power_per_meter >= 30

    def test_threads_apply_to_length_power_order_length_and_current(self):
        result = calc_self_regulating_tt(
            _params(
                cable_mark="30ТТВ2",
                process_temperature=80,
                maintain_temperature=50,
                pipe_length=50,
                winding_coefficient=1.2,
                winding_pitch=90,
                number_of_threads=2,
            )
        )
        assert result.cable_length == 120
        assert result.order_cable_length == 132
        assert result.total_power == pytest.approx(result.power_per_meter * 120, abs=0.001)
        assert result.current == pytest.approx(result.total_power / 230, abs=0.001)
        assert result.installed_power_per_meter == pytest.approx(
            result.power_per_meter * 1.2 * 2, abs=0.001
        )

    def test_manual_model_must_cover_required_power(self):
        with pytest.raises(ElectricalFormulaError) as exc:
            calc_self_regulating_tt(
                _params(cable_mark="10ТТН2", required_power_per_meter=30, number_of_threads=1)
            )
        assert exc.value.code == "ELECTRICAL_CABLE_POWER_INSUFFICIENT"

    def test_manual_model_overrides_auto_choice(self):
        result = calc_self_regulating_tt(
            _params(cable_mark="60ТТВ2", process_temperature=80, required_power_per_meter=5)
        )
        assert result.selected_cable == "60ТТВ2"

    def test_unknown_manual_model_is_typed_error(self):
        with pytest.raises(ElectricalFormulaError) as exc:
            calc_self_regulating_tt(_params(cable_mark="99ТТВ9"))
        assert exc.value.code == "ELECTRICAL_CABLE_NOT_FOUND"

    def test_non_positive_manual_power_curve_is_typed_error(self, monkeypatch):
        row = {
            "model": "25ТТН2",
            "series": "ТТН",
            "nominal_power": 25,
            "q1": 0,
            "q2": 0,
        }
        monkeypatch.setattr(
            "app.formulas.electrical.self_regulating.get_tt_cable_by_model", lambda _model: row
        )
        with pytest.raises(ElectricalFormulaError) as exc:
            calc_self_regulating_tt(_params(cable_mark="25ТТН2"))
        assert exc.value.code == "ELECTRICAL_CABLE_POWER_CURVE_INVALID"

    def test_missing_power_curve_coefficient_is_typed_error(self):
        row = {
            "model": "25ТТН2",
            "series": "ТТН",
            "nominal_power": 25,
            "q2": 25,
        }
        with pytest.raises(ElectricalFormulaError) as exc:
            calc_self_regulating_tt(_params(cable_mark="25ТТН2"), catalog_rows=[row])
        assert exc.value.code == "ELECTRICAL_CABLE_POWER_CURVE_INVALID"
        assert exc.value.details == {"model": "25ТТН2"}

    def test_non_positive_auto_power_curves_are_typed_error(self, monkeypatch):
        rows = [
            {
                "model": "25ТТН2",
                "series": "ТТН",
                "nominal_power": 25,
                "q1": -1,
                "q2": 0,
            }
        ]
        monkeypatch.setattr("app.formulas.electrical.self_regulating.list_tt_cables", lambda: rows)
        with pytest.raises(ElectricalFormulaError) as exc:
            calc_self_regulating_tt(_params())
        assert exc.value.code == "ELECTRICAL_CABLE_POWER_CURVE_INVALID"


class TestPreservedTankGeometry:
    def test_explicit_pipe_length_without_tank(self):
        result = calc_self_regulating_tt(_params(pipe_length=50))
        assert result.cable_length == pytest.approx(50 * result.num_circuits)

    def test_cylindrical_tank_geometry_overrides_pipe_length(self):
        result = calc_self_regulating_tt(
            _params(
                pipe_length=1,
                tank_shape="cylindrical",
                tank_diameter=2,
                heating_height=3,
                laying_step=0.1,
            )
        )
        expected = math.pi * 2 / 2 * (3 / 0.1)
        assert result.cable_length == pytest.approx(expected * result.num_circuits, abs=0.001)

    def test_rectangular_tank_geometry_overrides_pipe_length(self):
        result = calc_self_regulating_tt(
            _params(
                pipe_length=1,
                tank_shape="rectangular",
                tank_length=4,
                tank_width=3,
                heating_height=2,
                laying_step=0.1,
            )
        )
        assert result.cable_length == pytest.approx(140 * result.num_circuits, abs=0.001)
