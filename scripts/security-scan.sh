#!/usr/bin/env bash
# =====================================================================
# ТЛТ · Сканеры уязвимостей кода и зависимостей
# =====================================================================
# Backend:
#   - bandit: SAST (eval/exec, hardcoded passwords, небезопасные API)
#   - pip-audit: CVE в установленных зависимостях (PyPI Advisory DB)
# Frontend:
#   - eslint-plugin-security: SAST для JS/TS
#   - npm audit: CVE в npm-пакетах
#
# Использование:
#   scripts/security-scan.sh           # всё
#   scripts/security-scan.sh backend   # только Python
#   scripts/security-scan.sh frontend  # только JS/TS
#   scripts/security-scan.sh deps      # только CVE зависимостей (pip-audit + npm audit)
# =====================================================================

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${1:-all}"
FAIL=0

run_bandit() {
  echo "▶ bandit (SAST Python)"
  docker exec heatcalc_backend bandit -c pyproject.toml -r app -ll -q || FAIL=1
}

run_pip_audit() {
  echo "▶ pip-audit (CVE в зависимостях Python)"
  docker exec heatcalc_backend pip-audit --strict || FAIL=1
}

run_eslint_security() {
  echo "▶ eslint-plugin-security (SAST JS/TS)"
  docker exec -e ESLINT_USE_FLAT_CONFIG=false heatcalc_frontend \
    npx eslint src --ext .ts,.tsx --quiet || FAIL=1
}

run_npm_audit() {
  echo "▶ npm audit (CVE в npm-зависимостях)"
  docker exec heatcalc_frontend npm audit --audit-level=moderate || FAIL=1
}

case "$TARGET" in
  backend)  run_bandit; run_pip_audit ;;
  frontend) run_eslint_security; run_npm_audit ;;
  deps)     run_pip_audit; run_npm_audit ;;
  all)
    run_bandit
    run_pip_audit
    run_eslint_security
    run_npm_audit
    ;;
  *)
    echo "Неизвестная цель: $TARGET" >&2
    echo "Доступно: backend | frontend | deps | all" >&2
    exit 1
    ;;
esac

if [ $FAIL -ne 0 ]; then
  echo "⚠️  Найдены проблемы — см. вывод выше"
  exit 1
fi
echo "✅ Сканеры завершены без критических findings"
