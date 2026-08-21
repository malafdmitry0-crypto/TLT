# Промпт: срочно перенести параметры спецификации из объекта в настройки формирования

**Дата решения:** 2026-08-03

**Статус:** утверждённый cross-stack контракт и исполнимый prompt

**Приоритет:** выполнить до продолжения Slice 4 из
[`specification-backend-implementation-prompt.md`](./specification-backend-implementation-prompt.md)

**Главный приоритет:** правильный backend; временная несовместимость frontend во время
backend-слайсов допустима

**Очередь frontend:** этот документ не является второй ACTIVE-очередью. Перед frontend-слайсом
работу необходимо маршрутизировать через
[`../../frontend/refactor-backlog.md`](../../frontend/refactor-backlog.md).

## Роль и ожидаемый результат

Ты работаешь в репозитории TLT как ведущий backend/frontend-инженер. Исправь ошибочную область
владения шестью параметрами спецификации:

```text
Ex
K1i
K2i
Kiu
L_K2i_m
R_gr
```

После выполнения:

1. параметры вводятся только в окне настройки формирования спецификации;
2. один разрешённый набор параметров одинаково применяется ко всем явно выбранным ЭР одного
   запроса;
3. Heat-объект, его форма и `params` больше не являются владельцем этих значений;
4. backend не читает объектные legacy-поля даже как fallback;
5. отсутствие значения не превращается в `false`, `0`, `1` или другое mock/default-значение;
6. frontend отправляет канонический V2-запрос и показывает backend diagnostics;
7. неполные справочники клея, лент, `Ex` и `R_gr` продолжают блокировать спецификацию.

Работай строго по одному vertical slice за запуск. В конце каждого слайса выполни его proof,
добавь в commit только файлы этого слайса, создай один conventional commit и остановись с
отчётом. Не выполняй следующий слайс в том же запуске.

## Почему это исправление обязательно

Бизнес-источник — «1 Кейс “Расчёт спецификации для неавторизованных пользователей”», редакция 4
от 07.07.2026:

- §7.2, страницы 57–58: пользователь выбирает один или несколько ЭР, затем указывает параметры
  формирования в модальном окне;
- §7.4, страницы 58–59: `Ex`, `К1i`, `К2i`, `Кiu`, `L,К2i`, `R,гр` перечислены как
  дополнительные параметры модального окна настройки формирования спецификаций;
- §7.15, страницы 76–77: коробочный алгоритм получает эти значения из модального окна, а не из
  карточки трубопровода.

Нормализованное решение уже закреплено в
[`guest-specification-calculation-algorithm.md`](./guest-specification-calculation-algorithm.md):

- настройки общие для проекта;
- настройки одного запроса одинаковы для всех его `variant_ids`;
- изменение общих настроек делает stale ранее сформированные спецификации проекта;
- повторно рассчитываются только явно выбранные ЭР.

## Текущий baseline, который надо перепроверить перед изменениями

Baseline не является целевым контрактом. Перед каждым слайсом заново найди фактические
production-пути и тесты.

### Frontend

- `frontend/src/components/wizard/CableSpecPanel.tsx` показывает все шесть параметров в форме
  каждого pipe/tank Heat-объекта.
- `frontend/src/utils/objectWizardUtils.ts` задаёт скрытые объектные defaults `"no"` для четырёх
  boolean-параметров.
- `frontend/src/utils/objectWizardFormMappers.ts` и
  `frontend/src/utils/objectWizardApiToFormMappers.ts` записывают и читают их из `object.params`.
- `frontend/src/config/heatcalc-fields.default.json` регистрирует их как Heat-поля таблицы и
  формы.
- `frontend/src/utils/heatCalcInlineFormProjection.ts` переносит их через inline-form.
- `frontend/src/pages/specification/SpecPageChrome.tsx` уже содержит второй, конкурирующий набор
  тех же настроек, но использует checkbox/default-семантику и legacy-названия.
- `frontend/src/pages/specification/specGenerationOptionsSyncModel.ts` превращает отсутствие в
  `false`, `0` или `1`.
- `frontend/src/api/specifications.ts` отправляет legacy `electrical_variant_ids`,
  `confirm_partial` и legacy options.

### Backend

- `SpecificationGenerationRequestV2`, `SpecificationRequestedOptions` и
  `SpecificationResolvedOptions` уже задают правильное направление контракта.
- `SpecificationPreflightService` уже разрешает значения по правилу request → project settings →
  blocking diagnostic.
