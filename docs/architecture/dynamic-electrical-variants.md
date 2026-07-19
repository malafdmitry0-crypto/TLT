# ADR: динамические именованные электротехнические решения

- Статус ADR: **Phase 1–3 PASS / Phase 4 blocked / Phase 5 PARTIAL PASS / Phase 6 prep**
- Статус Phase 1–3: **PASS**; Phase 4 blocked official numeric data contract;
  Phase 5 partial PASS по checkpoint; remaining verification перечислена ниже
- Даты: 18–19.07.2026; product decisions PDL-ER-01…41 утверждены пользователем
- Ветка: `feature/tnp-dynamic-electrical-variants`
- Область: DB → backend API/services → frontend → specification/report → CSV → tests

## Контекст

Исходная система использовала четыре заранее существующих integer-слота
`variant_number=1…4`, которые старый UI называл `СО1…СО4`. PDF редакции 4 от
07.07.2026 и решения PDL-ER-01…08 требуют до пяти создаваемых пользователем
именованных ЭР с постоянными UUID, независимыми распределениями объектов,
расчётами, спецификациями и отчётами.

Этот ADR зафиксировал Phase 0. Решения `OPEN-ER-01…09` утверждены пользователем
18.07.2026 как рекомендованные варианты и зарегистрированы PDL-ER-09…17.
Правила section data contract PDL-ER-18…25 утверждены пользователем 18.07.2026
как варианты А. Guest TTL, целевой лимит 500 и обязательность фактического
официального numeric artifact утверждены 19.07.2026 в PDL-ER-26…28.
Контракт specification/report/project I/O Phase 5 утверждён 19.07.2026 в
PDL-ER-29…41.
Production Phase 1–3 разрешены и реализованы; Phase 4 не начинается без самого
официального числового источника PDL-ER-15/18/28.
Границы и evidence зафиксированы в Phase 1, Phase 2 и Phase 3 checkpoints в
`docs/tnp/cases/guest-specification/`.

## Приоритет источников

1. Явные решения пользователя PDL-ER-01…41 в
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

