"""Ownership guards for the application → specification-core boundary."""

from __future__ import annotations

import ast
from pathlib import Path

SERVICES = Path(__file__).parents[3] / "services"
PUBLIC_USE_CASES = {
    "specification_preflight_rules.py": "prepare_specification",
    "specification_candidate_service.py": "build_candidate_groups",
    "specification_bom_builder.py": "run_specification",
}


def _called_names(filename: str) -> list[str]:
    tree = ast.parse((SERVICES / filename).read_text(encoding="utf-8"))
    return [
        node.func.id
        for node in ast.walk(tree)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
    ]


def test_each_application_adapter_calls_its_canonical_core_once() -> None:
    expected = {
        "specification_preflight_rules.py": "prepare_specification",
        "specification_candidate_service.py": "build_core_candidate_groups",
        "specification_bom_builder.py": "run_specification",
    }
    for filename, entrypoint in expected.items():
        assert _called_names(filename).count(entrypoint) == 1


def test_application_adapters_import_use_cases_only_from_public_core_api() -> None:
    violations: list[str] = []
    for filename, entrypoint in PUBLIC_USE_CASES.items():
        tree = ast.parse((SERVICES / filename).read_text(encoding="utf-8"))
        imports = [
            node
            for node in ast.walk(tree)
            if isinstance(node, ast.ImportFrom)
            and any(alias.name == entrypoint for alias in node.names)
        ]
        if len(imports) != 1 or imports[0].module != "heatcalc_specification_core":
            rendered = [node.module for node in imports]
            violations.append(f"{filename}: {entrypoint} imported from {rendered}")

    assert not violations, "Non-public specification-core use-case imports:\n" + "\n".join(
        violations
    )


def test_removed_preflight_compatibility_surface_stays_removed() -> None:
    path = SERVICES / "specification_preflight_rules.py"
    source = path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    definitions = {
        node.name
        for node in ast.walk(tree)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
    }

    assert "canonical_fingerprint" not in definitions
    assert "legacy-preflight-adapter" not in source


def test_application_adapters_do_not_own_duplicate_formula_or_gate_functions() -> None:
    forbidden_definitions = {
        "specification_preflight_rules.py": {
            "_assignment_diagnostics",
            "_catalog_diagnostics",
            "_section_plan_issue",
        },
        "specification_candidate_service.py": {
            "_filter_candidates",
            "_resolve_selection",
            "_conditions_for_categories",
        },
        "specification_bom_builder.py": {
            "_build_er_aggregated_items",
            "_build_cable_items",
            "_build_accessory_and_box_items",
            "_build_snapshot",
        },
    }
    for filename, forbidden in forbidden_definitions.items():
        tree = ast.parse((SERVICES / filename).read_text(encoding="utf-8"))
        definitions = {
            node.name
            for node in ast.walk(tree)
            if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        }
        assert definitions.isdisjoint(forbidden)