- Рабочий `POST /specifications/{project_id}/generate` всё ещё принимает
  `SpecificationGenerateRequest`, а не V2.
- `GET/PUT /specifications/{project_id}/settings` всё ещё сериализует legacy
  `SpecificationOptions`, часть полей которого имеет business-defaults.
- Object API принимает произвольный `params: dict`, поэтому ошибочные объектные ключи можно
  продолжать записывать извне.

## Утверждённая область владения

| Данные | Единственный владелец | Область действия |
|---|---|---|
| `Ex`, `K1i`, `K2i`, `Kiu`, `L_K2i_m`, `R_gr` | настройки формирования спецификации | один запрос; одинаково для всех выбранных ЭР |
| сохранённые значения этих полей | versioned project specification settings | fallback для следующих запусков проекта |
| `variant_ids` | запрос формирования | только явно выбранные UUID, максимум 5 |
| диаметр, длина, секции, кабель и Heat/ЭР results | объект и конкретный ЭР | индивидуальные входы расчёта одного объекта/ЭР |
| resolved options и версии справочников | immutable generation snapshot | отдельный snapshot каждой сформированной спецификации ЭР |

Запрещены:

- per-object или per-ER override этих шести настроек;
- чтение одноимённых legacy-ключей из `ProjectObject.params`;
- выбор «первого объекта» как источника общих настроек;
- проверка, что объектные значения «у всех одинаковые», с последующим автоматическим переносом;
- скрытые frontend/backend defaults;
- разные options для разных `variant_ids` одного запроса;
- long-lived dual write в объект и project settings.

Если когда-нибудь понадобятся per-object настройки, это отдельное бизнес-решение и новая версия
контракта. В рамках этого prompt такую возможность не закладывать.

## Канонические поля и запрещённые legacy-эквиваленты

| Каноническое поле | Legacy в Heat-объекте | Legacy в specification API |
|---|---|---|
| `Ex` | `explosion_zone_type` | `ex_zone` |
| `K1i` | `power_indication_on_boxes` | `indication_on_boxes` |
| `K2i` | `end_of_section_indication` | `end_section_indication` |
| `Kiu` | `top_of_box_indication` | `top_indication` |
| `L_K2i_m` | `min_length_for_k2i` | `min_length_for_end_indication` |
| `R_gr` | `hot_reserve_coefficient` | `reserve_coefficient` |

Legacy-названия разрешены только в явно ограниченном compatibility reader для ранее сохранённых
данных. Они не должны присутствовать в новом frontend payload, OpenAPI V2, snapshot или
production-вычислении.

## Канонический backend-контракт

### Запрос генерации

```json
{
  "variant_ids": [
    "00000000-0000-0000-0000-000000000001",
    "00000000-0000-0000-0000-000000000002"
  ],
  "options": {
    "grouping_mode": "separate_by_object_type",
    "Ex": false,
    "K1i": false,
    "K2i": true,
    "Kiu": false,
    "L_K2i_m": "50",
    "R_gr": "1.1"
  },
  "exclude_unassigned_confirmed": false,
  "catalog_selections": {}
}
```

`catalog_id` и `catalog_version` могут быть переданы в `options`. Если они отсутствуют,
стандартная активная версия разрешается backend автоматически и её точные identity/checksums
попадают в snapshot.

### Resolution

Для каждого поля независимо:

```text
явное значение options запроса
  > сохранённое значение versioned project specification settings
  > blocking domain diagnostic
```

Требования:

- `None`/отсутствие и явные `false`/`0` — разные состояния;
- после resolution должны существовать все шесть значений и `grouping_mode`;
- `L_K2i_m` — конечный `Decimal >= 0`;
- `R_gr` — конечный `Decimal`; не сохраняй неподтверждённые UI-ограничения `1–3` или `1–10` как
  бизнес-правило;
- стандартный каталог может быть выбран автоматически, но никогда не мокается;
- один объект с legacy `yes`, а другой с legacy `no` никак не влияет на resolution;
- object values не входят в fingerprint options.

### Project settings

`GET/PUT /specifications/{project_id}/settings` должны использовать канонические имена. Начальное
состояние проекта может быть неполным; backend возвращает отсутствие честно. Сохранение или чтение
не должны материализовывать defaults.

Изменение канонического значения:

1. увеличивает `specification_settings_version` только при реальном изменении;
2. атомарно помечает stale все применимые спецификации проекта;
3. не запускает неявный пересчёт;
4. не меняет данные Heat-объектов.

Явные options одного запуска могут переопределить project settings, но сами по себе не должны
молча перезаписывать project settings. Сохранение настроек проекта — отдельное явное действие.

