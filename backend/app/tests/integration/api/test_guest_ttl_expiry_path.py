"""C5 — guest TTL expiry path (short TTL simulation, not live 3 days)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.guest_session import GuestSession
from app.models.project import Project
from app.services.auth_service import AuthService

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestGuestTtlExpiryPath:
    async def test_product_ttl_default_is_three_days(self):
        assert settings.GUEST_SESSION_TTL_MINUTES == 4320

    async def test_expired_session_cleanup_returns_401_on_next_request(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """After cleanup with short TTL, old session_id is rejected (expiry UX signal)."""
        created = (await client.post("/api/v1/auth/guest")).json()
        session_id = created["session_id"]
        # Touch projects to ensure project exists
        projects = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
        assert projects.status_code == 200
        assert len(projects.json()) == 1

        session = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one()
        session.last_activity = datetime.now(UTC) - timedelta(minutes=30)
        await db_session.commit()

        deleted = await AuthService(db_session).cleanup_expired_guest_sessions(ttl_minutes=20)
        assert deleted >= 1

        rejected = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
        assert rejected.status_code == 401

        # New guest session can start fresh empty project path
        fresh = (await client.post("/api/v1/auth/guest")).json()
        assert fresh["session_id"] != session_id
        fresh_projects = await client.get(
            "/api/v1/projects",
            headers={"X-Session-Id": fresh["session_id"]},
        )
        assert fresh_projects.status_code == 200
        assert len(fresh_projects.json()) == 1

    async def test_within_product_ttl_session_survives_cleanup(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        created = (await client.post("/api/v1/auth/guest")).json()
        session_id = created["session_id"]
        session = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one()
        session.last_activity = datetime.now(UTC) - timedelta(hours=12)
        await db_session.commit()

        await AuthService(db_session).cleanup_expired_guest_sessions(
            ttl_minutes=settings.GUEST_SESSION_TTL_MINUTES
        )
        ok = await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})
        assert ok.status_code == 200
        projects = (
            (await db_session.execute(select(Project).where(Project.session_id == session_id)))
            .scalars()
            .all()
        )
        assert len(projects) == 1
