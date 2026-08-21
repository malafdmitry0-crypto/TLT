"""Bounded PostgreSQL connection-pool configuration contracts."""

from typing import cast

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncEngine

from app.core import database
from app.core.config import Settings


def test_database_pool_defaults_are_bounded() -> None:
    assert Settings.model_fields["DB_POOL_SIZE"].default == 5
    assert Settings.model_fields["DB_MAX_OVERFLOW"].default == 2
    assert Settings.model_fields["DB_POOL_TIMEOUT_SECONDS"].default == 10.0


def test_database_pool_rejects_unlimited_or_nonpositive_limits() -> None:
    with pytest.raises(ValidationError):
        Settings(DB_POOL_SIZE=0)
    with pytest.raises(ValidationError):
        Settings(DB_MAX_OVERFLOW=-1)
    with pytest.raises(ValidationError):
        Settings(DB_POOL_TIMEOUT_SECONDS=0)


def test_database_server_settings_keep_identity_when_timeouts_are_disabled() -> None:
    config = Settings(
        DB_APPLICATION_NAME="heatcalc-test",
        DB_STATEMENT_TIMEOUT_MS=0,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=0,
    )

    assert database._database_server_settings(config) == {"application_name": "heatcalc-test"}


def test_database_engine_receives_pool_and_server_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, object] = {}
    sentinel = object()

    def fake_create_async_engine(url: str, **kwargs: object) -> AsyncEngine:
        captured["url"] = url
        captured.update(kwargs)
        return cast(AsyncEngine, sentinel)

    monkeypatch.setattr(database, "create_async_engine", fake_create_async_engine)
    config = Settings(
        DATABASE_URL="postgresql+asyncpg://user:pass@db/example",
        DB_POOL_SIZE=3,
        DB_MAX_OVERFLOW=1,
        DB_POOL_TIMEOUT_SECONDS=7.5,
        DB_APPLICATION_NAME="heatcalc-test",
        DB_STATEMENT_TIMEOUT_MS=1234,
        DB_IDLE_IN_TRANSACTION_TIMEOUT_MS=5678,
    )

    result = database._create_database_engine(config)

    assert result is sentinel
    assert captured["url"] == config.DATABASE_URL
    assert captured["pool_size"] == 3
    assert captured["max_overflow"] == 1
    assert captured["pool_timeout"] == 7.5
    assert captured["pool_pre_ping"] is True
    assert captured["connect_args"] == {
        "server_settings": {
            "application_name": "heatcalc-test",
            "statement_timeout": "1234",
            "idle_in_transaction_session_timeout": "5678",
        }
    }
