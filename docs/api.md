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
| `/api/v1/specifications/*` | Генерация/просмотр спецификации. `POST /{id}/generate` принимает `mode=basic\|full` (+`options`: R,гр, Ex, К1i/К2i/Кiu, L,К2i); `full` — полный условный BOM ТНП, только сотрудник (гостю 403). Ответ: `items`, `mode`, `skipped_objects`; GET возвращает `generation_mode`/`generation_options` последней генерации |
| `/api/v1/reports/{id}/{preview,export/{fmt}}` | HTML-превью и экспорт PDF/DOCX/XLSX по явно выбранному CO-варианту |
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
марки кабеля или режим `Авто` к одному объекту в нескольких CO-вариантах.
Запрос передаётся JSON body:
`{object_id, cable_mark|null, cable_source="builtin", variant_numbers=[1..4],
cable_type, selection_mode?, supply_voltage?, connection_type?, winding_coefficient?,
winding_pitch?, number_of_threads?, heating_height?, laying_step?,
maintain_temperature?, vapor_temperature?, aggressive_product?,
selection_policy?}`. Если `cable_mark=null`, backend запускает автоподбор для
каждого отмеченного CO; если задана строка — выполняет exact-check выбранной
марки и сохраняет `cable_mark_source=manual`. Все отмеченные CO сохраняются в
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
`supply_voltage` из объекта или CO не переопределяет паспорт кабеля и
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
список сохранённых вариантов подбора кабеля для объекта в конкретном СО.
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
марку. Endpoint не обещает multi-candidate генерацию: если для типа кабеля нет
поддержанной формулы/генератора,
сохраняется диагностический кандидат `status=not_applicable`,
`reason_code=no_candidate_generator`, без фиктивных рекомендаций. Успешный
кандидат имеет `status=applicable` и может быть помечен инженером как
приоритетный/закреплённый/исключённый. Статус `excluded` при повторном
идентичном расчёте сохраняется.

`dedupe_key` строится по матрице `cable_type × object_type`:

| Тип кабеля | Объект | Поля инженерной уникальности |
|---|---|---|
| `self_regulating` | труба | `technical/catalog identity`, марка, напряжение, нормализованные нитки, `winding_pitch`, `winding_coefficient` |
| `self_regulating` | резервуар | `technical/catalog identity`, марка, напряжение, нитки, `heating_height`, resolved `laying_step`, `winding_coefficient` |
| `self_regulating_tt` | труба | поля трубы + resolved `maintain_temperature`, `vapor_temperature`, `aggressive_product` |
| `self_regulating_tt` | резервуар | поля резервуара + resolved `maintain_temperature`, `vapor_temperature`, `aggressive_product` |
| `single_core` / `three_core` | труба | `technical/catalog identity`, марка, напряжение, `scheme_count`, `scheme_threads`, `connection_type`, `winding_pitch`, `winding_coefficient` |
| `single_core` / `three_core` | резервуар | `technical/catalog identity`, марка, напряжение, `scheme_count`, `scheme_threads`, `connection_type`, `heating_height`, resolved `laying_step`, `winding_coefficient` |
| `mineral` / `skin` | любой | только diagnostic fingerprint; применимый variant не создаётся до появления методики |

Для резервуаров `winding_pitch` сам по себе не является отдельной
идентичностью, если он только alias для `laying_step = winding_pitch / 1000`.
Для резистивных кабелей схема первична: `num_circuits` — производное и не
заменяет `scheme_count + scheme_threads`.

**`PATCH /calc/electrical/candidates/{id}`** — изменить инженерские пометки:
`priority`, `is_recommended`, `is_pinned`, `status=excluded|applicable`,
`engineer_comment`.

**`GET /calc/electrical/candidate-folders?project_id=&object_id=&variant_number=`** —
список пользовательских папок модалки «Подбор» для одного объекта и CO.
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
основной электрорасчёт выбранного объекта и СО. Backend пересчитывает текущие
данные объекта через существующий manual-flow и помечает единственный кандидат
на `(object_id, variant_number)` как `is_applied=true`.

**`POST /calc/electrical/variants/copy`** — создать целевой CO-вариант на
основании другого CO без нового автоподбора. Backend берёт только сохранённые
строки `electrical_calculations` из `source_variant_number`; объекты без строки
в source CO остаются «не рассчитаны» в target CO. Для строк с выбранной маркой
кабеля выполняется проверочный расчёт именно этой марки на текущих данных
объекта: система не выбирает более оптимальный кабель и не меняет валидный,
но не минимальный выбор инженера. Критерий и причина подбора из source CO
сохраняются, даже если техническая проверка выполняется как exact-check
выбранной марки. Если скопированная марка уже не проходит текущие условия,
в target CO сохраняется structured error с
`copy_validation.autoselection_used=false`. Ошибочные/unsupported строки без
выбранной марки копируются как диагностическое состояние без проверки.

Запрос:
`{project_id, source_variant_number, target_variant_number, overwrite=false,
regenerate_specification=true}`.

Ответ:
`{project_id, source_variant_number, target_variant_number, copied_count,
project_objects_count, not_copied_uncalculated_count, deleted_target_count,
overwrite_applied, specification_regenerated, validated_count,
validation_failed_count, preserved_without_validation_count}`.

Если target CO содержит хотя бы одну строку электрорасчёта, вызов без
`overwrite=true` возвращает `409` с `detail.code="target_not_empty"`. При
`overwrite=true` target CO полностью заменяется копией source CO, без merge.
Пустой source CO возвращает `422` с `detail.code="source_empty"`, одинаковые
source/target — `422` с `detail.code="same_variant"`.

**`POST /calc/electrical/query`** возвращает страницу таблицы электрорасчёта.
Для стандартной сортировки `(sort_order, id)` и SQL-поддерживаемых
фильтров/сортировок ответ может содержать
`page_info.next_cursor = {sort_order, id, key, value, value_is_null}`.
Следующая последовательная страница передаёт `after_sort_order`, `after_id`,
`after_key`, `after_value`, `after_value_is_null`; backend использует keyset
pagination. При произвольном переходе на страницу без cursor сохраняется
ограниченный offset fallback, а Python fallback для неподдерживаемых полей
запрещён на больших проектах.

**`GET /references/cables?source=commercial`** и
**`GET /references/cables/commercial`** — публичный commercial catalog для всех
ролей. `source=extended|all` по-прежнему доступен только сотруднику/админу.

## Отчёты

**`GET /reports/{project_id}/preview?variant_number=N`** — HTML-предпросмотр
отчёта по одному CO-варианту. `variant_number` обязателен, допустимо `1..4`.
Backend фильтрует электрорасчёты и спецификацию по этому варианту.

**`GET /reports/{project_id}/export/{pdf|docx|xlsx}?variant_number=N`** и
**`POST /reports/{project_id}/export/{pdf|docx|xlsx}/jobs?variant_number=N`** —
экспорт отчёта сотрудником. `variant_number` обязателен и попадает в payload
фоновой задачи; worker формирует файл только по указанному варианту.
