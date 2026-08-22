"""Non-production bootstrap for the immutable Case 1 demo catalog."""

from __future__ import annotations

from app.core.config import settings as app_settings
from app.core.dependencies import CurrentPrincipal
from app.models.specification import SpecificationCatalogVersion
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_CATALOG_KEY,
    CASE1_DEMO_VERSION,
    bundled_case1_demo_catalog_document,
)
from app.services.specification_catalog.activation_service import (
    SpecificationCatalogActivationService,
)
from app.services.specification_catalog.errors import SpecificationCatalogServiceError
from app.services.specification_catalog.import_service import SpecificationCatalogImportService
from app.services.specification_catalog.mapping import validate_specification_catalog
from app.services.specification_catalog.policy import (
    is_browser_qa_catalog_version,
    is_case1_demo_catalog_version,
)
from app.services.specification_catalog.repository import SpecificationCatalogRepository
from app.services.specification_catalog.validation import validate_persisted_catalog


class SpecificationCatalogBootstrapService:
    def __init__(
        self,
        repository: SpecificationCatalogRepository,
        importer: SpecificationCatalogImportService,
        activator: SpecificationCatalogActivationService,
    ) -> None:
        self.repository = repository
        self.importer = importer
        self.activator = activator

    async def ensure_case1_demo_catalog_active(
        self,
        principal: CurrentPrincipal | None = None,
        *,
        commit: bool = True,
    ) -> SpecificationCatalogVersion:
        if app_settings.is_production:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_DEMO_FORBIDDEN",
                "Демонстрационный specification catalog bootstrap запрещён в production; "
                "импортируйте производственный каталог",
                status_code=403,
                details={"action": "ensure_case1_demo_catalog_active", "demo": True},
            )

        document = bundled_case1_demo_catalog_document()
        validation = validate_specification_catalog(document.items)
        if not validation.is_complete:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_DEMO_INVALID",
                "Case 1 demo specification catalog payload is incomplete",
                status_code=500,
                details={"issues": validation.issues, "demo": True},
            )

        active = await self.repository.find_active_by_key(CASE1_DEMO_CATALOG_KEY)
        if active is not None:
            items = await self.repository.get_items(active.id)
            active_validation = validate_persisted_catalog(
                active,
                items,
                require_authority=True,
                require_schema=False,
            )
            if (
                active.version == CASE1_DEMO_VERSION
                and is_case1_demo_catalog_version(active)
                and active_validation.is_complete
            ):
                return active
            if (
                active_validation.is_complete
                and not is_case1_demo_catalog_version(active)
                and not is_browser_qa_catalog_version(active)
            ):
                return active

        existing = await self.repository.find_by_identity(
            catalog_key=document.catalog_key,
            version=document.version,
        )
        if existing is None:
            existing = await self.importer.import_draft(
                document,
                principal=principal,
                commit=False,
            )
        elif existing.status == "active":
            if commit:
                await self.repository.commit()
            return existing
        elif existing.status != "draft":
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_DEMO_CONFLICT",
                "Case 1 demo catalog version exists but is not draft/active",
                status_code=409,
                details={
                    "catalog_key": existing.catalog_key,
                    "version": existing.version,
                    "status": existing.status,
                    "demo": True,
                },
            )

        if existing.status == "draft":
            result = await self.activator.activate(
                existing.id,
                principal=principal,
                commit=False,
            )
            existing = result.catalog

        if commit:
            await self.repository.commit()
            await self.repository.refresh(existing)
        return existing
