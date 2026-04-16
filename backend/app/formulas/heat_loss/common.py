"""Общие утилиты расчёта теплопотерь.

ВНИМАНИЕ: Финальные формулы будут предоставлены отдельно (см. CLAUDE.md).
Текущая реализация — физически корректная приближённая математика
(теплопроводность по закону Фурье), пригодная для сквозной интеграции
и тестирования структуры расчёта. Заменяется точечно в соответствующих
модулях без изменения сигнатур.
"""

from typing import Any

DEFAULT_COEFFICIENTS: dict[str, float] = {
    "wind_factor": 1.0,
    "safety_factor": 1.1,
    "location_indoor": 0.9,
    "location_outdoor": 1.0,
}


def apply_coefficients(
    base_value: float,
    coefficients: dict[str, float] | None,
    keys: list[str],
) -> float:
    """Применяет заданные коэффициенты мультипликативно."""
    if not coefficients:
        return base_value
    value = base_value
    for key in keys:
        if key in coefficients:
            value *= coefficients[key]
    return value


def validate_positive(name: str, value: float) -> None:
    if value <= 0:
        raise ValueError(f"{name} должно быть положительным (получено {value})")


def validate_temperature_range(ambient: float, process: float) -> None:
    if process <= ambient:
        raise ValueError("Температура продукта должна быть выше температуры окружающей среды")


def location_key(location: str) -> str:
    return f"location_{location}"


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
