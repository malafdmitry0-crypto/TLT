from app.reference_data.loader import list_insulation_materials, list_tt_cables
from app.schemas.project import ProjectObjectCreate
from app.seeds import (
    _HEAT_SEED_CONFIGS,
    _electrical_seed_overrides,
    _insulation_seed_row,
)
from app.services.heat_contract import (
    DEPRECATED_HEAT_PARAM_KEYS,
    PIPE_FORBIDDEN_HEAT_PARAM_KEYS,
    TANK_FORBIDDEN_HEAT_PARAM_KEYS,
)
from app.services.project_object_params import prepare_project_object_params

EXPECTED_HEAT_SEED_CASES = {
    "pipe_indoor_manual_lambda_1_layer",
    "pipe_outdoor_reference_2_layers",
    "pipe_underground_reference_3_layers",
    "tank_cylindrical_indoor",
    "tank_cylindrical_outdoor",
    "tank_rectangular_indoor",
    "tank_rectangular_outdoor",
    "tank_spherical_indoor",
    "tank_spherical_outdoor",
    "tank_spherical_outdoor_multilayer",
    "tank_cylindrical_underground_split_temperatures",
    "tank_rectangular_underground_split_temperatures",
    "tank_q_additional_after_safety_factor",
}


def _seed_insulation_materials(params: dict[str, object]) -> list[str]:
    layers = params.get("insulation_layers")
    if isinstance(layers, list):
        return [
            str(layer.get("material"))
            for layer in layers
            if isinstance(layer, dict) and layer.get("material")
        ]
    material = params.get("insulation_material")
    return [str(material)] if material else []


def test_tt_catalog_uses_the_supported_product_line():
    assert [row["model"] for row in list_tt_cables()] == [
        "10ТТН2",
        "17ТТН2",
        "25ТТН2",
        "31ТТН2",
        "15ТТВ2",
        "30ТТВ2",
        "45ТТВ2",
        "60ТТВ2",
        "15ТТХ2",
        "30ТТХ2",
        "45ТТХ2",
        "60ТТХ2",
        "75ТТХ2",
        "90ТТХ2",
    ]


def test_heat_seed_matrix_is_exact_and_traceable():
    assert len(_HEAT_SEED_CONFIGS) == 13
    assert {config["seed_case"] for config in _HEAT_SEED_CONFIGS} == EXPECTED_HEAT_SEED_CASES
    assert len({config["name"] for config in _HEAT_SEED_CONFIGS}) == 13
    assert [config["object_type"] for config in _HEAT_SEED_CONFIGS].count("pipe") == 3
    assert [config["object_type"] for config in _HEAT_SEED_CONFIGS].count("tank") == 10


def test_heat_seeds_pass_the_same_create_and_storage_contract_as_api_objects():
    selectable = {
        entry["material"]
        for entry in list_insulation_materials()
        if entry.get("selectable") is not False
        and entry.get("deprecated") is not True
        and entry.get("requires_material_reselection") is not True
    }

    for config in _HEAT_SEED_CONFIGS:
        params = config["params"]
        create = ProjectObjectCreate(
            object_type=config["object_type"],
            sort_order=0,
            params=params,
        )
        stored = prepare_project_object_params(create.object_type, create.params)
        forbidden = (
            PIPE_FORBIDDEN_HEAT_PARAM_KEYS
            if create.object_type == "pipe"
            else TANK_FORBIDDEN_HEAT_PARAM_KEYS
        )

        assert stored["seed_case"] == config["seed_case"]
        assert stored["name"] == config["name"]
        assert stored.get("insulation_temperature_basis")
        assert set(_seed_insulation_materials(params)).issubset(selectable)
        assert DEPRECATED_HEAT_PARAM_KEYS.isdisjoint(stored)
        assert forbidden.isdisjoint(stored)
        assert not any(key.endswith("_mm") for key in stored)


