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
        if "tests" in path.parts or path == COMPATIBILITY_FACADE:
            continue
        for node in ast.walk(_tree(path)):
            if (
                isinstance(node, ast.ImportFrom)
                and node.module == "app.services.calculation_service"
            ):
                offenders.append(str(path.relative_to(APP_ROOT)))
    assert offenders == []


def test_compatibility_facade_contains_delegation_only() -> None:
    source = COMPATIBILITY_FACADE.read_text(encoding="utf-8")
    assert len(source.splitlines()) <= 500
    tree = _tree(COMPATIBILITY_FACADE)
    service = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "CalculationService"
    )
    allowed_private = {"__init__", "_calc_heat_loss_with_coefficients"}
    private_methods = {
        node.name
        for node in service.body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef) and node.name.startswith("_")
    }
    assert private_methods <= allowed_private
    assert "load_cable_catalog" not in source
    assert "CableExtended" not in source


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
