"""Applicability validation and matching for junction-box catalog rows."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from decimal import Decimal
from typing import Any

from heatcalc_specification_core.box_quantity import (
    _DIAMETER_THRESHOLD_MM,
    _N_SEC_GE_THRESHOLD,
    SPEC_BOX_EX_RGR_MATRIX_MISSING,
)
from heatcalc_specification_core.catalog.condition_contracts import ConditionKind
from heatcalc_specification_core.catalog.conditions import evaluate_condition_for_match
from heatcalc_specification_core.common import (
    to_non_negative_decimal,
    to_non_negative_int,
)
from heatcalc_specification_core.types import (
    BOX_BOOLEAN_CONDITION_KEYS,
    BOX_CONDITION_UNUSED,
    BoxRowConditions,
    BoxRowInput,
    FormulaInputError,
)


def _is_legacy_unused(value: Any) -> bool:
    if value is BOX_CONDITION_UNUSED:
        return True
    return isinstance(value, str) and value.strip().lower() == BOX_CONDITION_UNUSED


def _reject_legacy_unused(value: Any, *, field: str, production: bool) -> None:
    if _is_legacy_unused(value):
        code = SPEC_BOX_EX_RGR_MATRIX_MISSING if production else "INVALID_BOX_CONDITION"
        raise FormulaInputError(
            code,
            "legacy_unused_condition_rejected",
            field=field,
            value=value,
        )


def _validate_ex_condition(value: Any, *, field: str = "Ex") -> None:
    if value is None:
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_Ex_condition_missing",
            field=field,
            value=value,
        )
    _reject_legacy_unused(value, field=field, production=True)
    if isinstance(value, bool):
        # Bare bool is incomplete under SPEC-FINAL-02; require discriminated object.
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_Ex_condition_missing",
            field=field,
            value=value,
        )
    if not isinstance(value, Mapping) or value.get("mode") not in {
        "match",
        "not_applicable",
    }:
        if isinstance(value, Mapping) and value.get("mode") == "unresolved":
            raise FormulaInputError(
                SPEC_BOX_EX_RGR_MATRIX_MISSING,
                "condition_unresolved",
                field=field,
                value=value,
            )
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_Ex_condition_missing",
            field=field,
            value=value,
        )
    if value.get("mode") == "match" and (
        value.get("operator") != "eq" or value.get("value") not in (True, False)
    ):
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_Ex_condition_missing",
            field=field,
            value=value,
        )


def _validate_r_gr_condition(value: Any, *, field: str = "R_gr") -> None:
    if value is None:
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_R_gr_condition_missing",
            field=field,
            value=value,
        )
    _reject_legacy_unused(value, field=field, production=True)
    if not isinstance(value, Mapping) or value.get("mode") not in {
        "match",
        "not_applicable",
    }:
        if isinstance(value, Mapping) and value.get("mode") == "unresolved":
            raise FormulaInputError(
                SPEC_BOX_EX_RGR_MATRIX_MISSING,
                "condition_unresolved",
                field=field,
                value=value,
            )
        raise FormulaInputError(
            SPEC_BOX_EX_RGR_MATRIX_MISSING,
            "authoritative_R_gr_condition_missing",
            field=field,
            value=value,
        )
    if value.get("mode") == "match":
        try:
            to_non_negative_decimal(value.get("value"), name=field)
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

    ``mode=not_applicable`` is not checked. Scalar ``\"unused\"`` is always rejected.
    When ``require_ex_r_gr`` is True, missing Ex/R_gr raise
    ``SPEC_BOX_EX_RGR_MATRIX_MISSING`` instead of silently matching.
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

    def _eval(
        raw: Any,
        *,
        field: str,
        kind: ConditionKind,
        actual_bool: bool | None = None,
    ) -> bool:
        if raw is None:
            return True
        _reject_legacy_unused(
            raw, field=field, production=require_ex_r_gr or field in {"Ex", "R_gr"}
        )
        # Bare bool still accepted only for non-production bool flags in unit fixtures.
        if isinstance(raw, bool) and kind == "bool":
            return raw is actual_bool
        try:
            if kind == "r_gr":
                actual_decimal = (
                    None if r_gr is None else to_non_negative_decimal(r_gr, name="r_gr")
                )
                outcome = evaluate_condition_for_match(
                    raw,
                    actual_decimal=actual_decimal,
                    kind="r_gr",
                )
            else:
                outcome = evaluate_condition_for_match(
                    raw,
                    actual_bool=actual_bool,
                    kind=kind,
                )
        except ValueError as exc:
            code = (
                SPEC_BOX_EX_RGR_MATRIX_MISSING
                if field in {"Ex", "R_gr"} or require_ex_r_gr
                else "INVALID_BOX_CONDITION"
            )
            raise FormulaInputError(
                code,
                str(exc),
                field=field,
                value=raw,
            ) from exc
        if outcome is None:
            return True
        return bool(outcome)

    for key in BOX_BOOLEAN_CONDITION_KEYS:
        raw = _condition_value(conditions, key)
        if not _eval(raw, field=key, kind="bool", actual_bool=actual[key]):
            return False

    ex_raw = _condition_value(conditions, "Ex")
    if (ex_raw is not None or require_ex_r_gr) and not _eval(
        ex_raw, field="Ex", kind="ex", actual_bool=actual["Ex"]
    ):
        return False

    r_gr_raw = _condition_value(conditions, "R_gr")
    return not (r_gr_raw is not None or require_ex_r_gr) or _eval(
        r_gr_raw, field="R_gr", kind="r_gr"
    )
