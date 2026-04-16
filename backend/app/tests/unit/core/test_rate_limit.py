"""Юнит-тесты rate limiter и cache — гарантия одинакового поведения от версии к версии."""

from __future__ import annotations

import os

import pytest

from app.core.rate_limit import (
    IPRateLimiter,
    RedisRateLimiter,
    _build_limiter,
)


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


class TestBuildLimiterFallback:
    """Если REDIS_URL не задан или Redis не доступен — graceful fallback на in-memory."""

    def test_unreachable_redis_falls_back_with_warning(self, monkeypatch, caplog):
        import logging

        monkeypatch.setenv("REDIS_URL", "redis://nonexistent-host:9999/0")
        with caplog.at_level(logging.WARNING, logger="heatcalc.rate_limit"):
            lim = _build_limiter(max_calls=10)
        assert isinstance(lim, IPRateLimiter)
        assert any("недоступен" in r.message for r in caplog.records)

    def test_no_redis_url_falls_back_to_in_memory(self, monkeypatch):
        monkeypatch.delenv("REDIS_URL", raising=False)
        lim = _build_limiter(max_calls=10)
        assert isinstance(lim, IPRateLimiter)


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
