"""Target ownership registry for heat-loss object JSON.

The object ``params`` column is shared by several domains.  Once a vertical
pipe/tank input slice is activated, heat updates own only the keys declared
here and replace, rather than merge, that part of the document.  Until those
vertical slices, this registry and replacement helper intentionally stay
unwired: the current UI and formula schemas still use the pre-cutover input
contract.  This is staging, not a compatibility read/write path.
"""

from collections.abc import Mapping
from typing import Any

COMMON_HEAT_PARAM_KEYS = frozenset(
    {
        "process_temperature",
        "placement",
        "ambient_temperature",
        "ground_temperature",
        "wind_speed",
        "alpha_vnesh",
        "safety_factor",
        "insulation_temperature_basis",
        "insulation_layers",
        "ground_type",
        "ground_conductivity",
        "climate_key",
        "climate_city",
        "climate_region",
        "climate_temperature_basis",
        "ambient_temperature_source",
        "ground_temperature_source",
        "wind_speed_source",
        "ground_conductivity_source",
        "safety_factor_source",
        "climate_policy_rule",
        "insulation_cover_material",
    }
)

PIPE_HEAT_PARAM_KEYS = frozenset(
    {
        "outer_diameter",
        "pipe_length",
        "wall_thickness",
        "pipe_material",
        "pipe_lambda",
        "pipe_centerline_depth",
        "num_local_elements",
        "local_element_equiv_length",
    }
)

TANK_HEAT_PARAM_KEYS = frozenset(
    {
        "shape",
        "diameter",
        "height",
        "length",
        "width",
        "wall_thickness",
        "wall_lambda",
        "tank_buried_height",
        "q_additional",
    }
)

HEAT_OWNED_PARAM_KEYS = COMMON_HEAT_PARAM_KEYS | PIPE_HEAT_PARAM_KEYS | TANK_HEAT_PARAM_KEYS

DEPRECATED_HEAT_PARAM_KEYS = frozenset(
    {
        "location",
        "burial_depth",
        "insulation_thickness",
        "insulation_material",
        "insulation_layer_count",
        "first_insulation_lambda",
        "second_insulation_thickness",
        "second_insulation_material",
        "second_insulation_lambda",
        "third_insulation_thickness",
        "third_insulation_material",
        "third_insulation_lambda",
        "insulation_type",
        "needs_material_reselection",
        "insulation_material_raw",
        "insulation_material_family",
        "insulation_material_warning",
        "second_insulation_material_raw",
        "second_insulation_material_family",
        "second_insulation_material_warning",
        "third_insulation_material_raw",
        "third_insulation_material_family",
        "third_insulation_material_warning",
        "valve_count",
        "flange_count",
        "support_count",
    }
)

COMMON_HEAT_RESULT_KEYS = frozenset(
    {
        "formula_model",
        "formula_model_version",
        "model_assumptions",
        "process_temperature_applied",
        "ambient_temperature_applied",
        "ground_temperature_applied",
        "safety_factor_applied",
        "insulation_layers_applied",
        "input_units",
        "applied_units",
        "source_corrections",
    }
)

PIPE_HEAT_RESULT_KEYS = frozenset(
    {
        "heat_loss_per_meter_base",
        "heat_loss_per_meter_design",
        "total_heat_loss_base",
        "total_heat_loss_design",
        "effective_length",
        "additional_equivalent_length",
        "thermal_resistance",
        "wall_resistance",
        "insulation_resistance",
        "external_resistance",
        "alpha_vnesh_applied",
        "wind_speed_applied",
        "ground_conductivity_applied",
        "local_elements_count_applied",
        "local_element_equiv_length_applied",
    }
)

TANK_HEAT_RESULT_KEYS = frozenset(
    {
        "total_heat_loss_base",
        "total_heat_loss_design",
        "heat_loss_per_m2_bare_base",
        "heat_loss_per_m2_bare_design",
        "surface_area_bare",
        "thermal_resistance_areal_bare",
        "wall_resistance_areal_bare",
        "insulation_resistance_areal_bare",
        "external_resistance_areal_bare",
        "ground_resistance_areal_bare",
        "air_surface_area",
        "ground_surface_area",
        "heat_loss_air_base",
        "heat_loss_ground_base",
        "alpha_vnesh_applied",
        "wind_speed_applied",
        "ground_conductivity_applied",
        "q_additional_applied",
    }
)

# Activated together with the exact spherical producer and shape-specific
# readers in Slice 4.  Publishing these nullable keys earlier would make the
# current plane-wall spherical branch look like an exact radial model.
DEFERRED_SPHERICAL_TANK_RESULT_KEYS = frozenset(
    {
        "surface_area_outer",
        "thermal_resistance_total",
        "wall_resistance_total",
        "insulation_resistance_total",
        "external_resistance_total",
        "external_heat_flux_base",
        "critical_insulation_radius",
        "outer_insulation_radius",
        "critical_radius_check_passed",
    }
)

PIPE_CANONICAL_RESULT_KEYS = COMMON_HEAT_RESULT_KEYS | PIPE_HEAT_RESULT_KEYS
TANK_CANONICAL_RESULT_KEYS = COMMON_HEAT_RESULT_KEYS | TANK_HEAT_RESULT_KEYS
CANONICAL_HEAT_RESULT_KEYS = PIPE_CANONICAL_RESULT_KEYS | TANK_CANONICAL_RESULT_KEYS

DEPRECATED_HEAT_RESULT_KEYS = frozenset(
    {
        "heat_loss_per_meter",
        "heat_loss_per_m2",
        "total_heat_loss",
        "surface_area",
        "alpha_vnesh",
        "wind_speed",
        "ground_conductivity",
        "safety_factor",
        "local_elements_count",
        "local_element_equiv_length",
        "q_additional",
        "ground_resistance",
        "heat_loss_air_per_m2",
        "heat_loss_ground_per_m2",
        "calculation_trace",
    }
)

PIPE_DEPRECATED_RESULT_KEYS = DEPRECATED_HEAT_RESULT_KEYS
TANK_DEPRECATED_RESULT_KEYS = DEPRECATED_HEAT_RESULT_KEYS | frozenset(
    {"wall_resistance", "insulation_resistance", "external_resistance"}
)


def replace_heat_owned_params(
    existing: Mapping[str, Any] | None,
    incoming_heat_payload: Mapping[str, Any],
) -> dict[str, Any]:
    """Replace the complete heat-owned fragment and preserve non-heat metadata.

    Existing non-heat values survive when omitted.  Explicit incoming non-heat
    values are still applied because the current project-object PUT is a shared
    endpoint (not a dedicated heat-only endpoint).  In particular ``volume``
    remains object-card metadata: it may be edited as metadata, but is never
    classified as heat-owned or projected to a formula schema.
    """

    removable = HEAT_OWNED_PARAM_KEYS | DEPRECATED_HEAT_PARAM_KEYS
    if not any(key in removable for key in incoming_heat_payload):
        return {**dict(existing or {}), **dict(incoming_heat_payload)}
    preserved = {key: value for key, value in (existing or {}).items() if key not in removable}
    incoming_non_heat = {
        key: value for key, value in incoming_heat_payload.items() if key not in removable
    }
    canonical = {
        key: value for key, value in incoming_heat_payload.items() if key in HEAT_OWNED_PARAM_KEYS
    }
    return {**preserved, **incoming_non_heat, **canonical}
