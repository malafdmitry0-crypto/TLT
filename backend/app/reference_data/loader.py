"""Загрузчик справочников из JSON с кэшированием.

Справочники читаются один раз при старте приложения (или при первом обращении)
и хранятся в модульных переменных. Для тестов предоставляется clear_cache().
"""

import hashlib
import json
from collections.abc import Sequence
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any, cast

from heatcalc_heat_loss_core.conductivity import (
    AffineConductivity,
    ConductivityLaw,
    ConstantConductivity,
    PiecewiseConductivity,
    UnavailableConductivity,
    evaluate_conductivity,
)
from heatcalc_heat_loss_core.errors import FormulaDomainError

_BASE_DIR = Path(__file__).parent
_ELECTRICAL_CATALOG_FILES = {
    "power": "cables_tt.json",
    "section": "section_catalog.json",
    "bom": "electrical_tt_bom_v1.json",
}


@lru_cache
def _section_catalog_payload() -> dict[str, Any]:
    try:
        return dict(_load_json("section_catalog.json"))
    except Exception:
        return {"status": "missing", "rows": []}


def clear_section_catalog_cache() -> None:
    _section_catalog_payload.cache_clear()


def section_catalog_registered() -> bool:
    data = _section_catalog_payload()
    rows = data.get("rows")
    return data.get("status") == "registered" and isinstance(rows, list) and bool(rows)


def section_catalog_meta() -> dict[str, Any]:
    data = _section_catalog_payload()
    return {
        "status": data.get("status"),
        "source": data.get("source"),
        "source_checksum": data.get("source_checksum"),
        "version": data.get("version"),
        "schema_version": data.get("schema_version"),
        "registered_at": data.get("registered_at"),
    }


def section_catalog_payload_snapshot() -> dict[str, Any]:
    """Return an isolated copy of the bundled section catalog authority."""
    return deepcopy(_section_catalog_payload())

PIPE_HEAT_LOSS_MATERIALS_SOURCE = "reference_data/insulation.json+pipe_materials.json"
TANK_HEAT_LOSS_MATERIALS_SOURCE = "reference_data/insulation.json"

INSULATION_MATERIAL_RESELECTION_MESSAGE = (
    "Уточните конкретный материал и плотность из справочника теплоизоляции"
)


