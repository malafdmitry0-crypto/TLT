# API

Интерактивная документация:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

Полная сводка эндпоинтов — в `CLAUDE.MD` §8 (корневой).

## Основные группы эндпоинтов

| Префикс | Назначение |
|---|---|
| `/api/v1/auth/*` | `guest`, `login`, `me` — аутентификация, гостевые сессии |
| `/api/v1/projects` | CRUD проектов (лимиты для гостей) |
| `/api/v1/projects/{id}/objects` | CRUD объектов + `reorder`, `import-excel`, `import-template`, `export-excel` |
| `/api/v1/calc/electrical/*` | Батч-электрорасчёт, настройки подбора |
| `/api/v1/specifications/*` | Генерация/просмотр спецификации |
| `/api/v1/reports/{id}/{preview,export/{fmt}}` | HTML-превью и экспорт PDF/DOCX/XLSX |
| `/api/v1/references/*` | Встроенные справочники (climate, insulation, cables, accessories) |
| `/api/v1/admin/*` | Пользователи, коэффициенты (только admin) |
| `/health` | Liveness-проба |

## Аутентификация

- **Гость**: заголовок `X-Session-Id: <session_id>` (выдаётся `POST /auth/guest`)
- **Сотрудник / Админ**: заголовок `Authorization: Bearer <JWT>` (JWT от `POST /auth/login`)

## Rate limits

- `/auth/guest`: 10 сессий / IP / час (sliding window, in-memory)
- Создание проектов гостем: 10 на сессию
- Объектов в проекте: 50 (настраивается `GUEST_MAX_OBJECTS_PER_PROJECT`)

## Импорт объектов из Excel / CSV

**`POST /projects/{id}/objects/import-excel`** (multipart/form-data, поле `file`)

Детектирует формат по расширению:
- `.xlsx` — два листа `Трубопроводы` и `Резервуары`
- `.csv` — один файл, колонка `Тип` (`труба`/`резервуар`), автодетект разделителя

Ответ: `{created: N, errors: [{sheet, row, message}]}`.

**`GET /projects/{id}/objects/import-template?format=xlsx|csv`** — скачать шаблон
с примерами. Материалы и формы принимают и русские названия, и англ. коды
(детали — `docs/samples/README.md`).

## Электрорасчёт

**`POST /calc/electrical/batch`** — автоподбор ТЛТ для всех валидных объектов
проекта. **Upsert** по `(object_id, variant_number)`. При ошибке расчёта
сохраняется запись с `results.error`, `cable_mark=null` — причина видна на UI
после reload.
