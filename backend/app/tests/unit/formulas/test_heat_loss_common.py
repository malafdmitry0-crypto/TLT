"""Unit-тесты утилит heat_loss/common.py.

Эти утилиты используются во всех формулах теплопотерь — их корректность
критична для согласованности всех расчётов.
"""

import pytest

from app.formulas.heat_loss.common import (
    DEFAULT_COEFFICIENTS,
    apply_coefficients,
    merge_coefficients,
    safe_dict_get,
    validate_positive,
    validate_temperature_range,
)


class TestValidatePositive:
    def test_accepts_positive(self):
        validate_positive("X", 1.0)
        validate_positive("X", 0.001)
        validate_positive("X", 1e10)

    @pytest.mark.parametrize("value", [0, -1, -0.0001, -1e6])
    def test_rejects_non_positive(self, value):
        with pytest.raises(ValueError, match="положительным"):
            validate_positive("Толщина", value)

    def test_error_contains_field_name_and_value(self):
        with pytest.raises(ValueError) as exc:
            validate_positive("Диаметр", -5.0)
        assert "Диаметр" in str(exc.value)
        assert "-5" in str(exc.value)


class TestValidateTemperatureRange:
    def test_ok_when_process_hotter(self):
        validate_temperature_range(-20, 80)

    def test_rejects_equal(self):
        with pytest.raises(ValueError, match="выше"):
            validate_temperature_range(50, 50)

    def test_rejects_reversed(self):
        with pytest.raises(ValueError, match="выше"):
            validate_temperature_range(100, 20)


class TestApplyCoefficients:
    def test_no_coefficients_returns_base(self):
        assert apply_coefficients(100.0, None, ["k1"]) == 100.0
        assert apply_coefficients(100.0, {}, ["k1"]) == 100.0

    def test_applies_single_coefficient(self):
        assert apply_coefficients(100.0, {"k1": 1.5}, ["k1"]) == 150.0

    def test_multiplicative_across_keys(self):
        assert apply_coefficients(100.0, {"a": 2.0, "b": 1.5}, ["a", "b"]) == 300.0

    def test_ignores_unused_keys(self):
        assert apply_coefficients(100.0, {"a": 2.0, "x": 99}, ["a"]) == 200.0

    def test_missing_key_skipped(self):
        """Если ключа нет в coefficients — не применяем."""
        assert apply_coefficients(100.0, {"a": 2.0}, ["b"]) == 100.0


class TestMergeCoefficients:
    def test_returns_defaults_when_no_sources(self):
        result = merge_coefficients()
        assert result == DEFAULT_COEFFICIENTS
        # Должна быть копия, не ссылка
        result["new_key"] = 999
        assert "new_key" not in DEFAULT_COEFFICIENTS

    def test_later_source_overrides_earlier(self):
        r = merge_coefficients({"safety_factor": 1.2}, {"safety_factor": 1.5})
        assert r["safety_factor"] == 1.5

    def test_none_sources_skipped(self):
        r = merge_coefficients(None, {"safety_factor": 1.3}, None)
        assert r["safety_factor"] == 1.3

    def test_default_safety_factor_is_1_1(self):
        assert DEFAULT_COEFFICIENTS["safety_factor"] == 1.1


class TestSafeDictGet:
    def test_returns_value_when_exists(self):
        assert safe_dict_get({"a": 1}, "a") == 1

    def test_returns_default_when_missing(self):
        assert safe_dict_get({}, "a", 42) == 42

    def test_default_is_none_by_default(self):
        assert safe_dict_get({}, "a") is None
