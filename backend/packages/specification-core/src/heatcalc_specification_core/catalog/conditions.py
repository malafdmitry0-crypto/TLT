"""Discriminated applicability conditions for specification catalogs."""

from __future__ import annotations

import re
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import TypeGuard

from heatcalc_specification_core.catalog.condition_contracts import (
    ConditionInput,
    ConditionKind,
    ConditionValidationIssue,
)
from heatcalc_specification_core.json_types import JsonObject, JsonValue, json_object

_DECISION_REF_RE = re.compile(r"^SPEC-OWNER-[A-Z0-9-]+/.+")
_EX_RGR_DECISION_PREFIX = "SPEC-OWNER-EX-RGR/"
_MATERIAL_APPROVAL_RE = re.compile(r"approval:\s*SPEC-OWNER-MATERIALS/\S+", re.IGNORECASE)
_CASE1_DEMO_DECISION_REFS = frozenset(
    {
        "DEMO-CASE1-BOX-v1",
        "DEMO-CASE1-EX-RGR-NOT-APPLICABLE-v1",
    }
)
_R_GR_MATCH_OPERATORS = frozenset({"eq", "lte", "gte", "lt", "gt"})
_BOOL_MATCH_OPERATORS = frozenset({"eq"})

BOX_BOOLEAN_CONDITION_KEYS = (
    "d_ge_57",
    "K1i",
    "K2i",
    "Kiu",
    "L_sec_ge_L_K2i",
    "N_sec_ge_3",
)
BOX_EX_KEY = "Ex"
BOX_R_GR_KEY = "R_gr"
BOX_CONDITION_KEYS = (*BOX_BOOLEAN_CONDITION_KEYS, BOX_EX_KEY, BOX_R_GR_KEY)


def is_condition_object(value: ConditionInput) -> TypeGuard[JsonObject]:
    return isinstance(value, Mapping) and "mode" in value


def condition_mode(value: ConditionInput) -> str | None:
    if not isinstance(value, Mapping):
        return None
    mode = value.get("mode")
    return str(mode) if mode is not None else None


def _details(**values: JsonValue) -> JsonObject:
    return json_object(values)


def _issue(
    code: str,
    reason: str,
    *,
    field: str | None = None,
    details: JsonObject | None = None,
) -> ConditionValidationIssue:
    return ConditionValidationIssue(
        code=code,
        reason=reason,
        field=field,
        details=details or {},
    )


def _decimal_string(value: ConditionInput) -> str | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not result.is_finite() or result < 0:
        return None
    return (
        format(result.normalize(), "f")
        if result == result.to_integral_value()
        else format(result, "f")
    )


