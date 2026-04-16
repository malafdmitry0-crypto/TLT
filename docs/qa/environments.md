# Тестовые окружения и данные

## Окружения

| Окружение | URL Backend | URL Frontend | БД | Compose |
|-----------|-------------|--------------|-----|---------|
| Local Dev | http://localhost:8000 | http://localhost:3003 | localhost:5432 | `docker-compose.yml` + `docker-compose.dev.yml` |
| Prod (on-prem) | не публикуется наружу | http://localhost (порт `${FRONTEND_PORT:-80}`) | не публикуется | `docker-compose.yml` + `docker-compose.prod.yml` |
| Demo (заказчик) | внутренний | http://localhost:8080 | внутренняя | `demo/docker-compose.yml` |
| E2E (Playwright) | http://localhost:8001 | http://localhost:3001 | localhost:5433 | `docker-compose.e2e.yml` |
| Pytest integration | —ASGI transport— | — | `heatcalc_test` (на порту dev-БД) | conftest.py |

**Playwright:** базовый URL берётся из `E2E_BASE_URL`, дефолт —
`http://localhost:3001` (см. `e2e/playwright.config.ts`).

## Запуск dev-окружения

```bash
# Если порт 5432 занят локальным PostgreSQL:
sudo systemctl stop postgresql

make dev          # запустить
make seed         # загрузить тестовые данные
make down         # остановить
```

## Seed-данные (после `make seed`)

### Пользователи

| Email | Пароль | Роль |
|-------|--------|------|
| `admin@heatcalc.io` | `admin` | admin (создаётся автоматически) |
| `admin2@heatcalc.io` | `Admin2pass!` | admin |
| `petrov@heatcalc.io` | `Employee1!` | employee |
| `sidorova@heatcalc.io` | `Employee2!` | employee |
| `kuznetsov@heatcalc.io` | `Employee3!` | employee |
| `morozova@heatcalc.io` | `Employee4!` | employee |
| `volkov@heatcalc.io` | `Employee5!` | employee |

### Корректирующие коэффициенты

| Ключ | Значение по умолчанию |
|------|-----------------------|
| `wind_factor` | 1.0 |
| `safety_factor` | 1.1 |
| `location_indoor` | 0.9 |
| `location_outdoor` | 1.0 |
| `ground_conductivity` | 1.5 |

### Проекты (10 шт.)
5 в статусе `draft`, 5 в статусе `completed`, у каждого 3 объекта.

### Кабели (15 шт.)
По 3 кабеля каждого типа: `self_regulating`, `single_core`, `three_core`, `mineral`, `skin`.

### Аксессуары (10 шт.)
Категории: `end_sleeve`, `junction_box`, `thermostat`, `fastener`, `protection`.

## Swagger UI

- Swagger: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- OpenAPI JSON: http://localhost:8000/api/v1/openapi.json

## Заголовки аутентификации

```http
# JWT (employee / admin)
Authorization: Bearer <access_token>

# Гостевая сессия
X-Session-Id: <session_id>
```

## Учётные данные для e2e / integration

| Слой | Источник | Admin | Employee |
|---|---|---|---|
| e2e (Playwright) | `docker-compose.e2e.yml` + seeds | `admin@heatcalc.io` / `admin` | `petrov@heatcalc.io` / `Employee1!` |
| pytest integration | `backend/app/tests/conftest.py` (фабрики) | создаются per-test | создаются per-test |
| Demo | `demo/.env.example` | `admin@heatcalc.io` / `admin` | `petrov@heatcalc.io` / `Employee1!` |

**Единый формат:** на всех уровнях, где сиды запущены, email админа —
`admin@heatcalc.io`. Расхождений (`admin@test.local`, `admin@test.com`)
больше нет в конфигурации стеков.
