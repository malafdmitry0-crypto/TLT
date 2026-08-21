"""Versioned, fail-closed catalog lifecycle for specification generation."""

from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from heatcalc_specification_core.catalog import (
    CatalogCategory as CoreCatalogCategory,
)
from heatcalc_specification_core.catalog import (
    CatalogContentItem,
    validate_catalog_content,
)
from heatcalc_specification_core.json_types import json_object
from pydantic import ValidationError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings as app_settings
from app.core.dependencies import CurrentPrincipal
from app.models.specification import (
    Specification,
    SpecificationCatalogItem,
    SpecificationCatalogVersion,
)
from app.reference_data.specification_catalog_case1_demo import (
    CASE1_DEMO_BOX_NA_DECISION_REF,
    CASE1_DEMO_CATALOG_KEY,
    CASE1_DEMO_EX_RGR_NA_DECISION_REF,
    CASE1_DEMO_SCHEMA_VERSION,
    CASE1_DEMO_VERSION,
    bundled_case1_demo_catalog_document,
    case1_demo_payload_checksum,
    is_case1_demo_item_source,
    is_case1_demo_source,
)
from app.schemas.specification_catalog import (
    SpecificationCatalogAuthority,
    SpecificationCatalogImportRequest,
    SpecificationCatalogItemInput,
)

_SHA256_RE = re.compile(r"sha256:[0-9a-f]{64}")
_UNTRUSTED_SOURCE_TOKENS = ("provisional", "synthetic", "demo", "guess", "mock")


def _catalog_identity_text(version: SpecificationCatalogVersion) -> str:
    return f"{version.catalog_key} {version.version} {version.source}".casefold()


def is_case1_demo_catalog_version(version: SpecificationCatalogVersion) -> bool:
    """True only for the exact immutable bundled Case 1 demo identity."""
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
    """Browser QA fixtures are never specification catalog authority."""
    return str(version.version or "").casefold().startswith("browser-qa-")


def _has_untrusted_catalog_identity(version: SpecificationCatalogVersion) -> bool:
    return any(token in _catalog_identity_text(version) for token in _UNTRUSTED_SOURCE_TOKENS)


def _catalog_uses_case1_demo_markers(
    item_inputs: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]]
    | list[SpecificationCatalogItemInput],
) -> bool:
    """Keep bundled demo exceptions scoped to the exact immutable catalog."""
    demo_refs = {
        CASE1_DEMO_BOX_NA_DECISION_REF,
        CASE1_DEMO_EX_RGR_NA_DECISION_REF,
    }
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


def _catalog_demo_markers_compatible(
    version: SpecificationCatalogVersion,
    item_inputs: list[tuple[SpecificationCatalogItem, SpecificationCatalogItemInput]]
    | list[SpecificationCatalogItemInput],
) -> bool:
    return not _catalog_uses_case1_demo_markers(item_inputs) or is_case1_demo_catalog_version(
        version
    )


def _active_authority_allowed(version: SpecificationCatalogVersion) -> bool:
    """Only owner-approved rows or the exact local bundled demo may be active."""
    return version.authority == SpecificationCatalogAuthority.APPROVED.value or (
        not app_settings.is_production
        and version.authority == SpecificationCatalogAuthority.DEMO.value
        and is_case1_demo_catalog_version(version)
    )


def _reject_case1_demo_in_production(
    version: SpecificationCatalogVersion,
    *,
    action: str,
) -> None:
    """The bundled Case 1 catalog is explicitly non-production."""
    if not app_settings.is_production:
        return
    if not is_case1_demo_catalog_version(version):
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


