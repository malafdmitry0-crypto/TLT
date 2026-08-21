import ast
from pathlib import Path

PACKAGE_ROOT = Path(__file__).parents[1] / "src" / "heatcalc_specification_core"
FORBIDDEN_ROOTS = {"app", "fastapi", "pydantic", "sqlalchemy"}
MAX_MODULE_LINES = 400


def test_core_has_no_application_or_framework_imports() -> None:
    violations: list[str] = []
    for path in sorted(PACKAGE_ROOT.glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            names: list[str] = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            for name in names:
                if name.split(".", 1)[0] in FORBIDDEN_ROOTS:
                    violations.append(f"{path.name}:{getattr(node, 'lineno', 0)}: {name}")
    assert violations == []


def test_core_modules_stay_focused() -> None:
    oversized = {
        path.name: len(path.read_text(encoding="utf-8").splitlines())
        for path in sorted(PACKAGE_ROOT.glob("*.py"))
        if len(path.read_text(encoding="utf-8").splitlines()) > MAX_MODULE_LINES
    }
    assert oversized == {}
