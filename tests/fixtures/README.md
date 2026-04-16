# Tests Fixtures — замороженные баги и edge-cases

Библиотека JSON-дампов проектов, которые воспроизводят известные баги
или сложные расчётные сценарии. Используются для регрессионного тестирования
и быстрой диагностики, когда баг возвращается.

## Структура

```
tests/fixtures/
├── README.md                      ← этот файл
├── pdf_export_regression.json     ← проект, на котором падал PDF-экспорт (weasyprint/pydyf)
└── <topic>.json                   ← далее по мере появления
```

## Как использовать

### Восстановить проект из фикстуры

```bash
# Подразумевается, что стек поднят
SID=$(curl -s -X POST http://localhost:8080/api/v1/auth/guest | jq -r .session_id)
curl -s -X POST http://localhost:8080/api/v1/projects/import \
  -H "Content-Type: application/json" \
  -H "X-Session-Id: $SID" \
  -d @tests/fixtures/pdf_export_regression.json
```

> Импорт целого проекта через API пока не реализован. Пока — ручное восстановление через sql-вставку или отдельный seed-скрипт. Endpoint `POST /projects/import` — в бэклоге.

### Сгенерировать новую фикстуру

1. Воспроизведи баг руками (через UI или curl).
2. Сохрани состояние:
   ```bash
   PID=<uuid>
   curl -s http://localhost:8080/api/v1/projects/$PID/export-json > tests/fixtures/<topic>.json
   ```
3. Добавь заголовок-комментарий в JSON (формат ниже) — чтобы через месяц было понятно, что это за фикстура.

## Формат файла

Каждый JSON должен быть самодостаточным и включать **metadata**:

```json
{
  "_fixture_meta": {
    "topic": "pdf_export_regression",
    "bug_id": "internal",
    "created_at": "2026-04-14",
    "description": "Проект с объектом, на котором падал PDF-экспорт из-за pydyf>=0.11",
    "reproduces": "Login as employee, GET /reports/{id}/export/pdf",
    "fixed_in": "requirements.txt: pydyf==0.10.0"
  },
  "project": { ... },
  "objects": [ ... ],
  "electrical_calculations": [ ... ]
}
```

## Актуальные фикстуры

| Файл | Топик | Что воспроизводит |
|---|---|---|
| `pdf_export_regression.json` | PDF export | Падение WeasyPrint при `pydyf>=0.11` |
