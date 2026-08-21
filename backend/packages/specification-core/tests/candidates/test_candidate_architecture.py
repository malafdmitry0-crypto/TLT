import ast
from pathlib import Path

CANDIDATE_ROOT = Path(__file__).parents[2] / "src" / "heatcalc_specification_core" / "candidates"
FORBIDDEN_ROOTS = {"app", "fastapi", "pydantic", "sqlalchemy"}


def test_candidate_modules_are_dependency_free_and_below_400_loc() -> None:
    violations: list[str] = []
    oversized: dict[str, int] = {}
    for path in sorted(CANDIDATE_ROOT.rglob("*.py")):
        lines = len(path.read_text(encoding="utf-8").splitlines())
        if lines > 400:
            oversized[path.name] = lines
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
    assert oversized == {}
