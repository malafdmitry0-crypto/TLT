"""Unit-тесты расчёта резистивных кабелей ТТ Р1 / ТТ Р3."""

import math

import pytest

from app.formulas.electrical.resistive import (
    ALPHA,
    RHO,
    _rho_t,
    calc_resistive_single_core,
    calc_resistive_three_core,
)
from app.schemas.calculation import ResistiveSingleCoreParams, ResistiveThreeCoreParams

# Минимальный каталог для тестов — охватывает диапазон сечений
_SC_CATALOG = [
    {"model": "ТТ Р1-0.5", "conductor_cross_section": 0.5},
    {"model": "ТТ Р1-1.0", "conductor_cross_section": 1.0},
    {"model": "ТТ Р1-2.5", "conductor_cross_section": 2.5},
    {"model": "ТТ Р1-4.0", "conductor_cross_section": 4.0},
    {"model": "ТТ Р1-6.0", "conductor_cross_section": 6.0},
]

_TC_CATALOG = [
    {"model": "ТТ Р3-0.5", "conductor_cross_section": 0.5},
    {"model": "ТТ Р3-1.0", "conductor_cross_section": 1.0},
    {"model": "ТТ Р3-2.5", "conductor_cross_section": 2.5},
    {"model": "ТТ Р3-4.0", "conductor_cross_section": 4.0},
    {"model": "ТТ Р3-6.0", "conductor_cross_section": 6.0},
]


def _sc(**kwargs) -> ResistiveSingleCoreParams:
    defaults = {
        "required_heat_loss": 5000.0,
        "pipe_length": 100.0,
        "process_temperature": 60.0,
        "supply_voltage": 220.0,
        "connection_type": "line_1ph",
        "winding_coefficient": 1.0,
        "cable_catalog": _SC_CATALOG,
    }
    defaults.update(kwargs)
    return ResistiveSingleCoreParams(**defaults)


def _tc(**kwargs) -> ResistiveThreeCoreParams:
    defaults = {
        "required_heat_loss": 5000.0,
        "pipe_length": 100.0,
        "process_temperature": 60.0,
        "supply_voltage": 220.0,
        "connection_type": "line_1ph",
        "winding_coefficient": 1.0,
        "cable_catalog": _TC_CATALOG,
    }
    defaults.update(kwargs)
    return ResistiveThreeCoreParams(**defaults)


class TestRhoT:
    def test_at_20c_equals_rho(self):
        assert _rho_t(20.0) == pytest.approx(RHO, rel=1e-6)

    def test_increases_with_temperature(self):
        assert _rho_t(60.0) > _rho_t(20.0)

    def test_at_60c(self):
        expected = RHO * (1.0 + ALPHA * 40)
        assert _rho_t(60.0) == pytest.approx(expected, rel=1e-6)


