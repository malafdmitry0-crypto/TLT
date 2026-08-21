"""Ownership guards for the application → specification-core boundary."""

from __future__ import annotations

import ast
from pathlib import Path

SERVICES = Path(__file__).parents[3] / "services"


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
