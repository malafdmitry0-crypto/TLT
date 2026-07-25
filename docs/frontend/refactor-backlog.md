# Frontend refactor backlog

**Статус:** EMPTY QUEUE (after P5–P9 corrective)

**Актуально на:** 2026-07-25  
**BASE (contested close):** `6a303f8`  
**Corrective branch:** `p59-corrective-closure`  
**Closure audit:** [p59-corrective-closure](../audit/2026-07-25-p59-corrective-closure/snapshot.md)

**Следующий незакрытый контракт:** —

Это **единственный** источник текущего `pending` для frontend. Одновременно
может существовать только одна ACTIVE frontend-очередь (когда pending есть).
Completed initiative plans не имеют права объявлять `COMPLETE`, пока backlog
содержит pending acceptance.

### P5–P9 corrective (review response) — done

EMPTY QUEUE after `6a303f8` was **premature**. Corrective on isolated
`p59-corrective-closure` worktree:

- [x] **P7-CORRECTIVE** — all **25** band files classified  
  [audit](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md)
- [x] **P8-CORRECTIVE** — pre-extract char baseline `b20f022` (400 LOC)  
  [audit](../audit/2026-07-25-p8-stateful-owner-char/snapshot.md)
- [x] **P9-CORRECTIVE** — owner **401→369** + `heatCalcExcelSelectionGestures.ts`  
  [audit](../audit/2026-07-25-p9-stateful-owner-extract/snapshot.md)
- [x] **P59-CORRECTIVE-CLOSE-01** — `test:agent-dod` **×2 PASS** (~151s / ~150s);
  ReportPage + cable-meta harden; populated desktop browser PASS;
  Excel UI **BLOCKED** by commercial flag (documented)

### Residual (not pending)

- Excel-selection live UI when `VITE_COMMERCIAL_FEATURES_ENABLED=true` on served build.
- Optional dual concurrent DoD re-proof.

Постоянные правила: [стандарт](./agent-development-standard.md).
Размер slice: [PR budget](./pr-budget.md).
Исполняемый шаблон: [мастер-промпт](./agent-refactor-prompt.md).
Viewport / UI Kit desktop contract: [viewport-policy](./viewport-policy.md),
[ui-kit](./ui-kit.md).
Point-in-time метрики: [P0 audit](../audit/2026-07-24-p0-doc-truth/snapshot.md),
[RISK pre-close incomplete](../audit/2026-07-24-frontend-risk-recovery/snapshot.md),
[RISK-CLOSE-PROOF final (BLOCKED historical)](../audit/2026-07-24-frontend-risk-recovery-final/snapshot.md),
[RISK-CLOSE-PROOF-01 PASS](../audit/2026-07-25-frontend-risk-recovery/snapshot.md),
[AF12 UI Kit agent-friendly PASS](../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md).
История AF9: [archive summary](./archive/agent-friendly-9-plan-historical.md).

## Правила очереди

- Один запуск выполняет один `pending` slice и одного owner.
- Пункт становится `done` только после focused proof (и DoD, если slice
  затрагивает runtime/tests/guardrails).
- Наличие patch или untracked baseline не меняет статус автоматически.
- Before-метрики пересчитываются из текущего дерева; audit snapshot и старые
  таблицы не являются разрешением повысить baseline.
- Новый пункт добавляется только по явной цели пользователя.
- Нормативные документы хранят правила; быстро устаревающие счётчики живут
  только в датированных `docs/audit/…`.
- Не объявляй инициативу завершённой, пока в этом файле есть pending.

## Мотивация risk recovery (не LOC, а связи)

Проблема **не** в размере файлов как таковом, а в том, что один orchestration
hook связывает много **независимых** подсистем и **неявных** правил. Typecheck
может быть зелёным при нарушении temporal/business invariant.

### 1. Крупные orchestration hooks

`useHeatCalcPageModel.ts` (было ~484 LOC / ~27 imports; после SESSION
composition root ~256 / 23) одновременно координировал:

- текущий проект и права пользователя;
- normal/Excel режим таблицы;
- pagination, фильтры и selection;
- локальные строки и несохранённые drafts;
- active Excel cell и диапазон выделения;
- настройки колонок;
- форму редактирования объекта;
- bulk actions;
- сохранение и расчёт теплопотерь;
- переход в Electrical;
- focus и workspace header.

`useElecCalcWorkspaceModel.tsx` (было ~422 / 27; после SESSION ~370 / 20) —
аналогично:

