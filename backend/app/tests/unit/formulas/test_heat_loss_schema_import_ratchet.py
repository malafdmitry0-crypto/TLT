"""Production app code must import heat-loss schemas from their owner module."""

from __future__ import annotations

import ast
from pathlib import Path

BACKEND_APP = Path(__file__).resolve().parents[3]
CALCULATION_MODULE = "app.schemas.calculation"
SCHEMAS_PACKAGE = "app.schemas"
CALCULATION_PATH = BACKEND_APP / "schemas" / "calculation.py"
FORMULA_NAMES = frozenset(
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
HTTP_NAMES = frozenset(
    {
        "BatchCalcResponse",
        "HeatLossBatchJobRequest",
        "HeatLossRequest",
        "HeatLossResponse",
    }
)
HEAT_NAMES = FORMULA_NAMES | HTTP_NAMES
SKIP_PARTS = {"tests", "mutants", "__pycache__"}
FORMULA_OWNER_FILES = frozenset(
    {
        BACKEND_APP / "schemas" / "heat_loss.py",
    }
)
HTTP_COMPATIBILITY_FILES = frozenset(
    {
        CALCULATION_PATH,
        BACKEND_APP / "schemas" / "heat_loss.py",
        BACKEND_APP / "schemas" / "heat_loss_http.py",
    }
)


_NESTED_SCOPES = (
    ast.AsyncFunctionDef,
    ast.ClassDef,
    ast.DictComp,
    ast.FunctionDef,
    ast.GeneratorExp,
    ast.Lambda,
    ast.ListComp,
    ast.SetComp,
)


def _module_scope_nodes(tree: ast.AST) -> list[ast.AST]:
    found: list[ast.AST] = []
    pending = [tree]
    while pending:
        node = pending.pop()
        found.append(node)
        if node is not tree and isinstance(node, _NESTED_SCOPES):
            continue
        pending.extend(ast.iter_child_nodes(node))
    return found


def _formula_owner_violations(tree: ast.AST, label: str) -> list[str]:
    bindings: set[str] = set()
    imported_names: set[str] = set()
    for node in _module_scope_nodes(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store):
            bindings.add(node.id)
        elif isinstance(node, ast.Import):
            bindings.update(
                alias.asname or alias.name.split(".", maxsplit=1)[0] for alias in node.names
            )
        elif isinstance(node, ast.ImportFrom):
            if any(alias.name == "*" for alias in node.names):
                bindings.update(FORMULA_NAMES)
                imported_names.update(FORMULA_NAMES)
            bindings.update(alias.asname or alias.name for alias in node.names)
            imported_names.update(alias.name for alias in node.names)
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef | ast.ClassDef) or (
            isinstance(node, ast.ExceptHandler) and node.name is not None
        ):
            bindings.add(node.name)

    forbidden = FORMULA_NAMES & (bindings | imported_names)
    return [f"{label}: {name}" for name in sorted(forbidden)]


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


def _imports_calculation_module(node: ast.ImportFrom) -> bool:
    if node.module == CALCULATION_MODULE:
        return True
    return bool(
        node.level
        and node.module
        and (node.module == "calculation" or node.module.endswith(".calculation"))
    )


def _imports_schemas_package(node: ast.ImportFrom) -> bool:
    if node.module == SCHEMAS_PACKAGE:
        return True
    return bool(
        node.level
        and node.module
        and (node.module == "schemas" or node.module.endswith(".schemas"))
    )


def _calculation_module_references(tree: ast.AST) -> frozenset[str]:
    references: set[str] = {CALCULATION_MODULE}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name == CALCULATION_MODULE:
                    references.add(alias.asname or alias.name)
                elif alias.name == SCHEMAS_PACKAGE:
                    prefix = alias.asname or alias.name
                    references.add(f"{prefix}.calculation")
                elif alias.name == "app":
                    prefix = alias.asname or alias.name
                    references.add(f"{prefix}.schemas.calculation")
        elif isinstance(node, ast.ImportFrom):
            if _imports_schemas_package(node):
                for alias in node.names:
                    if alias.name == "calculation":
                        references.add(alias.asname or alias.name)
            elif node.level and node.module is None:
                for alias in node.names:
                    if alias.name == "calculation":
                        references.add(alias.asname or alias.name)
                    elif alias.name == "schemas":
                        prefix = alias.asname or alias.name
                        references.add(f"{prefix}.calculation")
            elif node.module == "app":
                for alias in node.names:
                    if alias.name == "schemas":
                        prefix = alias.asname or alias.name
                        references.add(f"{prefix}.calculation")
    return frozenset(references)


