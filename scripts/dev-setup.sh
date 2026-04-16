#!/usr/bin/env bash
# Запускает dev-среду, ждёт готовности, применяет миграции (если нужно), заполняет БД сидами.
#
# Использование:
#   ./scripts/dev-setup.sh          # старт + сиды
#   ./scripts/dev-setup.sh --fresh  # пересоздать БД с нуля и заполнить сидами
#
# Требования: docker, docker compose v2

set -euo pipefail

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"
BACKEND_URL="http://localhost:8000"
BACKEND_HEALTH="${BACKEND_URL}/health"
MAX_WAIT=120   # секунд

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[setup]${NC} $*"; }
warning() { echo -e "${YELLOW}[setup]${NC} $*"; }
error()   { echo -e "${RED}[setup]${NC} $*" >&2; exit 1; }

# ------------------------------------------------------------------
# Флаги
# ------------------------------------------------------------------
FRESH=false
for arg in "$@"; do
  case "$arg" in
    --fresh) FRESH=true ;;
    *) error "Неизвестный аргумент: $arg" ;;
  esac
done

# ------------------------------------------------------------------
# 1. Опционально — пересоздать тома (--fresh)
# ------------------------------------------------------------------
if $FRESH; then
  warning "--fresh: останавливаем контейнеры и удаляем данные БД..."
  $COMPOSE down -v --remove-orphans 2>/dev/null || true
  info "Тома удалены."
fi

# ------------------------------------------------------------------
# 2. Запуск контейнеров в фоне
# ------------------------------------------------------------------
info "Запуск dev-среды (--build -d)..."
$COMPOSE up --build -d

# ------------------------------------------------------------------
# 3. Ждём готовности backend (health-check)
#    В dev-режиме backend сам применяет миграции при старте
#    (см. command в docker-compose.dev.yml)
# ------------------------------------------------------------------
info "Ожидаем готовности backend (max ${MAX_WAIT}с)..."
elapsed=0
until curl -sf "${BACKEND_HEALTH}" > /dev/null 2>&1; do
  if [ "$elapsed" -ge "$MAX_WAIT" ]; then
    error "Backend не ответил за ${MAX_WAIT}с. Проверьте логи: docker compose logs backend"
  fi
  sleep 3
  elapsed=$((elapsed + 3))
  echo -n "."
done
echo ""
info "Backend готов (${elapsed}с)."

# ------------------------------------------------------------------
# 4. Применяем миграции явно (на случай если backend уже был запущен
#    без миграций, или для prod-режима)
# ------------------------------------------------------------------
info "Применяем миграции..."
$COMPOSE exec backend alembic upgrade head
info "Миграции применены."

# ------------------------------------------------------------------
# 5. Заполняем БД сидами (идемпотентно)
# ------------------------------------------------------------------
info "Запускаем сиды..."
$COMPOSE exec backend python -m app.seeds
info "Сиды выполнены."

# ------------------------------------------------------------------
# 6. Итог
# ------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Dev-среда готова!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "  Frontend : http://localhost:3003"
echo "  Backend  : http://localhost:8000"
echo "  Swagger  : http://localhost:8000/docs"
echo "  ReDoc    : http://localhost:8000/redoc"
echo ""
echo "  Учётные записи:"
echo "    admin@heatcalc.io   / admin        (admin)"
echo "    admin2@heatcalc.io  / Admin2pass!  (admin)"
echo "    petrov@heatcalc.io  / Employee1!   (employee)"
echo "    sidorova@heatcalc.io / Employee2!  (employee)"
echo "    kuznetsov@heatcalc.io / Employee3! (employee)"
echo ""
echo "  Данные в БД:"
echo "    6 пользователей, 5 коэффициентов, 15 кабелей, 10 аксессуаров"
echo "    10 проектов, ~25 объектов с расчётами, электрорасчёты, спецификации"
echo ""