## Уже утверждено: PDL-ER-01…41

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
| PDL-ER-09 | Имена уникальны внутри project после `trim + casefold`. |
| PDL-ER-10 | Действующий resistive flow сохраняется; `single_core/three_core -> resistive`. |
| PDL-ER-11 | `system_type` отделён от `assignment_state`; исходный cable type сохраняется, mineral/MI disabled как новый target, но migrated rows остаются видимыми и removable. |
| PDL-ER-12 | Первый active `ЭР1` создаётся только readiness-gated mutation. |
| PDL-ER-13 | Specification при copy не копируется и не генерируется; target `not_generated`. |
| PDL-ER-14 | Multi-ЭР generation атомарна между ЭР; object partial только после подтверждения. |
| PDL-ER-15 | Phase 4 ждёт утверждённые `Lmax`/пусковые/токовые данные; defaults запрещены. |
| PDL-ER-16 | PDF 07.07 задаёт BOM semantics; XLSX 29.05 — только непротиворечащие каталог/данные. |
| PDL-ER-17 | Expand window → one-way UUID cutover → backup/restore recovery point. |
| PDL-ER-18 | Section data берутся только из официального каталога/утверждённой методики производителя ТЛТ с source/version traceability. |
| PDL-ER-19 | Отсутствующее обязательное значение блокирует расчёт с error code; defaults и nearest fallback запрещены. |
| PDL-ER-20 | `Iдоп`, А, хранится явно по марке и напряжению; не выводится из автомата и не является глобальной константой. |
| PDL-ER-21 | Используется прямой `Iст.уд`, А/м, из источника; общий `kпуск` не вводится. |
| PDL-ER-22 | Для выбора строки используется минимальная расчётная температура объекта/климата. |
| PDL-ER-23 | Section limits раздельны для каждого напряжения и не переносятся между ними. |
| PDL-ER-24 | `Lогр` округляется вниз только по правилу официального источника; отсутствие правила блокирует расчёт. |
| PDL-ER-25 | Новый section contract применяется только к саморегулирующемуся кабелю. |
| PDL-ER-26 | Guest project временно хранится в PostgreSQL 3 дня после последней активности, изолирован по session и удаляется cleanup после TTL. |
| PDL-ER-27 | Целевой предел — 500 объектов и 5 ЭР; runtime limit 50 повышается только после полного performance gate и PDF-порогов 30 секунд. |
| PDL-ER-28 | Phase 4 ждёт фактический официальный каталог/«Таблицу Виктора»; неполные PDF/XLSX не снимают data blocker. |
| PDL-ER-29 | Product mode specification один: full data-driven BOM; basic остаётся только временным internal compatibility path до Phase 6. |
| PDL-ER-30 | Интерактивный UI поддерживается от 1280 px; mobile не входит в Phase 5, browser print адаптивен. |
| PDL-ER-31 | `Rгр` — отдельный default `1.0`, не 10% order reserve и не глобальный BOM multiplier. |
| PDL-ER-32 | Tank/resistive включают только доказанные позиции; остальное — явно подтверждённый partial, без pipe/self-reg substitution. |
| PDL-ER-33 | Catalog identity/default читаются из explicit fields; prefix/suffix/row-order inference запрещён. |
| PDL-ER-34 | PDF всегда authoritative для specification semantics/formulas; XLSX-only rule требует отдельного утверждения. |
| PDL-ER-35 | Зависимые от `Ex/Rгр` коробки fail closed до официальной per-row матрицы. |
| PDL-ER-36 | Multi-ЭР partial использует один preflight, одно per-ЭР confirmation и одну atomic transaction. |
| PDL-ER-37 | Stale snapshot read-only и исключён из totals/print/report/exports. |
| PDL-ER-38 | Default grouping: pipe/tank/common; merge опционален по catalog base + code. |
| PDL-ER-39 | Один report по явному UUID-list содержит независимые главы/specs и не смешивает суммы ЭР. |
| PDL-ER-40 | Corporate template не блокирует functional Phase 5 preview/print и остаётся отдельным acceptance scope. |
| PDL-ER-41 | V3-only export, v2 import-only; untrusted source snapshots stale/unsupported; guest manual rows atomic reject. |

## Текущая цепочка реализации

| Слой | Текущий источник истины | Найденное расхождение |
|---|---|---|
| DB | 0027 добавляет UUID graph, 0028 — task UUID trace, 0029 — optimistic assignment `version`, 0030 — specification settings, 0031 — ER5 slots. | Legacy `variant_number=1…5` и nullable expand columns ещё не удалены; `heating_sections` отсутствует. |
| Backend schema/API | UUID lifecycle/assignments, ER5 calculation graph, multi-ЭР specification generation/report preview и CSV v3 реализованы. | Полный UUID-only cutover остаётся Phase 6; create candidate/folder для slot 5 всё ещё ошибочно ограничен `1…4`. |
| Services/tasks | Calculation/batch/task/copy paths требуют compatible assignment; exact-ER mutations stale-ят только выбранную spec. | Numeric slot остаётся compatibility metadata; worker временно преобразует UUID в slot. |
| Frontend | До пяти именованных UUID ЭР, `?er=`, UUID cache/query identity, assignment panel, explicit multi-ЭР specification/report selectors и width warning. | Slot-5 candidate/folder create наследует backend gap; full scale 500 не доказан. |
| Specification/report | Full automatic guest BOM, settings snapshot, preflight/atomic multi-ЭР generation, stale exclusion и independent report chapters реализованы. | Official `Ex/Rгр` matrix data external; corporate template out of Phase 5; server export остаётся single-ЭР. |
| CSV | Export всегда v3; import принимает v3 и legacy v2 slots `1…5`, сохраняет dynamic ER state и trust boundary. | Phase 6 ещё должна удалить numeric columns/adapters. |
| Tests/docs | Phase 1–3 PASS; Phase 5 checkpoint PARTIAL PASS с API/UI/e2e/DB evidence. | Full 500 wall-clock, Phase 4 data, release hygiene и slot-5 candidate/folder gap остаются. |

