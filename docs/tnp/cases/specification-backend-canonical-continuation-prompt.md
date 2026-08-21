# Промпт: каноническая спецификация — полное cross-stack завершение

**Дата актуализации:** 2026-08-03

**Контур:** `backend/**` + `frontend/**` + `e2e/**` + документация спецификации

**Статус:** исполнимый corrective prompt после полной ревизии фактического кода

**Начинать реализацию:** с `SPEC-CANON-01`, если пользователь явно не выбрал другой slice

**Обратная совместимость:** не требуется

**API:** один канонический specification-контракт; отдельного V2 нет

Общий префикс репозитория `/api/v1` остаётся техническим префиксом маршрутизатора. Он не означает,
что рядом должны существовать V1/V2 specification schemas, services или payloads.

Этот документ заменяет дальнейший план поставки из
[`specification-backend-implementation-prompt.md`](./specification-backend-implementation-prompt.md)
и прежнюю backend-only редакцию этого continuation prompt. Исходный документ остаётся источником
истории и формул, но его отметки «Slice 1–3 выполнены» нельзя использовать как доказательство
готовности end-to-end контура.

Коррекция области владения настройками из
[`specification-settings-scope-rewrite-prompt.md`](./specification-settings-scope-rewrite-prompt.md)
выполнена. Не повторять перенос шести полей из Heat. Этот prompt продолжает работу с фактического
состояния после коммитов `4bbc5cf`, `37227d8`, `5260bbf`, `09ebdd5`, `d399241`.

Документ не создаёт вторую ACTIVE frontend-очередь. Перед выполнением frontend-части выбранный
пользователем slice должен быть явно маршрутизирован через
[`../../frontend/refactor-backlog.md`](../../frontend/refactor-backlog.md) или пользователь должен
явно изменить приоритет существующего `NEXT`. Сам prompt хранит контракт, а не текущую очередь.

## Роль и конечный результат

Ты ведущий backend/frontend-инженер TLT. Доведи формирование спецификации саморегулирующегося
кабеля до одного честного production-контура:

```text
React specification workflow
  → canonical UUID-only HTTP request
  → request/project settings resolution
  → UUID-scoped preflight каждого выбранного ЭР
  → authoritative immutable catalog + реальные candidate groups
  → pure Decimal calculators
  → grouping только внутри одного ЭР
  → lock + fingerprint recheck
  → atomic per-ER persistence + immutable snapshot
  → typed multi-ER response
  → UUID-scoped reload, stale/report/project-IO consumers
```

Backend является единственным источником бизнес-решений, формул, применимости кандидатов,
полноты каталога, stale и разрешения blockers. Frontend вводит явные значения, показывает
backend-состояния и отправляет выбранные immutable UUID; он не повторяет формулы и не угадывает
данные.

В финале отсутствуют:

- `V2` в публичных и внутренних именах specification-контура;
- legacy request aliases и параллельные response envelopes;
- numeric `variant_number` как data plane спецификации;
- compatibility reader старых project settings;
- fallback по mark/name/article или первой строке каталога;
- production-вызов старого `SpecificationService.generate()`, `full_builder.py` или статических
  provisional JSON;
- скрытые defaults и mock-значения;
- frontend-ветвление по тексту ошибки.

Один запуск выполняет один явно выбранный vertical slice. Сначала characterization, затем
production-код, focused proof, browser proof для видимого UI, один conventional commit и остановка.
Не начинай следующий slice автоматически. В commit добавляй только собственные файлы slice.

## Что уже сделано и что это на самом деле доказывает

| Основа | Коммит | Можно переиспользовать | Это ещё не доказывает |
|---|---|---|---|
| Typed contract tests | `3553848` | request/options/status/diagnostics, нормализованные примеры | единый unversioned API, исполняемые formula goldens и stable error envelope |
| Immutable BOM catalog | `7f78de8` | модели, migration, checksums, completeness, activation/stale service | admin/API/UI и использование этих rows реальным генератором |
| UUID preflight | `3abab01` | exact UUID joins, readiness, подтверждение unassigned, fingerprint | реальный поиск кандидатов, recheck под lock и успешную генерацию подтверждённого ЭР |
| Settings ownership | `4bbc5cf`–`d399241` | шесть параметров больше не принадлежат Heat; modal/project settings и no-default semantics | завершённую formula/persistence/candidate часть |
| Generate endpoint bootstrap | `37227d8` | `variant_ids`, project/request resolution и per-ER response каркас | отсутствие V2/legacy, правильные HTTP statuses или отказ от старого builder |

Следовательно, прежние Slice 1–3 дали полезный фундамент, но не были завершены как единый
production workflow. Новые slices ниже являются корректирующими; не продолжай механически со
старого Slice 4.

## Зафиксированный baseline ревизии

Baseline ниже снят с `d399241`. В начале каждого slice заново проверь `HEAD`, `git status --short`,
runtime-код и тесты: другой поток мог уже закрыть часть пунктов. Не восстанавливай корректно
удалённый код и не трогай чужой WIP.

### Контракт и HTTP

- route всё ещё импортирует `SpecificationGenerationRequestV2`,
  `SpecificationGenerationResponseV2` и `SpecificationGenerationV2Service`;
- endpoint жёстко возвращает `201`, даже когда не сформирован ни один ЭР;
- `SpecificationErrorEnvelope` существует, но структурные и domain errors используют разные
  формы, а missing/empty `variant_ids` не гарантирует `SPEC_VARIANT_IDS_REQUIRED`;
- GET и manual PUT используют numeric query `variant` и optional UUID adapter;
- `SpecificationItem.quantity` и frontend `quantity` — `float`/`number`, хотя расчёт должен быть
  Decimal-воспроизводимым;
- старые schemas, services и legacy API tests сосуществуют с новым контрактом.

### Каталог и candidate selection

- новая immutable catalog boundary валидирует версии и activation, но для specification catalog
  нет полного admin HTTP/UI operational flow;
- preflight выбирает каталог только из request options и active default; сохранённые project
  `catalog_id/catalog_version` не участвуют в resolution так же, как остальные settings;
- текущая `_selection_diagnostic()` проверяет только, что переданный item UUID существует где-то
  в active catalog; она не строит применимые candidates конкретной группы;
- ноль/один/несколько кандидатов и stale selection пока не реализованы end-to-end;
- response не даёт frontend типизированных candidate groups, поэтому UI выбора отсутствует.

### Формулы и источник данных

