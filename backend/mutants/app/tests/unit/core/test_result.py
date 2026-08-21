"""Юнит-тесты Result[T, E]."""

import pytest

from app.result import Err, Ok


class TestOk:
    def test_is_ok_is_true(self):
        r = Ok(42)
        assert r.is_ok is True
        assert r.is_err is False

    def test_unwrap_returns_value(self):
        assert Ok("hello").unwrap() == "hello"

    def test_unwrap_or_returns_value_ignoring_default(self):
        assert Ok(5).unwrap_or(99) == 5


class TestErr:
    def test_is_err_is_true(self):
        r = Err("boom")
        assert r.is_err is True
        assert r.is_ok is False

    def test_unwrap_raises(self):
        with pytest.raises(RuntimeError, match="boom"):
            Err("boom").unwrap()

    def test_unwrap_or_returns_default(self):
        assert Err("e").unwrap_or(99) == 99


class TestImmutability:
    def test_ok_is_frozen(self):
        r = Ok(1)
        with pytest.raises(Exception):  # FrozenInstanceError
            r.value = 2  # type: ignore[misc]

    def test_err_is_frozen(self):
        r = Err("x")
        with pytest.raises(Exception):
            r.error = "y"  # type: ignore[misc]
