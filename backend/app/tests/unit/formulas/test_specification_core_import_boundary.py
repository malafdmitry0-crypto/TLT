"""Architecture guard for the dependency-free specification core."""

from __future__ import annotations

import ast
from pathlib import Path

CORE_ROOT = (
    Path(__file__).parents[4]
    / "packages"
    / "specification-core"
    / "src"
    / "heatcalc_specification_core"
)
FORBIDDEN_ROOTS = {
    "aiohttp",
    "app",
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
    "environ",
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
APPLICATION_ORCHESTRATION_PREFIXES = (
    "app.api",
    "app.core",
    "app.models",
    "app.schemas",
    "app.services",
)
MAX_MODULE_LINES = 400


def _forbidden_module(module: str) -> bool:
    parts = module.lower().split(".")
    return parts[0] in FORBIDDEN_ROOTS or bool(set(parts) & FORBIDDEN_PARTS)


def _imported_modules(path: Path) -> list[tuple[int, str, int]]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    imports: list[tuple[int, str, int]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.extend((node.lineno, alias.name, 0) for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            imports.append((node.lineno, node.module or "", node.level))
    return imports


def _production_sources() -> list[Path]:
    return sorted(CORE_ROOT.rglob("*.py"))


def test_specification_core_has_no_backend_framework_io_or_environment_imports() -> None:
    sources = _production_sources()

    assert sources, f"Expected Python sources under {CORE_ROOT}"
    violations: list[str] = []
    for path in sources:
        relative = path.relative_to(CORE_ROOT)
        for line, module, level in _imported_modules(path):
            rendered = f"{'.' * level}{module}"
            if level > 1:
                violations.append(f"{relative}:{line}: parent-relative import {rendered}")
            elif module and _forbidden_module(module):
                violations.append(f"{relative}:{line}: forbidden import {rendered}")

    assert not violations, "Forbidden specification-core imports:\n" + "\n".join(violations)


def test_specification_core_never_imports_application_orchestration() -> None:
    violations: list[str] = []
    for path in _production_sources():
        relative = path.relative_to(CORE_ROOT)
        for line, module, _level in _imported_modules(path):
            if any(
                module == prefix or module.startswith(f"{prefix}.")
                for prefix in APPLICATION_ORCHESTRATION_PREFIXES
            ):
                violations.append(f"{relative}:{line}: {module}")

    assert not violations, "Core imports application orchestration:\n" + "\n".join(violations)


def test_specification_core_modules_stay_within_size_boundary() -> None:
    oversized = {
        str(path.relative_to(CORE_ROOT)): len(path.read_text(encoding="utf-8").splitlines())
        for path in _production_sources()
        if len(path.read_text(encoding="utf-8").splitlines()) > MAX_MODULE_LINES
    }

    assert oversized == {}


def test_legacy_specification_formula_compatibility_package_is_removed() -> None:
    legacy = Path(__file__).parents[3] / "formulas" / "specification" / "calculators"
    assert not any(legacy.glob("*.py"))
