"""Architecture guard for the pure numeric heat-loss core."""

import ast
import importlib
from pathlib import Path

CORE_ROOT = (
    Path(__file__).parents[4] / "packages" / "heat-loss-core" / "src" / "heatcalc_heat_loss_core"
)
FORBIDDEN_ROOTS = {
    "app",
    "fastapi",
    "pydantic",
    "redis",
    "sqlalchemy",
}
FORBIDDEN_PARTS = {
    "config",
    "configs",
    "configuration",
    "database",
    "db",
    "fileinput",
    "glob",
    "io",
    "loader",
    "mmap",
    "model",
    "models",
    "os",
    "pathlib",
    "reference_data",
    "service",
    "services",
    "settings",
    "shutil",
    "tempfile",
}


def _forbidden_module(module: str) -> bool:
    parts = module.split(".")
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


def test_heat_loss_core_has_no_backend_or_filesystem_imports() -> None:
    sources = sorted(CORE_ROOT.rglob("*.py"))

    assert sources, f"Expected Python sources under {CORE_ROOT}"
    violations = [violation for source in sources for violation in _import_violations(source)]

    assert not violations, "Forbidden core imports:\n" + "\n".join(violations)


def test_heat_loss_core_import_smoke() -> None:
    core = importlib.import_module("heatcalc_heat_loss_core")

    assert core.FormulaDomainError.__module__ == "heatcalc_heat_loss_core.errors"
    assert core.FormulaValidationReport.__module__ == "heatcalc_heat_loss_core.validation"
    assert callable(core.validate_numeric_range)
    assert callable(core.validate_range_checks)
    assert callable(core.validate_sequence_length)
    assert callable(core.validate_insulation_layer_ranges)
    assert callable(core.validate_insulation_contract)
    assert callable(core.validate_insulation_basis_for_placement)
    assert callable(core.calculate_insulation_temperature)
    assert callable(core.validate_hot_side_temperature_in_interval)
    assert callable(core.validate_pipe_input_ranges)
    assert callable(core.validate_pipe_formula_domain)
    assert callable(core.validate_pipe_contract)
    assert callable(core.validate_tank_formula_domain)
    assert callable(core.validate_tank_contract)
    assert callable(core.validate_tank_shape)
    assert callable(core.validate_tank_input_ranges)
    assert callable(core.validate_temperature_in_interval)
    assert callable(core.validate_temperature_interval)
