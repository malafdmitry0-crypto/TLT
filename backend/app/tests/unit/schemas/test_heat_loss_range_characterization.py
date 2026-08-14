"""Freeze Pydantic and OpenAPI range contracts for heat-loss inputs."""

import math
from collections.abc import Callable
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from app.schemas.heat_loss import (
    InsulationLayer,
    PipeHeatLossParams,
    StoredPipeHeatParams,
    TankHeatLossParams,
)

MINERAL_WOOL = "mineral_wool_boards_120"
ModelFactory = Callable[[dict[str, Any]], BaseModel]


def _layer_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {"thickness": 0.05, "material": MINERAL_WOOL}
    payload.update(overrides)
    return payload


def _pipe_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "outer_diameter": 0.1,
        "wall_thickness": 0.004,
        "pipe_material": "carbon_steel",
        "insulation_layers": [_layer_payload()],
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "insulation_temperature_basis": "outdoor_winter",
        "pipe_length": 10.0,
        "num_local_elements": 0,
        "wind_speed": 4.0,
        "placement": "outdoor",
    }
    payload.update(overrides)
    return payload


def _stored_pipe_payload(**overrides: object) -> dict[str, object]:
    payload = _pipe_payload(safety_factor=1.1)
    payload.update(overrides)
    return payload


def _tank_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "shape": "cylindrical",
        "diameter": 2.0,
        "height": 3.0,
        "insulation_layers": [_layer_payload()],
        "ambient_temperature": -20.0,
        "process_temperature": 80.0,
        "insulation_temperature_basis": "outdoor_winter",
        "placement": "outdoor",
        "wind_speed": 4.0,
        "safety_factor": 1.1,
    }
    payload.update(overrides)
    return payload


def _first_error(error: ValidationError, location: tuple[object, ...]) -> dict[str, Any]:
    errors = error.errors(include_url=False)
    return next(item for item in errors if item["loc"] == location)


def _assert_range_error(
    factory: ModelFactory,
    payload: dict[str, Any],
    location: tuple[object, ...],
    value: float | int,
    error_type: str,
    context: dict[str, Any],
) -> None:
    with pytest.raises(ValidationError) as caught:
        factory(**payload)
    error = _first_error(caught.value, location)
    assert error["type"] == error_type
    assert error["ctx"] == context
    assert isinstance(error["msg"], str) and error["msg"]
    assert error["input"] == value


@pytest.mark.parametrize(
    ("field", "minimum", "maximum", "min_type", "max_type"),
    [
        ("thickness", 0.0, 0.5, "greater_than", "less_than_equal"),
        ("conductivity", 0.0, 400.0, "greater_than", "less_than_equal"),
    ],
)
def test_insulation_layer_numeric_ranges_and_errors(
    field: str, minimum: float, maximum: float, min_type: str, max_type: str
) -> None:
    valid_minimum = math.nextafter(minimum, math.inf)
    assert (
        InsulationLayer(**_layer_payload(**{field: valid_minimum})).model_dump()[field]
        == valid_minimum
    )
    assert InsulationLayer(**_layer_payload(**{field: maximum})).model_dump()[field] == maximum

    _assert_range_error(
        InsulationLayer,
        _layer_payload(**{field: minimum}),
        (field,),
        minimum,
        min_type,
        {"gt": minimum},
    )
    _assert_range_error(
        InsulationLayer,
        _layer_payload(**{field: math.nextafter(maximum, math.inf)}),
        (field,),
        math.nextafter(maximum, math.inf),
        max_type,
        {"le": maximum},
    )


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_insulation_layer_rejects_non_finite_range_values(value: float) -> None:
    with pytest.raises(ValidationError) as caught:
        InsulationLayer(**_layer_payload(thickness=value))
    error = _first_error(caught.value, ("thickness",))
    assert error["type"] in {"finite_number", "greater_than", "less_than_equal"}
    assert isinstance(error["msg"], str) and error["msg"]


PIPE_RANGES = [
    ("outer_diameter", 0.0108, 3.0, "greater_than_equal", "less_than_equal"),
    ("wall_thickness", 0.0001, 0.04, "greater_than_equal", "less_than_equal"),
    ("pipe_lambda", 0.0, 400.0, "greater_than", "less_than_equal"),
    ("ambient_temperature", -70.0, 70.0, "greater_than_equal", "less_than_equal"),
    ("process_temperature", -90.0, 600.0, "greater_than_equal", "less_than_equal"),
    ("pipe_length", 0.5, 200_000.0, "greater_than_equal", "less_than_equal"),
    ("pipe_centerline_depth", 0.0, 200.0, "greater_than_equal", "less_than_equal"),
    ("num_local_elements", 0, 100, "greater_than_equal", "less_than_equal"),
    ("local_element_equiv_length", 0.1, 6.9, "greater_than_equal", "less_than_equal"),
    ("wind_speed", 0.0, 20.0, "greater_than_equal", "less_than_equal"),
    ("ground_conductivity", 0.5, 3.0, "greater_than_equal", "less_than_equal"),
    ("ground_temperature", -70.0, 70.0, "greater_than_equal", "less_than_equal"),
    ("safety_factor", 1.0, 1.7, "greater_than_equal", "less_than_equal"),
]