- preflight использует новую versioned catalog boundary только как gate/snapshot;
- реальный generation после gate всё ещё вызывает старый monolithic builder;
- старый builder читает `spec_accessories.json`, `box_ex_rgr_matrix.json` и другие static mappings,
  а не выбранные immutable rows;
- provisional/synthetic матрица может быть помечена `registered`, хотя не является approved
  production source;
- `Decimal` resolved options переводятся в `float` внутри builder;
- `R_gr` умножает количества соединительных комплектов, хотя нормализованное решение запрещает
  применять его к комплектам, кабелю или лентам без явного authoritative row rule;
- canonical path молча передаёт capacity соединительного комплекта `1`, вместо candidate selection;
- grouping/provenance/identity строк недостаточны для воспроизводимости;
- нормализованные golden fixtures в основном проверяются как файлы/IDs, а не исполняются через
  production calculators.

### Orchestration, persistence и concurrency

- `SpecificationGenerationV2Service` требует `legacy_variant_number` и вызывает
  `SpecificationService.generate()`;
- модель `Specification` требует `variant_number`, допускает nullable UUID и сохраняет уникальность
  по `(project_id, variant_number)`;
- fingerprint вычисляется до записи, но не пересчитывается под lock;
- настройки, active catalog, assignments и electrical results могут измениться между preflight и
  persistence;
- stale generation способна перезаписать новый state старым snapshot;
- подтверждённые unassigned проходят preflight, но старый builder снова видит посторонние объекты,
  помечает результат partial, и orchestration откатывает ЭР;
- snapshot использует строку вида `specification-generation/v2`, не содержит полного versioned
  formula/catalog item provenance;
- audit event называется `generated` даже при `generated_count=0`.

### Frontend

- выполненное modal ownership шести настроек сохраняется и не переписывается;
- specification feature всё ещё фильтрует ЭР по `legacy_variant_number`, хранит его в mutation
  scope/query key и отключает UUID-варианты без numeric slot;
- read/manual API всё ещё отправляет `variant` вместе с optional UUID;
- generation всегда отправляет пустой `catalog_selections`;
- `selection_required` не имеет candidate UI;
- diagnostics склеиваются в текст, а error handling использует `Error.message`;
- frontend types всё ещё содержат `variant_number`, `generation_mode`, loose `params` и number
  quantity;
- E2E допускает несколько разных статусов вместо точного контракта и содержит numeric adapters;
- постоянные пустые sections могут выглядеть как unsupported ещё до попытки формирования.

Этот список — обязательный residual scope. Не отмечай пункт выполненным только потому, что рядом
существует класс, migration или тест с похожим названием.

## Утверждённые бизнес-решения

1. Формируются только UUID из явного непустого `variant_ids`, максимум 5; implicit all запрещён.
2. Для каждого выбранного ЭР сохраняется отдельная спецификация. Строки разных ЭР не объединяются.
3. `Ex`, `K1i`, `K2i`, `Kiu`, `L_K2i_m`, `R_gr` принадлежат request/project specification
   settings, а не объекту и не отдельному ЭР.
4. Один resolved settings object применяется ко всем `variant_ids` одного запроса.
5. Resolution каждого поля: explicit request → canonical project settings → blocking diagnostic.
6. Отсутствие не подменяется `false`, `0`, `1`, mock или guessed default. Явные `false` и `0`
   сохраняются.
7. `catalog_id/catalog_version` разрешаются по тому же правилу; при полном отсутствии допускается
   автоматический выбор единственной active approved complete версии.
8. Кабель заказывается по `required_order_length_m`; инженерные аксессуары используют
   `actual_installed_length_m`, если конкретная approved формула не говорит иначе.
9. Используется только актуальный автоматически сформированный section plan.
10. Подтверждением можно исключить только backend-вычисленный полный список `unassigned`.
11. Critical/stale/error/mocked, unsupported, invalid section plan и catalog gaps подтверждением
    не обходятся.
12. Неполные справочники клея, стекловолоконной/алюминиевой ленты, `Ex` или `R_gr` блокируют весь
    затронутый ЭР; partial закупочная BOM не сохраняется.
13. Provisional, synthetic, demo и guessed data не являются production-authoritative.
14. Ноль candidates — blocking; один — backend auto-select; несколько — `selection_required` до
    явного immutable `catalog_item_id`.
15. Готовый ЭР может сохраниться, если другой выбранный ЭР blocked.
16. Внутри одного ЭР запись атомарна: либо заменены все auto rows и snapshot, либо прежняя
    спецификация не меняется.
17. Формулы резервуаров, resistive, mineral и skin не выводятся по аналогии; такие объекты/ЭР
    blocked как unsupported.
18. `R_gr` не умножает кабель, комплекты, клей или ленты. Он применяется только там, где
    authoritative catalog row явно задаёт проверяемое правило.
19. Frontend никогда не строит `group_key`, не фильтрует candidates по бизнес-условиям и не
    вычисляет quantity.

## Что означает «без обратной совместимости»

Не создавать и не сохранять:

- второй endpoint `/v2` или versioned router;
- Python/TypeScript имена `*V2`, файлы `*_v2*` и OpenAPI components с `V2`;
- aliases `electrical_variant_ids`, `confirm_partial`, `variant`, `electrical_variant_id` в
  legacy query form, `mode=basic/full`;
- legacy options `ex_zone`, `indication_on_boxes`, `end_section_indication`, `top_indication`,
  `min_length_for_end_indication`, `reserve_coefficient`, `merge_identical`;
- compatibility reader старых project setting keys;
- numeric `variant_number` в specification API, query keys, storage identity, report/project-IO
  specification sections;
- старые response envelopes рядом с каноническим;
- production fallback в `build_basic_specification()`/`full_builder.py`.

Старые canonical-incompatible project settings считаются незаданными. Не переносить их из
`ProjectObject.params` и не материализовывать defaults.

Для существующих specification rows migration применяет только детерминированную политику:

1. если UUID уже сохранён и принадлежит проекту — использовать его;
2. если UUID отсутствует, но numeric slot однозначно соответствует одному ЭР проекта — backfill;
3. неоднозначные auto rows являются пересчитываемым derived data и могут быть удалены с явным
   migration audit/count;
4. неоднозначные manual rows нельзя привязать к первому ЭР или тихо удалить — hard stop с точным
   evidence и решением владельца данных.

Удаление specification-использования `legacy_variant_number` не означает глобальный рефакторинг
всего electrical-модуля. Не трогай unrelated electrical slot consumers, если они не входят в
specification data plane.

Отказ от V2 не отменяет версии данных:

