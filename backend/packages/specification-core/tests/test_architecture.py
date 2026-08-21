import ast
from pathlib import Path

PACKAGE_ROOT = Path(__file__).parents[1] / "src" / "heatcalc_specification_core"
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
MAX_MODULE_LINES = 400


def _forbidden_module(module: str) -> bool:
    parts = module.lower().split(".")
    return parts[0] in FORBIDDEN_ROOTS or bool(set(parts) & FORBIDDEN_PARTS)


def _import_violations(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    violations: list[str] = []
    relative = path.relative_to(PACKAGE_ROOT)
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if _forbidden_module(alias.name):
                    violations.append(f"{relative}:{node.lineno}: import {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            rendered = f"{'.' * node.level}{node.module or ''}"
            if node.level > 1:
                violations.append(f"{relative}:{node.lineno}: parent-relative import {rendered}")
            elif node.module and _forbidden_module(node.module):
                violations.append(f"{relative}:{node.lineno}: from {rendered} import")
    return violations


def _production_sources() -> list[Path]:
    return sorted(PACKAGE_ROOT.rglob("*.py"))


def test_core_has_no_application_framework_io_or_environment_imports() -> None:
    sources = _production_sources()

    assert sources, f"Expected Python sources under {PACKAGE_ROOT}"
    violations = [violation for path in sources for violation in _import_violations(path)]

    assert not violations, "Forbidden core imports:\n" + "\n".join(violations)


def test_core_modules_stay_focused() -> None:
    oversized = {
        str(path.relative_to(PACKAGE_ROOT)): len(path.read_text(encoding="utf-8").splitlines())
        for path in _production_sources()
        if len(path.read_text(encoding="utf-8").splitlines()) > MAX_MODULE_LINES
    }
    assert oversized == {}