class ReferenceInsulationError(ValueError):
    """Expected insulation-catalog failure with a stable application code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _load_json(name: str) -> dict[str, Any]:
    path = _BASE_DIR / name
    with path.open(encoding="utf-8") as f:
        return cast(dict[str, Any], json.load(f))


@lru_cache
def _climate() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("climate.json")["cities"])


def _normalized_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _climate_key_for(entry: dict[str, Any]) -> str:
    city = str(entry.get("city") or entry["region"]).strip()
    region = str(entry["region"]).strip()
    return f"{region}|||{city}"


def _with_climate_key(entry: dict[str, Any]) -> dict[str, Any]:
    result = dict(entry)
    result.setdefault("key", _climate_key_for(entry))
    return result


@lru_cache
def _climate_by_key() -> dict[str, dict[str, Any]]:
    return {_normalized_text(_climate_key_for(entry)): entry for entry in _climate()}


@lru_cache
def _climate_by_city_region() -> dict[tuple[str, str], dict[str, Any]]:
    return {
        (
            _normalized_text(entry.get("city") or entry["region"]),
            _normalized_text(entry["region"]),
        ): entry
        for entry in _climate()
    }


@lru_cache
def _insulation() -> list[dict[str, Any]]:
    return cast(list[dict[str, Any]], _load_json("insulation.json")["materials"])


@lru_cache
def _insulation_by_material() -> dict[str, dict[str, Any]]:
    by_material: dict[str, dict[str, Any]] = {}
    for entry in _insulation():
        by_material.setdefault(str(entry["material"]), entry)
    return by_material


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


@lru_cache
def _tt_cables_by_model() -> dict[str, dict[str, Any]]:
    by_model: dict[str, dict[str, Any]] = {}
    for cable in _cables_tt():
        by_model.setdefault(str(cable["model"]), cable)
    return by_model


@lru_cache
def _electrical_tt_bom() -> dict[str, Any]:
    return _load_json("electrical_tt_bom_v1.json")


@lru_cache
def _electrical_tt_bom_by_full_mark() -> dict[str, dict[str, Any]]:
    entries = _electrical_tt_bom().get("entries")
    if not isinstance(entries, list):
        return {}
    return {
        str(entry["full_mark"]): dict(entry)
        for entry in entries
        if isinstance(entry, dict) and entry.get("full_mark")
    }


# ---- public API ----


def list_climate_cities() -> list[dict[str, Any]]:
    return [_with_climate_key(entry) for entry in _climate()]


def get_climate_by_key(key: str | None) -> dict[str, Any] | None:
    """Возвращает климатические данные по стабильному ключу `region|||city`."""
    if not key:
        return None
    entry = _climate_by_key().get(_normalized_text(key))
    return _with_climate_key(entry) if entry is not None else None


def get_climate_by_city(city: str, *, region: str | None = None) -> dict[str, Any] | None:
    """Возвращает климат только по точной паре `region + city`."""
    city_key = _normalized_text(city)
    if not city_key or not region:
        return None
    entry = _climate_by_city_region().get((city_key, _normalized_text(region)))
    return _with_climate_key(entry) if entry is not None else None


def get_climate_entry(
    *,
    climate_key: str | None = None,
    city: str | None = None,
    region: str | None = None,
) -> dict[str, Any] | None:
    """Возвращает конкретную строку климатического справочника.

    Приоритет: стабильный `climate_key`, затем точная пара `region + city`.
    """
    if climate_key:
        entry = get_climate_by_key(climate_key)
        if entry is not None:
            return entry
        if "|||" in climate_key:
            region_from_key, city_from_key = climate_key.split("|||", 1)
            entry = get_climate_by_city(city_from_key, region=region_from_key)
            if entry is not None:
                return entry
    if city:
        return get_climate_by_city(city, region=region)
    return None


def list_insulation_materials() -> list[dict[str, Any]]:
    return [_with_insulation_catalog_flags(entry) for entry in _insulation()]


def get_insulation_material(material: str) -> dict[str, Any] | None:
    entry = _insulation_by_material().get(material)
    return _with_insulation_catalog_flags(entry) if entry is not None else None


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


def list_basic_accessories() -> list[dict[str, Any]]:
    return list(_accessories())


def list_pipe_materials() -> list[dict[str, Any]]:
    return list(_pipe_materials())


@lru_cache
def pipe_heat_loss_materials_version() -> str:
    """Content-version справочников, используемых формулой теплопотерь трубы.

    В исходных JSON нет отдельного поля версии. Хеш исходных байтов обоих
    справочников даёт стабильную, воспроизводимую версию именно применённых
    материалов без добавления фиктивной даты или версии релиза.
    """
    digest = hashlib.sha256()
    for name in ("insulation.json", "pipe_materials.json"):
        digest.update(name.encode("utf-8"))
        digest.update(b"\0")
        digest.update((_BASE_DIR / name).read_bytes())
        digest.update(b"\0")
    return f"sha256:{digest.hexdigest()}"


@lru_cache
def tank_heat_loss_materials_version() -> str:
    """Content-version единственного справочника изоляции резервуара."""
    digest = hashlib.sha256()
    digest.update(b"insulation.json\0")
    digest.update((_BASE_DIR / "insulation.json").read_bytes())
    return f"sha256:{digest.hexdigest()}"


def list_soil_conductivity() -> list[dict[str, Any]]:
    return list(_soil_conductivity())


def list_resistive_cables() -> dict[str, Any]:
    return dict(_resistive_cables())


def list_tt_cables() -> list[dict[str, Any]]:
    return list(_cables_tt())


@lru_cache
def electrical_catalog_file_checksum(kind: str) -> str:
    """SHA-256 of the exact bundled JSON imported for a catalog kind."""
    try:
        filename = _ELECTRICAL_CATALOG_FILES[kind]
    except KeyError as exc:
        raise ValueError(f"Unknown electrical catalog kind: {kind}") from exc
    digest = hashlib.sha256((_BASE_DIR / filename).read_bytes()).hexdigest()
    return f"sha256:{digest}"


def tt_cables_source_checksum() -> str:
    """SHA-256 of the exact bundled power-catalog source bytes."""
    return electrical_catalog_file_checksum("power")


def get_tt_cable_by_model(model: str) -> dict[str, Any] | None:
    """Кабель ТТН/ТТВ/ТТХ по базовому имени модели (без суффикса -СР/-СТ)."""
    cable = _tt_cables_by_model().get(model)
    return dict(cable) if cable is not None else None


def electrical_tt_bom_metadata() -> dict[str, Any]:
    """Metadata of the active immutable TT cable BOM catalog."""
    catalog = _electrical_tt_bom()
    return {key: catalog.get(key) for key in catalog if key != "entries"}


def list_electrical_tt_bom_entries() -> list[dict[str, Any]]:
    """All TT BOM v1 rows; callers receive copies of cached catalog data."""
    return [dict(entry) for entry in _electrical_tt_bom_by_full_mark().values()]


def get_electrical_tt_bom_entry(full_mark: str) -> dict[str, Any] | None:
    """Exact, case-sensitive full-mark lookup. No normalization or fallback."""
    entry = _electrical_tt_bom_by_full_mark().get(full_mark)
    if entry is None:
        return None
    return {**entry, "catalog": electrical_tt_bom_metadata()}


def get_insulation_conductivity(material: str, temperature: float) -> float:
    """Возвращает теплопроводность λ материала.

    Для расширенного справочника поддерживаются:
    - conductivity_20_plus: число или [a, b] для формулы a + b * temperature
    - conductivity_19_minus: [λ(-60..19), λ(<-60)] или одиночное значение
    """
    raw = _insulation_by_material().get(material)
    if raw is None:
        raise ValueError(f"Неизвестный материал изоляции: {material}")
    entry = _with_insulation_catalog_flags(raw)
    _ensure_selectable_insulation_material(entry)
    law = (
        _warm_insulation_conductivity_law(entry.get("conductivity_20_plus"))
        if temperature >= 20
        else _cold_insulation_conductivity_law(entry.get("conductivity_19_minus"))
    )
    try:
        value = evaluate_conductivity(law, temperature) if law is not None else None
    except FormulaDomainError as error:
        if error.code not in {"conductivity_law_unavailable", "conductivity_not_positive"}:
            raise
        value = None
    return _positive_reference_lambda(value, material, temperature)


@lru_cache
def get_insulation_conductivity_law(material: str) -> ConductivityLaw:
    """Resolve a catalog record to a pure, reusable conductivity law."""

    raw = _insulation_by_material().get(material)
    if raw is None:
        raise ValueError(f"Неизвестный материал изоляции: {material}")
    entry = _with_insulation_catalog_flags(raw)
    _ensure_selectable_insulation_material(entry)
    return _insulation_conductivity_law(entry)


def resolve_reference_insulation(material: str) -> tuple[ConductivityLaw, tuple[float, float]]:
    """Load law and temperature interval from one catalog record."""

    raw = _insulation_by_material().get(material)
    if raw is None:
        raise ReferenceInsulationError(
            "unknown_insulation_material",
            f"Неизвестный материал изоляции: {material}",
        )
    entry = _with_insulation_catalog_flags(raw)
    reselection_message = _insulation_material_reselection_message(entry)
    if reselection_message is not None:
        raise ReferenceInsulationError(
            "unselectable_insulation_material",
            reselection_message,
        )
    value = entry.get("temperature_range")
    if not isinstance(value, Sequence) or isinstance(value, str | bytes) or len(value) < 2:
        raise ReferenceInsulationError(
            "missing_insulation_interval",
            f"Для материала изоляции '{material}' не задан температурный диапазон",
        )
    return _insulation_conductivity_law(entry), (float(value[0]), float(value[1]))


def _ensure_selectable_insulation_material(entry: dict[str, Any]) -> None:
    message = _insulation_material_reselection_message(entry)
    if message is not None:
        raise ValueError(message)


def _insulation_material_reselection_message(entry: dict[str, Any]) -> str | None:
    if entry.get("selectable") is False or entry.get("deprecated") is True:
        material = entry.get("material", "")
        message = entry.get("reselection_message") or INSULATION_MATERIAL_RESELECTION_MESSAGE
        return f"{message}: {material}"
    return None


def _positive_reference_lambda(value: float | None, material: str, temperature: float) -> float:
    if value is not None and value > 0:
        return value
    raise ValueError(
        f"Для материала изоляции '{material}' не задана расчётная λ(tm) при tm={temperature:g} °C"
    )


def _insulation_conductivity_law(entry: dict[str, Any]) -> ConductivityLaw:
    warm = _warm_insulation_conductivity_law(entry.get("conductivity_20_plus"))
    cold = _cold_insulation_conductivity_law(entry.get("conductivity_19_minus"))
    return PiecewiseConductivity(
        threshold_c=20.0,
        at_or_above=warm or UnavailableConductivity(),
        below=cold or UnavailableConductivity(),
    )


def _warm_insulation_conductivity_law(value: Any) -> ConductivityLaw | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return ConstantConductivity(float(value))
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        values = [float(v) for v in value]
        if len(values) == 1:
            return ConstantConductivity(values[0])
        if len(values) >= 2:
            return AffineConductivity(values[0], values[1])
    if isinstance(value, dict):
        mapping = cast(dict[str, Any], value)
        raw_intercept = mapping.get("a")
        raw_slope = mapping.get("b")
        if raw_intercept is not None and raw_slope is not None:
            return AffineConductivity(float(raw_intercept), float(raw_slope))
        constant = mapping.get("value")
        if constant is not None:
            return ConstantConductivity(float(constant))
    return None


def _cold_insulation_conductivity_law(value: Any) -> ConductivityLaw | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        return ConstantConductivity(float(value))
    if isinstance(value, Sequence) and not isinstance(value, str | bytes):
        values = [float(v) for v in value]
        if len(values) == 1:
            return ConstantConductivity(values[0])
        if len(values) >= 2:
            return PiecewiseConductivity(
                threshold_c=-60.0,
                at_or_above=ConstantConductivity(values[0]),
                below=ConstantConductivity(values[1]),
            )
    return None


def get_pipe_material_lambda(material: str | None, temperature: float) -> float:
    """Возвращает λ(T) материала трубы из внутреннего справочника."""
    return evaluate_conductivity(get_pipe_material_conductivity_law(material), temperature)


@lru_cache
def get_pipe_material_conductivity_law(material: str | None) -> ConductivityLaw:
    """Resolve a pipe material record to its pure conductivity law."""

    if material is None:
        raise ValueError("Не задан материал трубы для расчёта λ(T)")
    for entry in _pipe_materials():
        if entry["material"] == material:
            intercept = float(entry["a"])
            slope = float(entry["b"])
            return AffineConductivity(
                intercept_w_mk=intercept,
                slope_w_mk_per_c=slope,
                temperature_offset_c=40.0,
                minimum_w_mk=0.001,
            )
    allowed = [entry["material"] for entry in _pipe_materials()]
    raise ValueError(f"Неизвестный материал трубы: '{material}'. Допустимые: {allowed}")


def clear_cache() -> None:
    _section_catalog_payload.cache_clear()
    _climate.cache_clear()
    _climate_by_key.cache_clear()
    _climate_by_city_region.cache_clear()
    _insulation.cache_clear()
    _insulation_by_material.cache_clear()
    get_insulation_conductivity_law.cache_clear()
    _accessories.cache_clear()
    _pipe_materials.cache_clear()
    get_pipe_material_conductivity_law.cache_clear()
    pipe_heat_loss_materials_version.cache_clear()
    tank_heat_loss_materials_version.cache_clear()
    _soil_conductivity.cache_clear()
    _resistive_cables.cache_clear()
    _cables_tt.cache_clear()
    electrical_catalog_file_checksum.cache_clear()
    _tt_cables_by_model.cache_clear()
    _electrical_tt_bom.cache_clear()
    _electrical_tt_bom_by_full_mark.cache_clear()


def preload_all() -> None:
    """Прогрев кеша при старте приложения."""
    _section_catalog_payload()
    _climate()
    _climate_by_key()
    _climate_by_city_region()
    _insulation()
    _insulation_by_material()
    _accessories()
    _pipe_materials()
    _soil_conductivity()
    _resistive_cables()
    _cables_tt()
    _tt_cables_by_model()
    _electrical_tt_bom()
    _electrical_tt_bom_by_full_mark()
