# MCP postgres — настройка

Сервер даёт Клоду прямой SQL-доступ к `heatcalc_db` без `docker exec psql`.

## Как активировать

В этой сессии: ответьте **«yes, use this one»** когда Claude Code впервые предложит `postgres` MCP. Сервер активируется автоматически при следующем запросе Клода к БД.

Следующие сессии: сервер зарегистрирован в `.mcp.json` (проектный файл) и будет предложен при старте.

## Что нужно

- Docker Desktop запущен
- Сетевой мост `tlt_default` должен существовать (появляется после `docker compose up`, используется `docker-compose.yml`). Если поднят только demo-стек — сеть будет `demo_default`, тогда временно исправьте в `.mcp.json`.
- Образ `mcp/postgres` будет подтянут при первом запуске (~100 МБ).

## Типичные запросы (для справки)

Клод будет выполнять сам, примеры для вашего понимания:

```sql
SELECT name, status, created_at FROM projects ORDER BY created_at DESC LIMIT 10;

SELECT object_type, COUNT(*) as n, SUM((results->>'heat_loss_per_meter')::float) AS total
FROM project_objects WHERE is_valid = true GROUP BY object_type;

SELECT * FROM electrical_calculations WHERE cable_mark IS NULL;  -- failed calcs
```

## Если не работает

- **Образ `mcp/postgres` не найден**: `docker pull mcp/postgres`
- **«network not found»**: поднимите dev/demo стек, чтобы создать сеть. Либо исправьте `--network` в `.mcp.json` (на актуальное имя из `docker network ls`).
- **Перезапустить сервер**: в Claude Code `/mcp` → `postgres` → Restart.

## Безопасность

- Доступ только внутри вашей машины (Docker-сеть).
- Учётные данные из `docker-compose.yml` — локальные, не production.
- Не коммитьте изменённый `.mcp.json` с чужими креденшлами.
