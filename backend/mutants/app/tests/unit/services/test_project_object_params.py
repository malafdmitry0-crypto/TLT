"""Regression tests for project-object params normalization."""

import pytest

from app.services.project_object_params import (
    ProjectObjectParamsError,
    normalize_project_object_params,
    prepare_project_object_params,
)


def test_pipe_object_defaults_match_inline_form_defaults():
    params = normalize_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20,
            "process_temperature": 80,
        },
    )

    assert params["wall_thickness"] == pytest.approx(0.004)
    assert params["pipe_material"] == "carbon_steel"
    assert params["placement"] == "outdoor"
    assert params["location"] == "outdoor"
    assert params["supply_voltage"] == 220
    assert params["safety_factor"] == pytest.approx(1.1)
    assert params["safety_factor_source"] == "default"
    assert params["steam_tracing"] == "no"
    assert params["num_local_elements"] == 6
    assert params["insulation_layers"] == [
        {"thickness": 0.05, "material": "mineral_wool_boards_120"}
    ]


def test_outdoor_object_defaults_insulation_temperature_basis_to_winter():
    params = normalize_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "placement": "outdoor",
        },
    )

    assert params["insulation_temperature_basis"] == "outdoor_winter"


def test_underground_object_still_requires_explicit_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим температуры изоляции"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "placement": "underground",
                "burial_depth": 1.2,
                "ground_type": "clay",
                "ground_conductivity": 1.7,
            },
        )


def test_non_indoor_object_rejects_indoor_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим tm"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "placement": "underground",
                "burial_depth": 1.2,
                "ground_type": "clay",
                "ground_conductivity": 1.7,
                "insulation_temperature_basis": "indoor",
            },
        )


def test_outdoor_object_rejects_attic_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим tm"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "placement": "outdoor",
                "insulation_temperature_basis": "attic",
            },
        )


def test_underground_object_accepts_channel_insulation_temperature_basis():
    params = prepare_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "placement": "underground",
            "burial_depth": 1.2,
            "ground_type": "clay",
            "ground_conductivity": 1.7,
            "insulation_temperature_basis": "channel",
        },
    )

    assert params["insulation_temperature_basis"] == "channel"


def test_underground_object_rejects_attic_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим tm"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "placement": "underground",
                "burial_depth": 1.2,
                "ground_type": "clay",
                "ground_conductivity": 1.7,
                "insulation_temperature_basis": "attic",
            },
        )


def test_indoor_object_accepts_indoor_insulation_temperature_basis():
    params = prepare_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": 20,
            "process_temperature": 80,
            "placement": "indoor",
            "insulation_temperature_basis": "indoor",
        },
    )

    assert params["insulation_temperature_basis"] == "indoor"


@pytest.mark.parametrize("basis", ["attic", "basement"])
def test_indoor_object_accepts_building_insulation_temperature_basis(basis):
    params = prepare_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "ambient_temperature": 20,
            "process_temperature": 80,
            "placement": "indoor",
            "insulation_temperature_basis": basis,
        },
    )

    assert params["insulation_temperature_basis"] == basis


def test_explicit_blank_pipe_wall_is_not_silently_defaulted():
    with pytest.raises(ProjectObjectParamsError, match="Толщина стенки"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "wall_thickness": None,
                "pipe_material": "carbon_steel",
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        )


def test_climate_key_is_derived_from_region_and_city():
    params = normalize_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "climate_region": "ХМАО",
            "climate_city": "Сургут",
        },
    )

    assert params["climate_key"] == "ХМАО|||Сургут"


def test_climate_region_and_city_are_derived_from_key_when_missing():
    params = normalize_project_object_params(
        "pipe",
        {
            "outer_diameter": 0.108,
            "pipe_length": 10,
            "insulation_thickness": 0.05,
            "insulation_material": "mineral_wool_boards_120",
            "insulation_temperature_basis": "outdoor_winter",
            "ambient_temperature": -20,
            "process_temperature": 80,
            "climate_key": "ХМАО|||Сургут",
        },
    )

    assert params["climate_region"] == "ХМАО"
    assert params["climate_city"] == "Сургут"
    assert params["climate_key"] == "ХМАО|||Сургут"


def test_declared_second_insulation_layer_requires_fields():
    with pytest.raises(ProjectObjectParamsError, match="2-го слоя"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "insulation_temperature_basis": "outdoor_winter",
                "insulation_layer_count": "2",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        )


def test_tank_shape_geometry_is_required_after_defaults():
    with pytest.raises(ProjectObjectParamsError, match="Диаметр резервуара"):
        prepare_project_object_params(
            "tank",
            {
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool_boards_120",
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        )
