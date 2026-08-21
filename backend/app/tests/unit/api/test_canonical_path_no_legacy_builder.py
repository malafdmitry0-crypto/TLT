"""Repo lock: legacy specification builders are absent and not imported."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

_APP_ROOT = Path(__file__).resolve().parents[3]

_LEGACY_FILES = (
    "formulas/specification/builder.py",
    "formulas/specification/full_builder.py",
    "formulas/specification/source_mapping.py",
)

_LEGACY_REFERENCE_DATA = (
    "reference_data/spec_accessories.json",
    "reference_data/box_ex_rgr_matrix.json",
    "reference_data/spec_source_mapping.json",
)

_FORBIDDEN_PREFIXES = (
    "app.formulas.specification.full_builder",
    "app.formulas.specification.builder",
    "app.formulas.specification.source_mapping",
)

_FORBIDDEN_NAMES = frozenset(
    {
        "build_full_specification_detailed",
        "build_basic_specification",
        "full_builder",
        "build_full_specification",
        "list_box_ex_rgr_matrix_rows",
        "list_spec_accessory_rules",
        "box_ex_rgr_matrix_registered",
        "is_rule_approved",
    }
)


def _python_files_under(*relative_parts: str) -> list[Path]:
    root = _APP_ROOT.joinpath(*relative_parts)
    assert root.exists(), f"missing production tree: {root}"
    if root.is_file():
        return [root]
    return sorted(
        path
        for path in root.rglob("*.py")
        if path.is_file() and path.name != "__pycache__"
    )


def _imported_modules(path: Path) -> list[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            names.append(node.module or "")
    return names


def _assert_no_legacy_builder_imports(path: Path) -> None:
    for name in _imported_modules(path):
        for prefix in _FORBIDDEN_PREFIXES:
            assert not (name == prefix or name.startswith(prefix + ".")), (
                f"{path.relative_to(_APP_ROOT)} imports forbidden module {name!r}"
            )

    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                assert alias.name not in _FORBIDDEN_NAMES, (
                    f"{path.relative_to(_APP_ROOT)} imports forbidden symbol "
                    f"{alias.name!r} from {node.module!r}"
                )


def test_legacy_builder_files_are_physically_absent() -> None:
    for relative in _LEGACY_FILES:
        path = _APP_ROOT / relative
        assert not path.exists(), f"legacy file still present: {relative}"


def test_legacy_static_spec_json_is_not_shipped_as_runtime_data() -> None:
    for relative in _LEGACY_REFERENCE_DATA:
        path = _APP_ROOT / relative
        assert not path.exists(), f"legacy provisional JSON still present: {relative}"


@pytest.mark.parametrize(
    "path",
    _python_files_under("api")
    + _python_files_under("services")
    + _python_files_under("formulas", "specification"),
    ids=lambda p: str(p.relative_to(_APP_ROOT)),
)
def test_production_modules_do_not_import_legacy_builders(path: Path) -> None:
    _assert_no_legacy_builder_imports(path)


def test_generation_service_uses_bom_materializer_not_legacy_service_generate() -> None:
    path = _APP_ROOT / "services" / "specification_generation_service.py"
    source = path.read_text(encoding="utf-8")
    assert "materialize_specification_bom" in source
    assert "SpecificationService(self.db).generate" not in source
    assert "generate_for_electrical_variants" not in source
    assert "build_full_specification_detailed" not in source
    assert "build_basic_specification" not in source


def test_api_generate_route_calls_generation_service_only() -> None:
    path = _APP_ROOT / "api" / "v1" / "specifications.py"
    source = path.read_text(encoding="utf-8")
    assert "SpecificationGenerationService" in source
    assert "SpecificationGenerationRequest" in source
    assert "SpecificationService(db).generate" not in source
    assert "generate_for_electrical_variants" not in source
    assert "SpecificationGenerateRequest" not in source
    assert "full_builder" not in source


def test_specification_repository_has_no_legacy_generation_surface() -> None:
    path = _APP_ROOT / "services" / "specification_service.py"
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source, filename=str(path))
    service = next(
        node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name == "SpecificationService"
    )
    method_names = {
        node.name
        for node in service.body
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }
    assert not {
        "generate",
        "generate_for_electrical_variants",
        "preflight_variant",
        "preflight_for_electrical_variants",
    } & method_names


def test_loader_has_no_spec_accessories_runtime_entry() -> None:
    path = _APP_ROOT / "reference_data" / "loader.py"
    source = path.read_text(encoding="utf-8")
    assert "list_spec_accessory_rules" not in source
    assert "spec_accessories.json" not in source
