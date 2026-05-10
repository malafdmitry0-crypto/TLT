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
            "insulation_material": "mineral_wool",
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
    assert params["steam_tracing"] == "no"
    assert params["num_local_elements"] == 6
    assert params["insulation_layers"] == [{"thickness": 0.05, "material": "mineral_wool"}]


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
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        )


def test_declared_second_insulation_layer_requires_fields():
    with pytest.raises(ProjectObjectParamsError, match="2-го слоя"):
        prepare_project_object_params(
            "pipe",
            {
                "outer_diameter": 0.108,
                "pipe_length": 10,
                "insulation_thickness": 0.05,
                "insulation_material": "mineral_wool",
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
                "insulation_material": "mineral_wool",
                "ambient_temperature": -20,
                "process_temperature": 80,
            },
        )
