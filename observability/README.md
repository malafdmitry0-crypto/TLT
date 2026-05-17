# Local Observability

Локальный стек собирает stdout/stderr Docker-контейнеров `heatcalc_*`:

- backend/worker пишут JSON-логи с `request_id`;
- Postgres и Redis остаются в своих штатных stdout-логах;
- Grafana Alloy читает Docker logs и отправляет их в Loki;
- Grafana подключает Loki как datasource.

Запуск вместе с приложением:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.observability.yml up -d
```

Адреса по умолчанию:

- Grafana: `http://localhost:3002` (`admin` / `admin`, можно переопределить через env);
- Loki: `http://localhost:3100`;
- Alloy: `http://localhost:12345`.

Бизнес-аудит хранится не в Loki, а в Postgres-таблице `audit_events`. Loki нужен
для диагностики процессов, HTTP-запросов, БД и Redis; `audit_events` нужен для
сверки пользовательских действий и расчётной бизнес-логики с ТЗ.
