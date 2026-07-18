# ADR: динамические именованные электротехнические решения

- Статус ADR: **Accepted for Phase 1–3 / Phase 4 blocked by data contract**
- Статус backend/DB Phase 1: **PASS — backend/DB Phase 1 checkpoint complete**
- Дата: 18.07.2026; section decisions дополнены 19.07.2026
- Ветка: `feature/tnp-dynamic-electrical-variants`
- Область: DB → backend API/services → frontend → specification/report → CSV → tests

## Контекст

Исходная система использовала четыре заранее существующих integer-слота
`variant_number=1…4`, которые текущий UI всё ещё называет `СО1…СО4`. PDF редакции 4 от
07.07.2026 и решения PDL-ER-01…08 требуют до пяти создаваемых пользователем
именованных ЭР с постоянными UUID, независимыми распределениями объектов,
расчётами, спецификациями и отчётами.

Этот ADR зафиксировал Phase 0. Решения `OPEN-ER-01…09` утверждены пользователем
18.07.2026 как рекомендованные варианты и зарегистрированы PDL-ER-09…17.
Правила section data contract PDL-ER-18…25 утверждены пользователем 19.07.2026
как варианты А. Production Phase 1–3 разрешены; Phase 4 не начинается без
фактического официального числового источника PDL-ER-15/18.
Backend/DB foundation Phase 1 завершена и проверена; граница и evidence
зафиксированы в
`docs/tnp/cases/guest-specification/phase-1-checkpoint.md`.

## Приоритет источников

1. Явные решения пользователя PDL-ER-01…25 в
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

## Уже утверждено: PDL-ER-01…25

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
| PDL-ER-11 | `system_type` отделён от `assignment_state`; исходный cable type сохраняется, mineral/MI disabled. |
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

## Текущая цепочка реализации

| Слой | Текущий источник истины | Найденное расхождение |
|---|---|---|
| DB | 0027 добавляет `electrical_variants`, `electrical_variant_objects`, project initialization timestamp и nullable UUID bridge в calculations/candidates/folders/specifications; 0028 добавляет task UUID trace. | Legacy `variant_number=1…4` и nullable expand columns ещё не удалены; `heating_sections` отсутствует. |
| Backend schema/API | Readiness и UUID lifecycle list/create/copy/rename/activate/delete реализованы с ownership, limit/concurrency и stable error codes. | Assignment API, UUID direct calculation/candidate/spec/report preview и fifth-ER graph относятся к следующим фазам. |
| Services/tasks | Lifecycle deep-copy переносит assignments/calculations/candidates/folders без spec; новые electrical/report tasks UUID-first v3. Все normal numeric writes, project duplicate batch и seeds readiness-gated через единый UUID adapter; task key binding учитывает principal/type/project/full payload/ER. Project CSV v2 строит sparse UUID graph. | Direct service internals остаются numeric; обычные electrical mutations всё ещё не делают spec stale; worker временно преобразует UUID в legacy slot. |
| Frontend | Zustand хранит `[1,2,3,4]` в `tlt-active-calculation-variant`; страницы показывают `СО1…СО4`. | Selected и backend active слиты; URL `?er=` и lifecycle отсутствуют. |
| Specification/report | Specification хранит UUID bridge/state, async report task принимает UUID; direct generation/preview/sync export остаются integer. Guest full запрещён; print отсутствует. | Нет explicit multi-select, full guest BOM и end-to-end UUID isolation. |
| CSV | Import v2 валидирует sparse slots, создаёт UUID variants/assignments, связывает rows и stale-ит legacy specs. Export v2 остаётся numeric. | Имена, active, assignments, fifth ER и sections не экспортируются; CSV v3 отложен до Phase 5. |
| Tests/docs | Alembic current 0028; migration/metadata 5, dynamic-ER integration 21, project I/O+Excel 46, calculations 73, calc/spec unit 114, task unit/integration 56+25, smoke 18/18, backend unit 1069/integration 421, DB invariants 28/0. | Frontend, dependency security и общий Alembic drift gates не green; backend/DB Phase 1 не доказывает PDF-BOM-01…07 или полный dynamic-ER UX. |

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
| `system_type` | `self_regulating/resistive/skin/mineral`, nullable до назначения; skin/mineral disabled. |
| `assignment_state` | `unassigned/ready/unsupported/stale/error`, отдельно от типа системы. |
| `requested_cable_type` | Сохраняет lossless legacy diagnostic/source value. |
| `object_version_snapshot` | Snapshot/version для stale detection. |
| diagnostics/timestamps | `error_code`, details, created/updated. |

