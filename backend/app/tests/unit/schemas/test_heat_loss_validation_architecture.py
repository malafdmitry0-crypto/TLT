"""Architecture guards for the single heat-loss validation boundary."""

from __future__ import annotations

import ast
from pathlib import Path

SCHEMA_SOURCE = Path(__file__).resolve().parents[3] / "schemas" / "calculation.py"

RANGE_FIELDS_BY_MODEL = {
    "InsulationLayer": {
        "thickness",
        "conductivity",
    },
    "PipeHeatLossParams": {
        "outer_diameter",
        "wall_thickness",
        "pipe_lambda",
        "ambient_temperature",
        "process_temperature",
        "pipe_length",
        "pipe_centerline_depth",
        "num_local_elements",
        "local_element_equiv_length",
        "wind_speed",
        "ground_conductivity",
        "ground_temperature",
        "safety_factor",
    },
    "StoredPipeHeatParams": {"safety_factor"},
    "TankHeatLossParams": {
        "diameter",
        "height",
        "length",
        "width",
        "ambient_temperature",
        "ground_temperature",
        "process_temperature",
        "wall_thickness",
        "wall_lambda",
        "tank_buried_height",
        "ground_conductivity",
        "wind_speed",
        "safety_factor",
        "q_additional",
    },
}
NUMERIC_FIELD_RANGE_KEYWORDS = {"gt", "ge", "lt", "le", "multiple_of"}


def _classes(tree: ast.Module) -> dict[str, ast.ClassDef]:
    return {
        node.name: node
        for node in tree.body
        if isinstance(node, ast.ClassDef) and node.name in RANGE_FIELDS_BY_MODEL
    }


def _field_call(assignment: ast.AnnAssign) -> ast.Call | None:
    if not isinstance(assignment.value, ast.Call):
        return None
    function = assignment.value.func
    if isinstance(function, ast.Name) and function.id == "Field":
        return assignment.value
    return None


def test_heat_input_fields_do_not_reintroduce_pydantic_numeric_ranges() -> None:
    tree = ast.parse(SCHEMA_SOURCE.read_text(encoding="utf-8"), filename=str(SCHEMA_SOURCE))
    violations: list[str] = []

    for model_name, fields in RANGE_FIELDS_BY_MODEL.items():
        model = _classes(tree)[model_name]
        for statement in model.body:
            if not isinstance(statement, ast.AnnAssign) or not isinstance(
                statement.target, ast.Name
            ):
                continue
            field_name = statement.target.id
            if field_name not in fields:
                continue
            call = _field_call(statement)
            if call is None:
                continue
            forbidden = NUMERIC_FIELD_RANGE_KEYWORDS.intersection(
                keyword.arg for keyword in call.keywords if keyword.arg is not None
            )
            violations.extend(
                f"{model_name}.{field_name}: Field({keyword}=...)" for keyword in sorted(forbidden)
            )

    assert not violations, "Numeric validation must remain core-owned:\n" + "\n".join(violations)


def test_heat_input_layer_counts_do_not_reintroduce_pydantic_runtime_limits() -> None:
    tree = ast.parse(SCHEMA_SOURCE.read_text(encoding="utf-8"), filename=str(SCHEMA_SOURCE))
    violations: list[str] = []

    for model_name in ("PipeHeatLossParams", "TankHeatLossParams"):
        model = _classes(tree)[model_name]
        for statement in model.body:
            if not isinstance(statement, ast.AnnAssign) or not isinstance(
                statement.target, ast.Name
            ):
                continue
            if statement.target.id != "insulation_layers":
                continue
            call = _field_call(statement)
            if call is None:
                continue
            forbidden = {"min_length", "max_length"}.intersection(
                keyword.arg for keyword in call.keywords if keyword.arg is not None
            )
            violations.extend(
                f"{model_name}.insulation_layers: Field({keyword}=...)"
                for keyword in sorted(forbidden)
            )

    assert not violations, "Layer-count validation must remain core-owned:\n" + "\n".join(
        violations
    )
