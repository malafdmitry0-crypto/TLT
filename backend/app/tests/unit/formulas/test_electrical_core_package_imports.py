"""Architecture ratchet: no backend shim namespace for the electrical core."""

from __future__ import annotations

import ast
import importlib
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[4]
SHIM_DIRECTORY = BACKEND_ROOT / "app" / "formulas" / "electrical" / "core"
REMOVED_TT_CONTRACT = BACKEND_ROOT / "app" / "formulas" / "electrical" / "tt_contract.py"
FORBIDDEN_PREFIXES = {
    "app.formulas.electrical.core",
    "app.formulas.electrical.tt_contract",
}
SCAN_SKIP_PARTS = {".git", "mutants", "__pycache__", ".venv", "dist", "build"}

# Keep this explicit facade synchronized with the approved root integration.
EXPECTED_PUBLIC_API = {
    "BomCatalogRow",
    "CableOption",
    "CatalogBundle",
    "ELECTRICAL_TT_FORMULA_FINGERPRINT",
    "ELECTRICAL_TT_FORMULA_VERSION",
    "EqualSection",
    "OptionsOutcome",
    "PipeLayout",
    "PowerCatalogRow",
    "SectionCatalogRow",
    "TTFormulaDomainError",
    "TTFormulaIssue",
    "TTFormulaOutcome",
    "TTFormulaReport",
    "TTFormulaResult",
    "TTPreparationInput",
    "TankLayout",
    "catalog_bundle_from_payload",
    "compute_tank_cable_length",
    "list_tt_cable_options",
    "run_tt_formula",
}


def _is_forbidden_module(module: str | None) -> bool:
    if module is None:
        return False
    return any(
        module == prefix or module.startswith(f"{prefix}.")
        for prefix in FORBIDDEN_PREFIXES
    )


def _shim_import_violations(source: Path) -> list[str]:
    tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
    violations: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _is_forbidden_module(alias.name):
                    violations.append(f"{source}: import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if _is_forbidden_module(node.module):
                rendered = f"{'.' * node.level}{node.module or ''}"
                violations.append(f"{source}: from {rendered} import")
            elif node.module == "app.formulas.electrical" and any(
                alias.name == "core" for alias in node.names
            ):
                violations.append(f"{source}: from app.formulas.electrical import core")
    return violations


def _executable_python_files() -> list[Path]:
    files: list[Path] = []
    for root_name in ("app", "packages", "scripts"):
        root = BACKEND_ROOT / root_name
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if SCAN_SKIP_PARTS & set(path.parts):
                continue
            files.append(path)
    return files


def test_backend_core_shim_directory_is_absent() -> None:
    assert not SHIM_DIRECTORY.exists()
    assert not REMOVED_TT_CONTRACT.exists()


def test_executable_python_does_not_import_electrical_core_shim() -> None:
    sources = _executable_python_files()
    assert sources
    violations = [violation for source in sources for violation in _shim_import_violations(source)]
    assert not violations, "Forbidden shim imports:\n" + "\n".join(violations)


def test_canonical_package_exposes_only_the_approved_high_level_api() -> None:
    canonical = importlib.import_module("heatcalc_electrical_core")
    public_api = importlib.import_module("heatcalc_electrical_core.api")

    assert set(canonical.__all__) == EXPECTED_PUBLIC_API
    assert canonical.__all__ == public_api.__all__
    assert all(hasattr(canonical, name) for name in EXPECTED_PUBLIC_API)