### Legacy object data

- Существующие записи БД с шестью legacy-ключами допускается читать ради совместимости старых
  проектов, но значения считаются inert и не участвуют ни в preflight, ни в формулах, ни в stale.
- Не выводить из существующих object values новые project settings автоматически.
- Новые create/update/import object payload с этими ключами должны отклоняться стабильной typed
  validation/domain ошибкой. Не молча принимать и не молча переносить их.
- Удаление уже сохранённых legacy-ключей из production DB не входит в эту срочную коррекцию. Для
  него требуется отдельная проверяемая data migration с явной политикой восстановления.

## Канонический frontend UX

1. Удалить панель «Подбор спецификации» из wizard pipe и tank целиком: после переноса в ней не
   остаётся Heat-полей.
2. Удалить шесть полей из form types, defaults, mappers, inline projection, Heat grid/column
   manifest и isolation registry.
3. Открывать настройку формирования на странице «Спецификация» в модальном окне по действиям
   «Сформировать спецификацию», «Настройки» и «Пересчитать».
4. В одном окне показать:
   - явный выбор одного или нескольких ЭР;
   - стандартную номенклатурную базу read-only/disabled;
   - `grouping_mode` из двух нормативных вариантов;
   - все шесть параметров;
   - основное действие «Сформировать» или «Пересчитать».
5. Boolean-поля должны иметь три UI-состояния до ввода: «не задано», «Да», «Нет». Checkbox,
   инициализированный `false`, для этого контракта непригоден.
6. Числовые поля до ввода остаются пустыми. Не подставлять `0`, `1` или другое значение.
7. `L_K2i_m` остаётся видимым и валидируемым, а не появляется только после `K2i=true`: resolved
   backend-контракт требует значение явно.
8. Генерация disabled с понятной inline-ошибкой, пока не заполнены обязательные настройки или не
   выбран хотя бы один ЭР.
9. Hydration формы: snapshot последней выбранной спецификации → project settings → незаполненное
   состояние. Ни один шаг не добавляет product defaults.
10. Отдельное действие «Сохранить настройки проекта» допустимо и использует versioned settings
    endpoint; запуск генерации не должен автоматически нажимать его за пользователя.
11. `connector_kit_sections_per_kit` не является параметром §7.4 и удаляется из общих settings.
    Выбор между несколькими комплектами должен идти через `catalog_selections`.
12. Display-only сортировка/группировка таблицы не должна подменять канонический
    `grouping_mode` расчёта.

## Границы задачи

Разрешено изменять:

- specification-owned backend schemas, API, services, models/migrations и tests;
- минимальный object API/schema guard против записи legacy object keys;
- `frontend/src/api/specifications.ts` и specification feature;
- Heat wizard/config/mappers только для полного удаления шести ошибочных полей;
- focused frontend tests и релевантные E2E из `e2e/`;
- документацию контракта и checklist после доказанного implementation-слайса.

Не входит:

- изменение формул количества или округления;
- заполнение отсутствующих кодов клея и лент;
- придумывание `condition_Ex`/`condition_R_gr`;
- формулы резервуаров и других неподдерживаемых систем;
- redesign всей страницы Heat или Specification;
- автоматический выбор первой каталожной позиции;
- полный data cleanup существующих object JSON;
- ослабление diagnostics, тестов, architecture baseline или catalog blockers.

# План поставки по слайсам

## SPEC-SCOPE-01. Backend contract lock и запрет object fallback

### Цель

Доказать и закрепить на backend, что шесть настроек имеют только request/project scope.

### Работа

1. Сначала добавить characterization/acceptance tests.
2. Проверить V2 schemas и resolution на `false`, `0`, missing и mixed request/project values.
3. Добавить тест с двумя объектами, содержащими противоположные legacy object values: resolved
   options должны определяться только request/project settings.
4. Добавить тест: request/project settings отсутствуют, но legacy object values существуют —
   preflight остаётся blocked, object fallback запрещён.
5. Добавить единый backend guard для create/update/import object payload с шестью legacy-ключами.
6. Не менять активный generation endpoint в этом слайсе.

### Gate

- focused schema/preflight/object API tests;
- `python -m ruff check` только затронутых Python-файлов;
- `python -m mypy app` либо существующая repository-wrapper команда, если она является штатной;
- `git diff -- frontend e2e` пуст.

### Коммит

`fix(specification): enforce project-scoped generation options`

## SPEC-SCOPE-02. Backend V2 settings и generation cutover

### Цель

