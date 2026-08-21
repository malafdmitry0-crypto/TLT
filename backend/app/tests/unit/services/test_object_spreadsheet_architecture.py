"""Dependency and size ratchets for object spreadsheet owners."""

from __future__ import annotations

import ast
from pathlib import Path

_PACKAGE_ROOT = Path(__file__).resolve().parents[3] / "services/object_spreadsheet"
_OWNER_MODULES = (
    "contracts.py",
    "export.py",
    "mapping.py",
    "parsing.py",
    "persistence.py",
    "pipe_mapping.py",
    "preparation.py",
    "tank_mapping.py",
    "templates.py",
)
_PURE_MODULES = tuple(filename for filename in _OWNER_MODULES if filename != "persistence.py")
_FORBIDDEN_IMPORT_ROOTS = {"fastapi", "sqlalchemy"}
_MAPPING_MODULES = {"mapping.py", "pipe_mapping.py", "tank_mapping.py"}


def test_pure_owners_stay_below_module_size_limit() -> None:
    for filename in _OWNER_MODULES:
        path = _PACKAGE_ROOT / filename
        assert len(path.read_text(encoding="utf-8").splitlines()) <= 400, filename


def test_pure_owners_do_not_depend_on_api_or_persistence() -> None:
    for filename in _PURE_MODULES:
        path = _PACKAGE_ROOT / filename
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=filename)
        imported_roots = {
            node.module.split(".", 1)[0]
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom) and node.module is not None
        }
        imported_roots.update(
            alias.name.split(".", 1)[0]
            for node in ast.walk(tree)
            if isinstance(node, ast.Import)
            for alias in node.names
        )
        assert imported_roots.isdisjoint(_FORBIDDEN_IMPORT_ROOTS), filename
        if filename in _MAPPING_MODULES:
            assert "openpyxl" not in imported_roots, filename


def test_persistence_does_not_depend_on_file_formats() -> None:
    path = _PACKAGE_ROOT / "persistence.py"
    source = path.read_text(encoding="utf-8")

    assert "openpyxl" not in source
    assert "zipfile" not in source
    assert "import csv" not in source
