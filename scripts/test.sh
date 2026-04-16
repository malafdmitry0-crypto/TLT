#!/usr/bin/env bash
# =====================================================================
# ТЛТ · Универсальный запуск тестов через правильные контейнеры
# =====================================================================
# Тесты НЕ упакованы в prod-образы (.dockerignore исключает app/tests).
# Для unit / integration используется dev-стек (bind-mount исходников).
#
# Использование:
#   scripts/test.sh                 # всё: backend unit + integration + frontend
#   scripts/test.sh backend-unit    # только backend unit
#   scripts/test.sh backend-int     # только backend integration (нужна БД heatcalc_test)
#   scripts/test.sh frontend        # только frontend vitest
#   scripts/test.sh e2e             # Playwright (требует поднятого e2e-стека)
# =====================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"

# Убедимся, что dev-стек поднят (для unit и integration).
ensure_dev_stack() {
  if ! docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.dev.yml" \
       ps --format "{{.Name}}" 2>/dev/null | grep -q heatcalc_backend; then
    echo "▶ Поднимаю dev-стек (heatcalc_backend, heatcalc_frontend, heatcalc_db)…"
    docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.dev.yml" up -d
    for i in {1..30}; do
      docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.dev.yml" \
        ps backend --format "{{.Status}}" | grep -q healthy && break
      sleep 2
    done
  fi
}

run_backend_unit() {
  ensure_dev_stack
  echo "▶ Backend unit-тесты"
  docker exec heatcalc_backend pytest app/tests/unit -q --tb=short
}

run_backend_integration() {
  ensure_dev_stack
  echo "▶ Backend integration (требует БД heatcalc_test)"
  docker exec -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
    heatcalc_backend pytest app/tests/integration -q --tb=short
}

run_frontend() {
  ensure_dev_stack
  echo "▶ Frontend vitest"
  docker exec heatcalc_frontend npm test -- --run
}

run_e2e() {
  echo "▶ Playwright e2e"
  echo "  Ожидается, что e2e-стек поднят: docker compose -f docker-compose.e2e.yml up -d"
  (cd "$ROOT/e2e" && E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3001}" \
    ADMIN_EMAIL="${ADMIN_EMAIL:-admin@heatcalc.io}" \
    ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin}" \
    npx playwright test --reporter=list)
}

case "$TARGET" in
  backend-unit) run_backend_unit ;;
  backend-int)  run_backend_integration ;;
  frontend)     run_frontend ;;
  e2e)          run_e2e ;;
  all)
    run_backend_unit
    run_backend_integration
    run_frontend
    echo "— e2e пропущен (запустить отдельно: scripts/test.sh e2e)"
    ;;
  *)
    echo "Неизвестная цель: $TARGET" >&2
    echo "Доступно: backend-unit | backend-int | frontend | e2e | all" >&2
    exit 1
    ;;
esac

echo "✅ $TARGET завершены"
