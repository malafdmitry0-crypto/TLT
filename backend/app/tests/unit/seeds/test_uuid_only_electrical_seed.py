"""Architecture contract for fresh-install-only electrical seeds."""

import ast
from pathlib import Path

SEEDS_ROOT = Path(__file__).resolve().parents[3] / "seeds"
ELECTRICAL_SEED = SEEDS_ROOT / "demo" / "electrical.py"
FORBIDDEN_IDENTITY_NAMES = {"legacy_variant_number", "variant_number"}


def test_production_seed_code_has_no_legacy_electrical_identity() -> None:
    violations: list[str] = []
    for path in sorted(SEEDS_ROOT.rglob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Name) and node.id in FORBIDDEN_IDENTITY_NAMES:
                violations.append(f"{path.relative_to(SEEDS_ROOT)}:{node.lineno}:{node.id}")
            if isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_IDENTITY_NAMES:
                violations.append(f"{path.relative_to(SEEDS_ROOT)}:{node.lineno}:{node.attr}")
            if isinstance(node, ast.keyword) and node.arg in FORBIDDEN_IDENTITY_NAMES:
                violations.append(f"{path.relative_to(SEEDS_ROOT)}:{node.lineno}:{node.arg}")
            if isinstance(node, ast.Constant) and node.value in FORBIDDEN_IDENTITY_NAMES:
                violations.append(f"{path.relative_to(SEEDS_ROOT)}:{node.lineno}:{node.value}")

    assert violations == []


def test_electrical_seed_graph_uses_initialized_uuid_for_every_boundary() -> None:
    source = ELECTRICAL_SEED.read_text(encoding="utf-8")

    assert "variant_id = initialization.variant.id" in source
    assert "electrical_variant_id=variant_id" in source
    assert source.count("project.id,\n            variant_id,") == 3
    assert "range(1, 5)" not in source
    assert "range(1, 4)" not in source