Отдельный critical baseline finding: `ElecCalcPage.tsx` обновляет широким
`setQueriesData` кэши всех вариантов, а `useElectricalStats.ts` выбирает расчёт
с максимальным `variant_number`. Результат другого СО может попасть в текущий
экран. `placeholderData: previous` в electrical/report дополнительно показывает
данные предыдущего варианта во время переключения. UUID query keys обязаны
исключить оба поведения.

## Доменная модель Phase 1 и целевой контракт

### `electrical_variants`

| Поле | Контракт |
|---|---|
| `id UUID PK` | Постоянный публичный ID. |
| `project_id UUID FK` | `projects.id`, `ON DELETE CASCADE`. |
| `name varchar` | `trim`, непустое; unique внутри project после `casefold`. |
| `sort_order integer` | Порядок вкладок, не бизнес-ID. |
| `is_active boolean` | Не более одного active на проект через partial unique index. |
| `copied_from_id UUID null` | Same-project self-FK/traceability; lifecycle service явно detach-ит direct copies при удалении source. |
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
| `system_type` | `self_regulating/resistive/skin/mineral`, nullable до назначения; skin/mineral нельзя назначить заново, но migrated rows доступны read/unassign. |
| `assignment_state` | `unassigned/ready/unsupported/stale/error`, отдельно от типа системы. |
| `requested_cable_type` | Сохраняет lossless legacy diagnostic/source value. |
| `object_version_snapshot` | Snapshot/version для stale detection. |
| `version` | Отдельная optimistic revision assignment; не равна object snapshot. |
| diagnostics/timestamps | `error_code`, details, created/updated. |

Обязательны unique `(electrical_variant_id, object_id)` и проверка, что ЭР и
объект принадлежат одному project. Новый объект добавляется во все существующие
ЭР; unassign удаляет только scoped electrical graph и сохраняет heat data.

Миграция 0029 reconciles exact-UUID deployed calculations и вводит CHECK:
`unassigned → system_type=null`, `ready → supported system`,
`skin/mineral → unsupported`, `version>=1`. После неё assignment authoritative:
assign поддержанных систем создаёт `stale + ELECTRICAL_CALCULATION_REQUIRED`,
same-system повтор — idempotent no-op, reassign требует confirmed unassign.
Calculation upsert валидирует exact compatible assignment до записи и затем
атомарно переводит только target row в `ready/error/stale/unsupported`.

Confirmed unassign удаляет calculations/candidates/folders/items только по
`project + ER UUID + object`, сохраняет heat и другие ЭР, оставляет assignment
как `unassigned` и stale-ит только specification выбранного ЭР. NULL/mismatched
legacy scope, cross-ER folder item и пересекающаяся active job блокируют
операцию до cleanup.

Если уже `unassigned` row содержит чисто scoped legacy graph, assign не удаляет
его молча: возвращает `ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED`. Frontend
показывает отдельное подтверждение, выполняет confirmed exact-UUID cleanup с
сохранением heat и требует явного повторного назначения. Это отличается от
NULL/mismatched/cross-ER corruption: такой graph fail-closed и не подлежит
автоматическому numeric cleanup.

### Downstream scope

- `electrical_calculations`, `electrical_candidates` и
  `electrical_candidate_folders` получили expand-window nullable
  `electrical_variant_id`, same-project/slot FK и composite FK к assignment
  scope `(electrical_variant_id, object_id)`. NOT NULL — отдельный contract step.
- `specifications` получила nullable `electrical_variant_id`, same-project/slot
  FK и partial unique `(project_id, electrical_variant_id)`.
- Новые electrical/report background tasks сохраняют UUID ЭР в колонке и
  versioned payload v3. Колонка намеренно без FK для сохранения terminal history;
  active jobs блокируют lifecycle delete.
- Explicit task idempotency namespaced по principal/type/project и binding-ит
  полный payload/ER. Exact active/terminal retry возвращает исходную task;
  changed payload/ER возвращает `409 TASK_IDEMPOTENCY_KEY_REUSED`. Heat path
  project-lock-ит lookup/insert через terminal transition; replay audit отражает
  фактический durable result.
