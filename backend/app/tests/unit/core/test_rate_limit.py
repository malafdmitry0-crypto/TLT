"""Юнит-тесты rate limiter и cache — гарантия одинакового поведения от версии к версии."""

from __future__ import annotations

import os
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.core.config import settings
from app.core.dependencies import CurrentPrincipal
from app.core.rate_limit import (
    IPRateLimiter,
    RedisRateLimiter,
    _build_limiter,
    client_ip,
    enforce_principal_rate_limit,
    enforce_rate_limit,
    principal_rate_limit_key,
)


def _request(client_host: str | None, forwarded_for: str | None = None) -> Request:
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": headers,
    }
    if client_host is not None:
        scope["client"] = (client_host, 12345)
    return Request(scope)


class _FakeSyncPipe:
    def __init__(self, redis: _FakeSyncRedis) -> None:
        self.redis = redis
        self.added = False

    def zremrangebyscore(self, key, min_value, max_value):
        self.redis.calls.append(("zremrangebyscore", key, min_value, max_value))
        return self

    def zcard(self, key):
        self.redis.calls.append(("zcard", key))
        return self

    def zadd(self, key, values):
        self.redis.calls.append(("zadd", key, values))
        self.added = True
        return self

    def expire(self, key, seconds):
        self.redis.calls.append(("expire", key, seconds))
        return self

    def execute(self):
        if self.added:
            return [None, None]
        return [None, self.redis.count]


class _FakeSyncRedis:
    def __init__(self, *, count: int = 0) -> None:
        self.count = count
        self.calls: list[tuple[object, ...]] = []
        self.keys = ["ratelimit:unit:one", "ratelimit:unit:two"]

    def pipeline(self):
        return _FakeSyncPipe(self)

    def scan_iter(self, pattern):
        self.calls.append(("scan_iter", pattern))
        return iter(self.keys)

    def delete(self, key):
        self.calls.append(("delete", key))


class _FakeAsyncPipe:
    def __init__(self, redis: _FakeAsyncRedis) -> None:
        self.redis = redis
        self.added = False

    def zremrangebyscore(self, key, min_value, max_value):
        self.redis.calls.append(("zremrangebyscore", key, min_value, max_value))
        return self

    def zcard(self, key):
        self.redis.calls.append(("zcard", key))
        return self

    def zadd(self, key, values):
        self.redis.calls.append(("zadd", key, values))
        self.added = True
        return self

    def expire(self, key, seconds):
        self.redis.calls.append(("expire", key, seconds))
        return self

    async def execute(self):
        if self.added:
            return [None, None]
        return [None, self.redis.count]


class _FakeAsyncRedis:
    def __init__(self, *, count: int = 0) -> None:
        self.count = count
        self.calls: list[tuple[object, ...]] = []
        self.keys = ["ratelimit:unit:one", "ratelimit:unit:two"]

    def pipeline(self):
        return _FakeAsyncPipe(self)

    async def scan_iter(self, pattern):
        self.calls.append(("scan_iter", pattern))
        for key in self.keys:
            yield key

    async def delete(self, key):
        self.calls.append(("delete", key))


class TestIPRateLimiter:
    def test_allows_until_limit(self):
        lim = IPRateLimiter(max_calls=3, window_seconds=60)
        assert lim.is_allowed("1.1.1.1") is True
        assert lim.is_allowed("1.1.1.1") is True
        assert lim.is_allowed("1.1.1.1") is True
        assert lim.is_allowed("1.1.1.1") is False
        assert lim.remaining("1.1.1.1") == 0

    def test_isolated_per_ip(self):
        lim = IPRateLimiter(max_calls=1, window_seconds=60)
        assert lim.is_allowed("a") is True
        assert lim.is_allowed("b") is True
        assert lim.is_allowed("a") is False

    def test_reset_clears_one_or_all(self):
        lim = IPRateLimiter(max_calls=1, window_seconds=60)
        lim.is_allowed("a")
        lim.is_allowed("b")
        lim.reset("a")
        assert lim.is_allowed("a") is True
        assert lim.is_allowed("b") is False
        lim.reset()
        assert lim.is_allowed("b") is True

    async def test_async_methods_delegate_to_sync_state(self):
        lim = IPRateLimiter(max_calls=1, window_seconds=60)

        assert await lim.ais_allowed("async-ip") is True
        assert await lim.ais_allowed("async-ip") is False
        assert await lim.aremaining("async-ip") == 0

    def test_old_entries_expire_from_window(self, monkeypatch):
        now = 1000.0
        monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: now)
        lim = IPRateLimiter(max_calls=1, window_seconds=10)

        assert lim.is_allowed("ip") is True
        assert lim.is_allowed("ip") is False

        now = 1011.0
        assert lim.remaining("ip") == 1
        assert lim.is_allowed("ip") is True


class TestRateLimitKeys:
    def test_client_ip_handles_missing_client(self):
        assert client_ip(_request(None)) == "unknown"

    def test_client_ip_trusted_proxy_exact_match(self, monkeypatch):
        monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "proxy.local")

        assert client_ip(_request("proxy.local", "203.0.113.11")) == "203.0.113.11"

    def test_client_ip_ignores_invalid_non_matching_proxy(self, monkeypatch):
        monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "proxy.local")

        assert client_ip(_request("198.51.100.1", "203.0.113.11")) == "198.51.100.1"

    def test_principal_rate_limit_key_uses_guest_session_and_user_id(self):
        user_id = uuid4()

        guest_key = principal_rate_limit_key(
            CurrentPrincipal(role="guest", session_id="guest-session"),
            _request("10.0.0.5"),
        )
        user_key = principal_rate_limit_key(
            CurrentPrincipal(role="employee", user_id=user_id),
            _request("10.0.0.5"),
        )

        assert guest_key == "session:guest-session:ip:10.0.0.5"
        assert user_key == f"user:{user_id}:ip:10.0.0.5"