Обязательны unique `(electrical_variant_id, object_id)` и проверка, что ЭР и
объект принадлежат одному project. Новый объект добавляется во все существующие
ЭР; unassign удаляет только scoped electrical graph и сохраняет heat data.

Intentional MEDIUM residual до Phase 3: successful normal legacy calculation
уже связан UUID, но pre-created assignment может остаться
`unassigned/system_type=null`. Assignment state не является authoritative для
consumers до атомарной calculation→assignment синхронизации Phase 3.

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

## API: реализованный lifecycle и будущие assignments

```text
GET    /api/v1/projects/{project_id}/electrical-readiness
POST   /api/v1/projects/{project_id}/electrical-variants/initialize
GET    /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/copy
PATCH  /api/v1/projects/{project_id}/electrical-variants/{id}
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/activate
DELETE /api/v1/projects/{project_id}/electrical-variants/{id}

# Phase 3, ещё не реализовано:

GET    /api/v1/projects/{project_id}/electrical-variants/{id}/assignments
PATCH  /api/v1/projects/{project_id}/electrical-variants/{id}/assignments
POST   /api/v1/projects/{project_id}/electrical-variants/{id}/unassign
```

Lifecycle реализован. Новые electrical/report task APIs принимают
`electrical_variant_id: UUID`; deprecated numeric selector разрешается в UUID и
не попадает в новый v3 payload. Direct calculation/query/candidate/folder/spec,
report preview и sync export всё ещё numeric. Все их normal write paths, а
также seeds, вызывают readiness-gated adapter до записи; fresh slot `4` создаёт
только `ЭР1 + ЭР4`. Целевой multi-operation получает уникальный список
`electrical_variant_ids` длиной 1…5 и валидирует весь список и ownership до
первой записи.

Mutation endpoints, specification generation/save и task enqueue используют
write/owner guard. PostgreSQL RLS в проекте нет, поэтому изоляция по-прежнему
полностью зависит от application-level ownership checks и их regression tests.
Candidate apply/delete дополнительно разделяют lifecycle project-row lock;
apply перечитывает candidate/mapping после lock, не пересоздаёт удалённый ЭР и
возвращает stable 404/409 при проигранной гонке.

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
- Import v2 реализован: валидирует slots `1…4` до замены guest project, создаёт
  active `ЭР1` плюс только занятые slots, complete assignments и явные UUID у
  calculations/specifications; legacy specs становятся stale/not-ready.
- Bulk v2 использует savepoint на project graph. Неизвестный electrical
  `object_key` пока silently пропускается и остаётся переходным риском.
- Export v2 остаётся numeric и не может losslessly перенести произвольные имена,
  active-state, assignments, fifth ER или sections.

## Expand/backfill/validate/contract

Проверенный working DB Alembic current: `0028` (`0026 → 0027 → 0028`).

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
7. **Частично:** lifecycle и background tasks UUID-first; frontend, direct
   services и CSV export остаются на compatibility layer.
8. **Pending:** удалить legacy columns/constraints только отдельной contract migration и
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

- до пятого ЭР legacy slot остаётся read-only derived mapping;
- перед feature activation и contract migration создаётся и проверяется backup;
- UUID — единственный writable source сразу после cutover;
- после появления пятого ЭР/assignments/sections lossless downgrade невозможен;
- после этой точки rollback — только restore к объявленному recovery point;
- притворно безопасный Alembic downgrade запрещён.

Стратегия утверждена PDL-ER-17.

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

Production Phase 1–3 разрешены. Семантика Phase 4 утверждена PDL-ER-18…25,
но реализация остаётся gated PDL-ER-15/18 до официального числового артефакта.

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

## Phase 1 final backend/DB evidence

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

## Отложено вне текущего scope

- Guest TTL/хранение 3 дня против текущих 20 минут.
- Повышение продуктового лимита с 50 до 500 объектов.
- Формулы MI/skin, `floor`, pump/platform/other.
- Пользовательский reorder ЭР.
- Полная cross-browser/performance сертификация PDF.

## Stop condition

Phase 1–3 можно выполнять вертикальными slices. Phase 4 и зависимую генерацию
реальных sections нельзя принимать или обходить defaults, пока не предоставлен
официальный источник производителя ТЛТ с `Lmax`, `Iдоп`, прямым `Iст.уд`,
напряжениями, температурами холодного пуска и правилом округления. Утверждение
PDL-ER-18…25 закрывает семантические вопросы, но не заменяет числовой источник.
