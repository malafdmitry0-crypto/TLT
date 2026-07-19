# API

Интерактивная документация:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

Полная сводка эндпоинтов — в `CLAUDE.MD` §8 (корневой).

Dynamic-ER Phase 1–3 реализуют backend/DB foundation, именованный UUID
lifecycle во frontend и authoritative assignments объектов внутри каждого ЭР.
Phase 5 имеет partial PASS: specification settings/preflight/multi-ЭР generation,
UUID-first multi-ЭР preview, CSV v3 export/v2+v3 import и ER5 write cutover
реализованы. Direct calculation, specification и report API пока сохраняют
deprecated numeric adapter `variant_number=1…5`, но backend обязана разрешить и
проверить точный `electrical_variant_id` для UUID-aware flow. Известный остаток:
service-методы создания кандидата и папки кандидатов всё ещё отклоняют slot 5;
это implementation gap, а не целевой лимит. Phase 4 blocked
PDL-ER-15/18/28 до официального числового каталога; общий PDF/DoD и product
release не завершены.

## Основные группы эндпоинтов

| Префикс | Назначение |
|---|---|
| `/api/v1/auth/*` | `guest`, `login`, `me` — аутентификация, гостевые сессии |
| `/api/v1/projects` | CRUD проектов (лимиты для гостей) |
| `/api/v1/projects/{id}/objects` | CRUD объектов + `reorder`, `import-excel`, `import-template`, `export-excel` |
| `/api/v1/projects/{id}/electrical-readiness`, `/electrical-variants` | Readiness, lifecycle именованных UUID ЭР и assignments объектов (Phase 1–3) |
| `/api/v1/calc/electrical/*` | Батч-электрорасчёт, настройки подбора |
| `/api/v1/specifications/*` | Генерация/просмотр спецификации. `POST /{id}/generate` принимает `mode=basic\|full` (+`options`: R,гр, Ex, К1i/К2i/Кiu, L,К2i); `full` — полный условный BOM ТНП, только сотрудник (гостю 403). Ответ: `items`, `mode`, `skipped_objects`; GET возвращает `generation_mode`/`generation_options` последней генерации |
| `/api/v1/reports/{id}/{preview,export/{fmt}}` | HTML-превью по явному UUID-списку ЭР и employee export PDF/DOCX/XLSX одного ЭР |
| `/api/v1/audit/client-events` | Приём frontend-событий бизнес-аудита |
| `/api/v1/references/*` | Встроенные справочники (climate, insulation, pipe-materials, soil-conductivity, cables, resistive-cables, accessories) |
| `/api/v1/admin/*` | Пользователи, коэффициенты (только admin) |
| `/health` | Liveness-проба |

## Аутентификация

- **Гость**: заголовок `X-Session-Id: <session_id>` (выдаётся `POST /auth/guest`)
- **Сотрудник / Админ**: заголовок `Authorization: Bearer <JWT>` (JWT от `POST /auth/login`)

## Пользовательские UI-настройки

**`GET/PUT /preferences/{key}`** доступен сотрудникам и администраторам для
сохранения пользовательских настроек интерфейса. Гости используют только
localStorage в браузере. Поддержанные HeatCalc-ключи:

- `heatcalc.tableColumns.v8` — видимость, порядок и ширина таблицы
  теплопотерь;
- `heatcalc.tableView.v2` — размер шрифта, формат заголовков, расположение
  блока параметров, ширина боковой формы и пропорции секций формы.

Поддержанные electrical-ключи:

- `electrical.tableColumns` — видимость, порядок и ширина основной таблицы
  электрорасчёта;
- `electrical.tableView` — размер шрифта, формат заголовков и база
  пересчёта;
- `electrical.candidateTableColumns` — видимость, порядок и ширина таблицы
  кандидатов в модалке `Подбор`.

Backend валидирует список известных колонок, обязательные колонки и
диапазон `widthPct=3..60`. Настройки таблицы кандидатов не переиспользуют state
основной таблицы.

## Доступ к проектам

- **Гость** видит и открывает только проекты своей `session_id`.
- **Сотрудник** видит и открывает проекты зарегистрированных пользователей
  (`user_id IS NOT NULL`), включая проекты других сотрудников, но не видит и
  не открывает гостевые проекты подрядчиков (`user_id IS NULL`,
  `session_id IS NOT NULL`).
- Изменение и удаление чужого проекта для сотрудника запрещено; такие операции
  доступны владельцу проекта или администратору.
- **Администратор** видит все проекты для сопровождения.

**`POST /projects/{project_id}/duplicate`** после копирования объектов заново
считает heat loss. Если копия готова к electrical, endpoint readiness-gated
создаёт `ЭР1`/UUID и полную матрицу `unassigned`, но не угадывает тип системы и
не запускает batch electrical. Неготовая копия возвращается `201` как
heat-only project без ЭР, assignments и electrical rows; audit содержит
electrical status и readiness issue codes.

