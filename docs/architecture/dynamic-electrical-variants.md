# ADR: динамические именованные электротехнические решения

- Статус: **Draft / blocked before production Phase 1**
- Дата: 18.07.2026
- Ветка: `feature/tnp-dynamic-electrical-variants`
- Область: DB → backend API/services → frontend → specification/report → CSV → tests

## Контекст

Текущая система использует четыре заранее существующих integer-слота
`variant_number=1…4`, которые UI называет `СО1…СО4`. PDF редакции 4 от
07.07.2026 и решения PDL-ER-01…08 требуют до пяти создаваемых пользователем
именованных ЭР с постоянными UUID, независимыми распределениями объектов,
расчётами, спецификациями и отчётами.

Этот ADR фиксирует Phase 0. Он **не разрешает production-изменения**, пока не
закрыты решения `OPEN-ER-*` в конце документа.

## Приоритет источников

1. Явные решения пользователя PDL-ER-01…08 в
   `docs/tnp/cases/guest-specification/product-decisions.md`.
2. Нормализованные однозначные требования PDF в
   `docs/tnp/cases/guest-specification/pdf-requirements.md`.
3. Для формул и поведения, не изменённых PDL, — действующий
   `docs/business-logic-contract.md`, затем профильные ТНП/XLSX/Markdown и
   machine-readable registry.
4. Legacy SRS/API/ТЗ используются как evidence текущего контракта и должны
   обновляться вместе с реализацией.
5. Код и тесты доказывают текущее поведение, но не переопределяют PDL/PDF.

Если источники расходятся, expected/golden не меняются до явного выбора
источника новой истины.

## Уже утверждено: PDL-ER-01…08

| ID | Зафиксированный результат |
|---|---|
| PDL-ER-01 | Генерация только для явного непустого списка выбранных UUID ЭР; `Выбрать все` разворачивается в явный список. |
| PDL-ER-02 | BOM использует заказную длину с резервом 10% и коммерческим округлением; `Lсек × Nсек` хранится отдельно как фактическая длина. |
| PDL-ER-03 | Прямой CRUD состава/длины/числа секций запрещён; изменение марки и навива/шага атомарно пересчитывает секции. |
| PDL-ER-04 | Guest получает автоматический full BOM; manual item mutations остаются employee/admin-only. |
| PDL-ER-05 | Guest получает HTML preview и browser print; server PDF/DOCX/XLSX — employee/admin-only. |
| PDL-ER-06 | Создаваемые типы объектов MVP: `pipe` и `tank`; `Бочка/barrel` нормализуется в `tank`; `floor` disabled. |
| PDL-ER-07 | Настройки — versioned project defaults; generation хранит immutable snapshot и применяется только к явно выбранным ЭР. |
| PDL-ER-08 | Ветка большого диаметра начинается включительно с `dтр >= 57 мм`. |

## Текущая цепочка реализации

| Слой | Текущий источник истины | Найденное расхождение |
|---|---|---|
| DB | `electrical_calculations`, `electrical_candidates`, `electrical_candidate_folders`, `specifications` содержат `variant_number`; constraints/indexes ограничивают `1…4`. | Нет сущности ЭР, имени, active-state, assignments и sections. |
| Backend schema/API | Pydantic и query/body параметры используют `int`, `ge=1, le=4`, `variant_numbers` максимум 4. | Lifecycle resource и UUID ownership validation отсутствуют. |
| Services/tasks | Calculation/query/copy/spec/report/task/project-I/O scoped по integer. Текущий copy копирует только calculation rows и по умолчанию регенерирует specification. | Нет deep-copy графа; обычные electrical mutations не делают spec stale. |
| Frontend | Zustand хранит `[1,2,3,4]` в `tlt-active-calculation-variant`; страницы показывают `СО1…СО4`. | Selected и backend active слиты; URL `?er=` и lifecycle отсутствуют. |
| Specification/report | Одна операция и preview на один integer; guest full запрещён; print отсутствует. | Нет explicit multi-select, full guest BOM и UUID isolation. |
| CSV | `schema_version=2`, секции `electrical/specifications` содержат `variant_number`. | Имена, active, assignments и sections не экспортируются. |
| Tests/docs | Golden/e2e закрепляют integer slots и часть legacy BOM. | Green baseline не доказывает PDF-BOM-01…07 или dynamic ER. |

