"""Импорт объектов проекта из Excel."""

from __future__ import annotations

import asyncio
import hashlib
import io
import json
import math
import re
import zipfile
from dataclasses import dataclass
from typing import Any, Literal
from uuid import UUID

from openpyxl import load_workbook
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import use_fast_commit_for_current_transaction
from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.project import Project
from app.models.project_object import ProjectObject
from app.models.specification import Specification
from app.reference_data.loader import list_insulation_materials
from app.services.heat_loss_application import apply_climate_policy
from app.services.project_object_params import (
    normalize_project_object_params,
    reject_legacy_specification_object_params,
    validate_and_canonicalize_project_object_params,
)
from app.services.project_service import (
    ProjectAccessError,
    ProjectNotFoundError,
    ProjectService,
)
from app.services.spreadsheet_schema import (
    PIPE_HEADERS,
    TANK_HEADERS,
    TYPE_HEADERS,
)

PIPE_SHEET_NAMES = {"трубопроводы", "трубы", "pipes"}
TANK_SHEET_NAMES = {"резервуары", "ёмкости", "емкости", "tanks"}
IMPORT_COMMIT_BATCH_SIZE = 25
ImportMode = Literal["append", "merge", "replace"]


@dataclass(frozen=True)
class PreparedImportRows:
    rows: list[tuple[dict[str, Any], dict[str, Any]]]
    errors: list[dict[str, Any]]
    validation_errors: list[dict[str, Any]]
    invalid: int


# Алиасы для колонки «Тип» в CSV (различает трубу/резервуар в одном файле)
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


class ExcelImportError(Exception):
    """Ошибка импорта Excel/CSV."""


def _validate_xlsx_archive(content: bytes) -> None:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            infos = archive.infolist()
            if len(infos) > settings.MAX_XLSX_FILES:
                raise ExcelImportError(
                    f"XLSX содержит слишком много внутренних файлов: {len(infos)}"
                )
            total_uncompressed = sum(info.file_size for info in infos)
            if total_uncompressed > settings.MAX_XLSX_UNCOMPRESSED_BYTES:
                raise ExcelImportError(
                    "XLSX слишком большой после распаковки " f"({total_uncompressed // 1024} КБ)"
                )
            for info in infos:
                if info.compress_size and info.file_size / info.compress_size > 100:
                    raise ExcelImportError(
                        "XLSX похож на zip-bomb: слишком высокий коэффициент сжатия"
                    )
    except zipfile.BadZipFile as exc:
        raise ExcelImportError("Файл не является корректным XLSX-архивом") from exc


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


def _read_sheet(ws: Any, header_map: dict[str, str]) -> list[dict[str, Any]]:
    """Читает лист, мапит заголовки → канонические имена, возвращает список строк-словарей.

    Строки возвращаются с ключом ``_row`` — номер строки в Excel (1-based).
    """
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return []
    mapped_cols: list[tuple[int, str]] = []
    for idx, h in enumerate(header_row):
        key = header_map.get(_norm(h))
        if key:
            mapped_cols.append((idx, key))
    result: list[dict[str, Any]] = []
    for row_idx, row in enumerate(rows_iter, start=2):
        if len(result) >= settings.MAX_IMPORT_ROWS:
            raise ExcelImportError(f"Превышен лимит строк импорта: {settings.MAX_IMPORT_ROWS}")
        if all(v is None or str(v).strip() == "" for v in row):
            continue
        item: dict[str, Any] = {"_row": row_idx}
        for idx, key in mapped_cols:
            if idx < len(row):
                item[key] = row[idx]
        result.append(item)
    return result


