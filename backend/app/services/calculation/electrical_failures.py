"""Persistence use case for failed electrical calculations."""

from collections.abc import Awaitable, Callable
from typing import Any, cast
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.electrical_calculation import ElectricalCalculation
from app.models.project_object import ProjectObject
from app.services.calculation.electrical_repository import ElectricalCalculationRepository
from app.services.calculation.electrical_sources import (
    compact_electrical_params,
    normalize_cable_mark_source,
    normalize_cable_type_source,
)
from app.services.calculation.electrical_tt_context import ElectricalTTContext
from app.services.electrical_error_guidance import build_electrical_error_payload


class ElectricalFailureService:
    """Build structured failure projections; only ``save`` owns a commit."""

    def __init__(
        self,
        db: AsyncSession,
        repository: ElectricalCalculationRepository,
        context: ElectricalTTContext,
        bulk_upsert: Callable[..., Awaitable[list[ElectricalCalculation]]] | None = None,
    ) -> None:
        self.db = db
        self.repository = repository
        self.context = context
        self._bulk_upsert = bulk_upsert or repository.bulk_upsert

    async def upsert(
        self,
        obj: ProjectObject,
        error_message: str | Exception,
        variant_number: int,
        cable_type: str,
        *,
        cable_type_source: str | None = None,
        cable_mark_source: str | None = None,
        request_data: dict[str, Any] | None = None,
        electrical_variant_id: UUID | None = None,
    ) -> ElectricalCalculation:
        normalized_source = normalize_cable_type_source(cable_type_source)
        normalized_mark_source = normalize_cable_mark_source(cable_mark_source)
        params = {
            "cable_type_source": normalized_source,
            "cable_mark_source": normalized_mark_source,
        }
        error_request_data = dict(obj.params or {})
        if request_data:
            error_request_data.update(request_data)
            params.update(compact_electrical_params(request_data))
        params["cable_type_source"] = normalized_source
        params["cable_mark_source"] = normalized_mark_source
        payload = build_electrical_error_payload(
            error_message,
            object_type=obj.object_type,
            object_name=(obj.params or {}).get("name"),
            cable_type=cable_type,
            request_data=error_request_data,
        )
        if cable_type == "self_regulating_tt":
            cast(dict[str, Any], payload).update(await self.context._tt_error_provenance())
        rows = await self._bulk_upsert(
            [
                {
                    "project_id": obj.project_id,
                    "object_id": obj.id,
                    "variant_number": variant_number,
                    "electrical_variant_id": electrical_variant_id,
                    "cable_type": cable_type,
                    "cable_type_source": normalized_source,
                    "cable_mark": None,
                    "cable_mark_source": normalized_mark_source,
                    "cable_snapshot": None,
                    "params": params,
                    "results": payload,
                }
            ],
            return_calcs=True,
        )
        return rows[0]

    async def save(
        self,
        obj: ProjectObject,
        error_message: str,
        variant_number: int = 1,
        cable_type: str = "self_regulating_tt",
    ) -> None:
        await self.upsert(obj, error_message, variant_number, cable_type)
        await self.db.commit()
