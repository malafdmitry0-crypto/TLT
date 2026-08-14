"""Production app code must import formula models from app.schemas.heat_loss."""

from __future__ import annotations

import ast
from pathlib import Path

BACKEND_APP = Path(__file__).resolve().parents[3]
CALCULATION_MODULE = "app.schemas.calculation"
SCHEMAS_PACKAGE = "app.schemas"
HEAT_NAMES = frozenset(
    {
        "InsulationLayer",
        "InsulationLayerApplied",
        "PipeHeatLossParams",
        "StoredPipeHeatParams",
        "PipeHeatLossResult",
        "TankHeatLossParams",
        "StoredTankHeatParams",
        "TankHeatLossResult",
    }
)
SKIP_PARTS = {"tests", "mutants", "__pycache__"}
ALLOWED_FILES = frozenset(
    {
        BACKEND_APP / "schemas" / "calculation.py",
        BACKEND_APP / "schemas" / "heat_loss.py",
    }
)


def _dotted_name(node: ast.AST) -> str | None:
    parts: list[str] = []
    current: ast.AST = node
    while True:
        if isinstance(current, ast.Name):
            parts.append(current.id)
            parts.reverse()
            return ".".join(parts)
        if isinstance(current, ast.Attribute):
            parts.append(current.attr)
            current = current.value
            continue
        return None


def _calculation_module_aliases(tree: ast.AST) -> frozenset[str]:
    aliases: set[str] = {CALCULATION_MODULE}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == CALCULATION_MODULE:
                    aliases.add(alias.asname or alias.name.rsplit(".", maxsplit=1)[-1])
        elif isinstance(node, ast.ImportFrom) and node.module == SCHEMAS_PACKAGE:
            for alias in node.names:
                if alias.name == "calculation":
                    aliases.add(alias.asname or alias.name)
    return frozenset(aliases)


def _violations_in_tree(tree: ast.AST, label: str) -> list[str]:
    found: list[str] = []
    calc_aliases = _calculation_module_aliases(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == CALCULATION_MODULE:
            for alias in node.names:
                if alias.name in HEAT_NAMES:
                    found.append(f"{label}: {alias.name}")
        elif (
            isinstance(node, ast.Attribute)
            and node.attr in HEAT_NAMES
            and (_dotted_name(node.value) or "") in calc_aliases
        ):
            found.append(f"{label}: {_dotted_name(node)}")
    return found


def _violations() -> list[str]:
    found: list[str] = []
    for path in BACKEND_APP.rglob("*.py"):
        if SKIP_PARTS & set(path.parts):
            continue
        if path in ALLOWED_FILES:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        found.extend(_violations_in_tree(tree, str(path.relative_to(BACKEND_APP))))
    return found


def test_production_does_not_import_formula_models_from_calculation() -> None:
    assert _violations() == []


def test_ratchet_flags_full_module_attribute_access() -> None:
    tree = ast.parse(
        "import app.schemas.calculation\n"
        "_ = app.schemas.calculation.PipeHeatLossParams\n"
    )
    assert _violations_in_tree(tree, "snippet") == [
        "snippet: app.schemas.calculation.PipeHeatLossParams"
    ]


def test_ratchet_flags_from_schemas_import_calculation() -> None:
    tree = ast.parse(
        "from app.schemas import calculation\n_ = calculation.TankHeatLossParams\n"
    )
    assert _violations_in_tree(tree, "snippet") == [
        "snippet: calculation.TankHeatLossParams"
    ]


def test_ratchet_flags_aliased_package_import() -> None:
    tree = ast.parse(
        "from app.schemas import calculation as calc\n_ = calc.StoredPipeHeatParams\n"
    )
    assert _violations_in_tree(tree, "snippet") == ["snippet: calc.StoredPipeHeatParams"]


def test_ratchet_allows_api_wrappers_from_calculation() -> None:
    tree = ast.parse("from app.schemas.calculation import HeatLossRequest\n")
    assert _violations_in_tree(tree, "snippet") == []
