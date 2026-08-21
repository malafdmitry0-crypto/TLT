"""Tank row-to-canonical-params mapping."""

from __future__ import annotations

from typing import Any

from app.services.object_spreadsheet.mapping import (
    AMBIENT_TEMPERATURE_SOURCE_ALIASES,
    GROUND_ALIASES,
    INSULATION_TEMPERATURE_BASIS_ALIASES,
    PLACEMENT_ALIASES,
    SAFETY_FACTOR_SOURCE_ALIASES,
    WIND_SPEED_SOURCE_ALIASES,
    _canonical_tank_insulation_layers,
    _mark_edited_climate_temperature_as_manual,
    _resolve_alias,
    _resolve_climate_basis,
    _resolve_material_entry,
    _resolve_shape,
    _resolve_value_source,
    _to_float,
)


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
        length_mm = _to_float(row.get("length_mm"))
        width_mm = _to_float(row.get("width_mm"))
        height_mm = _to_float(row.get("height_mm"))
        if length_mm is not None:
            params["length"] = length_mm / 1000.0
        if width_mm is not None:
            params["width"] = width_mm / 1000.0
        if height_mm is not None:
            params["height"] = height_mm / 1000.0
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
