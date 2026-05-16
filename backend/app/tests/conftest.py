"""Pytest fixtures: тестовая БД, HTTP-клиент, токены."""

import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.cache import cache
from app.core.database import get_db
from app.core.rate_limit import guest_session_limiter
from app.core.security import hash_password
from app.main import app
from app.models import Base
from app.models.user import User


@pytest.fixture(autouse=True)
def _reset_cache_between_tests():
    """Сброс cache между тестами — иначе закэшированные результаты предыдущих
    тестов (например, замоканные коэффициенты) утекают и ломают изоляцию.
    """
    cache.invalidate_prefix("")
    yield
    cache.invalidate_prefix("")


TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://test:test@localhost:5433/heatcalc_test",
)


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(
        TEST_DATABASE_URL,
        future=True,
        connect_args={"prepared_statement_cache_size": 0},
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    # После пересоздания PostgreSQL enum-типов asyncpg может держать stale schema
    # cache на соединении, которое делало DDL. Закрываем его до начала тестов.
    await engine.dispose()
    yield engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    session_factory = async_sessionmaker(test_engine, expire_on_commit=False)
    async with session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
            # очистка между тестами
            for table in reversed(Base.metadata.sorted_tables):
                await session.execute(table.delete())
            await session.commit()


@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    async def override_get_db():
        yield db_session

    guest_session_limiter.reset()
    app.dependency_overrides[get_db] = override_get_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_user(db_session) -> User:
    user = User(
        email="admin@test.com",
        hashed_password=hash_password("admin123"),
        full_name="Admin",
        role="admin",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def employee_user(db_session) -> User:
    user = User(
        email="employee@test.com",
        hashed_password=hash_password("emp12345"),
        full_name="Employee",
        role="employee",
        is_active=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def admin_token(client: AsyncClient, admin_user: User) -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@test.com", "password": "admin123"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def employee_token(client: AsyncClient, employee_user: User) -> str:
    resp = await client.post(
        "/api/v1/auth/login",
        json={"email": "employee@test.com", "password": "emp12345"},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest_asyncio.fixture
async def guest_session(client: AsyncClient) -> str:
    resp = await client.post("/api/v1/auth/guest")
    assert resp.status_code == 201, resp.text
    return resp.json()["session_id"]