def _build_pipe_params(row: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """Строит params-словарь для трубы (м, не мм). Возвращает (params, error)."""
    d_mm = _to_float(row.get("outer_diameter_mm"))
    L = _to_float(row.get("pipe_length"))
    ins_mm = _to_float(row.get("insulation_thickness_mm"))
    material_resolution = _resolve_material_entry(row.get("insulation_material"))
    t_a = _to_float(row.get("ambient_temperature"))
    t_a_max = _to_float(row.get("max_ambient_temperature"))
    t_p = _to_float(row.get("process_temperature"))
    ambient_source_raw = row.get("ambient_temperature_source")
    ambient_source = _resolve_alias(
        ambient_source_raw,
        AMBIENT_TEMPERATURE_SOURCE_ALIASES,
    )
    if ambient_source_raw not in (None, "") and ambient_source is None:
        return None, f"Не распознан источник температуры среды: {ambient_source_raw}"
    if ambient_source is not None and t_a is None:
        return None, "Источник температуры среды указан без T° среды"

    placement_raw = row.get("placement")
    placement = _resolve_alias(placement_raw, PLACEMENT_ALIASES)
    if placement_raw not in (None, "") and placement is None:
        return None, f"Не распознано размещение трубопровода: {placement_raw}"
    if placement != "underground" and t_a_max is not None and t_a is not None and t_a_max < t_a:
        return (
            None,
            "Макс. T° окр. среды (max_ambient_temperature) не может быть ниже минимальной",
        )

    pipe_material_raw = row.get("pipe_material")
    pipe_material = _resolve_pipe_material(pipe_material_raw)
    if pipe_material_raw not in (None, "") and pipe_material is None:
        return None, f"Не распознан материал трубы: {pipe_material_raw}"
    pipe_lambda = _to_float(row.get("pipe_lambda"))
    if pipe_material is not None and pipe_lambda is not None:
        return None, "Задайте только один источник λ трубы: материал или λ"

    params: dict[str, Any] = {}
    if d_mm is not None:
        params["outer_diameter"] = d_mm / 1000.0
    if L is not None:
        params["pipe_length"] = L
    layers: list[dict[str, Any]] = []
    first_layer: dict[str, Any] = {}
    if ins_mm is not None:
        first_layer["thickness"] = ins_mm / 1000.0
    if material_resolution.material:
        first_layer["material"] = material_resolution.material
    first_lambda = _to_float(row.get("first_insulation_lambda"))
    if first_lambda is not None:
        first_layer["conductivity"] = first_lambda
    first_temperature_range = _to_temperature_range(row.get("first_insulation_temperature_range"))
    if first_temperature_range is not None:
        first_layer["temperature_range"] = first_temperature_range
    if first_layer:
        layers.append(first_layer)

    for material_field, thickness_field, lambda_field, temperature_range_field in (
        (
            "second_insulation_material",
            "second_insulation_thickness_mm",
            "second_insulation_lambda",
            "second_insulation_temperature_range",
        ),
        (
            "third_insulation_material",
            "third_insulation_thickness_mm",
            "third_insulation_lambda",
            "third_insulation_temperature_range",
        ),
    ):
        resolution = _resolve_material_entry(row.get(material_field))
        thickness = _to_float(row.get(thickness_field))
        conductivity = _to_float(row.get(lambda_field))
        temperature_range = _to_temperature_range(row.get(temperature_range_field))
        if not (
            resolution.material
            or thickness is not None
            or conductivity is not None
            or temperature_range is not None
        ):
            continue
        layer: dict[str, Any] = {}
        if thickness is not None:
            layer["thickness"] = thickness / 1000.0
        if resolution.material:
            layer["material"] = resolution.material
        if conductivity is not None:
            layer["conductivity"] = conductivity
        if temperature_range is not None:
            layer["temperature_range"] = temperature_range
        layers.append(layer)
    if layers:
        params["insulation_layers"] = layers[:3]

    if t_p is not None:
        params["process_temperature"] = t_p
    wall_mm = _to_float(row.get("wall_thickness_mm"))
    if wall_mm is not None:
        params["wall_thickness"] = wall_mm / 1000.0
    if pipe_material:
        params["pipe_material"] = pipe_material
    if pipe_lambda is not None:
        params["pipe_lambda"] = pipe_lambda

    local_element_equiv_length = _to_float(row.get("local_element_equiv_length"))
    if local_element_equiv_length is not None:
        params["local_element_equiv_length"] = local_element_equiv_length
    explicit_local_count = _to_float(row.get("num_local_elements"))
    params["num_local_elements"] = int(explicit_local_count or 0)

    if placement:
        params["placement"] = placement
    if placement == "underground":
        depth = _to_float(row.get("pipe_centerline_depth"))
        if depth is not None:
            params["pipe_centerline_depth"] = depth
        ground_temperature = _to_float(row.get("ground_temperature"))
        if ground_temperature is not None:
            params["ground_temperature"] = ground_temperature
            params["ground_temperature_source"] = "manual"
        ground_conductivity = _to_float(row.get("ground_conductivity"))
        if ground_conductivity is not None:
            params["ground_conductivity"] = ground_conductivity
        ground_type = _resolve_alias(row.get("ground_type"), GROUND_ALIASES)
        if ground_type:
            params["ground_type"] = ground_type
        if ground_type or ground_conductivity is not None:
            params["ground_conductivity_source"] = (
                "reference" if ground_type not in (None, "custom") else "manual"
            )
    elif t_a is not None:
        params["ambient_temperature"] = t_a
        if ambient_source is not None:
            params["ambient_temperature_source"] = ambient_source
    if placement != "underground" and t_a_max is not None:
        params["max_ambient_temperature"] = t_a_max

    wind_speed = _to_float(row.get("wind_speed"))
    wind_speed_source, source_error = _resolve_value_source(
        row,
        source_field="wind_speed_source",
        value=wind_speed,
        aliases=WIND_SPEED_SOURCE_ALIASES,
        source_label="источник скорости ветра",
        value_label="скорости ветра",
    )
    if source_error is not None:
        return None, source_error
    if wind_speed is not None:
        params["wind_speed"] = wind_speed
        if wind_speed_source is not None:
            params["wind_speed_source"] = wind_speed_source
    safety_factor = _to_float(row.get("safety_factor"))
    safety_factor_source, source_error = _resolve_value_source(
        row,
        source_field="safety_factor_source",
        value=safety_factor,
        aliases=SAFETY_FACTOR_SOURCE_ALIASES,
        source_label="источник Kзап",
        value_label="Kзап",
    )
    if source_error is not None:
        return None, source_error
    if safety_factor is not None:
        params["safety_factor"] = safety_factor
        if safety_factor_source is not None:
            params["safety_factor_source"] = safety_factor_source
    basis = _resolve_alias(
        row.get("insulation_temperature_basis"), INSULATION_TEMPERATURE_BASIS_ALIASES
    )
    if basis:
        params["insulation_temperature_basis"] = basis

    for field in (
        "vapor_temperature",
        "maintain_temperature",
        "max_process_temperature",
        "min_switch_temperature",
        "supply_voltage",
    ):
        value = _to_float(row.get(field))
        if value is not None:
            params[field] = value
    for field in ("climate_key", "climate_region", "climate_city"):
        value = row.get(field)
        if value and str(value).strip():
            params[field] = str(value).strip()
    climate_basis = _resolve_climate_basis(row.get("climate_temperature_basis"))
    if climate_basis:
        params["climate_temperature_basis"] = climate_basis
    cover = row.get("insulation_cover_material")
    if cover and str(cover).strip():
        params["insulation_cover_material"] = str(cover).strip()
    name = row.get("name")
    if name and str(name).strip():
        params["name"] = str(name).strip()
    _mark_edited_climate_temperature_as_manual("pipe", params)
    return params, None


def _build_tank_params(row: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    shape = _resolve_shape(row.get("shape"))
    if not shape and row.get("shape") not in (None, ""):
        return (
            None,
            "Форма резервуара больше не поддерживается. "
            "Допустимые формы: cylindrical, rectangular.",
        )

    ins_mm = _to_float(row.get("insulation_thickness_mm"))
    material_resolution = _resolve_material_entry(row.get("insulation_material"))
    t_a = _to_float(row.get("ambient_temperature"))
    t_a_max = _to_float(row.get("max_ambient_temperature"))
    t_p = _to_float(row.get("process_temperature"))
    if t_a_max is not None and t_a is not None and t_a_max < t_a:
        return (
            None,
            "Макс. T° окр. среды (max_ambient_temperature) не может быть ниже минимальной",
        )
    ambient_source_raw = row.get("ambient_temperature_source")
    ambient_source = _resolve_alias(
        ambient_source_raw,
        AMBIENT_TEMPERATURE_SOURCE_ALIASES,
    )
    if ambient_source_raw not in (None, "") and ambient_source is None:
        return None, f"Не распознан источник температуры среды: {ambient_source_raw}"
    if ambient_source is not None and t_a is None:
        return None, "Источник температуры среды указан без T° среды"

    placement_raw = row.get("placement")
    placement = _resolve_alias(placement_raw, PLACEMENT_ALIASES)
    if placement_raw not in (None, "") and placement is None:
        return None, f"Не распознано размещение резервуара: {placement_raw}"

    # The spreadsheet default is explicit outdoor placement; no other field
    # is allowed to infer the calculation mode.
    params: dict[str, Any] = {"placement": placement or "outdoor", "q_additional": 0.0}
    if shape:
        params["shape"] = shape
    if t_a is not None:
        params["ambient_temperature"] = t_a
        if ambient_source is not None:
            params["ambient_temperature_source"] = ambient_source
    if t_a_max is not None:
        params["max_ambient_temperature"] = t_a_max
    if t_p is not None:
        params["process_temperature"] = t_p

    if shape == "cylindrical":
        d_mm = _to_float(row.get("diameter_mm"))
        h_mm = _to_float(row.get("height_mm"))
        if d_mm is not None:
            params["diameter"] = d_mm / 1000.0
        if h_mm is not None:
            params["height"] = h_mm / 1000.0
    elif shape == "rectangular":
        L_mm = _to_float(row.get("length_mm"))
        W_mm = _to_float(row.get("width_mm"))
        H_mm = _to_float(row.get("height_mm"))
        if L_mm is not None:
            params["length"] = L_mm / 1000.0
        if W_mm is not None:
            params["width"] = W_mm / 1000.0
        if H_mm is not None:
            params["height"] = H_mm / 1000.0
    layers = _canonical_tank_insulation_layers(
        row,
        first_thickness_mm=ins_mm,
        first_material=material_resolution,
    )
    if layers:
        params["insulation_layers"] = layers

    wall_thickness_mm = _to_float(row.get("wall_thickness_mm"))
    wall_lambda = _to_float(row.get("wall_lambda"))
    if wall_thickness_mm is not None:
        params["wall_thickness"] = wall_thickness_mm / 1000.0
    if wall_lambda is not None:
        params["wall_lambda"] = wall_lambda

    if params["placement"] == "underground":
        buried_height = _to_float(row.get("tank_buried_height"))
        if buried_height is not None:
            params["tank_buried_height"] = buried_height
        ground_temperature = _to_float(row.get("ground_temperature"))
        if ground_temperature is not None:
            params["ground_temperature"] = ground_temperature
            params["ground_temperature_source"] = "manual"
        ground_type = _resolve_alias(row.get("ground_type"), GROUND_ALIASES)
        if ground_type:
            params["ground_type"] = ground_type
        ground_conductivity = _to_float(row.get("ground_conductivity"))
        if ground_conductivity is not None:
            params["ground_conductivity"] = ground_conductivity
        if ground_type or ground_conductivity is not None:
            params["ground_conductivity_source"] = (
                "reference" if ground_type not in (None, "custom") else "manual"
            )

    wind_speed = _to_float(row.get("wind_speed"))
    wind_speed_source, source_error = _resolve_value_source(
        row,
        source_field="wind_speed_source",
        value=wind_speed,
        aliases=WIND_SPEED_SOURCE_ALIASES,
        source_label="источник скорости ветра",
        value_label="скорости ветра",
    )
    if source_error is not None:
        return None, source_error
    if wind_speed is not None:
        params["wind_speed"] = wind_speed
        params["wind_speed_source"] = wind_speed_source or "manual"
    safety_factor = _to_float(row.get("safety_factor"))
    safety_factor_source, source_error = _resolve_value_source(
        row,
        source_field="safety_factor_source",
        value=safety_factor,
        aliases=SAFETY_FACTOR_SOURCE_ALIASES,
        source_label="источник Kзап",
        value_label="Kзап",
    )
    if source_error is not None:
        return None, source_error
    if safety_factor is not None:
        params["safety_factor"] = safety_factor
        params["safety_factor_source"] = safety_factor_source or "manual"
    basis = _resolve_alias(
        row.get("insulation_temperature_basis"), INSULATION_TEMPERATURE_BASIS_ALIASES
    )
    if basis:
        params["insulation_temperature_basis"] = basis
    else:
        params["insulation_temperature_basis"] = {
            "indoor": "indoor",
            "outdoor": "outdoor_winter",
            "underground": "channel",
        }[params["placement"]]
    for field in (
        "vapor_temperature",
        "maintain_temperature",
        "max_process_temperature",
        "min_switch_temperature",
        "heating_height",
        "laying_step",
        "supply_voltage",
    ):
        value = _to_float(row.get(field))
        if value is not None:
            params[field] = value
    for field in ("climate_key", "climate_region", "climate_city", "insulation_cover_material"):
        value = row.get(field)
        if value and str(value).strip():
            params[field] = str(value).strip()
    climate_key = params.get("climate_key")
    if isinstance(climate_key, str) and "|||" in climate_key:
        region, city = climate_key.split("|||", 1)
        params.setdefault("climate_region", region.strip())
        params.setdefault("climate_city", city.strip())
    climate_basis = _resolve_climate_basis(row.get("climate_temperature_basis"))
    if climate_basis:
        params["climate_temperature_basis"] = climate_basis
    q_additional = _to_float(row.get("q_additional"))
    if q_additional is not None:
        params["q_additional"] = q_additional

    name = row.get("name")
    if name and str(name).strip():
        params["name"] = str(name).strip()
    _mark_edited_climate_temperature_as_manual("tank", params)
    return params, None


def _parse_csv(content: bytes) -> list[tuple[str, list[dict[str, Any]]]]:
    """Парсит CSV-файл.

    Возвращает список пар (sheet_label, rows) по типу:
    [('Трубопроводы', [...]), ('Резервуары', [...])].
    CSV должен содержать колонку «Тип» со значениями «труба» / «резервуар».
    Автодетект разделителя (``,``, ``;``, ``\t``). Кодировки: UTF-8 / UTF-8-BOM / CP1251.
    """
    import csv

    # Определяем кодировку
    text: str | None = None
    for enc in ("utf-8-sig", "utf-8", "cp1251"):
        try:
            text = content.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        raise ExcelImportError("Не удалось определить кодировку CSV (ожидается UTF-8 или CP1251)")

    # Автодетект разделителя по первой строке
    first_line = text.splitlines()[0] if text.strip() else ""
    if not first_line:
        raise ExcelImportError("CSV-файл пустой")
    counts = {d: first_line.count(d) for d in (";", ",", "\t")}
    delimiter = max(counts, key=lambda item: counts[item]) if any(counts.values()) else ","

    reader = csv.reader(io.StringIO(text), delimiter=delimiter)
    all_rows = list(reader)
    if not all_rows:
        raise ExcelImportError("CSV-файл пустой")
    if len(all_rows) - 1 > settings.MAX_IMPORT_ROWS:
        raise ExcelImportError(f"Превышен лимит строк импорта: {settings.MAX_IMPORT_ROWS}")

    header = all_rows[0]
    # Индекс колонки «Тип»
    type_idx = next((i for i, h in enumerate(header) if _norm(h) in TYPE_HEADERS), None)
    if type_idx is None:
        raise ExcelImportError(
            "В CSV не найдена колонка «Тип» (со значениями «труба»/«резервуар»). "
            "Используйте шаблон CSV или файл Excel."
        )

    # Разделяем строки по типу
    pipe_rows_raw: list[tuple[int, list[str]]] = []
    tank_rows_raw: list[tuple[int, list[str]]] = []
    for row_idx, row in enumerate(all_rows[1:], start=2):
        if all((v is None or str(v).strip() == "") for v in row):
            continue
        if type_idx >= len(row):
            continue
        t = TYPE_ALIASES.get(_norm(row[type_idx]))
        if t == "pipe":
            pipe_rows_raw.append((row_idx, row))
        elif t == "tank":
            tank_rows_raw.append((row_idx, row))

    def build_mapped(
        rows_raw: list[tuple[int, list[str]]], header_map: dict[str, str]
    ) -> list[dict[str, Any]]:
        # Определяем маппинг колонок общего header
        mapped_cols: list[tuple[int, str]] = []
        for idx, h in enumerate(header):
            key = header_map.get(_norm(h))
            if key:
                mapped_cols.append((idx, key))
        out: list[dict[str, Any]] = []
        for row_idx, row in rows_raw:
            item: dict[str, Any] = {"_row": row_idx}
            for idx, key in mapped_cols:
                if idx < len(row):
                    val = row[idx]
                    # Пустые строки — None
                    normalized_value = val if (val is not None and str(val).strip() != "") else None
                    # «Материал изоляции» and its code are both aliases of
                    # one semantic field. Keep a meaningful earlier alias
                    # when a later optional display/code column is blank.
                    if normalized_value is not None or item.get(key) in (None, ""):
                        item[key] = normalized_value
            out.append(item)
        return out

    result: list[tuple[str, list[dict[str, Any]]]] = []
    if pipe_rows_raw:
        result.append(("Трубопроводы (CSV)", build_mapped(pipe_rows_raw, PIPE_HEADERS)))
    if tank_rows_raw:
        result.append(("Резервуары (CSV)", build_mapped(tank_rows_raw, TANK_HEADERS)))
    return result


async def _project_import_state(db: AsyncSession, project_id: UUID) -> tuple[int, int]:
    result = await db.execute(
        select(func.count(ProjectObject.id), func.max(ProjectObject.sort_order)).where(
            ProjectObject.project_id == project_id
        )
    )
    count, max_sort = result.one()
    return int(count or 0), int(max_sort if max_sort is not None else -1) + 1


def _normalize_name_for_dedupe(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip()).casefold()


def _dedupe_key(object_type: str, params: dict[str, Any]) -> str:
    key_params = dict(params)
    name = _normalize_name_for_dedupe(key_params.pop("name", ""))
    payload = json.dumps(
        key_params,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{object_type}:{name}:{digest}"


def _object_type_for_dedupe(value: Any) -> str:
    return str(getattr(value, "value", value))


async def _existing_dedupe_keys(db: AsyncSession, project_id: UUID) -> set[str]:
    result = await db.execute(
        select(ProjectObject.object_type, ProjectObject.params).where(
            ProjectObject.project_id == project_id
        )
    )
    return {
        _dedupe_key(_object_type_for_dedupe(object_type), params or {})
        for object_type, params in result.all()
    }


async def _touch_project_updated_at(db: AsyncSession, project_id: UUID) -> None:
    """Кейс §4.4/§4.6: импорт объектов обновляет «Последнее изменение» проекта."""
    await db.execute(update(Project).where(Project.id == project_id).values(updated_at=func.now()))
    await db.commit()


async def _replace_project_objects(db: AsyncSession, project_id: UUID) -> None:
    await db.execute(
        delete(ElectricalCalculation).where(ElectricalCalculation.project_id == project_id)
    )
    await db.execute(delete(Specification).where(Specification.project_id == project_id))
    await db.execute(delete(ProjectObject).where(ProjectObject.project_id == project_id))
    await db.flush()


def _validate_import_mode(mode: str) -> ImportMode:
    normalized = (mode or "merge").strip().lower()
    if normalized not in {"append", "merge", "replace"}:
        raise ExcelImportError(
            "Некорректный режим импорта: " f"{mode!r} (допустимо: append, merge, replace)"
        )
    return normalized  # type: ignore[return-value]


async def _ensure_import_access(
    db: AsyncSession,
    project_id: UUID,
    principal: CurrentPrincipal,
) -> None:
    project_service = ProjectService(db)
    project = await project_service.get_project_basic(project_id, principal)
    project_service._check_owner(project, principal)


async def _commit_object_batch(
    db: AsyncSession,
    batch: list[tuple[ProjectObject, dict[str, Any]]],
    sheet_label: str,
) -> tuple[int, list[UUID], list[dict[str, Any]]]:
    if not batch:
        return 0, [], []
    objects = [item[0] for item in batch]
    try:
        db.add_all(objects)
        await db.flush()
        object_ids = [obj.id for obj in objects]
        await use_fast_commit_for_current_transaction(db)
        await db.commit()
        return len(objects), object_ids, []
    except SQLAlchemyError as exc:
        await db.rollback()
        return await _commit_object_batch_row_by_row(db, batch, sheet_label, exc)


async def _commit_object_batch_row_by_row(
    db: AsyncSession,
    batch: list[tuple[ProjectObject, dict[str, Any]]],
    sheet_label: str,
    batch_error: SQLAlchemyError,
) -> tuple[int, list[UUID], list[dict[str, Any]]]:
    created = 0
    object_ids: list[UUID] = []
    errors: list[dict[str, Any]] = []
    for obj, row in batch:
        retry_obj = ProjectObject(
            project_id=obj.project_id,
            object_type=obj.object_type,
            sort_order=obj.sort_order,
            params=obj.params,
        )
        try:
            db.add(retry_obj)
            await db.flush()
            object_ids.append(retry_obj.id)
            await use_fast_commit_for_current_transaction(db)
            await db.commit()
            created += 1
        except Exception as exc:
            await db.rollback()
            message = f"{type(exc).__name__}: {exc}"
            if not message.strip():
                message = f"{type(batch_error).__name__}: {batch_error}"
            errors.append({"sheet": sheet_label, "row": row["_row"], "message": message})
    return created, object_ids, errors


async def _add_rows(
    db: AsyncSession,
    project_id: UUID,
    sheet_label: str,
    rows: list[dict[str, Any]],
    object_type: str,
    next_sort: int,
    current_count: int,
    dedupe_keys: set[str] | None = None,
    prepared_rows: PreparedImportRows | None = None,
) -> tuple[int, int, int, list[dict[str, Any]], list[UUID], int, int, int, list[dict[str, Any]]]:
    """Создаёт объекты из распарсенных строк.

    Расчёт теплопотерь здесь намеренно не запускается: импорт должен быстро
    сохранить всё распознанное и отдать новые объекты в один фоновый batch.
    """
    created = 0
    skipped_duplicates = 0
    skipped_limit = 0
    created_object_ids: list[UUID] = []
    prepared = prepared_rows or _prepare_import_rows(sheet_label, rows, object_type)
    errors = list(prepared.errors)
    validation_errors = list(prepared.validation_errors)
    batch: list[tuple[ProjectObject, dict[str, Any]]] = []

    async def flush_batch() -> None:
        nonlocal batch, created, current_count
        attempted = len(batch)
        batch_created, object_ids, batch_errors = await _commit_object_batch(
            db,
            batch,
            sheet_label,
        )
        created += batch_created
        created_object_ids.extend(object_ids)
        errors.extend(batch_errors)
        current_count -= attempted - batch_created
        batch = []

    for row_index, (params, row) in enumerate(prepared.rows):
        if current_count >= settings.GUEST_MAX_OBJECTS_PER_PROJECT:
            skipped_limit = len(prepared.rows) - row_index
            errors.append(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "message": (
                        "Достигнут лимит объектов в проекте "
                        f"({settings.GUEST_MAX_OBJECTS_PER_PROJECT}). "
                        f"Пропущено строк: {skipped_limit}."
                    ),
                }
            )
            break
        try:
            if dedupe_keys is not None:
                key = _dedupe_key(object_type, params)
                if key in dedupe_keys:
                    skipped_duplicates += 1
                    continue
                dedupe_keys.add(key)
            obj = ProjectObject(
                project_id=project_id,
                object_type=object_type,
                sort_order=next_sort,
                params=params,
            )
            batch.append((obj, row))
            current_count += 1
            next_sort += 1
            if len(batch) >= IMPORT_COMMIT_BATCH_SIZE:
                await flush_batch()
        except Exception as exc:
            errors.append(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "message": f"{type(exc).__name__}: {exc}",
                }
            )
    await flush_batch()
    return (
        created,
        next_sort,
        current_count,
        errors,
        created_object_ids,
        skipped_duplicates,
        skipped_limit,
        prepared.invalid,
        validation_errors,
    )


def _prepare_import_rows(
    sheet_label: str,
    rows: list[dict[str, Any]],
    object_type: str,
) -> PreparedImportRows:
    """Normalize and validate every row before any import-side mutation."""

    accepted: list[tuple[dict[str, Any], dict[str, Any]]] = []
    errors: list[dict[str, Any]] = []
    validation_errors: list[dict[str, Any]] = []
    invalid = 0
    builder = _build_pipe_params if object_type == "pipe" else _build_tank_params

    for row in rows:
        params, err = builder(row)
        if err or params is None:
            errors.append(
                {"sheet": sheet_label, "row": row["_row"], "message": err or "Ошибка парсинга"}
            )
            continue
        try:
            reject_legacy_specification_object_params(params)
            normalized_params = normalize_project_object_params(object_type, params)
            prepared = validate_and_canonicalize_project_object_params(
                object_type,
                normalized_params,
            )
        except Exception as exc:
            errors.append(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "message": f"{type(exc).__name__}: {exc}",
                }
            )
            continue
        if not prepared.report.is_valid:
            invalid += 1
            validation_errors.extend(
                {
                    "sheet": sheet_label,
                    "row": row["_row"],
                    "field": issue.field,
                    "code": issue.code,
                    "message": _import_validation_message(issue.field, issue.message),
                }
                for issue in prepared.report.issues
            )
            continue
        accepted.append((prepared.params, row))

    return PreparedImportRows(
        rows=accepted,
        errors=errors,
        validation_errors=validation_errors,
        invalid=invalid,
    )