- immutable catalog UUID/version/checksums остаются;
- `specification_settings_version` остаётся;
- snapshot хранит `schema` и integer `schema_version`;
- fingerprint schema/version и formula version/fingerprint остаются;
- Alembic revisions остаются.

## Обязательные источники и приоритет

Перед implementation slice прочитай:

1. `AGENTS.md` и ближайшие instructions для затронутой зоны.
2. Для frontend — `frontend/AGENTS.md`,
   [`../../frontend/agent-development-standard.md`](../../frontend/agent-development-standard.md),
   выбранный proof/viewport/UI contract.
3. [`guest-specification-calculation-algorithm.md`](./guest-specification-calculation-algorithm.md).
4. [`guest-electrical-calculation-tz.md`](./guest-electrical-calculation-tz.md).
5. Бизнес-PDF «1 Кейс», редакция 4, §§6.18–6.20 и §§7.1–7.15, страницы 52–81.
6. Выполненный [`specification-settings-scope-rewrite-prompt.md`](./specification-settings-scope-rewrite-prompt.md).
7. Фактические production files, migrations и tests на текущем `HEAD`.
8. `backend/pyproject.toml`, `frontend/package.json`, `e2e/package.json`, Makefile и Docker Compose.

При конфликте:

1. Явные решения пользователя и этот prompt.
2. Нормализованный алгоритм от 2026-08-03.
3. ТЗ электротехнического расчёта.
4. Бизнес-PDF.
5. Approved authoritative catalog source только для явно определённых данных.
6. Runtime-код/tests как characterization baseline, но не как основание сохранить legacy или
   известную ошибочную формулу.

## Граница изменений

Разрешены:

- specification schemas/API/models/services/formulas/catalog loaders/migrations;
- минимальные UUID/stale hooks в project/electrical/report code;
- specification frontend API/types/query/workflow/components/styles;
- admin UI/API только для specification catalog lifecycle;
- focused unit/integration/migration/security/concurrency/query-count tests;
- specification E2E только в `e2e/`;
- документация, checklist/follow-up и датированный audit snapshot после доказанного slice.

Запрещены:

- повторное добавление шести полей в Heat;
- изменение Heat-формул или алгоритма электрического выбора кабеля/секционирования;
- заполнение отсутствующих codes, capacities, `Ex/R_gr` conditions догадкой;
- цены, поставщики, склад и коммерческая оптимизация;
- формулы неподдерживаемых типов;
- redesign всего workspace/admin вместо минимального specification-owned UI;
- ослабление tests, permissions, catalog completeness, architecture/CSS baseline;
- изменение файлов чужого активного WIP.

## Канонический HTTP-контракт

### Project settings

```text
GET /api/v1/specifications/{project_id}/settings
PUT /api/v1/specifications/{project_id}/settings
```

```json
{
  "project_id": "00000000-0000-0000-0000-000000000000",
  "version": 3,
  "settings": {
    "catalog_id": null,
    "catalog_version": null,
    "grouping_mode": "separate_by_object_type",
    "Ex": false,
    "K1i": false,
    "K2i": true,
    "Kiu": false,
    "L_K2i_m": "50",
    "R_gr": "1.1"
  }
}
```

Missing остаётся missing. PUT меняет version только при реальном semantic change, атомарно
помечает применимые specifications stale и не запускает generation.

### Generation

```text
POST /api/v1/specifications/{project_id}/generate
```

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

`extra="forbid"`: legacy/unknown field отклоняется, а не игнорируется.

Response сохраняет порядок входных UUID и содержит результат каждого ЭР:

```json
{
  "project_id": "00000000-0000-0000-0000-000000000000",
  "settings_version": 3,
  "results": [
    {
      "electrical_variant_id": "00000000-0000-0000-0000-000000000001",
      "electrical_variant_name": "ЭР 1",
      "status": "selection_required",
      "items": [],
      "excluded_unassigned_object_ids": [],
      "diagnostics": [],
      "candidate_groups": [],
      "snapshot": null
    }
  ]
}
```

Per-ER statuses: `generated`, `blocked`, `confirmation_required`, `selection_required`.

HTTP rules:

- хотя бы один `generated` → `201`, body содержит все запрошенные results;
- ни одного generated, есть только confirmation/selection → `409` с тем же typed response body;
- ни одного generated, есть blocking result → `422` с typed response body;
- request-global отсутствие resolvable active production catalog → `503` + stable error envelope;
- scope/auth/not-found сохраняют обычные `401/403/404`, но в stable envelope;
- HTTP success никогда не маскирует per-ER blocker.

При смешении non-generated statuses precedence для HTTP: `blocked` → `422`, иначе
`selection_required`/`confirmation_required` → `409`.

### Stable error envelope

```json
{
  "detail": {
    "code": "SPEC_VARIANT_IDS_REQUIRED",
    "message": "...",
    "issues": [],
    "details": {}
  }
}
```

Frontend ветвится по `detail.code`, `results[].status` и `diagnostics[].kind/code`. Text остаётся
presentation copy. Missing/empty `variant_ids` обязан давать `SPEC_VARIANT_IDS_REQUIRED`, а не
только generic Pydantic message.

### UUID-scoped read/manual operations

```text
GET /api/v1/specifications/{project_id}/variants/{electrical_variant_id}
PUT /api/v1/specifications/{project_id}/variants/{electrical_variant_id}/items
```

GET может вернуть `200 null` для ещё не сформированного ЭР. Manual PUT доступен только
employee/admin. Regeneration заменяет только `source=auto`; manual rows сохраняются и явно
отличаются в API/UI/audit.

### Specification catalog operations

```text
GET  /api/v1/admin/specification-catalogs
GET  /api/v1/admin/specification-catalogs/{catalog_version_id}
POST /api/v1/admin/specification-catalogs/import
POST /api/v1/admin/specification-catalogs/{catalog_version_id}/activate
```

Все routes admin-only. Import создаёт immutable draft и возвращает validation issues. Activation
возможна только для `authority=approved` и `is_complete=true`; после activation rows read-only,
предыдущая active version retired, применимые specs stale. Не добавлять edit-in-place/delete
active data flow.

## Канонические domain и API types

Используй имена без версии API:

```text
SpecificationCatalogSnapshot
SpecificationCandidate
SpecificationCandidateGroup
SpecificationGenerationRequest
SpecificationVariantPreflightResult
SpecificationVariantGenerationResult
SpecificationGenerationResponse
SpecificationGenerationService
specification_generation_service.py
```

Candidate group — backend-сформированный контракт:

