#!/usr/bin/env python3
"""Deterministic assertions for worker readiness wiring in Compose variants."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def compose_config(*files: str, env: dict[str, str] | None = None) -> dict:
    command = ["docker", "compose"]
    for filename in files:
        command.extend(("-f", filename))
    command.extend(("config", "--format", "json"))
    completed = subprocess.run(
        command,
        cwd=ROOT,
        env={**os.environ, **(env or {})},
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def dependency_condition(service: dict, dependency: str) -> str | None:
    value = service.get("depends_on", {}).get(dependency)
    return value.get("condition") if isinstance(value, dict) else None


def assert_common(config: dict, *, frontend_name: str = "frontend") -> None:
    services = config["services"]
    backend = services["backend" if frontend_name == "frontend" else "backend-test"]
    worker = services["worker"]
    frontend = services[frontend_name]

    assert "/health/live" in " ".join(backend["healthcheck"]["test"])
    assert worker["healthcheck"]["test"][-2:] == ["-m", "app.worker_healthcheck"]
    assert dependency_condition(frontend, "worker") == "service_healthy"
    assert "/health/ready" in " ".join(frontend["healthcheck"]["test"])
    assert "container_name" not in worker


def main() -> None:
    base = compose_config("docker-compose.yml")
    dev = compose_config("docker-compose.yml", "docker-compose.dev.yml")
    prod = compose_config(
        "docker-compose.yml",
        "docker-compose.prod.yml",
        env={"SITE_DOMAIN": "example.invalid"},
    )
    e2e = compose_config(
        "docker-compose.yml",
        "docker-compose.dev.yml",
        "docker-compose.e2e.yml",
    )
    demo = compose_config("demo/docker-compose.yml")

    for config in (base, dev, prod, demo):
        assert_common(config)
    assert_common(e2e, frontend_name="frontend-test")

    prod_services = prod["services"]
    assert prod_services["worker"]["image"] == prod_services["backend"]["image"]
    assert prod_services["worker"]["restart"] == "always"
    assert "/health/ready" in " ".join(
        prod_services["caddy"]["healthcheck"]["test"]
    )

    e2e_services = e2e["services"]
    assert set(e2e_services["worker"]["depends_on"]) == {
        "backend-test",
        "db-test",
        "redis",
    }
    assert e2e_services["db"]["ports"][0]["published"] == "5433"
    assert e2e_services["db-test"]["ports"][0]["published"] == "5434"

    print("Compose worker readiness contract: PASS")


if __name__ == "__main__":
    main()
