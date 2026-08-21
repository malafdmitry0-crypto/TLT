from inspect import getsource

from app.reference_data.loader import list_insulation_materials, list_tt_cables
from app.schemas.electrical_assignment import ElectricalAssignmentOverridesPatch
from app.schemas.project import ProjectObjectCreate
from app.seeds.demo.electrical import (
    electrical_seed_overrides,
    seed_electrical_calculations,
)
from app.seeds.loader import load_demo_manifest
from app.seeds.references import insulation_seed_row
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
    "tank_cylindrical_underground_split_temperatures",
    "tank_rectangular_underground_split_temperatures",
    "tank_q_additional_after_safety_factor",
}
_HEAT_SEED_CONFIGS = tuple(seed.model_dump() for seed in load_demo_manifest().heat_cases)


def _project_seed_plans():
    return tuple(plan.model_dump() for plan in load_demo_manifest().project_plans)


_electrical_seed_overrides = electrical_seed_overrides
_insulation_seed_row = insulation_seed_row


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
    assert len(_HEAT_SEED_CONFIGS) == 10
    assert {config["seed_case"] for config in _HEAT_SEED_CONFIGS} == EXPECTED_HEAT_SEED_CASES
    assert len({config["name"] for config in _HEAT_SEED_CONFIGS}) == 10
    assert [config["object_type"] for config in _HEAT_SEED_CONFIGS].count("pipe") == 3
    assert [config["object_type"] for config in _HEAT_SEED_CONFIGS].count("tank") == 7


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
        assert stored["min_switch_temperature"] == -20.0
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
    }

    underground = [params for params in tanks if params["placement"] == "underground"]
    assert {params["shape"] for params in underground} == {"cylindrical", "rectangular"}
    assert all(
        params["ambient_temperature"] != params["ground_temperature"] for params in underground
    )

    additional = next(params for params in tanks if params["q_additional"] > 0)
    assert additional["q_additional"] == 250.0

    metadata_volume = next(params for params in tanks if "volume" in params)
    assert metadata_volume["volume"] == 24.5


def test_electrical_seed_matrix_leaves_project_idop_unset_for_catalog_derivation():
    assert "max_section_start_current_a" not in getsource(seed_electrical_calculations)
    planned = [
        (config, _electrical_seed_overrides(config["object_type"], config["params"]))
        for config in _HEAT_SEED_CONFIGS
    ]
    for config, overrides in planned:
        assert "max_section_start_current_a" not in overrides
        assert overrides["supply_voltage_v"] == 230
        ElectricalAssignmentOverridesPatch(expected_version=1, **overrides)
        if config["object_type"] == "pipe":
            assert set(overrides) == {"supply_voltage_v"}
            continue
        assert overrides["tank_heating_height_m"] == config["params"]["height"]
        assert overrides["tank_laying_step_m"] == 0.2


def test_seed_data_contains_only_supported_tank_shapes():
    tank_shapes = {
        config["params"]["shape"]
        for config in _HEAT_SEED_CONFIGS
        if config["object_type"] == "tank"
    }
    unsupported = [
        config
        for config in _HEAT_SEED_CONFIGS
        if _electrical_seed_overrides(config["object_type"], config["params"]) is None
    ]

    assert tank_shapes == {"cylindrical", "rectangular"}
    assert unsupported == []


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


def _plan_object_types(plan) -> set[str]:
    canonical_by_case = {config["seed_case"]: config for config in _HEAT_SEED_CONFIGS}
    types = {canonical_by_case[case]["object_type"] for case in plan["canonical"]}
    return types | {config["object_type"] for config in plan["volume"]}


def test_project_seed_plan_covers_every_canonical_case_exactly_once():
    plans = _project_seed_plans()
    planned = [case for plan in plans for case in plan["canonical"]]

    assert sorted(planned) == sorted(EXPECTED_HEAT_SEED_CASES)
    assert len(planned) == len(set(planned))


def test_project_seed_plan_mixes_single_type_and_mixed_projects():
    """Кейс 1 §5.2: страница живёт и на одном типе объектов, и на смеси."""

    plans = _project_seed_plans()
    compositions = {plan["project"]: _plan_object_types(plan) for plan in plans}

    pipes_only = [name for name, types in compositions.items() if types == {"pipe"}]
    tanks_only = [name for name, types in compositions.items() if types == {"tank"}]
    mixed = [name for name, types in compositions.items() if types == {"pipe", "tank"}]

    assert len(compositions) == len(plans)
    assert 5 <= len(compositions) <= 10
    assert len(pipes_only) >= 2, pipes_only
    assert len(tanks_only) >= 2, tanks_only
    assert len(mixed) >= 2, mixed
    assert all(len(plan["canonical"]) + len(plan["volume"]) >= 4 for plan in plans)


def test_project_seed_plan_objects_pass_the_write_contract():
    """Каждый объект наполнения проходит тот же нормализатор, что и API."""

    for plan in _project_seed_plans():
        for config in plan["volume"]:
            # seed_case остаётся только у канонических объектов — по нему их
            # отличает scripts/heat-seed-audit.sql
            assert "seed_case" not in config["params"]
            params = prepare_project_object_params(config["object_type"], dict(config["params"]))
            assert params["min_switch_temperature"] == -20.0
            forbidden = (
                PIPE_FORBIDDEN_HEAT_PARAM_KEYS
                if config["object_type"] == "pipe"
                else TANK_FORBIDDEN_HEAT_PARAM_KEYS
            )
            assert not forbidden.intersection(params)
            assert not DEPRECATED_HEAT_PARAM_KEYS.intersection(params)
            ProjectObjectCreate(
                object_type=config["object_type"],
                sort_order=0,
                params=params,
            )


def test_project_seed_plan_stays_inside_the_tt_catalog_temperature_floor():
    for plan in _project_seed_plans():
        for config in plan["volume"]:
            params = config["params"]
            environment = (
                params.get("ground_temperature")
                if params.get("placement") == "underground" and config["object_type"] == "pipe"
                else params.get("ambient_temperature")
            )
            assert isinstance(environment, int | float)
            assert environment >= -40