- проект и permissions;
- UUID электрического варианта + temporary legacy variant number;
- system view;
- pagination и cursor;
- column settings;
- основной data plane;
- candidate workflow;
- cable selection;
- модальные окна;
- batch jobs;
- presentation assembly.

Отдельные sub-hooks часто понятны. Сложность — в **связях** между ними.

### 2. Неявные бизнес-инварианты (types не выражают)

Агент обязан сохранять (characterization/DoD), даже если тип не ловит:

| Инвариант | Owner signal |
|---|---|
| После switch project A → B данные A не видны в B | Heat/Elec session |
| Вместе с проектом сбрасываются selection, drafts, active cell, pagination | table session |
| normal и Excel не используют несовместимое state | Heat table session |
| UUID — identity Electrical-варианта; number — только legacy adapter | Elec session |
| `systemView` стартует как `unassigned` | Elec session |
| После save инвалидируются правильные query keys | data/query |
| Background job продолжает track исходный project/variant | data/query + jobs |
| Manual name не перезаписывается автогенерацией | form/editing |
| Скрытые underground-поля не остаются в form payload | form projection |
| Commercial feature flag меняет data source, но не ломает fallback | Elec capabilities |

### 3. Почему агенту здесь сложнее

Локальный extract (например selection → new hook) может выглядеть корректным, но:

- state сбрасывается на каждом render **или** перестаёт сбрасываться на project switch;
- effect получает неполный dependency list;
- callback захватывает stale `projectId`;
- query invalidation использует уже новый project;
- active cell очищается, а selection range остаётся;
- normal mode green, Excel mode получает stale draft.

Ошибка часто видна только в **последовательности**:

```text
project A → load rows → edit → dirty draft → selection
  → switch to project B → refetch
```

Статический код плохо восстанавливает такие temporal links. Поэтому:

1. characterization before production change;
2. один vertical slice / один owner / один сценарий;
3. STOP вместо расширения scope при выходе за `ALLOWED_SCOPE`.

### 4. Почему vertical slice обязателен

```text
один owner
  → один пользовательский сценарий
  → characterization before
  → небольшой patch
  → focused proof
  → полный DoD
```

Задача не «отрефакторить Heat», а например:

> Вынести table session, сохранив project switch, normal/Excel selection и focus.

Нельзя одновременно «понимать» save, bulk, wizard, Electrical и CSS. Если fix
требует выйти за scope — **blocked**, не «ещё один файл».

### 5. Целевая декомпозиция orchestration

После RISK queue агент должен видеть **именованные блоки**, а не один state bag:

| Block | Responsibility | RISK slices |
|---|---|---|
| **session state** | project/auth, mode, systemView, variant identity, boot/focus | `RISK-HEAT-CHAR-01`, `RISK-HEAT-SESSION-01`, `RISK-ELEC-SESSION-01` |
| **data/query state** | query keys, invalidation, data plane, jobs | preserved by session slices; not reopened casually |
| **editing state** | drafts, selection, active cell, form sync, name rules | type/form slices after session |
| **presentation** | assembly props, chrome, grid adapters | type-event + prior AF9 contracts |
| **effects** | project-switch reset, focus, invalidation timing | characterization + session owners |

Целевой safety band для Heat/Electrical agent tasks: **~9/10** (с ~7–7.5),
если изменение затрагивает один-два контракта вместо всей page model.

### 6. Правила extract для orchestration

- Extract только **consumer-owned use case** с именем, inputs/outputs и одним
  side-effect owner.
- Запрещён god-helper и перенос сложности в общий `utils`.
- Parent orchestration остаётся thin composition root: wiring, не business bag.
- Любой extract session/table/editing обязан оставить green project-isolation
  characterization (Heat) и Electrical integration owners.
- Не менять query key shapes, UUID semantics, units, formulas «заодно».

## Выполненная residual queue (honest agent-friendly 9/10)

```text
P0-DOC-TRUTH-01
  → P1-GUARDRAIL-TRUTH-01
  → P2-ELEC-FEEDBACK-01
  → P3-ELEC-TYPE-BOUNDARY-01
  → P4-CONTEXT-REDUCTION-01
```

### Done

- [x] **P0-DOC-TRUTH-01 — единый достоверный источник состояния.**

  Один ACTIVE queue (`refactor-backlog.md`). AF9 plan сведён к historical
  pointer; dynamic metrics вынесены в
  [audit snapshot](../audit/2026-07-24-p0-doc-truth/snapshot.md). Убраны
  противоречие ACTIVE/COMPLETE и двойные «текущие» оценки. Stale completed
  checklist с таблицами «Сейчас» больше не живёт в нормативном пути.

