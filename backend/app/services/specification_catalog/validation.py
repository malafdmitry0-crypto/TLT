"""Application validation of persisted specification catalog rows."""

from __future__ import annotations

from app.models.specification import (
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.reference_data.specification_catalog_case1_demo import CASE1_DEMO_SCHEMA_VERSION
from app.services.specification_catalog.contracts import SpecificationCatalogValidation
from app.services.specification_catalog.mapping import (
    issue,
    persisted_item_inputs,
    validate_catalog_checksums,
    validate_specification_catalog,
)
from app.services.specification_catalog.policy import (
    active_authority_allowed,
    catalog_demo_markers_compatible,
    has_untrusted_catalog_identity,
    is_case1_demo_catalog_version,
)


def validate_persisted_catalog(
    version: SpecificationCatalogVersion,
    items: tuple[SpecificationCatalogItem, ...],
    *,
    require_authority: bool,
    require_schema: bool,
) -> SpecificationCatalogValidation:
    item_inputs, persisted_item_issues = persisted_item_inputs(list(items))
    validation_issues = [
        *persisted_item_issues,
        *validate_specification_catalog([item for _, item in item_inputs]).issues,
        *validate_catalog_checksums(version, item_inputs),
    ]
    if require_authority and not active_authority_allowed(version):
        validation_issues.append(
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "catalog_authority_not_compatible",
                details={"authority": version.authority},
            )
        )
    if has_untrusted_catalog_identity(version) and not is_case1_demo_catalog_version(version):
        validation_issues.append(
            issue("SPEC_ACCESSORY_CATALOG_INCOMPLETE", "catalog_source_not_compatible")
        )
    if not catalog_demo_markers_compatible(version, item_inputs):
        validation_issues.append(
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "catalog_demo_item_source_not_compatible",
            )
        )
    if require_schema and version.schema_version != CASE1_DEMO_SCHEMA_VERSION:
        validation_issues.append(
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "unsupported_catalog_schema_version",
                details={
                    "actual": version.schema_version,
                    "supported": CASE1_DEMO_SCHEMA_VERSION,
                },
            )
        )
    complete = not validation_issues
    if not require_schema:
        complete = (
            version.schema_version == CASE1_DEMO_SCHEMA_VERSION
            and len(items) == version.item_count
            and complete
        )
    return SpecificationCatalogValidation(is_complete=complete, issues=validation_issues)


def activation_validation(
    version: SpecificationCatalogVersion,
    items: tuple[SpecificationCatalogItem, ...],
) -> SpecificationCatalogValidation:
    item_inputs, persisted_item_issues = persisted_item_inputs(list(items))
    missing_version_fields = [
        field
        for field in ("catalog_key", "version", "source")
        if not str(getattr(version, field, "")).strip()
    ]
    required_issues = (
        [
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "required_catalog_version_fields_invalid",
                details={"fields": missing_version_fields},
            )
        ]
        if missing_version_fields
        else []
    )
    shape_validation = validate_specification_catalog([item for _, item in item_inputs])
    validation_issues = [
        *required_issues,
        *persisted_item_issues,
        *shape_validation.issues,
        *validate_catalog_checksums(version, item_inputs),
    ]
    if version.schema_version != CASE1_DEMO_SCHEMA_VERSION:
        validation_issues.append(
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "unsupported_catalog_schema_version",
                details={
                    "actual": version.schema_version,
                    "supported": CASE1_DEMO_SCHEMA_VERSION,
                },
            )
        )
    if not catalog_demo_markers_compatible(version, item_inputs):
        validation_issues.append(
            issue(
                "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                "catalog_demo_item_source_not_compatible",
            )
        )
    return SpecificationCatalogValidation(
        is_complete=not validation_issues,
        issues=validation_issues,
    )