Отдельный critical baseline finding: `ElecCalcPage.tsx` обновляет широким
`setQueriesData` кэши всех вариантов, а `useElectricalStats.ts` выбирает расчёт
с максимальным `variant_number`. Результат другого СО может попасть в текущий
экран. `placeholderData: previous` в electrical/report дополнительно показывает
данные предыдущего варианта во время переключения. UUID query keys обязаны
исключить оба поведения.

## Предлагаемая доменная модель

### `electrical_variants`

| Поле | Контракт |
|---|---|
| `id UUID PK` | Постоянный публичный ID. |
| `project_id UUID FK` | `projects.id`, `ON DELETE CASCADE`. |
| `name varchar` | `trim`, непустое; duplicate policy открыта. |
| `sort_order integer` | Порядок вкладок, не бизнес-ID. |
| `is_active boolean` | Не более одного active на проект через partial unique index. |
| `copied_from_id UUID null` | Self-FK/traceability, при удалении source — `SET NULL`. |
| `legacy_variant_number integer null` | Только backfill/compatibility trace, не writable API key. |
| timestamps | Audit/optimistic concurrency. |

Max 5 обеспечивается транзакцией с блокировкой project row и повторной
проверкой count. Сервис должен гарантировать ровно один active, когда в проекте
есть хотя бы один ЭР. До readiness-gated initialization новый project может
иметь 0 ЭР; `projects.electrical_initialized_at` фиксирует переход. Последний ЭР
после initialization удалить нельзя.

### `electrical_variant_objects`

| Поле | Контракт |
|---|---|
| `id UUID PK` | ID assignment. |
| `electrical_variant_id UUID FK` | `ON DELETE CASCADE`. |
| `object_id UUID FK` | `ON DELETE CASCADE`. |
| `system_type` | Финальный enum зависит от `OPEN-ER-03`. |
| `assignment_state` | Предлагается отделить `unassigned/ready/unsupported/stale/error` от типа системы. |
| `requested_cable_type` | Сохраняет lossless legacy diagnostic/source value. |
| `object_version` | Snapshot/version для stale detection. |
| diagnostics/timestamps | `error_code`, details, created/updated. |

Обязательны unique `(electrical_variant_id, object_id)` и проверка, что ЭР и
объект принадлежат одному project. Новый объект добавляется во все существующие
ЭР; unassign удаляет только scoped electrical graph и сохраняет heat data.

### Downstream scope

- `electrical_calculations`, `electrical_candidates` и
  `electrical_candidate_folders` получают обязательный
  `electrical_variant_id` и composite FK/constraint к assignment scope
  `(electrical_variant_id, object_id)`.
- `specifications` получает обязательный `electrical_variant_id` и unique
  `(project_id, electrical_variant_id)`.
- Tasks/jobs, audit events и report/spec payloads сохраняют UUID ЭР.
- Background task получает indexed UUID scope и versioned payload; перед
  удалением ЭР проверяются active jobs. Audit UUID не должен каскадно исчезать.
- `heating_sections` вводится только после закрытия formula/data contract:
  `id`, assignment/variant/object scope, `sort_order`, source inputs,
  calculated length/current/power, status, formula/source traceability.
- `num_circuits` нельзя backfill-ить как число нагревательных секций.

## Предлагаемый API

```text
GET    /api/v1/projects/{project_id}/electrical-readiness
POST   /api/v1/projects/{project_id}/electrical-variants/initialize
GET    /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/copy
PATCH  /api/v1/projects/{project_id}/electrical-variants/{id}
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/activate
DELETE /api/v1/projects/{project_id}/electrical-variants/{id}

GET    /api/v1/projects/{project_id}/electrical-variants/{id}/assignments
PATCH  /api/v1/projects/{project_id}/electrical-variants/{id}/assignments
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/unassign
```

Calculation/query/candidate/folder/spec/report/task APIs получают
`electrical_variant_id: UUID`. Multi-operation получает уникальный список
`electrical_variant_ids` длиной 1…5 и валидирует весь список и ownership до
первой записи.

Mutation endpoints используют write/owner guard. Это обязательно исправляет
текущий дефект: specification generation/save вызывают read-level
`get_project_basic`, поэтому employee может изменить доступный, но чужой
проект. Такой же audit нужен для enqueue/cancel background tasks: текущие пути
также опираются на project read-access. PostgreSQL RLS в проекте нет, поэтому
изоляция полностью зависит от application-level ownership checks.