@pytest.mark.parametrize(("field", "minimum", "maximum", "min_type", "max_type"), PIPE_RANGES)
@pytest.mark.parametrize(
    ("model", "payload"),
    [(PipeHeatLossParams, _pipe_payload), (StoredPipeHeatParams, _stored_pipe_payload)],
)
def test_pipe_range_errors_preserve_location_type_message_and_context(
    model: type[BaseModel],
    payload: Callable[..., dict[str, object]],
    field: str,
    minimum: float | int,
    maximum: float | int,
    min_type: str,
    max_type: str,
) -> None:
    # The fixed outdoor payload makes model-level placement checks irrelevant to each field error.
    _assert_range_error(
        model,
        payload(**{field: minimum - 1}),
        (field,),
        minimum - 1,
        min_type,
        {"ge" if min_type == "greater_than_equal" else "gt": minimum},
    )
    _assert_range_error(
        model,
        payload(**{field: maximum + 1}),
        (field,),
        maximum + 1,
        max_type,
        {"le": maximum},
    )


@pytest.mark.parametrize(("field", "minimum", "maximum", "_min_type", "_max_type"), PIPE_RANGES)
@pytest.mark.parametrize(
    ("model", "payload"),
    [(PipeHeatLossParams, _pipe_payload), (StoredPipeHeatParams, _stored_pipe_payload)],
)
def test_pipe_ranges_are_inclusive_or_exclusive_at_exact_thresholds(
    model: type[BaseModel],
    payload: Callable[..., dict[str, object]],
    field: str,
    minimum: float | int,
    maximum: float | int,
    _min_type: str,
    _max_type: str,
) -> None:
    # Exact model validity can involve cross-field formula rules; range inclusion is observed directly.
    minimum_error = None
    maximum_error = None
    for value, target in ((minimum, "minimum"), (maximum, "maximum")):
        try:
            model(**payload(**{field: value}))
        except ValidationError as caught:
            field_errors = [
                item
                for item in caught.errors(include_url=False)
                if item["loc"] == (field,) and item["type"] in {_min_type, _max_type}
            ]
            if target == "minimum":
                minimum_error = field_errors
            else:
                maximum_error = field_errors
    assert bool(minimum_error) is (_min_type == "greater_than")
    assert maximum_error in (None, [])


@pytest.mark.parametrize(
    ("model", "payload"),
    [(PipeHeatLossParams, _pipe_payload), (StoredPipeHeatParams, _stored_pipe_payload)],
)
@pytest.mark.parametrize(("field", "_minimum", "_maximum", "_min_type", "_max_type"), PIPE_RANGES)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_pipe_numeric_ranges_reject_non_finite_values(
    model: type[BaseModel],
    payload: Callable[..., dict[str, object]],
    field: str,
    _minimum: float | int,
    _maximum: float | int,
    _min_type: str,
    _max_type: str,
    value: float,
) -> None:
    with pytest.raises(ValidationError) as caught:
        model(**payload(**{field: value}))
    error = _first_error(caught.value, (field,))
    assert error["type"] in {
        "finite_number",
        "greater_than",
        "greater_than_equal",
        "less_than_equal",
    }
    assert isinstance(error["msg"], str) and error["msg"]


def test_pipe_insulation_layer_list_is_one_to_three_and_reports_item_location() -> None:
    for model, payload in (
        (PipeHeatLossParams, _pipe_payload),
        (StoredPipeHeatParams, _stored_pipe_payload),
    ):
        assert (
            len(model(**payload(insulation_layers=[_layer_payload()] * 3)).insulation_layers) == 3
        )
        _assert_range_error(
            model,
            payload(insulation_layers=[]),
            ("insulation_layers",),
            [],
            "too_short",
            {"field_type": "List", "min_length": 1, "actual_length": 0},
        )
        _assert_range_error(
            model,
            payload(insulation_layers=[_layer_payload()] * 4),
            ("insulation_layers",),
            [_layer_payload()] * 4,
            "too_long",
            {"field_type": "List", "max_length": 3, "actual_length": 4},
        )


TANK_RANGES = [
    ("diameter", 0.1, 30.0),
    ("height", 0.1, 50.0),
    ("length", 0.1, 100.0),
    ("width", 0.1, 100.0),
    ("ambient_temperature", -70.0, 70.0),
    ("ground_temperature", -70.0, 70.0),
    ("process_temperature", -90.0, 600.0),
    ("wall_thickness", 0.001, 0.5),
    ("wall_lambda", 0.0, 500.0),
    ("tank_buried_height", 0.0, 50.0),
    ("ground_conductivity", 0.5, 3.0),
    ("wind_speed", 0.0, 20.0),
    ("safety_factor", 1.0, 1.7),
]


