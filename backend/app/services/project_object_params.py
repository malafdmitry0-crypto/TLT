"""Object-level params normalization and validation.

Formula schemas own physical/material constraints. Project objects add UI/business
semantics: fields with form defaults must be persisted, and non-defaultable
required fields must make the object invalid before formulas run.
"""

from collections.abc import Mapping
from typing import Any


class ProjectObjectParamsError(ValueError):
    """Object params are incomplete for a project object."""


COMMON_OBJECT_DEFAULTS: dict[str, Any] = {
    "insulation_cover_material": "none",
    "max_ambient_temperature": 30,
    "max_process_temperature": 90,
    "environment": "normal",
    "zone_classification": "safe",
    "temperature_group": "T1",
    "min_switch_temperature": -20,
    "supply_voltage": 220,
    "steam_tracing": "no",
}

PIPE_OBJECT_DEFAULTS: dict[str, Any] = {
    "wall_thickness": 0.004,
    "pipe_material": "carbon_steel",
    "valve_count": 2,
    "flange_count": 2,
    "support_count": 2,
    "local_element_equiv_length": 1.5,
}

TANK_OBJECT_DEFAULTS: dict[str, Any] = {
    "shape": "cylindrical",
    "q_additional": 0,
}


def normalize_project_object_params(
    object_type: str, params: Mapping[str, Any] | None
) -> dict[str, Any]:
    """Return params with object-form defaults persisted.

    Defaults are applied only when a key is absent. Explicit ``None`` / empty
    values are left intact so validation can catch deliberately blank required
    fields.
    """

    normalized = dict(params or {})
    if object_type not in ("pipe", "tank"):
        return normalized

    _apply_defaults(normalized, COMMON_OBJECT_DEFAULTS)
    if "safety_factor" not in normalized:
        normalized["safety_factor"] = 1.1
        normalized.setdefault("safety_factor_source", "default")
    _normalize_climate_key(normalized)
    _normalize_placement(normalized)
    _normalize_insulation_layers(normalized)

    if object_type == "pipe":
        _apply_pipe_defaults(normalized)
        _normalize_local_elements(normalized)
    elif object_type == "tank":
        _apply_defaults(normalized, TANK_OBJECT_DEFAULTS)

    return normalized


def prepare_project_object_params(
    object_type: str, params: Mapping[str, Any] | None
) -> dict[str, Any]:
    """Normalize params and raise when required project-object fields are missing."""

    normalized = normalize_project_object_params(object_type, params)
    validate_project_object_params(object_type, normalized)
    return normalized


def validate_project_object_params(object_type: str, params: Mapping[str, Any]) -> None:
    """Validate object-level required fields before heat-loss formulas run."""

    missing: list[str] = []
    if object_type == "pipe":
        _validate_pipe_params(params, missing)
    elif object_type == "tank":
        _validate_tank_params(params, missing)
    else:
        raise ProjectObjectParamsError(f"Неподдерживаемый тип объекта: {object_type}")

    if missing:
        unique_missing = list(dict.fromkeys(missing))
        raise ProjectObjectParamsError(
            "Не заполнены обязательные поля объекта: " + ", ".join(unique_missing)
        )


def _apply_defaults(params: dict[str, Any], defaults: Mapping[str, Any]) -> None:
    for key, value in defaults.items():
        if key not in params:
            params[key] = value


def _normalize_climate_key(params: dict[str, Any]) -> None:
    key = params.get("climate_key")
    if key and "|||" in str(key):
        region_from_key, city_from_key = str(key).split("|||", 1)
        params.setdefault("climate_region", region_from_key)
        params.setdefault("climate_city", city_from_key)
    city = params.get("climate_city")
    region = params.get("climate_region")
    if not city or not region:
        return
    params["climate_key"] = f"{region}|||{city}"


def _apply_pipe_defaults(params: dict[str, Any]) -> None:
    if "wall_thickness" not in params:
        params["wall_thickness"] = PIPE_OBJECT_DEFAULTS["wall_thickness"]
    if "pipe_material" not in params and "pipe_lambda" not in params:
        params["pipe_material"] = PIPE_OBJECT_DEFAULTS["pipe_material"]
    for key in ("valve_count", "flange_count", "support_count", "local_element_equiv_length"):
        if key not in params:
            params[key] = PIPE_OBJECT_DEFAULTS[key]


def _normalize_placement(params: dict[str, Any]) -> None:
    if "placement" not in params:
        location = params.get("location")
        if params.get("burial_depth") is not None:
            params["placement"] = "underground"
        elif location == "indoor":
            params["placement"] = "indoor"
        else:
            params["placement"] = "outdoor"

    placement = params.get("placement")
    if placement in ("indoor", "outdoor", "underground") and _is_missing(params.get("location")):
        params["location"] = "indoor" if placement == "indoor" else "outdoor"