## Frontend state и query isolation

- Selected ЭР: `?er=<uuid>` + новый persisted selected-key; это не active.
- Active ЭР: только backend `is_active`.
- Selection fallback: valid URL → valid persisted selected UUID → backend
  active → first by `sort_order`.
- Старый numeric Zustand state очищается versioned migration; число нельзя
  самостоятельно преобразовать в UUID без server mapping.
- Все query keys включают `projectId` и exact `erId`.
- Запрещены cross-ER `placeholderData`, broad optimistic writes и выбор расчёта
  по максимальному номеру.
- Progress на странице с явным `?er` предлагается считать по selected ЭР; без
  URL — по backend active. Это implementation convention, не изменение active.
- Reorder UI не входит в MVP; `sort_order` нужен для стабильного порядка и
  delete fallback.
- UI проверяется на `1440x1000` и `390x844` по обязательному repo gate, даже
  если legacy SRS декларирует desktop-first.

## Specification, report и I/O

- Specification независима на каждый ЭР и всегда отображает имя через FK.
- `unassigned/error/unsupported/stale` не входят в успешные суммы.
- Ноль успешных electrical results не может дать accessory-only success.
- Partial generation требует явного `allow_partial/confirm_partial` и
  возвращает object IDs + error codes.
- Guest full generation не ослабляет ownership, rate-limit и manual RBAC.
- Guest report: HTML + print CSS; employee/admin: server exports.
- CSV v3 содержит variants, assignments, calculations, sections,
  specifications и settings snapshots со стабильными file-local keys.
- Import v2 маппит slots 1…4 в `ЭР1…ЭР4`; один project graph импортируется
  атомарно.
- Import обязан полностью parse/validate graph до замены текущего guest project;
  текущий v2 flow удаляет его слишком рано и silently пропускает неизвестный
  `object_key`.

## Expand/backfill/validate/contract

Проверенный Alembic head: `0026`.

1. Expand: создать новые таблицы/индексы; добавить nullable UUID FK в legacy
   downstream tables; legacy columns пока не удалять.
2. Backfill: собрать union slots из calculations/candidates/folders/specs.
   Каждый project получает минимум `ЭР1`; остальные ЭР создаются только для
   реально занятых slots.
3. Создать assignments для каждого project object во всех созданных ЭР.
   `self_regulating/self_regulating_tt` маппятся в self-reg,
   `single_core/three_core` — в resistive; unsupported mapping зависит от
   `OPEN-ER-03`.
   Failed/stale legacy calculations сохраняются как diagnostic history у
   assignment со state `unassigned/unsupported/stale`, но никогда не считаются
   successful и не входят в BOM.
4. Проставить downstream UUID; старые результаты без доказанных sections
   отметить `sections_not_ready`, зависимые specs — stale.
5. Validate counts, nulls, duplicates, cross-project links, active count,
   cascade и project ownership.
6. После доказанного backfill включить NOT NULL/new unique/FK constraints.
7. Перевести backend/frontend/tasks/CSV на UUID как единственный writable key.
8. Удалить legacy columns/constraints только отдельной contract migration и
   после observation window.

Перед contract cutover очередь v2 tasks должна быть дренирована либо worker
обязан временно читать `payload_version=2` через legacy mapping. Одновременная
работа старого worker и UUID-only schema запрещена.

Read-only snapshot локальной БД перед миграцией:

- 339 projects, 3561 project objects;
- 45 projects имеют legacy variant data, 294 не имеют;
- ожидается 344 ЭР и 4403 assignments после указанного backfill;
- calculations по slots: `1=195`, `2=6`, `3=131`, `4=9`;
- specifications: `1=14`, `2=1`, `3=1`, `4=1`;
- candidates: `1=34`, `4=4`; folders: `1=5`.

Это operational snapshot, а не golden; migration tests обязаны строить
отдельные fixtures для empty/1/4 slots, duplicate/race/cross-project cases.

## Rollback proposal

Предлагается короткое expand/compatibility window:

- до пятого ЭР legacy slot остаётся read-only derived mapping;
- перед feature activation и contract migration создаётся и проверяется backup;
- UUID — единственный writable source сразу после cutover;
- после появления пятого ЭР/assignments/sections lossless downgrade невозможен;
- после этой точки rollback — только restore к объявленному recovery point;
- притворно безопасный Alembic downgrade запрещён.