Сделать канонический request/project contract рабочим production API.

### Работа

1. Подключить `SpecificationGenerationRequestV2` к активному generation endpoint.
2. Перевести settings GET/PUT на канонические имена без materialized defaults.
3. Удалить active-path resolution через legacy `SpecificationOptions` и
   `SpecificationGenerateRequest`; не держать второй равноправный путь.
4. Сохранить правило explicit request → project settings → blocking diagnostic.
5. Гарантировать один resolved options object для всех `variant_ids` запроса.
6. Сохранять точные resolved options, settings version и catalog identity в per-ER snapshot.
7. Проверить stale всех спецификаций проекта после изменения общих settings.
8. Сохранить независимость результата ЭР: один blocked ЭР не откатывает ready ЭР.
9. Обновить OpenAPI examples и backend consumers/tests под V2.

Текущий frontend после этого слайса может временно перестать генерировать спецификацию — это
разрешённая осознанная граница. Не возвращай legacy API ради временной зелени frontend.

### Gate

- focused schema/service/API/security tests;
- integration test multi-ER с одинаковыми resolved options;
- integration test settings change → stale всех ранее актуальных спецификаций;
- backend lint/typecheck штатными командами;
- `git diff -- frontend e2e` пуст.

### Коммит

`feat(specification): cut generation API to canonical settings`

## SPEC-SCOPE-03. Frontend Heat cleanup

### Цель

Убрать ложный per-object UX и прекратить запись legacy object keys.

### Работа

1. Прочитать `frontend/AGENTS.md`, обязательный frontend standard и определить owner/proof через
   `npm run agent:scope -- <path>`.
2. Сначала зафиксировать тестом, что pipe/tank object payload не содержит ни одного из шести
   legacy-ключей.
3. Удалить `CableSpecPanel` из обеих веток `ObjectWizard` и удалить компонент, если consumers
   больше нет.
4. Удалить поля из defaults/types/mappers/config/inline projection.
5. Удалить ставшие неиспользуемыми CSS/isolation entries без ослабления baseline.
6. Проверить загрузку старого объекта: legacy keys не отображаются и не возвращаются новым
   frontend write payload.

### Gate

- `npm run agent:scope -- --changed --json`;
- рассчитанный required proof через `npm run agent:proof-run -- --changed` и
  `npm run agent:proof-check -- --changed`;
- browser proof Heat pipe/tank на `1000×768`, `1280×800`, `1440×900`;
- console/network clean;
- `git diff -- backend` пуст.

### Коммит

`fix(heatcalc): remove object-level specification options`

## SPEC-SCOPE-04. Frontend canonical specification modal

### Цель

Сделать страницу «Спецификация» единственным UI-владельцем настроек и синхронизировать её с V2.

### Работа

1. Characterization first: пустые settings не становятся `false/0/1`; явные `false` и `0`
   сохраняются.
2. Перевести API types/request на `variant_ids`, canonical `options`,
   `exclude_unassigned_confirmed`, `catalog_selections`.
3. Удалить legacy aliases и `connector_kit_sections_per_kit` из generation settings.
4. Реализовать модальное окно с явным unset-state, валидацией и выбором ЭР.
5. Не вычислять formulas, catalog completeness, stale или candidate selection во frontend.
6. Ветвиться по backend `status`, `diagnostics[].kind` и `diagnostics[].code`, а не по тексту.
7. После сохранения project settings инвалидировать точные TanStack Query keys; после генерации
   обновлять только затронутые specification queries.
8. Не изменять UUID semantics, permission states и guest/employee boundaries.

### Gate

- pure model/API tests для exact request body и hydration;
- integration tests modal validation, false/zero и selected UUIDs;
- required proof из `agent:scope`;
- browser proof Specification modal на `1000×768`, `1280×800`, `1440×900`, включая loading,
  unset, validation, blocked и stale states;
- keyboard/focus, overflow, console и failed network requests.

### Коммит

`fix(frontend): own generation options in specification modal`

## SPEC-SCOPE-05. Cross-stack acceptance и удаление мёртвого compatibility-кода

### Цель

Доказать полный путь и удалить оставшийся production dual path.

### Работа

1. Добавить E2E: Heat-форма не содержит панель «Подбор спецификации».
2. Добавить E2E/network assertion: object create/update не отправляет legacy object keys.
3. Добавить E2E/API assertion: generation body содержит только canonical V2 fields и явные UUID.
4. Доказать два выбранных ЭР с одним набором options; backend snapshots содержат одинаковые
   resolved settings.
