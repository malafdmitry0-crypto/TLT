import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_event import AuditEvent
from app.tests.heat_fixtures import canonical_pipe_params

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


async def test_object_created_audit_event_is_staged_in_business_commit(
    client: AsyncClient,
    db_session: AsyncSession,
    guest_session: str,
):
    """object.created пишется в той же транзакции, что и сам объект (stage)."""
    project_id = (
        await client.get("/api/v1/projects", headers={"X-Session-Id": guest_session})
    ).json()[0]["id"]

    resp = await client.post(
        f"/api/v1/projects/{project_id}/objects",
        json={
            "object_type": "pipe",
            "sort_order": 0,
            "params": canonical_pipe_params(
                ambient_temperature=-20.0,
                pipe_length=10.0,
            ),
        },
        headers={"X-Session-Id": guest_session},
    )
    assert resp.status_code == 201, resp.text
    object_id = resp.json()["id"]

    event = (
        await db_session.execute(
            select(AuditEvent).where(AuditEvent.event_type == "object.created")
        )
    ).scalar_one()
    assert str(event.object_id) == object_id
    assert event.category == "object"
    assert event.session_id == guest_session
    assert event.after_state["object_type"] == "pipe"
