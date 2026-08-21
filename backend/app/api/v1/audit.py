"""Audit ingestion endpoints."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import CurrentPrincipal, require_any
from app.schemas.audit import ClientAuditEventsRequest, ClientAuditEventsResponse
from app.services.audit_service import AuditService

router = APIRouter()


@router.post(
    "/client-events",
    response_model=ClientAuditEventsResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Принять события frontend-аудита",
)
async def ingest_client_events(
    request: ClientAuditEventsRequest,
    principal: CurrentPrincipal = Depends(require_any()),
    db: AsyncSession = Depends(get_db),
) -> ClientAuditEventsResponse:
    try:
        accepted = await AuditService(db).record_client_events(request.events, principal)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
    return ClientAuditEventsResponse(accepted=accepted)