def _violations_in_tree(
    tree: ast.AST,
    label: str,
    forbidden_names: frozenset[str] = HEAT_NAMES,
) -> list[str]:
    found: list[str] = []
    calculation_references = _calculation_module_references(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and _imports_calculation_module(node):
            for alias in node.names:
                if alias.name == "*" or alias.name in forbidden_names:
                    found.append(f"{label}: {alias.name}")
        elif (
            isinstance(node, ast.Attribute)
            and node.attr in forbidden_names
            and (_dotted_name(node.value) or "") in calculation_references
        ):
            found.append(f"{label}: {_dotted_name(node)}")
    return found


def _forbidden_names_for(path: Path) -> frozenset[str]:
    forbidden: set[str] = set()
    if path not in FORMULA_OWNER_FILES:
        forbidden.update(FORMULA_NAMES)
    if path not in HTTP_COMPATIBILITY_FILES:
        forbidden.update(HTTP_NAMES)
    return frozenset(forbidden)


def _violations() -> list[str]:
    found: list[str] = []
    for path in BACKEND_APP.rglob("*.py"):
        if SKIP_PARTS & set(path.parts):
            continue
        forbidden_names = _forbidden_names_for(path)
        if not forbidden_names:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        label = str(path.relative_to(BACKEND_APP))
        if path == CALCULATION_PATH:
            found.extend(_formula_owner_violations(tree, label))
        found.extend(
            _violations_in_tree(
                tree,
                label,
                forbidden_names,
            )
        )
    return found


def test_production_does_not_import_heat_schemas_from_calculation() -> None:
    assert _violations() == []


def test_calculation_compatibility_module_exports_no_formula_models() -> None:
    tree = ast.parse(
        CALCULATION_PATH.read_text(encoding="utf-8"),
        filename=str(CALCULATION_PATH),
    )

    assert _forbidden_names_for(CALCULATION_PATH) == FORMULA_NAMES
    assert _formula_owner_violations(tree, "calculation.py") == []


def test_owner_ratchet_flags_formula_reexport_and_assignment() -> None:
    reexport = ast.parse(
        "from app.schemas.heat_loss import " "PipeHeatLossParams as PipeHeatLossParams\n"
    )
    assignment = ast.parse(
        "from app.schemas import heat_loss\n" "TankHeatLossResult = heat_loss.TankHeatLossResult\n"
    )

    assert _formula_owner_violations(reexport, "reexport") == ["reexport: PipeHeatLossParams"]
    assert _formula_owner_violations(assignment, "assignment") == ["assignment: TankHeatLossResult"]


def test_owner_ratchet_allows_http_compatibility_reexports() -> None:
    tree = ast.parse("from app.schemas.heat_loss import HeatLossRequest as HeatLossRequest\n")

    assert _formula_owner_violations(tree, "snippet") == []


def test_ratchet_flags_direct_formula_import() -> None:
    tree = ast.parse("from app.schemas.calculation import InsulationLayer as Layer\n")

    assert _violations_in_tree(tree, "snippet") == ["snippet: InsulationLayer"]


def test_ratchet_flags_full_module_attribute_access() -> None:
    tree = ast.parse(
        "import app.schemas.calculation\n" "_ = app.schemas.calculation.PipeHeatLossParams\n"
    )
    assert _violations_in_tree(tree, "snippet") == [
        "snippet: app.schemas.calculation.PipeHeatLossParams"
    ]


def test_ratchet_flags_from_schemas_import_calculation() -> None:
    tree = ast.parse("from app.schemas import calculation\n_ = calculation.TankHeatLossParams\n")
    assert _violations_in_tree(tree, "snippet") == ["snippet: calculation.TankHeatLossParams"]


def test_ratchet_flags_aliased_package_import() -> None:
    tree = ast.parse("from app.schemas import calculation as calc\n_ = calc.StoredPipeHeatParams\n")
    assert _violations_in_tree(tree, "snippet") == ["snippet: calc.StoredPipeHeatParams"]


def test_ratchet_flags_formula_models_via_relative_imports() -> None:
    direct = ast.parse("from ..schemas.calculation import PipeHeatLossResult\n")
    module = ast.parse("from ..schemas import calculation as calc\n_ = calc.TankHeatLossResult\n")

    assert _violations_in_tree(direct, "direct") == ["direct: PipeHeatLossResult"]
    assert _violations_in_tree(module, "module") == ["module: calc.TankHeatLossResult"]


def test_ratchet_flags_http_envelope_from_calculation() -> None:
    tree = ast.parse("from app.schemas.calculation import HeatLossRequest as Request\n")
    assert _violations_in_tree(tree, "snippet") == ["snippet: HeatLossRequest"]


def test_ratchet_flags_http_envelope_via_full_module_attribute() -> None:
    tree = ast.parse(
        "import app.schemas.calculation\n" "_ = app.schemas.calculation.HeatLossResponse\n"
    )
    assert _violations_in_tree(tree, "snippet") == [
        "snippet: app.schemas.calculation.HeatLossResponse"
    ]


def test_ratchet_flags_http_envelope_via_aliased_module() -> None:
    tree = ast.parse("import app.schemas.calculation as calc\n_ = calc.BatchCalcResponse\n")
    assert _violations_in_tree(tree, "snippet") == ["snippet: calc.BatchCalcResponse"]


def test_ratchet_flags_http_envelope_via_relative_imports() -> None:
    direct = ast.parse("from ..schemas.calculation import HeatLossBatchJobRequest\n")
    module = ast.parse("from ..schemas import calculation as calc\n_ = calc.HeatLossRequest\n")
    assert _violations_in_tree(direct, "direct") == ["direct: HeatLossBatchJobRequest"]
    assert _violations_in_tree(module, "module") == ["module: calc.HeatLossRequest"]


def test_ratchet_allows_heat_schemas_from_owner_module() -> None:
    tree = ast.parse(
        "from app.schemas.heat_loss import HeatLossRequest\n"
        "import app.schemas.heat_loss as heat_loss\n"
        "_ = heat_loss.HeatLossResponse\n"
    )
    assert _violations_in_tree(tree, "snippet") == []