```text
group_key                  opaque stable key, включает scope ЭР
electrical_variant_id
category
object_type_section
conditions                 typed normalized inputs поиска
candidates[]               immutable rows текущей resolved catalog version
selected_catalog_item_id   nullable
```

Каждый candidate содержит минимум catalog item UUID, catalog UUID/version, category, name, mark,
nomenclature code, supply unit, applicability и параметры package/formula, нужные для осознанного
выбора. Backend не раскрывает лишние internal поля и не принимает mark/code вместо UUID.

`group_key` строит только backend. Он должен быть collision-free между ЭР и стабилен для тех же
inputs/catalog version. Frontend возвращает полученный key без интерпретации.

Каждая auto item содержит минимум:

```text
source = auto
category + object_type_section
name + mark + nomenclature_code + supply_unit
quantity                     decimal string в JSON
catalog_id + catalog_version + catalog_item_id
formula_id + formula_version
formula_inputs + rounding/provenance
```

Backend считает через `Decimal`; API сериализует quantities и Decimal formula inputs строками.
Frontend форматирует их для показа, но не переводит обратно в binary float для бизнес-решений.

## Архитектурные границы

1. **API boundary** — auth/scope, schema validation, stable envelope и HTTP aggregation status.
2. **Settings resolver** — request/project precedence, exact false/zero, no object/legacy read.
3. **Preflight** — side-effect-free readiness каждого UUID, candidate groups и input fingerprint.
4. **Catalog service** — immutable version, completeness/provenance, candidates/selections.
5. **Pure calculators** — typed Decimal input/output, без DB/FastAPI/env/static JSON.
6. **Generation orchestration** — order, per-ER isolation, lock, re-resolution/recheck, persistence.
7. **Persistence** — one UUID ER → one spec, auto/manual policy, snapshot/stale.
8. **Frontend API/query** — HTTP parsing, query keys/invalidation; без layout/formulas.
9. **Frontend workflow** — state transitions, confirmation/selection/retry/focus.
10. **Presentational UI** — props-in/events-out, typed rows/diagnostics.
11. **Consumers** — project IO/reports/export не считают stale/blocked BOM актуальной.

Не передавай ORM/dict «со всем подряд» прямо в calculator. На DB boundary собери immutable typed
inputs. Pure layer не импортирует SQLAlchemy, settings, filesystem или JSON loader.

## Catalog и selection protocol

Для каждой логической группы, кроме коробок:

1. Зафиксировать resolved active catalog из request → project settings → unique active default.
2. Построить group conditions из фактических typed inputs ЭР.
3. Отфильтровать rows только внутри точной immutable catalog version.
4. Ноль candidates → blocking `SPEC_ACCESSORY_CATALOG_ITEM_MISSING` с category/conditions.
5. Один candidate → backend выбирает его автоматически.
6. Несколько без valid selection → `SPEC_ACCESSORY_SELECTION_REQUIRED` и candidate group.
7. Selection принимается только если item UUID входит именно в candidates этой группы.
8. Selection из другой version/category/group → stale/selection required; старую spec не менять.
9. Изменение выбора пересчитывает позицию и зависящие материалы.
10. Mark/name/article/row order не являются identity fallback.

Для коробок проверяются все строки approved matrix; это не single-choice group.

Production formulas получают rows только из `ResolvedSpecificationCatalog`. Static
`spec_accessories.json`, `box_ex_rgr_matrix.json` и provisional mappings разрешены только как
исторические материалы или test fixtures. Они не могут открывать production generation. После
переключения consumers удалить/переместить мёртвые runtime loaders.

## Нормативные формулы

Используй `Decimal` на каждом промежуточном шаге. Reject bool-as-number, negative, NaN, Infinity,
zero divider и неизвестный rounding mode typed diagnostic. Округление — domain/catalog rule.

### Кабель

```text
L_group_actual = section_length_m * section_count
L_mark_actual = sum(L_group_actual)
L_mark_order = sum(required_order_length_m)
```

Закупочная строка использует `L_mark_order`. Lookup — exact full mark + immutable catalog identity.
Аксессуары используют actual length. Разные catalog versions/codes/units не объединяются.

### Соединительные комплекты

Секции группируются по `LOW`/`MEDIUM_HIGH`:

```text
N_connection_kits = ceil(N_sections / sections_per_kit)
```

Capacity берётся из выбранной catalog row. В группе выбирается ровно один candidate. Пример:
`ceil(9 / 2) = 5`.

### Ремонтные комплекты

```text
L_group_actual = sum(actual_installed_length_m)
N_repair_kits = ceil(L_group_actual / cable_length_per_kit_m)
```

Пример: `ceil(729 / 150) = 5`.

### Клей-герметик

После готовых connection/repair outputs:

```text
N_all_kits = sum(N_connection_kits) + sum(N_repair_kits)
N_sealant = ceil(N_all_kits / kits_per_sealant_unit)
```

Пример: `ceil((9 + 5) / 7) = 2`. Без approved code/unit/package/provenance весь ЭР blocked.

### Стекловолоконная лента

Для каждого pipe отдельно:

```text
L_fiberglass_object =
    ((pi * outer_diameter_mm * 2.5 / 1000)
     * (actual_installed_length_m / 0.3))
    * 1.1

N_fiberglass_reels = ceil(sum(L_fiberglass_object) / reel_length_m)
```

Суммировать по выбранной позиции и округлять один раз после per-object calculation. Нормативный
множитель `1.1` применяется ровно один раз и не является `R_gr`. Пример: `ceil(8939 / 30)=298`.

### Алюминиевая лента

```text
L_aluminium_object = actual_installed_length_m * consumption_m_per_cable_m
N_aluminium_reels = ceil(sum(L_aluminium_object) / reel_length_m)
```

Пример: `ceil(729 * 1 / 50)=15`.

### Соединительные коробки

Для каждого pipe:

```text
d_ge_57 = outer_diameter_mm >= 57
N_sec = total section count
L_sec = equal section length
```

Для каждой approved row проверить все используемые conditions. `unused` не проверяется; границы
`d>=57`, `L_sec>=L_K2i_m`, `N_sec>=3` включающие.

```text
raw = N_sec / section_divider
calculated = ceil(raw) for up, floor(raw) for down
quantity = max(calculated, min_quantity)
```

`section_divider > 0`, для коробок `min_quantity=1`. Добавляются все прошедшие rows. Нельзя
использовать row order/legacy bucket/synthetic matrix. Пока approved per-row `Ex/R_gr` conditions
не зарегистрированы, вернуть `SPEC_BOX_EX_RGR_MATRIX_MISSING` и не сохранять partial BOM.

