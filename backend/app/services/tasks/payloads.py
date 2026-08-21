"""Current task payload construction and idempotency identity."""

import hashlib
import json
from typing import Any
from uuid import UUID

from app.core.dependencies import CurrentPrincipal
from app.schemas.calculation import ElectricalBatchJobRequest
from app.schemas.heat_loss import HeatLossBatchJobRequest
from app.schemas.report import ReportExportJobRequest


def electrical_payload(
    request: ElectricalBatchJobRequest,
    *,
    object_ids: list[UUID] | None,
    object_overrides: list[dict[str, str]] | None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "project_id": str(request.project_id),
        "electrical_variant_id": str(request.electrical_variant_id),
        "cable_source": request.cable_source,
        "cable_type": request.cable_type,
        "force_cable_type": request.force_cable_type,
        "electrical_params": request.electrical_params(),
        "skip_manual": request.skip_manual,
        "include_results": request.include_results,
        "include_errors": request.include_errors,
        "requested_scope": "all" if request.object_ids is None else "selected",
    }
    if object_ids is not None:
        payload["object_ids"] = [str(object_id) for object_id in object_ids]
    if object_overrides is not None:
        payload["object_overrides"] = object_overrides
    return payload


def heat_loss_payload(request: HeatLossBatchJobRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "project_id": str(request.project_id),
        "include_errors": request.include_errors,
    }
    if request.object_ids is not None:
        payload["object_ids"] = [str(object_id) for object_id in request.object_ids]
    return payload


def report_export_payload(request: ReportExportJobRequest) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "project_id": str(request.project_id),
        "electrical_variant_id": str(request.electrical_variant_id),
        "format": request.format,
    }
    if request.sections is not None:
        payload["sections"] = request.sections
    return payload


def dedupe_key(
    *,
    task_type: str,
    project_id: UUID,
    principal: CurrentPrincipal,
    payload: dict[str, Any],
    idempotency_key: str | None,
) -> str:
    owner = (
        f"session:{principal.session_id}"
        if principal.role == "guest"
        else f"user:{principal.user_id}"
    )
    stable_payload = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    raw = "|".join((task_type, str(project_id), owner, idempotency_key or stable_payload))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