- [x] **P1-GUARDRAIL-TRUTH-01 — guardrails должны измерять заявленное.**

  Ant bidirectional + stale fail; inline JSX AST + per-class counts;
  coordinate declaration matching (`grid-row`/`grid-column`/`order` only);
  fixtures for old bug → fix. Ant 112→90; coordinate 117→88.
  Inline total 517→520 is attribute-level remeasure (same-line multi-attr),
  not production growth; per-class gates prevent static↔runtime swaps.

- [x] **P2-ELEC-FEEDBACK-01 — стабильный Electrical feedback loop.**

  `elec-integration` `maxWorkers: 2`; shared reset; split slow
  results-settings into three owners. Proof: 57/57 ×3 (~69s), focused ≤21s,
  dual concurrent both green, full integration 168/168.

- [x] **P3-ELEC-TYPE-BOUNDARY-01 — убрать casts на presentation boundary.**

  16 `as never` removed from workspace boundary; real props contracts;
  type-escape baseline 27→11. Runtime behavior unchanged.

- [x] **P4-CONTEXT-REDUCTION-01 — уменьшить один высокорисковый контекст.**

  Owner `useElecCalcWorkspaceModel.tsx`: extract
  `useElecCalcWorkspaceColumnSettingsController` (column preferences / view /
  draft / params panel). Imports 32→27; LOC 463→422; import-context baseline
  shrink-only. Characterization + architecture green.

### RISK recovery — done (R1–R13)

Параллельная оркестрация worktree-агентов + merge owned-файлов в main.
Closure evidence:
[docs/audit/2026-07-24-frontend-risk-recovery/snapshot.md](../audit/2026-07-24-frontend-risk-recovery/snapshot.md).

| Slice | Результат |
|---|---|
| `RISK-HEAT-CHAR-01` | Heat project isolation characterization (normal+Excel) |
| `RISK-HEAT-SESSION-01` | `useHeatCalcTableSessionController` — parent 27→23 imp, 484→256 LOC |
| `RISK-ELEC-SESSION-01` | `useElecCalcWorkspaceSessionController` — parent 27→20 imp, 422→370 LOC |
| `RISK-TYPE-EVENT-CORE-01` | `HeatCalcContextMenuTrigger` contract |
| `RISK-TYPE-EVENT-CELL-01` | EditableTableCell без cast |
| `RISK-TYPE-EVENT-GLIDE-01` | Glide adapter → typed trigger |
| `RISK-TYPE-NAME-API-01` | `PipeNameFields` / `TankNameFields` |
| `RISK-TYPE-NAME-SYNC-01` | form sync без broad casts |
| `RISK-TYPE-FORM-PROJECTION-01` | allow-listed pipe/tank projection |
| `RISK-TYPE-WIZARD-REF-01` | WizardZoneBoundary div/section branches |
| `RISK-CSS-PROJECTS-01` | Projects static debt 24→0; inline 520→496 |
| `RISK-CSS-CLIMATE-DEAD-01` | climate coords removed; layout 88→72 |
| `RISK-CLOSE-01` | pre-close audit only — **not** final (see PROOF-01) |

### Общая приёмка (recompute + PROOF-01 PASS, 2026-07-25)

- [x] Production type escapes: `11 → 0`
- [x] Inline-style total: `520 → 496`
- [x] Static inline debt: `286 → 262`
- [x] `ProjectsPage.tsx`: `31 → 7`
- [x] Coordinate-layout total: `88 → 72`
- [x] `heatcalc-side-form-layout.css`: `51 → 35`
- [x] `useHeatCalcPageModel.ts`: imports `27 → 23`, LOC `484 → 256`
- [x] `useElecCalcWorkspaceModel.tsx`: imports `27 → 20`, LOC `422 → 370`
- [x] Ant primitive baseline не вырос (90)
- [x] Type/import/inline/coordinate baselines shrink-only
- [x] Focused RISK suites 97/97; architecture 40/40; typecheck green
- [x] Browser proof 1000/1280/1366/1440 (+1440×1000, 390×844) — Projects +
  Heat employee matrix green; evidence in
  [2026-07-25 snapshot](../audit/2026-07-25-frontend-risk-recovery/snapshot.md)
- [x] Full `npm run test:agent-dod` ×2 green (ReportPage flake fixed by
  `AF10-REPORT-FLAKE-01` prior to proof)
- [x] Honest final audit Status **PASS**
  ([closure snapshot](../audit/2026-07-25-frontend-risk-recovery/snapshot.md))

