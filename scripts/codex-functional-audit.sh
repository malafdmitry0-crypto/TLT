#!/usr/bin/env bash
# =====================================================================
# TLT · Codex functional accuracy audit
# =====================================================================
# Запускает проверочные контуры, которые Codex использует после чтения
# документации и поиска реализации функционала в коде.
#
# Использование:
#   scripts/codex-functional-audit.sh docs
#   scripts/codex-functional-audit.sh contracts
#   scripts/codex-functional-audit.sh mcp
#   scripts/codex-functional-audit.sh db-invariants
#   scripts/codex-functional-audit.sh smoke
#   scripts/codex-functional-audit.sh calc
#   scripts/codex-functional-audit.sh mutation
#   scripts/codex-functional-audit.sh business
#   scripts/codex-functional-audit.sh user-flows
#   scripts/codex-functional-audit.sh layout
#   scripts/codex-functional-audit.sh accessibility
#   scripts/codex-functional-audit.sh warnings
#   scripts/codex-functional-audit.sh backend
#   scripts/codex-functional-audit.sh frontend
#   scripts/codex-functional-audit.sh e2e
#   scripts/codex-functional-audit.sh all
#   scripts/codex-functional-audit.sh deep
# =====================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-docs}"
TEST_SECRET_KEY="${TEST_SECRET_KEY:-codex-test-secret-key-at-least-32-chars}"

run_docs() {
  echo "▶ Docs drift check"
  "$ROOT/scripts/sync-docs.py" --check
  bash "$ROOT/scripts/check-doc-semantic-drift.sh"
}

run_contracts() {
  echo "▶ Docs → formula → API → UI contract matrix"
  python3 "$ROOT/scripts/sync-heatcalc-field-contract.py" --check
  python3 "$ROOT/scripts/verify-business-contracts.py"
}

run_db_invariants() {
  echo "▶ Postgres business-data invariants"

  docker exec heatcalc_db pg_isready -U heatcalc -d heatcalc_db >/dev/null
  docker exec -i heatcalc_db psql -U heatcalc -d heatcalc_db -v ON_ERROR_STOP=1 \
    -f - < "$ROOT/scripts/db-business-invariants.sql"
}

run_mcp() {
  echo "▶ MCP/Postgres smoke + DB business invariants"

  test -f "$ROOT/.mcp.json"
  python3 -m json.tool "$ROOT/.mcp.json" >/dev/null
  python3 - "$ROOT/.mcp.json" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as f:
    config = json.load(f)

servers = config.get("mcpServers") or {}
postgres = servers.get("postgres") or {}
args = postgres.get("args") or []

if postgres.get("command") != "docker" or "mcp/postgres" not in args:
    raise SystemExit("MCP postgres server is not configured as docker mcp/postgres")
PY

  if ! docker network inspect tlt_default >/dev/null 2>&1; then
    echo "Docker network tlt_default не найдена. Поднимите dev-стек: make dev-d" >&2
    exit 1
  fi

  run_db_invariants
}

run_smoke() {
  echo "▶ API/UI smoke"
  SMOKE_API_BASE_URL="${SMOKE_API_BASE_URL:-http://localhost:8000/api/v1}" \
    "$ROOT/scripts/smoke.sh" "${SMOKE_BASE_URL:-http://localhost:3003}"
  run_db_invariants
}

run_calc() {
  echo "▶ Calculation accuracy gate"
  "$ROOT/scripts/formula-qa.sh" full
}

run_mutation() {
  echo "▶ Formula mutation testing"
  "$ROOT/scripts/formula-qa.sh" mutation
}

run_business() {
  echo "▶ Deep backend business logic tests"
  "$ROOT/scripts/formula-qa.sh" full
  docker exec \
    -e SECRET_KEY="$TEST_SECRET_KEY" \
    -e TEST_DATABASE_URL=postgresql+asyncpg://heatcalc:heatcalc_pass@db:5432/heatcalc_test \
    heatcalc_backend pytest \
      app/tests/integration/api/test_security_boundaries.py \
      app/tests/integration/api/test_idempotency.py \
      app/tests/integration/api/test_project_io.py \
      app/tests/integration/api/test_import_excel.py \
      app/tests/integration/api/test_specifications.py \
      app/tests/integration/api/test_reports.py \
      app/tests/integration/db/test_cascade_integrity.py \
      app/tests/integration/db/test_query_counts.py \
      -q --tb=short --no-cov
}

