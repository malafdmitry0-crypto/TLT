"""Versioned, fail-closed catalog boundary for specification generation."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.specification import (
    Specification,
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.schemas.specification_catalog import (
    SpecificationCatalogAuthority,
    SpecificationCatalogCategory,
    SpecificationCatalogImportRequest,
    SpecificationCatalogItemInput,
)
from app.formulas.specification.catalog_conditions import (
    BOX_BOOLEAN_CONDITION_KEYS,
    BOX_CONDITION_KEYS,
    BOX_EX_KEY,
    BOX_R_GR_KEY,
    condition_mode,
    material_approval_reference_ok,
    validate_condition_shape,
)

_SHA256_RE = re.compile(r"sha256:[0-9a-f]{64}")
_UNTRUSTED_SOURCE_TOKENS = ("provisional", "synthetic", "demo", "guess", "mock")

_REQUIRED_CABLE_MARKS = {
    "10ТТН2-СТ",
    "17ТТН2-СТ",
    "25ТТН2-СТ",
    "31ТТН2-СТ",
    "10ТТН2-СР",
    "17ТТН2-СР",
    "25ТТН2-СР",
    "31ТТН2-СР",
    "15ТТВ2-СР",
    "30ТТВ2-СР",
    "45ТТВ2-СР",
    "60ТТВ2-СР",
    "15ТТХ2-СР",
    "30ТТХ2-СР",
    "45ТТХ2-СР",
    "60ТТХ2-СР",
    "75ТТХ2-СР",
    "90ТТХ2-СР",
}
_REQUIRED_CONNECTION_MARKS = {"КСН-1", "КСН-2", "КСВ-1", "КСВ-2"}
_REQUIRED_REPAIR_MARKS = {"КСР-1", "КСР-2"}
_REQUIRED_BOX_MARKS = {
    "СКВ 1201",
    "СКВ 1202",
    "СКВ 1201-С",
    "СКВ 1201-С1",
    "СКВ 1202-С",
    "СКВ 1202-С1",
    "СКВ 1601",
    "СКВ 1602",
    "СКВ 1601-С",
    "СКВ 1601-С1",
    "СКВ 1602-С",
    "СКВ 1602-С1",
}
_TEMPERATURE_GROUPS = {"LOW", "MEDIUM_HIGH"}
_MATERIAL_CATEGORIES = {
    SpecificationCatalogCategory.SEALANT,
    SpecificationCatalogCategory.FIBERGLASS_TAPE,
    SpecificationCatalogCategory.ALUMINIUM_TAPE,
}


class SpecificationCatalogServiceError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}

    def as_detail(self) -> dict[str, Any]:
        issues = self.details.get("issues", [])
        details = {key: value for key, value in self.details.items() if key != "issues"}
        return {
            "code": self.code,
            "message": self.message,
            "issues": issues,
            "details": details,
        }


@dataclass(frozen=True)
class SpecificationCatalogValidation:
    is_complete: bool
    issues: list[dict[str, Any]]


@dataclass(frozen=True)
class ResolvedSpecificationCatalog:
    version: SpecificationCatalogVersion
    items: tuple[SpecificationCatalogItem, ...]


@dataclass(frozen=True)
class SpecificationCatalogActivationResult:
    catalog: SpecificationCatalogVersion
    stale_specification_count: int


def _canonical_checksum(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def _issue(
    code: str,
    reason: str,
    *,
    item: SpecificationCatalogItemInput | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    issue: dict[str, Any] = {"code": code, "reason": reason}
    if item is not None:
        issue["item_key"] = item.item_key
        issue["category"] = item.category.value
    if details:
        issue["details"] = details
    return issue


def _decimal(
    value: Any,
    *,
    positive: bool,
) -> Decimal | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None
    if not result.is_finite():
        return None
    if positive and result <= 0:
        return None
    if not positive and result < 0:
        return None
    return result


def _require_decimal_parameter(
    item: SpecificationCatalogItemInput,
    key: str,
    issues: list[dict[str, Any]],
    *,
    parameter_group: str = "formula_parameters",
    positive: bool = True,
) -> Decimal | None:
    parameters = getattr(item, parameter_group)
    value = _decimal(parameters.get(key), positive=positive)
    if value is None:
        issues.append(
            _issue(
                "SPEC_FORMULA_INPUT_INVALID",
                f"invalid_or_missing_{key}",
                item=item,
                details={"parameter_group": parameter_group},
            )
        )
    return value


def _validate_temperature_group(
    item: SpecificationCatalogItemInput,
    issues: list[dict[str, Any]],
) -> None:
    if item.applicability.get("temperature_group") not in _TEMPERATURE_GROUPS:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "temperature_group_missing_or_invalid",
                item=item,
            )
        )


def _attach_item(
    raw_issues: list[dict[str, Any]],
    item: SpecificationCatalogItemInput,
) -> list[dict[str, Any]]:
    attached: list[dict[str, Any]] = []
    for raw in raw_issues:
        issue = dict(raw)
        issue["item_key"] = item.item_key
        issue["category"] = item.category.value
        attached.append(issue)
    return attached


def _validate_box_item(
    item: SpecificationCatalogItemInput,
    issues: list[dict[str, Any]],
) -> None:
    for key in BOX_BOOLEAN_CONDITION_KEYS:
        value = item.applicability.get(key)
        if key not in item.applicability:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    f"box_condition_{key}_missing_or_invalid",
                    item=item,
                )
            )
            continue
        issues.extend(
            _attach_item(
                validate_condition_shape(value, field=key, kind="bool"),
                item,
            )
        )

    if BOX_EX_KEY not in item.applicability:
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                "authoritative_Ex_condition_missing",
                item=item,
            )
        )
    else:
        issues.extend(
            _attach_item(
                validate_condition_shape(
                    item.applicability.get(BOX_EX_KEY),
                    field=BOX_EX_KEY,
                    kind="ex",
                ),
                item,
            )
        )

    if BOX_R_GR_KEY not in item.applicability:
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                "authoritative_R_gr_condition_missing",
                item=item,
            )
        )
    else:
        issues.extend(
            _attach_item(
                validate_condition_shape(
                    item.applicability.get(BOX_R_GR_KEY),
                    field=BOX_R_GR_KEY,
                    kind="r_gr",
                ),
                item,
            )
        )

    divider = _require_decimal_parameter(item, "section_divider", issues)
    min_quantity = _require_decimal_parameter(item, "min_quantity", issues)
    if min_quantity is not None and min_quantity != min_quantity.to_integral_value():
        issues.append(
            _issue(
                "SPEC_FORMULA_INPUT_INVALID",
                "box_min_quantity_must_be_integer",
                item=item,
            )
        )
    if divider is not None and divider != divider.to_integral_value():
        issues.append(
            _issue(
                "SPEC_FORMULA_INPUT_INVALID",
                "box_section_divider_must_be_integer",
                item=item,
            )
        )
    if item.formula_parameters.get("rounding_mode") not in {"up", "down"}:
        issues.append(
            _issue(
                "SPEC_FORMULA_INPUT_INVALID",
                "box_rounding_mode_invalid",
                item=item,
            )
        )


def _validate_material_authority(
    item: SpecificationCatalogItemInput,
    issues: list[dict[str, Any]],
) -> None:
    """Sealant and tapes need confirmed nomenclature, unit, capacity, approval."""
    if not item.nomenclature_code.strip():
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "material_nomenclature_code_missing",
                item=item,
            )
        )
    if not item.supply_unit.strip():
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "material_supply_unit_missing",
                item=item,
            )
        )
    if not material_approval_reference_ok(item.source_ref):
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "material_approval_reference_missing",
                item=item,
                details={"required_pattern": "approval:SPEC-OWNER-MATERIALS/<ref>"},
            )
        )


def _missing_marks_issue(
    *,
    category: SpecificationCatalogCategory,
    required: set[str],
    actual: set[str],
) -> dict[str, Any] | None:
    missing = sorted(required - actual)
    if not missing:
        return None
    code = (
        "SPEC_CABLE_NOMENCLATURE_MISSING"
        if category is SpecificationCatalogCategory.CABLE
        else "SPEC_ACCESSORY_CATALOG_ITEM_MISSING"
    )
    return _issue(
        code,
        "required_catalog_rows_missing",
        details={"category": category.value, "missing_marks": missing},
    )


def _item_input_from_model(
    item: SpecificationCatalogItem,
) -> SpecificationCatalogItemInput:
    return SpecificationCatalogItemInput(
        item_key=item.item_key,
        category=item.category,
        name=item.name,
        mark=item.mark,
        nomenclature_code=item.nomenclature_code,
        supply_unit=item.supply_unit,
        applicability=item.applicability,
        package_parameters=item.package_parameters,
        formula_parameters=item.formula_parameters,
        source_ref=item.source_ref,
    )


def _validate_catalog_checksums(
    version: SpecificationCatalogVersion,
    items: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    canonical_items: list[dict[str, Any]] = []
    for persisted, item in items:
        payload = item.model_dump(mode="json")
        canonical_items.append(payload)
        actual_row_checksum = _canonical_checksum(payload)
        if persisted.row_checksum != actual_row_checksum:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "row_checksum_mismatch",
                    item=item,
                    details={"catalog_item_id": str(persisted.id)},
                )
            )

    actual_payload_checksum = _canonical_checksum(
        sorted(canonical_items, key=lambda item: item["item_key"])
    )
    if version.payload_checksum != actual_payload_checksum:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "payload_checksum_mismatch",
                details={"catalog_version_id": str(version.id)},
            )
        )
    return issues


def _persisted_item_inputs(
    items: list[SpecificationCatalogItem],
) -> tuple[
    list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]],
    list[dict[str, Any]],
]:
    validated: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]] = []
    issues: list[dict[str, Any]] = []
    for item in items:
        try:
            validated.append((item, _item_input_from_model(item)))
        except ValidationError as exc:
            fields = sorted(
                {
                    ".".join(str(component) for component in error["loc"])
                    for error in exc.errors(include_url=False, include_input=False)
                }
            )
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "required_catalog_fields_invalid",
                    details={
                        "catalog_item_id": str(item.id),
                        "fields": fields,
                    },
                )
            )
    return validated, issues


def validate_specification_catalog(
    items: list[SpecificationCatalogItemInput],
) -> SpecificationCatalogValidation:
    """Validate completeness without granting authority to the input source."""

    issues: list[dict[str, Any]] = []
    seen_keys: set[str] = set()
    seen_codes: set[str] = set()
    by_category: dict[SpecificationCatalogCategory, list[SpecificationCatalogItemInput]] = {
        category: [] for category in SpecificationCatalogCategory
    }

    for item in items:
        if item.item_key in seen_keys:
            issues.append(
                _issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", "duplicate_item_key", item=item)
            )
        seen_keys.add(item.item_key)
        if item.nomenclature_code in seen_codes:
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "duplicate_nomenclature_code",
                    item=item,
                )
            )
        seen_codes.add(item.nomenclature_code)
        by_category[item.category].append(item)

        if any(token in item.source_ref.casefold() for token in _UNTRUSTED_SOURCE_TOKENS):
            issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "untrusted_source_ref",
                    item=item,
                )
            )

        if item.category is SpecificationCatalogCategory.CONNECTION_KIT:
            _validate_temperature_group(item, issues)
            _require_decimal_parameter(
                item,
                "sections_per_kit",
                issues,
                parameter_group="package_parameters",
            )
        elif item.category is SpecificationCatalogCategory.REPAIR_KIT:
            _validate_temperature_group(item, issues)
            _require_decimal_parameter(
                item,
                "cable_length_per_kit_m",
                issues,
                parameter_group="package_parameters",
            )
        elif item.category is SpecificationCatalogCategory.SEALANT:
            _require_decimal_parameter(
                item,
                "kits_per_sealant_unit",
                issues,
                parameter_group="package_parameters",
            )
            _validate_material_authority(item, issues)
        elif item.category is SpecificationCatalogCategory.FIBERGLASS_TAPE:
            _validate_temperature_group(item, issues)
            _require_decimal_parameter(
                item,
                "reel_length_m",
                issues,
                parameter_group="package_parameters",
            )
            _validate_material_authority(item, issues)
        elif item.category is SpecificationCatalogCategory.ALUMINIUM_TAPE:
            _require_decimal_parameter(item, "consumption_m_per_cable_m", issues)
            _require_decimal_parameter(
                item,
                "reel_length_m",
                issues,
                parameter_group="package_parameters",
            )
            _validate_material_authority(item, issues)
        elif item.category is SpecificationCatalogCategory.BOX:
            _validate_box_item(item, issues)

    required_marks = (
        (SpecificationCatalogCategory.CABLE, _REQUIRED_CABLE_MARKS),
        (SpecificationCatalogCategory.CONNECTION_KIT, _REQUIRED_CONNECTION_MARKS),
        (SpecificationCatalogCategory.REPAIR_KIT, _REQUIRED_REPAIR_MARKS),
        (SpecificationCatalogCategory.BOX, _REQUIRED_BOX_MARKS),
    )
    for category, required in required_marks:
        missing_issue = _missing_marks_issue(
            category=category,
            required=required,
            actual={item.mark for item in by_category[category]},
        )
        if missing_issue:
            issues.append(missing_issue)

    if not by_category[SpecificationCatalogCategory.SEALANT]:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "sealant_catalog_missing",
            )
        )
    if not by_category[SpecificationCatalogCategory.ALUMINIUM_TAPE]:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "aluminium_tape_catalog_missing",
            )
        )
    fiberglass_groups = {
        item.applicability.get("temperature_group")
        for item in by_category[SpecificationCatalogCategory.FIBERGLASS_TAPE]
    }
    if fiberglass_groups != _TEMPERATURE_GROUPS:
        issues.append(
            _issue(
                "SPEC_ACCESSORY_CATALOG_ITEM_MISSING",
                "fiberglass_temperature_groups_incomplete",
                details={"missing_groups": sorted(_TEMPERATURE_GROUPS - fiberglass_groups)},
            )
        )

    box_items = by_category[SpecificationCatalogCategory.BOX]
    if box_items:
        issues.extend(_validate_box_matrix_authority(box_items))

    return SpecificationCatalogValidation(is_complete=not issues, issues=issues)


def _condition_fingerprint(value: Any) -> str:
    mode = condition_mode(value)
    if mode == "match" and isinstance(value, dict):
        return f"match:{value.get('operator')!s}:{value.get('value')!s}"
    if mode == "not_applicable" and isinstance(value, dict):
        return f"na:{value.get('decision_ref')!s}"
    if mode == "unresolved":
        return "unresolved"
    return f"raw:{value!r}"


def _validate_box_matrix_authority(
    box_items: list[SpecificationCatalogItemInput],
) -> list[dict[str, Any]]:
    """Reject non-discriminating or silently duplicated box matrices."""
    issues: list[dict[str, Any]] = []
    marks = {item.mark for item in box_items}
    missing_marks = sorted(_REQUIRED_BOX_MARKS - marks)
    if missing_marks:
        # Already reported via required marks; still continue for Ex/R_gr rules.
        pass

    fingerprints: dict[str, list[str]] = {}
    ex_modes: list[str | None] = []
    r_gr_modes: list[str | None] = []
    for item in box_items:
        parts = [
            f"{key}={_condition_fingerprint(item.applicability.get(key))}"
            for key in BOX_CONDITION_KEYS
        ]
        fingerprint = "|".join(parts)
        fingerprints.setdefault(fingerprint, []).append(item.item_key)
        ex_modes.append(condition_mode(item.applicability.get(BOX_EX_KEY)))
        r_gr_modes.append(condition_mode(item.applicability.get(BOX_R_GR_KEY)))

    duplicated = {
        fingerprint: keys
        for fingerprint, keys in fingerprints.items()
        if len(keys) > 1
    }
    if duplicated:
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                "box_matrix_silently_duplicated_conditions",
                details={
                    "duplicate_groups": [
                        {"fingerprint": key, "item_keys": values}
                        for key, values in sorted(duplicated.items())
                    ]
                },
            )
        )

    if box_items and all(mode == "not_applicable" for mode in ex_modes) and all(
        mode == "not_applicable" for mode in r_gr_modes
    ):
        # All-not-applicable Ex/R_gr makes those axes non-discriminating.
        # Only accept when every decision_ref is present (shape-validated) AND
        # at least one boolean condition remains a match on some row.
        any_bool_match = False
        for item in box_items:
            for key in BOX_BOOLEAN_CONDITION_KEYS:
                if condition_mode(item.applicability.get(key)) == "match":
                    any_bool_match = True
                    break
            if any_bool_match:
                break
        if not any_bool_match:
            issues.append(
                _issue(
                    "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                    "all_boxes_ex_rgr_not_applicable_without_discrimination",
                    details={
                        "box_count": len(box_items),
                        "owner_decision": "SPEC-OWNER-EX-RGR",
                    },
                )
            )

    if box_items and all(mode == "unresolved" for mode in (*ex_modes, *r_gr_modes)):
        issues.append(
            _issue(
                "SPEC_BOX_EX_RGR_MATRIX_MISSING",
                "all_boxes_ex_rgr_unresolved",
                details={"box_count": len(box_items)},
            )
        )

    return issues


def _principal_reference(principal: CurrentPrincipal | None) -> str | None:
    if principal is None:
        return None
    if principal.user_id is not None:
        return f"user:{principal.user_id}"
    if principal.session_id:
        return f"guest:{principal.session_id}"
    return principal.role


def _advisory_key(catalog_key: str) -> int:
    unsigned = int.from_bytes(hashlib.sha256(catalog_key.encode("utf-8")).digest()[:4], "big")
    return unsigned if unsigned < 2**31 else unsigned - 2**32


def _as_catalog_id(value: UUID | str | None) -> UUID | str | None:
    """Treat UUID-looking strings as version ids; keep catalog_key strings as-is."""
    if value is None or isinstance(value, UUID):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return UUID(text)
    except ValueError:
        return text


class SpecificationCatalogService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_versions(
        self,
        *,
        catalog_key: str | None = None,
        status: str | None = None,
    ) -> list[SpecificationCatalogVersion]:
        filters = []
        if catalog_key is not None:
            filters.append(SpecificationCatalogVersion.catalog_key == catalog_key)
        if status is not None:
            filters.append(SpecificationCatalogVersion.status == status)
        result = await self.db.execute(
            select(SpecificationCatalogVersion)
            .where(*filters)
            .order_by(
                SpecificationCatalogVersion.catalog_key,
                SpecificationCatalogVersion.imported_at.desc(),
                SpecificationCatalogVersion.version.desc(),
            )
        )
        return list(result.scalars().all())

    async def get_version(
        self,
        catalog_version_id: UUID,
        *,
        include_items: bool = True,
    ) -> ResolvedSpecificationCatalog:
        version = await self.db.scalar(
            select(SpecificationCatalogVersion).where(
                SpecificationCatalogVersion.id == catalog_version_id
            )
        )
        if version is None:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VERSION_NOT_FOUND",
                "Версия specification catalog не найдена",
                status_code=404,
            )
        items: tuple[SpecificationCatalogItem, ...] = ()
        if include_items:
            items = tuple(
                (
                    await self.db.execute(
                        select(SpecificationCatalogItem)
                        .where(SpecificationCatalogItem.catalog_version_id == version.id)
                        .order_by(SpecificationCatalogItem.position)
                    )
                )
                .scalars()
                .all()
            )
        return ResolvedSpecificationCatalog(version=version, items=items)

    async def import_draft(
        self,
        document: SpecificationCatalogImportRequest,
        *,
        principal: CurrentPrincipal | None = None,
    ) -> SpecificationCatalogVersion:
        if not _SHA256_RE.fullmatch(document.source_checksum):
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_IMPORT_INVALID",
                "source_checksum должен быть SHA-256",
                status_code=422,
            )
        duplicate = await self.db.scalar(
            select(SpecificationCatalogVersion.id).where(
                SpecificationCatalogVersion.catalog_key == document.catalog_key,
                SpecificationCatalogVersion.version == document.version,
            )
        )
        if duplicate is not None:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VERSION_CONFLICT",
                "Версия specification catalog уже зарегистрирована",
                status_code=409,
            )

        validation = validate_specification_catalog(document.items)
        hard_shape_issues = [
            issue
            for issue in validation.issues
            if issue.get("reason")
            in {
                "legacy_unused_condition_rejected",
                "condition_must_be_discriminated_object",
                "condition_mode_invalid",
                "condition_unknown_fields",
                "unresolved_condition_forbids_operator_value",
                "unresolved_condition_forbids_decision_ref",
                "not_applicable_forbids_operator_value",
                "match_condition_forbids_decision_ref",
                "match_condition_requires_operator_and_value",
                "match_operator_invalid_for_boolean",
                "boolean_match_value_invalid",
                "r_gr_match_operator_not_owner_approved",
                "r_gr_match_value_invalid",
            }
        ]
        if hard_shape_issues:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_IMPORT_INVALID",
                "Specification catalog document has invalid condition shape",
                status_code=422,
                details={"issues": hard_shape_issues},
            )
        canonical_items = sorted(
            (item.model_dump(mode="json") for item in document.items),
            key=lambda item: item["item_key"],
        )
        version = SpecificationCatalogVersion(
            catalog_key=document.catalog_key,
            version=document.version,
            status="draft",
            authority=document.authority.value,
            source=document.source,
            source_checksum=document.source_checksum,
            payload_checksum=_canonical_checksum(canonical_items),
            schema_version=document.schema_version,
            item_count=len(document.items),
            is_complete=validation.is_complete,
            validation_issues=validation.issues,
            imported_by=_principal_reference(principal),
        )
        self.db.add(version)
        await self.db.flush()
        for position, item in enumerate(document.items):
            payload = item.model_dump(mode="json")
            self.db.add(
                SpecificationCatalogItem(
                    catalog_version_id=version.id,
                    item_key=item.item_key,
                    category=item.category.value,
                    name=item.name,
                    mark=item.mark,
                    nomenclature_code=item.nomenclature_code,
                    supply_unit=item.supply_unit,
                    applicability=payload["applicability"],
                    package_parameters=payload["package_parameters"],
                    formula_parameters=payload["formula_parameters"],
                    source_ref=item.source_ref,
                    row_checksum=_canonical_checksum(payload),
                    position=position,
                )
            )
        await self.db.commit()
        await self.db.refresh(version)
        return version

    async def activate(
        self,
        catalog_id: UUID,
        *,
        principal: CurrentPrincipal | None = None,
    ) -> SpecificationCatalogActivationResult:
        target = await self.db.scalar(
            select(SpecificationCatalogVersion).where(SpecificationCatalogVersion.id == catalog_id)
        )
        if target is None:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VERSION_NOT_FOUND",
                "Версия specification catalog не найдена",
                status_code=404,
            )
        await self.db.execute(
            select(func.pg_advisory_xact_lock(3600, _advisory_key(target.catalog_key)))
        )
        target = await self.db.scalar(
            select(SpecificationCatalogVersion)
            .where(SpecificationCatalogVersion.id == catalog_id)
            .with_for_update()
        )
        if target is None:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VERSION_NOT_FOUND",
                "Версия specification catalog не найдена",
                status_code=404,
            )
        if target.status != "draft":
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_ACTIVATION_INVALID",
                "Активировать можно только draft-версию",
                status_code=409,
            )
        items = list(
            (
                await self.db.execute(
                    select(SpecificationCatalogItem)
                    .where(SpecificationCatalogItem.catalog_version_id == target.id)
                    .order_by(SpecificationCatalogItem.position)
                )
            )
            .scalars()
            .all()
        )
        item_inputs, persisted_item_issues = _persisted_item_inputs(items)
        shape_validation = validate_specification_catalog([item for _, item in item_inputs])
        missing_version_fields = [
            field
            for field in ("catalog_key", "version", "source")
            if not str(getattr(target, field, "")).strip()
        ]
        version_required_issues = (
            [
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "required_catalog_version_fields_invalid",
                    details={"fields": missing_version_fields},
                )
            ]
            if missing_version_fields
            else []
        )
        validation_issues = [
            *version_required_issues,
            *persisted_item_issues,
            *shape_validation.issues,
            *_validate_catalog_checksums(target, item_inputs),
        ]
        validation = SpecificationCatalogValidation(
            is_complete=not validation_issues,
            issues=validation_issues,
        )
        target.item_count = len(items)
        target.is_complete = validation.is_complete
        target.validation_issues = validation.issues
        source_text = f"{target.catalog_key} {target.version} {target.source}".casefold()
        if (
            target.authority != SpecificationCatalogAuthority.APPROVED.value
            or any(token in source_text for token in _UNTRUSTED_SOURCE_TOKENS)
            or not validation.is_complete
        ):
            await self.db.commit()
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VALIDATION_FAILED",
                "Specification catalog не является полным авторитетным источником",
                status_code=422,
                details={"issues": validation.issues, "authority": target.authority},
            )

        versions = list(
            (
                await self.db.execute(
                    select(SpecificationCatalogVersion)
                    .where(SpecificationCatalogVersion.catalog_key == target.catalog_key)
                    .with_for_update()
                )
            )
            .scalars()
            .all()
        )
        previous = next((item for item in versions if item.status == "active"), None)
        if previous is not None:
            previous.status = "retired"
            await self.db.flush()

        target.status = "active"
        target.activated_at = datetime.now(UTC)
        target.activated_by = _principal_reference(principal)
        await self.db.flush()
        stale_result = await self.db.execute(
            update(Specification)
            .where(
                Specification.is_stale.is_(False),
                Specification.snapshot["catalog"]["catalog_key"].astext
                == target.catalog_key,
            )
            .values(
                is_stale=True,
                stale_reason="specification_catalog_activated",
                stale_at=datetime.now(UTC),
                stale_details={
                    "catalog_id": str(target.id),
                    "catalog_key": target.catalog_key,
                    "catalog_version": target.version,
                },
            )
        )
        stale_count = int(getattr(stale_result, "rowcount", 0) or 0)
        await self.db.commit()
        await self.db.refresh(target)
        return SpecificationCatalogActivationResult(
            catalog=target,
            stale_specification_count=stale_count,
        )

    async def resolve_active(
        self,
        *,
        catalog_id: UUID | str | None = None,
        catalog_version: str | None = None,
    ) -> ResolvedSpecificationCatalog:
        resolved_id = _as_catalog_id(catalog_id)
        filters = [SpecificationCatalogVersion.status == "active"]
        if isinstance(resolved_id, UUID):
            filters.append(SpecificationCatalogVersion.id == resolved_id)
        elif isinstance(resolved_id, str):
            filters.append(SpecificationCatalogVersion.catalog_key == resolved_id)
        if catalog_version is not None:
            filters.append(SpecificationCatalogVersion.version == catalog_version)
        query = select(SpecificationCatalogVersion).where(*filters)
        if resolved_id is None:
            versions = list((await self.db.execute(query)).scalars().all())
            version = versions[0] if len(versions) == 1 else None
            if len(versions) > 1:
                raise SpecificationCatalogServiceError(
                    "SPEC_CATALOG_UNAVAILABLE",
                    "Неоднозначный active specification catalog: требуется явный catalog_id",
                    status_code=503,
                    details={
                        "reason": "multiple_active_catalogs",
                        "active_catalog_count": len(versions),
                    },
                )
        else:
            version = await self.db.scalar(query)
        if version is None:
            code = (
                "SPEC_CATALOG_VERSION_INACTIVE"
                if resolved_id is not None or catalog_version is not None
                else "SPEC_CATALOG_UNAVAILABLE"
            )
            raise SpecificationCatalogServiceError(
                code,
                "Нет подходящей active specification catalog версии",
                status_code=409 if code == "SPEC_CATALOG_VERSION_INACTIVE" else 503,
            )
        if version.authority != "approved" or not version.is_complete:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active specification catalog не прошёл production gate",
                status_code=503,
            )
        items = tuple(
            (
                await self.db.execute(
                    select(SpecificationCatalogItem)
                    .where(SpecificationCatalogItem.catalog_version_id == version.id)
                    .order_by(SpecificationCatalogItem.position)
                )
            )
            .scalars()
            .all()
        )
        if len(items) != version.item_count:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active specification catalog имеет повреждённый item snapshot",
                status_code=503,
            )
        return ResolvedSpecificationCatalog(version=version, items=items)