class TestEnforceRateLimit:
    async def test_enforce_rate_limit_allows_when_limiter_allows(self):
        lim = IPRateLimiter(max_calls=1, window_seconds=60)

        await enforce_rate_limit(lim, "key", detail="too many")

    async def test_enforce_rate_limit_raises_429_when_limiter_blocks(self):
        lim = IPRateLimiter(max_calls=1, window_seconds=60)
        await enforce_rate_limit(lim, "key", detail="too many")

        with pytest.raises(HTTPException) as exc:
            await enforce_rate_limit(lim, "key", detail="too many")

        assert exc.value.status_code == 429
        assert exc.value.detail == "too many"
        assert exc.value.headers == {"Retry-After": "3600"}

    async def test_enforce_principal_rate_limit_uses_principal_bucket(self):
        lim = IPRateLimiter(max_calls=1, window_seconds=60)
        principal = CurrentPrincipal(role="guest", session_id="guest-session")
        request = _request("10.0.0.5")

        await enforce_principal_rate_limit(lim, principal, request, detail="too many")

        with pytest.raises(HTTPException):
            await enforce_principal_rate_limit(lim, principal, request, detail="too many")


class TestBuildLimiterFallback:
    """Если REDIS_URL не задан или Redis не доступен — graceful fallback на in-memory."""

    def test_reachable_redis_returns_redis_limiter(self, monkeypatch):
        class FakeRedisLimiter(IPRateLimiter):
            def __init__(self, max_calls: int, redis_url: str, namespace: str) -> None:
                super().__init__(max_calls=max_calls, window_seconds=60)
                self.redis_url = redis_url
                self.namespace = namespace

        monkeypatch.setattr(settings, "REDIS_URL", "redis://unit-test:6379/0")
        monkeypatch.setattr("app.core.rate_limit.RedisRateLimiter", FakeRedisLimiter)

        lim = _build_limiter(max_calls=10, namespace="unit")

        assert isinstance(lim, FakeRedisLimiter)
        assert lim.redis_url == "redis://unit-test:6379/0"
        assert lim.namespace == "unit"

    def test_unreachable_redis_falls_back_with_warning(self, monkeypatch, caplog):
        import logging

        monkeypatch.setattr(settings, "REDIS_URL", "redis://nonexistent-host:9999/0")
        with caplog.at_level(logging.WARNING, logger="heatcalc.rate_limit"):
            lim = _build_limiter(max_calls=10)
        assert isinstance(lim, IPRateLimiter)
        assert any("недоступен" in r.message for r in caplog.records)

    def test_no_redis_url_falls_back_to_in_memory(self, monkeypatch):
        monkeypatch.setattr(settings, "REDIS_URL", None)
        lim = _build_limiter(max_calls=10)
        assert isinstance(lim, IPRateLimiter)


class TestRedisRateLimiterWithFakes:
    def test_sync_methods_use_sorted_set_pipeline(self, monkeypatch):
        fake = _FakeSyncRedis(count=0)
        monkeypatch.setattr("redis.Redis.from_url", lambda *args, **kwargs: fake)

        lim = RedisRateLimiter(
            max_calls=2,
            redis_url="redis://unit-test:6379/0",
            window_seconds=60,
            namespace="unit",
        )

        assert lim._key("ip") == "ratelimit:unit:ip"
        assert lim.is_allowed("ip") is True
        assert any(call[0] == "zadd" for call in fake.calls)

        fake.count = 2
        assert lim.is_allowed("ip") is False

        fake.count = 1
        assert lim.remaining("ip") == 1

        lim.reset("ip")
        lim.reset()
        assert ("delete", "ratelimit:unit:ip") in fake.calls
        assert ("scan_iter", "ratelimit:unit:*") in fake.calls

    async def test_async_methods_reuse_loop_client_and_reset_keys(self, monkeypatch):
        sync_fake = _FakeSyncRedis(count=0)
        async_fake = _FakeAsyncRedis(count=0)
        monkeypatch.setattr("redis.Redis.from_url", lambda *args, **kwargs: sync_fake)
        monkeypatch.setattr("redis.asyncio.Redis.from_url", lambda *args, **kwargs: async_fake)

        lim = RedisRateLimiter(
            max_calls=2,
            redis_url="redis://unit-test:6379/0",
            window_seconds=60,
            namespace="unit",
        )

        assert await lim.ais_allowed("ip") is True
        assert lim._async_client() is async_fake

        async_fake.count = 2
        assert await lim.ais_allowed("ip") is False

        async_fake.count = 1
        assert await lim.aremaining("ip") == 1

        await lim.areset("ip")
        await lim.areset()
        assert ("delete", "ratelimit:unit:ip") in async_fake.calls
        assert ("scan_iter", "ratelimit:unit:*") in async_fake.calls


@pytest.mark.skipif(
    not os.environ.get("REDIS_URL"),
    reason="Тест требует доступного Redis (укажите REDIS_URL)",
)
class TestRedisRateLimiter:
    """Интеграционный тест на Redis — одинаковое поведение независимо от рестарта."""

    def test_persists_across_instances(self):
        url = os.environ["REDIS_URL"]
        a = RedisRateLimiter(max_calls=2, redis_url=url, window_seconds=60)
        a.reset("e2e-test-ip")
        assert a.is_allowed("e2e-test-ip") is True
        assert a.is_allowed("e2e-test-ip") is True

        # Новый инстанс лимитера видит тот же счётчик в Redis
        b = RedisRateLimiter(max_calls=2, redis_url=url, window_seconds=60)
        assert b.is_allowed("e2e-test-ip") is False
        b.reset("e2e-test-ip")
