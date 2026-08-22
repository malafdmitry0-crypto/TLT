"""Fail-closed resolution of active specification catalog versions."""

from __future__ import annotations

from uuid import UUID

from app.core.config import settings as app_settings
from app.reference_data.specification_catalog_case1_demo import CASE1_DEMO_SCHEMA_VERSION
from app.services.specification_catalog.contracts import ResolvedSpecificationCatalog
from app.services.specification_catalog.errors import SpecificationCatalogServiceError
from app.services.specification_catalog.policy import (
    active_authority_allowed,
    has_untrusted_catalog_identity,
    is_browser_qa_catalog_version,
    is_case1_demo_catalog_version,
)
from app.services.specification_catalog.repository import SpecificationCatalogRepository
from app.services.specification_catalog.validation import validate_persisted_catalog


def as_catalog_id(value: UUID | str | None) -> UUID | str | None:
    if value is None or isinstance(value, UUID):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return UUID(text)
    except ValueError:
        return text


class SpecificationCatalogResolutionService:
    def __init__(self, repository: SpecificationCatalogRepository):
        self.repository = repository

    async def resolve_active(
        self,
        *,
        catalog_id: UUID | str | None = None,
        catalog_version: str | None = None,
    ) -> ResolvedSpecificationCatalog:
        resolved_id = as_catalog_id(catalog_id)
        if resolved_id is None:
            versions = await self.repository.resolve_active_versions(
                catalog_id=None,
                catalog_version=catalog_version,
            )
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
            version = await self.repository.resolve_single_active(
                catalog_id=resolved_id,
                catalog_version=catalog_version,
            )
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
        if app_settings.is_production and is_case1_demo_catalog_version(version):
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_DEMO_FORBIDDEN",
                "Active specification catalog — demo version; production generation blocked",
                status_code=503,
                details={
                    "catalog_key": version.catalog_key,
                    "version": version.version,
                    "demo": True,
                },
            )
        if not active_authority_allowed(version) or not version.is_complete:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active specification catalog не прошёл production gate",
                status_code=503,
            )
        if is_browser_qa_catalog_version(version):
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active browser-QA catalog cannot be used for specification generation",
                status_code=503,
                details={"reason": "browser_qa_catalog_forbidden", "version": version.version},
            )
        if has_untrusted_catalog_identity(version) and not is_case1_demo_catalog_version(version):
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active specification catalog has an untrusted source identity",
                status_code=503,
                details={"reason": "catalog_source_not_compatible"},
            )
        if version.schema_version != CASE1_DEMO_SCHEMA_VERSION:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active specification catalog использует неподдерживаемую schema_version",
                status_code=503,
                details={
                    "schema_version": version.schema_version,
                    "supported_schema_version": CASE1_DEMO_SCHEMA_VERSION,
                },
            )
        items = await self.repository.get_items(version.id)
        persisted_validation = validate_persisted_catalog(
            version,
            items,
            require_authority=True,
            require_schema=False,
        )
        if not persisted_validation.is_complete:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_UNAVAILABLE",
                "Active specification catalog несовместим, повреждён или не проходит текущую валидацию",
                status_code=503,
                details={
                    "schema_version": version.schema_version,
                    "supported_schema_version": CASE1_DEMO_SCHEMA_VERSION,
                    "issues": persisted_validation.issues,
                },
            )
        return ResolvedSpecificationCatalog(version=version, items=items)