@pytest.mark.parametrize(("field", "minimum", "maximum"), TANK_RANGES)
def test_tank_range_errors_preserve_location_type_message_and_context(
    field: str, minimum: float, maximum: float
) -> None:
    minimum_type = (
        "greater_than" if field in {"wall_lambda", "tank_buried_height"} else "greater_than_equal"
    )
    _assert_range_error(
        TankHeatLossParams,
        _tank_payload(**{field: minimum - 1}),
        (field,),
        minimum - 1,
        minimum_type,
        {"gt" if minimum_type == "greater_than" else "ge": minimum},
    )
    _assert_range_error(
        TankHeatLossParams,
        _tank_payload(**{field: maximum + 1}),
        (field,),
        maximum + 1,
        "less_than_equal",
        {"le": maximum},
    )


@pytest.mark.parametrize(("field", "minimum", "maximum"), TANK_RANGES)
def test_tank_ranges_are_inclusive_or_exclusive_at_exact_thresholds(
    field: str, minimum: float, maximum: float
) -> None:
    for value, is_exclusive in (
        (minimum, field in {"wall_lambda", "tank_buried_height"}),
        (maximum, False),
    ):
        try:
            TankHeatLossParams(**_tank_payload(**{field: value}))
        except ValidationError as caught:
            errors = [
                item
                for item in caught.errors(include_url=False)
                if item["loc"] == (field,)
                and item["type"]
                in {"greater_than", "greater_than_equal", "less_than", "less_than_equal"}
            ]
            assert bool(errors) is is_exclusive


@pytest.mark.parametrize(("field", "_minimum", "_maximum"), TANK_RANGES)
@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_tank_numeric_ranges_reject_non_finite_values(
    field: str, _minimum: float, _maximum: float, value: float
) -> None:
    with pytest.raises(ValidationError) as caught:
        TankHeatLossParams(**_tank_payload(**{field: value}))
    error = _first_error(caught.value, (field,))
    assert error["type"] in {
        "finite_number",
        "greater_than",
        "greater_than_equal",
        "less_than_equal",
    }
    assert isinstance(error["msg"], str) and error["msg"]


def test_tank_insulation_layer_list_and_unbounded_q_additional_contract() -> None:
    assert (
        len(
            TankHeatLossParams(
                **_tank_payload(insulation_layers=[_layer_payload()] * 3)
            ).insulation_layers
        )
        == 3
    )
    _assert_range_error(
        TankHeatLossParams,
        _tank_payload(insulation_layers=[]),
        ("insulation_layers",),
        [],
        "too_short",
        {"field_type": "List", "min_length": 1, "actual_length": 0},
    )
    _assert_range_error(
        TankHeatLossParams,
        _tank_payload(insulation_layers=[_layer_payload()] * 4),
        ("insulation_layers",),
        [_layer_payload()] * 4,
        "too_long",
        {"field_type": "List", "max_length": 3, "actual_length": 4},
    )
    assert TankHeatLossParams(**_tank_payload(q_additional=math.inf)).q_additional == math.inf
    _assert_range_error(
        TankHeatLossParams,
        _tank_payload(q_additional=-1.0),
        ("q_additional",),
        -1.0,
        "greater_than_equal",
        {"ge": 0.0},
    )


def _assert_schema_range(
    schema: dict[str, Any],
    field: str,
    minimum: float,
    maximum: float,
    *,
    exclusive_minimum: bool = False,
) -> None:
    property_schema = schema["properties"][field]
    numeric_schema = next(
        branch
        for branch in property_schema.get("anyOf", [property_schema])
        if branch.get("type") == "number" or branch.get("type") == "integer"
    )
    assert numeric_schema["maximum"] == maximum
    if exclusive_minimum:
        assert numeric_schema["exclusiveMinimum"] == minimum
    else:
        assert numeric_schema["minimum"] == minimum
    if "anyOf" in property_schema:
        assert {branch.get("type") for branch in property_schema["anyOf"]} >= {"number", "null"}


def test_json_schema_keeps_numeric_range_keywords_and_optional_anyof_branches() -> None:
    layer_schema = InsulationLayer.model_json_schema()
    _assert_schema_range(layer_schema, "thickness", 0.0, 0.5, exclusive_minimum=True)
    _assert_schema_range(layer_schema, "conductivity", 0.0, 400.0, exclusive_minimum=True)

    for model in (PipeHeatLossParams, StoredPipeHeatParams):
        schema = model.model_json_schema()
        for field, minimum, maximum, min_type, _ in PIPE_RANGES:
            _assert_schema_range(
                schema, field, minimum, maximum, exclusive_minimum=min_type == "greater_than"
            )
        assert schema["properties"]["insulation_layers"]["minItems"] == 1
        assert schema["properties"]["insulation_layers"]["maxItems"] == 3

    tank_schema = TankHeatLossParams.model_json_schema()
    for field, minimum, maximum in TANK_RANGES:
        _assert_schema_range(
            tank_schema,
            field,
            minimum,
            maximum,
            exclusive_minimum=field in {"wall_lambda", "tank_buried_height"},
        )
    assert tank_schema["properties"]["insulation_layers"]["minItems"] == 1
    assert tank_schema["properties"]["insulation_layers"]["maxItems"] == 3
    assert tank_schema["properties"]["q_additional"]["minimum"] == 0.0
    assert "maximum" not in tank_schema["properties"]["q_additional"]
