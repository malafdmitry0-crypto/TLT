"""DB-backed settings, catalog and assignment context for TT calculations."""

import copy
from typing import Any
from uuid import UUID

from heatcalc_electrical_core import (
    ELECTRICAL_TT_FORMULA_FINGERPRINT,
    ELECTRICAL_TT_FORMULA_VERSION,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.electrical_domain import ElectricalFormulaError
from app.models.electrical_variant import ElectricalVariantObject
from app.models.project_electrical_settings import ProjectElectricalSettings
from app.models.project_object import ProjectObject
from app.services.calculation.errors import ElectricalCalcConcurrencyError
from app.services.electrical_catalog_service import (
    ElectricalCatalogService,
    ElectricalCatalogServiceError,
)


class ElectricalTTContext:
    """Resolve and cache one immutable app context per service execution."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._tt_project_settings_cache: dict[UUID, ProjectElectricalSettings | None] = {}
        self._tt_assignment_cache: dict[
            tuple[UUID, UUID, UUID], ElectricalVariantObject | None
        ] = {}
        self._tt_calculation_catalogs_cache: dict[str, dict[str, Any]] | None = None
        self._tt_calculation_catalogs_error: ElectricalFormulaError | None = None
        self._tt_error_catalog_snapshots_cache: dict[str, dict[str, Any]] | None = None

    async def _tt_project_settings(
        self,
        project_id: UUID,
    ) -> ProjectElectricalSettings | None:
        if project_id not in self._tt_project_settings_cache:
            self._tt_project_settings_cache[project_id] = await self.db.get(
                ProjectElectricalSettings,
                project_id,
            )
        return self._tt_project_settings_cache[project_id]

    async def _tt_calculation_catalogs(self) -> dict[str, dict[str, Any]]:
        """Resolve one immutable catalog set per service/batch execution."""
        if self._tt_calculation_catalogs_cache is not None:
            return self._tt_calculation_catalogs_cache
        if self._tt_calculation_catalogs_error is not None:
            raise self._tt_calculation_catalogs_error
        try:
            catalogs = await ElectricalCatalogService(self.db).active_calculation_catalogs()
        except ElectricalCatalogServiceError as exc:
            error = ElectricalFormulaError(
                exc.code,
                exc.message,
                details=exc.details,
                status_code=exc.status_code,
            )
            self._tt_calculation_catalogs_error = error
            raise error from exc
        self._tt_calculation_catalogs_cache = catalogs
        return catalogs

    async def _tt_error_provenance(self) -> dict[str, Any]:
        """Build BE-14 provenance even when the TT calculation itself failed."""
        if self._tt_error_catalog_snapshots_cache is not None:
            snapshots = copy.deepcopy(self._tt_error_catalog_snapshots_cache)
            return self._tt_error_provenance_payload(snapshots)
        try:
            catalogs = await self._tt_calculation_catalogs()
            snapshots = {
                kind: {key: value for key, value in catalogs[kind].items() if key != "payload"}
                for kind in ("power", "section", "bom")
            }
        except ElectricalFormulaError:
            metadata = await ElectricalCatalogService(self.db).metadata()
            available: dict[str, dict[str, Any]] = {
                catalog.kind: catalog.model_dump(mode="json") for catalog in metadata.catalogs
            }
            snapshots = {
                kind: available.get(kind)
                or {
                    "id": None,
                    "kind": kind,
                    "version": None,
                    "status": "missing",
                    "source": None,
                    "source_checksum": None,
                    "payload_checksum": None,
                    "schema_version": None,
                    "production_approved": False,
                    "authority": "unavailable",
                }
                for kind in ("power", "section", "bom")
            }
        self._tt_error_catalog_snapshots_cache = copy.deepcopy(snapshots)
        return self._tt_error_provenance_payload(snapshots)

    @staticmethod
    def _tt_error_provenance_payload(
        snapshots: dict[str, dict[str, Any]],
    ) -> dict[str, Any]:
        return {
            "catalogs": snapshots,
            "production_eligible": False,
            "provenance": {
                "formula_version": ELECTRICAL_TT_FORMULA_VERSION,
                "formula_fingerprint": ELECTRICAL_TT_FORMULA_FINGERPRINT,
                "catalogs": snapshots,
                "production_eligible": False,
            },
        }

    async def _prefetch_tt_assignments(
        self,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        object_ids: list[UUID],
    ) -> None:
        if electrical_variant_id is None or not object_ids:
            return
        missing = [
            object_id
            for object_id in object_ids
            if (project_id, electrical_variant_id, object_id) not in self._tt_assignment_cache
        ]
        if not missing:
            return
        rows = await self.db.scalars(
            select(ElectricalVariantObject).where(
                ElectricalVariantObject.project_id == project_id,
                ElectricalVariantObject.electrical_variant_id == electrical_variant_id,
                ElectricalVariantObject.object_id.in_(missing),
            )
        )
        by_object_id = {row.object_id: row for row in rows.all()}
        for object_id in missing:
            self._tt_assignment_cache[(project_id, electrical_variant_id, object_id)] = (
                by_object_id.get(object_id)
            )

    async def _tt_assignment(
        self,
        project_id: UUID,
        electrical_variant_id: UUID | None,
        object_id: UUID,
    ) -> ElectricalVariantObject | None:
        if electrical_variant_id is None:
            return None
        key = (project_id, electrical_variant_id, object_id)
        if key not in self._tt_assignment_cache:
            await self._prefetch_tt_assignments(
                project_id,
                electrical_variant_id,
                [object_id],
            )
        return self._tt_assignment_cache.get(key)

    async def _assert_expected_assignment_version(
        self,
        obj: ProjectObject,
        *,
        electrical_variant_id: UUID | None,
        expected_assignment_version: int | None,
    ) -> None:
        """Optimistic concurrency for assigned ER objects (E8 / B6).

        When the object has an assignment under the target ER and the client
        sent ``expected_assignment_version``, versions must match. When an
        assignment exists and the client omitted the version, we still accept
        the write for legacy clients but do not silently ignore a mismatch.
        """
        if electrical_variant_id is None:
            return
        assignment = await self._tt_assignment(
            obj.project_id,
            electrical_variant_id,
            obj.id,
        )
        if assignment is None:
            return
        if expected_assignment_version is None:
            return
        if int(assignment.version) != int(expected_assignment_version):
            raise ElectricalCalcConcurrencyError(
                code="ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT",
                message="Assignment был изменён другим запросом; обновите данные",
                status_code=409,
                details={
                    "conflicts": [
                        {
                            "object_id": str(obj.id),
                            "expected_version": expected_assignment_version,
                            "current_version": assignment.version,
                        }
                    ]
                },
            )
