"""Общие утилиты расчёта теплопотерь по первичным формулам ТНП."""

from typing import Any

from app.formulas.heat_loss.core.thermal import multiply_factors

DEFAULT_COEFFICIENTS: dict[str, float] = {
    "safety_factor": 1.1,
}


def apply_coefficients(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    factors = tuple(coefficients[key] for key in keys if key in coefficients)
    return multiply_factors(base_value, factors)


def validate_positive(name: str, value: float) -> None:
    if value <= 0:
        raise ValueError(f"{name} должно быть положительным (получено {value})")


def validate_temperature_range(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError("Температура продукта должна быть выше температуры окружающей среды")


def merge_coefficients(
    *sources: dict[str, float] | None,
) -> dict[str, float]:
    merged: dict[str, float] = dict(DEFAULT_COEFFICIENTS)
    for src in sources:
        if src:
            merged.update(src)
    return merged


def safe_dict_get(d: dict[str, Any], key: str, default: float | None = None) -> Any:
    return d.get(key, default)
