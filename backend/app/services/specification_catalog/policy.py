"""Trust and compatibility policy for specification catalog versions."""

from __future__ import annotations

from app.core.config import settings as app_settings
from app.models.specification import SpecificationCatalogItem, SpecificationCatalogVersion
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_BOX_NA_DECISION_REF,
    CASE1_DEMO_CATALOG_KEY,
    CASE1_DEMO_EX_RGR_NA_DECISION_REF,
    CASE1_DEMO_VERSION,
    bundled_case1_demo_catalog_document,
    case1_demo_payload_checksum,
    is_case1_demo_item_source,
    is_case1_demo_source,
)
from app.schemas.specification_catalog import (
    SpecificationCatalogAuthority,
    SpecificationCatalogItemInput,
)
from app.services.specification_catalog.errors import SpecificationCatalogServiceError

UNTRUSTED_SOURCE_TOKENS = ("provisional", "synthetic", "demo", "guess", "mock")


def catalog_identity_text(version: SpecificationCatalogVersion) -> str:
    return f"{version.catalog_key} {version.version} {version.source}".casefold()


def is_case1_demo_catalog_version(version: SpecificationCatalogVersion) -> bool:
    document = bundled_case1_demo_catalog_document()
    return (
        version.catalog_key == CASE1_DEMO_CATALOG_KEY
        and version.version == CASE1_DEMO_VERSION
        and version.authority == SpecificationCatalogAuthority.DEMO.value
        and is_case1_demo_source(version.source)
        and version.source_checksum == document.source_checksum
        and version.payload_checksum == case1_demo_payload_checksum()
    )


def is_browser_qa_catalog_version(version: SpecificationCatalogVersion) -> bool:
    return str(version.version or "").casefold().startswith("browser-qa-")


def has_untrusted_catalog_identity(version: SpecificationCatalogVersion) -> bool:
    return any(token in catalog_identity_text(version) for token in UNTRUSTED_SOURCE_TOKENS)


def catalog_uses_case1_demo_markers(
    item_inputs: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]]
    | list[SpecificationCatalogItemInput],
) -> bool:
    demo_refs = {CASE1_DEMO_BOX_NA_DECISION_REF, CASE1_DEMO_EX_RGR_NA_DECISION_REF}
    for entry in item_inputs:
        item = entry[1] if isinstance(entry, tuple) else entry
        if is_case1_demo_item_source(item.source_ref):
            return True
        if any(
            isinstance(condition, dict) and condition.get("decision_ref") in demo_refs
            for condition in item.applicability.values()
        ):
            return True
    return False


def catalog_demo_markers_compatible(
    version: SpecificationCatalogVersion,
    item_inputs: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]]
    | list[SpecificationCatalogItemInput],
) -> bool:
    return not catalog_uses_case1_demo_markers(item_inputs) or is_case1_demo_catalog_version(
        version
    )


def active_authority_allowed(version: SpecificationCatalogVersion) -> bool:
    return version.authority == SpecificationCatalogAuthority.APPROVED.value or (
        not app_settings.is_production
        and version.authority == SpecificationCatalogAuthority.DEMO.value
        and is_case1_demo_catalog_version(version)
    )


def reject_case1_demo_in_production(
    version: SpecificationCatalogVersion,
    *,
    action: str,
) -> None:
    if not app_settings.is_production or not is_case1_demo_catalog_version(version):
        return
    raise SpecificationCatalogServiceError(
        "SPEC_CATALOG_DEMO_FORBIDDEN",
        "Демонстрационный specification catalog запрещён в production; "
        "импортируйте производственный owner-approved каталог",
        status_code=403,
        details={
            "action": action,
            "catalog_key": version.catalog_key,
            "version": version.version,
            "demo": True,
            "app_env": app_settings.APP_ENV,
        },
    )