def _import_validation_message(field: str | None, message: str) -> str:
    if field == "outer_diameter":
        return "Наружный диаметр должен быть от 10,8 до 3000 мм"
    if re.search(r"[А-Яа-яЁё]", message):
        return message
    if field is not None:
        return f"Поле «{field}» содержит недопустимое значение"
    return "Строка не прошла проверку параметров объекта"


async def import_objects_from_csv(
    db: AsyncSession,
    project_id: UUID,
    principal: CurrentPrincipal,
    content: bytes,
    mode: str = "merge",
) -> dict[str, Any]:
    """Импортирует объекты из CSV-файла. Требуется колонка «Тип»."""
    import_mode = _validate_import_mode(mode)
    await _ensure_import_access(db, project_id, principal)

    sheets = _parse_csv(content)
    if not sheets:
        raise ExcelImportError(
            "В CSV не найдено ни одной строки с распознанным типом (труба/резервуар)."
        )

    prepared_sheets = []
    for sheet_label, rows in sheets:
        object_type = "pipe" if "Трубопровод" in sheet_label else "tank"
        prepared_sheets.append(
            (
                sheet_label,
                object_type,
                rows,
                _prepare_import_rows(sheet_label, rows, object_type),
            )
        )

    replace_applied = import_mode == "replace" and any(
        prepared.rows for _sheet, _type, _rows, prepared in prepared_sheets
    )
    if import_mode == "replace":
        current_count, next_sort = 0, 0
        dedupe_keys = None
    else:
        current_count, next_sort = await _project_import_state(db, project_id)
        dedupe_keys = (
            await _existing_dedupe_keys(db, project_id) if import_mode == "merge" else None
        )
    if replace_applied:
        await _replace_project_objects(db, project_id)

    total_created = 0
    skipped_duplicates = 0
    skipped_limit = 0
    invalid = 0
    all_errors: list[dict[str, Any]] = []
    all_validation_errors: list[dict[str, Any]] = []
    created_object_ids: list[UUID] = []
    for sheet_label, obj_type, rows, prepared_rows in prepared_sheets:
        (
            created,
            next_sort,
            current_count,
            errors,
            object_ids,
            skipped,
            limit_skipped,
            invalid_rows,
            validation_errors,
        ) = await _add_rows(
            db,
            project_id,
            sheet_label,
            rows,
            obj_type,
            next_sort,
            current_count,
            dedupe_keys=dedupe_keys,
            prepared_rows=prepared_rows,
        )
        total_created += created
        skipped_duplicates += skipped
        skipped_limit += limit_skipped
        invalid += invalid_rows
        all_errors.extend(errors)
        all_validation_errors.extend(validation_errors)
        created_object_ids.extend(object_ids)

    if replace_applied and not created_object_ids:
        await db.commit()
    if created_object_ids or replace_applied:
        await _touch_project_updated_at(db, project_id)

    return {
        "created": total_created,
        "skipped_duplicates": skipped_duplicates,
        "skipped_limit": skipped_limit,
        "invalid": invalid,
        "mode": import_mode,
        "errors": all_errors,
        "validation_errors": all_validation_errors,
        "created_object_ids": created_object_ids,
    }


