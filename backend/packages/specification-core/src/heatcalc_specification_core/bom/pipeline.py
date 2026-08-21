"""Canonical dependency-free specification BOM execution pipeline."""

from __future__ import annotations

from collections.abc import Sequence

from heatcalc_specification_core.bom.boxes import build_box_items
from heatcalc_specification_core.bom.cable import build_cable_items
from heatcalc_specification_core.bom.contracts import (
    BlockingBomError,
    DiagnosticKind,
    GenerationFailure,
    GenerationInput,
    GenerationOutcome,
    GenerationSuccess,
    SpecificationContribution,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.bom.grouping import apply_grouping
from heatcalc_specification_core.bom.kits import build_kit_items
from heatcalc_specification_core.bom.selections import resolve_selected_items
from heatcalc_specification_core.bom.snapshot import build_snapshot
from heatcalc_specification_core.bom.tapes import build_tape_items
from heatcalc_specification_core.box_quantity import SPEC_BOX_EX_RGR_MATRIX_MISSING
from heatcalc_specification_core.types import FormulaInputError


def run_specification(inputs: GenerationInput) -> GenerationOutcome:
    """Generate all-or-nothing auto BOM rows and a deterministic snapshot."""
    items_by_id = {item.id: item for item in inputs.catalog.items}
    selected = resolve_selected_items(
        inputs.candidate_groups,
        items_by_id,
        inputs.electrical_variant_id,
    )
    if isinstance(selected, GenerationFailure):
        return selected

    identity = inputs.catalog.identity
    presentation_section = _presentation_section(inputs.contributions)
    try:
        items = build_cable_items(
            electrical_variant_id=inputs.electrical_variant_id,
            contributions=inputs.contributions,
            catalog_id=identity.id,
            catalog_version=identity.version,
            selected=selected,
        )
        items.extend(
            build_kit_items(
                electrical_variant_id=inputs.electrical_variant_id,
                object_type_section=presentation_section,
                contributions=inputs.contributions,
                catalog_id=identity.id,
                catalog_version=identity.version,
                selected=selected,
            )
        )
        items.extend(
            build_tape_items(
                electrical_variant_id=inputs.electrical_variant_id,
                object_type_section=presentation_section,
                contributions=inputs.contributions,
                catalog_id=identity.id,
                catalog_version=identity.version,
                selected=selected,
            )
        )
        items.extend(
            build_box_items(
                electrical_variant_id=inputs.electrical_variant_id,
                contributions=inputs.contributions,
                catalog_items=inputs.catalog.items,
                catalog_id=identity.id,
                catalog_version=identity.version,
                options=inputs.options,
            )
        )
        grouped = apply_grouping(
            items,
            grouping_mode=inputs.options.grouping_mode,
            electrical_variant_id=inputs.electrical_variant_id,
            catalog_id=identity.id,
            catalog_version=identity.version,
        )
    except BlockingBomError as exc:
        return GenerationFailure(exc.diagnostics)
    except FormulaInputError as exc:
        code = (
            "SPEC_BOX_EX_RGR_MATRIX_MISSING"
            if exc.code == SPEC_BOX_EX_RGR_MATRIX_MISSING
            else "SPEC_FORMULA_INPUT_INVALID"
        )
        return GenerationFailure(
            (
                SpecificationDiagnostic(
                    code=code,
                    kind=DiagnosticKind.BLOCKING,
                    message=exc.message,
                    issues=(exc.as_dict(),),
                    details={"electrical_variant_id": str(inputs.electrical_variant_id)},
                ),
            )
        )

    snapshot = build_snapshot(inputs, selected=selected)
    return GenerationSuccess(items=grouped, snapshot=snapshot)


def _presentation_section(contributions: Sequence[SpecificationContribution]) -> str:
    sections = {
        str(getattr(row.object_type_section, "value", row.object_type_section))
        for row in contributions
    }
    return next(iter(sections)) if len(sections) == 1 else "common"