### Группировка

`separate_by_object_type` key:

```text
(electrical_variant_id, catalog_id, catalog_version,
 object_type_section, nomenclature_code, supply_unit)
```

`merge_materials` key:

```text
(electrical_variant_id, catalog_id, catalog_version,
 nomenclature_code, supply_unit)
```

Никогда не объединять разные ЭР, versions, codes, units или rows без confirmed identity.

## Snapshot, persistence, stale и concurrency

Persistence identity — `(project_id, electrical_variant_id)`; UUID non-null и unique. Numeric
slot отсутствует в specification table/API.

Snapshot generated specification содержит минимум:

```text
schema + integer schema_version
electrical_variant_id + variant revision
contributing/excluded object UUIDs и object/result revisions
assignment и section-plan revisions
resolved options + settings revision
catalog UUID/version/source checksum/payload checksum/schema version
catalog item UUIDs + catalog selections
formula IDs/versions/fingerprints и normalized inputs
preflight fingerprint schema + input fingerprint
generated_at UTC
```

До preflight можно читать без lock. Непосредственно перед записью одного ЭР:

1. взять project/variant/specification lock в детерминированном порядке;
2. заново разрешить settings и catalog;
3. перечитать assignments/objects/electrical results;
4. пересчитать fingerprint той же canonical функцией;
5. при расхождении вернуть `SPEC_GENERATION_CONFLICT`, ничего не меняя;
6. atomically заменить auto rows/snapshot и очистить stale только этого ЭР;
7. сохранить manual rows;
8. завершить per-ER savepoint независимо от других results.

Stale scope:

- object/Heat/assignment/section/electrical result одного ЭР → stale только этот ЭР;
- project specification settings или active catalog → stale все применимые specs проекта;
- selection → stale связанный ЭР;
- rename ЭР обновляет display name, но не делает calculation stale;
- stale result доступен read-only как история, но исключён из актуального report/export.

Audit event отражает фактический outcome: generated/partial-request/conflict/blocked, UUIDs,
catalog identity и counts без полного sensitive payload. Не писать `generated`, если generated=0.

## Frontend-контракт

Выполненный экран настройки формирования остаётся единственным UI-владельцем `Ex/K1i/K2i/Kiu/
L_K2i_m/R_gr`. Не возвращай эти поля в Heat.

### API, types и state

- specification API/types только unversioned canonical names;
- все доступные ЭР выбираются по UUID, независимо от `legacy_variant_number`;
- query key одного ЭР содержит project UUID + electrical variant UUID, без numeric slot;
- GET/manual PUT используют UUID path;
- request хранит один options object и до 5 explicit variant IDs;
- `catalog_selections` хранит только opaque backend group key → item UUID;
- TanStack invalidation после generation затрагивает только generated/staled UUIDs и settings
  consumers; смена активной вкладки не запускает generation;
- request cancellation, double-submit lock и conflict retry не теряют последний valid server state;
- Decimal strings форматируются для UI без бизнес-округления.

### Обязательные workflow states

1. loading settings/specification/catalog metadata;
2. empty project/no ER/no specification;
3. incomplete settings с сохранением различия unset/false/zero;
4. нет active approved complete catalog;
5. ready to generate;
6. unassigned `confirmation_required` с точными count/UUID и действиями «Исправить»/«Исключить»;
7. `selection_required` отдельно по ЭР и candidate group;
8. saved selection больше не candidate;
9. один generated + другой blocked;
10. полностью blocked;
11. generated rows с catalog/formula provenance;
12. stale specification;
13. `409` conflict и повторная загрузка;
14. `401/403/404/422/503`, retry где допустим;
15. employee/admin manual rows и guest read-only permission;
16. catalog draft/import/validation/activation для admin;
17. long names/codes/UUIDs и несколько groups/rows.

### Candidate UX

- показывать candidates только из `candidate_groups` backend response;
- группировать визуально по ЭР/category/conditions;
- при нескольких candidates ничего не выбирать по умолчанию;
- показывать name, mark, code, unit и влияющие package/formula параметры;
- после выбора повторить canonical generation request с returned group key/item UUID;
- stale selection очистить только после typed backend response, не по локальной догадке;
- для unassigned «Исправить» открыть первый затронутый ЭР и его unassigned state;
- confirmation не должна появляться для blocking diagnostic.

### Specification table и consumers

- отдельная вкладка на каждый UUID ЭР, label следует актуальному имени;
- строка показывает category/section, name/mark/code/unit/quantity, source и доступный provenance;
- manual и auto rows визуально различимы; guest не получает edit controls;
- unsupported section показывается только из typed blocker, а не постоянным пустым placeholder;
- stale banner не выдаёт старые quantities за актуальные;
- report/preview/export UI честно отражает, что stale/blocked BOM исключена.

### Frontend запреты

Не переносить во frontend:

- формулы количества/округления и `R_gr` rules;
- отбор catalog candidates и completeness;
- вычисление group key/fingerprint/stale;
- решение, можно ли обойти blocker;
- объединение закупочных строк;
- static catalog fallback.

Нельзя применять `any`, `@ts-ignore`, wide casts, copy diagnostics parsing или hidden defaults.
Соблюдай UI-kit/CSS owner boundaries, accessible names, keyboard/focus order и существующие
permission semantics.

# План поставки по cross-stack slices

## SPEC-CANON-01. Fail-closed contract reset и UUID-only data plane

### Результат

Один unversioned HTTP/OpenAPI/TypeScript contract; specification read/write/generate больше не
зависит от numeric slot. Неправильный legacy builder не должен выдавать BOM как production result.

### Backend

1. Characterization tests на текущие V2/numeric/status/error gaps.
2. Переименовать schemas/services/files/tests в canonical names без aliases/re-exports.
3. Удалить public legacy schemas и old generate payload.
4. Ввести stable error envelope и точные HTTP aggregation statuses.
5. Перевести GET/manual PUT на UUID paths.
6. Подготовить UUID persistence migration policy/tests; не выполнять ambiguous manual-data guess.
7. До подключения canonical calculators не позволять ready case уйти в static/provisional builder:
   правильный fail-closed ответ лучше временной ложной BOM.

### Frontend/E2E

1. Перевести API/types/query/manual mutations на UUID-only routes.
2. Удалить specification-зависимость от `legacy_variant_number` и numeric query keys.
3. Ветвиться по typed envelope/status, не `Error.message`.
4. Обновить exact network assertions/OpenAPI contract tests; не оставлять permissive status sets.
5. Проверить loading/empty/error/permission и UUID ЭР без legacy slot.