class TestSingleCoreLinear:
    def test_required_cross_section_formula(self):
        """Line 220В: Sк = (Q/U²) × ρ_T × N."""
        params = _sc(
            required_heat_loss=5000.0,
            pipe_length=100.0,
            process_temperature=60.0,
            supply_voltage=220.0,
            connection_type="line_1ph",
            winding_coefficient=1.0,
        )
        r = calc_resistive_single_core(params)
        rho_t = RHO * (1.0 + ALPHA * (60.0 - 20.0))
        sk_expected = (5000.0 / 220.0**2) * rho_t * 100.0
        assert r.required_cross_section == pytest.approx(sk_expected, rel=1e-4)

    def test_selected_cable_covers_required(self):
        r = calc_resistive_single_core(_sc())
        assert r.conductor_cross_section >= r.required_cross_section

    def test_actual_power_positive(self):
        r = calc_resistive_single_core(_sc())
        assert r.total_power > 0

    def test_current_positive(self):
        r = calc_resistive_single_core(_sc())
        assert r.current > 0

    def test_winding_coefficient_scales_length(self):
        r1 = calc_resistive_single_core(_sc(winding_coefficient=1.0))
        r2 = calc_resistive_single_core(_sc(winding_coefficient=1.3))
        assert r2.cable_length == pytest.approx(r1.cable_length * 1.3, rel=1e-4)

    def test_number_of_threads_scales_length(self):
        r1 = calc_resistive_single_core(_sc(winding_coefficient=1.0, number_of_threads=1))
        r2 = calc_resistive_single_core(_sc(winding_coefficient=1.0, number_of_threads=3))
        assert r2.cable_length == pytest.approx(r1.cable_length * 3, rel=1e-4)
        assert r2.num_circuits == 3

    def test_selection_uses_passport_resistance_for_power_and_current(self):
        catalog = [
            {"model": "ТТ Р1 80,00", "conductor_cross_section": 0.22, "resistance_ohm_km": 80.0},
            {"model": "ТТ Р1 50,00", "conductor_cross_section": 0.35, "resistance_ohm_km": 50.0},
        ]
        r = calc_resistive_single_core(
            _sc(required_heat_loss=5000.0, pipe_length=100.0, cable_catalog=catalog)
        )
        assert r.selected_cable == "ТТ Р1 80,00"
        assert r.resistance_ohm_km == pytest.approx(80.0)
        assert r.circuit_resistance_ohm == pytest.approx(8.0)
        assert r.total_power == pytest.approx(220.0**2 / 8.0, rel=1e-4)
        assert r.current == pytest.approx((220.0**2 / 8.0) / 220.0, rel=1e-4)
        assert r.current <= 65.0

    def test_selection_rejects_passport_cables_above_65a(self):
        catalog = [
            {"model": "ТТ Р1 1,810", "conductor_cross_section": 9.69, "resistance_ohm_km": 1.81},
            {"model": "ТТ Р1 80,00", "conductor_cross_section": 0.22, "resistance_ohm_km": 80.0},
        ]
        r = calc_resistive_single_core(
            _sc(required_heat_loss=5000.0, pipe_length=100.0, cable_catalog=catalog)
        )
        assert r.selected_cable == "ТТ Р1 80,00"
        assert r.current <= 65.0

    def test_all_passport_candidates_over_65a_raise(self):
        catalog = [
            {"model": "ТТ Р1 1,810", "conductor_cross_section": 9.69, "resistance_ohm_km": 1.81},
        ]
        with pytest.raises(ValueError, match="65 А"):
            calc_resistive_single_core(
                _sc(required_heat_loss=5000.0, pipe_length=100.0, cable_catalog=catalog)
            )

    def test_auto_vsdx_selects_u_n_m_by_passport_resistance(self):
        catalog = [
            {"model": "ТТ Р1 100,0", "conductor_cross_section": 0.47, "resistance_ohm_km": 100.0},
            {"model": "ТТ Р1 80,0", "conductor_cross_section": 0.22, "resistance_ohm_km": 80.0},
        ]
        r = calc_resistive_single_core(
            _sc(
                selection_mode="auto",
                required_heat_loss=5000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
            )
        )
        assert r.selection_mode == "auto"
        assert r.selected_cable == "ТТ Р1 100,0"
        assert r.connection_type == "loop_1ph"
        assert r.voltage == pytest.approx(380.0)
        assert r.scheme_threads == 2
        assert r.scheme_count == 1
        assert r.linear_power_w_m >= r.required_linear_power_w_m
        assert r.p2_w_m <= r.p3_w_m
        assert r.current <= 65.0

    def test_auto_vsdx_uses_p3_linear_power_fallback_limit(self):
        catalog = [
            {"model": "ТТ Р1 100,0", "conductor_cross_section": 0.47, "resistance_ohm_km": 100.0},
            {"model": "ТТ Р1 80,0", "conductor_cross_section": 0.22, "resistance_ohm_km": 80.0},
        ]
        r = calc_resistive_single_core(
            _sc(
                selection_mode="auto",
                required_heat_loss=5000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
                max_linear_power_w_m=35.0,
            )
        )
        assert r.p2_w_m <= 35.0
        assert r.p3_w_m <= 35.0
        assert r.scheme_count is not None and r.scheme_count >= 1

    def test_auto_lowest_cost_ranks_technical_resistive_candidates(self):
        catalog = [
            {
                "model": "ТТ Р1 100,0",
                "conductor_cross_section": 0.47,
                "resistance_ohm_km": 100.0,
                "price_per_meter": 1000.0,
                "stock_status": "in_stock",
            },
            {
                "model": "ТТ Р1 80,0",
                "conductor_cross_section": 0.22,
                "resistance_ohm_km": 80.0,
                "price_per_meter": 100.0,
                "stock_status": "in_stock",
            },
        ]
        r = calc_resistive_single_core(
            _sc(
                selection_mode="auto",
                required_heat_loss=5000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
                selection_policy="lowest_cost",
            )
        )

        assert r.selected_cable == "ТТ Р1 80,0"
        assert r.applied_selection_policy == "lowest_cost"
        assert r.commercial is not None
        assert r.commercial["cost_scope"] == "cable_only"

    def test_auto_commercial_snapshot_supports_accessory_cost_scope(self):
        catalog = [
            {
                "model": "ТТ Р1 100,0",
                "conductor_cross_section": 0.47,
                "resistance_ohm_km": 100.0,
                "price_per_meter": 100.0,
                "stock_status": "in_stock",
                "params": {"commercial": {"accessory_total_cost": 250.0}},
            },
        ]
        r = calc_resistive_single_core(
            _sc(
                selection_mode="auto",
                required_heat_loss=5000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
                selection_policy="lowest_cost",
            )
        )

        assert r.commercial is not None
        assert r.commercial["cost_scope"] == "cable_with_accessories"
        assert r.commercial["accessory_total_cost"] == pytest.approx(250.0)

    def test_auto_balanced_requires_approved_weights(self):
        catalog = [
            {
                "model": "ТТ Р1 100,0",
                "conductor_cross_section": 0.47,
                "resistance_ohm_km": 100.0,
                "price_per_meter": 100.0,
                "lead_time_days": 20,
                "stock_status": "in_stock",
            },
            {
                "model": "ТТ Р1 80,0",
                "conductor_cross_section": 0.22,
                "resistance_ohm_km": 80.0,
                "price_per_meter": 500.0,
                "lead_time_days": 1,
                "stock_status": "in_stock",
            },
        ]
        fallback = calc_resistive_single_core(
            _sc(
                selection_mode="auto",
                required_heat_loss=5000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
                selection_policy="balanced",
            )
        )
        approved = calc_resistive_single_core(
            _sc(
                selection_mode="auto",
                required_heat_loss=5000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
                selection_policy="balanced",
                balanced_weights={"cost": 0.0, "delivery": 1.0, "stock": 0.0, "supplier": 0.0},
                balanced_weights_approved=True,
                balanced_weights_version="test-approved",
            )
        )

        assert fallback.applied_selection_policy == "technical_minimum"
        assert fallback.warnings
        assert approved.selected_cable == "ТТ Р1 80,0"
        assert approved.applied_selection_policy == "balanced"
        assert approved.commercial is not None
        assert approved.commercial["balanced_weights_approved"] is True


