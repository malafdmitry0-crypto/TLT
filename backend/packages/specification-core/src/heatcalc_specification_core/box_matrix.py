"""Catalog-row coercion and matrix evaluation for junction boxes."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any, cast

from heatcalc_specification_core.box_conditions import (
    row_conditions_match,
    validate_box_matrix_ex_r_gr,
)
from heatcalc_specification_core.box_quantity import (
    _DIAMETER_THRESHOLD_MM,
    calculate_box_quantity,
)
from heatcalc_specification_core.common import (
    require_positive_divider,
    to_non_negative_decimal,
    to_non_negative_int,
    to_positive_decimal,
)
from heatcalc_specification_core.types import (
    BOX_CONDITION_UNUSED,
    BoxMatrixInput,
    BoxMatrixResult,
    BoxPipeInput,
    BoxRoundingMode,
    BoxRowConditions,
    BoxRowInput,
    BoxRowMatch,
    FormulaInputError,
)


def _coerce_row(row: BoxRowInput | Mapping[str, Any], *, index: int) -> BoxRowInput:
    if isinstance(row, BoxRowInput):
        return row
    if not isinstance(row, Mapping):
        raise FormulaInputError(
            "INVALID_TYPE",
            f"rows[{index}]: expected BoxRowInput or mapping",
            field=f"rows[{index}]",
            value=row,
        )

    formula = (
        row.get("formula_parameters") if isinstance(row.get("formula_parameters"), Mapping) else {}
    )
    applicability = (
        row.get("applicability") if isinstance(row.get("applicability"), Mapping) else None
    )
    conditions_map = (
        applicability
        if applicability is not None
        else (row.get("conditions") if isinstance(row.get("conditions"), Mapping) else row)
    )
    divider = row.get("section_divider", formula.get("section_divider") if formula else None)
    if divider is None and "divider" in row:
        divider = row["divider"]
    rounding = (
        row.get("rounding_mode")
        or row.get("rounding")
        or (formula.get("rounding_mode") if formula else None)
        or (formula.get("rounding") if formula else None)
        or row.get("round")
    )
    min_quantity = row.get(
        "min_quantity",
        formula.get("min_quantity", 1) if formula else 1,
    )

    if not isinstance(conditions_map, Mapping):
        raise FormulaInputError(
            "INVALID_TYPE",
            f"rows[{index}].conditions: expected mapping",
            field=f"rows[{index}].conditions",
            value=conditions_map,
        )

    conditions = BoxRowConditions(
        d_ge_57=conditions_map.get("d_ge_57"),
        K1i=conditions_map.get("K1i"),
        K2i=conditions_map.get("K2i"),
        Kiu=conditions_map.get("Kiu"),
        L_sec_ge_L_K2i=conditions_map.get("L_sec_ge_L_K2i"),
        N_sec_ge_3=conditions_map.get("N_sec_ge_3"),
        Ex=conditions_map.get("Ex"),
        R_gr=conditions_map.get("R_gr"),
    )
    return BoxRowInput(
        section_divider=divider,
        rounding_mode=rounding if rounding is not None else BoxRoundingMode.UP,
        conditions=conditions,
        min_quantity=min_quantity,
        item_key=row.get("item_key"),
        mark=row.get("mark") or row.get("code"),
        nomenclature_code=row.get("nomenclature_code"),
    )


def evaluate_box_matrix(
    pipe: BoxPipeInput | Mapping[str, Any],
    rows: Sequence[BoxRowInput | Mapping[str, Any]],
    *,
    require_ex_r_gr_conditions: bool = True,
) -> BoxMatrixResult:
    """Match all approved box rows against one pipe; sum is caller's responsibility.

    When ``require_ex_r_gr_conditions`` is True (production default), every row
    must declare complete ``Ex`` and ``R_gr`` conditions or the calculator raises
    ``FormulaInputError`` with code ``SPEC_BOX_EX_RGR_MATRIX_MISSING``.
    """
    if isinstance(pipe, Mapping):
        pipe = BoxPipeInput(
            outer_diameter_mm=cast(Decimal | int | str | float, pipe.get("outer_diameter_mm")),
            section_count=cast(
                Decimal | int | str | float,
                pipe.get("section_count")
                if pipe.get("section_count") is not None
                else pipe.get("N_sec"),
            ),
            section_length_m=cast(
                Decimal | int | str | float,
                pipe.get("section_length_m")
                if pipe.get("section_length_m") is not None
                else pipe.get("L_sec"),
            ),
            k1i=bool(pipe.get("k1i", pipe.get("K1i", False))),
            k2i=bool(pipe.get("k2i", pipe.get("K2i", False))),
            kiu=bool(pipe.get("kiu", pipe.get("Kiu", False))),
            ex=bool(pipe.get("ex", pipe.get("Ex", False))),
            l_k2i_m=pipe.get("l_k2i_m", pipe.get("L_K2i_m", 0)),
            r_gr=pipe.get("r_gr", pipe.get("R_gr")),
        )

    diameter = to_non_negative_decimal(pipe.outer_diameter_mm, name="outer_diameter_mm")
    n_sec = to_non_negative_int(pipe.section_count, name="section_count")
    l_sec = to_non_negative_decimal(pipe.section_length_m, name="section_length_m")
    l_k2i = to_non_negative_decimal(pipe.l_k2i_m, name="l_k2i_m")
    d_flag = diameter >= _DIAMETER_THRESHOLD_MM

    coerced_rows = [_coerce_row(row, index=index) for index, row in enumerate(rows)]

    if require_ex_r_gr_conditions:
        validate_box_matrix_ex_r_gr(coerced_rows)

    matches: list[BoxRowMatch] = []
    for row in coerced_rows:
        if not row_conditions_match(
            row.conditions,
            outer_diameter_mm=diameter,
            section_count=n_sec,
            section_length_m=l_sec,
            k1i=bool(pipe.k1i),
            k2i=bool(pipe.k2i),
            kiu=bool(pipe.kiu),
            ex=bool(pipe.ex),
            l_k2i_m=l_k2i,
            r_gr=pipe.r_gr,
            require_ex_r_gr=False,  # already validated above when required
        ):
            continue

        qty = calculate_box_quantity(
            n_sec,
            row.section_divider,
            row.rounding_mode,
            min_quantity=row.min_quantity,
        )
        matches.append(
            BoxRowMatch(
                quantity=qty.quantity,
                raw=qty.raw,
                calculated=qty.calculated,
                section_divider=qty.section_divider,
                rounding_mode=qty.rounding_mode,
                min_quantity=qty.min_quantity,
                item_key=row.item_key,
                mark=row.mark,
                nomenclature_code=row.nomenclature_code,
            )
        )

    return BoxMatrixResult(
        matches=tuple(matches),
        d_ge_57=d_flag,
        section_count=n_sec,
        section_length_m=l_sec,
    )


def evaluate_box_matrix_from_input(inputs: BoxMatrixInput) -> BoxMatrixResult:
    return evaluate_box_matrix(
        inputs.pipe,
        inputs.rows,
        require_ex_r_gr_conditions=inputs.require_ex_r_gr_conditions,
    )


def box_row_from_catalog_parts(
    *,
    formula_parameters: Mapping[str, Any],
    applicability: Mapping[str, Any],
    item_key: str | None = None,
    mark: str | None = None,
    nomenclature_code: str | None = None,
) -> BoxRowInput:
    """Build a typed row from catalog ``formula_parameters`` + ``applicability``."""
    divider = formula_parameters.get("section_divider")
    if divider is None:
        raise FormulaInputError(
            "MISSING_VALUE",
            "section_divider: value is required",
            field="section_divider",
        )
    # Reject zero early with positive-decimal semantics used by catalog validation.
    require_positive_divider(divider, name="section_divider")
    # Keep Decimal form for quantity path; integer check is optional at calc layer.
    to_positive_decimal(divider, name="section_divider")

    rounding = formula_parameters.get("rounding_mode", formula_parameters.get("rounding"))
    if rounding is None:
        raise FormulaInputError(
            "MISSING_VALUE",
            "rounding_mode: value is required",
            field="rounding_mode",
        )
    min_quantity = formula_parameters.get("min_quantity", 1)

    conditions = BoxRowConditions(
        d_ge_57=applicability.get("d_ge_57", BOX_CONDITION_UNUSED),
        K1i=applicability.get("K1i", BOX_CONDITION_UNUSED),
        K2i=applicability.get("K2i", BOX_CONDITION_UNUSED),
        Kiu=applicability.get("Kiu", BOX_CONDITION_UNUSED),
        L_sec_ge_L_K2i=applicability.get("L_sec_ge_L_K2i", BOX_CONDITION_UNUSED),
        N_sec_ge_3=applicability.get("N_sec_ge_3", BOX_CONDITION_UNUSED),
        Ex=applicability.get("Ex"),
        R_gr=applicability.get("R_gr"),
    )
    return BoxRowInput(
        section_divider=divider,
        rounding_mode=rounding,
        conditions=conditions,
        min_quantity=min_quantity,
        item_key=item_key,
        mark=mark,
        nomenclature_code=nomenclature_code,
    )
