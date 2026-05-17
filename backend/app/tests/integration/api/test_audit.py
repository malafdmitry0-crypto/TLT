import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent

pytestmark = pytest.mark.asyncio(loop_scope="session")


async def test_client_audit_events_are_persisted_and_sanitized(
    client: AsyncClient,
    db_session: AsyncSession,
    guest_session: str,
):
    resp = await client.post(
        "/api/v1/audit/client-events",
        headers={"X-Session-Id": guest_session, "X-Request-Id": "req-audit-1"},
        json={
            "events": [
                {
                    "event_type": "frontend.window.error",
                    "severity": "error",
                    "result": "failure",
                    "details": {
                        "path": "/workspace",
                        "password": "plain",
                        "nested": {"access_token": "secret"},
                    },
                    "error_code": "frontend_error",
                    "message": "Render failed",
                }
            ]
        },
    )

    assert resp.status_code == 202, resp.text
    assert resp.headers["X-Request-Id"] == "req-audit-1"
    assert resp.json() == {"accepted": 1}

    event = (
        await db_session.execute(
            select(AuditEvent).where(AuditEvent.event_type == "frontend.window.error")
        )
    ).scalar_one()
    assert event.category == "frontend"
    assert event.source == "frontend"
    assert event.result == "failure"
    assert event.session_id == guest_session
    assert event.request_id == "req-audit-1"
    assert event.details["path"] == "/workspace"
    assert event.details["password"] == "[REDACTED]"
    assert event.details["nested"]["access_token"] == "[REDACTED]"