## Rate limits

- `/auth/guest`: 10 сессий / IP / час (sliding window, Redis или in-memory)
- `/auth/login`: 10 попыток / IP / час
  - bcrypt-проверка пароля выполняется вне event loop API с лимитом
    `AUTH_PASSWORD_HASH_MAX_CONCURRENCY`
- Импорт объектов: 20 запросов / пользователь+IP / час
- Операции с отчётами (preview/export): 30 запросов / пользователь+IP / час
- Синхронные batch-расчёты: 30 запросов / пользователь+IP / час
- Постановка фоновых задач в очередь: 20 запросов / пользователь+IP / час
- Активные фоновые задачи: не более 3 на проект, 5 на пользователя/гостевую
  сессию и 200 глобально в очереди/исполнении
- Создание проектов гостем: 10 на сессию
- Объектов в проекте: 50 (настраивается `GUEST_MAX_OBJECTS_PER_PROJECT`;
  лимит применяется ко всем ролям, имя настройки историческое)
- Размер upload-запроса: 10 МБ на backend, nginx и Caddy

## Логи и бизнес-аудит

Каждый backend-запрос получает/прокидывает `X-Request-Id`; тот же идентификатор
попадает в JSON-логи backend/worker и в `audit_events.request_id`.

**`POST /audit/client-events`** принимает frontend-события текущего гостя,
сотрудника или администратора:

```json
{
  "events": [
    {
      "event_type": "frontend.window.error",
      "severity": "error",
      "result": "failure",
      "project_id": "00000000-0000-0000-0000-000000000000",
      "details": {"path": "/workspace", "message": "Render failed"},
      "error_code": "frontend_error"
    }
  ]
}
```

Ответ: `202 Accepted`, `{ "accepted": N }`. Пароли, токены, cookie, csrf и
похожие секреты в `details`, `before_state`, `after_state` редактируются перед
записью. Бизнес-аудит хранится в Postgres `audit_events`; технические логи всех
контейнеров собираются локальным Loki/Grafana stack из `observability/`.

## Объекты проекта

**`PUT /projects/{id}/objects/{object_id}`** обновляет параметры/порядок объекта
и запускает автопересчёт теплопотерь. Тело запроса должно содержать текущую
`version` объекта:

```json
{
  "version": 1,
  "params": {"insulation_thickness": 0.02}
}
```

Backend выполняет optimistic lock по `project_objects.version`: успешное
обновление атомарно увеличивает `version` на 1 и возвращает объект с новой
версией. Если объект уже был изменён другим запросом, ответ:
`409 Conflict` с `detail="Объект был изменён в другой вкладке, перезагрузите."`.

`safety_factor_source` в `project_objects.params` может быть `default`,
`manual` или `climate_policy`. Если клиент явно передал `safety_factor` без
источника, backend считает значение ручным, включая `1.1`; автополитика климата
может менять K только для `default`/`climate_policy` или отсутствующего поля.

**`POST /projects/{id}/objects/query`** возвращает страницу объектов
теплорасчёта с backend-фильтрами и сортировками. Для стандартной сортировки
`(sort_order, id)` и SQL-поддерживаемых фильтров/сортировок ответ содержит
`page_info.next_cursor = {sort_order, id, key, value, value_is_null}` при
наличии следующей страницы. Последовательная следующая страница передаёт
`after_sort_order`, `after_id`, `after_key`, `after_value`,
`after_value_is_null`; backend использует keyset pagination. Произвольный
переход по `page` без cursor остаётся offset fallback для совместимости.

**`POST /calc/heat-loss/batch`** пересчитывает теплопотери объектов проекта.
После пересчёта существующие электрорасчёты помечаются `stale`, а сохранённые
спецификации проекта получают `is_stale=true`, потому что спецификация является
производной от теплопотерь и электрорасчётов.

**`POST /calc/heat-loss/batch/jobs`** принимает JSON
`{ project_id, include_errors, object_ids? }`. Если `object_ids` переданы,
фоновой задачей пересчитываются только выбранные объекты проекта; без
`object_ids` пересчитывается весь проект.

## Фоновые задачи и idempotency

Async job endpoints принимают заголовок `Idempotency-Key` и дедуплицируют
повторную постановку одной операции:

- `POST /calc/electrical/batch/jobs`
- `POST /calc/heat-loss/batch/jobs`
- `POST /reports/{project_id}/export/{format}/jobs`

