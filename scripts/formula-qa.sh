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
#   scripts/formula-qa.sh mutation   # отдельные mutmut-прогоны backend и standalone cores
#   scripts/formula-qa.sh heat-loss-core-mutation # только standalone heat-loss core
#   scripts/formula-qa.sh electrical-core-mutation # только standalone electrical core
#   scripts/formula-qa.sh all        # full + mutation
# =====================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-quick}"
TEST_SECRET_KEY="${TEST_SECRET_KEY:-codex-test-secret-key-at-least-32-chars}"

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
  docker exec -e SECRET_KEY="$TEST_SECRET_KEY" heatcalc_backend "$@"
}

run_heat_loss_core() {
  docker exec \
    -e SECRET_KEY="$TEST_SECRET_KEY" \
    -w /app/packages/heat-loss-core \
    heatcalc_backend "$@"
}

run_electrical_core() {
  docker exec \
    -e SECRET_KEY="$TEST_SECRET_KEY" \
    -w /app/packages/electrical-core \
    heatcalc_backend "$@"
}

run_formula_unit() {
  ensure_dev_stack
  echo "▶ Backend formula unit/golden/metamorphic tests"
  run_backend pytest app/tests/unit/formulas -q --tb=short --no-cov
  echo "▶ Standalone heat-loss core tests"
  run_heat_loss_core python -m pytest tests -q --tb=short
  echo "▶ Standalone electrical core tests"
  run_electrical_core python -m pytest tests -q --tb=short
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
    -e SECRET_KEY="$TEST_SECRET_KEY" \
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

  # mutmut 3 reuses its generated sandbox and does not remove files deleted
  # from the source tree. Preserve the repository's existing sandbox while a
  # fresh one is generated, then restore it even when mutmut exits with an
  # error. This prevents stale tests from participating without dirtying the
  # worktree.
  local backend_mutation_sandbox="$ROOT/backend/mutants"
  local heat_loss_core_mutation_sandbox="$ROOT/backend/packages/heat-loss-core/mutants"
  local electrical_core_mutation_sandbox="$ROOT/backend/packages/electrical-core/mutants"
  local mutation_backup
  mutation_backup="$(mktemp -d "${TMPDIR:-/tmp}/heatcalc-mutmut.XXXXXX")"

  restore_mutation_sandboxes() {
    if [[ -e "$backend_mutation_sandbox" ]]; then
      mv "$backend_mutation_sandbox" "$mutation_backup/generated-backend"
    fi
    if [[ -e "$heat_loss_core_mutation_sandbox" ]]; then
      mv "$heat_loss_core_mutation_sandbox" "$mutation_backup/generated-heat-loss-core"
    fi
    if [[ -e "$electrical_core_mutation_sandbox" ]]; then
      mv "$electrical_core_mutation_sandbox" "$mutation_backup/generated-electrical-core"
    fi
    if [[ -e "$mutation_backup/original-backend" ]]; then
      mv "$mutation_backup/original-backend" "$backend_mutation_sandbox"
    fi
    if [[ -e "$mutation_backup/original-heat-loss-core" ]]; then
      mv "$mutation_backup/original-heat-loss-core" "$heat_loss_core_mutation_sandbox"
    fi
    if [[ -e "$mutation_backup/original-electrical-core" ]]; then
      mv "$mutation_backup/original-electrical-core" "$electrical_core_mutation_sandbox"
    fi
    rm -rf "$mutation_backup"
  }

  if [[ -e "$backend_mutation_sandbox" ]]; then
    mv "$backend_mutation_sandbox" "$mutation_backup/original-backend"
  fi
  if [[ -e "$heat_loss_core_mutation_sandbox" ]]; then
    mv "$heat_loss_core_mutation_sandbox" "$mutation_backup/original-heat-loss-core"
  fi
  if [[ -e "$electrical_core_mutation_sandbox" ]]; then
    mv "$electrical_core_mutation_sandbox" "$mutation_backup/original-electrical-core"
  fi
  trap restore_mutation_sandboxes EXIT

  run_backend mutmut run
  run_heat_loss_core mutmut run
  run_electrical_core mutmut run
  run_backend python scripts/mutmut_score_gate.py

  restore_mutation_sandboxes
  trap - EXIT
}

run_heat_loss_core_mutation() {
  ensure_dev_stack
  echo "▶ Standalone heat-loss core mutation testing"
  if ! run_backend python -c "import mutmut" >/dev/null 2>&1; then
    echo "mutmut не установлен в backend-контейнере." >&2
    echo "Пересоберите dev-образ после обновления requirements-dev.txt: make build" >&2
    exit 2
  fi

  local core_mutation_sandbox="$ROOT/backend/packages/heat-loss-core/mutants"
  local mutation_backup
  mutation_backup="$(mktemp -d "${TMPDIR:-/tmp}/heatcalc-core-mutmut.XXXXXX")"

  restore_core_mutation_sandbox() {
    if [[ -e "$core_mutation_sandbox" ]]; then
      mv "$core_mutation_sandbox" "$mutation_backup/generated-core"
    fi
    if [[ -e "$mutation_backup/original-core" ]]; then
      mv "$mutation_backup/original-core" "$core_mutation_sandbox"
    fi
    rm -rf "$mutation_backup"
  }

  if [[ -e "$core_mutation_sandbox" ]]; then
    mv "$core_mutation_sandbox" "$mutation_backup/original-core"
  fi
  trap restore_core_mutation_sandbox EXIT

  run_heat_loss_core mutmut run
  run_backend env MUTMUT_SCOPE=core python scripts/mutmut_score_gate.py

  restore_core_mutation_sandbox
  trap - EXIT
}

run_electrical_core_mutation() {
  ensure_dev_stack
  echo "▶ Standalone electrical core mutation testing"
  if ! run_backend python -c "import mutmut" >/dev/null 2>&1; then
    echo "mutmut не установлен в backend-контейнере." >&2
    echo "Пересоберите dev-образ после обновления requirements-dev.txt: make build" >&2
    exit 2
  fi

  local core_mutation_sandbox="$ROOT/backend/packages/electrical-core/mutants"
  local mutation_backup
  mutation_backup="$(mktemp -d "${TMPDIR:-/tmp}/heatcalc-electrical-core-mutmut.XXXXXX")"

  restore_core_mutation_sandbox() {
    if [[ -e "$core_mutation_sandbox" ]]; then
      mv "$core_mutation_sandbox" "$mutation_backup/generated-core"
    fi
    if [[ -e "$mutation_backup/original-core" ]]; then
      mv "$mutation_backup/original-core" "$core_mutation_sandbox"
    fi
    rm -rf "$mutation_backup"
  }

  if [[ -e "$core_mutation_sandbox" ]]; then
    mv "$core_mutation_sandbox" "$mutation_backup/original-core"
  fi
  trap restore_core_mutation_sandbox EXIT

  run_electrical_core mutmut run
  run_backend env MUTMUT_SCOPE=electrical-core python scripts/mutmut_score_gate.py

  restore_core_mutation_sandbox
  trap - EXIT
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
  heat-loss-core-mutation)
    run_heat_loss_core_mutation
    ;;
  electrical-core-mutation)
    run_electrical_core_mutation
    ;;
  all)
    run_formula_unit
    run_formula_service_guards
    run_formula_integration
    run_mutation
    ;;
  *)
    echo "Неизвестная цель: $TARGET" >&2
    echo "Доступно: quick | full | mutation | heat-loss-core-mutation | electrical-core-mutation | all" >&2
    exit 1
    ;;
esac

echo "✅ Formula QA: $TARGET завершен"