class TestSingleCoreLoop:
    def test_loop_requires_larger_cross_section_than_line(self):
        r_line = calc_resistive_single_core(_sc(connection_type="line_1ph"))
        r_loop = calc_resistive_single_core(_sc(connection_type="loop_1ph"))
        assert r_loop.required_cross_section > r_line.required_cross_section

    def test_loop_cross_section_double_line(self):
        params_line = _sc(connection_type="line_1ph")
        params_loop = _sc(connection_type="loop_1ph")
        r_line = calc_resistive_single_core(params_line)
        r_loop = calc_resistive_single_core(params_loop)
        assert r_loop.required_cross_section == pytest.approx(
            r_line.required_cross_section * 2, rel=1e-4
        )


class TestSingleCoreStar:
    def test_star_380v(self):
        r = calc_resistive_single_core(_sc(connection_type="star_3ph", supply_voltage=380.0))
        assert r.total_power > 0
        assert r.current > 0

    def test_star_voltage_stored(self):
        r = calc_resistive_single_core(_sc(connection_type="star_3ph", supply_voltage=380.0))
        assert r.voltage == 380.0


class TestSingleCoreEdgeCases:
    def test_empty_catalog_raises(self):
        with pytest.raises(ValueError, match="пуст"):
            calc_resistive_single_core(_sc(cable_catalog=[]))

    def test_insufficient_catalog_raises(self):
        tiny_catalog = [{"model": "X", "conductor_cross_section": 0.0001}]
        with pytest.raises(ValueError, match="Не найден кабель"):
            calc_resistive_single_core(
                _sc(
                    required_heat_loss=100_000.0,
                    cable_catalog=tiny_catalog,
                )
            )

    def test_add_length_increases_cable_length(self):
        r_no = calc_resistive_single_core(_sc(add_length=0.0))
        r_with = calc_resistive_single_core(_sc(add_length=10.0))
        assert r_with.cable_length > r_no.cable_length