Для `electrical_batch` и `report_export` новый task payload имеет версию 3 и
содержит `project_id` + `electrical_variant_id`. UUID также возвращается в
`CalculationTaskResponse.electrical_variant_id`; report task result повторяет
его для traceability. `variant_number=1…5` во входном запросе остаётся
deprecated compatibility adapter: backend разрешает его в project-scoped UUID,
но не принимает одновременно UUID и number. Worker продолжает читать
исторические payload без версии/v2, тогда как новые и replay-upgraded задачи
UUID-first.

Явный ключ namespaced по `principal + task type + project`; одна и та же строка
ключа разных principals, типов задач или проектов не пересекается. Внутри
namespace первый вызов binding-ит полный нормализованный payload и UUID ЭР.
Точный retry возвращает исходную задачу, даже если она уже terminal. Повтор
ключа с изменённым payload или ЭР возвращает `409` с
`detail.code="TASK_IDEMPOTENCY_KEY_REUSED"`. Контракт одинаков для
electrical-batch, report-export и heat-loss jobs; для heat-задачи сравнивается
полный payload без ER scope. Heat lookup/insert сериализован project-row lock,
поэтому retry не создаёт вторую binding при переходе первой задачи в terminal.
API помечает возврат существующей задачи событием
`task.<type>.idempotency_replayed` и записывает её фактический durable
status/result; ложное повторное `*.queued` событие не создаётся.

Selector contract `POST /calc/electrical/batch/jobs`:

- если `variant_number` omitted и UUID нет, сохраняется legacy default `1`;
- если передан только `electrical_variant_id`, implicit default number
  очищается;
- явный `variant_number:null` без UUID возвращает `422`, response содержит
  `ELECTRICAL_VARIANT_SELECTOR_REQUIRED`;
- ненулевые UUID и number одновременно возвращают selector conflict.

Invalid selector отклоняется schema validation до readiness adapter и не
создаёт ЭР/assignments/task.

Клиент генерирует новый UUID-ключ на пользовательское действие и повторно
использует тот же HTTP config при transport retry. Сетевые retry включены
только для идемпотентных `GET`, `HEAD`, `OPTIONS` при 5xx/timeout.

Worker переносит исчерпавшие попытки задачи в Redis stream
`WORKER_DEAD_LETTER_STREAM`; размер DLQ ограничен
`WORKER_DEAD_LETTER_MAXLEN=1000`, а запись в DLQ логируется warning-событием с
`task_id`, исходным stream id и причиной.

Admin-only endpoints для DLQ:
- `GET /admin/dead-letter` — список последних записей DLQ с текущим статусом
  задачи из Postgres.
- `GET /admin/dead-letter/{stream_id}` — детальная запись DLQ.
- `POST /admin/dead-letter/{stream_id}/replay` — сбросить связанную terminal
  task в `queued` и повторно поставить в worker stream.
- `DELETE /admin/dead-letter/{stream_id}` — удалить запись DLQ без replay.

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

Ответ:
`{created: N, skipped_duplicates: N, skipped_limit: N, mode, errors: [{sheet, row, message}]}`.
Если достигнут лимит объектов проекта, уже созданные строки остаются в проекте,
а число не импортированных строк явно возвращается в `skipped_limit`.

**`GET /projects/{id}/objects/import-template?format=xlsx|csv`** — скачать шаблон
с примерами. Материалы и формы принимают и русские названия, и англ. коды
(детали — `docs/samples/README.md`).

## Project CSV v3 и legacy import v2

**`GET /projects/{id}/export-csv`** и
**`GET /projects/export-csv-bulk?ids=...`** всегда создают
`schema_version=3`. Формат содержит `electrical_variants` с именами, active,
порядком, copy trace и optional compatibility slot; `electrical_assignments`,
`electrical` и `specifications` связываются стабильным `variant_key`.

**`POST /projects/import-csv`** и **`POST /projects/import-csv-bulk`** принимают
v3 и legacy v2. V3 восстанавливает именованные ЭР/assignments и проверяет
ссылочную целостность. V2 остаётся import-only adapter, допускает sparse slots
`1…5`, создаёт `ЭР1` плюс только занятые slots и явно связывает
calculations/specifications с UUID. Неверный slot, испорченная ссылка или
guest-файл с manual BOM rows отклоняются до замены текущего guest project.
Bulk-import использует savepoint на каждый project graph: ошибка одного проекта
не отменяет корректные проекты. Imported calculated snapshots с недоказанным
source contract не становятся молча актуальной закупочной истиной.

## Lifecycle именованных ЭР и assignments (Phase 1–3)

**`GET /projects/{project_id}/electrical-readiness`** возвращает:

```json
{
  "project_id": "00000000-0000-0000-0000-000000000000",
  "ready": false,
  "total_objects": 1,
  "ready_objects": 0,
  "issues": [
    {
      "code": "ELECTRICAL_OBJECT_NOT_READY",
      "message": "Сначала исправьте данные и выполните расчёт теплопотерь объекта",
      "object_id": "00000000-0000-0000-0000-000000000001",
      "details": {}
    }
  ]
}
```

