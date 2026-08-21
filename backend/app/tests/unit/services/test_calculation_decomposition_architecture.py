"""Architecture gates for the decomposed calculation application layer."""

from __future__ import annotations

import ast
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parents[3]
SERVICES_ROOT = APP_ROOT / "services"
CALCULATION_ROOT = SERVICES_ROOT / "calculation"
COMPATIBILITY_FACADE = SERVICES_ROOT / "calculation_service.py"


def _tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def test_production_code_does_not_import_compatibility_facade() -> None:
    offenders: list[str] = []
    for path in APP_ROOT.rglob("*.py"):
        for node in ast.walk(_tree(path)):
            imports_removed_module = isinstance(node, ast.ImportFrom) and (
                node.module == "app.services.calculation_service"
                or (
                    node.module == "app.services"
                    and any(alias.name == "calculation_service" for alias in node.names)
                )
            )
            imports_removed_module = imports_removed_module or (
                isinstance(node, ast.Import)
                and any(
                    alias.name == "app.services.calculation_service" for alias in node.names
                )
            )
            if imports_removed_module:
                offenders.append(str(path.relative_to(APP_ROOT)))
    assert offenders == []


def test_compatibility_facade_is_removed() -> None:
    assert not COMPATIBILITY_FACADE.exists()


def test_calculation_modules_stay_bounded() -> None:
    oversized = {
        path.name: len(path.read_text(encoding="utf-8").splitlines())
        for path in CALCULATION_ROOT.glob("*.py")
        if len(path.read_text(encoding="utf-8").splitlines()) > 600
    }
    assert oversized == {}


def test_repository_never_owns_transaction_boundary() -> None:
    tree = _tree(CALCULATION_ROOT / "electrical_repository.py")
    forbidden_calls = {
        node.func.attr
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr in {"commit", "rollback"}
    }
    assert forbidden_calls == set()
