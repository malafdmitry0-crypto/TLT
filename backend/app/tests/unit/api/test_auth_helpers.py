"""Unit tests for auth endpoint helpers."""

from starlette.requests import Request

from app.core.config import settings
from app.core.rate_limit import client_ip


def _request(client_host: str, forwarded_for: str | None = None) -> Request:
    headers = []
    if forwarded_for:
        headers.append((b"x-forwarded-for", forwarded_for.encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/guest",
            "headers": headers,
            "client": (client_host, 12345),
        }
    )


def test_client_ip_ignores_forwarded_for_without_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "")

    assert client_ip(_request("10.0.0.5", "203.0.113.10")) == "10.0.0.5"


def test_client_ip_uses_forwarded_for_from_trusted_proxy(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_IPS", "10.0.0.0/24")

    assert client_ip(_request("10.0.0.5", "203.0.113.10, 10.0.0.5")) == "203.0.113.10"