Стратегия требует решения `OPEN-ER-09`.

## Phase plan и disjoint write sets

| Phase | Write set | Gate |
|---|---|---|
| 0 | Только ADR, impact matrix, characterization/evidence. | Baseline tests/screenshots; production unchanged. |
| 1 | Alembic/models/schemas + новый variant service/router + backend tests. | Migration, RBAC, audit, concurrency; legacy UI adapter only. |
| 2 | Frontend variant API/store/query factory/tabs + focused frontend/e2e. | UUID isolation, reload/deep-link, before/after UI proof. |
| 3 | Assignment model/service/UI + scoped stale cleanup. | Cross-ER isolation and DB invariants. |
| 4 | Formula contracts + persisted sections + hierarchy. | Independent golden/boundary/metamorphic/mutation evidence. |
| 5 | Spec/report/settings/CSV v3 + guest print/full BOM. | No-mixing, RBAC, round-trip, browser and DB proof. |
| 6 | Legacy contract removal + docs/SRS/API updates. | Search gate and full functional audit. |

Production Phase 1 не начинается, пока обязательные решения ниже не закрыты.

## Phase 0 baseline

- Backend focused: calculations/specifications/reports/project-I/O — PASS.
- Frontend focused: ElecCalc/Specification/Report/variant model — 65 PASS.
- `scripts/formula-qa.sh quick` — PASS.
- `scripts/codex-functional-audit.sh contracts` — PASS для 5 legacy contracts;
  PDF-BOM contracts ещё не зарегистрированы.
- `scripts/codex-functional-audit.sh db-invariants` — 11 checks, 0 violations.
- Alembic — `0026 (head)`.
- Kontur static wrapper — INFRA FAIL: неверно вычисляет repo root внутри plugin
  cache; это не product pass.
- Before UI: curated desktop/mobile screenshots, snapshots, geometry, console
  и network evidence находятся в
  `docs/tnp/cases/guest-specification/{assets/ui,evidence}`.

## Открытые решения

| ID | Решение, которое нельзя угадать | Рекомендуемый вариант |
|---|---|---|
| OPEN-ER-01 | Допустимы ли одинаковые имена ЭР? | Нет; unique по `trim + casefold` внутри project. |
| OPEN-ER-02 | Сохранять ли уже работающий resistive flow? | Да; `single_core/three_core -> resistive`. Disabled только MI/skin. |
| OPEN-ER-03 | Как losslessly хранить legacy `mineral`/unsupported? | Разделить `system_type` и `assignment_state`; сохранить `requested_cable_type`, `mineral` disabled. |
| OPEN-ER-04 | Когда создавать первый `ЭР1`? | При первом readiness-gated переходе в электрический расчёт; mutation повторно валидирует объекты под project lock и атомарно создаёт active `ЭР1` с assignments. |
| OPEN-ER-05 | Что делать со specification при copy ЭР? | Не копировать; target получает `not_generated`, нужна явная generation. |
| OPEN-ER-06 | Атомарность генерации нескольких ЭР? | Одна транзакция для списка ЭР; partial только внутри ЭР после явного подтверждения. |
| OPEN-ER-07 | Откуда взять `Lmax`, пусковой ток/`kпуск` для sections? | Остановить Phase 4 до предоставления утверждённого источника; не вводить defaults. |
| OPEN-ER-08 | PDF или XLSX определяет конфликтующие BOM-формулы? | PDF 07.07 задаёт семантику; XLSX 29.05 используется только как каталог/данные там, где не противоречит PDF. |
| OPEN-ER-09 | Допустим ли one-way cutover с backup/restore rollback? | Да: expand window, затем one-way contract migration и recovery point. |

## Отложено вне текущего scope

- Guest TTL/хранение 3 дня против текущих 20 минут.
- Повышение продуктового лимита с 50 до 500 объектов.
- Формулы MI/skin, `floor`, pump/platform/other.
- Пользовательский reorder ЭР.
- Полная cross-browser/performance сертификация PDF.

## Stop condition

Статус остаётся **blocked before production Phase 1**, пока пользователь явно
не закроет как минимум OPEN-ER-01…04 и OPEN-ER-09. Phase 4 блокирует
OPEN-ER-07; Phase 5 — OPEN-ER-06 и OPEN-ER-08.