def test_pipe_seed_matrix_covers_placement_lambda_and_layer_branches():
    pipes = [config["params"] for config in _HEAT_SEED_CONFIGS if config["object_type"] == "pipe"]

    assert {params["placement"] for params in pipes} == {"indoor", "outdoor", "underground"}
    assert {len(params["insulation_layers"]) for params in pipes} == {1, 2, 3}
    assert sum("pipe_lambda" in params for params in pipes) == 1
    assert sum("pipe_material" in params for params in pipes) == 2
    assert all(not ({"pipe_lambda", "pipe_material"} <= params.keys()) for params in pipes)

    underground = next(params for params in pipes if params["placement"] == "underground")
    assert "ground_temperature" in underground
    assert "pipe_centerline_depth" in underground
    assert "ambient_temperature" not in underground


def test_tank_seed_matrix_covers_shapes_placements_and_special_cases():
    tanks = [config["params"] for config in _HEAT_SEED_CONFIGS if config["object_type"] == "tank"]
    shape_placements = {(params["shape"], params["placement"]) for params in tanks}

    assert shape_placements == {
        ("cylindrical", "indoor"),
        ("cylindrical", "outdoor"),
        ("cylindrical", "underground"),
        ("rectangular", "indoor"),
        ("rectangular", "outdoor"),
        ("rectangular", "underground"),
        ("spherical", "indoor"),
        ("spherical", "outdoor"),
    }

    spherical = [params for params in tanks if params["shape"] == "spherical"]
    assert {len(params["insulation_layers"]) for params in spherical} == {1, 2}
    assert all(params["placement"] != "underground" for params in spherical)

    underground = [params for params in tanks if params["placement"] == "underground"]
    assert {params["shape"] for params in underground} == {"cylindrical", "rectangular"}
    assert all(
        params["ambient_temperature"] != params["ground_temperature"] for params in underground
    )

    additional = next(params for params in tanks if params["q_additional"] > 0)
    assert additional["q_additional"] == 250.0

    metadata_volume = next(params for params in tanks if "volume" in params)
    assert metadata_volume["volume"] == 24.5


def test_electrical_seed_matrix_uses_current_tt_inputs_for_pipes_and_supported_tanks():
    planned = [
        (config, _electrical_seed_overrides(config["object_type"], config["params"]))
        for config in _HEAT_SEED_CONFIGS
    ]
    supported = [(config, overrides) for config, overrides in planned if overrides is not None]

    assert len(supported) == 10
    assert {config["object_type"] for config, _overrides in supported} == {"pipe", "tank"}
    assert all(overrides["maintain_temperature_c"] == 10.0 for _config, overrides in supported)
    assert {overrides["aggressive_product"] for _config, overrides in supported} == {
        False,
        True,
    }
    assert all(
        overrides["maintain_temperature_c"] != config["params"]["process_temperature"]
        for config, overrides in supported
    )

    for config, overrides in supported:
        if config["object_type"] == "pipe":
            assert "tank_heating_height_m" not in overrides
            assert "tank_laying_step_m" not in overrides
            continue
        assert overrides["tank_heating_height_m"] == config["params"]["height"]
        assert overrides["tank_laying_step_m"] == 0.2


def test_electrical_seed_matrix_explicitly_excludes_unsupported_spherical_tanks():
    unsupported = [
        config
        for config in _HEAT_SEED_CONFIGS
        if _electrical_seed_overrides(config["object_type"], config["params"]) is None
    ]

    assert len(unsupported) == 3
    assert all(config["object_type"] == "tank" for config in unsupported)
    assert all(config["params"]["shape"] == "spherical" for config in unsupported)


def test_insulation_seed_row_preserves_reference_contract():
    entry = next(item for item in list_insulation_materials() if item["material"] == "mineral_wool")

    row = _insulation_seed_row(entry)

    assert row["material"] == "mineral_wool"
    assert row["data_source"] == "builtin_json"
    assert row["is_active"] is True
    assert row["selectable"] is False
    assert row["deprecated"] is True
    assert row["requires_material_reselection"] is True
    assert row["reselection_message"]
