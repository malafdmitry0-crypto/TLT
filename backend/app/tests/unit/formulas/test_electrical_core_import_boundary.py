"""Architecture guard for the dependency-free electrical formula core."""

from __future__ import annotations

import ast
import importlib
from pathlib import Path

CORE_ROOT = (
    Path(__file__).parents[4] / "packages" / "electrical-core" / "src" / "heatcalc_electrical_core"
)
FORBIDDEN_ROOTS = {
    "app",
    "aiohttp",
    "fastapi",
    "http",
    "pydantic",
    "redis",
    "requests",
    "socket",
    "sqlalchemy",
    "urllib",
}
FORBIDDEN_PARTS = {
    "config",
    "configs",
    "configuration",
    "database",
    "db",
    "fileinput",
    "filesystem",
    "glob",
    "io",
    "loader",
    "loaders",
    "mmap",
    "model",
    "models",
    "network",
    "os",
    "pathlib",
    "service",
    "services",
    "settings",
    "shutil",
    "tempfile",
}


def _forbidden_module(module: str) -> bool:
    parts = module.lower().split(".")
    return parts[0] in FORBIDDEN_ROOTS or bool(set(parts) & FORBIDDEN_PARTS)


def _import_violations(source: Path) -> list[str]:
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    violations: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _forbidden_module(alias.name):
                    violations.append(f"{source}: import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            rendered = f"{'.' * node.level}{node.module or ''}"
            if node.level > 1:
                violations.append(f"{source}: parent-relative import {rendered}")
            elif node.module and _forbidden_module(node.module):
                violations.append(f"{source}: from {rendered} import")
    return violations


def test_electrical_core_has_no_backend_or_io_imports() -> None:
    sources = sorted(CORE_ROOT.rglob("*.py"))

    assert sources, f"Expected Python sources under {CORE_ROOT}"
    violations = [violation for source in sources for violation in _import_violations(source)]

    assert not violations, "Forbidden core imports:\n" + "\n".join(violations)


def test_electrical_core_import_smoke() -> None:
    core = importlib.import_module("heatcalc_electrical_core")

    assert core.TTFormulaDomainError.__module__ == "heatcalc_electrical_core.errors"
    assert core.TTFormulaReport.__module__ == "heatcalc_electrical_core.validation"
    assert core.TTFormulaOutcome.__module__ == "heatcalc_electrical_core.formula_outcome"
    assert core.CatalogBundle.__module__ == "heatcalc_electrical_core.catalogs"
    assert core.PipeLayout.__module__ == "heatcalc_electrical_core.contracts"
    assert core.TankLayout.__module__ == "heatcalc_electrical_core.contracts"
    assert core.TTFormulaResult.__module__ == "heatcalc_electrical_core.contracts"
    assert core.TTPreparationInput.__module__ == "heatcalc_electrical_core.contracts"
    assert callable(core.list_tt_cable_options)
    assert callable(core.run_tt_formula)
