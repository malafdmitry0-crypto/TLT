"""Загрузчик справочников из JSON с кэшированием.

Справочники читаются один раз при старте приложения (или при первом обращении)
и хранятся в модульных переменных. Для тестов предоставляется clear_cache().
"""

import json
from collections.abc import Sequence
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

_BASE_DIR = Path(__file__).parent

INSULATION_MATERIAL_RESELECTION_MESSAGE = (
    "Уточните конкретный материал и плотность из справочника теплоизоляции"
)


def _load_json(name: str) -> dict[str, Any]:
    path = _BASE_DIR / name
    with path.open(encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


@lru_cache
def _climate() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("climate.json")["cities"])


@lru_cache
def _insulation() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("insulation.json")["materials"])


@lru_cache
def _cables_tlt() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("cables_tlt.json")["cables"])


@lru_cache
def _accessories() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("accessories.json")["accessories"])


@lru_cache
def _pipe_materials() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("pipe_materials.json")["materials"])


@lru_cache
def _soil_conductivity() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("soil_conductivity.json")["entries"])


@lru_cache
def _resistive_cables() -> dict[str, Any]:
    return _load_json("resistive_cables.json")


@lru_cache
def _cables_tt() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("cables_tt.json")["cables"])


# ---- public API ----


def list_climate_cities() -> list[dict[str, Any]]:
    return list(_climate())


def get_climate_by_city(city: str) -> dict[str, Any] | None:
    """Возвращает климатические данные по названию города (нечувствительно к регистру)."""
    city_lower = city.strip().lower()
    for entry in _climate():
        if entry["city"].lower() == city_lower:
            return dict(entry)
    return None


def list_insulation_materials() -> list[dict[str, Any]]:
    return [_with_insulation_catalog_flags(entry) for entry in _insulation()]


def get_insulation_material(material: str) -> dict[str, Any] | None:
    for entry in _insulation():
        if entry["material"] == material:
            return _with_insulation_catalog_flags(entry)
    return None


def is_generic_insulation_material(material: str | None) -> bool:
    if not material:
        return False
    entry = get_insulation_material(material)
    return bool(
        entry
        and (
            entry.get("requires_material_reselection") is True
            or entry.get("deprecated") is True
            or entry.get("selectable") is False
        )
    )


def is_selectable_insulation_material(material: str | None) -> bool:
    if not material:
        return False
    entry = get_insulation_material(material)
    return bool(entry and not is_generic_insulation_material(material))


def _with_insulation_catalog_flags(entry: dict[str, Any]) -> dict[str, Any]:
    result = dict(entry)
    has_reference_lambda = (
        result.get("conductivity_20_plus") is not None
        or result.get("conductivity_19_minus") is not None
    )
    result.setdefault("selectable", has_reference_lambda and result.get("deprecated") is not True)
    result.setdefault("deprecated", False)
    result.setdefault("requires_material_reselection", result.get("selectable") is False)
    if result.get("requires_material_reselection") is True:
        result.setdefault("reselection_message", INSULATION_MATERIAL_RESELECTION_MESSAGE)
    return result


def get_insulation_temperature_range(material: str) -> tuple[float, float]:
    """Возвращает рабочий температурный диапазон материала изоляции, °C."""
    entry = get_insulation_material(material)
    if entry is not None:
        _ensure_selectable_insulation_material(entry)
        value = entry.get("temperature_range")
        if not isinstance(value, Sequence) or isinstance(value, str | bytes) or len(value) < 2:
            raise ValueError(f"Для материала изоляции '{material}' не задан температурный диапазон")
        return float(value[0]), float(value[1])
    raise ValueError(f"Неизвестный материал изоляции: {material}")


def list_tlt_cables() -> list[dict[str, Any]]:
    return list(_cables_tlt())


def list_basic_accessories() -> list[dict[str, Any]]:
    return list(_accessories())


def list_pipe_materials() -> list[dict[str, Any]]:
    return list(_pipe_materials())


def list_soil_conductivity() -> list[dict[str, Any]]:
    return list(_soil_conductivity())


def list_resistive_cables() -> dict[str, Any]:
    return dict(_resistive_cables())


