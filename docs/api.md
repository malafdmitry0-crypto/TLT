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
| `/api/v1/references/*` | Встроенные справочники (climate, insulation, pipe-materials, soil-conductivity, cables, resistive-cables, accessories) |
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

**`POST /calc/electrical/batch`** — автоподбор выбранного расчётного типа
кабеля для всех валидных объектов проекта: ТЛТ (`self_regulating`),
ТТН/ТТВ/ТТХ (`self_regulating_tt`), ТТ Р1 (`single_core`) или ТТ Р3
(`three_core`). **Upsert** по `(object_id, variant_number)`. При ошибке расчёта
сохраняется запись с `results.error`, `cable_mark=null` — причина видна на UI
после reload.

Для резистивных `single_core`/`three_core` основной автоподбор использует
`selection_mode=auto`: full-version VSDX-стратегия `U/N/M`, `p2/p3`, `L1/L2`.
`selection_mode=manual` остается диагностическим/ручным режимом для явно
заданной схемы подключения и числа ниток.

Для ТЛТ-автоподбора поддерживается `selection_policy`:
`technical_minimum`, `lowest_cost`, `fastest_delivery`, `in_stock`,
`preferred_supplier`, `balanced`. Коммерческая политика применяется только после
технического отбора. Если данных не хватает, backend возвращает
`applied_selection_policy=technical_minimum`, `selection_reason` и warning.
Источник `cable_source=commercial` доступен всем ролям и строится как public
commercial projection поверх встроенного ТЛТ-каталога.

**`GET /references/cables?source=commercial`** и
**`GET /references/cables/commercial`** — публичный commercial catalog для всех
ролей. `source=extended|all` по-прежнему доступен только сотруднику/админу.
