"""Import, activate and expose immutable electrical catalog versions."""

from __future__ import annotations

import hashlib
import json
import re
from collections import defaultdict
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, cast
from uuid import UUID

from sqlalchemy import func, select, tuple_, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.models.electrical_calculation import ElectricalCalculation
from app.models.electrical_candidate import ElectricalCandidate
from app.models.electrical_catalog_version import ElectricalCatalogVersion
from app.models.specification import Specification
from app.reference_data.loader import (
    electrical_catalog_file_checksum,
    electrical_tt_bom_metadata,
    list_electrical_tt_bom_entries,
    list_tt_cables,
    section_catalog_meta,
    section_catalog_payload_snapshot,
    tt_cables_source_checksum,
)
from app.schemas.electrical_catalog import (
    ElectricalCatalogActivationResponse,
    ElectricalCatalogImportDocument,
    ElectricalCatalogKind,
    ElectricalCatalogMetadataResponse,
    ElectricalCatalogVersionResponse,
)
from app.services.audit_service import AuditService
from app.services.electrical_assignment_service import ElectricalAssignmentService

_SHA256_RE = re.compile(r"^sha256:[0-9a-f]{64}$")
_POWER_MODELS = 14
_SECTION_ROWS = 126
_BOM_ROWS = 18
_TT_MODELS = {
    "10ТТН2",
    "17ТТН2",
    "25ТТН2",
    "31ТТН2",
    "15ТТВ2",
    "30ТТВ2",
    "45ТТВ2",
    "60ТТВ2",
    "15ТТХ2",
    "30ТТХ2",
    "45ТТХ2",
    "60ТТХ2",
    "75ТТХ2",
    "90ТТХ2",
}
_SECTION_TEMPERATURES = {10, 5, 0, -5, -10, -15, -20, -30, -40}
_BOM_MARKS = {
    *(f"{model}-СТ" for model in ("10ТТН2", "17ТТН2", "25ТТН2", "31ТТН2")),
    *(f"{model}-СР" for model in _TT_MODELS),
}
_CATALOG_LOCK_KEYS = {"power": 3401, "section": 3402, "bom": 3403}
_BUNDLED_CATALOG_ORDER: tuple[ElectricalCatalogKind, ...] = ("power", "section", "bom")
_BUNDLED_POWER_VERSION = "tt-power-case1-r2-2026-08-05-2de59c70"
_BUNDLED_SECTION_VERSION = "tt-section-case1-r2-2026-08-05-6d8cbfa9"
_BUNDLED_BOM_VERSION = "selfreg-spec-2026-05-29-3f1556a4"
_BUNDLED_APPROVAL_REFERENCE = "case-1-review-10-2026-08-03"


class ElectricalCatalogServiceError(Exception):
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
        return {
            "code": self.code,
            "message": self.message,
            "issues": [],
            "details": self.details,
        }


def _principal_reference(principal: CurrentPrincipal) -> str | None:
    return str(principal.user_id) if principal.user_id is not None else principal.session_id