- Audit lifecycle/task events сохраняют UUID в details, но direct spec/report
  payloads ещё не переведены полностью.
- `heating_sections` вводится только после закрытия formula/data contract:
  `id`, assignment/variant/object scope, `sort_order`, source inputs,
  calculated length/current/power, status, formula/source traceability.
- `num_circuits` нельзя backfill-ить как число нагревательных секций.

## API: реализованные lifecycle и assignments

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

Lifecycle и Phase 3 assignment API реализованы. GET поддерживает view/state и
pagination; mutation принимает exact `expected_version`, список 1…500 объектов
и выполняется атомарно. `skin/mineral` нельзя выбрать как target, но их tabs
остаются доступны для просмотра migrated unsupported rows и confirmed
unassign. Новые
electrical/report task APIs принимают
`electrical_variant_id: UUID`; deprecated numeric selector разрешается в UUID и
не попадает в новый v3 payload. Direct calculation/candidate/folder/spec,
report preview и sync export всё ещё несут numeric compatibility slot вместе с
exact UUID. Calculation query возвращает assignment projection текущей
страницы. Missing/unassigned/unsupported fail-closed в frontend и backend;
system mismatch остаётся строгим для row/batch/inline write, но supported
assignment не блокирует открытие manual/candidate modal. Fresh slot `4`
создаёт только `ЭР1 + ЭР4`.

Mutation endpoints, specification generation/save и task enqueue используют
write/owner guard. PostgreSQL RLS в проекте нет, поэтому изоляция по-прежнему
полностью зависит от application-level ownership checks и их regression tests.
Candidate apply/delete дополнительно разделяют lifecycle project-row lock;
apply перечитывает candidate/mapping после lock, не пересоздаёт удалённый ЭР и
возвращает stable 404/409 при проигранной гонке.

Project duplicate после heat/readiness создаёт `ЭР1` и unassigned matrix, но не
угадывает system type и не запускает electrical batch. Explicit legacy copy
calculation variant сначала staging target assignment intent из source и только
затем копирует exact calculation graph. По PDL-ER-13 оба copy flow оставляют
target specification `not_generated`: specification не копируется и не
регенерируется; explicit request на regeneration отклоняется до mutation.

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
- Assignment panel показывает `Нераспределённые / Самрег / Резистив /
  Скин / Минеральный`. Unsupported tabs browsable для migrated rows и unassign;
  disabled только назначение в них. Панель отправляет row versions и требует
  отдельное confirmation перед scoped cleanup dirty-unassigned graph.
- Candidate create для requested `skin/mineral` отклоняется
  `ELECTRICAL_SYSTEM_UNSUPPORTED` до dedupe/upsert; диагностический candidate
  row не создаётся.
- Query projection используется fail-closed: missing/unassigned/unsupported
  объекты нельзя выбрать, редактировать, открыть candidate/manual flow или
  отправить в recalculation. Mismatch текущего saved/draft cable type запрещает
  row selection, batch/inline write и selected recalculation, но для supported
  assignment `Выбор`/`Подбор` остаются доступны. Если сохранённый тип отсутствует
  или относится к другой системе, модалка выбирает system-safe default
  (`resistive → single_core`) и показывает только типы назначенной системы.
  Recalculate-all scope фильтрует backend.

## Specification, report и I/O

- Specification независима на каждый ЭР и всегда отображает имя через FK.
- `unassigned/error/unsupported/stale` не входят в успешные суммы.
- Ноль успешных electrical results не может дать accessory-only success.
- Единственный target mode — full data-driven BOM; basic не является fallback.
- Partial generation выполняет side-effect-free preflight выбранных ЭР, одно
  per-ЭР confirmation и atomic write; возвращает object/group IDs + error codes.
- Tank/resistive не наследуют pipe/self-reg accessory formulas и остаются
  partial за пределами доказанных позиций.
- PDF authoritative для specification formulas. XLSX-only rule не переносится
  автоматически; `Ex/Rгр` boxes ждут official per-row data.
