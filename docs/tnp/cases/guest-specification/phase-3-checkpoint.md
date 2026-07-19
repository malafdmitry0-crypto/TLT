# Phase 3 checkpoint — authoritative assignments ЭР

- Ветка: `feature/tnp-dynamic-electrical-variants`
- Product decisions: PDL-ER-01…25, утверждены 18.07.2026
- Checkpoint обновлён: 18.07.2026
- Статус: **PASS — root backend/frontend/browser/DB gate завершён**

Этот checkpoint фиксирует завершённую границу Phase 3. Он не повышает статус
общего PDF/DoD или product release до PASS: Phase 4 остаётся blocked, Phase 5
не начата, а общие repository gates имеют отдельные известные blockers.
Phase 1 и Phase 2 checkpoints остаются историческими и не переписываются.

## Scope и источник контракта

Phase 3 закрывает прежнее расхождение «успешный exact-UUID calculation, но
assignment остаётся `unassigned/system_type=null`». Источник решений:

- PDL-ER-10 — действующий resistive flow сохраняется;
- PDL-ER-11 — `system_type` и `assignment_state` независимы;
- PDL-ER-12 — initialization readiness-gated, без guessed electrical result;
- PDF-ER-02/06/07/10/15/16 — распределение, состояния, диагностика, unassign и
  stale propagation;
- Phase 4 остаётся остановленной PDL-ER-15/18 до официального числового
  section-каталога.

Поддержанные типы assignment: `self_regulating` и `resistive`.
`self_regulating_tt` нормализуется в `self_regulating`,
`single_core/three_core` — в `resistive`. `skin/mineral` видны в UI, но
не выбираются как новый target. Их tabs остаются доступны для просмотра
migrated unsupported rows и confirmed unassign; полностью disabled вкладки
запрещены, потому что оставляют исторические данные stranded. Тип объекта MVP
не расширен: `pipe` и `tank`; «Бочка» — пользовательское название ёмкости, не
новый backend enum.

## Доказанный implementation contract

### DB и migration 0029

- `electrical_variant_objects.version` — отдельная optimistic revision, не
  alias `project_objects.version` и не `object_version_snapshot`.
- Reconciliation использует только exact ненулевой `electrical_variant_id` и
  проецирует system/state независимо. Error/stale/unsupported никогда не
  становятся `ready`.
- CHECK: `unassigned → system_type IS NULL`, `ready → supported system`,
  `skin/mineral → unsupported`, `version >= 1`.
- Lookup index: `(electrical_variant_id, system_type, assignment_state)`.
- Downgrade 0029 удаляет только Phase 3 version/check/index; one-way UUID
  contract removal по-прежнему относится к отдельной поздней фазе.

### Assignment API и транзакции

```text
GET   /api/v1/projects/{project_id}/electrical-variants/{er_id}/assignments
PATCH /api/v1/projects/{project_id}/electrical-variants/{er_id}/assignments
POST  /api/v1/projects/{project_id}/electrical-variants/{er_id}/unassign
```

- GET имеет view/state filters, pagination, counts и возвращает object snapshot,
  отдельные system/state/diagnostics и `version`.
- PATCH принимает 1…500 `{object_id, expected_version}` и выполняет весь список
  атомарно. Первое поддержанное назначение получает `stale` и
  `ELECTRICAL_CALCULATION_REQUIRED`, а не fake-ready.
- Same-system PATCH идемпотентен: нет version/audit bump.
- Reassign `self_regulating ↔ resistive` требует confirmed unassign; stale
  revision возвращает stable `409 ELECTRICAL_ASSIGNMENT_VERSION_CONFLICT`.
- `skin/mineral` rejected как PATCH target, но их migrated rows доступны через
  GET и confirmed unassign.
- POST unassign требует `confirm=true`, сохраняет assignment parent как
  `unassigned/system_type=null` и удаляет только exact
  `project + ER UUID + object` calculations/candidates/folders/folder items.
  Heat object/results и другие ЭР сохраняются; specification только target ЭР
  помечается stale.
