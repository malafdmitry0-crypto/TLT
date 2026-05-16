#!/usr/bin/env bash
# =====================================================================
# TLT · Backend selected warnings gate
# =====================================================================
# Делает предупреждения частью QA-сигнала. Этот gate намеренно строгий:
# если библиотека/код начинает выдавать выбранные warnings, команда падает.
# =====================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

compose_dev() {
  docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.dev.yml" "$@"
}

ensure_dev_stack() {
  if ! compose_dev ps --format "{{.Name}}" 2>/dev/null | grep -q heatcalc_backend; then
    echo "▶ Поднимаю dev-стек для warning gate..."
    compose_dev up -d backend db redis
  fi

  for _ in {1..45}; do
    if compose_dev ps backend --format "{{.Status}}" 2>/dev/null | grep -q healthy; then
      return 0
    fi
    sleep 2
  done

  echo "Backend не стал healthy для warning gate" >&2
  compose_dev logs --tail=120 backend >&2
  exit 1
}

ensure_dev_stack

docker exec \
  -e SECRET_KEY=codex-warning-gate-secret-key-at-least-32-chars \
  -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
  heatcalc_backend pytest \
    app/tests/unit/core/test_config_security.py \
    app/tests/integration/api/test_security_boundaries.py \
    app/tests/integration/api/test_import_excel.py \
    -q --tb=short --no-cov \
    -W error::jwt.warnings.InsecureKeyLengthWarning \
    -W error::pydantic.warnings.PydanticDeprecatedSince20 \
    -W error::DeprecationWarning:fastapi.routing \
    -W error::DeprecationWarning:passlib.utils

echo "✅ Backend warning gate завершен"