- `Rгр=1.0` — отдельный setting, не 10% order reserve и не global multiplier.
- Catalog identity/default не выводятся из имени или row order.
- Stale snapshot только read-only и запрещён в totals/print/report/export.
- Default grouping — pipe/tank/common; merge только по base + code после
  раздельного расчёта типов.
- Guest full generation не ослабляет ownership, rate-limit и manual RBAC.
- Guest report: HTML + print CSS; employee/admin: server exports. Multi-ЭР
  report содержит отдельные главы без cross-ЭР sums; corporate template
  остаётся отдельным финальным acceptance scope.
- CSV v3 содержит variants, assignments, calculations, sections,
  specifications и settings snapshots со стабильными file-local keys.
- Export после Phase 5 только v3; v2 остаётся import-only adapter.
- Missing/mismatched formula/catalog source восстанавливает graph/inputs, но
  stale-ит calculated state. Guest manual BOM rows отклоняются атомарно.
- Import v2 реализован: валидирует slots `1…5` до замены guest project, создаёт
  active `ЭР1` плюс только занятые slots, complete assignments и явные UUID у
  calculations/specifications; legacy specs становятся stale/not-ready.
- Bulk v2 использует savepoint на project graph. Неизвестный electrical
  `object_key` пока silently пропускается и остаётся переходным риском.
- Export создаётся только в v3 и переносит names, active-state, assignments и
  fifth ER. V2 сохранён только как import boundary adapter.

## Expand/backfill/validate/contract

Текущий schema head: `0031` (`0026 → 0027 → 0028 → 0029 → 0030 → 0031`).
Phase 3 evidence ниже относится к историческому head `0029`; актуальный ER5
checkpoint и DB invariants находятся в `phase-5-checkpoint.md`.

1. **Выполнено 0027:** создать новые таблицы/индексы; добавить nullable UUID FK
   в legacy downstream tables; legacy columns пока не удалять.
2. **Выполнено 0027:** собрать union slots из
   calculations/candidates/folders/specs и v2 task payloads. Каждый существующий
   project получает минимум `ЭР1`; остальные ЭР создаются только для занятых
   slots.
3. **Выполнено 0027:** создать assignments для каждого project object во всех созданных ЭР.
   `self_regulating/self_regulating_tt` маппятся в self-reg,
   `single_core/three_core` — в resistive; mineral/unknown сохраняются как
   requested type со state `unsupported`.
   Failed/stale legacy calculations сохраняются как diagnostic history у
   assignment со state `unassigned/unsupported/stale`, но никогда не считаются
   successful и не входят в BOM.
4. **Выполнено 0027:** проставить downstream UUID; старые результаты без доказанных sections
   отметить `sections_not_ready`, зависимые specs — stale.
5. **Выполнено migrations/tests:** validate counts, nulls, duplicates, cross-project links, active count,
   cascade и project ownership.
6. **Частично:** UUID unique/FK constraints включены, но downstream columns
   остаются nullable до полного cutover.
7. **Частично:** lifecycle, frontend, background tasks и CSV v3 UUID-first;
   direct services всё ещё содержат numeric compatibility layer.
8. **Выполнено 0029:** добавить assignment `version`, semantic CHECK/index и
   reconciliation only exact-UUID deployed calculations. Runtime не auto-assign.
9. **Выполнено 0030/0031:** добавить specification settings и расширить
   compatibility constraints/data plane до slot 5.
10. **Pending:** удалить legacy columns/constraints только отдельной contract migration и
   после observation window.

Worker временно читает no-version/v2 task payload через backfilled UUID mapping,
а новые/replayed задачи пишет как v3 UUID-first. Перед contract cutover очередь
v2 всё равно должна быть дренирована; одновременная работа старого worker и
UUID-only schema запрещена.

Object-insert trigger берёт per-project `FOR NO KEY UPDATE` перед созданием
assignments; lifecycle берёт `FOR UPDATE` на той же строке. Эта lock-order
сериализует гонки object/ER без global/advisory lock и доказана двумя
конкурентными сценариями.

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

- после 0031 normal lifecycle назначает slots `1…5`; UUID остаётся публичной
  identity, slot — только переходной mapping;
