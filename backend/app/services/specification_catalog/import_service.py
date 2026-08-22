"""Import orchestration for immutable specification catalog drafts."""

from __future__ import annotations

import re

from app.core.dependencies import CurrentPrincipal
from app.core.specification_metrics import specification_metrics
from app.models.specification import SpecificationCatalogItem, SpecificationCatalogVersion
from app.schemas.specification_catalog import SpecificationCatalogImportRequest
from app.services.specification_catalog.errors import SpecificationCatalogServiceError
from app.services.specification_catalog.mapping import (
    canonical_catalog_checksum,
    validate_specification_catalog,
)
from app.services.specification_catalog.repository import SpecificationCatalogRepository

_SHA256_RE = re.compile(r"sha256:[0-9a-f]{64}")
_INVALID_CONDITION_REASONS = {
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
_FAILURE_REASONS = {
    "SPEC_CATALOG_IMPORT_INVALID": "invalid_document",
    "SPEC_CATALOG_VERSION_CONFLICT": "version_conflict",
}


def principal_reference(principal: CurrentPrincipal | None) -> str | None:
    if principal is None:
        return None
    if principal.user_id is not None:
        return f"user:{principal.user_id}"
    if principal.session_id:
        return f"guest:{principal.session_id}"
    return principal.role


class SpecificationCatalogImportService:
    def __init__(self, repository: SpecificationCatalogRepository):
        self.repository = repository

    async def import_draft(
        self,
        document: SpecificationCatalogImportRequest,
        *,
        principal: CurrentPrincipal | None = None,
        commit: bool = True,
    ) -> SpecificationCatalogVersion:
        try:
            return await self._import_draft(document, principal=principal, commit=commit)
        except SpecificationCatalogServiceError as exc:
            specification_metrics.observe_catalog_failure(
                operation="import",
                reason=_FAILURE_REASONS.get(exc.code, "catalog_error"),
            )
            raise
        except Exception:
            specification_metrics.observe_catalog_failure(
                operation="import",
                reason="unexpected",
            )
            raise

    async def _import_draft(
        self,
        document: SpecificationCatalogImportRequest,
        *,
        principal: CurrentPrincipal | None,
        commit: bool,
    ) -> SpecificationCatalogVersion:
        if not _SHA256_RE.fullmatch(document.source_checksum):
            raise SpecificationCatalogServiceError(
                "SPEC_CATALOG_IMPORT_INVALID",
                "source_checksum должен быть SHA-256",
                status_code=422,
            )
        duplicate = await self.repository.find_duplicate_id(
            catalog_key=document.catalog_key,
            version=document.version,
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
            if issue.get("reason") in _INVALID_CONDITION_REASONS
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
            payload_checksum=canonical_catalog_checksum(canonical_items),
            schema_version=document.schema_version,
            item_count=len(document.items),
            is_complete=validation.is_complete,
            validation_issues=validation.issues,
            imported_by=principal_reference(principal),
        )
        self.repository.add_version(version)
        await self.repository.flush()
        items = []
        for position, item in enumerate(document.items):
            payload = item.model_dump(mode="json")
            items.append(
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
                    row_checksum=canonical_catalog_checksum(payload),
                    position=position,
                )
            )
        self.repository.add_items(items)
        if commit:
            await self.repository.commit()
        else:
            await self.repository.flush()
        await self.repository.refresh(version)
        return version
