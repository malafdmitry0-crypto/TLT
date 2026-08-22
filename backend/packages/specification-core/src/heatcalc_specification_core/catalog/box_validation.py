"""Authority checks for the catalog junction-box matrix."""

from __future__ import annotations

from collections.abc import Mapping, Sequence

from heatcalc_specification_core.catalog.condition_contracts import ConditionInput
from heatcalc_specification_core.catalog.conditions import (
    BOX_BOOLEAN_CONDITION_KEYS,
    BOX_CONDITION_KEYS,
    BOX_EX_KEY,
    BOX_R_GR_KEY,
    condition_mode,
)
from heatcalc_specification_core.catalog.validation_contracts import (
    CatalogContentItem,
    CatalogValidationIssue,
)


def validate_box_matrix_authority(
    items: Sequence[CatalogContentItem],
) -> list[CatalogValidationIssue]:
    issues: list[CatalogValidationIssue] = []
    fingerprints: dict[str, list[str]] = {}
    ex_modes: list[str | None] = []
    r_gr_modes: list[str | None] = []
    for item in items:
        parts = [
            f"{key}={_condition_fingerprint(item.applicability.get(key))}"
            for key in BOX_CONDITION_KEYS
        ]
        parts.extend(
            (
                f"section_divider={item.formula_parameters.get('section_divider')!s}",
                f"rounding_mode={item.formula_parameters.get('rounding_mode')!s}",
                f"min_quantity={item.formula_parameters.get('min_quantity')!s}",
            )
        )
        fingerprint = "|".join(parts)
        fingerprints.setdefault(fingerprint, []).append(item.item_key)
        ex_modes.append(condition_mode(item.applicability.get(BOX_EX_KEY)))
        r_gr_modes.append(condition_mode(item.applicability.get(BOX_R_GR_KEY)))

    duplicated = {key: values for key, values in fingerprints.items() if len(values) > 1}
    if duplicated:
        issues.append(
            CatalogValidationIssue(
                code="SPEC_BOX_EX_RGR_MATRIX_MISSING",
                reason="box_matrix_silently_duplicated_conditions",
                details={
                    "duplicate_groups": tuple(
                        {
                            "fingerprint": key,
                            "item_keys": tuple(values),
                        }
                        for key, values in sorted(duplicated.items())
                    )
                },
            )
        )

    if (
        items
        and all(mode == "not_applicable" for mode in ex_modes)
        and all(mode == "not_applicable" for mode in r_gr_modes)
        and not any(
            condition_mode(item.applicability.get(key)) == "match"
            for item in items
            for key in BOX_BOOLEAN_CONDITION_KEYS
        )
    ):
        issues.append(
            CatalogValidationIssue(
                code="SPEC_BOX_EX_RGR_MATRIX_MISSING",
                reason="all_boxes_ex_rgr_not_applicable_without_discrimination",
                details={"box_count": len(items), "owner_decision": "SPEC-OWNER-EX-RGR"},
            )
        )

    if items and all(mode == "unresolved" for mode in (*ex_modes, *r_gr_modes)):
        issues.append(
            CatalogValidationIssue(
                code="SPEC_BOX_EX_RGR_MATRIX_MISSING",
                reason="all_boxes_ex_rgr_unresolved",
                details={"box_count": len(items)},
            )
        )
    return issues


def _condition_fingerprint(value: ConditionInput) -> str:
    mode = condition_mode(value)
    if mode == "match" and isinstance(value, Mapping):
        return f"match:{value.get('operator')!s}:{value.get('value')!s}"
    if mode == "not_applicable" and isinstance(value, Mapping):
        return f"na:{value.get('decision_ref')!s}"
    if mode == "unresolved":
        return "unresolved"
    return f"raw:{value!r}"