### Pending

_EMPTY QUEUE — no pending frontend acceptance contracts._

### Done — queue P5–P9 (test context + near-cap owners)

```text
P5-TEST-CONTEXT-INVENTORY-01
  → P6-TEST-CONTEXT-SPLIT-01
  → P7-STATEFUL-OWNER-INVENTORY-01
  → P8-STATEFUL-OWNER-CHAR-01
  → P9-STATEFUL-OWNER-EXTRACT-01
```

- [x] **P5-TEST-CONTEXT-INVENTORY-01** — tests >700 LOC classified; pick
  `HeatCalcNormalGlideGrid.test.tsx` (1473). Evidence:
  [p5 inventory](../audit/2026-07-25-p5-test-context-inventory/snapshot.md).

- [x] **P6-TEST-CONTEXT-SPLIT-01** — split into rendering / painting-edit /
  selection / headers-scroll + rows harness; 24/24 green.

- [x] **P7-STATEFUL-OWNER-INVENTORY-01** — 25 files in 400–448 LOC; pick
  `useHeatCalcExcelSelection`. Evidence:
  [p7 inventory](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md).

- [x] **P8-STATEFUL-OWNER-CHAR-01** — excel selection + pure nav characterization.
  Evidence: [p8 char](../audit/2026-07-25-p8-stateful-owner-char/snapshot.md).

- [x] **P9-STATEFUL-OWNER-EXTRACT-01** — `utils/heatCalcExcelSelectionNav.ts`
  pure nav sub-owner. Evidence:
  [p9 extract](../audit/2026-07-25-p9-stateful-owner-extract/snapshot.md).
  Full DoD green (~127 s).

### Residual risk (не pending; вне P5–P9)

Не блокируют EMPTY после P9 и **не** подмешиваются в P5–P9 scope:

| Тема | Статус | Note |
|---|---|---|
| UI Kit CSS ownership / desktop ≥1000 px | **closed** | [AF12 UI Kit close](../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md) |
| Dual concurrent `test:agent-dod` | residual | dual not sealed green |
| DoD wall median ≤120 s | residual | load-dependent ~120–154 s |
| Deep product browser states (non–UI-Kit) | residual | optional full matrix |
| `max-width: 768px` outside UI Kit | residual | UI Kit 768 already removed |

### Done (closure)

- [x] **RISK-CLOSE-PROOF-01 — honest DoD + browser closure evidence.**

  Docs/QA only. Double `test:agent-dod` green; live Projects/Heat screenshots
  for required viewports; no pageerrors / useForm warnings / unexpected failed
  network. Prerequisites on HEAD: ReportPage flake fix + useForm modal
  connection. See
  [PASS snapshot](../audit/2026-07-25-frontend-risk-recovery/snapshot.md).

- [x] **AF12-UIKIT-AGENT-FRIENDLY-01 — UI Kit CSS ownership (06A–06H).**

  Desktop-only contract; semantic media contracts; owner gate; remove UI Kit
  768 media; colocate Heat/primitives 1200; split shell/foundation/data;
  retire mixed `ui-kit.css` / `ui-kit-responsive.css`; browser runner;
  `test:agent-dod` green. Close evidence:
  [2026-07-25-af12-uikit-agent-friendly](../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md).

### Исторические контракт-блоки R1–R12

Ниже сохранены тексты заданий как evidence (не очередь). Не выполнять повторно
без новой user goal.

---

- [x] **RISK-HEAT-CHAR-01 — high-level project isolation для Heat.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-HEAT-CHAR-01
OWNER: heat
GOAL: Зафиксировать high-level контракт переключения проекта в HeatCalcPage до
  дальнейшего разделения orchestration context.
USER_VISIBLE_SUCCESS: После перехода project A → project B пользователь не
  видит строки, черновики, selection, active cell или pagination проекта A;
  запросы и дальнейшие действия относятся только к project B.
ALLOWED_SCOPE:
  - один новый behavior-oriented spec рядом с HeatCalcPage tests;
  - HeatCalcPage.test-utils.tsx, только если нужен reusable project-switch helper;
  - не более двух test/baseline файлов, production запрещён.
NON_GOALS:
  - исправление production-поведения;
  - snapshot большого DOM;
  - Electrical, API, query implementation или CSS.
INVARIANTS:
  - query keys и payload не меняются;
  - normal и Excel mode не смешивают project-scoped state;
  - тест проверяет observable behavior, а не внутренние имена hooks.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/HeatCalcPage.project-isolation.test.tsx
