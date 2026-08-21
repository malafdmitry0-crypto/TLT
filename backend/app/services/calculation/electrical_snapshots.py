"""Build and compare immutable cable-catalog snapshots."""

from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID

from app.models.electrical_calculation import ElectricalCalculation
from app.schemas.calculation import ElectricalRequest
from app.services.cable_snapshot import (
    build_cable_snapshot,
    compare_cable_snapshot,
    lookup_cable_row,
    lookup_cable_row_for_snapshot,
)
from app.services.calculation.electrical_sources import resolve_cable_mark_source

CatalogBundle = dict[str, dict[str, Any]]
CatalogLoader = Callable[[], Awaitable[CatalogBundle]]
CachedCatalogs = Callable[[], CatalogBundle | None]


class ElectricalSnapshotService:
    """Own cable snapshot projection; catalog loading remains an app concern."""

    def __init__(self, load_catalogs: CatalogLoader, cached_catalogs: CachedCatalogs) -> None:
        self._load_catalogs = load_catalogs
        self._cached_catalogs = cached_catalogs

    async def statuses(
        self,
        calculations: list[ElectricalCalculation],
        catalog_source: str = "builtin",
    ) -> dict[UUID, dict[str, Any]]:
        statuses: dict[UUID, dict[str, Any]] = {}
        _ = catalog_source
        power_catalog: dict[str, Any] | None = None
        catalogs_loaded = False
        for calculation in calculations:
            snapshot = calculation.cable_snapshot
            if not isinstance(snapshot, dict):
                statuses[calculation.id] = compare_cable_snapshot(None, None)
                continue
            mark = calculation.cable_mark or snapshot.get("cable_mark")
            current_row = None
            if calculation.cable_type == "self_regulating_tt":
                if not catalogs_loaded:
                    catalogs = await self._load_catalogs()
                    resolved_power = catalogs.get("power")
                    power_catalog = resolved_power if isinstance(resolved_power, dict) else None
                    catalogs_loaded = True
                current_row = self.row_from_power_catalog(
                    power_catalog,
                    mark,
                    snapshot=snapshot,
                )
            statuses[calculation.id] = compare_cable_snapshot(snapshot, current_row)
        return statuses

    def build_for_result(
        self,
        *,
        request: ElectricalRequest,
        cable_mark: str | None,
        result_dict: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        return self.build_from_data(
            cable_type=request.cable_type,
            cable_mark=cable_mark,
            request_data=request.data,
            result_dict=result_dict,
        )

    def build_from_data(
        self,
        *,
        cable_type: str,
        cable_mark: str | None,
        request_data: dict[str, Any],
        result_dict: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        cable_row = self.cable_row(cable_type, cable_mark, request_data, result_dict)
        if cable_type == "self_regulating_tt" and cable_row is None:
            return None
        return build_cable_snapshot(
            cable_type=cable_type,
            cable_mark=cable_mark,
            cable_row=cable_row,
            requested_catalog_source=str(request_data.get("cable_source") or "builtin"),
            cable_mark_source=resolve_cable_mark_source(request_data),
            result_dict=result_dict,
        )

    def cable_row(
        self,
        cable_type: str,
        cable_mark: str | None,
        request_data: dict[str, Any],
        result_dict: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not cable_mark:
            return None
        if cable_type == "self_regulating_tt":
            catalogs = result_dict.get("catalogs") if isinstance(result_dict, dict) else None
            power_catalog = catalogs.get("power") if isinstance(catalogs, dict) else None
            if isinstance(power_catalog, dict):
                exact_row = power_catalog.get("row")
                if isinstance(exact_row, dict):
                    return self.row_with_catalog_identity(exact_row, power_catalog)
            return self.row_from_power_catalog(self._cached_catalogs(), cable_mark)
        catalog_value = request_data.get("cable_catalog")
        catalog = catalog_value if isinstance(catalog_value, list) else None
        return lookup_cable_row(catalog, cable_mark, cable_type)

    @staticmethod
    def catalog_identity(catalog: dict[str, Any]) -> dict[str, Any]:
        return {
            key: catalog.get(key)
            for key in (
                "id",
                "kind",
                "version",
                "authority",
                "source",
                "source_checksum",
                "payload_checksum",
                "schema_version",
                "production_approved",
            )
        }

    @classmethod
    def row_with_catalog_identity(
        cls,
        row: dict[str, Any],
        catalog: dict[str, Any],
    ) -> dict[str, Any]:
        return {**row, "_catalog_identity": cls.catalog_identity(catalog)}

    @classmethod
    def row_from_power_catalog(
        cls,
        catalog: dict[str, Any] | None,
        cable_mark: str | None,
        *,
        snapshot: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        power_catalog = (
            catalog
            if isinstance(catalog, dict) and isinstance(catalog.get("payload"), dict)
            else catalog.get("power")
            if isinstance(catalog, dict)
            else None
        )
        if not isinstance(power_catalog, dict):
            return None
        payload = power_catalog.get("payload")
        rows_value = payload.get("rows") if isinstance(payload, dict) else None
        if rows_value is None and isinstance(payload, dict):
            rows_value = payload.get("cables")
        rows = (
            [dict(row) for row in rows_value if isinstance(row, dict)]
            if isinstance(rows_value, list)
            else []
        )
        row = lookup_cable_row_for_snapshot(
            rows,
            cable_mark,
            "self_regulating_tt",
            snapshot,
        )
        return cls.row_with_catalog_identity(row, power_catalog) if row is not None else None