def _canonical_checksum(payload: Any) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    ).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def bundled_electrical_catalog_documents() -> (
    dict[ElectricalCatalogKind, ElectricalCatalogImportDocument]
):
    """Build the immutable approved catalog set shipped with this release.

    Passport power and product-temperature limits are registered exactly as
    supplied. Section rows retain the source-workbook checksum; working voltage
    is a downstream user input and is not a cable-candidate criterion.
    """
    power_payload = {"rows": list_tt_cables()}
    section_payload = section_catalog_payload_snapshot()
    section_metadata = section_catalog_meta()
    bom_payload = {"entries": list_electrical_tt_bom_entries()}
    bom_metadata = electrical_tt_bom_metadata()

    power_source_checksum = tt_cables_source_checksum()
    import_checksums = {
        kind: electrical_catalog_file_checksum(kind) for kind in _BUNDLED_CATALOG_ORDER
    }
    versions: dict[ElectricalCatalogKind, str] = {
        "power": _BUNDLED_POWER_VERSION,
        "section": _BUNDLED_SECTION_VERSION,
        "bom": _BUNDLED_BOM_VERSION,
    }
    for kind, version in versions.items():
        checksum_prefix = import_checksums[kind].removeprefix("sha256:")[:8]
        if not version.endswith(checksum_prefix):
            raise RuntimeError(f"Bundled {kind} catalog version does not match its import checksum")

    return {
        "power": ElectricalCatalogImportDocument(
            version=_BUNDLED_POWER_VERSION,
            source="backend/app/reference_data/cables_tt.json",
            source_checksum=power_source_checksum,
            import_checksum=import_checksums["power"],
            schema_version=2,
            payload=power_payload,
            production_approved=True,
            diagnostics=[
                {
                    "code": "ELECTRICAL_BUNDLED_CATALOG_APPROVED",
                    "approval_reference": _BUNDLED_APPROVAL_REFERENCE,
                    "selection_contract": "case1-r4-passport-power",
                }
            ],
        ),
        "section": ElectricalCatalogImportDocument(
            version=_BUNDLED_SECTION_VERSION,
            source=str(
                section_metadata.get("source") or "backend/app/reference_data/section_catalog.json"
            ),
            source_checksum=str(
                section_metadata.get("source_checksum") or import_checksums["section"]
            ),
            import_checksum=import_checksums["section"],
            schema_version=int(section_metadata.get("schema_version") or 1),
            payload=section_payload,
            production_approved=True,
            diagnostics=[
                {
                    "code": "ELECTRICAL_BUNDLED_CATALOG_APPROVED",
                    "approval_reference": _BUNDLED_APPROVAL_REFERENCE,
                    "lookup_contract": "case1-r4-mark-and-switch-temperature",
                }
            ],
        ),
        "bom": ElectricalCatalogImportDocument(
            version=_BUNDLED_BOM_VERSION,
            source=str(
                bom_metadata.get("source") or "backend/app/reference_data/electrical_tt_bom_v1.json"
            ),
            source_checksum=str(bom_metadata.get("source_checksum") or import_checksums["bom"]),
            import_checksum=import_checksums["bom"],
            schema_version=int(bom_metadata.get("schema_version") or 1),
            payload=bom_payload,
            production_approved=True,
            diagnostics=[
                {
                    "code": "ELECTRICAL_BUNDLED_CATALOG_APPROVED",
                    "approval_reference": _BUNDLED_APPROVAL_REFERENCE,
                }
            ],
        ),
    }


def _rows(payload: Mapping[str, Any], kind: str) -> list[Any]:
    key = {"power": "rows", "section": "rows", "bom": "entries"}[kind]
    value = payload.get(key)
    if kind == "power" and value is None:
        value = payload.get("cables")
    return list(value) if isinstance(value, list) else []


def _positive(value: Any) -> bool:
    try:
        number = Decimal(str(value))
        return number.is_finite() and number > 0
    except (InvalidOperation, TypeError, ValueError):
        return False


def _validate_rows(kind: str, payload: Mapping[str, Any]) -> tuple[int, int, list[dict[str, Any]]]:
    rows = _rows(payload, kind)
    diagnostics: list[dict[str, Any]] = []
    valid = 0
    seen_primary: set[str] = set()
    seen_secondary: set[str] = set()
    expected = {"power": _POWER_MODELS, "section": _SECTION_ROWS, "bom": _BOM_ROWS}[kind]
    if len(rows) != expected:
        diagnostics.append(
            {
                "code": "ELECTRICAL_CATALOG_ROW_COUNT_INVALID",
                "expected": expected,
                "actual": len(rows),
            }
        )
    for index, raw in enumerate(rows):
        errors: list[str] = []
        row = raw if isinstance(raw, Mapping) else {}
        if kind == "power":
            primary = str(row.get("model") or "").strip()
            if not primary:
                errors.append("model_required")
            elif primary not in _TT_MODELS:
                errors.append("model_not_in_tt_mvp")
            if not _positive(row.get("nominal_power")):
                errors.append("nominal_power_required")
            if not _positive(row.get("max_product_temp")):
                errors.append("max_product_temp_required")
            secondary = ""
        elif kind == "section":
            primary = str(row.get("base_model") or row.get("mark") or "").strip()
            temperature = row.get("cold_start_temperature_c")
            secondary = f"{primary}\x00{temperature}"
            if not primary or temperature is None:
                errors.append("model_and_temperature_required")
            elif primary not in _TT_MODELS or temperature not in _SECTION_TEMPERATURES:
                errors.append("model_or_temperature_not_in_tt_mvp")
            specific_start_current = row.get(
                "specific_start_current_a_per_m",
                row.get("i_st_ud_a_per_m"),
            )
            if not _positive(row.get("l_max_m")) or not _positive(specific_start_current):
                errors.append("section_values_invalid")
        else:
            primary = str(row.get("full_mark") or "").strip()
            secondary = str(row.get("nomenclature_code") or "").strip()
            if not primary or not secondary:
                errors.append("full_mark_and_code_required")
            elif primary not in _BOM_MARKS:
                errors.append("full_mark_not_in_tt_mvp")
        if primary in seen_primary and kind != "section":
            errors.append("duplicate_primary_key")
        if secondary and secondary in seen_secondary:
            errors.append("duplicate_secondary_key")
        seen_primary.add(primary)
        if secondary:
            seen_secondary.add(secondary)
        if errors:
            diagnostics.append(
                {"code": "ELECTRICAL_CATALOG_ROW_INVALID", "row": index, "errors": errors}
            )
        else:
            valid += 1
    rejected = len(rows) - valid
    if not rows:
        rejected = max(rejected, 1)
        diagnostics.append({"code": "ELECTRICAL_CATALOG_PAYLOAD_EMPTY"})
    if len(rows) != expected:
        rejected = max(rejected, 1)
    return valid, rejected, diagnostics


