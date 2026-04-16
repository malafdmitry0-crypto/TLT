#!/usr/bin/env bash
# =====================================================================
# Устанавливает git pre-commit hook: sync-docs --check
# =====================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOOK_DIR="$ROOT/.git/hooks"
HOOK_FILE="$HOOK_DIR/pre-commit"

if [ ! -d "$HOOK_DIR" ]; then
  echo "❌ .git/hooks не найдена. Запускайте из корня репозитория (после git init)."
  exit 1
fi

cat > "$HOOK_FILE" <<'EOF'
#!/usr/bin/env bash
# Авто-установлен через scripts/install-git-hooks.sh
# Блокирует коммит при:
#   1) doc drift (AUTO-блоки в README/CLAUDE.MD расходятся с кодом)
#   2) ruff-ошибках в backend/app/
#   3) mypy-ошибках в backend/app/formulas/ (ядро расчётов)
# Каждая проверка запускается только если есть соответствующий инструмент —
# не падает по причине «не установлено локально».
set -e

# 1. Docs sync
if [ -x scripts/sync-docs.py ]; then
  if ! scripts/sync-docs.py --check; then
    echo ""
    echo "❌ Документация рассинхронизирована. Запустите: scripts/sync-docs.py"
    echo "   (и сделайте git add на изменённые файлы)"
    exit 1
  fi
fi

# 2. ruff (lint) — только изменённые файлы в backend/
STAGED_PY=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^backend/.*\.py$' || true)
if [ -n "$STAGED_PY" ]; then
  if command -v ruff >/dev/null 2>&1; then
    cd backend && echo "$STAGED_PY" | sed 's|^backend/||' | xargs ruff check || {
      echo "❌ ruff нашёл проблемы. Исправьте: cd backend && ruff check --fix app/"
      exit 1
    }
    cd ..
  elif docker compose -f docker-compose.yml -f docker-compose.dev.yml ps backend --format "{{.Name}}" 2>/dev/null | grep -q heatcalc_backend; then
    docker exec heatcalc_backend sh -c "ruff check app/ 2>&1" || {
      echo "❌ ruff (через dev-стек) нашёл проблемы."
      exit 1
    }
  fi
fi

# 3. mypy — только для критического модуля формул
STAGED_FORMULAS=$(echo "$STAGED_PY" | grep -E '^backend/app/formulas/' || true)
if [ -n "$STAGED_FORMULAS" ]; then
  if command -v mypy >/dev/null 2>&1; then
    cd backend && mypy --strict --ignore-missing-imports app/formulas/ app/contracts.py app/schemas/json_shapes.py || {
      echo "❌ mypy --strict нашёл ошибки в формулах."
      exit 1
    }
    cd ..
  fi
fi
EOF

chmod +x "$HOOK_FILE"
echo "✅ pre-commit hook установлен → $HOOK_FILE"
