"""JSON contracts shared by the dependency-free specification core."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from types import MappingProxyType
from typing import TypeAlias, overload

JsonScalar: TypeAlias = None | bool | int | float | str
JsonValue: TypeAlias = JsonScalar | Sequence["JsonValue"] | Mapping[str, "JsonValue"]
JsonObject: TypeAlias = Mapping[str, JsonValue]


def json_object(value: object) -> JsonObject:
    """Validate and recursively freeze a JSON object at a core boundary."""
    if not isinstance(value, Mapping):
        raise TypeError("expected a JSON object")
    normalized: dict[str, JsonValue] = {}
    for key, item in value.items():
        if not isinstance(key, str):
            raise TypeError("JSON object keys must be strings")
        normalized[key] = json_value(item)
    return MappingProxyType(normalized)


def json_value(value: object) -> JsonValue:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, Mapping):
        return json_object(value)
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return tuple(json_value(item) for item in value)
    raise TypeError(f"unsupported JSON value: {type(value).__name__}")


@overload
def mutable_json(value: JsonObject) -> dict[str, JsonValue]: ...


@overload
def mutable_json(value: JsonValue) -> JsonValue: ...


def mutable_json(value: JsonValue) -> JsonValue:
    """Return JSON data with mutable dict/list containers for persistence adapters."""
    if isinstance(value, Mapping):
        return {key: mutable_json(item) for key, item in value.items()}
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [mutable_json(item) for item in value]
    return value
