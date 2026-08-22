"""Activation orchestration for specification catalog versions."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from app.core.config import settings as app_settings
from app.core.dependencies import CurrentPrincipal
from app.core.specification_metrics import specification_metrics
from app.services.specification_catalog.contracts import SpecificationCatalogActivationResult
from app.services.specification_catalog.errors import SpecificationCatalogServiceError
from app.services.specification_catalog.import_service import principal_reference
from app.services.specification_catalog.policy import (
    UNTRUSTED_SOURCE_TOKENS,
    active_authority_allowed,
    catalog_identity_text,
    is_case1_demo_catalog_version,
    reject_case1_demo_in_production,
)
from app.services.specification_catalog.repository import SpecificationCatalogRepository
from app.services.specification_catalog.validation import activation_validation

_FAILURE_REASONS = {
    "SPEC_CATALOG_VERSION_NOT_FOUND": "not_found",
    "SPEC_CATALOG_ACTIVATION_INVALID": "invalid_state",
    "SPEC_CATALOG_DEMO_FORBIDDEN": "demo_forbidden",
    "SPEC_CATALOG_VALIDATION_FAILED": "validation_failed",
}


class SpecificationCatalogActivationService:
    def __init__(self, repository: SpecificationCatalogRepository):
        self.repository = repository

    async def activate(
        self,
        catalog_id: UUID,
        *,
        principal: CurrentPrincipal | None = None,
        commit: bool = True,
    ) -> SpecificationCatalogActivationResult:
        try:
            return await self._activate(catalog_id, principal=principal, commit=commit)
        except SpecificationCatalogServiceError as exc:
            specification_metrics.observe_catalog_failure(
                operation="activation",
                reason=_FAILURE_REASONS.get(exc.code, "catalog_error"),
            )
            raise
        except Exception:
            specification_metrics.observe_catalog_failure(
                operation="activation",
                reason="unexpected",
            )
            raise

    async def _activate(
        self,
        catalog_id: UUID,
        *,
        principal: CurrentPrincipal | None,
        commit: bool,
    ) -> SpecificationCatalogActivationResult:
        target = await self.repository.lock_draft_for_activation(catalog_id)
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

        items = await self.repository.get_items(target.id)
        validation = activation_validation(target, items)
        target.item_count = len(items)
        target.is_complete = validation.is_complete
        target.validation_issues = validation.issues
        reject_case1_demo_in_production(target, action="activate")
        allow_bundled_demo = not app_settings.is_production and is_case1_demo_catalog_version(
            target
        )
        source_is_untrusted = any(
            token in catalog_identity_text(target) for token in UNTRUSTED_SOURCE_TOKENS
        )
        if (
            not active_authority_allowed(target)
            or (source_is_untrusted and not allow_bundled_demo)
            or not validation.is_complete
        ):
            if commit:
                await self.repository.commit()
            else:
                await self.repository.flush()
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_VALIDATION_FAILED",
                "Specification catalog не является полным авторитетным источником",
                status_code=422,
                details={"issues": validation.issues, "authority": target.authority},
            )

        versions = await self.repository.lock_versions_for_key(target.catalog_key)
        previous = next((item for item in versions if item.status == "active"), None)
        if previous is not None:
            previous.status = "retired"
            await self.repository.flush()

        target.status = "active"
        target.activated_at = datetime.now(UTC)
        target.activated_by = principal_reference(principal)
        await self.repository.flush()
        stale_count = await self.repository.mark_specifications_stale(target)
        if commit:
            await self.repository.commit()
        else:
            await self.repository.flush()
        await self.repository.refresh(target)
        return SpecificationCatalogActivationResult(
            catalog=target,
            stale_specification_count=stale_count,
        )