class TestThreeCoreConnections:
    def test_builtin_three_core_catalog_is_usable(self):
        """ТТ Р3 включён в UI, значит встроенный каталог должен реально считаться."""
        params = ResistiveThreeCoreParams(
            required_heat_loss=5000.0,
            pipe_length=100.0,
            process_temperature=60.0,
            supply_voltage=380.0,
            selection_mode="auto",
            connection_type="line_1ph",
        )
        result = calc_resistive_three_core(params)
        assert result.selected_cable.startswith("ТТ Р3")
        assert result.conductor_cross_section > 0
        assert result.resistance_ohm_km > 0
        assert result.total_power > 0

    def test_three_core_parses_section_from_model_as_fallback(self):
        """Явные поля приоритетны, но legacy-каталог с маркой ТТ Р3 ещё считается."""
        result = calc_resistive_three_core(_tc(cable_catalog=[{"model": "ТТ Р3 х 1,5-1,0"}]))

        assert result.selected_cable == "ТТ Р3 х 1,5-1,0"
        assert result.conductor_cross_section == pytest.approx(1.5)
        assert result.resistance_ohm_km == pytest.approx(11.666666666666666)

    def test_auto_vsdx_three_core_selects_u_n_m_by_passport_resistance(self):
        catalog = [
            {"model": "ТТ Р3 100,0", "conductor_cross_section": 0.47, "resistance_ohm_km": 100.0},
            {"model": "ТТ Р3 80,0", "conductor_cross_section": 0.22, "resistance_ohm_km": 80.0},
        ]

        r = calc_resistive_three_core(
            _tc(
                selection_mode="auto",
                required_heat_loss=10000.0,
                pipe_length=100.0,
                cable_catalog=catalog,
            )
        )

        resistance_per_m = 100.0 / 1000.0
        section_length = 100.0
        expected_total_power = (380.0**2 / (resistance_per_m * section_length * 2.0)) * 3.0
        expected_p2 = expected_total_power / (section_length * 2.0)

        assert r.selection_mode == "auto"
        assert r.selected_cable == "ТТ Р3 100,0"
        assert r.connection_type == "loop_2x3"
        assert r.voltage == pytest.approx(380.0)
        assert r.scheme_count == 1
        assert r.scheme_threads == 2
        assert r.total_power == pytest.approx(expected_total_power, rel=1e-6)
        assert r.current == pytest.approx(expected_total_power / 380.0, rel=1e-6)
        assert r.p2_w_m == pytest.approx(expected_p2, rel=1e-6)
        assert r.linear_power_w_m >= r.required_linear_power_w_m
        assert r.current <= 65.0
        assert r.applied_selection_policy == "technical_minimum"

    def test_auto_vsdx_three_core_star_uses_r3_connection_multiplier(self):
        """Golden: VSDX p=p2*N*M plus ТТ Р3 has three parallel heating cores."""
        catalog = [
            {"model": "ТТ Р3 100,0", "conductor_cross_section": 0.47, "resistance_ohm_km": 100.0},
        ]

        r = calc_resistive_three_core(
            _tc(
                selection_mode="auto",
                required_heat_loss=4500.0,
                pipe_length=100.0,
                cable_catalog=catalog,
                max_linear_power_w_m=20.0,
            )
        )

        resistance_per_m = 100.0 / 1000.0
        section_length = 100.0
        phase_voltage = 380.0 / math.sqrt(3.0)
        expected_total_power = (phase_voltage**2 / (resistance_per_m * section_length * 3.0)) * 3.0
        expected_p2 = expected_total_power / (section_length * 3.0)

        assert r.selection_mode == "auto"
        assert r.selected_cable == "ТТ Р3 100,0"
        assert r.connection_type == "star_3x3"
        assert r.voltage == pytest.approx(380.0)
        assert r.scheme_count == 1
        assert r.scheme_threads == 3
        assert r.total_power == pytest.approx(expected_total_power, rel=1e-6)
        assert r.current == pytest.approx(expected_total_power / (380.0 * math.sqrt(3.0)), abs=1e-3)
        assert r.p2_w_m == pytest.approx(expected_p2, rel=1e-6)
        assert r.linear_power_w_m >= r.required_linear_power_w_m
        assert r.p2_w_m <= r.p3_w_m
        assert r.current <= 65.0

    def test_empty_three_core_catalog_raises(self):
        with pytest.raises(ValueError, match="пуст"):
            calc_resistive_three_core(_tc(cable_catalog=[]))

    def test_line_1ph(self):
        r = calc_resistive_three_core(_tc(connection_type="line_1ph"))
        assert r.total_power > 0

    def test_loop_2x3(self):
        r = calc_resistive_three_core(_tc(connection_type="loop_2x3"))
        assert r.total_power > 0

    def test_loop_1x3(self):
        r = calc_resistive_three_core(_tc(connection_type="loop_1x3"))
        assert r.total_power > 0

    def test_star_3x3(self):
        r = calc_resistive_three_core(_tc(connection_type="star_3x3", supply_voltage=380.0))
        assert r.total_power > 0

    def test_star_1x3(self):
        r = calc_resistive_three_core(_tc(connection_type="star_1x3", supply_voltage=380.0))
        assert r.total_power > 0

    def test_line_smaller_section_than_loop_1x3(self):
        """Линия требует Sк/3, а петля 1×3ж — полное Sк (наибольшее)."""
        r_line = calc_resistive_three_core(_tc(connection_type="line_1ph"))
        r_loop = calc_resistive_three_core(_tc(connection_type="loop_1x3"))
        assert r_loop.required_cross_section > r_line.required_cross_section

    def test_invalid_connection_raises(self):
        with pytest.raises(Exception):
            ResistiveThreeCoreParams(
                required_heat_loss=5000.0,
                pipe_length=100.0,
                process_temperature=60.0,
                connection_type="bad_type",  # type: ignore[arg-type]
                cable_catalog=_TC_CATALOG,
            )


