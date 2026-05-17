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

**`POST /projects/{id}/objects/import-excel`** (multipart/form-data, поля
`file`, опционально `mode=merge|append|replace`; по умолчанию `merge`)

Детектирует формат по расширению:
- `.xlsx` — два листа `Трубопроводы` и `Резервуары`
- `.csv` — один файл, колонка `Тип` (`труба`/`резервуар`), автодетект разделителя

Режимы:
- `merge` — добавляет только строки, которых ещё нет в проекте по ключу
  `тип объекта + нормализованное имя + hash(params без name)`;
- `append` — всегда добавляет строки как новые объекты;
- `replace` — удаляет текущие объекты проекта, электрорасчёты и спецификации,
  затем импортирует файл заново.

Ответ: `{created: N, skipped_duplicates: N, mode, errors: [{sheet, row, message}]}`.

**`GET /projects/{id}/objects/import-template?format=xlsx|csv`** — скачать шаблон
с примерами. Материалы и формы принимают и русские названия, и англ. коды
(детали — `docs/samples/README.md`).

## Электрорасчёт

**`POST /calc/electrical/batch`** — автоподбор выбранного расчётного типа
кабеля для всех валидных объектов проекта: ТЛТ (`self_regulating`),
ТТН/ТТВ/ТТХ (`self_regulating_tt`), ТТ Р1 (`single_core`) или ТТ Р3
(`three_core`). **Upsert** по `(object_id, variant_number)`. При ошибке расчёта
сохраняется запись с `cable_mark=null` и structured payload:
`results.error_code`, `results.category`, `results.message`, `results.field`,
`results.hint`. Допустимые категории:
`validation`, `formula`, `unsupported`, `external`; причина видна на UI после
reload.

Если объект валиден по теплопотерям, но сценарий электрорасчёта не поддержан
методикой, это не считается ошибкой подбора. Для сферического резервуара без
формулы укладки кабеля сохраняется
`results.error_code="unsupported_layout"` и `results.category="unsupported"`;
UI показывает статус «Не применимо».

Для резистивных `single_core`/`three_core` основной автоподбор использует
`selection_mode=auto`: full-version VSDX-стратегия `U/N/M`, `p2/p3`, `L1/L2`.
`selection_mode=manual` остается диагностическим/ручным режимом для явно
заданной схемы подключения и числа ниток.

Для ТЛТ и резистивного auto-подбора поддерживается `selection_policy`:
`technical_minimum`, `lowest_cost`, `fastest_delivery`, `in_stock`,
`preferred_supplier`, `balanced`. Коммерческая политика применяется только после
технического отбора. Если данных не хватает, backend возвращает
`applied_selection_policy=technical_minimum`, `selection_reason` и warning.
`balanced` работает только при `balanced_weights_approved=true`; до бизнес-
утверждения весов это controlled fallback. Источник `cable_source=commercial`
доступен всем ролям и строится как public commercial projection поверх
встроенных ТЛТ/резистивных каталогов и sanitized строк внешней БД.

**`GET /references/cables?source=commercial`** и
**`GET /references/cables/commercial`** — публичный commercial catalog для всех
ролей. `source=extended|all` по-прежнему доступен только сотруднику/админу.