UI_STATES:
  - project A: загруженные rows, selection, dirty draft, non-default page;
  - rerender/switch на project B;
  - повторить контракт для normal и Excel mode.

Сначала докажи current intended behavior. Если обнаружена реальная утечка,
STOP: FILE / EVIDENCE / DECISION NEEDED; production fix в этот slice запрещён.
После focused proof запусти npm run test:agent-dod.
```

- [x] **RISK-HEAT-SESSION-01 — отделить Heat table session.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-HEAT-SESSION-01
OWNER: heat
GOAL: Извлечь из useHeatCalcPageModel owner-local
  useHeatCalcTableSessionController, который владеет table state, editing mode,
  Excel selection state и focus boundary.
USER_VISIBLE_SUCCESS: Heat workspace ведёт себя идентично до/после; parent
  orchestration содержит меньше независимых state clusters и imports.
ALLOWED_SCOPE:
  - useHeatCalcPageModel.ts;
  - один новый owner-local controller;
  - один focused test для controller или минимальное расширение существующего.
NON_GOALS:
  - изменение query/data model, object editor, preferences или toolbar;
  - новый Context/Provider;
  - переименование UI contracts и соседний cleanup.
INVARIANTS:
  - RISK-HEAT-CHAR-01 остаётся green;
  - project switch, normal/Excel mode, selection и focus не меняются;
  - controller возвращает именованные группы, не untyped mega-bag;
  - нет новых type escapes, effects или baseline growth.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/HeatCalcPage.project-isolation.test.tsx \
    src/__tests__/unit/pages/heatcalc/useHeatCalcTableState.test.tsx \
    src/__tests__/unit/pages/heatcalc/useHeatCalcExcelInteractionModel.test.tsx
UI_STATES: нет видимого изменения; browser proof не требуется.

Acceptance: imports parent ≤23, LOC parent ≤440, import-context baseline
уменьшён до факта. Затем npm run test:agent-dod.
```

- [x] **RISK-ELEC-SESSION-01 — отделить Electrical workspace session.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-ELEC-SESSION-01
OWNER: electrical
GOAL: Извлечь из useElecCalcWorkspaceModel owner-local session controller:
  project/auth capabilities, boot view, system view, table dragging,
  UUID/legacy variant identity и focus ref.
USER_VISIBLE_SUCCESS: Electrical startup, tabs, permissions, variants и table
  focus работают как раньше; основной model легче читать и менять.
ALLOWED_SCOPE:
  - useElecCalcWorkspaceModel.tsx;
  - один новый owner-local controller;
  - один focused controller test при необходимости.
NON_GOALS:
  - data plane, column settings, presentation map и query semantics;
  - ER UUID migration или удаление legacy adapter;
  - UI/CSS и соседний refactor.
INVARIANTS:
  - systemView стартует как unassigned;
  - UUID остаётся identity, legacy number только adapter;
  - permissions/commercial fallback и boot flags не меняются;
  - существующие Electrical characterization specs остаются green.
FOCUSED_PROOF:
  cd frontend && npx vitest run --project elec-integration \
    src/__tests__/integration/pages/electrical
UI_STATES: нет видимого изменения; browser proof не требуется.

Acceptance: imports parent ≤20, LOC parent ≤375, import-context baseline
уменьшён до факта. Затем npm run test:agent-dod.
```

- [x] **RISK-TYPE-EVENT-CORE-01 — structural context-menu contract.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-EVENT-CORE-01
OWNER: heat
GOAL: Ввести маленький owner-neutral HeatCalcContextMenuTrigger с полями,
  которые реально читает context-menu flow: clientX, clientY, preventDefault,
  stopPropagation. Перевести interaction model и table columns на него.
USER_VISIBLE_SUCCESS: Правый клик и pointer secondary action открывают меню в
  прежней позиции без React-event casts.
ALLOWED_SCOPE:
  - один type-only contract;
  - useHeatCalcExcelInteractionModel.ts;
  - useHeatCalcTableColumns.tsx;
  - их focused tests.
NON_GOALS:
  - изменение menu UI, selection semantics или Glide adapter;
  - общий event abstraction для всего приложения.
INVARIANTS:
  - MouseEvent и PointerEvent структурно совместимы без assertion;
  - keyboard/context-menu behavior не меняется;
  - type-escape baseline уменьшается минимум на 1.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/heatcalc/useHeatCalcExcelInteractionModel.test.tsx \
    src/__tests__/unit/hooks/useHeatCalcTableColumns.test.ts
UI_STATES: нет преднамеренного visual diff.

После focused proof обнови typeEscapeBaseline.json строго до факта и запусти
npm run test:agent-dod.
```