- NULL/mismatched downstream UUID, cross-ER folder item и пересекающаяся active
  heat/electrical/report task блокируются до mutation. Cancel-requested, но ещё
  active task также блокирует.
- Если `unassigned` assignment содержит exact-UUID legacy graph, PATCH assign
  возвращает `409 ELECTRICAL_ASSIGNMENT_CLEANUP_REQUIRED`. UI показывает
  отдельный handshake, пользователь подтверждает exact scoped cleanup с
  сохранением heat и затем явно повторяет назначение. Corrupt NULL/mismatch
  graph не очищается этим путём.
- Lock order: project row → project objects → assignments. Concurrent mutations
  одной revision имеют одного winner; второй получает conflict.

### Calculation/candidate/task integration

- Direct/batch/job/copy calculation валидирует compatible assignment exact UUID
  до upsert; runtime никогда не auto-assign объект.
- Calculation result атомарно синхронизирует только target assignment в
  `ready/error/stale/unsupported`, обновляет requested cable type, diagnostics,
  object snapshot и revision.
- Candidate/folder create/apply и folder-item equality требуют live compatible
  exact-UUID assignment; retained unassigned parent не считается разрешением.
- Candidate create с requested `skin/mineral` даёт
  `409 ELECTRICAL_SYSTEM_UNSUPPORTED` до dedupe/upsert и не создаёт
  диагностическую строку.
- `scope=all` для batch/job означает все compatible assignments выбранного ЭР.
  Explicit несовместимые object IDs дают stable 409, а не silent skip.
- Project duplicate после heat/readiness создаёт `ЭР1` и unassigned matrix, но
  не угадывает system и не запускает electrical batch.
- Explicit legacy calculation-copy сначала staging target assignment intent из
  source. По PDL-ER-13 legacy и UUID lifecycle copy не копируют и не
  регенерируют specification: target `not_generated`; explicit regeneration
  request отклоняется fail-closed до mutation.
- Object/heat changes сериализованы project lock и stale-ят соответствующие
  assignments; assignment/electrical/candidate apply-unapply stale-ит exact-ER spec.

### Frontend и query projection

- В выбранном именованном ЭР доступна панель
  `Нераспределённые / Самрег / Резистив / Скин / Минеральный`.
  Unsupported tabs browsable для migrated rows/unassign; disabled только
  назначение объектов в эти системы.
- Mutation отправляет exact project/ER UUID и текущие assignment revisions;
  conflict очищает stale selection и refetch-ит authoritative state.
- Confirm-unassign явно перечисляет удаляемый электрический graph и сообщает,
  что heat data сохраняются.
- `CLEANUP_REQUIRED` имеет отдельный warning/action; очистка не маскируется под
  успешный assign и не выполняется без явного подтверждения.
- `POST /calc/electrical/query` возвращает bounded projection текущей страницы:
  `{object_id, system_type|null, assignment_state, version}`. Backend возвращает
  явный `null`; optional frontend handling остаётся defensive compatibility.
- Missing/unassigned/unsupported projection fail-closed блокирует row select,
  manual/candidate flow, inline edit и recalculation. Mismatch текущего
  saved/draft cable type сохраняет strict row/batch/inline/selected-recalculation
  guard, но не блокирует `Выбор`/`Подбор` у supported assignment.
- Fresh `resistive` assignment без сохранённого расчёта или с типом другой
  системы не наследует self-reg default: модалка выбирает `single_core` и
  показывает только resistive-типы (`single_core`/`three_core`, если доступны).
- Пятый ЭР поддерживает assignment UI/API по UUID, но legacy calculation,
  specification и report data plane остаются fail-closed до Phase 5.

## Evidence chain

`PDL/PDF → migration/model/service/API → query projection/frontend panel →
focused tests → root browser/DB gate`

### Уже подтверждено

