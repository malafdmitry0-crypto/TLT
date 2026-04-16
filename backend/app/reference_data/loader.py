"""Загрузчик справочников из JSON с кэшированием.

Справочники читаются один раз при старте приложения (или при первом обращении)
и хранятся в модульных переменных. Для тестов предоставляется clear_cache().
"""

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_BASE_DIR = Path(__file__).parent


def _load_json(name: str) -> dict[str, Any]:
    path = _BASE_DIR / name
    with path.open(encoding="utf-8") as f:
        return json.load(f)


@lru_cache
def _climate() -> list[dict[str, Any]]:
    return _load_json("climate.json")["cities"]


@lru_cache
def _insulation() -> list[dict[str, Any]]:
    return _load_json("insulation.json")["materials"]


@lru_cache
def _cables_tlt() -> list[dict[str, Any]]:
    return _load_json("cables_tlt.json")["cables"]


@lru_cache
def _accessories() -> list[dict[str, Any]]:
    return _load_json("accessories.json")["accessories"]


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
    return list(_insulation())


def list_tlt_cables() -> list[dict[str, Any]]:
    return list(_cables_tlt())


def list_basic_accessories() -> list[dict[str, Any]]:
    return list(_accessories())


def get_insulation_conductivity(material: str, temperature: float) -> float:
    """Возвращает теплопроводность λ материала.

    В MVP температурной зависимости нет — возвращаем табличное значение.
    """
    for m in _insulation():
        if m["material"] == material:
            return float(m["conductivity"])
    raise ValueError(f"Неизвестный материал изоляции: {material}")


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


def preload_all() -> None:
    """Прогрев кеша при старте приложения."""
    _climate()
    _insulation()
    _cables_tlt()
    _accessories()