### Gate

- OpenAPI не содержит specification `V2`, legacy fields и numeric specification query;
- legacy payload даёт `422`, unknown field не игнорируется;
- missing/empty IDs → `SPEC_VARIANT_IDS_REQUIRED`;
- UUID другого проекта не раскрывает данные;
- frontend network body/path только canonical;
- старый builder не создаёт production rows;
- backend focused + frontend required proof + relevant E2E/browser evidence.

### Коммит

`refactor(specification): cut over canonical UUID contract`

## SPEC-CANON-02. Operational authoritative catalog и admin workflow

### Результат

Versioned catalog становится реально управляемым production dependency, но incomplete/unapproved
data остаётся fail-closed.

### Backend

1. Реализовать admin list/detail/import/activate routes поверх существующего service.
2. Bounded upload, checksum/provenance/schema validation и stable errors.
3. Resolution `catalog_id/catalog_version`: request → project settings → unique active default.
4. Зафиксировать active approved complete immutability и stale activation transaction.
5. Доказать, что static/provisional rows не считаются production catalog.

### Frontend/E2E

1. Минимальный admin catalog screen: versions/status/authority/checksums/item count/completeness.
2. Import draft, показать typed issues, disable activation пока invalid.
3. Activation confirmation и результат; permission states для non-admin.
4. Specification settings показывают resolved/selected catalog без fake `standard` value.
5. UI честно показывает `SPEC_CATALOG_UNAVAILABLE`, inactive/invalid version.

### Gate

- active возможен только для approved complete;
- activation новой версии атомарно stales применимые specs;
- incomplete glue/tapes/Ex/R_gr видны в issues и не активируются;
- unauthorized admin access закрыт;
- import/activation UI проверены на success/failure/long issues/permissions.

### Коммит

`feat(specification): operate authoritative BOM catalogs`

## SPEC-CANON-03. Реальный preflight, candidates и selection UI

### Результат

Backend строит применимые candidate groups для каждого ЭР; frontend позволяет явный выбор без
first-row fallback.

### Backend

1. Построить typed formula inputs из exact UUID assignments/results.
2. Реализовать group keys и фильтрацию по category/temperature/object conditions.
3. Реализовать zero/one/many protocol и selection membership validation.
4. Включить project-resolved catalog, candidate groups и selections в fingerprint.
5. Исправить confirmed-unassigned scope: исключённые объекты не попадают в later generation input.
6. Status precedence: blocking > selection_required > confirmable > ready.

### Frontend/E2E

1. Candidate UI по ЭР/group, без preselected первого candidate.
2. Повторный request с opaque group keys и item UUIDs.
3. Stale selection, zero candidates, mixed multi-ER states.
4. Действие «Исправить» для unassigned и точное confirmation действие.
5. Keyboard/focus и disabled pending submit.

### Gate

- selection из другой group/version отвергается;
- один candidate auto-selected backend, несколько требуют UI action;
- confirmed unassigned успешно доходит до canonical input, blocking не обходится;
- один blocked не скрывает selection/ready другого;
- candidate UI не содержит формул или локальной фильтрации.

### Коммит

`feat(specification): resolve catalog candidates per ER`

## SPEC-CANON-04. Pure Decimal calculators для кабеля, комплектов, клея и лент

### Результат

Основные material categories считаются только из typed electrical inputs и resolved immutable
catalog rows; known R_gr/static-data errors удалены.

### Backend

1. Реализовать pure inputs/outputs и executable goldens для cable/connection/repair/sealant/tapes.
2. Exact cable lookup и `required_order_length_m`; аксессуары — actual length.
3. Capacity/consumption/reel/package только из selected catalog row.
4. Decimal end-to-end; удалить float conversion и silent numeric fallbacks.
5. Удалить `R_gr` multiplication и hardcoded connector capacity.
6. Не materialize partial BOM, если зависимая категория incomplete.

### Frontend/E2E

1. Typed row model с decimal strings и catalog/formula provenance.
2. Показ category-specific blocking issues без локального пересчёта.
3. Проверить смену kit candidate → backend меняет kit и sealant quantities.
4. Long codes/marks/formula details не ломают table/layout.

### Gate

- cable actual/order distinction;
- connection `ceil(9/2)=5`;
- repair `ceil(729/150)=5`;
- sealant `ceil((9+5)/7)=2`;
- fiberglass `ceil(8939/30)=298`, reserve `1.1` ровно один раз;
- aluminium `ceil(729/50)=15`;
- missing code/unit/package/provenance blocks whole ER;
- pure layer не импортирует DB/FastAPI/filesystem/static JSON.

### Коммит

`feat(specification): calculate authoritative cable accessories`

## SPEC-CANON-05. Approved data-driven boxes

### Результат

Коробки считаются по полной approved matrix; при отсутствии `Ex/R_gr` условий production остаётся
blocked, а frontend объясняет точную причину.

### Backend

1. Валидировать 12 base rows и обязательные per-row `Ex/R_gr` conditions.
2. Проверять все rows, inclusive boundaries, up/down/divider/min quantity.
3. Добавлять все применимые rows; не превращать matrix в single candidate.
4. Удалить production use synthetic matrix/row-order heuristics.
5. Положительные tests используют только test-scoped approved complete fixture.

### Frontend/E2E

1. Typed `SPEC_BOX_EX_RGR_MATRIX_MISSING` state.
2. При approved fixture показать все returned box rows/provenance.
3. Не скрывать blocker «частичной готовностью» других categories.

### Gate

- `d=57` идёт в `>=57`;
- `N_sec=5`: approved base example даёт `СКВ 1201=2`, `СКВ 1601=1`;
- `floor(2/3)=0` → min `1`;
- divider `1` → quantity `N_sec`;
- synthetic/provisional matrix не проходит production completeness.

### Коммит

`feat(specification): evaluate approved box matrix`

## SPEC-CANON-06. Canonical orchestration, UUID persistence и concurrency

### Результат

Полный ready ЭР формируется только новым pipeline и сохраняется атомарно; legacy generator data
plane удалён из production.

### Backend

1. Orchestrator вызывает только new preflight/candidates/calculators/grouping.
2. Удалить production calls старого service/builder/static loaders.
3. Завершить UUID non-null/unique migration и удалить numeric specification identity.
4. Lock/re-resolve/re-fingerprint перед per-ER write.
5. Atomic auto replacement, manual preservation, deterministic idempotency/concurrency.
6. Multi-ER savepoints/results и точные HTTP status/audit outcomes.
7. Snapshot по полному контракту; никаких `.../v2` strings.

