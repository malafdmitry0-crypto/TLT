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