def list_tt_cables() -> list[dict[str, Any]]:
    return list(_cables_tt())


def get_tt_cable_by_model(model: str) -> dict[str, Any] | None:
    """Кабель ТТН/ТТВ/ТТХ по базовому имени модели (без суффикса -СР/-СТ)."""
    for c in _cables_tt():
        if c["model"] == model:
            return dict(c)
    return None


def get_insulation_conductivity(material: str, temperature: float) -> float:
    """Возвращает теплопроводность λ материала.

    Для расширенного справочника поддерживаются:
    - conductivity_20_plus: число или [a, b] для формулы a + b * temperature
    - conductivity_19_minus: [λ(-60..19), λ(<-60)] или одиночное значение
    """
    for raw in _insulation():
        if raw["material"] == material:
            m = _with_insulation_catalog_flags(raw)
            _ensure_selectable_insulation_material(m)
            if temperature >= 20:
                return _positive_reference_lambda(
                    _resolve_warm_insulation_conductivity(
                        m.get("conductivity_20_plus"), temperature
                    ),
                    material,
                    temperature,
                )
            return _positive_reference_lambda(
                _resolve_cold_insulation_conductivity(m.get("conductivity_19_minus"), temperature),
                material,
                temperature,
            )
    raise ValueError(f"Неизвестный материал изоляции: {material}")


def _ensure_selectable_insulation_material(entry: dict[str, Any]) -> None:
    if entry.get("selectable") is False or entry.get("deprecated") is True:
        material = entry.get("material", "")
        message = entry.get("reselection_message") or INSULATION_MATERIAL_RESELECTION_MESSAGE
        raise ValueError(f"{message}: {material}")


def _positive_reference_lambda(value: float | None, material: str, temperature: float) -> float:
    if value is not None and value > 0:
        return value
    raise ValueError(
        f"Для материала изоляции '{material}' не задана расчётная λ(tm) при tm={temperature:g} °C"
    )


def _resolve_warm_insulation_conductivity(value: Any, temperature: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        values = [float(v) for v in value]
        if len(values) == 1:
            return values[0]
        if len(values) >= 2:
            a, b = values[0], values[1]
            return a + b * temperature
    if isinstance(value, dict):
        a = value.get("a")
        b = value.get("b")
        if a is not None and b is not None:
            return float(a) + float(b) * temperature
        constant = value.get("value")
        if constant is not None:
            return float(constant)
    return None


def _resolve_cold_insulation_conductivity(value: Any, temperature: float) -> float | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return float(value)
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        values = [float(v) for v in value]
        if len(values) == 1:
            return values[0]
        if len(values) >= 2:
            return values[0] if temperature >= -60 else values[1]
    return None


def get_pipe_material_lambda(material: str | None, temperature: float) -> float:
    """Возвращает λ(T) материала трубы из внутреннего справочника."""
    if material is None:
        raise ValueError("Не задан материал трубы для расчёта λ(T)")
    for entry in _pipe_materials():
        if entry["material"] == material:
            a = float(entry["a"])
            b = float(entry["b"])
            return max(a + b * (temperature + 40), 0.001)
    allowed = [entry["material"] for entry in _pipe_materials()]
    raise ValueError(f"Неизвестный материал трубы: '{material}'. Допустимые: {allowed}")


def get_tlt_cable_by_mark(mark: str | None) -> dict[str, Any] | None:
    if mark is None:
        return None
    for c in _cables_tlt():
        if c["model"] == mark or c["model"].replace("ТЛТ-", "") == mark:
            return dict(c)
    return None


def clear_cache() -> None:
    _climate.cache_clear()
    _insulation.cache_clear()
    _cables_tlt.cache_clear()
    _accessories.cache_clear()
    _pipe_materials.cache_clear()
    _soil_conductivity.cache_clear()
    _resistive_cables.cache_clear()
    _cables_tt.cache_clear()


def preload_all() -> None:
    """Прогрев кеша при старте приложения."""
    _climate()
    _insulation()
    _cables_tlt()
    _accessories()
    _pipe_materials()
    _soil_conductivity()
    _resistive_cables()
    _cables_tt()
