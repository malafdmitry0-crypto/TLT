"""Pure numeric input-range validation for pipe heat-loss formulas."""

from __future__ import annotations

from .validation import (
    INSULATION_LAYER_COUNT_RANGE,
    PIPE_AMBIENT_TEMPERATURE_RANGE,
    PIPE_CENTERLINE_DEPTH_RANGE,
    PIPE_CONDUCTIVITY_RANGE,
    PIPE_GROUND_CONDUCTIVITY_RANGE,
    PIPE_GROUND_TEMPERATURE_RANGE,
    PIPE_LENGTH_RANGE,
    PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE,
    PIPE_LOCAL_ELEMENTS_COUNT_RANGE,
    PIPE_OUTER_DIAMETER_RANGE,
    PIPE_PROCESS_TEMPERATURE_RANGE,
    PIPE_SAFETY_FACTOR_RANGE,
    PIPE_WALL_THICKNESS_RANGE,
    PIPE_WIND_SPEED_RANGE,
    FormulaValidationReport,
    NumericRangeCheck,
    RangeCheck,
    SequenceLengthCheck,
    validate_range_checks,
)


def validate_pipe_input_ranges(
    *,
    outer_diameter: float,
    wall_thickness: float,
    pipe_lambda: float | None,
    ambient_temperature: float | None,
    process_temperature: float,
    pipe_length: float,
    pipe_centerline_depth: float | None,
    num_local_elements: int,
    local_element_equiv_length: float | None,
    wind_speed: float | None,
    ground_conductivity: float | None,
    ground_temperature: float | None,
    safety_factor: float | None,
    insulation_layer_count: int,
) -> FormulaValidationReport:
    """Validate supplied pipe scalar bounds without placement or relation policy."""

    checks: tuple[RangeCheck, ...] = (
        NumericRangeCheck(
            path=("outer_diameter",), value=outer_diameter, spec=PIPE_OUTER_DIAMETER_RANGE
        ),
        NumericRangeCheck(
            path=("wall_thickness",), value=wall_thickness, spec=PIPE_WALL_THICKNESS_RANGE
        ),
    )
    if pipe_lambda is not None:
        checks += (
            NumericRangeCheck(
                path=("pipe_lambda",), value=pipe_lambda, spec=PIPE_CONDUCTIVITY_RANGE
            ),
        )
    checks += (
        SequenceLengthCheck(
            path=("insulation_layers",),
            length=insulation_layer_count,
            spec=INSULATION_LAYER_COUNT_RANGE,
        ),
    )
    if ambient_temperature is not None:
        checks += (
            NumericRangeCheck(
                path=("ambient_temperature",),
                value=ambient_temperature,
                spec=PIPE_AMBIENT_TEMPERATURE_RANGE,
            ),
        )
    checks += (
        NumericRangeCheck(
            path=("process_temperature",),
            value=process_temperature,
            spec=PIPE_PROCESS_TEMPERATURE_RANGE,
        ),
        NumericRangeCheck(path=("pipe_length",), value=pipe_length, spec=PIPE_LENGTH_RANGE),
    )
    if pipe_centerline_depth is not None:
        checks += (
            NumericRangeCheck(
                path=("pipe_centerline_depth",),
                value=pipe_centerline_depth,
                spec=PIPE_CENTERLINE_DEPTH_RANGE,
            ),
        )
    checks += (
        NumericRangeCheck(
            path=("num_local_elements",),
            value=num_local_elements,
            spec=PIPE_LOCAL_ELEMENTS_COUNT_RANGE,
        ),
    )
    optional_checks = (
        (
            "local_element_equiv_length",
            local_element_equiv_length,
            PIPE_LOCAL_ELEMENT_EQUIVALENT_LENGTH_RANGE,
        ),
        ("wind_speed", wind_speed, PIPE_WIND_SPEED_RANGE),
        ("ground_conductivity", ground_conductivity, PIPE_GROUND_CONDUCTIVITY_RANGE),
        ("ground_temperature", ground_temperature, PIPE_GROUND_TEMPERATURE_RANGE),
        ("safety_factor", safety_factor, PIPE_SAFETY_FACTOR_RANGE),
    )
    for path, value, spec in optional_checks:
        if value is not None:
            checks += (NumericRangeCheck(path=(path,), value=value, spec=spec),)
    return validate_range_checks(checks)