- [x] **RISK-TYPE-EVENT-CELL-01 — EditableTableCell без cast.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-EVENT-CELL-01
OWNER: heat
GOAL: Перевести EditableTableCell.onContextMenu на
  HeatCalcContextMenuTrigger и удалить PointerEvent → MouseEvent cast.
USER_VISIBLE_SUCCESS: Secondary click по inactive Excel cell по-прежнему
  фокусирует cell и открывает context menu; normal click/edit не меняются.
ALLOWED_SCOPE:
  - EditableTableCell.tsx;
  - ближайший focused component test.
NON_GOALS:
  - изменение edit activation, timing double-click или cell markup;
  - общий рефакторинг таблицы.
INVARIANTS:
  - preventDefault/stopPropagation и focus preventScroll сохранены;
  - normal и Excel mode различаются как раньше;
  - type-escape baseline уменьшается минимум на 1.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/components/HeatCalcExcelGrid.test.tsx
UI_STATES: normal cell; Excel inactive cell; right click; double click.

Обнови baseline только после green focused proof; затем npm run test:agent-dod.
```

- [x] **RISK-TYPE-EVENT-GLIDE-01 — Glide adapter без React-event fabrication.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-EVENT-GLIDE-01
OWNER: heat
GOAL: Пусть Glide secondary-action adapter создаёт типизированный
  HeatCalcContextMenuTrigger, а не притворяется полным React.MouseEvent.
USER_VISIBLE_SUCCESS: Контекстное меню Glide открывается в центре cell bounds
  и сохраняет прежние selection/secondary-action semantics.
ALLOWED_SCOPE:
  - HeatCalcGlideGrid.tsx;
  - контракт prop в непосредственном HeatCalcExcelGrid/ObjectsTableCard chain,
    только если этого требует typecheck;
  - существующий Glide adapter test.
NON_GOALS:
  - изменение grid library, rendering, row height или selection model.
INVARIANTS:
  - coordinates вычисляются по прежней формуле;
  - preventDefault проксируется;
  - type-escape baseline уменьшается минимум на 1.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/components/HeatCalcGlideGrid.adapter.test.tsx \
    src/__tests__/unit/components/HeatCalcGlideGrid.test.tsx
UI_STATES: Glide selected cell; secondary click; context menu anchor.

После baseline shrink запусти npm run test:agent-dod.
```

- [x] **RISK-TYPE-NAME-API-01 — честные inputs генераторов имён.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-NAME-API-01
OWNER: heat
GOAL: Сузить inputs generatePipeName/generateTankName до полей, которые они
  действительно читают, и убрать два broad cast из ConfirmStep.
USER_VISIBLE_SUCCESS: Preview автосгенерированного имени pipe/tank идентичен
  до/после для заполненных, частичных и пустых значений.
ALLOWED_SCOPE:
  - objectWizardUtils.ts type/signature section;
  - ConfirmStep.tsx;
  - objectWizardUtils/ConfirmStep focused tests.
NON_GOALS:
  - изменение формата имени, defaults, form-to-API conversion;
  - правка useObjectWizardFormSync в этом slice.
INVARIANTS:
  - snapshot/string expectations имён не ослабляются;
  - partial watched/form values принимаются без assertion;
  - type-escape baseline уменьшается на 2.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/utils/objectWizardUtils.test.ts \
    src/__tests__/unit/components/wizard
UI_STATES: нет visual diff.

Затем npm run test:agent-dod.
```

- [x] **RISK-TYPE-NAME-SYNC-01 — form sync без broad cast.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-NAME-SYNC-01
OWNER: heat
GOAL: Перевести useObjectWizardFormSync на суженные name-generator inputs и
  удалить оставшиеся два casts этого flow.
USER_VISIBLE_SUCCESS: Auto-name обновляется и сохраняет manual-name override
  по прежним правилам для pipe и tank.
ALLOWED_SCOPE:
  - useObjectWizardFormSync.ts;
  - его existing focused test.
NON_GOALS:
  - изменение sync timing, watched fields или form ownership;
  - CSS/ObjectWizard layout.
INVARIANTS:
  - manual name не перезаписывается;
  - programmatic sync не создаёт loop;
  - type-escape baseline уменьшается на 2.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/components/wizard/useObjectWizardFormSync.test.tsx
UI_STATES: pipe auto-name; tank auto-name; manual override.

Затем npm run test:agent-dod.
```