def validate_condition_shape(
    value: ConditionInput,
    *,
    field: str,
    kind: ConditionKind,
) -> tuple[ConditionValidationIssue, ...]:
    issues: list[ConditionValidationIssue] = []

    if value == "unused" or (isinstance(value, str) and value.strip().lower() == "unused"):
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING"
                if kind in {"ex", "r_gr"}
                else "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "legacy_unused_condition_rejected",
                field=field,
            )
        )
        return tuple(issues)

    if isinstance(value, bool | int | float | Decimal) or value is None:
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING"
                if kind in {"ex", "r_gr"}
                else "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "condition_must_be_discriminated_object",
                field=field,
                details=_details(got_type=type(value).__name__),
            )
        )
        return tuple(issues)

    if not isinstance(value, Mapping):
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING"
                if kind in {"ex", "r_gr"}
                else "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "condition_must_be_discriminated_object",
                field=field,
                details=_details(got_type=type(value).__name__),
            )
        )
        return tuple(issues)

    mode = value.get("mode")
    if mode not in {"match", "not_applicable", "unresolved"}:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "condition_mode_invalid",
                field=field,
                details=_details(mode=mode),
            )
        )
        return tuple(issues)

    extra_keys = set(value) - {"mode", "operator", "value", "decision_ref"}
    if extra_keys:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "condition_unknown_fields",
                field=field,
                details=_details(fields=tuple(sorted(extra_keys))),
            )
        )

    if mode == "unresolved":
        if value.get("operator") is not None or value.get("value") is not None:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "unresolved_condition_forbids_operator_value",
                    field=field,
                )
            )
        if value.get("decision_ref") is not None:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "unresolved_condition_forbids_decision_ref",
                    field=field,
                )
            )
        issues.append(
            _issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", "condition_unresolved", field=field)
        )
        return tuple(issues)

    if mode == "not_applicable":
        if value.get("operator") is not None or value.get("value") is not None:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "not_applicable_forbids_operator_value",
                    field=field,
                )
            )
        decision_ref = value.get("decision_ref")
        if not isinstance(decision_ref, str) or not decision_ref.strip():
            issues.append(
                _issue(
                    "SPEC_BOX_EX_RGR_MATRIX_MISSING"
                    if kind in {"ex", "r_gr"}
                    else "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "not_applicable_decision_ref_missing",
                    field=field,
                )
            )
        elif (
            not _DECISION_REF_RE.fullmatch(decision_ref.strip())
            and decision_ref.strip() not in _CASE1_DEMO_DECISION_REFS
        ):
            issues.append(
                _issue(
                    "SPEC_BOX_EX_RGR_MATRIX_MISSING"
                    if kind in {"ex", "r_gr"}
                    else "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "not_applicable_decision_ref_invalid",
                    field=field,
                    details=_details(decision_ref=decision_ref),
                )
            )
        elif (
            kind in {"ex", "r_gr"}
            and not decision_ref.startswith(_EX_RGR_DECISION_PREFIX)
            and decision_ref.strip() != "DEMO-CASE1-EX-RGR-NOT-APPLICABLE-v1"
        ):
            issues.append(
                _issue(
                    "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                    "ex_rgr_decision_ref_namespace_invalid",
                    field=field,
                    details=_details(decision_ref=decision_ref),
                )
            )
        return tuple(issues)

    if value.get("decision_ref") is not None:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "match_condition_forbids_decision_ref",
                field=field,
            )
        )
    operator = value.get("operator")
    raw_value = value.get("value")
    if operator is None or raw_value is None:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "match_condition_requires_operator_and_value",
                field=field,
            )
        )
        return tuple(issues)

    if kind in {"bool", "ex"}:
        if operator not in _BOOL_MATCH_OPERATORS:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE"
                    if kind == "bool"
                    else "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                    "match_operator_invalid_for_boolean",
                    field=field,
                    details=_details(operator=operator),
                )
            )
        if raw_value is not True and raw_value is not False:
            issues.append(
                _issue(
                    "SPEC_BOX_EX_RGR_MATRIX_MISSING"
                    if kind == "ex"
                    else "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "boolean_match_value_invalid",
                    field=field,
                    details=_details(value=raw_value),
                )
            )
        return tuple(issues)

    if operator not in _R_GR_MATCH_OPERATORS:
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                "r_gr_match_operator_not_owner_approved",
                field=field,
                details=_details(
                    operator=operator,
                    allowed_operators=tuple(sorted(_R_GR_MATCH_OPERATORS)),
                    owner_decision="SPEC-OWNER-EX-RGR",
                ),
            )
        )
    if _decimal_string(raw_value) is None:
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                "r_gr_match_value_invalid",
                field=field,
                details=_details(value=raw_value),
            )
        )
    return tuple(issues)


def material_approval_reference_ok(source_ref: str) -> bool:
    return bool(_MATERIAL_APPROVAL_RE.search(source_ref or ""))


def evaluate_condition_for_match(
    value: ConditionInput,
    *,
    actual_bool: bool | None = None,
    actual_decimal: Decimal | None = None,
    kind: ConditionKind,
) -> bool | None:
    if value == "unused" or (isinstance(value, str) and value.strip().lower() == "unused"):
        raise ValueError("legacy_unused_condition_rejected")
    if not isinstance(value, Mapping):
        raise ValueError("condition_must_be_discriminated_object")
    mode = value.get("mode")
    if mode == "not_applicable":
        return None
    if mode == "unresolved":
        raise ValueError("condition_unresolved")
    if mode != "match":
        raise ValueError("condition_mode_invalid")
    operator = value.get("operator")
    expected = value.get("value")
    if kind in {"bool", "ex"}:
        if operator != "eq" or not isinstance(expected, bool) or actual_bool is None:
            raise ValueError("boolean_match_invalid")
        return actual_bool is expected
    if actual_decimal is None:
        return False
    if operator not in _R_GR_MATCH_OPERATORS:
        raise ValueError("r_gr_match_operator_not_owner_approved")
    threshold = Decimal(str(expected))
    if operator == "eq":
        return actual_decimal == threshold
    if operator == "lte":
        return actual_decimal <= threshold
    if operator == "gte":
        return actual_decimal >= threshold
    if operator == "lt":
        return actual_decimal < threshold
    if operator == "gt":
        return actual_decimal > threshold
    raise ValueError("r_gr_match_operator_not_owner_approved")


def match_condition(*, operator: str = "eq", value: JsonValue) -> dict[str, JsonValue]:
    return {"mode": "match", "operator": operator, "value": value}


def not_applicable(decision_ref: str) -> dict[str, JsonValue]:
    return {"mode": "not_applicable", "decision_ref": decision_ref}


def unresolved() -> dict[str, JsonValue]:
    return {"mode": "unresolved"}