def _parse_excel_workbook(content: bytes) -> list[tuple[str, str, list[dict[str, Any]]]]:
    """Синхронный разбор xlsx: открыть книгу, проверить лимит листов и прочитать
    листы трубопроводов/резервуаров.

    openpyxl полностью блокирующий (parsing + распаковка XML), поэтому функция
    запускается в отдельном потоке через ``asyncio.to_thread`` и не должна
    держать event loop на время разбора файла (см. import_objects_from_excel).
    Возвращает список ``(sheet_label, object_type, rows)`` по найденным листам.
    """
    try:
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    except Exception as exc:
        raise ExcelImportError(f"Не удалось открыть файл: {exc}") from exc
    if len(wb.sheetnames) > settings.MAX_IMPORT_SHEETS:
        raise ExcelImportError(f"Превышен лимит листов импорта: {settings.MAX_IMPORT_SHEETS}")

    parsed_sheets: list[tuple[str, str, list[dict[str, Any]]]] = []
    for sheet in wb.sheetnames:
        norm = _norm(sheet)
        if norm in PIPE_SHEET_NAMES:
            parsed_sheets.append((sheet, "pipe", _read_sheet(wb[sheet], PIPE_HEADERS)))
        elif norm in TANK_SHEET_NAMES:
            parsed_sheets.append((sheet, "tank", _read_sheet(wb[sheet], TANK_HEADERS)))
    return parsed_sheets