| Evidence | Статус |
|---|---|
| Assignment и связанные backend suites | **249/249 PASS, agent; 167/167 relevant integration suites PASS, root** |
| Migration 0029 PostgreSQL suite | **2/2 PASS, root** |
| Phase 3 focused frontend (`ElecCalcPage`, assignment API/panel/scope model, client/candidate contracts) | **6 files / 95 tests PASS, root** |
| Full frontend Vitest | **1052 passed, 1 failed, root**; единственный failure — прежний HeatCalc accessible separator вне Phase 3 diff |

### Root final gate

| Проверка | Результат |
|---|---|
| Full relevant backend calculation/candidate/job suites | **PASS: 167/167 root; 249/249 expanded agent suite** |
| Alembic upgrade/current/downgrade + DB invariants | **PASS:** working stack upgraded `0028 → 0029 (head)`; migration test 2/2; post-UI `db-invariants` 28/28 |
| Backend query-count / 500×5 assignment projection evidence | **PASS:** query-count suite входит в root 167/167; expanded backend suite покрывает bounded projection |
| Frontend typecheck/build | **PASS:** `tsc --noEmit`; production `tsc -b && vite build` |
| Desktop `1440×1000` before/after + geometry | **PASS:** `evidence/phase-3-assignments/before-five-er-desktop.*`, `after-er5-desktop.*` |
| Mobile `390×844` before/after + geometry | **PASS:** `evidence/phase-3-assignments/before-five-er-mobile.*`, `after-er5-mobile.*`; local tab/table overflow expected, page overflow отсутствует |
| Live assign/unassign/reload, console/network exact UUID | **PASS:** exact UUID PATCH/POST 200, persisted reload, heat count preserved; final console 0 errors / 0 warnings |
| `scripts/codex-functional-audit.sh docs` после sync | **PASS:** docs up to date; manifest facts ok |

UI evidence index:
`docs/tnp/cases/guest-specification/evidence/phase-3-assignments/README.md`.
Проверены screenshots, clipping/overflow/overlap/readability/disabled controls,
exact UUID network, persisted reload и post-scenario DB invariants. Первичная
ручная проверка также обнаружила static Ant Design `message`/`Modal`
console errors; панель переведена на context-bound API, повторный полный
assign/unassign flow дал **0 errors, 0 warnings**.

## Реализация и тесты

- Backend: `backend/app/api/v1/electrical_variants.py`,
  `backend/app/schemas/electrical_assignment.py`,
  `backend/app/services/electrical_assignment_service.py`,
  `backend/app/services/{calculation,electrical_query,electrical_variant,specification,task}_service.py`,
  `backend/alembic/versions/0029_electrical_assignment_versions.py`.
- Frontend: `frontend/src/pages/electrical/ElectricalAssignmentPanel.tsx`,
  `frontend/src/pages/electrical/elecCalcAssignmentScopeModel.ts`,
  `frontend/src/pages/ElecCalcPage.tsx`,
  `frontend/src/api/electricalVariants.ts`.
- Tests: `backend/app/tests/integration/api/test_electrical_assignments.py`,
  `backend/app/tests/integration/db/test_electrical_assignment_migration.py`,
  `backend/app/tests/integration/db/test_query_counts.py`, focused frontend
  assignment tests и `ElecCalcPage.test.tsx`. Семантический regression закреплён
  тестом `elecCalcAssignmentScopeModel.test.ts` «открывает manual/candidate flow
  для свежего resistive assignment и выбирает безопасный тип» и assignment-scope
  сценарием `ElecCalcPage.test.tsx`.

## Остаточная граница и blocker

- Phase 4 **BLOCKED PDL-ER-15/18**: нет официального numeric artifact с
  `Lmax`, `Iдоп`, прямым `Iст.уд`, voltage/temperature rows и source-defined
  rounding. Запрещены defaults, nearest fallback и фиктивные sections.
- Phase 5 pending: full UUID-only specification/report/CSV v3, explicit
  multi-ЭР generation, guest full BOM и browser print.
- Legacy `variant_number=1…4` остаётся compatibility metadata; downstream UUID
  columns не переводятся в contract NOT NULL этой фазой.
- Общий product release остаётся blocked известным full-frontend separator
  failure, dependency security findings и общим Alembic metadata drift вне
  dynamic-ER diff.
