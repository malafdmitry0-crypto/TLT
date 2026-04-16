"""Юнит-тесты cache — фоллбэк, инвалидация, ключ-по-префиксу."""

from __future__ import annotations

import os

import pytest

from app.core.cache import _build_backend, _Cache, _InMemoryBackend


class TestInMemoryBackend:
    def test_set_get_roundtrip(self):
        b = _InMemoryBackend()
        b.set("a", {"x": 1}, ttl=None)
        assert b.get("a") == {"x": 1}

    def test_get_missing_returns_none(self):
        b = _InMemoryBackend()
        assert b.get("nope") is None

    def test_delete(self):
        b = _InMemoryBackend()
        b.set("a", 1, None)
        b.delete("a")
        assert b.get("a") is None

    def test_delete_prefix(self):
        b = _InMemoryBackend()
        b.set("references:climate", 1, None)
        b.set("references:insulation", 2, None)
        b.set("coefficients", 3, None)
        b.delete_prefix("references:")
        assert b.get("references:climate") is None
        assert b.get("references:insulation") is None
        assert b.get("coefficients") == 3


class TestBuildBackendFallback:
    def test_unreachable_redis_falls_back_with_warning(self, monkeypatch, caplog):
        import logging

        monkeypatch.setenv("REDIS_URL", "redis://nonexistent-host:9999/0")
        with caplog.at_level(logging.WARNING, logger="heatcalc.cache"):
            b = _build_backend()
        assert isinstance(b, _InMemoryBackend)
        assert any("недоступен" in r.message for r in caplog.records)

    def test_no_redis_url_falls_back_to_in_memory(self, monkeypatch):
        monkeypatch.delenv("REDIS_URL", raising=False)
        b = _build_backend()
        assert isinstance(b, _InMemoryBackend)


class TestCachedDecorator:
    async def test_async_function_caches_result(self):
        c = _Cache.__new__(_Cache)
        c._backend = _InMemoryBackend()
        calls = {"n": 0}

        @c.cached("k1", ttl=60)
        async def slow_fn() -> int:
            calls["n"] += 1
            return 42

        assert await slow_fn() == 42
        assert await slow_fn() == 42
        assert calls["n"] == 1  # вторая попытка — из кэша

    async def test_invalidate_forces_recompute(self):
        c = _Cache.__new__(_Cache)
        c._backend = _InMemoryBackend()
        calls = {"n": 0}

        @c.cached("k2", ttl=60)
        async def fn() -> int:
            calls["n"] += 1
            return calls["n"]

        await fn()
        await fn()
        c.invalidate("k2")
        await fn()
        assert calls["n"] == 2  # был cache hit, потом invalidate, потом пересчёт

    async def test_sync_function_caches(self):
        c = _Cache.__new__(_Cache)
        c._backend = _InMemoryBackend()

        @c.cached("k3", ttl=60)
        def fn() -> str:
            return "hello"

        assert fn() == "hello"
        assert fn() == "hello"


@pytest.mark.skipif(
    not os.environ.get("REDIS_URL"),
    reason="Тест требует доступного Redis (укажите REDIS_URL)",
)
class TestRedisBackendIntegration:
    """Главная гарантия Redis-кэша — данные переживают пересоздание инстанса."""

    def test_persists_across_instances(self):
        from app.core.cache import _RedisBackend

        url = os.environ["REDIS_URL"]
        a = _RedisBackend(url)
        a.delete("itest:persist")
        a.set("itest:persist", {"hello": "world"}, ttl=60)

        # Новый backend-инстанс читает то же значение из Redis
        b = _RedisBackend(url)
        assert b.get("itest:persist") == {"hello": "world"}
        b.delete("itest:persist")