async def import_objects_from_excel(
    db: AsyncSession,
    project_id: UUID,
    principal: CurrentPrincipal,
    content: bytes,
    mode: str = "merge",
) -> dict[str, Any]:
    """Импортирует объекты из xlsx-файла в проект.

    Возвращает сводку: {"created": N, "errors": [{"sheet", "row", "message"}]}.
    """
    import_mode = _validate_import_mode(mode)
    _validate_xlsx_archive(content)

    # Блокирующий разбор openpyxl уводим в поток, чтобы не стопорить event loop
    # на время парсинга (как уже сделано для генерации отчётов).
    parsed_sheets = await asyncio.to_thread(_parse_excel_workbook, content)

    # Проверяем доступ к проекту
    try:
        await _ensure_import_access(db, project_id, principal)
    except (ProjectNotFoundError, ProjectAccessError):
        raise

    created = 0
    skipped_duplicates = 0
    skipped_limit = 0
    errors: list[dict[str, Any]] = []
    created_object_ids: list[UUID] = []

    if not parsed_sheets:
        raise ExcelImportError(
            "В файле не найдены листы «Трубопроводы» или «Резервуары». "
            "Используйте шаблон (кнопка «Скачать шаблон»)."
        )

    prepared_sheets = [
        (sheet, object_type, rows, _prepare_import_rows(sheet, rows, object_type))
        for sheet, object_type, rows in parsed_sheets
    ]

    replace_applied = import_mode == "replace" and any(
        prepared.rows for _sheet, _type, _rows, prepared in prepared_sheets
    )
    if import_mode == "replace":
        current_count, next_sort = 0, 0
        dedupe_keys = None
    else:
        current_count, next_sort = await _project_import_state(db, project_id)
        dedupe_keys = (
            await _existing_dedupe_keys(db, project_id) if import_mode == "merge" else None
        )
    if replace_applied:
        await _replace_project_objects(db, project_id)

    invalid = 0
    validation_errors: list[dict[str, Any]] = []
    for sheet, object_type, rows, prepared_rows in prepared_sheets:
        (
            added,
            next_sort,
            current_count,
            sheet_errors,
            object_ids,
            skipped,
            limit_skipped,
            invalid_rows,
            row_validation_errors,
        ) = await _add_rows(
            db,
            project_id,
            sheet,
            rows,
            object_type,
            next_sort,
            current_count,
            dedupe_keys=dedupe_keys,
            prepared_rows=prepared_rows,
        )
        created += added
        skipped_duplicates += skipped
        skipped_limit += limit_skipped
        invalid += invalid_rows
        errors.extend(sheet_errors)
        validation_errors.extend(row_validation_errors)
        created_object_ids.extend(object_ids)

    if replace_applied and not created_object_ids:
        await db.commit()
    if created_object_ids or replace_applied:
        await _touch_project_updated_at(db, project_id)

    return {
        "created": created,
        "skipped_duplicates": skipped_duplicates,
        "skipped_limit": skipped_limit,
        "invalid": invalid,
        "mode": import_mode,
        "errors": errors,
        "validation_errors": validation_errors,
        "created_object_ids": created_object_ids,
    }