Readiness требует хотя бы один объект, тип `pipe` или `tank`, `is_valid=true` и
конечный положительный `results.total_heat_loss` для каждого объекта.

**`POST /projects/{project_id}/electrical-variants/initialize`** —
идемпотентно создаёт первый active `ЭР1`, assignments всех объектов и
`electrical_initialized_at`. Неуспешная readiness возвращает `409` с
`detail.code="ELECTRICAL_READINESS_FAILED"` и массивом `issues`.

Остальной lifecycle:

- **`GET /projects/{project_id}/electrical-variants`** — список в
  `sort_order`; read policy совпадает с чтением проекта;
- **`POST /projects/{project_id}/electrical-variants`** — создать пустой ЭР
  после initialization, optional body `{ "name": "..." }`;
- **`POST /projects/{project_id}/electrical-variants/{variant_id}/copy`** —
  deep copy графа с обязательным `Idempotency-Key`, но без specification;
- **`PATCH /projects/{project_id}/electrical-variants/{variant_id}`** — rename,
  body `{ "name": "..." }`;
- **`POST /projects/{project_id}/electrical-variants/{variant_id}/activate`** —
  атомарно сменить единственный active;
- **`DELETE /projects/{project_id}/electrical-variants/{variant_id}`** — удалить
  с детерминированным active fallback.

Мутации доступны владельцу проекта и администратору; сотрудник с read-доступом
к чужому registered project может только читать readiness/list. Лимит — пять
ЭР. Имена непустые, максимум 128 символов и уникальны после `trim + casefold`.
Нельзя удалить последний ЭР или ЭР с задачей в `queued/enqueued/running`.

После миграции `0031` normal lifecycle назначает пяти ЭР compatibility slots
`1…5`; пятый ЭР может хранить calculation/candidate/folder/specification graph,
а deep copy использует slot 5. `legacy_variant_number=null` остаётся допустимым
только для pure UUID/import expand-state и не разрешает numeric fallback.
Создание нового candidate и candidate folder для slot 5 пока отдельно
fail-closed из-за оставшихся service guards `1…4`; остальные endpoints не
должны трактовать это как общий лимит четырёх ЭР.

Assignments являются project-scoped матрицей `ЭР × объект`; публичный контракт
всегда использует точный UUID ЭР:

- **`GET /projects/{project_id}/electrical-variants/{variant_id}/assignments`** —
  список с `view=all|unassigned|self_regulating|resistive|skin|mineral`,
  optional `assignment_state`, `page`, `page_size`. Ответ содержит отдельные
  `system_type`, `assignment_state`, `version`, diagnostics, object snapshot и
  счётчики по типам/состояниям;
- **`PATCH /projects/{project_id}/electrical-variants/{variant_id}/assignments`** —
  атомарно назначить 1…500 объектов в `self_regulating` или `resistive`:
  `{system_type, items:[{object_id, expected_version}]}`;
- **`POST /projects/{project_id}/electrical-variants/{variant_id}/unassign`** —
  подтверждённый возврат:
  `{confirm:true, items:[{object_id, expected_version}]}`.

`skin` и `mineral` не принимаются как target assignment: кнопки назначения для
них disabled. При этом их вкладки доступны для просмотра migrated unsupported
строк и confirmed unassign, иначе исторические данные оказались бы stranded.
Новое поддержанное назначение получает `assignment_state=stale` и
`ELECTRICAL_CALCULATION_REQUIRED`, а не фиктивный `ready`. Повторное назначение
в ту же систему идемпотентно (`changed_count=0`, версия и audit не меняются).
Смена `self_regulating ↔ resistive` требует сначала подтвердить unassign;
устаревший `expected_version` возвращает
`409 ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT` и откатывает весь список.

Confirmed unassign удаляет только exact
`project + electrical_variant_id + object_id` graph:
`electrical_calculations`, candidates, candidate folders и folder items.
Assignment остаётся как `unassigned/system_type=null`; heat object/results и
данные других ЭР сохраняются. Спецификация только этого ЭР помечается stale.
Если unassigned assignment содержит exact-UUID legacy graph, новый assign
возвращает `409 ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED`. UI показывает
отдельный handshake: пользователь подтверждает scoped cleanup с сохранением
heat, после чего явно повторяет назначение. NULL/mismatched legacy UUID,
cross-ER folder item и пересекающаяся active heat/electrical/report job дают
стабильный `409` до удаления данных и не очищаются numeric fallback-ом.

## Электрорасчёт

