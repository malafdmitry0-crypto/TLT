"""Integration-тесты эндпоинтов авторизации."""

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
        set_cookie = resp.headers.get_list("set-cookie")
        assert any("guest_session_id=" in item and "HttpOnly" in item for item in set_cookie)
        assert any("csrf_token=" in item and "HttpOnly" not in item for item in set_cookie)

    async def test_resolve_guest_session_returns_existing_project(self, client: AsyncClient):
        created = await client.post("/api/v1/auth/guest")
        assert created.status_code == 201
        original = created.json()

        resolved = await client.post(
            "/api/v1/auth/guest/resolve",
            headers={
                "Cookie": (
                    f"{settings.GUEST_COOKIE_NAME}={original['session_id']}; "
                    f"{settings.CSRF_COOKIE_NAME}={client.cookies[settings.CSRF_COOKIE_NAME]}"
                ),
                "X-CSRF-Token": client.cookies[settings.CSRF_COOKIE_NAME],
            },
        )

        assert resolved.status_code == 200
        assert resolved.json()["session_id"] == original["session_id"]
        assert resolved.json()["project"]["id"] == original["project"]["id"]

    async def test_resolve_rejects_legacy_header_identity(self, client: AsyncClient):
        created = await client.post("/api/v1/auth/guest")
        original = created.json()
        client.cookies.clear()

        resolved = await client.post(
            "/api/v1/auth/guest/resolve",
            headers={"X-Session-Id": original["session_id"]},
        )

        assert resolved.status_code == 401
        assert resolved.json()["detail"] == "Сессия не найдена или истекла"
        assert settings.GUEST_COOKIE_NAME not in client.cookies

    async def test_current_rejects_legacy_header_identity(self, client: AsyncClient):
        created = await client.post("/api/v1/auth/guest")
        session_id = created.json()["session_id"]
        client.cookies.clear()

        current = await client.get(
            "/api/v1/auth/guest/current",
            headers={"X-Session-Id": session_id},
        )

        assert current.status_code == 401
        assert current.json()["detail"] == "Сессия не найдена или истекла"

    async def test_current_restores_guest_when_browser_lost_local_storage(
        self, client: AsyncClient
    ):
        created = await client.post("/api/v1/auth/guest")
        original = created.json()

        current = await client.get("/api/v1/auth/guest/current")

        assert current.status_code == 200
        assert current.json()["session_id"] == original["session_id"]
        assert current.json()["project"]["id"] == original["project"]["id"]

    async def test_current_ignores_legacy_header_in_favor_of_cookie(self, client: AsyncClient):
        original = (await client.post("/api/v1/auth/guest")).json()
        replacement = (await client.post("/api/v1/auth/guest")).json()
        assert client.cookies[settings.GUEST_COOKIE_NAME] == replacement["session_id"]

        current = await client.get(
            "/api/v1/auth/guest/current",
            headers={"X-Session-Id": original["session_id"]},
        )

        assert current.status_code == 200
        assert current.json()["session_id"] == replacement["session_id"]
        assert current.json()["project"]["id"] == replacement["project"]["id"]
        assert client.cookies[settings.GUEST_COOKIE_NAME] == replacement["session_id"]

    async def test_resolve_rejects_unknown_persisted_session(self, client: AsyncClient):
        client.cookies.set(settings.GUEST_COOKIE_NAME, "expired-session")
        client.cookies.set(settings.CSRF_COOKIE_NAME, "csrf-token")

        resolved = await client.post(
            "/api/v1/auth/guest/resolve",
            headers={"X-CSRF-Token": "csrf-token"},
        )

        assert resolved.status_code == 401
        assert resolved.json()["detail"] == "Сессия не найдена или истекла"

    async def test_current_rejects_unknown_persisted_session(self, client: AsyncClient):
        client.cookies.set(settings.GUEST_COOKIE_NAME, "expired-session")

        current = await client.get("/api/v1/auth/guest/current")

        assert current.status_code == 401
        assert current.json()["detail"] == "Сессия не найдена или истекла"

    async def test_current_does_not_create_session_without_identity(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        client.cookies.clear()
        before = len((await db_session.execute(select(GuestSession))).scalars().all())

        current = await client.get("/api/v1/auth/guest/current")

        after = len((await db_session.execute(select(GuestSession))).scalars().all())
        assert current.status_code == 200
        assert current.json() is None
        assert after == before

    async def test_guest_cannot_create_second_project(self, client: AsyncClient):
        await client.post("/api/v1/auth/guest")
        resp = await client.post(
            "/api/v1/projects",
            json={"name": "Второй"},
            headers={"X-CSRF-Token": client.cookies[settings.CSRF_COOKIE_NAME]},
        )
        # Авто-проект уже создан при логине → второй запрещён
        assert resp.status_code == 429, resp.text

    async def test_guest_cookie_write_requires_matching_csrf_header(self, client: AsyncClient):
        await client.post("/api/v1/auth/guest")

        resp = await client.post("/api/v1/projects", json={"name": "Второй"})

        assert resp.status_code == 403
        assert resp.json()["error_code"] == "CSRF_TOKEN_MISMATCH"

    async def test_any_request_touches_last_activity(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """Любой запрос с guest cookie продлевает TTL сессии."""
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
        await client.get("/api/v1/projects")

        await db_session.refresh(session)
        assert session.last_activity > old + timedelta(minutes=10)

    async def test_unknown_session_rejected(self, client: AsyncClient):
        client.cookies.set(settings.GUEST_COOKIE_NAME, "bogus-session-id")
        resp = await client.get("/api/v1/projects")
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

    async def test_cleanup_respects_configured_three_day_ttl_default(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """A1.5 / PDL-ER-26: product default TTL is 3 days; short idle must not expire."""
        from app.core.config import settings

        assert settings.GUEST_SESSION_TTL_MINUTES == 4320  # 3 days

        session_id = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        session = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one()
        # Idle 1 day — still within 3-day TTL
        session.last_activity = datetime.now(UTC) - timedelta(days=1)
        await db_session.commit()

        service = AuthService(db_session)
        deleted = await service.cleanup_expired_guest_sessions(
            ttl_minutes=settings.GUEST_SESSION_TTL_MINUTES
        )
        # May delete other fixtures, but this session must remain.
        still = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one_or_none()
        assert still is not None
        assert deleted >= 0

    async def test_cleanup_with_product_ttl_removes_session_older_than_three_days(
        self, client: AsyncClient, db_session: AsyncSession
    ):
        """A1.5: sessions older than configured TTL are removed with cascade."""
        from app.core.config import settings

        session_id = (await client.post("/api/v1/auth/guest")).json()["session_id"]
        session = (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one()
        session.last_activity = datetime.now(UTC) - timedelta(
            minutes=settings.GUEST_SESSION_TTL_MINUTES + 60
        )
        await db_session.commit()

        service = AuthService(db_session)
        deleted = await service.cleanup_expired_guest_sessions(
            ttl_minutes=settings.GUEST_SESSION_TTL_MINUTES
        )
        assert deleted >= 1
        assert (
            await db_session.execute(
                select(GuestSession).where(GuestSession.session_id == session_id)
            )
        ).scalar_one_or_none() is None

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

    async def test_login_sets_httponly_auth_cookies(self, client: AsyncClient, employee_user):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "employee@test.com", "password": "emp12345"},
        )
        assert resp.status_code == 200
        set_cookie = resp.headers.get_list("set-cookie")
        assert any("access_token=" in item and "HttpOnly" in item for item in set_cookie)
        assert any("refresh_token=" in item and "HttpOnly" in item for item in set_cookie)
        assert any("csrf_token=" in item and "HttpOnly" not in item for item in set_cookie)

        me = await client.get("/api/v1/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == "employee@test.com"

    async def test_login_invalid_credentials(self, client: AsyncClient):
        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@test.com", "password": "wrong"},
        )
        assert resp.status_code == 401

    async def test_login_rate_limited_by_ip(self, client: AsyncClient):
        for _ in range(settings.LOGIN_MAX_ATTEMPTS_PER_IP):
            resp = await client.post(
                "/api/v1/auth/login",
                json={"email": "wrong@test.com", "password": "wrong"},
            )
            assert resp.status_code == 401

        resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "wrong@test.com", "password": "wrong"},
        )
        assert resp.status_code == 429
        assert resp.headers["Retry-After"] == "3600"

    async def test_employee_login_rejects_admin_credentials(self, client: AsyncClient, admin_user):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "admin@test.com",
                "password": "admin123",
                "role": "employee",
            },
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

    async def test_admin_login_rejects_employee_credentials(
        self, client: AsyncClient, employee_user
    ):
        resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "employee@test.com",
                "password": "emp12345",
                "role": "admin",
            },
        )
        assert resp.status_code == 401