### Frontend/E2E

1. UUID reload после generation и точная invalidation затронутых ЭР.
2. Mixed generated/blocked response, conflict reload/retry, duplicate-click lock.
3. Manual item permissions и сохранение после regeneration.
4. Reload не восстанавливает numeric slot/generation_mode legacy state.

### Gate

- ready + blocked: ready записан, blocked previous snapshot неизменён;
- exception внутри ЭР: zero partial auto rows;
- fingerprint race: `SPEC_GENERATION_CONFLICT`, no write;
- duplicate retry: одна UUID identity;
- confirmed unassigned positive path работает;
- repo-wide specification production path не вызывает legacy builder.

### Коммит

`feat(specification): persist atomic UUID BOM snapshots`

## SPEC-CANON-07. Grouping, stale, reports и project IO

### Результат

Все downstream consumers используют canonical UUID snapshot и никогда не выдают stale BOM как
актуальную.

### Backend

1. Реализовать два exact grouping keys.
2. Закрыть precise stale hooks settings/catalog/selection/object/ER/rename.
3. Project export/import сохраняет UUID, snapshot, settings/catalog versions и manual rows без
   numeric specification section.
4. Report/preview/export исключает stale/blocked BOM и сохраняет per-ER isolation.
5. Security, query-count/N+1 и audit contract.

### Frontend/E2E

1. Separate/merge modes и независимые ER tabs.
2. Stale banner/history; report UI не показывает old procurement totals как current.
3. Export/import/reload с UUID identity.
4. Rename меняет label без false stale; изменение одного ЭР не stales другой.

### Gate

- same code в двух ЭР остаётся в двух specs;
- settings/catalog stales все применимые; object/result — только связанный;
- rename не stales;
- project IO round-trip и report assertions используют UUID;
- stale rows не попадают в current report/export.

### Коммит

`feat(specification): close UUID BOM consumers`

## SPEC-CANON-08. Legacy deletion, production hardening и финальная приёмка

### Результат

В репозитории остаётся один законченный cross-stack workflow; docs/tests/OpenAPI соответствуют
runtime, а не промежуточной архитектуре.

### Работа

1. Repo-wide удалить оставшиеся specification `V2`, legacy schemas/adapters/tests/dead imports.
2. Удалить старый builder/static production access после consumer search.
3. Переписать/delete tests, которые требуют legacy payload; не возвращать compatibility ради них.
4. Закрыть security/migration/concurrency/query-count/performance/error-envelope checks.
5. Обновить [`specification-frontend-follow-up.md`](./specification-frontend-follow-up.md) и
   [`case1-frontend-checklist.md`](./case1-frontend-checklist.md): убрать формулировку V2 и отметить
   только реально доказанные пункты.
6. При release proof создать датированный `docs/audit/YYYY-MM-DD-*` snapshot с HEAD/UTC/commands;
   не записывать dynamic counters в нормативный prompt/backlog.

### Gate

- `rg` не находит production/public specification V2/legacy/numeric adapters;
- backend focused + required wider suites green;
- frontend diff-wide required proof green;
- relevant Playwright/API/browser state matrix green;
- production остаётся blocked без approved glue/tape/Ex/R_gr data;
- ни одна NOT RUN проверка не названа PASS.

### Коммит

`test(specification): close canonical cross-stack gates`

## Обязательные acceptance-сценарии

| ID | Сценарий | Ожидаемый результат |
|---|---|---|
| SPEC-CAN-01 | `variant_ids` missing/empty/duplicate/>5 | Stable `422`; implicit all отсутствует |
| SPEC-CAN-02 | Legacy/unknown request field | `422`, field не игнорируется |
| SPEC-CAN-03 | UUID ЭР другого проекта | Stable scope error без утечки |
| SPEC-CAN-04 | Request/project setting отсутствует | Blocker, без object/default fallback |
| SPEC-CAN-05 | Request `false` перекрывает project `true` | Resolved `false` для всех выбранных ЭР |
| SPEC-CAN-06 | Explicit `L_K2i_m=0` | Ноль сохранён и показан как значение |
| SPEC-CAN-07 | Project catalog задан, request не задан | Используется точная project version |
| SPEC-CAN-08 | Нет active approved complete catalog | `503 SPEC_CATALOG_UNAVAILABLE` |
| SPEC-CAN-09 | Draft incomplete glue/tapes/Ex/R_gr | Activation запрещена, issues показаны |
| SPEC-CAN-10 | Zero candidates | Whole ER blocked с условиями поиска |
| SPEC-CAN-11 | One candidate | Backend auto-select, UI не требует выбора |
| SPEC-CAN-12 | Many candidates | `selection_required`, первая строка не выбрана |
| SPEC-CAN-13 | Selection из другой group/version | Invalid/stale selection, old spec не перезаписана |
| SPEC-CAN-14 | Unassigned без confirmation | Exact UUIDs, `confirmation_required`, no write |
| SPEC-CAN-15 | Unassigned confirmed | Исключены только backend UUIDs, generation продолжается |
| SPEC-CAN-16 | Critical/stale/error/mocked/unsupported | Blocked; confirmation не обходит |
| SPEC-CAN-17 | Exact cable mark отсутствует | `SPEC_CABLE_NOMENCLATURE_MISSING` |
| SPEC-CAN-18 | `L_actual=201`, `L_order=221.1` | Cable `221.1`; accessories используют `201` |
| SPEC-CAN-19 | LOW, 9 sections, selected capacity 2 | 5 connection kits |
| SPEC-CAN-20 | LOW, 729 m, 150 m/kit | 5 repair kits |
| SPEC-CAN-21 | 9 connection + 5 repair, capacity 7 | 2 sealant units |
| SPEC-CAN-22 | Fiberglass 8939/30 | 298 reels; fixed reserve один раз |
| SPEC-CAN-23 | Aluminium 729×1/50 | 15 reels |
| SPEC-CAN-24 | `R_gr` изменён без approved row rule | Kit/tape/cable quantities не умножаются |
| SPEC-CAN-25 | Approved box matrix отсутствует | `SPEC_BOX_EX_RGR_MATRIX_MISSING` |
| SPEC-CAN-26 | Box boundaries/ceil/floor/min | Exact normalized examples |
| SPEC-CAN-27 | One ready + one blocked | Ready saved; blocked unchanged; response has both |
| SPEC-CAN-28 | Exception inside one ER | No partial rows/snapshot |
| SPEC-CAN-29 | Fingerprint changes before write | `SPEC_GENERATION_CONFLICT`, no stale overwrite |
| SPEC-CAN-30 | Concurrent duplicate | One UUID spec identity, deterministic outcome |
| SPEC-CAN-31 | Manual rows + regeneration | Manual preserved, auto replaced atomically |
| SPEC-CAN-32 | Same code in two ERs | Two independent specifications |
| SPEC-CAN-33 | Settings/active catalog changed | All applicable specs stale |
| SPEC-CAN-34 | One object/result/assignment changed | Only linked ER spec stale |
| SPEC-CAN-35 | ER renamed | Tab label changes, spec not stale |
| SPEC-CAN-36 | UUID variant has no legacy slot | Frontend can select/read/generate it |
| SPEC-CAN-37 | Candidate keyboard workflow | Selection accessible, no hidden default/double submit |
| SPEC-CAN-38 | Mixed multi-ER UI | Generated/blocked/selection states visible separately |
| SPEC-CAN-39 | Long mark/code/UUID/many rows | No overlap/page overflow; local scroll intentional |
| SPEC-CAN-40 | Guest/employee/admin | Exact generation/read/manual/admin permissions |
| SPEC-CAN-41 | Stale spec in report/project IO | History available, current BOM excluded |
| SPEC-CAN-42 | OpenAPI/network inspected | One unversioned UUID-only contract |