Ниже описаны действующие direct/legacy endpoints. Их numeric selector остаётся
deprecated adapter: перед записью backend создаёт или разрешает тот же
project-scoped UUID ЭР, а расчётный сервис получает compatibility slot `1…5`.
Adapter readiness-gated и используется всеми обычными write paths:
calculation/batch/copy/select, candidate create/apply/unapply, folder create,
specification generate/save, numeric electrical/report jobs и seed data. Если
mapping ещё нет, готовый проект получает active `ЭР1` и только явно
запрошенные sparse slots; запрос slot `5` не создаёт `ЭР2/ЭР3/ЭР4`. Неготовый
проект получает атомарный `409 ELECTRICAL_READINESS_FAILED` до доменной записи.

Исключение текущей реализации: `create_electrical_candidate_folder` и
`create_electrical_candidate` в `CalculationService` всё ещё имеют явную
валидацию `1…4`. На пятом ЭР эти две операции возвращают ошибку до записи;
candidate apply/delete и остальные ER5 paths нельзя считать доказанными этим
ограничением.

После миграции `0029` assignments authoritative: direct/batch/task/copy flow
должен иметь совместимое назначение точного ЭР до записи. Поддержанная
нормализация: `self_regulating/self_regulating_tt → self_regulating`,
`single_core/three_core → resistive`. Успешный/ошибочный расчёт атомарно
переводит только target assignment в `ready/error/stale/unsupported`, обновляет
diagnostics, `object_version_snapshot` и optimistic `version`; runtime sync не
создаёт назначение автоматически.

**`POST /calc/electrical/batch`** — автоподбор выбранного расчётного типа
кабеля для всех валидных объектов проекта: ТЛТ (`self_regulating`),
ТТН/ТТВ/ТТХ (`self_regulating_tt`), ТТ Р1 (`single_core`) или ТТ Р3
(`three_core`). **Upsert** по `(object_id, variant_number)`. При ошибке расчёта
сохраняется запись с `cable_mark=null` и structured payload:
`results.error_code`, `results.category`, `results.message`, `results.field`,
`results.hint`. Допустимые категории:
`validation`, `formula`, `unsupported`, `external`; причина видна на UI после
reload.

При UUID selector `scope=all` означает только объекты, назначенные в
совместимую систему выбранного ЭР. Explicit `object_ids` валидируются одним
атомарным preflight; unassigned, unsupported и назначенные в другую систему
объекты дают стабильный `409`, а не молча исключаются. Та же семантика
применяется к `POST /calc/electrical/batch/jobs`.

Успешность сохранённого электрорасчёта определяется единым правилом:
есть выбранный кабель (`cable_mark` или `results.selected_cable`) и нет
`results.error_code`, `results.category`, `results.stale=true`. Само поле
`results.message` не является признаком ошибки: оно может быть служебным
пояснением успешного расчёта.

`skip_manual` по умолчанию равен `true`: массовый автоподбор не перезаписывает
строки, где марка кабеля выбрана вручную (`cable_mark_source=manual` или
legacy `params.cable_mark`). Для осознанной перезаписи ручных марок клиент
должен явно передать `skip_manual=false`; на UI это действие требует отдельного
подтверждения. Тот же default действует для `POST /calc/electrical/batch/jobs`.
При импорте/legacy payload source-поля нормализуются без учёта регистра; если
у строки есть марка кабеля, но source неизвестен, строка считается ручной для
защиты от случайной перезаписи.

**`POST /calc/electrical/select-cable/variants`** — атомарно применяет выбор
марки кабеля или режим `Авто` к одному объекту в нескольких ЭР.
Запрос передаётся JSON body:
`{object_id, cable_mark|null, cable_source="builtin", variant_numbers=[1..5],
cable_type, selection_mode?, supply_voltage?, connection_type?, winding_coefficient?,
winding_pitch?, number_of_threads?, heating_height?, laying_step?,
maintain_temperature?, vapor_temperature?, aggressive_product?,
selection_policy?}`. Если `cable_mark=null`, backend запускает автоподбор для
каждого отмеченного ЭР; если задана строка — выполняет exact-check выбранной
марки и сохраняет `cable_mark_source=manual`. Все отмеченные ЭР сохраняются в
одной транзакции: при ошибке любого варианта ни один вариант из запроса не
коммитится.

Если объект валиден по теплопотерям, но сценарий электрорасчёта не поддержан
методикой, это не считается ошибкой подбора. Для сферического резервуара без
формулы укладки кабеля сохраняется
`results.error_code="unsupported_layout"` и `results.category="unsupported"`;
UI показывает статус «Не применимо».

Для всех расчётно поддержанных типов электрорасчёта (`self_regulating`,
`self_regulating_tt`, `single_core`, `three_core`) `process_temperature`
обязателен: endpoint заполняет его из параметров объекта, если поле не передано
явно, и возвращает единую ошибку
`"Для электрорасчёта требуется температура продукта"`, если температуры продукта
нет ни в payload, ни в объекте. Для ТЛТ это нужно для проверки `max_temperature`
выбранного кабеля; для ТТ/резистивных типов — для температурной проверки серии
и расчёта сопротивления/подбора.