def canonical_catalog_checksum(payload: Any) -> str:
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
        actual_row_checksum = canonical_catalog_checksum(payload)
        if persisted.row_checksum != actual_row_checksum:
            issues.append(
                _issue(
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
    """Adapt the HTTP/Pydantic boundary to the pure core validator."""
    result = validate_catalog_content([_core_catalog_item(item) for item in items])
    return SpecificationCatalogValidation(
        is_complete=result.is_complete,
        issues=[dict(issue.to_dict()) for issue in result.issues],
    )


def _core_catalog_item(item: SpecificationCatalogItemInput) -> CatalogContentItem:
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

    async def _persisted_validation(
        self,
        version: SpecificationCatalogVersion,
    ) -> tuple[SpecificationCatalogValidation, tuple[SpecificationCatalogItem, ...]]:
        """Revalidate immutable rows before relying on an old ``is_complete`` flag."""
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
        item_inputs, persisted_item_issues = _persisted_item_inputs(list(items))
        validation_issues = [
            *persisted_item_issues,
            *validate_specification_catalog([item for _, item in item_inputs]).issues,
            *_validate_catalog_checksums(version, item_inputs),
        ]
        if not _active_authority_allowed(version):
            validation_issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "catalog_authority_not_compatible",
                    details={"authority": version.authority},
                )
            )
        if _has_untrusted_catalog_identity(version) and not is_case1_demo_catalog_version(version):
            validation_issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "catalog_source_not_compatible",
                )
            )
        if not _catalog_demo_markers_compatible(version, item_inputs):
            validation_issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "catalog_demo_item_source_not_compatible",
                )
            )
        return (
            SpecificationCatalogValidation(
                is_complete=(
                    version.schema_version == CASE1_DEMO_SCHEMA_VERSION
                    and len(items) == version.item_count
                    and not validation_issues
                ),
                issues=validation_issues,
            ),
            items,
        )

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
        commit: bool = True,
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
            payload_checksum=canonical_catalog_checksum(canonical_items),
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
                    row_checksum=canonical_catalog_checksum(payload),
                    position=position,
                )
            )
        if commit:
            await self.db.commit()
            await self.db.refresh(version)
        else:
            await self.db.flush()
            await self.db.refresh(version)
        return version

    async def activate(
        self,
        catalog_id: UUID,
        *,
        principal: CurrentPrincipal | None = None,
        commit: bool = True,
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
        if target.schema_version != CASE1_DEMO_SCHEMA_VERSION:
            validation_issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "unsupported_catalog_schema_version",
                    details={
                        "actual": target.schema_version,
                        "supported": CASE1_DEMO_SCHEMA_VERSION,
                    },
                )
            )
        if not _catalog_demo_markers_compatible(target, item_inputs):
            validation_issues.append(
                _issue(
                    "SPEC_ACCESSORY_CATALOG_INCOMPLETE",
                    "catalog_demo_item_source_not_compatible",
                )
            )
        validation = SpecificationCatalogValidation(
            is_complete=not validation_issues,
            issues=validation_issues,
        )
        target.item_count = len(items)
        target.is_complete = validation.is_complete
        target.validation_issues = validation.issues
        # Production must never activate a demo seed even if authority looks approved.
        _reject_case1_demo_in_production(target, action="activate")
        source_text = _catalog_identity_text(target)
        allow_bundled_demo = not app_settings.is_production and is_case1_demo_catalog_version(
            target
        )
        if (
            not _active_authority_allowed(target)
            or (
                any(token in source_text for token in _UNTRUSTED_SOURCE_TOKENS)
                and not allow_bundled_demo
            )
            or not validation.is_complete
        ):
            if commit:
                await self.db.commit()
            else:
                await self.db.flush()
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
                Specification.snapshot["catalog"]["catalog_key"].astext == target.catalog_key,
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
        if commit:
            await self.db.commit()
        else:
            await self.db.flush()
        await self.db.refresh(target)
        return SpecificationCatalogActivationResult(
            catalog=target,
            stale_specification_count=stale_count,
        )

    async def ensure_case1_demo_catalog_active(
        self,
        principal: CurrentPrincipal | None = None,
        *,
        commit: bool = True,
    ) -> SpecificationCatalogVersion:
        """Bootstrap the immutable Case 1 demo catalog in non-production only.

        A saved ``is_complete`` bit is never enough: browser-QA, legacy-schema,
        and corrupted active versions are retired through normal activation and
        replaced with this document.  A healthy non-demo catalog is left intact.
        """
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

        active = await self.db.scalar(
            select(SpecificationCatalogVersion).where(
                SpecificationCatalogVersion.catalog_key == CASE1_DEMO_CATALOG_KEY,
                SpecificationCatalogVersion.status == "active",
            )
        )
        if active is not None:
            active_validation, _ = await self._persisted_validation(active)
            if (
                active.version == CASE1_DEMO_VERSION
                and is_case1_demo_catalog_version(active)
                and active_validation.is_complete
            ):
                return active
            # A healthy, current, non-demo catalog belongs to its importer.
            # Explicit browser-qa, old schema, and validation failures are replaced.
            if (
                active_validation.is_complete
                and not is_case1_demo_catalog_version(active)
                and not is_browser_qa_catalog_version(active)
            ):
                return active

        existing = await self.db.scalar(
            select(SpecificationCatalogVersion).where(
                SpecificationCatalogVersion.catalog_key == document.catalog_key,
                SpecificationCatalogVersion.version == document.version,
            )
        )
        if existing is None:
            existing = await self.import_draft(document, principal=principal, commit=False)
        elif existing.status == "active":
            if commit:
                await self.db.commit()
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
            result = await self.activate(existing.id, principal=principal, commit=False)
            existing = result.catalog

        if commit:
            await self.db.commit()
            await self.db.refresh(existing)
        return existing

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
        # Production must not generate BOM from a demo catalog even if it was
        # already active before the environment switch.
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
        if not _active_authority_allowed(version) or not version.is_complete:
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
        if _has_untrusted_catalog_identity(version) and not is_case1_demo_catalog_version(version):
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
        persisted_validation, items = await self._persisted_validation(version)
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
