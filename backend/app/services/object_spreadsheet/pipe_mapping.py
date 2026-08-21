"""Pipe row-to-canonical-params mapping."""

from __future__ import annotations

from typing import Any

from app.services.object_spreadsheet.mapping import (
    AMBIENT_TEMPERATURE_SOURCE_ALIASES,
    GROUND_ALIASES,
    INSULATION_TEMPERATURE_BASIS_ALIASES,
    PLACEMENT_ALIASES,
    SAFETY_FACTOR_SOURCE_ALIASES,
    WIND_SPEED_SOURCE_ALIASES,
    _mark_edited_climate_temperature_as_manual,
    _resolve_alias,
    _resolve_climate_basis,
    _resolve_material_entry,
    _resolve_pipe_material,
    _resolve_value_source,
    _to_float,
    _to_temperature_range,
)


def _build_pipe_params(row: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """Строит params-словарь для трубы (м, не мм). Возвращает (params, error)."""
    d_mm = _to_float(row.get("outer_diameter_mm"))
    pipe_length = _to_float(row.get("pipe_length"))
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
    if pipe_length is not None:
        params["pipe_length"] = pipe_length
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
        "min_switch_temperature",
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
