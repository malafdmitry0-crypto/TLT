"""Conversion between HTTP/ORM catalog objects and core catalog contracts."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from heatcalc_specification_core.catalog import (
    CatalogCategory as CoreCatalogCategory,
)
from heatcalc_specification_core.catalog import (
    CatalogContentItem,
    validate_catalog_content,
)
from heatcalc_specification_core.json_types import json_object
from pydantic import ValidationError

from app.models.specification import (
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.reference_data.specification_catalog_case1_demo import is_case1_demo_item_source
from app.schemas.specification_catalog import SpecificationCatalogItemInput
from app.services.specification_catalog.contracts import SpecificationCatalogValidation


def canonical_catalog_checksum(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return f"sha256:{hashlib.sha256(encoded).hexdigest()}"


def issue(
    code: str,
    reason: str,
    *,
    item: SpecificationCatalogItemInput | None = None,
    details: dict[str, Any] | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {"code": code, "reason": reason}
    if item is not None:
        result["item_key"] = item.item_key
        result["category"] = item.category.value
    if details:
        result["details"] = details
    return result


def item_input_from_model(item: SpecificationCatalogItem) -> SpecificationCatalogItemInput:
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


def persisted_item_inputs(
    items: list[SpecificationCatalogItem],
) -> tuple[
    list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]],
    list[dict[str, Any]],
]:
    validated: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]] = []
    issues: list[dict[str, Any]] = []
    for item in items:
        try:
            validated.append((item, item_input_from_model(item)))
        except ValidationError as exc:
            fields = sorted(
                {
                    ".".join(str(component) for component in error["loc"])
                    for error in exc.errors(include_url=False, include_input=False)
                }
            )
            issues.append(
                issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "required_catalog_fields_invalid",
                    details={"catalog_item_id": str(item.id), "fields": fields},
                )
            )
    return validated, issues


def validate_specification_catalog(
    items: list[SpecificationCatalogItemInput],
) -> SpecificationCatalogValidation:
    """Adapt the HTTP/Pydantic boundary to the pure core validator."""
    result = validate_catalog_content([core_catalog_item(item) for item in items])
    return SpecificationCatalogValidation(
        is_complete=result.is_complete,
        issues=[dict(item.to_dict()) for item in result.issues],
    )


def core_catalog_item(item: SpecificationCatalogItemInput) -> CatalogContentItem:
    return CatalogContentItem(
        item_key=item.item_key,
        category=CoreCatalogCategory(item.category.value),
        name=item.name,
        mark=item.mark,
        nomenclature_code=item.nomenclature_code,
        supply_unit=item.supply_unit,
        applicability=json_object(item.applicability),
        package_parameters=json_object(item.package_parameters),
        formula_parameters=json_object(item.formula_parameters),
        source_ref=item.source_ref,
        is_demo_source=is_case1_demo_item_source(item.source_ref),
    )


def validate_catalog_checksums(
    version: SpecificationCatalogVersion,
    items: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]],
) -> list[dict[str, Any]]:
    issues: list[dict[str, Any]] = []
    canonical_items: list[dict[str, Any]] = []
    for persisted, item in items:
        payload = item.model_dump(mode="json")
        canonical_items.append(payload)
        if persisted.row_checksum != canonical_catalog_checksum(payload):
            issues.append(
                issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "row_checksum_mismatch",
                    item=item,
                    details={"catalog_item_id": str(persisted.id)},
                )
            )

    actual_payload_checksum = canonical_catalog_checksum(
        sorted(canonical_items, key=lambda item: item["item_key"])
    )
    if version.payload_checksum != actual_payload_checksum:
        issues.append(
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "payload_checksum_mismatch",
                details={"catalog_version_id": str(version.id)},
            )
        )
    return issues
