# Развёртывание

Программный комплекс упакован в три Docker-образа: `db` (PostgreSQL 16),
`backend` (FastAPI/uvicorn + WeasyPrint для PDF-экспорта), `frontend` (nginx +
скомпилированный React-bundle). Развёртывание поддерживается через
`docker-compose` и не требует выхода в интернет в рантайме (раздел NFR-REL-02 SRS).

## Быстрый старт (production, единственный сервер)

```bash
# 1. Скопировать пример переменных окружения и отредактировать
cp .env.example .env
$EDITOR .env
#   обязательно поменять:
#     SECRET_KEY                 — длинная случайная строка
#     POSTGRES_PASSWORD          — пароль БД
#     FIRST_ADMIN_EMAIL          — учётка первого администратора
#     FIRST_ADMIN_PASSWORD       — пароль первого администратора
#     VITE_API_BASE_URL          — оставить /api/v1 если фронтенд проксирует backend через nginx
#     GUEST_MAX_SESSIONS_PER_IP  — лимит создания гостевых сессий с одного IP

# 2. Собрать образы и запустить
make prod
#   эквивалент: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# 3. Проверить статус
docker compose ps
#   backend healthy, frontend healthy, db healthy
```

Доступ:
- Веб-UI: `http://<host>:80` (порт переопределяется через `FRONTEND_PORT`)
- Swagger API: `http://<host>:80/api/v1/docs` (через nginx-proxy)

## Production-режим (`make prod`)

Использует override-файл `docker-compose.prod.yml`:
- PostgreSQL **не публикует порт наружу** — доступен только из docker-сети.
- Backend **не публикует порт наружу** — доступ только через nginx-фронтенд.
- Frontend публикует один порт `80` (или `FRONTEND_PORT`).
- `restart: always` для всех сервисов.

## Dev-режим (`make dev`)

Override `docker-compose.dev.yml`:
- Backend с `--reload` и bind-mount `./backend:/app` (hot-reload Python).
- Frontend через `vite dev-server` на :3003 с HMR.
- Все порты опубликованы для удобства отладки.
- `GUEST_MAX_SESSIONS_PER_IP=500` для прогона e2e.

## Локальные логи и observability

Backend и worker пишут структурные JSON-логи в stdout. Каждый HTTP-запрос
получает `X-Request-Id`; frontend прокидывает этот заголовок в API-запросах, а
backend возвращает его в ответе. Бизнес-действия пишутся в Postgres
`audit_events`, технические логи контейнеров собираются отдельно.

Локальный стек Loki/Grafana/Alloy запускается как дополнительный compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml up -d
```

По умолчанию:
- Grafana: `http://localhost:3002`;
- Loki: `http://localhost:3100`;
- Alloy: `http://localhost:12345`.

Alloy читает Docker logs контейнеров `heatcalc_backend`, `heatcalc_worker`,
`heatcalc_frontend`, `heatcalc_db`, `heatcalc_redis` и самого observability-
стека. Postgres/Redis не требуют отдельного агента: их stdout попадает в тот же
Loki-поток.

## Сборка и упаковка образов

### Сборка локально

```bash
make package                          # heatcalc-backend:latest + heatcalc-frontend:latest
make package IMAGE_TAG=v1.0.0         # с конкретным тегом
make package IMAGE_TAG=v1.0.0 \
             VITE_API_BASE_URL=https://api.example.com   # для развёртывания за доменом
```

### Экспорт в `.tar.gz` для on-premise (без доступа к registry)

```bash
make package-save IMAGE_TAG=v1.0.0
# создаст:
#   dist/heatcalc-backend-v1.0.0.tar.gz
#   dist/heatcalc-frontend-v1.0.0.tar.gz

# На целевом сервере:
gunzip -c heatcalc-backend-v1.0.0.tar.gz | docker load
gunzip -c heatcalc-frontend-v1.0.0.tar.gz | docker load
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

### Push в registry

```bash
make push IMAGE_TAG=v1.0.0 REGISTRY=registry.tlt.local
```

### Полный релиз (тесты + сборка + tar)

```bash
make release IMAGE_TAG=v1.0.0
```

## Миграции

Backend-контейнер автоматически прогоняет `alembic upgrade head` при старте
(см. `backend/scripts/docker-entrypoint.sh`). Поэтому пересборка/перезапуск
образа достаточно для обновления схемы — отдельная команда не нужна.

Ручные операции (если нужны):

```bash
make migrate                       # alembic upgrade head
make migrate-new MSG="описание"    # autogenerate новой ревизии
make migrate-down                  # rollback на 1 шаг
make migrate-history               # история ревизий
```

Тестовая БД `heatcalc_test` создаётся вручную (один раз):

```bash
docker compose exec db psql -U heatcalc -d postgres \
    -c "CREATE DATABASE heatcalc_test OWNER heatcalc;"
```

## Healthchecks

Все сервисы имеют healthcheck:

| Сервис | Проверка | Интервал |
|---|---|---|
| `db` | `pg_isready` | 5 сек |
| `backend` | `curl /docs` | 30 сек |
| `frontend` | `wget /` | 30 сек |

`frontend` стартует только после `backend` healthy (через `depends_on.condition`),
а `backend` — только после `db` healthy. Это исключает «гонки» при первом запуске.

## Работа в локальной сети без интернета (NFR-REL-02)

Все справочники (climate.json / insulation.json / cables_tlt.json /
accessories.json) встроены в образ `backend`. Фронтенд-ассеты скомпилированы
в `dist/` внутри образа и отдаются nginx. Внешних зависимостей в рантайме нет.

Для on-premise установки в закрытый контур:
1. На машине с интернетом: `make package-save IMAGE_TAG=v1.0.0`.
2. Перенести `dist/*.tar.gz`, `docker-compose*.yml`, `.env` на целевой сервер.
3. На целевом сервере: `docker load` + `make prod`.

## Шифрование формул и справочников (ТЗ §5)

В текущем контуре зафиксирован **Вариант А** (см. SRS NFR-SEC-03): формулы в Python-коде и
JSON-справочники находятся внутри Docker-образа `backend`. Ротация ключей не
реализована — обновление «ключа шифрования» = пересборка и повторное
развёртывание образа. Интерфейс ротации не требуется по ТЗ для Варианта А.

Варианты Б (внешний менеджер секретов: Vault, KMS) и С (Docker Secrets)
относятся к расширенной версии и не включены в текущий контур.

## Структура файлов

```
docker-compose.yml         — базовый компоуз (БД, backend, frontend, healthchecks)
docker-compose.dev.yml     — overrides для dev: hot-reload, открытые порты, высокий guest-лимит
docker-compose.prod.yml    — overrides для прод: закрытые порты db/backend, restart=always
docker-compose.e2e.yml     — отдельный compose для e2e (test DB на :5433)
docker-compose.observability.yml — локальные Loki/Grafana/Alloy для Docker logs
observability/             — конфиги Loki, Grafana datasource и Alloy Docker collector
backend/
  Dockerfile               — production: multi-stage (builder→runtime), non-root, healthcheck
  Dockerfile.dev           — dev: с reload и dev-зависимостями
  scripts/docker-entrypoint.sh — wait-for-db + alembic upgrade head + uvicorn
  .dockerignore            — исключает тесты, кэши, .env
frontend/
  Dockerfile               — production: vite build → nginx alpine
  Dockerfile.dev           — dev: vite dev-server
  nginx.conf               — gzip, кэш /assets/, proxy /api/ → backend:8000
  .dockerignore            — исключает node_modules, тесты, кэши
.dockerignore              — корневой (для общих контекстов)
.env.example               — шаблон переменных окружения
```
