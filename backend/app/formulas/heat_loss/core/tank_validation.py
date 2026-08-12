"""Pure scalar range validation for tank heat-loss inputs."""

from __future__ import annotations

from .validation import (
    INSULATION_LAYER_COUNT_RANGE,
    TANK_ADDITIONAL_HEAT_LOSS_RANGE,
    TANK_AMBIENT_TEMPERATURE_RANGE,
    TANK_BURIED_HEIGHT_RANGE,
    TANK_DIAMETER_RANGE,
    TANK_GROUND_CONDUCTIVITY_RANGE,
    TANK_GROUND_TEMPERATURE_RANGE,
    TANK_HEIGHT_RANGE,
    TANK_PROCESS_TEMPERATURE_RANGE,
    TANK_SAFETY_FACTOR_RANGE,
    TANK_SIDE_RANGE,
    TANK_WALL_CONDUCTIVITY_RANGE,
    TANK_WALL_THICKNESS_RANGE,
    TANK_WIND_SPEED_RANGE,
    FormulaValidationReport,
    NumericRangeCheck,
    RangeCheck,
    SequenceLengthCheck,
    validate_range_checks,
)


def validate_tank_input_ranges(
    *,
    diameter: float | None,
    height: float | None,
    length: float | None,
    width: float | None,
    insulation_layer_count: int,
    ambient_temperature: float | None,
    ground_temperature: float | None,
    process_temperature: float,
    wall_thickness: float | None,
    wall_lambda: float | None,
    tank_buried_height: float | None,
    ground_conductivity: float | None,
    wind_speed: float | None,
    safety_factor: float,
    q_additional: float,
) -> FormulaValidationReport:
    """Validate supplied tank scalar values against core-owned range specs.

    This deliberately does not decide which optional values a tank configuration
    requires, nor does it validate shape, placement, field pairs, materials, or
    relationships between values.
    """

    checks: tuple[RangeCheck, ...] = ()
    optional_geometry = (
        ("diameter", diameter, TANK_DIAMETER_RANGE),
        ("height", height, TANK_HEIGHT_RANGE),
        ("length", length, TANK_SIDE_RANGE),
        ("width", width, TANK_SIDE_RANGE),
    )
    for path, value, spec in optional_geometry:
        if value is not None:
            checks += (NumericRangeCheck(path=(path,), value=value, spec=spec),)
    checks += (
        SequenceLengthCheck(
            path=("insulation_layers",),
            length=insulation_layer_count,
            spec=INSULATION_LAYER_COUNT_RANGE,
        ),
    )
    optional_temperatures = (
        ("ambient_temperature", ambient_temperature, TANK_AMBIENT_TEMPERATURE_RANGE),
        ("ground_temperature", ground_temperature, TANK_GROUND_TEMPERATURE_RANGE),
    )
    for path, value, spec in optional_temperatures:
        if value is not None:
            checks += (NumericRangeCheck(path=(path,), value=value, spec=spec),)
    checks += (
        NumericRangeCheck(
            path=("process_temperature",),
            value=process_temperature,
            spec=TANK_PROCESS_TEMPERATURE_RANGE,
        ),
    )
    optional_physical = (
        ("wall_thickness", wall_thickness, TANK_WALL_THICKNESS_RANGE),
        ("wall_lambda", wall_lambda, TANK_WALL_CONDUCTIVITY_RANGE),
        ("tank_buried_height", tank_buried_height, TANK_BURIED_HEIGHT_RANGE),
        ("ground_conductivity", ground_conductivity, TANK_GROUND_CONDUCTIVITY_RANGE),
        ("wind_speed", wind_speed, TANK_WIND_SPEED_RANGE),
    )
    for path, value, spec in optional_physical:
        if value is not None:
            checks += (NumericRangeCheck(path=(path,), value=value, spec=spec),)
    checks += (
        NumericRangeCheck(
            path=("safety_factor",), value=safety_factor, spec=TANK_SAFETY_FACTOR_RANGE
        ),
        NumericRangeCheck(
            path=("q_additional",), value=q_additional, spec=TANK_ADDITIONAL_HEAT_LOSS_RANGE
        ),
    )
    return validate_range_checks(checks)
