"""Architecture ratchet: no backend shim namespace for the heat-loss core."""

from __future__ import annotations

import ast
from pathlib import Path

import heatcalc_heat_loss_core as canonical
import heatcalc_heat_loss_core.api as public_api

BACKEND_ROOT = Path(__file__).resolve().parents[4]
SHIM_DIRECTORY = BACKEND_ROOT / "app" / "formulas" / "heat_loss" / "core"
FORBIDDEN_PREFIX = "app.formulas.heat_loss.core"
SCAN_SKIP_PARTS = {".git", "mutants", "__pycache__", ".venv", "dist", "build"}


def _is_forbidden_module(module: str | None) -> bool:
    if module is None:
        return False
    return module == FORBIDDEN_PREFIX or module.startswith(f"{FORBIDDEN_PREFIX}.")


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
            elif node.module == "app.formulas.heat_loss" and any(
                alias.name == "core" for alias in node.names
            ):
                violations.append(f"{source}: from app.formulas.heat_loss import core")
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


def test_executable_python_does_not_import_heat_loss_core_shim() -> None:
    sources = _executable_python_files()
    assert sources
    violations = [
        violation for source in sources for violation in _shim_import_violations(source)
    ]
    assert not violations, "Forbidden shim imports:\n" + "\n".join(violations)


def test_canonical_package_exposes_only_the_recommended_high_level_api() -> None:
    expected = {
        "AffineConductivity",
        "CASE_1_PROFILE",
        "ConductivityLaw",
        "ConstantConductivity",
        "FormulaDomainError",
        "FormulaValidationCode",
        "FormulaValidationIssue",
        "FormulaValidationReport",
        "HeatLossFormulaProfile",
        "InsulationTemperatureBasis",
        "PiecewiseConductivity",
        "UnavailableConductivity",
        "evaluate_conductivity",
        "PipePreparationInput",
        "PipePreparationLayer",
        "PipeFormulaResult",
        "PipeFormulaOutcome",
        "PipeLayerSource",
        "PipePlacement",
        "run_pipe_formula",
        "TankPreparationInput",
        "TankPreparationLayer",
        "TankFormulaResult",
        "TankFormulaOutcome",
        "TankLayerSource",
        "TankPlacement",
        "TankShape",
        "run_tank_formula",
        "validate_heat_loss_formula_profile",
    }

    assert set(canonical.__all__) == expected
    assert canonical.__all__ == public_api.__all__
    assert all(hasattr(canonical, name) for name in expected)


def test_removed_high_level_legacy_names_are_not_exposed() -> None:
    removed = {
        "evaluate_pipe",
        "evaluate_resolved_air_tank",
        "evaluate_resolved_buried_tank",
        "resolve_safety_factor",
        "PipeEvaluationInput",
        "ResolvedAirTankEvaluationInput",
        "ResolvedBuriedTankEvaluationInput",
    }

    assert removed.isdisjoint(canonical.__all__)
    assert all(not hasattr(canonical, name) for name in removed)
