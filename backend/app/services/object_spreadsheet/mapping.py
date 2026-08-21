"""Pure row-to-canonical-params mapping for object spreadsheets."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Literal

from app.reference_data.loader import list_insulation_materials
from app.services.heat_loss_application import apply_climate_policy

TYPE_ALIASES: dict[str, str] = {
    "труба": "pipe",
    "трубопровод": "pipe",
    "pipe": "pipe",
    "резервуар": "tank",
    "ёмкость": "tank",
    "емкость": "tank",
    "бак": "tank",
    "tank": "tank",
}

GENERIC_MATERIAL_ALIASES: dict[str, str] = {
    "минеральная вата": "mineral_wool",
    "мин вата": "mineral_wool",
    "мин. вата": "mineral_wool",
    "минвата": "mineral_wool",
    "mineral_wool": "mineral_wool",
    "пеностекло": "foam_glass",
    "foam_glass": "foam_glass",
    "пенополиуретан": "polyurethane",
    "ппу": "polyurethane",
    "polyurethane": "polyurethane",
    "пенополистирол": "polystyrene",
    "полистирол": "polystyrene",
    "polystyrene": "polystyrene",
    "аэрогель": "aerogel",
    "aerogel": "aerogel",
    "силикат кальция": "calcium_silicate",
    "calcium_silicate": "calcium_silicate",
}

SPECIAL_MATERIAL_ALIASES: dict[str, str] = {
    "другое": "other",
    "other": "other",
}

PIPE_MATERIAL_ALIASES: dict[str, str] = {
    "углеродистая сталь": "carbon_steel",
    "сталь углеродистая": "carbon_steel",
    "carbon_steel": "carbon_steel",
    "нержавеющая сталь": "stainless_304",
    "stainless_304": "stainless_304",
    "медь": "copper",
    "copper": "copper",
    "алюминий": "aluminum",
    "aluminum": "aluminum",
    "пластик": "plastic",
    "plastic": "plastic",
}

PLACEMENT_ALIASES: dict[str, str] = {
    "на открытом воздухе": "outdoor",
    "улица": "outdoor",
    "надземная": "outdoor",
    "outdoor": "outdoor",
    "в помещении": "indoor",
    "помещение": "indoor",
    "indoor": "indoor",
    "подземно": "underground",
    "подземная": "underground",
    "underground": "underground",
}

GROUND_ALIASES: dict[str, str] = {
    "сухой песок": "dry_sand",
    "dry_sand": "dry_sand",
    "влажный песок": "wet_sand",
    "wet_sand": "wet_sand",
    "глина": "clay",
    "clay": "clay",
    "другое": "custom",
    "custom": "custom",
}

CLIMATE_BASIS_ALIASES: dict[str, str] = {
    "0,92": "t_0_92",
    "0.92": "t_0_92",
    "t_0_92": "t_0_92",
    "t0.92": "t_0_92",
    "t 0.92": "t_0_92",
    "0,98": "t_0_98",
    "0.98": "t_0_98",
    "t_0_98": "t_0_98",
    "t0.98": "t_0_98",
    "t 0.98": "t_0_98",
    "абс. мин.": "t_abs_min",
    "абс мин": "t_abs_min",
    "абсолютный минимум": "t_abs_min",
    "t_abs_min": "t_abs_min",
}

AMBIENT_TEMPERATURE_SOURCE_ALIASES: dict[str, str] = {
    "manual": "manual",
    "вручную": "manual",
    "climate": "climate",
    "климат": "climate",
}

WIND_SPEED_SOURCE_ALIASES: dict[str, str] = {
    "manual": "manual",
    "вручную": "manual",
    "climate": "climate",
    "климат": "climate",
}

SAFETY_FACTOR_SOURCE_ALIASES: dict[str, str] = {
    "default": "default",
    "по умолчанию": "default",
    "manual": "manual",
    "вручную": "manual",
    "climate_policy": "climate_policy",
    "климатическая политика": "climate_policy",
}

INSULATION_TEMPERATURE_BASIS_ALIASES: dict[str, str] = {
    "indoor": "indoor",
    "помещение": "indoor",
    "в помещении": "indoor",
    "outdoor_summer": "outdoor_summer",
    "улица лето": "outdoor_summer",
    "открытый воздух лето": "outdoor_summer",
    "открытый воздух, лето": "outdoor_summer",
    "outdoor_winter": "outdoor_winter",
    "улица зима": "outdoor_winter",
    "открытый воздух зима": "outdoor_winter",
    "открытый воздух, зима": "outdoor_winter",
    "channel": "channel",
    "канал": "channel",
    "tunnel": "tunnel",
    "тоннель": "tunnel",
    "technical_subfloor": "technical_subfloor",
    "техническое подполье": "technical_subfloor",
    "подполье": "technical_subfloor",
    "attic": "attic",
    "чердак": "attic",
    "basement": "basement",
    "подвал": "basement",
}

SHAPE_ALIASES: dict[str, str] = {
    "цилиндр": "cylindrical",
    "цилиндрический": "cylindrical",
    "cylindrical": "cylindrical",
    "параллелепипед": "rectangular",
    "прямоугольный": "rectangular",
    "прямоуг": "rectangular",
    "rectangular": "rectangular",
}


def _norm(s: Any) -> str:
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s).strip().lower())


def _to_float(v: Any) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, int | float):
        return float(v)
    s = str(v).replace(",", ".").strip()
    match = re.search(r"[-+]?\d+(?:\.\d+)?", s)
    if match:
        s = match.group(0)
    try:
        return float(s)
    except ValueError:
        return None


def _to_temperature_range(v: Any) -> tuple[float, float] | None:
    if isinstance(v, list | tuple) and len(v) == 2:
        lower = _to_float(v[0])
        upper = _to_float(v[1])
    elif v not in (None, ""):
        values = re.findall(r"[-+]?\d+(?:[.,]\d+)?", str(v))
        if len(values) != 2:
            return None
        lower, upper = (_to_float(value) for value in values)
    else:
        return None
    if lower is None or upper is None:
        return None
    return lower, upper


@dataclass(frozen=True)
class _MaterialResolution:
    material: str | None = None
    raw: str | None = None
    family: str | None = None
    needs_reselection: bool = False


def _selectable_insulation_entries() -> list[dict[str, Any]]:
    return [
        entry
        for entry in list_insulation_materials()
        if entry.get("selectable") is not False and entry.get("deprecated") is not True
    ]


def _resolve_material_entry(v: Any) -> _MaterialResolution:
    key = _norm(v)
    if not key:
        return _MaterialResolution()
    raw = str(v).strip()
    if key in SPECIAL_MATERIAL_ALIASES:
        return _MaterialResolution(material=SPECIAL_MATERIAL_ALIASES[key], raw=raw)
    if key in GENERIC_MATERIAL_ALIASES:
        return _MaterialResolution(
            raw=raw,
            family=GENERIC_MATERIAL_ALIASES[key],
            needs_reselection=True,
        )

    entries = _selectable_insulation_entries()
    by_code = {str(entry["material"]).lower(): entry for entry in entries}
    code_match = by_code.get(key)
    if code_match is not None:
        return _MaterialResolution(material=str(code_match["material"]), raw=raw)

    name_matches = [entry for entry in entries if _norm(entry.get("name")) == key]
    if len(name_matches) == 1:
        return _MaterialResolution(material=str(name_matches[0]["material"]), raw=raw)
    if len(name_matches) > 1:
        family = str(name_matches[0].get("material_family") or name_matches[0]["material"])
        return _MaterialResolution(raw=raw, family=family, needs_reselection=True)
    return _MaterialResolution()


def _resolve_material(v: Any) -> str | None:
    return _resolve_material_entry(v).material


def _resolve_pipe_material(v: Any) -> str | None:
    key = _norm(v)
    if not key:
        return None
    return PIPE_MATERIAL_ALIASES.get(key)


def _resolve_alias(v: Any, aliases: dict[str, str]) -> str | None:
    key = _norm(v)
    if not key:
        return None
    return aliases.get(key)


def _resolve_value_source(
    row: dict[str, Any],
    *,
    source_field: str,
    value: float | None,
    aliases: dict[str, str],
    source_label: str,
    value_label: str,
) -> tuple[str | None, str | None]:
    raw = row.get(source_field)
    source = _resolve_alias(raw, aliases)
    if raw not in (None, "") and source is None:
        return None, f"Не распознан {source_label}: {raw}"
    if source is not None and value is None:
        display_source_label = source_label[:1].upper() + source_label[1:]
        return None, f"{display_source_label} указан без {value_label}"
    return source, None


def _resolve_climate_basis(v: Any) -> str | None:
    key = _norm(v)
    if not key:
        return None
    return CLIMATE_BASIS_ALIASES.get(key)


def _mark_edited_climate_temperature_as_manual(
    object_type: Literal["pipe", "tank"],
    params: dict[str, Any],
) -> None:
    """Preserve an edited ambient value from an exported climate-backed row.

    The export contains both the user-facing temperature and its provenance.
    A climate provenance value is authoritative only while the temperature
    still equals the value selected by the current climate policy.  Comparing
    through ``apply_climate_policy`` keeps the import boundary aligned with
    the canonical diameter/basis/placement rules and avoids duplicating the
    reference-data lookup here.
    """

    if params.get("ambient_temperature_source") != "climate":
        return
    if "ambient_temperature" not in params:
        return
    if object_type == "pipe" and params.get("placement") == "underground":
        return

    policy_params = apply_climate_policy(object_type, params)
    climate_temperature = _to_float(policy_params.get("ambient_temperature"))
    imported_temperature = _to_float(params.get("ambient_temperature"))
    if climate_temperature is None or imported_temperature is None:
        return
    if not math.isclose(imported_temperature, climate_temperature, rel_tol=0.0, abs_tol=1e-9):
        params["ambient_temperature_source"] = "manual"


def _resolve_shape(v: Any) -> str | None:
    key = _norm(v)
    if not key:
        return None
    # Первое слово тоже пробуем (если запись «цилиндрический бак»)
    return SHAPE_ALIASES.get(key) or SHAPE_ALIASES.get(key.split()[0] if key else "")


def _canonical_tank_insulation_layers(
    row: dict[str, Any],
    *,
    first_thickness_mm: float | None,
    first_material: _MaterialResolution,
) -> list[dict[str, Any]]:
    layers: list[dict[str, Any]] = []
    specs = (
        (
            0,
            first_thickness_mm,
            first_material,
            _to_float(row.get("first_insulation_lambda")),
            _to_temperature_range(row.get("first_insulation_temperature_range")),
        ),
        (
            1,
            _to_float(row.get("second_insulation_thickness_mm")),
            _resolve_material_entry(row.get("second_insulation_material")),
            _to_float(row.get("second_insulation_lambda")),
            _to_temperature_range(row.get("second_insulation_temperature_range")),
        ),
        (
            2,
            _to_float(row.get("third_insulation_thickness_mm")),
            _resolve_material_entry(row.get("third_insulation_material")),
            _to_float(row.get("third_insulation_lambda")),
            _to_temperature_range(row.get("third_insulation_temperature_range")),
        ),
    )
    for index, thickness_mm, material_resolution, conductivity, temperature_range in specs:
        if not any(
            value is not None
            for value in (
                thickness_mm,
                material_resolution.raw,
                conductivity,
                temperature_range,
            )
        ):
            continue
        while len(layers) < index:
            layers.append({})
        layer: dict[str, Any] = {}
        if thickness_mm is not None:
            layer["thickness"] = thickness_mm / 1000.0
        if material_resolution.material is not None:
            layer["material"] = material_resolution.material
        if material_resolution.material == "other":
            if conductivity is not None:
                layer["conductivity"] = conductivity
            if temperature_range is not None:
                layer["temperature_range"] = temperature_range
        layers.append(layer)
    return layers
