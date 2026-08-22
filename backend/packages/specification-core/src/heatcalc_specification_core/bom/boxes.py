"""Junction-box matrix materialization and per-pipe SKU aggregation."""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal
from uuid import UUID

from heatcalc_specification_core.bom.contracts import (
    BlockingBomError,
    BomItem,
    CatalogItem,
    DiagnosticKind,
    ObjectTypeSection,
    ResolvedOptions,
    SpecificationContribution,
    SpecificationDiagnostic,
)
from heatcalc_specification_core.bom.rows import FORMULA_FINGERPRINTS, item_from_catalog
from heatcalc_specification_core.box_conditions import (
    row_conditions_match,
    validate_box_matrix_ex_r_gr,
    validate_box_row_ex_r_gr,
)
from heatcalc_specification_core.box_matrix import (
    box_row_from_catalog_parts,
    evaluate_box_matrix,
    evaluate_box_matrix_from_input,
)
from heatcalc_specification_core.box_quantity import (
    SPEC_BOX_EX_RGR_MATRIX_MISSING,
    calculate_box_quantity,
    compute_d_ge_57,
    normalize_box_rounding_mode,
)
from heatcalc_specification_core.types import BoxPipeInput, BoxRowInput, FormulaInputError

__all__ = [
    "SPEC_BOX_EX_RGR_MATRIX_MISSING",
    "box_row_from_catalog_parts",
    "build_box_items",
    "calculate_box_quantity",
    "compute_d_ge_57",
    "evaluate_box_matrix",
    "evaluate_box_matrix_from_input",
    "normalize_box_rounding_mode",
    "row_conditions_match",
    "validate_box_matrix_ex_r_gr",
    "validate_box_row_ex_r_gr",
]


def build_box_items(
    *,
    electrical_variant_id: UUID,
    contributions: Sequence[SpecificationContribution],
    catalog_items: Sequence[CatalogItem],
    catalog_id: UUID,
    catalog_version: str,
    options: ResolvedOptions,
) -> list[BomItem]:
    box_items = [item for item in catalog_items if item.category == "box"]
    pipe_rows = [
        row
        for row in contributions
        if str(getattr(row.object_type_section, "value", row.object_type_section))
        == ObjectTypeSection.PIPE.value
    ]
    if not box_items or not pipe_rows:
        return []

    try:
        matrix_rows = tuple(_box_row(item) for item in box_items)
    except FormulaInputError as exc:
        raise _matrix_error(exc) from exc

    by_key = {item.item_key: item for item in box_items}
    by_code = {item.nomenclature_code: item for item in box_items}
    quantities: dict[UUID, tuple[CatalogItem, int]] = {}

    for row in pipe_rows:
        if row.outer_diameter_mm is None:
            raise BlockingBomError(
                (
                    SpecificationDiagnostic(
                        code="SPEC_FORMULA_INPUT_INVALID",
                        kind=DiagnosticKind.BLOCKING,
                        message="Не задан наружный диаметр трубопровода",
                        issues=(
                            {
                                "reason": "outer_diameter_missing",
                                "object_id": str(row.object_id),
                            },
                        ),
                    ),
                )
            )
        pipe = BoxPipeInput(
            outer_diameter_mm=row.outer_diameter_mm,
            section_count=row.section_count,
            section_length_m=row.section_length_m,
            k1i=options.k1i,
            k2i=options.k2i,
            kiu=options.kiu,
            ex=options.ex,
            l_k2i_m=options.l_k2i_m,
            r_gr=options.r_gr,
        )
        try:
            result = evaluate_box_matrix(
                pipe,
                matrix_rows,
                require_ex_r_gr_conditions=True,
            )
        except FormulaInputError as exc:
            raise _matrix_error(exc) from exc
        for match in result.matches:
            if match.quantity <= 0:
                continue
            item = None
            if match.item_key is not None:
                item = by_key.get(match.item_key)
            if item is None and match.nomenclature_code is not None:
                item = by_code.get(match.nomenclature_code)
            if item is None:
                raise BlockingBomError(
                    (
                        SpecificationDiagnostic(
                            code="SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                            kind=DiagnosticKind.BLOCKING,
                            message="Строка матрицы коробок не разрешена в каталоге",
                            issues=(
                                {
                                    "reason": "box_matrix_item_not_in_catalog",
                                    "item_key": match.item_key,
                                    "nomenclature_code": match.nomenclature_code,
                                },
                            ),
                        ),
                    )
                )
            previous = quantities.get(item.id)
            quantities[item.id] = (
                item,
                match.quantity + (previous[1] if previous is not None else 0),
            )

    return [
        item_from_catalog(
            item,
            quantity=Decimal(quantity),
            catalog_id=catalog_id,
            catalog_version=catalog_version,
            electrical_variant_id=electrical_variant_id,
            object_type_section=ObjectTypeSection.PIPE.value,
            extra_params={
                "formula_id": FORMULA_FINGERPRINTS["box"],
                "aggregation": "per_pipe_then_sum_code",
            },
        )
        for item, quantity in sorted(
            quantities.values(), key=lambda pair: pair[0].nomenclature_code
        )
    ]


def _matrix_error(exc: FormulaInputError) -> BlockingBomError:
    if exc.code == SPEC_BOX_EX_RGR_MATRIX_MISSING:
        return BlockingBomError(
            (
                SpecificationDiagnostic(
                    code="SPEC_BOX_EX_RGR_MATRIX_MISSING",
                    kind=DiagnosticKind.BLOCKING,
                    message=(
                        "Матрица коробок без полных условий Ex/R_gr; " "частичный BOM запрещён"
                    ),
                    issues=(exc.as_dict(),),
                ),
            )
        )
    return BlockingBomError(
        (
            SpecificationDiagnostic(
                code="SPEC_FORMULA_INPUT_INVALID",
                kind=DiagnosticKind.BLOCKING,
                message=exc.message,
                issues=(exc.as_dict(),),
            ),
        )
    )


def _box_row(item: CatalogItem) -> BoxRowInput:
    if item.parameters.box_row is None:
        raise FormulaInputError(
            "MISSING_VALUE",
            "box catalog item has no typed matrix row",
            field="box_row",
        )
    return item.parameters.box_row