- [x] **RISK-TYPE-FORM-PROJECTION-01 — typed form projection/defaults.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-FORM-PROJECTION-01
OWNER: heat
GOAL: Добавить явную field-by-field pipe/tank projection из
  Record<string, unknown> и переписать defaults без indexed as never.
USER_VISIBLE_SUCCESS: Inline edit формирует те же API params; wizard defaults
  и round-trip остаются прежними для pipe/tank.
ALLOWED_SCOPE:
  - heatCalcInlineEdit.ts;
  - objectWizardUtils.ts;
  - их два focused test files.
NON_GOALS:
  - изменение API payload, sanitation, units или validation rules;
  - generic schema/parser framework.
INVARIANTS:
  - projection перечисляет допустимые поля явно;
  - unknown fields не попадают в params случайно;
  - existing conversion/default expectations не ослабляются;
  - type-escape baseline уменьшается на 3.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/utils/heatCalcInlineEdit.test.ts \
    src/__tests__/unit/utils/objectWizardUtils.test.ts
UI_STATES: нет visual diff.

Затем npm run test:agent-dod.
```

- [x] **RISK-TYPE-WIZARD-REF-01 — polymorphic boundary ref без `never`.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-TYPE-WIZARD-REF-01
OWNER: heat
GOAL: Типизировать div/section варианты WizardZoneBoundary без ref as never,
  используя discriminated props/явные JSX branches.
USER_VISIBLE_SUCCESS: DOM tags, data attributes, error isolation и focus/guard
  behavior полностью совпадают.
ALLOWED_SCOPE:
  - WizardZoneBoundary.tsx;
  - ближайший isolation test.
NON_GOALS:
  - добавление произвольных polymorphic tags;
  - изменение protected islands или DOM guard policy.
INVARIANTS:
  - div остаётся default, section используется существующими callers;
  - ref всегда HTMLElement-compatible;
  - последний production type escape удалён, baseline становится пустым/нулевым.
FOCUSED_PROOF:
  cd frontend && npm run test:wizard-isolation
UI_STATES: div boundary; section boundary; guard error.

Затем npm run test:agent-dod.
```

- [x] **RISK-CSS-PROJECTS-01 — убрать static inline debt ProjectsPage.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-CSS-PROJECTS-01
OWNER: projects
GOAL: Перенести все 24 occurrences класса static debt из ProjectsPage.tsx в
  существующий projects-page.css под owner root.
USER_VISIBLE_SUCCESS: Список/карточки проектов выглядят и работают идентично,
  но статические layout/color/spacing стили имеют именованные owner classes.
ALLOWED_SCOPE:
  - ProjectsPage.tsx;
  - projects-page.css;
  - ProjectsPage.test.tsx;
  - inlineStyleBaseline.json.
NON_GOALS:
  - перенос 1 runtime geometry и 6 third-party adapter occurrences;
  - redesign, UI-kit migration, Ant replacement или новые tokens;
  - изменение filters, mutations или navigation.
INVARIANTS:
  - использовать существующие tokens; raw colors и !important запрещены;
  - не переклассифицировать occurrences;
  - JSX порядок, a11y names и интеракции не меняются.
FOCUSED_PROOF:
  cd frontend && \
    npx vitest run src/__tests__/integration/pages/ProjectsPage.test.tsx && \
    npx vitest run \
      src/__tests__/unit/architecture/inlineStyleRatchet.architecture.test.ts
UI_STATES:
  - loading, query error, empty;
  - list and cards, filters open/applied;
  - create modal, bulk selection/actions;
  - widths 1000, 1280, 1440×900; keyboard/focus; console/network.

