"""Integration-тесты эндпоинтов авторизации."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.guest_session import GuestSession
from app.models.project import Project
from app.services.auth_service import AuthService

pytestmark = pytest.mark.asyncio(loop_scope="session")


class TestGuestAuth:
    async def test_create_guest_session(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/guest")
        assert resp.status_code == 201
        body = resp.json()
        assert "session_id" in body
        assert len(body["session_id"]) > 10
        # У пользователя сразу создаётся единственный авто-проект
        assert "project" in body
        assert body["project"]["session_id"] == body["session_id"]
        assert body["project"]["name"]

    async def test_guest_cannot_create_second_project(self, client: AsyncClient):
        session_id = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        resp = await client.post(
            "/api/v1/projects",
            json={"name": "Второй"},
            headers={"X-Session-Id": session_id},
        )
        # Авто-проект уже создан при логине → второй запрещён
        assert resp.status_code == 429, resp.text

    async def test_any_request_touches_last_activity(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Любой запрос с X-Session-Id продлевает TTL сессии."""
        session_id = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        # Искусственно «состариваем» сессию
        session = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one()
        old = datetime.now(UTC) - timedelta(minutes=15)
        session.last_activity = old
        await db_session.commit()

        # Любой запрос обновит last_activity
        await client.get("/api/v1/projects", headers={"X-Session-Id": session_id})

        await db_session.refresh(session)
        assert session.last_activity > old + timedelta(minutes=10)

    async def test_unknown_session_rejected(self, client: AsyncClient):
        resp = await client.get("/api/v1/projects", headers={"X-Session-Id": "bogus-session-id"})
        assert resp.status_code == 401

    async def test_cleanup_removes_expired_session_and_cascade(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Протухшая сессия удаляется целиком — проект и объекты по каскаду."""
        session_id = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        # Проверяем что авто-проект создан
        projects_before = (
            (await db_session.execute(select(Project).where(Project.session_id == session_id)))
            .scalars()
            .all()
        )
        assert len(projects_before) == 1

        # «Состариваем» сессию больше TTL
        session = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one()
        session.last_activity = datetime.now(UTC) - timedelta(minutes=30)
        await db_session.commit()

        service = AuthService(db_session)
        deleted = await service.cleanup_expired_guest_sessions(ttl_minutes=20)
        assert deleted >= 1

        # И сессия, и её проект исчезли (cascade)
        assert (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one_or_none() is None
        assert (
            await db_session.execute(select(Project).where(Project.session_id == session_id))
        ).scalars().all() == []

    async def test_cleanup_keeps_fresh_session(self, client: AsyncClient, db_session: AsyncSession):
        """Свежая сессия не трогается при cleanup."""
        session_id = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        service = AuthService(db_session)
        await service.cleanup_expired_guest_sessions(ttl_minutes=20)
        alive = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one_or_none()
        assert alive is not None


class TestEmployeeAuth:
    async def test_login_valid_credentials(self, client: AsyncClient, employee_token):
        assert employee_token

    async def test_me_returns_user(self, client: AsyncClient, employee_token):
        resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["email"] == "employee@test.com"
        assert resp.json()["role"] == "employee"

    async def test_login_invalid_credentials(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    async def test_access_admin_as_employee_forbidden(self, client: AsyncClient, employee_token):
        resp = await client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert resp.status_code == 403


class TestAdminAuth:
    async def test_admin_can_list_users(self, client: AsyncClient, admin_token):
        resp = await client.get(
            "/api/v1/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
