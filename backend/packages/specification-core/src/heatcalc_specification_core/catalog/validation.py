"""Pure completeness and authority validation for catalog contents."""

from __future__ import annotations

from collections.abc import Sequence
from decimal import Decimal, InvalidOperation

from heatcalc_specification_core.catalog.box_validation import validate_box_matrix_authority
from heatcalc_specification_core.catalog.validation_contracts import (
    CatalogCategory,
    CatalogContentItem,
    CatalogValidation,
    CatalogValidationIssue,
)
from heatcalc_specification_core.catalog_conditions import (
    BOX_BOOLEAN_CONDITION_KEYS,
    BOX_EX_KEY,
    BOX_R_GR_KEY,
    material_approval_reference_ok,
    validate_condition_shape,
)
from heatcalc_specification_core.json_types import JsonObject, json_object

REQUIRED_MARKS: dict[CatalogCategory, frozenset[str]] = {
    CatalogCategory.CABLE: frozenset(
        {
            "10ТТН2-СТ", "17ТТН2-СТ", "25ТТН2-СТ", "31ТТН2-СТ",
            "10ТТН2-СР", "17ТТН2-СР", "25ТТН2-СР", "31ТТН2-СР",
            "15ТТВ2-СР", "30ТТВ2-СР", "45ТТВ2-СР", "60ТТВ2-СР",
            "15ТТХ2-СР", "30ТТХ2-СР", "45ТТХ2-СР", "60ТТХ2-СР",
            "75ТТХ2-СР", "90ТТХ2-СР",
        }
    ),
    CatalogCategory.CONNECTION_KIT: frozenset({"КСН-1", "КСН-2", "КСВ-1", "КСВ-2"}),
    CatalogCategory.REPAIR_KIT: frozenset({"КСР-1", "КСР-2"}),
    CatalogCategory.BOX: frozenset(
        {
            "СКВ 1201", "СКВ 1202", "СКВ 1201-С", "СКВ 1201-С1",
            "СКВ 1202-С", "СКВ 1202-С1", "СКВ 1601", "СКВ 1602",
            "СКВ 1601-С", "СКВ 1601-С1", "СКВ 1602-С", "СКВ 1602-С1",
        }
    ),
}
TEMPERATURE_GROUPS = frozenset({"LOW", "MEDIUM_HIGH"})
UNTRUSTED_SOURCE_TOKENS = ("provisional", "synthetic", "demo", "guess", "mock")


def validate_catalog_content(items: Sequence[CatalogContentItem]) -> CatalogValidation:
    issues: list[CatalogValidationIssue] = []
    seen_keys: set[str] = set()
    seen_codes: set[str] = set()
    by_category: dict[CatalogCategory, list[CatalogContentItem]] = {
        category: [] for category in CatalogCategory
    }

    for item in items:
        if item.item_key in seen_keys:
            issues.append(_issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", "duplicate_item_key", item))
        seen_keys.add(item.item_key)
        if item.nomenclature_code in seen_codes:
            issues.append(
                _issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", "duplicate_nomenclature_code", item)
            )
        seen_codes.add(item.nomenclature_code)
        by_category[item.category].append(item)
        if (
            any(token in item.source_ref.casefold() for token in UNTRUSTED_SOURCE_TOKENS)
            and not item.is_demo_source
        ):
            issues.append(_issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", "untrusted_source_ref", item))
        _validate_item(item, issues)

    for category, required in REQUIRED_MARKS.items():
        missing = sorted(required - {item.mark for item in by_category[category]})
        if missing:
            code = (
                "SPEC_CABLE_NOMENCLATURE_MISSING"
                if category is CatalogCategory.CABLE
                else "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
            )
            issues.append(
                CatalogValidationIssue(
                    code=code,
                    reason="required_catalog_rows_missing",
                    details={"category": category.value, "missing_marks": tuple(missing)},
                )
            )

    if not by_category[CatalogCategory.SEALANT]:
        issues.append(
            CatalogValidationIssue("SPEC_ACCESSORY_CATALOG_ITEM_MISSING", "sealant_catalog_missing")
        )
    if not by_category[CatalogCategory.ALUMINIUM_TAPE]:
        issues.append(
            CatalogValidationIssue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING", "aluminium_tape_catalog_missing"
            )
        )
    fiberglass_groups = {
        value
        for item in by_category[CatalogCategory.FIBERGLASS_TAPE]
        if isinstance((value := item.applicability.get("temperature_group")), str)
    }
    if fiberglass_groups != TEMPERATURE_GROUPS:
        issues.append(
            CatalogValidationIssue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "fiberglass_temperature_groups_incomplete",
                details={
                    "missing_groups": tuple(sorted(TEMPERATURE_GROUPS - fiberglass_groups))
                },
            )
        )
    issues.extend(validate_box_matrix_authority(by_category[CatalogCategory.BOX]))
    return CatalogValidation(is_complete=not issues, issues=tuple(issues))


