#!/usr/bin/env python3
"""Generate backend HeatCalc field contract from frontend JSON registry."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "frontend" / "src" / "config" / "heatcalc-fields.default.json"
TARGET = ROOT / "backend" / "app" / "generated" / "heatcalc_field_contract.py"
OBJECT_TYPES = ("pipe", "tank")


def fail(message: str) -> None:
    raise SystemExit(f"heatcalc field contract sync failed: {message}")


def read_registry() -> dict[str, Any]:
    with SOURCE.open(encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, dict):
        fail("source JSON root must be an object")
    return data


def as_dict(value: Any, name: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        fail(f"{name} must be an object")
    return value


def as_int(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        fail(f"{name} must be an integer")
    return value


def sorted_unique(values: list[str], name: str) -> list[str]:
    if len(values) != len(set(values)):
        fail(f"{name} contains duplicate keys")
    return sorted(values)


def table_column_keys(data: dict[str, Any]) -> dict[str, list[str]]:
    table = as_dict(data.get("table"), "table")
    registry = as_dict(table.get("registry"), "table.registry")
    result: dict[str, list[str]] = {}
    for object_type in OBJECT_TYPES:
        raw_columns = registry.get(object_type)
        if not isinstance(raw_columns, list) or not raw_columns:
            fail(f"table.registry.{object_type} must be a non-empty array")
        keys: list[str] = []
        for index, raw_column in enumerate(raw_columns):
            column = as_dict(raw_column, f"table.registry.{object_type}[{index}]")
            key = column.get("key")
            if not isinstance(key, str) or not key:
                fail(f"table.registry.{object_type}[{index}].key must be a non-empty string")
            keys.append(key)
        result[object_type] = sorted_unique(keys, f"table.registry.{object_type}")

    result["all"] = sorted(set(result["pipe"]) | set(result["tank"]))
    default_visible = as_dict(table.get("default_visible"), "table.default_visible")
    for object_type, known_keys in result.items():
        raw_visible = default_visible.get(object_type)
        if not isinstance(raw_visible, list):
            fail(f"table.default_visible.{object_type} must be an array")
        unknown = sorted(set(raw_visible) - set(known_keys))
        if unknown:
            fail(f"table.default_visible.{object_type} contains unknown keys: {unknown}")

    return result


def field_input_keys(data: dict[str, Any]) -> dict[str, list[str]]:
    fields = as_dict(data.get("fields"), "fields")
    result: dict[str, list[str]] = {object_type: [] for object_type in OBJECT_TYPES}
    for field_id, raw_field in fields.items():
        if not isinstance(field_id, str) or not field_id:
            fail("field id must be a non-empty string")
        field = as_dict(raw_field, f"fields.{field_id}")
        raw_types = field.get("definition_object_types") or field.get("object_types") or []
        if not isinstance(raw_types, list):
            fail(f"fields.{field_id}.object_types must be an array")
        input_by_type = field.get("input_by_type")
        typed_inputs = input_by_type if isinstance(input_by_type, dict) else {}
        for object_type in OBJECT_TYPES:
            if object_type not in raw_types:
                continue
            merged_input: dict[str, Any] = {}
            raw_input = field.get("input")
            if isinstance(raw_input, dict):
                merged_input.update(raw_input)
            raw_typed_input = typed_inputs.get(object_type)
            if isinstance(raw_typed_input, dict):
                merged_input.update(raw_typed_input)
            if (
                merged_input.get("type") == "number"
                and merged_input.get("configurable_step") is True
                and isinstance(merged_input.get("default_step"), int | float)
                and not isinstance(merged_input.get("default_step"), bool)
                and merged_input["default_step"] > 0
            ):
                result[object_type].append(field_id)

    return {
        object_type: sorted_unique(keys, f"field input keys for {object_type}")
        for object_type, keys in result.items()
    }


def emit_frozenset(values: list[str], indent: str = "    ") -> str:
    lines = ["frozenset(("]
    for value in values:
        lines.append(f'{indent}"{value}",')
    lines.append(f"{indent[:-4]}))" if len(indent) >= 4 else "))")
    return "\n".join(lines)


def emit_contract(data: dict[str, Any]) -> str:
    table = as_dict(data.get("table"), "table")
    form = as_dict(data.get("form"), "form")
    registry_version = as_int(data.get("version"), "version")
    table_version = as_int(table.get("settings_version"), "table.settings_version")
    field_input_version = as_int(
        form.get("field_input_settings_version"),
        "form.field_input_settings_version",
    )
    column_keys = table_column_keys(data)
    input_keys = field_input_keys(data)

    lines: list[str] = [
        '"""Generated HeatCalc field contract.',
        "",
        "Source: frontend/src/config/heatcalc-fields.default.json",
        "Regenerate: python3 scripts/sync-heatcalc-field-contract.py",
        '"""',
        "",
        "from __future__ import annotations",
        "",
        f"HEATCALC_FIELD_REGISTRY_VERSION = {registry_version}",
        f"HEATCALC_TABLE_COLUMNS_VERSION = {table_version}",
        f"HEATCALC_FIELD_INPUT_VERSION = {field_input_version}",
        "",
        "HEATCALC_TABLE_COLUMN_KEYS: dict[str, frozenset[str]] = {",
    ]
    for object_type in ("pipe", "tank", "all"):
        lines.append(f'    "{object_type}": {emit_frozenset(column_keys[object_type], "        ")},')
    lines.extend(
        [
            "}",
            "",
            "HEATCALC_FIELD_INPUT_FIELD_KEYS: dict[str, frozenset[str]] = {",
        ]
    )
    for object_type in OBJECT_TYPES:
        lines.append(f'    "{object_type}": {emit_frozenset(input_keys[object_type], "        ")},')
    lines.extend(["}", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Fail if generated file is stale")
    args = parser.parse_args()

    expected = emit_contract(read_registry())
    current = TARGET.read_text(encoding="utf-8") if TARGET.exists() else None
    if args.check:
        if current != expected:
            print(
                f"{TARGET.relative_to(ROOT)} is stale; "
                "run scripts/sync-heatcalc-field-contract.py",
                file=sys.stderr,
            )
            return 1
        print(f"{TARGET.relative_to(ROOT)} is in sync")
        return 0

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(expected, encoding="utf-8")
    print(f"wrote {TARGET.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
