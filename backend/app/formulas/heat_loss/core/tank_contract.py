"""Pure cross-field contract validation for tank heat-loss input."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, cast

from .insulation_contract import validate_insulation_basis_for_placement
from .material_validation import validate_temperature_in_interval, validate_temperature_interval
from .tank import validate_tank_formula_domain
from .tank_validation import validate_tank_input_ranges
from .validation import (
    FormulaValidationCode,
    FormulaValidationIssue,
    FormulaValidationPath,
    FormulaValidationReport,
)

TankShape = Literal["cylindrical", "rectangular"]
TankPlacement = Literal["indoor", "outdoor", "underground"]
TankLayerSource = Literal["manual", "reference"]


def validate_tank_shape(value: object) -> FormulaValidationReport:
    """Validate the supported tank-shape enum before Pydantic Literal parsing."""

    if isinstance(value, str) and value in {"cylindrical", "rectangular"}:
        return FormulaValidationReport()
    return _issue("unsupported_tank_shape", ("shape",))


@dataclass(frozen=True)
class TankContractLayer:
    """One layer shape plus an already-resolved reference temperature range."""

    source: TankLayerSource
    conductivity_supplied: bool
    manual_temperature_range_c: tuple[float, float] | None
    reference_temperature_range_c: tuple[float, float] | None = None


@dataclass(frozen=True)
class TankContractInput:
    """Parsed tank scalars and catalog-free layer facts for contract checks."""

    shape: TankShape
    placement: TankPlacement
    insulation_temperature_basis: str | None
    diameter: float | None
    height: float | None
    length: float | None
    width: float | None
    insulation_layers: tuple[TankContractLayer, ...]
    ambient_temperature: float | None
    ground_temperature: float | None
    process_temperature: float
    wall_thickness: float | None
    wall_lambda: float | None
    tank_buried_height: float | None
    ground_conductivity: float | None
    wind_speed: float | None
    safety_factor: float
    q_additional: float


def validate_tank_contract(data: TankContractInput) -> FormulaValidationReport:
    """Validate ranges and tank contracts in the legacy phase order.

    Reference-material lookup belongs to the caller.  It supplies only a
    resolved interval, so this core module has no catalog or boundary imports.
    """

    range_report = validate_tank_input_ranges(
        diameter=data.diameter,
        height=data.height,
        length=data.length,
        width=data.width,
        insulation_layer_count=len(data.insulation_layers),
        ambient_temperature=data.ambient_temperature,
        ground_temperature=data.ground_temperature,
        process_temperature=data.process_temperature,
        wall_thickness=data.wall_thickness,
        wall_lambda=data.wall_lambda,
        tank_buried_height=data.tank_buried_height,
        ground_conductivity=data.ground_conductivity,
        wind_speed=data.wind_speed,
        safety_factor=data.safety_factor,
        q_additional=data.q_additional,
    )
    if not range_report.is_valid:
        return range_report

    basis_report = validate_insulation_basis_for_placement(
        basis=data.insulation_temperature_basis,
        placement=data.placement,
    )
    if not basis_report.is_valid:
        return basis_report

    for index, layer in enumerate(data.insulation_layers):
        path = ("insulation_layers", index)
        if layer.source == "reference":
            if layer.conductivity_supplied or layer.manual_temperature_range_c is not None:
                return _issue("reference_layer_has_manual_properties", path, index=index)
            if layer.reference_temperature_range_c is not None:
                interval_report = validate_temperature_in_interval(
                    temperature_c=data.process_temperature,
                    minimum_c=layer.reference_temperature_range_c[0],
                    maximum_c=layer.reference_temperature_range_c[1],
                    path=path,
                )
                if not interval_report.is_valid:
                    return interval_report
        else:
            if not layer.conductivity_supplied:
                return _issue(
                    "manual_layer_conductivity_required", (*path, "conductivity"), index=index
                )
            if layer.manual_temperature_range_c is None:
                return _issue(
                    "manual_layer_temperature_range_required",
                    (*path, "temperature_range"),
                    index=index,
                )
            interval_report = validate_temperature_interval(
                minimum_c=layer.manual_temperature_range_c[0],
                maximum_c=layer.manual_temperature_range_c[1],
                path=(*path, "temperature_range"),
            )
            if not interval_report.is_valid:
                return interval_report

    if data.placement == "underground":
        for field, value in (
            ("ground_temperature", data.ground_temperature),
            ("ground_conductivity", data.ground_conductivity),
            ("tank_buried_height", data.tank_buried_height),
            ("ambient_temperature", data.ambient_temperature),
            ("wind_speed", data.wind_speed),
        ):
            if value is None:
                return _issue("underground_field_required", (field,))
    else:
        if data.ambient_temperature is None:
            return _issue("air_tank_ambient_temperature_required", ("ambient_temperature",))
        if data.ground_temperature is not None or data.ground_conductivity is not None:
            return _issue("air_tank_forbids_ground_parameters")
        if data.tank_buried_height is not None:
            return _issue("air_tank_forbids_buried_height", ("tank_buried_height",))
        if data.placement == "outdoor" and data.wind_speed is None:
            return _issue("outdoor_wind_speed_required", ("wind_speed",))

    if (data.wall_thickness is None) != (data.wall_lambda is None):
        return _issue("tank_wall_properties_must_be_paired")
    if data.shape == "cylindrical" and (data.diameter is None or data.height is None):
        return _issue("cylindrical_tank_requires_diameter_and_height")
    if data.shape == "rectangular" and (
        data.length is None or data.width is None or data.height is None
    ):
        return _issue("rectangular_tank_requires_length_width_and_height")
    if data.shape == "cylindrical" and (data.length is not None or data.width is not None):
        return _issue("cylindrical_tank_forbids_length_and_width")
    if data.shape == "rectangular" and data.diameter is not None:
        return _issue("rectangular_tank_forbids_diameter", ("diameter",))

    return validate_tank_formula_domain(
        cylindrical_diameter_m=data.diameter if data.shape == "cylindrical" else None,
        height_m=cast(float, data.height),
        wall_thickness_m=data.wall_thickness or 0.0,
        process_temperature_c=data.process_temperature,
        ambient_temperature_c=cast(float, data.ambient_temperature),
        ground_temperature_c=data.ground_temperature if data.placement == "underground" else None,
        buried_height_m=data.tank_buried_height if data.placement == "underground" else None,
    )


def _issue(
    code: FormulaValidationCode,
    path: FormulaValidationPath = (),
    **details: float | int,
) -> FormulaValidationReport:
    return FormulaValidationReport(
        (FormulaValidationIssue.with_details(code, path=path, **details),)
    )