run_user_flows() {
  echo "▶ Playwright user-flow simulation"
  local channel="${PLAYWRIGHT_CHROMIUM_CHANNEL:-}"
  if [ -z "$channel" ] && [ -z "${CI:-}" ]; then
    channel="chrome"
  fi
  (
    cd "$ROOT/e2e"
    PLAYWRIGHT_CHROMIUM_CHANNEL="$channel" \
    E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3003}" \
    E2E_API_BASE="${E2E_API_BASE:-http://localhost:8000}" \
      npx playwright test \
        tests/auth.spec.ts \
        tests/projects.spec.ts \
        tests/heat-calculation.spec.ts \
        tests/elec-calculation.spec.ts \
        tests/cable-business-flows.spec.ts \
        tests/phase5-specification-proof.spec.ts \
        tests/phase5-actionable-close.spec.ts \
        --reporter=list
  )
  run_db_invariants
}

run_layout() {
  echo "▶ Playwright layout regression audit"
  local channel="${PLAYWRIGHT_CHROMIUM_CHANNEL:-}"
  if [ -z "$channel" ] && [ -z "${CI:-}" ]; then
    channel="chrome"
  fi
  (
    cd "$ROOT/e2e"
    PLAYWRIGHT_CHROMIUM_CHANNEL="$channel" \
    E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3003}" \
    E2E_API_BASE="${E2E_API_BASE:-http://localhost:8000}" \
      npx playwright test tests/layout-regression.spec.ts --reporter=list
  )
}

run_accessibility() {
  echo "▶ Playwright accessibility audit"
  local channel="${PLAYWRIGHT_CHROMIUM_CHANNEL:-}"
  if [ -z "$channel" ] && [ -z "${CI:-}" ]; then
    channel="chrome"
  fi
  (
    cd "$ROOT/e2e"
    PLAYWRIGHT_CHROMIUM_CHANNEL="$channel" \
    E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3003}" \
    E2E_API_BASE="${E2E_API_BASE:-http://localhost:8000}" \
      npx playwright test tests/accessibility.spec.ts --reporter=list
  )
}

run_warnings() {
  echo "▶ Backend selected warnings gate"
  bash "$ROOT/scripts/backend-warning-gate.sh"
}

run_backend() {
  echo "▶ Backend unit + integration"
  "$ROOT/scripts/test.sh" backend-unit
  "$ROOT/scripts/test.sh" backend-int
}

run_frontend() {
  echo "▶ Frontend tests"
  "$ROOT/scripts/test.sh" frontend
}

run_e2e() {
  echo "▶ E2E tests"
  "$ROOT/scripts/test.sh" e2e
}

case "$TARGET" in
  docs)
    run_docs
    ;;
  contracts)
    run_contracts
    ;;
  mcp)
    run_mcp
    ;;
  db-invariants)
    run_db_invariants
    ;;
  smoke)
    run_smoke
    ;;
  calc)
    run_calc
    ;;
  mutation)
    run_mutation
    ;;
  business)
    run_business
    ;;
  user-flows)
    run_user_flows
    ;;
  layout)
    run_layout
    ;;
  accessibility)
    run_accessibility
    ;;
  warnings)
    run_warnings
    ;;
  backend)
    run_backend
    ;;
  frontend)
    run_frontend
    ;;
  e2e)
    run_e2e
    ;;
  all)
    run_docs
    run_contracts
    run_mcp
    run_smoke
    run_calc
    run_business
    run_user_flows
    run_layout
    run_accessibility
    run_mcp
    ;;
  deep)
    run_docs
    run_contracts
    run_mcp
    run_smoke
    run_calc
    run_business
    run_backend
    run_frontend
    run_user_flows
    run_layout
    run_accessibility
    run_warnings
    run_mcp
    ;;
  *)
    echo "Неизвестная цель: $TARGET" >&2
    echo "Доступно: docs | contracts | mcp | db-invariants | smoke | calc | mutation | business | user-flows | layout | accessibility | warnings | backend | frontend | e2e | all | deep" >&2
    exit 1
    ;;
esac

echo "✅ Codex functional audit: $TARGET завершен"