## Проверки и browser evidence

### До изменения

1. `git status --short`; перечислить чужой WIP и разрешённые files slice.
2. Найти production owner и nearest tests через `rg`.
3. Frontend: `npm run agent:scope -- <touched-path>` из `frontend/`.
4. Зафиксировать characterization основного behavior и значимого failure path.

### Backend proof

Выбрать focused pytest/ruff/typecheck/migration commands по актуальному tooling. В финальном slice
обязательны реальные `make lint-backend` и `make test-backend`, если пользователь/окружение не
задали иной proof contract. Незапущенное — `NOT RUN`.

Обязательные зоны по мере затрагивания:

- schemas/OpenAPI/error envelope;
- catalog validation/import/activation/provenance;
- preflight/candidates/settings resolution;
- executable formula goldens и numeric boundaries;
- transaction/concurrency/idempotency;
- API/security/migrations/stale;
- project IO/reports/query count.

### Frontend proof

Из `frontend/`:

```text
npm run agent:scope -- --changed --json
npm run agent:proof-run -- --changed
npm run agent:proof-check -- --changed
```

Добавить focused Vitest tests владельца. Полный `npm run test:agent-dod:dual-safe` запускать только
по явному запросу пользователя; иначе указать `NOT RUN`.

### E2E и browser proof

Playwright живёт только в `e2e/`. Обновить specification specs так, чтобы они доказывали точные
status/body/state, а не список допустимых несовместимых ответов.

Для каждого видимого UI slice использовать state-driven browser QA:

- обязательные profiles из repository viewport policy: `1000×768`, `1280×800`, `1440×900` для
  затронутого workspace behavior;
- при длинной форме можно добавить `1440×1000`, но он не заменяет primary `1440×900`;
- viewports `<1000 px`, включая `390×844`, находятся вне product contract TLT: не добавлять
  mobile CSS и не включать их в acceptance без отдельного product decision;
- loading, empty, one/many/long data, success, handled failure/retry, disabled/pending,
  permission, stale/conflict;
- keyboard navigation, visible focus, accessible names;
- geometry: page overflow, container bounds, sibling overlap, local scroll;
- console warnings/errors и failed network requests;
- screenshot и state snapshot только после завершения async layout.

Использовать in-app/Kontur Playwright workflow, если он доступен; сначала выполнить discovery и
`browser_tabs` smoke. К repo Playwright fallback переходить только после зафиксированной
недоступности browser integration. Evidence складывать в датированную audit folder, не в корень.

Перед commit:

```text
git diff --check
git status --short
```

Не запускать formatter по чужим dirty files и не использовать `git add .`.

## Hard stops

Остановись с `FILE / EVIDENCE / DECISION NEEDED`, если:

- для happy path требуется придумать nomenclature code, package, capacity, `Ex/R_gr` row или
  формулу;
- требуется применить pipe formula к unsupported type;
- ambiguous manual specification rows нельзя безопасно связать с UUID;
- selected target уже содержит чужой WIP, который нельзя обойти;
- slice не помещается в frontend PR budget/owner contract;
- обязательный backend/frontend/browser proof красный после трёх содержательных попыток;
- решение требует ослабить diagnostics/security/atomicity/test/CSS baseline;
- browser proof обязателен для видимого UI, но недоступен.

Не являются причиной вернуть compatibility:

- старый frontend test или payload;
- synthetic/demo static catalog;
- желание сохранить numeric query «на время»;
- зелёный legacy builder test, фиксирующий ошибочное `R_gr` поведение.

## Definition of Done

Cross-stack спецификация готова только когда одновременно:

- один unversioned canonical API без aliases/V2;
- все specification operations UUID-scoped;
- settings request/project-scoped и не читаются из objects;
- missing/false/zero различаются на backend и frontend;
- catalog operational, immutable, approved/complete и реально питает calculators;
- candidates вычисляет backend; frontend делает только явный UUID selection;
- calculators pure/Decimal, normalized goldens исполняются;
- `R_gr` не применяется без authoritative row rule;
- incomplete glue/tapes/Ex/R_gr блокируют whole ER;
- persistence atomic per ER, independent between ERs, fingerprint rechecked under lock;
- snapshot воспроизводим и содержит catalog item/formula/input provenance;
- UUID reload/manual rows/stale/query invalidation работают;
- project IO/reports не используют stale/blocked BOM как current;
- старый builder/static production path/V2/numeric adapters удалены;
- frontend показывает все typed states без формул/hidden defaults/text parsing;
- permissions, migration, concurrency, query count, focused tests и required browser states реально
  проверены;
- docs/checklist/OpenAPI совпадают с runtime;
- каждый slice находится в отдельном scoped commit, чужой WIP не попал в commit.

## Формат отчёта после каждого slice

```text
Slice:
Behavior before → after:
Backend files:
Frontend files:
E2E/docs/migrations:
Deleted legacy/static path:
Focused proof (command + result):
Frontend proof receipt:
Browser states/viewports:
Console/network:
NOT RUN:
Authoritative-data blockers:
Residual risk:
Commit:
Next slice (не выполнять автоматически):
```