def _normalize_insulation_layers(params: dict[str, Any]) -> None:
    layers = params.get("insulation_layers")
    thickness = params.get("insulation_thickness")
    material = params.get("insulation_material")
    if isinstance(layers, list) and len(layers) > 0:
        first_layer = layers[0] if isinstance(layers[0], dict) else {}
        if not _is_missing(thickness):
            first_layer["thickness"] = thickness
        if not _is_missing(material):
            first_layer["material"] = material
        if params.get("first_insulation_lambda") is not None:
            first_layer["conductivity"] = params["first_insulation_lambda"]
        layers[0] = first_layer
    else:
        if not _is_missing(thickness) and not _is_missing(material):
            layer: dict[str, Any] = {"thickness": thickness, "material": material}
            if params.get("first_insulation_lambda") is not None:
                layer["conductivity"] = params["first_insulation_lambda"]
            params["insulation_layers"] = [layer]
            layers = params["insulation_layers"]

    if "insulation_layer_count" not in params:
        params["insulation_layer_count"] = str(
            len(layers) if isinstance(layers, list) and layers else 1
        )


def _normalize_local_elements(params: dict[str, Any]) -> None:
    if "num_local_elements" in params:
        return
    total = 0
    for key in ("valve_count", "flange_count", "support_count"):
        try:
            total += int(params.get(key) or 0)
        except (TypeError, ValueError):
            return
    if total > 0:
        params["num_local_elements"] = total


def _validate_pipe_params(params: Mapping[str, Any], missing: list[str]) -> None:
    _require(params, "outer_diameter", "Наружный диаметр", missing)
    _require(params, "pipe_length", "Длина трубопровода", missing)
    _require(params, "wall_thickness", "Толщина стенки", missing)
    if _is_missing(params.get("pipe_material")) and _is_missing(params.get("pipe_lambda")):
        missing.append("Материал трубы или λ трубы")
    _validate_common_params(params, missing)
    _validate_insulation(params, missing)


def _validate_tank_params(params: Mapping[str, Any], missing: list[str]) -> None:
    _require(params, "shape", "Форма резервуара", missing)
    if _is_missing(params.get("wall_thickness")) and not _is_missing(params.get("wall_lambda")):
        missing.append("Толщина стенки")
    if _is_missing(params.get("wall_lambda")) and not _is_missing(params.get("wall_thickness")):
        missing.append("λ стенки")
    shape = params.get("shape")
    if shape == "cylindrical":
        _require(params, "diameter", "Диаметр резервуара", missing)
        _require(params, "height", "Высота резервуара", missing)
    elif shape == "rectangular":
        _require(params, "length", "Длина резервуара", missing)
        _require(params, "width", "Ширина резервуара", missing)
        _require(params, "height", "Высота резервуара", missing)
    elif shape == "spherical":
        _require(params, "diameter", "Диаметр резервуара", missing)
    _validate_common_params(params, missing)
    _validate_insulation(params, missing)


def _validate_common_params(params: Mapping[str, Any], missing: list[str]) -> None:
    _require(params, "placement", "Размещение объекта", missing)
    _require(params, "ambient_temperature", "Температура окружающей среды", missing)
    _require(params, "process_temperature", "Требуемая температура объекта", missing)

    if params.get("placement") == "underground":
        _require(params, "burial_depth", "Глубина/высота подземной части", missing)
        _require(params, "ground_type", "Тип грунта", missing)
        _require(params, "ground_conductivity", "λ грунта", missing)


def _validate_insulation(params: Mapping[str, Any], missing: list[str]) -> None:
    count = _layer_count(params)
    layers = params.get("insulation_layers")
    layer_list = layers if isinstance(layers, list) else []

    for index in range(count):
        label = f"{index + 1}-го слоя изоляции"
        layer = (
            layer_list[index]
            if index < len(layer_list) and isinstance(layer_list[index], Mapping)
            else None
        )
        if layer is None:
            if index == 0:
                _require(params, "insulation_thickness", "Толщина изоляции", missing)
                _require(params, "insulation_material", "Материал изоляции", missing)
                if params.get("insulation_material") == "other":
                    missing.append("λ 1-го слоя изоляции")
            else:
                missing.append(f"Толщина {label}")
                missing.append(f"Материал {label}")
            continue

        _require(layer, "thickness", f"Толщина {label}", missing)
        _require(layer, "material", f"Материал {label}", missing)
        if layer.get("material") == "other" and _is_missing(layer.get("conductivity")):
            missing.append(f"λ {label}")
        if layer.get("material") == "other" and _is_missing(layer.get("temperature_range")):
            missing.append(f"Температурный диапазон {label}")


def _layer_count(params: Mapping[str, Any]) -> int:
    raw = params.get("insulation_layer_count")
    try:
        count = int(raw)
    except (TypeError, ValueError):
        count = 1
    return min(max(count, 1), 3)


def _require(params: Mapping[str, Any], key: str, label: str, missing: list[str]) -> None:
    if _is_missing(params.get(key)):
        missing.append(label)


def _is_missing(value: Any) -> bool:
    return value is None or (isinstance(value, str) and value.strip() == "")