- перед feature activation и contract migration создаётся и проверяется backup;
- UUID — единственный writable source сразу после cutover;
- после появления пятого ЭР/assignments/sections lossless downgrade невозможен;
- после этой точки rollback — только restore к объявленному recovery point;
- притворно безопасный Alembic downgrade запрещён.

Стратегия утверждена PDL-ER-17.

## Phase plan и disjoint write sets

| Phase | Status | Write set | Gate |
|---|---|---|---|
| 0 | Complete | Только ADR, impact matrix, characterization/evidence. | Baseline tests/screenshots; production unchanged. |
| 1 | PASS | Alembic/models/schemas + новый variant service/router + backend tests. | Migration, RBAC, audit, concurrency; legacy UI adapter only. |
| 2 | PASS | Frontend variant API/store/query factory/tabs + focused frontend/e2e. | UUID isolation, reload/deep-link, before/after UI proof. |
| 3 | PASS | Assignment model/service/UI + scoped stale cleanup. | Cross-ER isolation, races, browser and DB invariants. |
| 4 | BLOCKED PDL-ER-15/18/28 | Formula contracts + persisted sections + hierarchy. | Independent golden/boundary/metamorphic/mutation evidence. |
| 5 | PARTIAL PASS | Spec/report/settings/CSV v3 + guest print/full BOM + ER5 slots. | Focused evidence PASS; 500 scale, official data, release hygiene и slot-5 candidate/folder guards остаются. |
| 6 | Pending | Legacy contract removal + docs/SRS/API updates. | Search gate and full functional audit. |

Production Phase 1–3 реализованы; Phase 5 имеет partial PASS. Семантика Phase 4 утверждена
PDL-ER-18…25, но реализация остаётся gated PDL-ER-15/18/28 до фактического
официального числового артефакта.

## Phase 0 baseline

Ниже — исторический evidence-срез Phase 0. Его числа и fixed-CO состояние не
описывают текущий runtime.

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

## Phase 1 final backend/DB evidence

Ниже — исторический checkpoint Phase 1. Утверждения о `0028` и fixed
`СО1…СО4` были верны на момент среза и superseded Phase 2/3/5.

- Working DB Alembic current — **0028**.
- Alembic 0027/0028 + metadata — **5 passed**; dynamic-ER integration —
  **21 collected**, включая candidate apply/delete race **2/2 PASS**; project
  I/O + Excel — **46 passed**.
- Legacy adapter/spec — **15 passed**; calculations full — **73 passed**;
  calculation/spec units — **114 passed**.
- Project flow — **21 passed**, включая focused duplicate **4 passed**.
- Task unit — **56 passed**; calculation jobs — **14 passed**; reports —
  **11 passed**; focused integration — **25 passed**. Heat terminal-transition
  race, selector-null и truthful replay audit входят в matrix.
- Full backend unit — **exit 0, exactly 1069 collected**. Clean single-process
  backend integration — **exit 0, exactly 421 collected**; only expected skip
  `test_performance_nfr.py:467` because `sample_import.csv` unavailable. Two
  overlapping runs were infrastructure-invalid and superseded.
- Formula quick — **PASS**; contracts — **5 legacy contracts / 5 commands
  PASS**. Они не доказывают PDF sections/BOM.
- Docs gate passed after generated-doc sync and is rerun after this final docs
  diff; DB invariants — **28 checks, 0 violations**; smoke — **18/18 PASS**.
- Scale proof — **500 objects × 5 ER = 2500 assignments**, постоянные **69 SQL
  statements** ниже ceiling `80`.
- Fresh `0001 → 0028` seed proof — 19 calculations, 10 specifications,
  10 variants, 28 assignments, **0 nullable UUID**, **0 scope mismatch**.
- Ruff, pre-commit, formatter (`40` changed Python files) и mapper gates —
  **PASS**.
- Frontend full gate — **925 passed, 1 failed, 1 skipped**. Неизменённый
  `HeatCalcPage.settings.test.tsx:321` воспроизводимо не находит accessible
  separator; isolated run — **1 failed, 10 skipped**. Это pre-existing дефект
  вне backend/DB Phase 1 и не regression Phase 1, но blocker общего release.