Для ТЛТ и ТТН/ТТВ/ТТХ ток и `results.voltage` считаются по паспортному
напряжению выбранной строки каталога кабеля (`voltage`; встроенные линейки —
220 В).
`supply_voltage` из объекта или ЭР не переопределяет паспорт кабеля и
используется только как fallback для кастомного каталога без `voltage`.
Результат электрорасчёта сохраняет `results.power_per_meter` — удельную
мощность выбранного кабеля, Вт/м, и `results.installed_power_per_meter` —
удельную установленную мощность с учётом навива и количества ниток.
Commercial projection встроенной линейки сохраняет технический паспорт ТЛТ
(`power_per_meter`, температурные пределы, `voltage`) и накладывает только
коммерческие поля поставщика.

Для резистивных `single_core`/`three_core` основной автоподбор использует
`selection_mode=auto`: full-version VSDX-стратегия `U/N/M`, `p2/p3`, `L1/L2`.
`selection_mode=manual` остается диагностическим/ручным режимом для явно
заданной схемы подключения и числа ниток.
Если в `correction_coefficients` нет политики шагового снижения
напряжения, backend использует safety fallback `min_adjusted_voltage=40 В` и
`voltage_step=5 В`; это не даёт автоподбору уходить к инженерно бессмысленным
единицам вольт или делать сотни шагов на объект.

Для ТЛТ и резистивного auto-подбора поддерживается `selection_policy`:
`technical_minimum`, `lowest_cost`, `fastest_delivery`, `in_stock`,
`preferred_supplier`, `balanced`. Коммерческая политика применяется только после
технического отбора. Если данных не хватает, backend возвращает
`applied_selection_policy=technical_minimum`, `selection_reason` и warning.
`balanced` работает только при `balanced_weights_approved=true`; до бизнес-
утверждения весов это controlled fallback. Источник `cable_source=commercial`
доступен всем ролям и строится как public commercial projection поверх
встроенных ТЛТ/резистивных каталогов и sanitized строк внешней БД.

**`GET /calc/electrical/candidates?project_id=&object_id=&variant_number=`** —
список сохранённых вариантов подбора кабеля для объекта в конкретном ЭР.
Кандидаты хранятся отдельно от `electrical_calculations`: открытие модалки
«Подбор» не запускает расчёт и не меняет основной электрорасчёт.

**`POST /calc/electrical/candidates`** — создать или обновить кандидат без
применения (upsert по инженерному варианту, не журнал запусков):
`{project_id, object_id, variant_number, cable_type, cable_source, mode,
cable_mark?, electrical_params}`. Ответ:
`{candidate, action}` где `action` — `created` или `updated`. Повторный расчёт с
той же маркой и той же конфигурацией применения (нитки, навива, схема,
напряжение, укладка и т.п.) не создаёт новую строку; `mode`, `selection_policy`,
`selection_reason` и `number_of_threads_source` на уникальность не влияют.
Идентичность кабеля при `cable_source=all` определяется
`cable_snapshot.fingerprint.technical_hash`, затем `catalog_entry_id`, затем
`actual_catalog_source + mark`, а не значением `all`. `mode=auto` запускает
один явный расчёт по кнопке без `cable_mark`; `mode=manual` проверяет указанную
марку. Endpoint не обещает multi-candidate генерацию. В authoritative
assignment flow запрошенный тип обязан принадлежать поддержанной и назначенной
системе. `mineral`/`skin` отклоняются до dedupe/upsert с
`409 ELECTRICAL_SYSTEM_UNSUPPORTED`; диагностический candidate row при этом не
создаётся. Поля `status=not_applicable` и
`reason_code=no_candidate_generator` остаются частью модели диагностических
результатов, но не разрешают обход этого preflight для unsupported system.
Успешный кандидат имеет `status=applicable` и может быть помечен инженером как
приоритетный/закреплённый/исключённый. Статус `excluded` при повторном
идентичном расчёте сохраняется.

Candidate create и folder create требуют live compatible assignment exact UUID;
сохранённая parent-строка `unassigned` разрешением не является. Folder item
дополнительно обязан иметь тот же project/object/variant number/UUID, что
folder и candidate; несовпадение отклоняется до связи.

`dedupe_key` строится по матрице `cable_type × object_type`:

| Тип кабеля | Объект | Поля инженерной уникальности |
|---|---|---|
| `self_regulating` | труба | `technical/catalog identity`, марка, напряжение, нормализованные нитки, `winding_pitch`, `winding_coefficient` |
| `self_regulating` | резервуар | `technical/catalog identity`, марка, напряжение, нитки, `heating_height`, resolved `laying_step`, `winding_coefficient` |
| `self_regulating_tt` | труба | поля трубы + resolved `maintain_temperature`, `vapor_temperature`, `aggressive_product` |
| `self_regulating_tt` | резервуар | поля резервуара + resolved `maintain_temperature`, `vapor_temperature`, `aggressive_product` |
| `single_core` / `three_core` | труба | `technical/catalog identity`, марка, напряжение, `scheme_count`, `scheme_threads`, `connection_type`, `winding_pitch`, `winding_coefficient` |
| `single_core` / `three_core` | резервуар | `technical/catalog identity`, марка, напряжение, `scheme_count`, `scheme_threads`, `connection_type`, `heating_height`, resolved `laying_step`, `winding_coefficient` |
| `mineral` / `skin` | любой | active create отклоняется `409 ELECTRICAL_SYSTEM_UNSUPPORTED` до dedupe; candidate row не создаётся |

Для резервуаров `winding_pitch` сам по себе не является отдельной
идентичностью, если он только alias для `laying_step = winding_pitch / 1000`.
Для резистивных кабелей схема первична: `num_circuits` — производное и не
заменяет `scheme_count + scheme_threads`.

**`PATCH /calc/electrical/candidates/{id}`** — изменить инженерские пометки:
`priority`, `is_recommended`, `is_pinned`, `status=excluded|applicable`,
`engineer_comment`.

**`GET /calc/electrical/candidate-folders?project_id=&object_id=&variant_number=`** —
список пользовательских папок модалки «Подбор» для одного объекта и ЭР.
Папки — это быстрые фильтры видимости поверх `electrical_candidates`, а не
отдельное хранилище вариантов. Системные папки `Все` и `Избранное` UI строит
сам: `Все` показывает весь список, `Избранное` фильтрует по `is_pinned`.
Добавление/удаление из `Избранного` выполняется через меню папки строки и
технически остаётся `PATCH /calc/electrical/candidates/{id}` с `is_pinned`.

**`POST /calc/electrical/candidate-folders`** — создать пользовательскую папку:
`{project_id, object_id, variant_number, name, color?}`. Scope первого релиза:
`project_id + object_id + variant_number`; папка относится только к текущей
модалке конкретного объекта/CO.

**`PATCH /calc/electrical/candidate-folders/{id}`** — переименовать папку,
изменить `color` или `sort_order`.

**`DELETE /calc/electrical/candidate-folders/{id}`** — удалить папку и её связи
с кандидатами. Сами `electrical_candidates` не удаляются.

**`POST /calc/electrical/candidate-folders/{id}/items`** —
добавить кандидат в пользовательскую папку: `{candidate_id}`. Один кандидат
может быть в нескольких пользовательских папках. Повторное добавление
идемпотентно.

**`DELETE /calc/electrical/candidate-folders/{id}/items/{candidate_id}`** —
убрать кандидат из пользовательской папки. Основной электрорасчёт и статус
кандидата не меняются.

**`POST /calc/electrical/candidates/{id}/apply`** — применить кандидат в
основной электрорасчёт выбранного объекта и ЭР. Backend пересчитывает текущие
данные объекта через существующий manual-flow и помечает единственный кандидат
на `(object_id, variant_number)` как `is_applied=true`. Apply и lifecycle delete
сериализованы общей project-row lock; после lock candidate и UUID mapping
перечитываются. Если ЭР уже удалён, apply не создаёт его заново и возвращает
стабильный `404/409` (`ELECTRICAL_CANDIDATE_NOT_FOUND` или
`ELECTRICAL_CANDIDATE_VARIANT_UNAVAILABLE`) вместо integrity `500`.

**`POST /calc/electrical/variants/copy`** — compatibility-copy в целевой ЭР на
основании другого ЭР без нового автоподбора. Backend берёт только сохранённые
строки `electrical_calculations` из `source_variant_number`; объекты без строки
в source ЭР остаются «не рассчитаны» в target ЭР. Для строк с выбранной маркой
кабеля выполняется проверочный расчёт именно этой марки на текущих данных
объекта: система не выбирает более оптимальный кабель и не меняет валидный,
но не минимальный выбор инженера. Критерий и причина подбора из source ЭР
сохраняются, даже если техническая проверка выполняется как exact-check
выбранной марки. Если скопированная марка уже не проходит текущие условия,
в target ЭР сохраняется structured error с
`copy_validation.autoselection_used=false`. Ошибочные/unsupported строки без
выбранной марки копируются как диагностическое состояние без проверки.

Запрос:
`{project_id, source_variant_number, target_variant_number, overwrite=false,
regenerate_specification=false}`.

Ответ:
`{project_id, source_variant_number, target_variant_number, copied_count,
project_objects_count, not_copied_uncalculated_count, deleted_target_count,
overwrite_applied, specification_regenerated, validated_count,
validation_failed_count, preserved_without_validation_count}`.