5. Доказать missing settings без default → blocking/validation state.
6. Доказать явные `false` и `L_K2i_m=0` без потери значения.
7. Доказать изменение project settings → stale всех старых specs; regeneration меняет только
   явно выбранные ЭР.
8. Положительный тест может использовать только test-scoped approved complete catalog fixture.
   Runtime не должен получать synthetic fallback.
9. Выполнить repo-wide поиск legacy names. Остатки допустимы только в migration/compatibility
   reader и отрицательных тестах с явным комментарием.
10. Обновить `specification-frontend-follow-up.md` и `case1-frontend-checklist.md` фактическим
    контрактом; не объявлять незапущенные проверки зелёными.

### Gate

- backend focused + integration suite по затронутому контракту;
- frontend diff-wide required proof;
- релевантный Playwright запускается только из `e2e/`;
- OpenAPI request/response snapshot;
- `git status --short` содержит только файлы текущего слайса перед commit.

### Коммит

`test(specification): prove project-scoped settings end to end`

## Обязательные acceptance-сценарии

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| SPEC-SCOPE-AC-01 | Открыта pipe/tank Heat-форма | Панели и шести полей нет |
| SPEC-SCOPE-AC-02 | Создание/изменение объекта новым frontend | Ни одного legacy object key в payload |
| SPEC-SCOPE-AC-03 | Внешний object write содержит legacy key | Typed 4xx; значение не сохранено |
| SPEC-SCOPE-AC-04 | В БД есть разные legacy object values | Они не влияют на preflight/generation |
| SPEC-SCOPE-AC-05 | Нет request и project value | Blocking diagnostic; никакого default |
| SPEC-SCOPE-AC-06 | Request передаёт `false` при project `true` | Resolved value — `false` |
| SPEC-SCOPE-AC-07 | Request передаёт `L_K2i_m=0` | Ноль сохранён как явное значение |
| SPEC-SCOPE-AC-08 | Выбраны два ЭР | Один resolved settings snapshot применяется к обоим |
| SPEC-SCOPE-AC-09 | Один ЭР blocked | Ready ЭР не откатывается; blocked не получает partial write |
| SPEC-SCOPE-AC-10 | Изменены project settings | Все старые актуальные specs проекта становятся stale |
| SPEC-SCOPE-AC-11 | Пересчитан один stale ЭР | Только он становится актуальным; остальные остаются stale |
| SPEC-SCOPE-AC-12 | Неполный клей/ленты/Ex/R_gr | ЭР blocked; mock/synthetic данные не снимают blocker |
| SPEC-SCOPE-AC-13 | Несколько catalog candidates | `selection_required`; первая строка не выбирается автоматически |
| SPEC-SCOPE-AC-14 | Reload Specification | Snapshot → project settings → unset, без product defaults |
| SPEC-SCOPE-AC-15 | Проверен network request | Только `variant_ids` и V2 options; legacy aliases отсутствуют |

## Hard stops

Остановись и верни `FILE / EVIDENCE / DECISION NEEDED`, если:

- найден код, реально использующий разные значения этих шести параметров для разных объектов;
- для завершения требуется придумать диапазон `R_gr`, матрицу `Ex/R_gr` или номенклатурный код;
- требуется автоматически перенести legacy object values в project settings;
- обязательный browser proof видимого frontend-слайса недоступен или красный;
- целевые файлы содержат чужой WIP, который нельзя безопасно обойти;
- исправление требует ослабить тест, validation, permissions или architecture baseline.

Не является причиной снять blocker:

- желание сохранить старый frontend payload;
- наличие synthetic/demo справочника;
- одинаковые legacy values во всех текущих объектах;
- временно красный frontend между backend и frontend cutover-слайсами.

## Definition of Done

Работа завершена только когда одновременно выполнено следующее:

- backend production path имеет один канонический V2-контракт;
- backend никогда не читает шесть настроек из объекта;
- новые object writes с legacy keys запрещены;
- Heat UI, form state, config и payload очищены от этих полей;
- Specification modal является единственным UI-владельцем;
- missing/false/zero различаются на всех слоях;
- multi-ER получает один общий resolved options snapshot;
- project settings version/stale работают атомарно;
- catalog blockers сохранены fail-closed;
- focused backend/frontend и cross-stack сценарии реально запущены и перечислены;
- каждый slice находится в отдельном commit;
- документация соответствует фактической OpenAPI, а не предполагаемому будущему контракту.

После этого можно продолжать Slice 4 исходного backend prompt с уже исправленной областью
владения настройками.
