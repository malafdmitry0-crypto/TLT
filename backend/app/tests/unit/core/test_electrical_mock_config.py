import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_electrical_frontend_mock_mode_defaults_off():
    assert Settings.model_fields["ELECTRICAL_FRONTEND_MOCK_MODE"].default == "off"


@pytest.mark.parametrize("mode", ["test", "dev"])
def test_production_rejects_electrical_frontend_mocks(mode: str):
    configured = Settings(
        APP_ENV="production",
        SECRET_KEY="x" * 40,
        FIRST_ADMIN_PASSWORD="a-strong-admin-password",
        AUTH_COOKIE_SECURE=True,
        ELECTRICAL_FRONTEND_MOCK_MODE=mode,
    )

    with pytest.raises(RuntimeError, match="ELECTRICAL_FRONTEND_MOCK_MODE"):
        configured.validate_runtime_security()


def test_invalid_electrical_frontend_mock_mode_is_rejected():
    with pytest.raises(ValidationError):
        Settings(ELECTRICAL_FRONTEND_MOCK_MODE="enabled")