Если target ЭР содержит хотя бы одну строку электрорасчёта, вызов без
`overwrite=true` возвращает `409` с `detail.code="target_not_empty"`. При
`overwrite=true` target ЭР полностью заменяется копией source ЭР, без merge.
Пустой source ЭР возвращает `422` с `detail.code="source_empty"`, одинаковые
source/target — `422` с `detail.code="same_variant"`.

В Phase 3 это действие является явным пользовательским copy intent: backend
проверяет source assignment и staging compatible target assignment до записи
скопированных calculation rows. Это не скрытая auto-assignment политика для
обычного calculation или project duplicate. По PDL-ER-13 specification не
копируется и не регенерируется: target получает `not_generated`, а explicit
`regenerate_specification=true` отклоняется fail-closed до mutation. Успешный
ответ Phase 3 всегда возвращает `specification_regenerated=false`.

**`POST /calc/electrical/query`** возвращает страницу таблицы электрорасчёта.
Для стандартной сортировки `(sort_order, id)` и SQL-поддерживаемых
фильтров/сортировок ответ может содержать
`page_info.next_cursor = {sort_order, id, key, value, value_is_null}`.
Следующая последовательная страница передаёт `after_sort_order`, `after_id`,
`after_key`, `after_value`, `after_value_is_null`; backend использует keyset
pagination. При произвольном переходе на страницу без cursor сохраняется
ограниченный offset fallback, а Python fallback для неподдерживаемых полей
запрещён на больших проектах.

При переданном `electrical_variant_id` ответ дополнительно содержит
`assignments` только для объектов текущей страницы:
`{object_id, system_type|null, assignment_state, version}`. Projection читается
одним bounded query. Отсутствующее, `unassigned` или unsupported назначение
fail-closed блокирует row select, manual/candidate flow, inline edit и
recalculation. Несовпадение текущего saved/draft cable type с поддержанным
assignment по-прежнему блокирует row/batch/inline/selected-recalculation для
этого типа, но не само открытие `Выбор`/`Подбор`: модалка берёт безопасный тип
назначенной системы. Для свежего `resistive` assignment без расчёта или со
старым self-regulating type это `single_core`; список типов содержит только
resistive-варианты (`single_core`/`three_core`, если они доступны), без
self-regulating. `system_type:null` передаётся явно; defensive optional handling
во frontend не означает иной backend-контракт.

**`GET /references/cables?source=commercial`** и
**`GET /references/cables/commercial`** — публичный commercial catalog для всех
ролей. `source=extended|all` по-прежнему доступен только сотруднику/админу.

## Спецификация

`GET/PUT /specifications/{project_id}/settings` управляют versioned project
defaults. Изменение defaults не запускает генерацию и помечает несовпадающие
snapshots stale.

`POST /specifications/{project_id}/generate` принимает явный
`electrical_variant_ids` (1…5 UUID) в body. Backend выполняет preflight для
каждого ЭР; business exclusions требуют `confirm_partial=true`, а запись всего
выбранного списка выполняется одной транзакцией. Product mode всегда `full`;
legacy `basic` нормализуется во внутренний compatibility path. Single-ЭР
query-пара `variant=1…5 + electrical_variant_id` остаётся adapter и обязана
совпасть точно.

Employee-only `PUT /specifications/{project_id}/items?variant=N` сохраняет
ручные строки одного ЭР и принимает numeric `1…5` вместе с exact UUID scope.
Гость может генерировать full automatic BOM, но не может записывать manual
items. Stale specification доступна только read-only и исключена из output.

## Отчёты

**`GET /reports/{project_id}/preview`** — HTML-предпросмотр по явному
`electrical_variant_id` или повторяемому `electrical_variant_ids` (до 5 UUID).
Multi-ЭР preview создаёт независимые главы и не объединяет суммы. Deprecated
single selector `variant_number=1…5` также поддержан, но отсутствие любого
selector возвращает `422`.

**`GET /reports/{project_id}/export/{pdf|docx|xlsx}`** — синхронный employee
export одного ЭР; принимает `variant_number=1…5` и optional exact
`electrical_variant_id`. Multi-ЭР functional output принимается как HTML/browser
print; server multi-ЭР export не заявлен этим endpoint.

**`POST /reports/{project_id}/export/{pdf|docx|xlsx}/jobs`** — async export
принимает ровно один selector: предпочтительный `electrical_variant_id=<uuid>`
или deprecated `variant_number=N`. Task сохраняется как UUID-first payload v3,
а worker временно разрешает UUID обратно в representable compatibility slot.
Numeric enqueue проходит readiness adapter `1…5`; UUID является
предпочтительным selector и сохраняется в task trace.