class TestTankGeometryIntegration:
    """Интеграция геометрии резервуара с расчётом резистивного кабеля.

    Когда задан tank_shape + heating_height + laying_step,
    pipe_length вычисляется из периметра, иначе используется явный pipe_length.
    """

    def test_explicit_pipe_length_wins_when_no_tank_geometry(self):
        """Без геометрии резервуара — используется указанный pipe_length."""
        r = calc_resistive_single_core(_sc(pipe_length=50.0))
        assert r.cable_length == pytest.approx(50.0, rel=1e-4)
        assert r.installed_cable_length == pytest.approx(50.0, rel=1e-4)
        assert r.order_cable_length == pytest.approx(55.0, rel=1e-4)

    def test_tank_cylinder_overrides_pipe_length(self):
        """Цилиндр Ø2 м, h=3 м, w=0.1 → pipe_length = π×2/2 × 30 ≈ 94.25."""
        from app.schemas.calculation import ResistiveSingleCoreParams

        params = ResistiveSingleCoreParams(
            required_heat_loss=5000.0,
            pipe_length=1.0,  # будет переопределён геометрией
            process_temperature=60.0,
            supply_voltage=220.0,
            connection_type="line_1ph",
            winding_coefficient=1.0,
            cable_catalog=_SC_CATALOG,
            tank_shape="cylindrical",
            tank_diameter=2.0,
            heating_height=3.0,
            laying_step=0.1,
        )
        r = calc_resistive_single_core(params)
        expected = math.pi * 2.0 / 2.0 * (3.0 / 0.1)
        assert r.cable_length == pytest.approx(expected, rel=1e-4)

    def test_tank_rectangular(self):
        """Прямоугольник 4×3 м, h=2 м, w=0.1 → N = 7 × 20 = 140."""
        from app.schemas.calculation import ResistiveSingleCoreParams

        params = ResistiveSingleCoreParams(
            required_heat_loss=5000.0,
            pipe_length=1.0,
            process_temperature=60.0,
            supply_voltage=220.0,
            connection_type="line_1ph",
            winding_coefficient=1.0,
            cable_catalog=_SC_CATALOG,
            tank_shape="rectangular",
            tank_length=4.0,
            tank_width=3.0,
            heating_height=2.0,
            laying_step=0.1,
        )
        r = calc_resistive_single_core(params)
        assert r.cable_length == pytest.approx(140.0, rel=1e-4)

    def test_winding_coefficient_still_applies_with_tank_geometry(self):
        """Коэффициент намотки умножает длину после расчёта геометрии."""
        from app.schemas.calculation import ResistiveSingleCoreParams

        params = ResistiveSingleCoreParams(
            required_heat_loss=5000.0,
            pipe_length=1.0,
            process_temperature=60.0,
            supply_voltage=220.0,
            connection_type="line_1ph",
            winding_coefficient=1.2,
            cable_catalog=_SC_CATALOG,
            tank_shape="cylindrical",
            tank_diameter=2.0,
            heating_height=3.0,
            laying_step=0.1,
        )
        r = calc_resistive_single_core(params)
        expected = (math.pi * 2.0 / 2.0 * (3.0 / 0.1)) * 1.2
        assert r.cable_length == pytest.approx(expected, rel=1e-4)