Acceptance: ProjectsPage `31→7`, total `520→496`, static `286→262` или ниже.
После browser proof запусти npm run test:agent-dod.
```

- [x] **RISK-CSS-CLIMATE-DEAD-01 — удалить dead climate coordinates.**

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-CSS-CLIMATE-DEAD-01
OWNER: heat
GOAL: Удалить legacy coordinate block
  .form-col-srs--climate из heatcalc-side-form-layout.css после доказательства,
  что production TSX его не создаёт и layout принадлежит
  HeatCalcObjectFieldsPanel/CompactFieldGrid.
USER_VISIBLE_SUCCESS: Wide/side Heat wizard не меняется визуально; dead
  field-by-field координаты больше не вводят агента в заблуждение.
ALLOWED_SCOPE:
  - heatcalc-side-form-layout.css;
  - coordinateLayoutBaseline.json;
  - существующий wizard/layout test только при необходимости.
NON_GOALS:
  - удаление .form-col-srs--primary;
  - изменение heat-object-fields.css, CompactFieldGrid или DOM;
  - визуальная перестройка формы.
INVARIANTS:
  - до patch выполнить rg по TS/TSX и приложить zero-match evidence;
  - удалить ровно 16 grid-column/grid-row declarations climate block;
  - не заменять их width/order/absolute-position hacks.
FOCUSED_PROOF:
  cd frontend && npm run test:wizard-isolation && \
    npx vitest run \
      src/__tests__/unit/architecture/coordinateLayoutRatchet.architecture.test.ts
UI_STATES:
  - pipe/tank;
  - wide/side;
  - above-ground/underground;
  - climate selected/manual, wind visible/hidden;
  - widths 1000, 1280, 1440×900; focus order; console/network.

Acceptance: coordinate total `88→72`, file `51→35` или ниже. После browser
proof запусти npm run test:agent-dod.
```

- [x] **RISK-CLOSE-01 — pre-close audit only (incomplete; not final).**

  Superseded by **RISK-CLOSE-PROOF-01**. Pre-close snapshot is historical.

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: RISK-CLOSE-01
OWNER: frontend-process
GOAL: Доказать closure всей RISK queue из текущего дерева и вернуть backlog в
  EMPTY QUEUE только при полном выполнении acceptance.
USER_VISIBLE_SUCCESS: Следующий агент получает один непротиворечивый источник
  правды с воспроизводимыми командами, метриками и остаточным риском.
ALLOWED_SCOPE:
  - новый датированный docs/audit/<date>-frontend-risk-recovery/snapshot.md;
  - этот backlog для отметок done/status/next;
  - никакого production patch.
NON_GOALS:
  - исправление найденных дефектов внутри audit slice;
  - изменение нормативных thresholds или baselines.
INVARIANTS:
  - любой незакрытый checkbox/красная команда/непроверенный UI state оставляет
    очередь ACTIVE и slice blocked;
  - audit фиксирует HEAD и git status;
  - historical AF9 evidence не переписывается.
FOCUSED_PROOF:
  cd frontend && npm run test:agent-gates && npm run test:agent-dod
UI_STATES:
  - повторить browser evidence Projects и Heat из двух CSS slices;
  - записать exact viewports, console и failed network results.

Пересчитай type escapes, import contexts, inline classes, coordinate layout и
Ant primitives. Только если все acceptance выполнены: отметь R1–R13 done,
поставь EMPTY QUEUE и next=—. Иначе STOP с FILE / EVIDENCE / DECISION NEEDED.
```

## AF9 — ранее выполненные slices (evidence only)

Эти пункты закрыты commit-ами ниже. Они **не** являются второй очередью и
**не** доказывают финальную приёмку 9/10, пока residual queue не пуста.

| Slice | Результат | Evidence |
|---|---|---|
| `AF9-ELEC-REG-01` | Electrical presentation contracts восстановлены | `93144a6` |
| `AF9-CI-01` / `AF9-CI-02` | DoD CI + demo user-flows | `82a3de9` |
| `AF9-TEST-HARNESS-01` | Electrical integration harness | `9dfa4b1` |
| `AF9-TEST-SPLIT-01` | Electrical integration по use cases | `46c24ca` |
| `AF9-TEST-NOISE-01` | ErrorBoundary console silence локализован | `7a50a4b` |
| `AF9-TYPE-*` / `AF9-ELEC-CONTRACT-01` | Explicit shell/presentation contracts | `9c3e179`, `8d3c2dd` |
| `AF9-CONTEXT-GATE-01` / `AF9-TYPE-GATE-01` | Import/type-escape ratchets | `644ef13` |
| `AF9-ARTIFACT-01` | `tsconfig.tsbuildinfo` untracked | `0439f35` |
| `AF9-INLINE-*` / `AF9-LAYOUT-*` / `AF9-UI-*` / `AF9-VIEWPORT-01` | Policy baselines + first migrations | `42ae0b2` |

## Closure rule

После закрытия последнего pending:

1. backlog получает статус **EMPTY QUEUE**, next=—;
2. AF9 / RISK / AF12 historical evidence остаётся в archive/audit (не вторая
   очередь);
3. новый point-in-time audit фиксирует HEAD, команды, среду и пересчитанные
   факты;
4. residual risk table может оставаться для честности, но **не** делает очередь
   ACTIVE;
5. новый `pending` — только по явной user goal (один owner, один slice).
