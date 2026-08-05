"""Regression tests for project-object params normalization."""

import pytest

from app.services.project_object_params import (
    LEGACY_SPECIFICATION_OBJECT_PARAM_KEYS,
    LegacySpecificationObjectParamsError,
    ProjectObjectParamsError,
    normalize_project_object_params,
    prepare_project_object_params,
    reject_legacy_specification_object_params,
)


def _outdoor_pipe(**overrides):
    params = {
        "outer_diameter": 0.108,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "pipe_length": 10,
        "insulation_layers": [
            {"thickness": 0.05, "material": "mineral_wool_boards_120"}
        ],
        "insulation_temperature_basis": "outdoor_winter",
        "ambient_temperature": -20,
        "process_temperature": 80,
        "placement": "outdoor",
        "wind_speed": 0,
    }
    params.update(overrides)
    return params


def _underground_pipe(**overrides):
    params = _outdoor_pipe(
        placement="underground",
        insulation_temperature_basis="channel",
        ambient_temperature=None,
        wind_speed=None,
        ground_temperature=-20,
        pipe_centerline_depth=1.2,
        ground_conductivity=1.7,
        ground_type="clay",
    )
    params.update(overrides)
    return params


def test_pipe_normalization_preserves_canonical_heat_fields_and_adds_non_heat_defaults():
    params = normalize_project_object_params("pipe", _outdoor_pipe())
    assert params["wall_thickness"] == pytest.approx(0.004)
    assert params["pipe_material"] == "carbon_steel"
    assert params["placement"] == "outdoor"
    assert params["wind_speed"] == 0
    assert params["num_local_elements"] == 0
    assert params["aggressive_product"] is False
    assert "supply_voltage" not in params
    assert params["insulation_layers"] == [
        {"thickness": 0.05, "material": "mineral_wool_boards_120"}
    ]


def test_explicit_aggressive_product_is_preserved():
    params = normalize_project_object_params(
        "pipe",
        _outdoor_pipe(aggressive_product=True),
    )

    assert params["aggressive_product"] is True


@pytest.mark.parametrize("legacy_key", sorted(LEGACY_SPECIFICATION_OBJECT_PARAM_KEYS))
def test_object_write_guard_rejects_each_legacy_specification_key(legacy_key):
    with pytest.raises(LegacySpecificationObjectParamsError) as exc:
        reject_legacy_specification_object_params({legacy_key: False})

    assert exc.value.code == "OBJECT_SPECIFICATION_SETTINGS_SCOPE_VIOLATION"
    assert exc.value.fields == (legacy_key,)


def test_normalization_keeps_existing_legacy_values_inert_for_compatibility_reads():
    params = normalize_project_object_params(
        "pipe",
        _outdoor_pipe(
            explosion_zone_type="yes",
            hot_reserve_coefficient=9,
        ),
    )

    assert params["explosion_zone_type"] == "yes"
    assert params["hot_reserve_coefficient"] == 9


def test_non_indoor_object_rejects_indoor_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим tm"):
        prepare_project_object_params(
            "pipe", _underground_pipe(insulation_temperature_basis="indoor")
        )


def test_outdoor_object_rejects_attic_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим tm"):
        prepare_project_object_params(
            "pipe", _outdoor_pipe(insulation_temperature_basis="attic")
        )


def test_underground_object_accepts_channel_insulation_temperature_basis():
    params = prepare_project_object_params("pipe", _underground_pipe())
    assert params["insulation_temperature_basis"] == "channel"
    assert "ambient_temperature" not in params
    assert "wind_speed" not in params


def test_underground_object_rejects_attic_insulation_temperature_basis():
    with pytest.raises(ProjectObjectParamsError, match="Режим tm"):
        prepare_project_object_params(
            "pipe", _underground_pipe(insulation_temperature_basis="attic")
        )


@pytest.mark.parametrize("basis", ["indoor", "attic", "basement"])
def test_indoor_object_accepts_building_insulation_temperature_basis(basis):
    params = prepare_project_object_params(
        "pipe",
        _outdoor_pipe(
            placement="indoor",
            wind_speed=None,
            ambient_temperature=20,
            insulation_temperature_basis=basis,
        ),
    )
    assert params["insulation_temperature_basis"] == basis


def test_explicit_blank_pipe_wall_is_rejected():
    with pytest.raises(ProjectObjectParamsError, match="wall_thickness"):
        prepare_project_object_params("pipe", _outdoor_pipe(wall_thickness=None))


def test_climate_key_is_derived_from_region_and_city():
    params = normalize_project_object_params(
        "pipe", _outdoor_pipe(climate_region="ХМАО", climate_city="Сургут")
    )
    assert params["climate_key"] == "ХМАО|||Сургут"


def test_climate_region_and_city_are_derived_from_key_when_missing():
    params = normalize_project_object_params("pipe", _outdoor_pipe(climate_key="ХМАО|||Сургут"))
    assert params["climate_region"] == "ХМАО"
    assert params["climate_city"] == "Сургут"
    assert params["climate_key"] == "ХМАО|||Сургут"


def test_second_insulation_layer_requires_material():
    with pytest.raises(ProjectObjectParamsError):
        prepare_project_object_params(
            "pipe",
            _outdoor_pipe(
                insulation_layers=[
                    {"thickness": 0.05, "material": "mineral_wool_boards_120"},
                    {"thickness": 0.02},
                ]
            ),
        )


def test_tank_shape_geometry_is_required_after_defaults():
    with pytest.raises(ProjectObjectParamsError, match="diameter и height"):
        prepare_project_object_params(
            "tank",
            {
                "insulation_layers": [
                    {"thickness": 0.05, "material": "mineral_wool_boards_120"}
                ],
                "insulation_temperature_basis": "outdoor_winter",
                "ambient_temperature": -20,
                "process_temperature": 80,
                "placement": "outdoor",
                "wind_speed": 0,
            },
        )
