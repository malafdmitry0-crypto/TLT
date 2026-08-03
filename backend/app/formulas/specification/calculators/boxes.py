"""Pure Decimal data-driven junction-box matrix calculator (SPEC-CANON-05 / §7.15).

For each pipe:
  d_ge_57 = outer_diameter_mm >= 57   (inclusive)
  N_sec   = total section count
  L_sec   = equal section length

For each approved matrix row, check ALL used conditions (``\"unused\"`` skipped).
Inclusive boundaries: d>=57, L_sec>=L_K2i_m, N_sec>=3.

  raw = N_sec / section_divider
  calculated = ceil(raw) if rounding up else floor(raw)
  quantity = max(calculated, min_quantity)   # boxes default min_quantity=1

Add ALL matching rows (not single-choice). ``section_divider`` must be > 0.

Production evaluation requires complete per-row ``Ex`` / ``R_gr`` conditions;
missing or incomplete values raise ``SPEC_BOX_EX_RGR_MATRIX_MISSING`` (do not invent).

No database, FastAPI, filesystem, or static JSON imports.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

from app.formulas.specification.calculators.common import (
    ceil_div,
    floor_div,
    require_positive_divider,
    to_non_negative_decimal,
    to_non_negative_int,
    to_positive_decimal,
)
from app.formulas.specification.calculators.types import (
    BOX_BOOLEAN_CONDITION_KEYS,
    BOX_CONDITION_UNUSED,
    BoxMatrixInput,
    BoxMatrixResult,
    BoxPipeInput,
    BoxQuantityResult,
    BoxRoundingMode,
    BoxRowConditions,
    BoxRowInput,
    BoxRowMatch,
    FormulaInputError,
)

# Stable code aligned with schema / catalog validation (fail-closed).
SPEC_BOX_EX_RGR_MATRIX_MISSING = "SPEC_BOX_EX_RGR_MATRIX_MISSING"

_DIAMETER_THRESHOLD_MM = Decimal("57")
_N_SEC_GE_THRESHOLD = 3


def compute_d_ge_57(outer_diameter_mm: Any) -> bool:
    """Inclusive diameter gate: outer_diameter_mm >= 57."""
    diameter = to_non_negative_decimal(outer_diameter_mm, name="outer_diameter_mm")
    return diameter >= _DIAMETER_THRESHOLD_MM


def normalize_box_rounding_mode(value: BoxRoundingMode | str | Any) -> BoxRoundingMode:
    """Normalize ``up`` / ``down`` (also accepts catalog ``rounding`` alias callers)."""
    if isinstance(value, BoxRoundingMode):
        return value
    if isinstance(value, bool) or value is None:
        raise FormulaInputError(
            "INVALID_ROUNDING_MODE",
            f"rounding_mode: expected 'up' or 'down' (got {value!r})",
            field="rounding_mode",
            value=value,
        )
    text = str(value).strip().lower()
    if text == BoxRoundingMode.UP.value:
        return BoxRoundingMode.UP
    if text == BoxRoundingMode.DOWN.value:
        return BoxRoundingMode.DOWN
    raise FormulaInputError(
        "INVALID_ROUNDING_MODE",
        f"rounding_mode: expected 'up' or 'down' (got {value!r})",
        field="rounding_mode",
        value=value,
    )


def calculate_box_quantity(
    section_count: Any,
    section_divider: Any,
    rounding: BoxRoundingMode | str,
    *,
    min_quantity: Any = 1,
) -> BoxQuantityResult:
    """raw=N_sec/divider → ceil|floor → max(calculated, min_quantity)."""
    n_sec = to_non_negative_int(section_count, name="section_count")
    divider = require_positive_divider(section_divider, name="section_divider")
    mode = normalize_box_rounding_mode(rounding)
    min_q = to_non_negative_int(min_quantity, name="min_quantity")

    raw = Decimal(n_sec) / divider
    if mode is BoxRoundingMode.UP:
        calculated = ceil_div(Decimal(n_sec), divider, divider_name="section_divider")
    else:
        calculated = floor_div(Decimal(n_sec), divider, divider_name="section_divider")

    quantity = max(calculated, min_q)
    return BoxQuantityResult(
        quantity=quantity,
        raw=raw,
        calculated=calculated,
        section_count=n_sec,
        section_divider=divider,
        rounding_mode=mode,
        min_quantity=min_q,
    )


def _is_unused(value: Any) -> bool:
    if value is BOX_CONDITION_UNUSED:
        return True
    if isinstance(value, str) and value.strip().lower() == BOX_CONDITION_UNUSED:
        return True
    return False


def _normalize_bool_condition(value: Any, *, field: str) -> bool | str:
    """Return True/False or BOX_CONDITION_UNUSED; reject other shapes."""
    if _is_unused(value):
        return BOX_CONDITION_UNUSED
    if isinstance(value, bool):
        return value
    raise FormulaInputError(
        "INVALID_BOX_CONDITION",
        f"{field}: expected true/false/'unused' (got {value!r})",
        field=field,
        value=value,
    )


def _validate_ex_condition(value: Any, *, field: str = "Ex") -> bool | str:
    if value is None:
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_Ex_condition_missing",
            field=field,
            value=value,
        )
    if _is_unused(value):
        return BOX_CONDITION_UNUSED
    if isinstance(value, bool):
        return value
    raise FormulaInputError(
        SPEC_BOX_EX_RGR_MATRIX_MISSING,
        "authoritative_Ex_condition_missing",
        field=field,
        value=value,
    )


def _validate_r_gr_condition(value: Any, *, field: str = "R_gr") -> Decimal | str:
    if value is None:
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_R_gr_condition_missing",
            field=field,
            value=value,
        )
    if _is_unused(value):
        return BOX_CONDITION_UNUSED
    try:
        # Non-negative Decimal (zero allowed); bool/NaN rejected via to_decimal.
        return to_non_negative_decimal(value, name=field)
    except FormulaInputError as exc:
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_R_gr_condition_missing",
            field=field,
            value=value,
            details={"cause": exc.code},
        ) from exc


def validate_box_row_ex_r_gr(conditions: BoxRowConditions | Mapping[str, Any]) -> None:
    """Fail-closed: production rows must declare complete Ex and R_gr conditions."""
    if isinstance(conditions, BoxRowConditions):
        ex_value = conditions.Ex
        r_gr_value = conditions.R_gr
    else:
        ex_value = conditions.get("Ex")
        r_gr_value = conditions.get("R_gr")
    _validate_ex_condition(ex_value)
    _validate_r_gr_condition(r_gr_value)


def validate_box_matrix_ex_r_gr(rows: Sequence[BoxRowInput | Mapping[str, Any]]) -> None:
    """Validate every production matrix row has authoritative Ex/R_gr conditions."""
    if not rows:
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_box_matrix_rows_missing",
            field="rows",
            value=rows,
        )
    for index, row in enumerate(rows):
        try:
            if isinstance(row, BoxRowInput):
                validate_box_row_ex_r_gr(row.conditions)
            elif isinstance(row, Mapping):
                applicability = row.get("applicability") or row.get("conditions") or row
                if not isinstance(applicability, Mapping):
                    raise FormulaInputError(
                        SPEC_BOX_EX_RGR_MATRIX_MISSING,
                        "authoritative_Ex_condition_missing",
                        field=f"rows[{index}].conditions",
                    )
                validate_box_row_ex_r_gr(applicability)
            else:
                raise FormulaInputError(
                    SPEC_BOX_EX_RGR_MATRIX_MISSING,
                    "authoritative_box_matrix_rows_missing",
                    field=f"rows[{index}]",
                    value=row,
                )
        except FormulaInputError as exc:
            if exc.code != SPEC_BOX_EX_RGR_MATRIX_MISSING:
                raise FormulaInputError(
                    SPEC_BOX_EX_RGR_MATRIX_MISSING,
                    exc.message,
                    field=exc.field or f"rows[{index}]",
                    value=exc.value,
                    details={"row_index": index, **(exc.details or {})},
                ) from exc
            details = dict(exc.details or {})
            details.setdefault("row_index", index)
            raise FormulaInputError(
                SPEC_BOX_EX_RGR_MATRIX_MISSING,
                exc.message,
                field=exc.field or f"rows[{index}]",
                value=exc.value,
                details=details,
            ) from exc


def _actual_flags(
    *,
    outer_diameter_mm: Decimal,
    section_count: int,
    section_length_m: Decimal,
    k1i: bool,
    k2i: bool,
    kiu: bool,
    ex: bool,
    l_k2i_m: Decimal,
) -> dict[str, bool]:
    return {
        "d_ge_57": outer_diameter_mm >= _DIAMETER_THRESHOLD_MM,
        "K1i": bool(k1i),
        "K2i": bool(k2i),
        "Kiu": bool(kiu),
        "L_sec_ge_L_K2i": section_length_m >= l_k2i_m,
        "N_sec_ge_3": section_count >= _N_SEC_GE_THRESHOLD,
        "Ex": bool(ex),
    }


def _condition_value(conditions: BoxRowConditions | Mapping[str, Any], key: str) -> Any:
    if isinstance(conditions, BoxRowConditions):
        return getattr(conditions, key)
    return conditions.get(key)


def row_conditions_match(
    conditions: BoxRowConditions | Mapping[str, Any],
    *,
    outer_diameter_mm: Any,
    section_count: Any,
    section_length_m: Any,
    k1i: bool,
    k2i: bool,
    kiu: bool,
    ex: bool,
    l_k2i_m: Any,
    r_gr: Any = None,
    require_ex_r_gr: bool = False,
) -> bool:
    """Return True if every *used* condition on the row matches pipe facts.

    ``unused`` is not checked. When ``require_ex_r_gr`` is True, missing Ex/R_gr
    raise ``SPEC_BOX_EX_RGR_MATRIX_MISSING`` instead of silently matching.
    """
    diameter = to_non_negative_decimal(outer_diameter_mm, name="outer_diameter_mm")
    n_sec = to_non_negative_int(section_count, name="section_count")
    l_sec = to_non_negative_decimal(section_length_m, name="section_length_m")
    l_k2i = to_non_negative_decimal(l_k2i_m, name="l_k2i_m")

    if require_ex_r_gr:
        validate_box_row_ex_r_gr(conditions)

    actual = _actual_flags(
        outer_diameter_mm=diameter,
        section_count=n_sec,
        section_length_m=l_sec,
        k1i=k1i,
        k2i=k2i,
        kiu=kiu,
        ex=ex,
        l_k2i_m=l_k2i,
    )

    for key in BOX_BOOLEAN_CONDITION_KEYS:
        raw = _condition_value(conditions, key)
        if raw is None or _is_unused(raw):
            continue
        required = _normalize_bool_condition(raw, field=key)
        if required is BOX_CONDITION_UNUSED:
            continue
        if bool(required) is not actual[key]:
            return False

    ex_raw = _condition_value(conditions, "Ex")
    if ex_raw is not None and not _is_unused(ex_raw):
        if require_ex_r_gr:
            ex_req = _validate_ex_condition(ex_raw)
        else:
            if not isinstance(ex_raw, bool):
                raise FormulaInputError(
                    "INVALID_BOX_CONDITION",
                    f"Ex: expected true/false/'unused' (got {ex_raw!r})",
                    field="Ex",
                    value=ex_raw,
                )
            ex_req = ex_raw
        if ex_req is not BOX_CONDITION_UNUSED and bool(ex_req) is not actual["Ex"]:
            return False

    r_gr_raw = _condition_value(conditions, "R_gr")
    if r_gr_raw is not None and not _is_unused(r_gr_raw):
        if require_ex_r_gr:
            required_r_gr = _validate_r_gr_condition(r_gr_raw)
        else:
            required_r_gr = to_non_negative_decimal(r_gr_raw, name="R_gr")
        if required_r_gr is not BOX_CONDITION_UNUSED:
            if r_gr is None:
                return False
            actual_r_gr = to_non_negative_decimal(r_gr, name="r_gr")
            if actual_r_gr != required_r_gr:
                return False

    return True


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

    formula = row.get("formula_parameters") if isinstance(row.get("formula_parameters"), Mapping) else {}
    applicability = row.get("applicability") if isinstance(row.get("applicability"), Mapping) else None
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
        d_ge_57=conditions_map.get("d_ge_57", BOX_CONDITION_UNUSED),
        K1i=conditions_map.get("K1i", BOX_CONDITION_UNUSED),
        K2i=conditions_map.get("K2i", BOX_CONDITION_UNUSED),
        Kiu=conditions_map.get("Kiu", BOX_CONDITION_UNUSED),
        L_sec_ge_L_K2i=conditions_map.get("L_sec_ge_L_K2i", BOX_CONDITION_UNUSED),
        N_sec_ge_3=conditions_map.get("N_sec_ge_3", BOX_CONDITION_UNUSED),
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
            outer_diameter_mm=pipe.get("outer_diameter_mm"),
            section_count=pipe.get("section_count") if pipe.get("section_count") is not None else pipe.get("N_sec"),
            section_length_m=(
                pipe.get("section_length_m")
                if pipe.get("section_length_m") is not None
                else pipe.get("L_sec")
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
