#!/usr/bin/env bash
# =====================================================================
# TLT · Formula QA gate
# =====================================================================
# Проверяет корректность расчетного ядра на уровне:
# - golden/metamorphic/unit тестов формул;
# - сервисных guard-тестов, где формулы подключаются к бизнес-логике;
# - опционально: integration/API и mutation testing.
#
# Использование:
#   scripts/formula-qa.sh quick      # быстрый локальный gate
#   scripts/formula-qa.sh full       # quick + API/object integration
#   scripts/formula-qa.sh mutation   # mutmut по backend/app/formulas
#   scripts/formula-qa.sh all        # full + mutation
# =====================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-quick}"

compose_dev() {
  docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.dev.yml" "$@"
}

ensure_dev_stack() {
  if ! compose_dev ps --format "{{.Name}}" 2>/dev/null | grep -q heatcalc_backend; then
    echo "▶ Поднимаю dev-стек для проверки формул..."
    compose_dev up -d backend db redis
  fi

  for _ in {1..45}; do
    if compose_dev ps backend --format "{{.Status}}" 2>/dev/null | grep -q healthy; then
      return 0
    fi
    sleep 2
  done

  echo "Backend не стал healthy для проверки формул" >&2
  compose_dev logs --tail=120 backend >&2
  exit 1
}

run_backend() {
  docker exec heatcalc_backend "$@"
}

run_formula_unit() {
  ensure_dev_stack
  echo "▶ Formula unit/golden/metamorphic tests"
  run_backend pytest app/tests/unit/formulas -q --tb=short --no-cov
}

run_formula_service_guards() {
  ensure_dev_stack
  echo "▶ Formula service guard tests"
  run_backend pytest \
    app/tests/unit/services/test_no_double_safety.py \
    app/tests/unit/services/test_calculation_service.py \
    app/tests/unit/services/test_calculation_service_unit.py \
    -q --tb=short --no-cov
}

run_formula_integration() {
  ensure_dev_stack
  echo "▶ Formula API/object integration guards"
  docker exec \
    -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
    heatcalc_backend pytest \
      app/tests/integration/api/test_calculations.py \
      app/tests/integration/api/test_objects.py \
      app/tests/integration/api/test_calc_jobs.py \
      -q --tb=short --no-cov
}

run_mutation() {
  ensure_dev_stack
  echo "▶ Formula mutation testing"
  if ! run_backend python -c "import mutmut" >/dev/null 2>&1; then
    echo "mutmut не установлен в backend-контейнере." >&2
    echo "Пересоберите dev-образ после обновления requirements-dev.txt: make build" >&2
    exit 2
  fi

  run_backend mutmut run
  run_backend mutmut results
}

case "$TARGET" in
  quick)
    run_formula_unit
    run_formula_service_guards
    ;;
  full)
    run_formula_unit
    run_formula_service_guards
    run_formula_integration
    ;;
  mutation)
    run_mutation
    ;;
  all)
    run_formula_unit
    run_formula_service_guards
    run_formula_integration
    run_mutation
    ;;
  *)
    echo "Неизвестная цель: $TARGET" >&2
    echo "Доступно: quick | full | mutation | all" >&2
    exit 1
    ;;
esac

echo "✅ Formula QA: $TARGET завершен"
