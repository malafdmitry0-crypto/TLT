from __future__ import annotations

import ast
from pathlib import Path

from app.services.project_io.mapping import parse_bulk_payloads, parse_single_payload


def test_parse_single_payload_maps_current_sections():
    payload = parse_single_payload(
        {
            "metadata": [
                ["key", "value"],
                ["name", "P"],
            ],
            "objects": [["object_key", "type", "params"], ["o1", "pipe", "{}"]],
        }
    )
    assert payload.name == "P"
    assert payload.project_key is None
    assert payload.objects == [{"object_key": "o1", "type": "pipe", "params": "{}"}]


def test_parse_bulk_payloads_scopes_rows_by_project_key():
    payloads = parse_bulk_payloads(
        {
            "projects": [
                ["project_key", "name"],
                ["p1", "One"],
                ["p2", "Two"],
            ],
            "objects": [
                ["project_key", "object_key", "type"],
                ["p2", "o2", "tank"],
                ["p1", "o1", "pipe"],
            ],
        }
    )
    assert [payload.name for payload in payloads] == ["One", "Two"]
    assert payloads[0].objects[0]["object_key"] == "o1"
    assert payloads[1].objects[0]["object_key"] == "o2"


def test_pure_layers_do_not_import_sqlalchemy_or_models():
    services_dir = Path(__file__).resolve().parents[4] / "services" / "project_io"
    for module_name in ("csv_codec.py", "mapping.py", "validation.py"):
        tree = ast.parse((services_dir / module_name).read_text(encoding="utf-8"))
        imported_modules = {
            node.module or "" for node in ast.walk(tree) if isinstance(node, ast.ImportFrom)
        }
        imported_modules.update(
            alias.name
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        )
        assert not any(
            name == "sqlalchemy" or name.startswith("sqlalchemy.") for name in imported_modules
        )
        assert not any(
            name == "app.models" or name.startswith("app.models.") for name in imported_modules
        )