class ElectricalCatalogService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def metadata(self) -> ElectricalCatalogMetadataResponse:
        active = await self._active_rows()
        missing = [kind for kind in ("power", "section", "bom") if kind not in active]
        if settings.is_production:
            catalogs = [
                self._public_metadata(active[kind])
                for kind in ("power", "section", "bom")
                if kind in active
            ]
        else:
            catalogs = [
                self._public_metadata(active[kind])
                if kind in active
                else self._static_fallback(kind)
                for kind in ("power", "section", "bom")
            ]
        return ElectricalCatalogMetadataResponse(
            catalogs=catalogs,
            production_ready=not missing,
            missing_active_kinds=missing,
        )

    @staticmethod
    def _public_metadata(
        row: ElectricalCatalogVersion,
    ) -> ElectricalCatalogVersionResponse:
        """Expose engineering identity without leaking audit principals."""
        return ElectricalCatalogVersionResponse.model_validate(row).model_copy(
            update={"imported_by": None, "activated_by": None}
        )

    async def active_calculation_catalogs(self) -> dict[str, dict[str, Any]]:
        """Resolve one calculation catalog set, preferring DB over bundled data.

        Missing active rows use the approved immutable bundled snapshot. Database
        failures and malformed active payloads are never converted into fallback.
        Shared transaction locks keep the set stable through calculation commit.
        """
        for kind in ("power", "section", "bom"):
            await self.db.execute(
                select(func.pg_advisory_xact_lock_shared(_CATALOG_LOCK_KEYS[kind]))
            )
        active = await self._active_rows()
        resolved: dict[str, dict[str, Any]] = {}
        for kind in ("power", "section", "bom"):
            row = active.get(kind)
            if row is not None:
                resolved[kind] = {
                    "id": str(row.id),
                    "kind": row.kind,
                    "version": row.version,
                    "status": row.status,
                    "source": row.source,
                    "source_checksum": row.source_checksum,
                    "import_checksum": row.import_checksum,
                    "payload_checksum": row.payload_checksum,
                    "schema_version": row.schema_version,
                    "production_approved": row.production_approved,
                    "authority": "database",
                    "payload": row.payload,
                }
            else:
                resolved[kind] = self._static_calculation_fallback(kind)
        return resolved

    async def _active_rows(self) -> dict[str, ElectricalCatalogVersion]:
        result = await self.db.execute(
            select(ElectricalCatalogVersion)
            .where(ElectricalCatalogVersion.status == "active")
            .order_by(ElectricalCatalogVersion.kind)
        )
        return {row.kind: row for row in result.scalars().all()}

    async def import_draft(
        self,
        kind: ElectricalCatalogKind,
        document: ElectricalCatalogImportDocument,
        principal: CurrentPrincipal,
        *,
        commit: bool = True,
    ) -> ElectricalCatalogVersion:
        if not document.version.strip() or not document.source.strip():
            raise ElectricalCatalogServiceError(
                "ELECTRICAL_CATALOG_IMPORT_INVALID",
                "Версия и источник каталога обязательны",
                status_code=422,
            )
        if not _SHA256_RE.fullmatch(document.source_checksum):
            raise ElectricalCatalogServiceError(
                "ELECTRICAL_CATALOG_IMPORT_INVALID",
                "source_checksum должен быть SHA-256",
                status_code=422,
            )
        if not _SHA256_RE.fullmatch(document.import_checksum):
            raise ElectricalCatalogServiceError(
                "ELECTRICAL_CATALOG_IMPORT_INVALID",
                "import_checksum должен быть SHA-256",
                status_code=422,
            )
        if document.schema_version < 1:
            raise ElectricalCatalogServiceError(
                "ELECTRICAL_CATALOG_IMPORT_INVALID",
                "schema_version должен быть положительным",
                status_code=422,
            )
        duplicate = await self.db.scalar(
            select(ElectricalCatalogVersion.id).where(
                ElectricalCatalogVersion.kind == kind,
                ElectricalCatalogVersion.version == document.version.strip(),
            )
        )
        if duplicate is not None:
            raise ElectricalCatalogServiceError(
                "ELECTRICAL_CATALOG_VERSION_CONFLICT",
                "Версия каталога уже зарегистрирована",
                status_code=409,
            )
        valid, rejected, validation_diagnostics = _validate_rows(kind, document.payload)
        row = ElectricalCatalogVersion(
            kind=kind,
            version=document.version.strip(),
            status="draft",
            source=document.source.strip(),
            source_checksum=document.source_checksum,
            import_checksum=document.import_checksum,
            payload_checksum=_canonical_checksum(document.payload),
            schema_version=document.schema_version,
            payload=document.payload,
            valid_row_count=valid,
            rejected_row_count=rejected,
            diagnostics=[*document.diagnostics, *validation_diagnostics],
            production_approved=document.production_approved,
            imported_by=_principal_reference(principal),
        )
        self.db.add(row)
        await self.db.flush()
        await AuditService(self.db).stage(
            event_type="admin.electrical_catalog.imported",
            category="system",
            principal=principal,
            requirement_refs=["BE-14", "BE-22"],
            details={
                "catalog_id": str(row.id),
                "kind": kind,
                "version": row.version,
                "payload_checksum": row.payload_checksum,
                "valid_row_count": valid,
                "rejected_row_count": rejected,
            },
            message="Imported draft electrical catalog",
        )
        if commit:
            await self.db.commit()
            await self.db.refresh(row)
        else:
            await self.db.flush()
        return row

    async def activate(
        self,
        catalog_id: UUID,
        principal: CurrentPrincipal,
        *,
        commit: bool = True,
    ) -> ElectricalCatalogActivationResponse:
        try:
            target = await self.db.scalar(
                select(ElectricalCatalogVersion)
                .where(ElectricalCatalogVersion.id == catalog_id)
                .with_for_update()
            )
            if target is None:
                raise ElectricalCatalogServiceError(
                    "ELECTRICAL_CATALOG_VERSION_NOT_FOUND",
                    "Версия каталога не найдена",
                    status_code=404,
                )
            await self.db.execute(
                select(func.pg_advisory_xact_lock(_CATALOG_LOCK_KEYS[target.kind]))
            )
            await self.db.execute(
                select(ElectricalCatalogVersion.id)
                .where(ElectricalCatalogVersion.kind == target.kind)
                .with_for_update()
            )
            if target.status != "draft":
                raise ElectricalCatalogServiceError(
                    "ELECTRICAL_CATALOG_ACTIVATION_INVALID",
                    "Активировать можно только draft-версию",
                    status_code=409,
                )
            if target.rejected_row_count or not target.valid_row_count:
                raise ElectricalCatalogServiceError(
                    "ELECTRICAL_CATALOG_VALIDATION_FAILED",
                    "Каталог содержит отклонённые строки",
                    status_code=422,
                    details={"diagnostics": target.diagnostics},
                )
            source_text = f"{target.version} {target.source}".lower()
            if target.kind == "power" and (
                not target.production_approved
                or "provisional" in source_text
                or "unapproved" in source_text
            ):
                raise ElectricalCatalogServiceError(
                    "ELECTRICAL_CATALOG_SOURCE_UNREGISTERED",
                    "Power-каталог не утверждён для production",
                    status_code=422,
                )
            previous = await self.db.scalar(
                select(ElectricalCatalogVersion)
                .where(
                    ElectricalCatalogVersion.kind == target.kind,
                    ElectricalCatalogVersion.status == "active",
                )
                .with_for_update()
            )
            if previous is not None:
                previous.status = "retired"
                await self.db.flush()
            target.status = "active"
            target.activated_at = datetime.now(UTC)
            target.activated_by = _principal_reference(principal)
            (
                stale_calculations,
                stale_assignments,
                stale_specifications,
            ) = await self._mark_dependents_stale(target)
            await AuditService(self.db).stage(
                event_type="admin.electrical_catalog.activated",
                category="system",
                principal=principal,
                requirement_refs=["AC-BE-23", "BE-22"],
                before_state=(
                    {"catalog_id": str(previous.id), "version": previous.version}
                    if previous is not None
                    else None
                ),
                after_state={"catalog_id": str(target.id), "version": target.version},
                details={
                    "kind": target.kind,
                    "stale_calculations": stale_calculations,
                    "stale_assignments": stale_assignments,
                    "stale_specifications": stale_specifications,
                },
                message="Activated electrical catalog",
            )
            if commit:
                await self.db.commit()
                await self.db.refresh(target)
            else:
                await self.db.flush()
            return ElectricalCatalogActivationResponse(
                catalog=ElectricalCatalogVersionResponse.model_validate(target),
                stale_calculations=stale_calculations,
                stale_assignments=stale_assignments,
                stale_specifications=stale_specifications,
            )
        except Exception:
            await self.db.rollback()
            raise

    async def ensure_bundled_catalogs_active(
        self,
        principal: CurrentPrincipal,
        *,
        commit: bool = True,
    ) -> dict[str, ElectricalCatalogVersion]:
        """Register bundled catalogs and roll forward an older bundled version.

        A custom active source remains authoritative. A bundled active source is
        upgraded to the release version so activation stales old calculations.
        """
        documents = bundled_electrical_catalog_documents()
        active = await self._active_rows()

        for kind in _BUNDLED_CATALOG_ORDER:
            document = documents[kind]
            current = active.get(kind)
            if current is not None and (
                current.version == document.version or current.source != document.source
            ):
                continue
            row = await self.db.scalar(
                select(ElectricalCatalogVersion).where(
                    ElectricalCatalogVersion.kind == kind,
                    ElectricalCatalogVersion.version == document.version,
                )
            )
            if row is None:
                row = await self.import_draft(
                    kind,
                    document,
                    principal,
                    commit=False,
                )
            if row.status != "draft":
                raise ElectricalCatalogServiceError(
                    "ELECTRICAL_CATALOG_BOOTSTRAP_CONFLICT",
                    "Встроенную версию каталога нельзя активировать повторно",
                    status_code=409,
                    details={"kind": kind, "version": row.version, "status": row.status},
                )
            await self.activate(row.id, principal, commit=False)
            active = await self._active_rows()

        if commit:
            await self.db.commit()
        return await self._active_rows()

    async def _mark_dependents_stale(
        self, target: ElectricalCatalogVersion
    ) -> tuple[int, int, int]:
        result = await self.db.execute(
            select(ElectricalCalculation)
            .where(ElectricalCalculation.cable_type == "self_regulating_tt")
            .with_for_update()
        )
        affected: dict[tuple[UUID, UUID], UUID] = {}
        stale_calculations = 0
        for calculation in result.scalars().all():
            saved = self._saved_catalog(calculation.results, target.kind)
            if saved.get("id") == str(target.id):
                continue
            previous = dict(calculation.results or {})
            if previous.get("category") != "stale":
                stale_calculations += 1
            calculation.results = {
                **previous,
                "stale": True,
                "category": "stale",
                "stale_reason": f"{target.kind}_catalog_activated",
                "error_code": "ELECTRICAL_RECALCULATION_REQUIRED",
                "message": "Активная версия электрического каталога изменилась",
            }
            if calculation.electrical_variant_id is not None:
                affected[(calculation.electrical_variant_id, calculation.object_id)] = (
                    calculation.project_id
                )
        if not affected:
            return stale_calculations, 0, 0
        await self.db.execute(
            update(ElectricalCandidate)
            .where(
                tuple_(
                    ElectricalCandidate.electrical_variant_id,
                    ElectricalCandidate.object_id,
                ).in_(list(affected)),
            )
            .values(status="stale", is_applied=False)
        )
        variants = {variant_id for variant_id, _object_id in affected}
        stale_specifications = int(
            await self.db.scalar(
                select(func.count())
                .select_from(Specification)
                .where(
                    Specification.electrical_variant_id.in_(variants),
                    Specification.is_stale.is_(False),
                )
            )
            or 0
        )
        by_variant: dict[tuple[UUID, UUID], list[UUID]] = defaultdict(list)
        for (variant_id, object_id), project_id in affected.items():
            by_variant[(project_id, variant_id)].append(object_id)
        assignment_service = ElectricalAssignmentService(self.db)
        stale_assignments = 0
        for (project_id, variant_id), object_ids in by_variant.items():
            stale_assignments += await assignment_service.mark_assignments_stale(
                project_id,
                variant_id,
                object_ids,
                reason=f"{target.kind}_catalog_activated",
                operation="electrical_catalog_activation",
            )
        return stale_calculations, stale_assignments, stale_specifications

    @staticmethod
    def _saved_catalog(results: dict[str, Any] | None, kind: str) -> Mapping[str, Any]:
        if not isinstance(results, Mapping):
            return {}
        catalogs = results.get("catalogs")
        if not isinstance(catalogs, Mapping):
            provenance = results.get("provenance")
            catalogs = provenance.get("catalogs") if isinstance(provenance, Mapping) else None
        value = catalogs.get(kind) if isinstance(catalogs, Mapping) else None
        return value if isinstance(value, Mapping) else {}

    @staticmethod
    def _static_fallback(kind: str) -> ElectricalCatalogVersionResponse:
        typed_kind = cast(ElectricalCatalogKind, kind)
        now = None
        if kind == "power":
            rows = list_tt_cables()
            raw: dict[str, Any] = {
                "version": "tt-power-case1-v2-provisional",
                "status": "draft",
                "source": "backend/app/reference_data/cables_tt.json",
                "source_checksum": tt_cables_source_checksum(),
                "schema_version": 2,
                "production_approved": False,
                "diagnostics": [{"code": "ELECTRICAL_POWER_CATALOG_PROVISIONAL"}],
            }
            payload = {"rows": rows}
        elif kind == "section":
            meta = section_catalog_meta()
            raw = {
                **meta,
                "status": "active",
                "production_approved": True,
                "diagnostics": [],
            }
            payload = section_catalog_payload_snapshot()
        else:
            meta = electrical_tt_bom_metadata()
            raw = {
                **meta,
                "status": "active",
                "production_approved": True,
                "diagnostics": [],
            }
            payload = {"entries": list_electrical_tt_bom_entries()}
        return ElectricalCatalogVersionResponse(
            id=None,
            kind=typed_kind,
            version=str(raw.get("version") or "unknown"),
            status=raw["status"],
            source=str(raw.get("source") or ""),
            source_checksum=str(raw.get("source_checksum") or ""),
            import_checksum=None,
            payload_checksum=_canonical_checksum(payload),
            schema_version=int(raw.get("schema_version") or 1),
            valid_row_count={"power": 14, "section": 126, "bom": 18}[typed_kind],
            rejected_row_count=0,
            diagnostics=list(raw["diagnostics"]),
            production_approved=bool(raw["production_approved"]),
            imported_at=now,
            imported_by=None,
            activated_at=now,
            activated_by=None,
            authority="static_fallback",
        )

    @staticmethod
    def _static_calculation_fallback(kind: str) -> dict[str, Any]:
        metadata = ElectricalCatalogService._static_fallback(kind).model_dump(mode="json")
        if kind == "power":
            payload = {"rows": list_tt_cables()}
            metadata.update(
                {
                    "status": "active",
                    "production_approved": True,
                    "diagnostics": [
                        {
                            "code": "ELECTRICAL_BUNDLED_CATALOG_APPROVED",
                            "selection_contract": "case1-r4-passport-power",
                        }
                    ],
                }
            )
        elif kind == "section":
            payload = section_catalog_payload_snapshot()
        else:
            payload = {"entries": list_electrical_tt_bom_entries()}
        return {**metadata, "payload": payload}
