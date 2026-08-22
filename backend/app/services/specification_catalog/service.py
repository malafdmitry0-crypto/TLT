"""Small application facade for specification catalog use cases."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentPrincipal
from app.models.specification import SpecificationCatalogVersion
from app.schemas.specification_catalog import SpecificationCatalogImportRequest
from app.services.specification_catalog.activation_service import (
    SpecificationCatalogActivationService,
)
from app.services.specification_catalog.bootstrap_service import (
    SpecificationCatalogBootstrapService,
)
from app.services.specification_catalog.contracts import (
    ResolvedSpecificationCatalog,
    SpecificationCatalogActivationResult,
)
from app.services.specification_catalog.errors import SpecificationCatalogServiceError
from app.services.specification_catalog.import_service import SpecificationCatalogImportService
from app.services.specification_catalog.repository import SpecificationCatalogRepository
from app.services.specification_catalog.resolution_service import (
    SpecificationCatalogResolutionService,
)


class SpecificationCatalogService:
    def __init__(self, db: AsyncSession):
        repository = SpecificationCatalogRepository(db)
        importer = SpecificationCatalogImportService(repository)
        activator = SpecificationCatalogActivationService(repository)
        self.repository = repository
        self.importer = importer
        self.activator = activator
        self.bootstrapper = SpecificationCatalogBootstrapService(
            repository,
            importer,
            activator,
        )
        self.resolver = SpecificationCatalogResolutionService(repository)

    async def list_versions(
        self,
        *,
        catalog_key: str | None = None,
        status: str | None = None,
    ) -> list[SpecificationCatalogVersion]:
        return await self.repository.list_versions(catalog_key=catalog_key, status=status)

    async def get_version(
        self,
        catalog_version_id: UUID,
        *,
        include_items: bool = True,
    ) -> ResolvedSpecificationCatalog:
        version = await self.repository.get_version(catalog_version_id)
        if version is None:
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VERSION_NOT_FOUND",
                "Версия specification catalog не найдена",
                status_code=404,
            )
        items = await self.repository.get_items(version.id) if include_items else ()
        return ResolvedSpecificationCatalog(version=version, items=items)

    async def import_draft(
        self,
        document: SpecificationCatalogImportRequest,
        *,
        principal: CurrentPrincipal | None = None,
        commit: bool = True,
    ) -> SpecificationCatalogVersion:
        return await self.importer.import_draft(document, principal=principal, commit=commit)

    async def activate(
        self,
        catalog_id: UUID,
        *,
        principal: CurrentPrincipal | None = None,
        commit: bool = True,
    ) -> SpecificationCatalogActivationResult:
        return await self.activator.activate(catalog_id, principal=principal, commit=commit)

    async def ensure_case1_demo_catalog_active(
        self,
        principal: CurrentPrincipal | None = None,
        *,
        commit: bool = True,
    ) -> SpecificationCatalogVersion:
        return await self.bootstrapper.ensure_case1_demo_catalog_active(
            principal,
            commit=commit,
        )

    async def resolve_active(
        self,
        *,
        catalog_id: UUID | str | None = None,
        catalog_version: str | None = None,
    ) -> ResolvedSpecificationCatalog:
        return await self.resolver.resolve_active(
            catalog_id=catalog_id,
            catalog_version=catalog_version,
        )
