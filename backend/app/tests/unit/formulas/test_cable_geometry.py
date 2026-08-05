"""Unit-тесты геометрии укладки кабеля на поверхности резервуаров.

Формула: N = (perimeter / 2) × (heating_height / laying_step)
  - cylindrical: perimeter = π × d
  - rectangular: perimeter = 2 × (L + B)
"""

import math

import pytest

from app.formulas.electrical.cable_geometry import compute_tank_cable_length


class TestCylinderPerimeter:
    def test_basic_cylinder(self):
        """Цилиндр Ø2 м, h_укл=3 м, w=0.1 м → N = π × 2 / 2 × 30 = 94.25 м."""
        n = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=3.0,
            laying_step=0.1,
        )
        assert n == pytest.approx(math.pi * 2.0 / 2.0 * (3.0 / 0.1), rel=1e-6)

    def test_doubling_height_doubles_length(self):
        n1 = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=2.0,
            laying_step=0.1,
        )
        n2 = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=4.0,
            laying_step=0.1,
        )
        assert n2 == pytest.approx(n1 * 2.0, rel=1e-6)

    def test_smaller_step_increases_length(self):
        """Меньший шаг укладки → больше витков → больше длина."""
        coarse = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=2.0,
            laying_step=0.2,
        )
        fine = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=2.0,
            laying_step=0.1,
        )
        assert fine > coarse

    def test_missing_diameter_raises(self):
        with pytest.raises(ValueError, match="diameter"):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=None,
                heating_height=3.0,
                laying_step=0.1,
            )

    def test_zero_diameter_raises(self):
        with pytest.raises(ValueError, match="diameter"):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=0.0,
                heating_height=3.0,
                laying_step=0.1,
            )


class TestRectangularPerimeter:
    def test_basic_rectangular(self):
        """Прямоугольник 4×3 м, h_укл=2 м, w=0.1 м → N = (2(4+3)/2) × 20 = 140 м."""
        n = compute_tank_cable_length(
            shape="rectangular",
            length=4.0,
            width=3.0,
            heating_height=2.0,
            laying_step=0.1,
        )
        assert n == pytest.approx(7.0 * 20.0, rel=1e-6)

    def test_perimeter_formula(self):
        """N = (2(L+B)/2) × (h/w) = (L+B) × (h/w)."""
        L, B, h, w = 5.0, 2.0, 1.5, 0.15
        n = compute_tank_cable_length(
            shape="rectangular",
            length=L,
            width=B,
            heating_height=h,
            laying_step=w,
        )
        assert n == pytest.approx((L + B) * (h / w), rel=1e-6)

    def test_missing_length_raises(self):
        with pytest.raises(ValueError, match="length|width"):
            compute_tank_cable_length(
                shape="rectangular",
                length=None,
                width=3.0,
                heating_height=2.0,
                laying_step=0.1,
            )

    def test_missing_width_raises(self):
        with pytest.raises(ValueError, match="length|width"):
            compute_tank_cable_length(
                shape="rectangular",
                length=4.0,
                width=None,
                heating_height=2.0,
                laying_step=0.1,
            )


class TestUnsupportedShapes:
    def test_unknown_shape_raises(self):
        with pytest.raises(ValueError):
            compute_tank_cable_length(
                shape="hexagonal",
                diameter=2.0,
                heating_height=2.0,
                laying_step=0.1,
            )


class TestStepValidation:
    def test_step_below_min_raises(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        with pytest.raises(ValueError, match="0.1"):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=2.0,
                heating_height=2.0,
                laying_step=0.099,
            )

    def test_step_above_max_raises(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        with pytest.raises(ValueError, match="0.4"):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=2.0,
                heating_height=2.0,
                laying_step=0.401,
            )

    def test_step_at_min_ok(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        n = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=2.0,
            laying_step=0.1,
        )
        assert n > 0

    def test_step_at_max_ok(self):
        """Source: Блок теплопотери и выбор кабеля/переменные резервуар.xlsx, Лист1!A22:D22."""
        n = compute_tank_cable_length(
            shape="cylindrical",
            diameter=2.0,
            heating_height=2.0,
            laying_step=0.4,
        )
        assert n > 0

    def test_zero_step_raises(self):
        with pytest.raises(ValueError):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=2.0,
                heating_height=2.0,
                laying_step=0.0,
            )


class TestHeightValidation:
    def test_negative_height_raises(self):
        with pytest.raises(ValueError, match="heating_height"):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=2.0,
                heating_height=-1.0,
                laying_step=0.1,
            )

    def test_zero_height_raises(self):
        with pytest.raises(ValueError, match="heating_height"):
            compute_tank_cable_length(
                shape="cylindrical",
                diameter=2.0,
                heating_height=0.0,
                laying_step=0.1,
            )
