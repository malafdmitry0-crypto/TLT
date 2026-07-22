from app.reference_data.loader import list_insulation_materials, list_tt_cables
from app.schemas.calculation import PipeHeatLossParams, TankHeatLossParams
from app.seeds import (
    _PIPE_CONFIGS,
    _TANK_CONFIGS,
    _insulation_seed_row,
    _seed_params_are_current,
)


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
        "10ТТН2", "17ТТН2", "25ТТН2", "31ТТН2",
        "15ТТВ2", "30ТТВ2", "45ТТВ2", "60ТТВ2",
        "15ТТХ2", "30ТТХ2", "45ТТХ2", "60ТТХ2", "75ТТХ2", "90ТТХ2",
    ]


def test_project_object_seeds_use_concrete_insulation_materials():
    selectable = {
        entry["material"]
        for entry in list_insulation_materials()
        if entry.get("selectable") is not False
        and entry.get("deprecated") is not True
        and entry.get("requires_material_reselection") is not True
    }

    for config in _PIPE_CONFIGS:
        params = config["params"]
        PipeHeatLossParams(**params)
        assert params.get("insulation_temperature_basis")
        assert set(_seed_insulation_materials(params)).issubset(selectable)

    for config in _TANK_CONFIGS:
        params = config["params"]
        TankHeatLossParams(**params)
        assert params.get("insulation_temperature_basis")
        assert set(_seed_insulation_materials(params)).issubset(selectable)


def test_stale_seed_params_are_replaced():
    expected = _PIPE_CONFIGS[0]["params"]
    stale = {**expected, "insulation_material": "mineral_wool"}

    assert _seed_params_are_current(expected, expected) is True
    assert _seed_params_are_current(stale, expected) is False


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