- Dependency security gate и общий metadata Alembic drift остаются не-green
  вне Phase 1 diff; они также блокируют общий release.
- Frontend по-прежнему fixed `СО1…СО4`; Phase 2/3/5 pending, Phase 4 blocked
  PDL-ER-15. Общий PDF/DoD и product release не завершены.

## Phase 3 assignment checkpoint

Реализованы migration 0029, authoritative assignment service/API, точная
calculation/candidate/folder/task integration, page projection и frontend
assignment panel. Expanded backend evidence — **249/249 PASS**; root relevant
integration suites — **167/167 PASS**; migration — **2/2 PASS**.
Root-verified frontend Phase 3 combined suite — **6 files, 95 tests PASS**;
full frontend — **1052 passed, 1 failed**, единственный failure остаётся
прежним HeatCalc accessible separator вне Phase 3 diff. Desktop/mobile
geometry не нашла page overflow или неожиданные clipping/overlap; live exact
UUID assign/unassign/reload завершён с **0 console errors / 0 warnings**, а
post-scenario DB invariants — **28/28 PASS**. Полный evidence зафиксирован в
`docs/tnp/cases/guest-specification/phase-3-checkpoint.md` и
`evidence/phase-3-assignments/`.

Phase 3 закрыла прежний MEDIUM residual `successful calculation +
unassigned assignment`: migration reconciles deployed exact-UUID rows, а новые
runtime writes fail-closed без compatible assignment. Он не закрывает Phase 4
sections/BOM или общий PDF/DoD. Последующий Phase 5 checkpoint реализовал
spec/report/CSV v3 частично; актуальные остатки перечислены в начале ADR.

## Закрытые решения Phase 0

| ID | Утверждённый вариант А | PDL |
|---|---|---|
| OPEN-ER-01 | Unique `trim + casefold`. | PDL-ER-09 |
| OPEN-ER-02 | Сохранить resistive. | PDL-ER-10 |
| OPEN-ER-03 | Отделить system type/state, сохранить requested type. | PDL-ER-11 |
| OPEN-ER-04 | Readiness-gated initialization. | PDL-ER-12 |
| OPEN-ER-05 | Не копировать specification. | PDL-ER-13 |
| OPEN-ER-06 | Atomic multi-ЭР generation. | PDL-ER-14 |
| OPEN-ER-07 | Остановить Phase 4 до утверждённых данных. | PDL-ER-15 |
| OPEN-ER-08 | PDF semantics, XLSX non-conflicting data. | PDL-ER-16 |
| OPEN-ER-09 | One-way cutover с recovery point. | PDL-ER-17 |

## Утверждено, но ещё не реализовано

- PDL-ER-26: guest TTL/хранение в PostgreSQL — 3 дня с последней активности;
  текущие 20 минут остаются implementation gap.
- PDL-ER-27: целевой лимит 500 объектов; текущий rollout guard 50 нельзя снимать
  до полного performance gate.
- PDL-ER-29…41: canonical full BOM, desktop width contract, `Rгр`, partial
  tank/resistive, catalog identity, PDF-first source priority, `Ex/Rгр` data
  gate, multi-ЭР partial/stale/grouping/report и CSV v3 trust boundary.
- Формулы MI/skin, `floor`, pump/platform/other.
- Пользовательский reorder ЭР.
- Полная cross-browser/performance сертификация PDF.

## Stop condition

Phase 1–3 можно выполнять вертикальными slices. Phase 4 и зависимую генерацию
реальных sections нельзя принимать или обходить defaults, пока не предоставлен
официальный источник производителя ТЛТ с `Lmax`, `Iдоп`, прямым `Iст.уд`,
напряжениями, температурами холодного пуска и правилом округления. Утверждение
PDL-ER-18…25 и PDL-ER-28 закрывает семантический выбор, но не заменяет числовой
источник. Phase 5 product choices закрыты PDL-ER-29…41, но зависимые коробки
также нельзя принимать без per-row `Ex/Rгр` matrix PDL-ER-35, а tank/resistive
accessories шире partial-контракта — без отдельной доказанной методики
PDL-ER-32.
