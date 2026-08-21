"""Async SQLAlchemy engine + session factory."""

from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import Settings, settings


def _database_server_settings(config: Settings) -> dict[str, str]:
    server_settings = {"application_name": config.DB_APPLICATION_NAME}
    if config.DB_STATEMENT_TIMEOUT_MS > 0:
        server_settings["statement_timeout"] = str(config.DB_STATEMENT_TIMEOUT_MS)
    if config.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS > 0:
        server_settings["idle_in_transaction_session_timeout"] = str(
            config.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS
        )
    return server_settings


def _create_database_engine(config: Settings) -> AsyncEngine:
    return create_async_engine(
        config.DATABASE_URL,
        echo=config.DEBUG,
        pool_size=config.DB_POOL_SIZE,
        max_overflow=config.DB_MAX_OVERFLOW,
        pool_timeout=config.DB_POOL_TIMEOUT_SECONDS,
        pool_recycle=config.DB_POOL_RECYCLE_SECONDS,
        pool_pre_ping=True,
        connect_args={"server_settings": _database_server_settings(config)},
        future=True,
    )


engine = _create_database_engine(settings)

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
