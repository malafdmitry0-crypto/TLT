#!/bin/sh
# Production-entrypoint: дожидается доступности БД, прогоняет миграции,
# затем запускает uvicorn. Используется в `backend/Dockerfile` как ENTRYPOINT.
#
# Используется один скрипт и для on-premise (PostgreSQL запущен рядом),
# и для облачного развёртывания — drop-in замена docker-compose.

set -e

echo "[entrypoint] Ожидание PostgreSQL..."
# DATABASE_URL формата postgresql+asyncpg://user:pass@host:port/dbname
HOST_PORT=$(echo "${DATABASE_URL:-}" | sed -E 's|.*@([^/]+)/.*|\1|')
DB_HOST="${HOST_PORT%%:*}"
DB_PORT="${HOST_PORT##*:}"
[ "$DB_HOST" = "$DB_PORT" ] && DB_PORT=5432

# 60 попыток × 1 сек = 1 минута на старт БД
i=0
while ! nc -z "$DB_HOST" "$DB_PORT" 2>/dev/null; do
  i=$((i + 1))
  if [ $i -ge 60 ]; then
    echo "[entrypoint] PostgreSQL ${DB_HOST}:${DB_PORT} недоступен после 60 секунд — выход" >&2
    exit 1
  fi
  sleep 1
done
echo "[entrypoint] PostgreSQL доступен"

echo "[entrypoint] Применение миграций (alembic upgrade head)..."
alembic upgrade head

# Опциональный прогон сидов. Включается переменной окружения RUN_SEEDS=1.
# Сиды идемпотентны (повторный запуск не создаёт дублей), безопасно запускать
# при каждом старте. Для демо-сборки это включено по умолчанию.
if [ "${RUN_SEEDS:-0}" = "1" ]; then
  echo "[entrypoint] Прогон сидов (python -m app.seeds)..."
  python -m app.seeds || echo "[entrypoint] ВНИМАНИЕ: сиды завершились с ошибкой, продолжаем запуск"
else
  echo "[entrypoint] Сиды пропущены (установите RUN_SEEDS=1 для включения)"
fi

echo "[entrypoint] Старт приложения: $@"
exec "$@"