def _validate_item(
    item: CatalogContentItem,
    issues: list[CatalogValidationIssue],
) -> None:
    if item.category in {CatalogCategory.CONNECTION_KIT, CatalogCategory.REPAIR_KIT}:
        _validate_temperature(item, issues)
    if item.category is CatalogCategory.CONNECTION_KIT:
        _require_decimal(item, "sections_per_kit", issues, source=item.package_parameters)
    elif item.category is CatalogCategory.REPAIR_KIT:
        _require_decimal(item, "cable_length_per_kit_m", issues, source=item.package_parameters)
    elif item.category is CatalogCategory.SEALANT:
        _require_decimal(item, "kits_per_sealant_unit", issues, source=item.package_parameters)
        _validate_material(item, issues)
    elif item.category is CatalogCategory.FIBERGLASS_TAPE:
        _validate_temperature(item, issues)
        _require_decimal(item, "reel_length_m", issues, source=item.package_parameters)
        _validate_material(item, issues)
    elif item.category is CatalogCategory.ALUMINIUM_TAPE:
        _require_decimal(item, "consumption_m_per_cable_m", issues, source=item.formula_parameters)
        _require_decimal(item, "reel_length_m", issues, source=item.package_parameters)
        _validate_material(item, issues)
    elif item.category is CatalogCategory.BOX:
        _validate_box(item, issues)


def _validate_temperature(
    item: CatalogContentItem,
    issues: list[CatalogValidationIssue],
) -> None:
    if item.applicability.get("temperature_group") not in TEMPERATURE_GROUPS:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "temperature_group_missing_or_invalid",
                item,
            )
        )


def _validate_material(
    item: CatalogContentItem,
    issues: list[CatalogValidationIssue],
) -> None:
    if not item.nomenclature_code.strip():
        issues.append(_issue("SPEC_ACCESSORY_CATALOG_ITEM_MISSING", "material_nomenclature_code_missing", item))
    if not item.supply_unit.strip():
        issues.append(_issue("SPEC_ACCESSORY_CATALOG_ITEM_MISSING", "material_supply_unit_missing", item))
    if not material_approval_reference_ok(item.source_ref) and not item.is_demo_source:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "material_approval_reference_missing",
                item,
                details={"required_pattern": "approval:SPEC-OWNER-MATERIALS/<ref>"},
            )
        )


def _validate_box(
    item: CatalogContentItem,
    issues: list[CatalogValidationIssue],
) -> None:
    for key in BOX_BOOLEAN_CONDITION_KEYS:
        if key not in item.applicability:
            issues.append(_issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", f"box_condition_{key}_missing_or_invalid", item))
        else:
            _attach_condition_issues(item, key, "bool", issues)
    if BOX_EX_KEY not in item.applicability:
        issues.append(_issue("SPEC_BOX_EX_RGR_MATRIX_MISSING", "authoritative_Ex_condition_missing", item))
    else:
        _attach_condition_issues(item, BOX_EX_KEY, "ex", issues)
    if BOX_R_GR_KEY not in item.applicability:
        issues.append(_issue("SPEC_BOX_EX_RGR_MATRIX_MISSING", "authoritative_R_gr_condition_missing", item))
    else:
        _attach_condition_issues(item, BOX_R_GR_KEY, "r_gr", issues)
    divider = _require_decimal(item, "section_divider", issues, source=item.formula_parameters)
    minimum = _require_decimal(item, "min_quantity", issues, source=item.formula_parameters)
    if minimum is not None and minimum != minimum.to_integral_value():
        issues.append(_issue("SPEC_FORMULA_INPUT_INVALID", "box_min_quantity_must_be_integer", item))
    if divider is not None and divider != divider.to_integral_value():
        issues.append(_issue("SPEC_FORMULA_INPUT_INVALID", "box_section_divider_must_be_integer", item))
    if item.formula_parameters.get("rounding_mode") not in {"up", "down"}:
        issues.append(_issue("SPEC_FORMULA_INPUT_INVALID", "box_rounding_mode_invalid", item))


def _attach_condition_issues(
    item: CatalogContentItem,
    field: str,
    kind: str,
    issues: list[CatalogValidationIssue],
) -> None:
    for raw in validate_condition_shape(item.applicability.get(field), field=field, kind=kind):
        details = raw.get("details")
        issues.append(
            CatalogValidationIssue(
                code=str(raw["code"]),
                reason=str(raw["reason"]),
                item_key=item.item_key,
                category=item.category.value,
                details=json_object(details) if isinstance(details, dict) else {},
            )
        )


def _require_decimal(
    item: CatalogContentItem,
    key: str,
    issues: list[CatalogValidationIssue],
    *,
    source: JsonObject,
) -> Decimal | None:
    value = source.get(key)
    try:
        result = Decimal(str(value)) if value is not None and not isinstance(value, bool) else None
    except (InvalidOperation, TypeError, ValueError):
        result = None
    if result is None or not result.is_finite() or result <= 0:
        issues.append(
            _issue(
                "SPEC_FORMULA_INPUT_INVALID",
                f"invalid_or_missing_{key}",
                item,
                details={
                    "parameter_group": (
                        "formula_parameters" if source is item.formula_parameters else "package_parameters"
                    )
                },
            )
        )
        return None
    return result


def _issue(
    code: str,
    reason: str,
    item: CatalogContentItem | None = None,
    *,
    details: JsonObject | None = None,
) -> CatalogValidationIssue:
    return CatalogValidationIssue(
        code=code,
        reason=reason,
        item_key=item.item_key if item is not None else None,
        category=item.category.value if item is not None else None,
        details=details or {},
    )
