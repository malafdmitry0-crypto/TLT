"""Canonical heat payload builders shared by cross-domain tests."""

MINERAL_WOOL = "mineral_wool_boards_120"


def canonical_pipe_params(**overrides: object) -> dict[str, object]:
    """Return a complete outdoor pipe payload accepted by the public object API."""

    return {
        "outer_diameter": 0.108,
        "wall_thickness": 0.006,
        "pipe_material": "carbon_steel",
        "pipe_length": 50.0,
        "insulation_layers": [{"thickness": 0.05, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30.0,
        "min_switch_temperature": -30.0,
        "process_temperature": 80.0,
        "placement": "outdoor",
        "wind_speed": 3.0,
        "safety_factor": 1.1,
        **overrides,
    }


def canonical_tank_params(**overrides: object) -> dict[str, object]:
    """Return a complete outdoor cylindrical tank payload for stored fixtures."""

    return {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [{"thickness": 0.08, "material": MINERAL_WOOL}],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -30.0,
        "min_switch_temperature": -30.0,
        "process_temperature": 70.0,
        "heating_height": 2.0,
        "laying_step": 0.2,
        "placement": "outdoor",
        "wind_speed": 3.0,
        "safety_factor": 1.1,
        "q_additional": 0.0,
        **overrides,
    }
