"""Async SQLAlchemy engine + session factory."""

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_recycle=settings.DB_POOL_RECYCLE_SECONDS,
    pool_pre_ping=True,
    connect_args={
        "server_settings": {
            "statement_timeout": str(settings.DB_STATEMENT_TIMEOUT_MS),
        }
    }
    if settings.DB_STATEMENT_TIMEOUT_MS > 0
    else {},
    future=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: выдаёт async-сессию БД."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def use_fast_commit_for_current_transaction(session: AsyncSession) -> None:
    """Disable synchronous WAL commit for the current PostgreSQL transaction only.

    This is intentionally transaction-local and opt-in. Do not use it for auth,
    admin/reference edits, project creation, or user preferences.
    """
    if not isinstance(session, AsyncSession):
        return
    bind = session.get_bind()
    dialect_name = getattr(getattr(bind, "dialect", None), "name", None)
    if dialect_name != "postgresql":
        return
    await session.execute(text("SET LOCAL synchronous_commit = off"))
