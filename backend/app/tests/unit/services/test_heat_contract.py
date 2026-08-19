"""Characterization and contract tests for heat-owned JSON fields."""

import pytest

from app.schemas.heat_loss import (
    PipeHeatLossParams,
    PipeHeatLossResult,
    StoredPipeHeatParams,
    StoredTankHeatParams,
    TankHeatLossParams,
    TankHeatLossResult,
)
from app.services.heat_contract import (
    CANONICAL_HEAT_RESULT_KEYS,
    COMMON_HEAT_PARAM_KEYS,
    DEPRECATED_HEAT_PARAM_KEYS,
    DEPRECATED_HEAT_RESULT_KEYS,
    HEAT_OWNED_PARAM_KEYS,
    PIPE_CANONICAL_RESULT_KEYS,
    PIPE_DEPRECATED_RESULT_KEYS,
    PIPE_FORBIDDEN_HEAT_PARAM_KEYS,
    PIPE_HEAT_PARAM_KEYS,
    TANK_CANONICAL_RESULT_KEYS,
    TANK_DEPRECATED_RESULT_KEYS,
    TANK_FORBIDDEN_HEAT_PARAM_KEYS,
    TANK_HEAT_PARAM_KEYS,
    replace_heat_owned_params,
)

AMBIENT_MAXIMUM_KEY = "max_ambient_temperature"


def test_heat_contract_registries_are_disjoint_and_volume_is_non_heat_metadata():
    assert HEAT_OWNED_PARAM_KEYS.isdisjoint(DEPRECATED_HEAT_PARAM_KEYS)
    assert CANONICAL_HEAT_RESULT_KEYS.isdisjoint(DEPRECATED_HEAT_RESULT_KEYS)
    assert "volume" not in HEAT_OWNED_PARAM_KEYS
    assert "volume" not in DEPRECATED_HEAT_PARAM_KEYS


@pytest.mark.parametrize(
    "registry",
    [
        COMMON_HEAT_PARAM_KEYS,
        PIPE_HEAT_PARAM_KEYS,
        TANK_HEAT_PARAM_KEYS,
        HEAT_OWNED_PARAM_KEYS,
        DEPRECATED_HEAT_PARAM_KEYS,
        PIPE_FORBIDDEN_HEAT_PARAM_KEYS,
        TANK_FORBIDDEN_HEAT_PARAM_KEYS,
    ],
)
def test_ambient_maximum_is_absent_from_every_heat_param_registry(
    registry: frozenset[str],
) -> None:
    assert AMBIENT_MAXIMUM_KEY not in registry


def test_result_schemas_exactly_match_their_per_object_registries():
    assert set(PipeHeatLossResult.model_fields) == PIPE_CANONICAL_RESULT_KEYS
    assert set(TankHeatLossResult.model_fields) == TANK_CANONICAL_RESULT_KEYS
    assert PIPE_CANONICAL_RESULT_KEYS.isdisjoint(PIPE_DEPRECATED_RESULT_KEYS)
    assert TANK_CANONICAL_RESULT_KEYS.isdisjoint(TANK_DEPRECATED_RESULT_KEYS)


def test_ambient_maximum_is_absent_from_formula_input_and_result_schemas() -> None:
    for schema in (
        PipeHeatLossParams,
        StoredPipeHeatParams,
        TankHeatLossParams,
        StoredTankHeatParams,
        PipeHeatLossResult,
        TankHeatLossResult,
    ):
        assert AMBIENT_MAXIMUM_KEY not in schema.model_fields
    assert AMBIENT_MAXIMUM_KEY not in CANONICAL_HEAT_RESULT_KEYS


def test_volume_is_not_part_of_the_tank_formula_schema():
    assert "volume" not in TankHeatLossParams.model_fields


def test_heat_replacement_drops_previous_heat_and_deprecated_keys_but_preserves_metadata():
    existing = {
        "name": "P-101",
        "volume": 12.5,
        "supply_voltage": 220,
        "ambient_temperature": -30,
        "insulation_thickness": 0.05,
        "location": "outdoor",
    }
    incoming = {
        "placement": "indoor",
        "ambient_temperature": 20,
        "process_temperature": 80,
        "insulation_layers": [{"thickness": 0.08, "material": "mineral_wool_boards_120"}],
    }

    replaced = replace_heat_owned_params(existing, incoming)

    assert replaced["name"] == "P-101"
    assert replaced["volume"] == 12.5
    assert replaced["supply_voltage"] == 220
    assert replaced["placement"] == "indoor"
    assert replaced["ambient_temperature"] == 20
    assert "insulation_thickness" not in replaced
    assert "location" not in replaced


def test_shared_object_update_can_explicitly_change_non_heat_metadata():
    existing = {"volume": 12.5, "supply_voltage": 220}
    incoming = {
        "volume": 99,
        "supply_voltage": 380,
        "process_temperature": 80,
    }

    replaced = replace_heat_owned_params(existing, incoming)

    assert replaced["volume"] == 99
    assert replaced["supply_voltage"] == 380
    assert replaced["process_temperature"] == 80


def test_heat_replacement_preserves_and_explicitly_updates_ambient_maximum_metadata():
    existing = {
        "max_ambient_temperature": 35.0,
        "ambient_temperature": -30.0,
        "process_temperature": 80.0,
    }

    heat_updated = replace_heat_owned_params(
        existing,
        {
            "ambient_temperature": -25.0,
            "process_temperature": 85.0,
        },
    )
    metadata_updated = replace_heat_owned_params(
        heat_updated,
        {
            "max_ambient_temperature": 42.0,
            "process_temperature": 90.0,
        },
    )

    assert heat_updated["max_ambient_temperature"] == 35.0
    assert metadata_updated["max_ambient_temperature"] == 42.0


def test_non_heat_only_partial_update_preserves_existing_heat_fragment():
    existing = {
        "process_temperature": 80,
        "ambient_temperature": -30,
        "insulation_layers": [{"thickness": 0.05, "material": "other"}],
        "supply_voltage": 220,
    }

    replaced = replace_heat_owned_params(existing, {"supply_voltage": 380})

    assert replaced["process_temperature"] == 80
    assert replaced["ambient_temperature"] == -30
    assert replaced["insulation_layers"] == [{"thickness": 0.05, "material": "other"}]
    assert replaced["supply_voltage"] == 380
