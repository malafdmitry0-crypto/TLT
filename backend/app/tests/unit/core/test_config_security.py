"""Runtime security settings validation."""

import pytest

from app.core.config import Settings


def test_default_object_limit_matches_srs_contract():
    assert Settings.model_fields["GUEST_MAX_OBJECTS_PER_PROJECT"].default == 50


def test_production_rejects_default_secrets():
    settings = Settings(
        APP_ENV="production",
        SECRET_KEY="change-me-in-production",
        FIRST_ADMIN_PASSWORD="admin",
    )

    with pytest.raises(RuntimeError, match="SECRET_KEY"):
        settings.validate_runtime_security()


def test_development_allows_defaults():
    settings = Settings(APP_ENV="development")

    settings.validate_runtime_security()


def test_auth_cookie_secure_auto_follows_environment():
    assert Settings(APP_ENV="production").auth_cookie_secure is True
    assert Settings(APP_ENV="development").auth_cookie_secure is False
    assert Settings(APP_ENV="demo").auth_cookie_secure is False


def test_auth_cookie_secure_explicit_override_wins():
    assert Settings(APP_ENV="development", AUTH_COOKIE_SECURE=True).auth_cookie_secure is True
    assert Settings(APP_ENV="production", AUTH_COOKIE_SECURE=False).auth_cookie_secure is False


def test_production_rejects_insecure_cookie_override():
    settings = Settings(
        APP_ENV="production",
        SECRET_KEY="x" * 40,
        FIRST_ADMIN_PASSWORD="a-strong-admin-password",
        AUTH_COOKIE_SECURE=False,
    )

    with pytest.raises(RuntimeError, match="AUTH_COOKIE_SECURE"):
        settings.validate_runtime_security()
