"""Unit-тесты Redis-throttle для guest last_activity."""

import logging

import pytest

from app.core import guest_activity


class _FakeRedis:
    def __init__(self) -> None:
        self.keys: set[str] = set()
        self.calls: list[tuple[str, dict]] = []

    async def set(self, key: str, value: str, **kwargs):
        self.calls.append((key, kwargs))
        if kwargs.get("nx"):
            if key in self.keys:
                return None
            self.keys.add(key)
            return True
        self.keys.add(key)
        return True


async def test_guest_activity_without_redis_touches_db(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(guest_activity, "redis_enabled", lambda: False)

    assert await guest_activity.should_touch_guest_session_in_db("sid-1") is True


async def test_guest_activity_throttles_db_touch(monkeypatch: pytest.MonkeyPatch):
    redis = _FakeRedis()
    monkeypatch.setattr(guest_activity, "redis_enabled", lambda: True)
    monkeypatch.setattr(guest_activity, "get_redis", lambda: redis)

    assert await guest_activity.should_touch_guest_session_in_db("sid-1") is True
    assert await guest_activity.should_touch_guest_session_in_db("sid-1") is False
    assert [key for key, _ in redis.calls] == [
        "guest:last:sid-1",
        "guest:last-db-touch:sid-1",
        "guest:last:sid-1",
        "guest:last-db-touch:sid-1",
    ]


async def test_guest_activity_redis_error_falls_back_to_db_touch(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
):
    class BrokenRedis:
        async def set(self, *args, **kwargs):
            raise RuntimeError("redis down")

    monkeypatch.setattr(guest_activity, "redis_enabled", lambda: True)
    monkeypatch.setattr(guest_activity, "get_redis", lambda: BrokenRedis())

    with caplog.at_level(logging.WARNING, logger="heatcalc.guest_activity"):
        assert await guest_activity.should_touch_guest_session_in_db("sid-1") is True

    assert "falling back to DB touch" in caplog.text
