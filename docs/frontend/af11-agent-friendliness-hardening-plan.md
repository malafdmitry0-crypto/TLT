# AF11 — practical agent-friendliness hardening

**Статус:** PROPOSED runbook (execution PARTIAL PASS — see audit)  
**Не ACTIVE queue** — pending только через [refactor-backlog.md](./refactor-backlog.md)

**Актуально на:** 2026-07-25  
**Audit:** [../audit/2026-07-25-af11-agent-friendliness/snapshot.md](../audit/2026-07-25-af11-agent-friendliness/snapshot.md)

**Владелец программы:** frontend-process

Этот документ устраняет четыре практических остатка:

1. крупные production-контексты, которые формально помещаются под общий
   `500 LOC`, но всё ещё связывают несколько ответственностей;
2. противоречивые статусы AF10-документов;
3. шумный и более медленный, чем необходимо, canonical feedback loop;
4. отсутствие заново запечатанной state-driven browser/Kontur матрицы на
   финальном production HEAD.

Документ не является второй очередью. Любой prompt ниже исполняется только по
явной команде пользователя или после переноса **одного** контракта в
[`refactor-backlog.md`](./refactor-backlog.md).

Нормативы:

- [`frontend/AGENTS.md`](../../frontend/AGENTS.md);
- [стандарт разработки](./agent-development-standard.md);
- [мастер-промпт](./agent-refactor-prompt.md);
- [PR budget](./pr-budget.md);
- [viewport policy](./viewport-policy.md).

## 1. Planning evidence, не baseline

Во время подготовки runbook на `HEAD=faa6aab`:

- корректный пересчёт дал **14**, а не 15 production-файлов в диапазоне
  `450–498 LOC`;
- `npm run test:agent-dod` прошёл: 1135 unit, 168 integration, production
  build;
- прогон занял около 2,5 минут и напечатал ожидаемые jsdom/React stack traces;
- ESLint завершился без errors, но с одной Fast Refresh warning;
- audit объявляет `9.1/10 PASS`, при этом AF10 execution board всё ещё имеет
  `ACTIVE` и незакрытые пункты;
- финальный audit прямо говорит, что полный browser/Kontur matrix на этом
  сеансе не resealed.

Эти числа не являются нормативными. `AF11-CONTEXT-INVENTORY-01` и
`AF11-FEEDBACK-PROFILE-01` обязаны пересчитать факты из своего чистого HEAD и
сохранить их в новом датированном audit snapshot.

## 2. Definition of Done

AF11 закрыт только одновременно при выполнении всех условий:

### Context

- массовой цели «нет файлов `>=450 LOC`» нет: `500 LOC` остаётся единственным
  жёстким капом; файлы из inventory рефакторятся только при касании
  (refactor-on-touch), по одному seam за slice;
- изменённые workflow/hooks, UI components и pure models укладываются в
  соответствующие caps из стандарта, а не останавливаются на `449`;
- каждый extract имеет use-case имя, явные inputs/outputs, одного владельца
  effects и focused behavior proof;
- flat mega-return не заменён другим untyped state bag;
- query keys, invalidation, cancellation, project/variant identity, formulas,
  units, routes и UX не изменены;
- import/type/dependency/CSS baselines не выросли.

### Documentation truth

- только `refactor-backlog.md` может маршрутизировать `pending`;
- AF10 execution/residual documents явно `HISTORICAL` или `PROPOSED`, но не
  `ACTIVE`;
- старые audit snapshots не переписаны;
- нет двух документов, одновременно называющих себя текущей оценкой или
  очередью.

### Feedback loop

- `npm run lint` выдаёт `0 errors / 0 warnings`;
- intentional ErrorBoundary/isolation tests не печатают
  `Error: Uncaught [...]`, `render exploded`, `island boom` или ожидаемый
  `WizardIsolationError` в stdout/stderr;
- ошибки по-прежнему реально бросаются и проверяются assertions — их нельзя
  «починить» удалением negative-path тестов;
- canonical `test:agent-dod` сохраняет typecheck, lint, architecture/CSS,
  полный unit, полный integration и production build;
- median wall time на той же машине уменьшается минимум на 20% либо становится
  `<=120 s`; baseline и after измеряются тремя тёплыми прогонами;
- три последовательных DoD и один dual-concurrent stress proof зелёные.

### Browser/Kontur

- новый dated audit относится к одному чистому production HEAD;
- Projects, Heat, Electrical, Specification и Reports проверены по состояниям,
  не только по маршрутам;
- для каждого обязательного состояния есть URL, action path, viewport,
  screenshot, geometry/overflow, console и failed-network result;
- обязательные TLT desktop viewports из [viewport policy](./viewport-policy.md)
  пройдены; mobile `390×844` не входит в acceptance (desktop-only контракт),
  проверяется только в явном responsive slice;
- отсутствующий обязательный state/viewpoint означает `BLOCKED`, а не
  `optional`;
- итоговый audit не переиспользует screenshots старого HEAD.

## 3. Порядок исполнения

```text
AF11-DOC-TRUTH-01
  ├─ AF11-CONTEXT-INVENTORY-01
  │    └─ AF11-SPEC-CHAR-01
  │         ├─ AF11-SPEC-QUERY-SESSION-01
  │         ├─ AF11-SPEC-ITEMS-01
  │         ├─ AF11-SPEC-GENERATION-01
  │         └─ AF11-CONTEXT-NEXT-* (повторять по inventory)
  └─ AF11-FEEDBACK-PROFILE-01
       ├─ AF11-LINT-FAST-REFRESH-01
       ├─ AF11-TEST-NOISE-BOUNDARY-01
       ├─ AF11-TEST-NOISE-WIZARD-01
       └─ AF11-DOD-WALLTIME-01

AF11-BROWSER-CONTRACT-01
  └─ AF11-BROWSER-{PROJECTS|HEAT|ELEC|SPEC|REPORTS}-01
       └─ AF11-BROWSER-FINAL-SEAL-01

всё выше
  └─ AF11-FINAL-AUDIT-01
```

Ветки показывают зависимости, а не разрешение писать один baseline или один
owner параллельно. В одном worktree одновременно исполняется один slice.

## 4. Context-reduction routing

Первый inventory должен проверить как минимум следующие текущие кандидаты.
Порядок после `useSpecificationPageModel` определяется связностью, churn и
неявными invariants, а не только LOC.

| Candidate | Owner | Первый проверяемый seam |
|---|---|---|
| `pages/specification/useSpecificationPageModel.ts` | specification | query/session, manual items и generation workflows |
| `pages/electrical/useElecCalcElectricalColumnRenderers.tsx` | electrical | независимые renderer families и recalculation presentation |
| `pages/heatcalc/useHeatCalcObjectsDataModel.ts` | heat | query/load session отдельно от visible-row/column projection |
| `utils/heatCalcInlineEdit.ts` | heat | draft state отдельно от pipe/tank form projection |
| `hooks/useHeatCalcTableColumns.tsx` | heat | column assembly отдельно от cell render/event adapters |
| `components/ui-kit/UiPrimitives.tsx` | ui | primitive families в owner-local files при неизменном public barrel |
| `hooks/useHeatCalcNormalGlideController.ts` | heat | editor/filter/resize interaction owners |
| `hooks/useElectricalVariantCommandsController.ts` | electrical | mutation transport/reconciliation отдельно от user commands |
| `pages/heatcalc/useHeatCalcInteractionController.ts` | heat | уже именованные workspace/table/editor/focus/resize slices |
| `utils/heatCalcPageUtils.ts` | heat | query/filter model отдельно от display formatters |
| `utils/objectWizardFormMappers.ts` | heat | form→API отдельно от API→form |
| `components/heatcalc/HeatCalcGlideGrid.tsx` | heat | pure Glide adapters отдельно от React interaction shell |
| `components/electrical/ElectricalCandidateGlideGrid.tsx` | electrical | filter/action overlay state отдельно от grid adapter |
| `components/electrical/cablePickerCharacteristicsModel.ts` | electrical | object fields отдельно от cable fields/formatters |

Нельзя делать массовый split всех файлов одним commit. Один запуск выбирает
один consumer-owned seam и доказывает его поведение.

## 5. Browser state routing

TLT-specific matrix дополняет общие dimensions Kontur UI quality.

| Owner | Обязательные состояния |
|---|---|
| Projects | loading, handled error+retry, empty, populated, filters, create pending/modal, bulk selection/actions, long names, permission variants |
| Heat | no project, loading, handled error+retry, empty, populated normal, populated Excel, A→B project switch, dirty draft/selection reset, pipe/tank wizard, above/underground, climate/wind, wide/side form |
| Electrical | no variant, readiness loading/error/not-ready/ready, create/rename/copy/delete, selected UUID vs legacy number, unassigned/system views, populated grid, candidate flow, settings/modal, batch action, permission variants |
| Specification | no project/variant, loading, handled error+retry, empty, generated full, partial/preflight, stale, settings/defaults, manual add/delete, permission variants |
| Reports | loading, handled error+retry, empty, populated, wizard, preview, long content, export/action disabled and success states |

Viewport application:

- каждый selected state: `1440×900` primary плюс один релевантный крайний
  desktop-профиль;
- app shell/modal/overflow: `1000×768`, `1440×900`, `1920×1080`;
- Heat/Electrical/Specification dense workflow:
  `1000×768`, `1280×800`, `1366×768`, `1440×900`;
- wide/max-width: добавить `1920×1080`;
- mobile viewports не запускаются и не входят в acceptance: контракт TLT
  desktop-only ([viewport policy](./viewport-policy.md)); `390×844` допустим
  только в отдельном явно заказанном responsive slice.

## 6. Исполняемые промпты

### Prompt 1 — убрать противоречивую очередь

```text
Работай из корня TLT. Выполни один docs-only slice.

SLICE_ID: AF11-DOC-TRUTH-01
OWNER: docs
GOAL: оставить один источник pending и убрать противоречие PASS vs ACTIVE.
USER_VISIBLE_SUCCESS: следующий агент однозначно понимает, что текущий pending
  маршрутизирует только docs/frontend/refactor-backlog.md.
ALLOWED_SCOPE:
  - docs/frontend/af10-parallel-queue.md;
  - docs/frontend/af10-residual-close-plan.md;
  - docs/frontend/meaningful-css-plan.md;
  - docs/frontend/css-strategy.md.
NON_GOALS:
  - изменение старых docs/audit snapshots;
  - новый production/refactor slice;
  - добавление AF11 prompts в ACTIVE backlog.
INVARIANTS:
  - af10-parallel-queue и residual plan становятся HISTORICAL/CLOSED pointers;
  - meaningful-css-plan остаётся PROPOSED runbook без routing authority;
  - css-strategy описывает установленный gate, а не незавершённую очередь;
  - факты финального AF10 audit не переписываются.
FOCUSED_PROOF:
  - git diff --check;
  - markdown link scan для изменённых файлов;
  - rg по "ACTIVE queue|ACTIVE execution board|final audit.*pending" в
    docs/frontend и ручная классификация каждого match;
  - доказать, что только refactor-backlog.md задаёт pending.
UI_STATES: нет.

Не запускай production patch. Верни exact before→after статусы документов.
```

### Prompt 2 — честный inventory крупных контекстов

```text
Работай из корня TLT. Выполни один read-only audit slice.

SLICE_ID: AF11-CONTEXT-INVENTORY-01
OWNER: architecture
GOAL: пересчитать крупные production-контексты и ранжировать их по реальному
  coupling/risk, а не только LOC.
ALLOWED_SCOPE:
  - новый docs/audit/<date>-af11-context-inventory/snapshot.md.
NON_GOALS:
  - production/test patch;
  - повышение architecture baseline;
  - массовый план "split every file" без use-case seams.
INVARIANTS:
  - snapshot содержит HEAD, UTC, environment и git status;
  - пересчитывает все production TS/TSX >=450 LOC, imports, React hooks,
    top-level exports, callers и ближайшие tests;
  - для каждого кандидата фиксирует owner, независимые responsibilities,
    temporal/business invariants, suggested first seam и focused proof;
  - отдельно отмечает cohesive registry/model, где LOC не доказывает coupling;
  - приоритет: multi-effect orchestration, затем event/grid adapters, затем
    pure mapping/registry.
FOCUSED_PROOF:
  - npm run test:architecture;
  - git diff --check;
  - повторный scan должен воспроизводить таблицу snapshot.
UI_STATES: нет.

Не копируй старые числа. Если текущий count отличается от planning seed,
запиши только новый факт.
```

### Prompt 3 — profile canonical feedback loop

```text
Работай из корня TLT. Выполни один read-only tooling audit.

SLICE_ID: AF11-FEEDBACK-PROFILE-01
OWNER: tooling
GOAL: получить воспроизводимый baseline wall time, flakes и output noise.
ALLOWED_SCOPE:
  - новый docs/audit/<date>-af11-feedback-profile/snapshot.md;
  - временные logs только в mktemp directory, не в git.
NON_GOALS:
  - изменение package scripts, tests или Vitest config;
  - объявление оптимизации без after proof.
INVARIANTS:
  - clean HEAD, warm node_modules;
  - три последовательных npm run test:agent-dod;
  - для каждого run: gate/unit/integration/build duration и exit code;
  - min/median/max wall time;
  - count и origin строк ESLint warning, Error: Uncaught, render exploded,
    island boom, WizardIsolationError;
  - test counts и inclusion не меняются.
FOCUSED_PROOF:
  - все три DoD green либо snapshot BLOCKED с точным failing command;
  - git diff --check.
UI_STATES: нет.

Не скрывай stderr фильтром. Сохрани counts, но не коммить полные шумные logs с
machine paths.
```

### Prompt 4 — убрать Fast Refresh warning

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-LINT-FAST-REFRESH-01
OWNER: electrical
GOAL: убрать единственную react-refresh/only-export-components warning без
  изменения Electrical variant UX.
USER_VISIBLE_SUCCESS: поведение loading/readiness/retry/create/select/delete
  вариантов идентично; lint полностью тихий.
ALLOWED_SCOPE:
  - ElectricalVariantTabs.tsx;
  - ElectricalVariantTabsEmptyState.tsx;
  - один owner-local async helper module;
  - ElectricalVariantTabs.test.tsx.
NON_GOALS:
  - variant workflow refactor;
  - UI/CSS/копирайт;
  - eslint override или disable.
INVARIANTS:
  - вынести non-component ignoreHandledError из component module;
  - Promise rejection остаётся handled так же;
  - accessible names, pending/disabled states и API calls не меняются.
FOCUSED_PROOF:
  cd frontend &&
  npx vitest run src/__tests__/unit/pages/electrical/ElectricalVariantTabs.test.tsx &&
  npm run lint &&
  npm run typecheck
UI_STATES: loading, readiness error/retry, not-ready, create pending, populated.

После focused proof запусти npm run test:agent-dod. Acceptance: lint 0/0.
```

### Prompt 5 — локально заглушить expected ErrorBoundary noise

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-TEST-NOISE-BOUNDARY-01
OWNER: tooling
GOAL: intentional ErrorBoundary throws остаются проверенными, но jsdom/React
  expected noise не уходит в stdout/stderr.
ALLOWED_SCOPE:
  - один test-only helper в src/__tests__/utils;
  - ErrorBoundary.test.tsx.
NON_GOALS:
  - global console.error suppression;
  - production ErrorBoundary changes;
  - удаление throw/assertions.
INVARIANTS:
  - helper ставит и гарантированно восстанавливает только test-local
    console.error и cancelable window error handling;
  - unexpected console errors вне explicit scope продолжают печататься;
  - telemetry, fallback и retry assertions остаются прежними.
FOCUSED_PROOF:
  - запустить focused spec с stdout+stderr в temporary log;
  - spec green;
  - log не содержит "Error: Uncaught" и "render exploded";
  - добавить focused test helper cleanup, если это можно доказать без
    глобального suppression.
UI_STATES: нет.

Затем npm run test:unit. Любой неожиданный error output означает BLOCKED.
```

### Prompt 6 — убрать Wizard isolation noise

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-TEST-NOISE-WIZARD-01
OWNER: tooling
GOAL: переиспользовать scoped expected-error helper для WizardZoneBoundary
  negative paths и убрать оставшийся ожидаемый stack noise.
ALLOWED_SCOPE:
  - существующий test-only expected-error helper;
  - WizardZoneBoundary.test.tsx.
NON_GOALS:
  - production WizardZoneBoundary patch;
  - global console/window suppression;
  - ослабление DOM_FOREIGN_ISLAND assertions.
INVARIANTS:
  - island boom и DOM_FOREIGN_ISLAND реально возникают внутри теста;
  - fallback/error code/fix guidance продолжают проверяться;
  - helper cleanup доказывается после каждого test.
FOCUSED_PROOF:
  - focused spec green с captured stdout/stderr;
  - log не содержит "Error: Uncaught", "island boom" или ожидаемый
    WizardIsolationError stack;
  - npm run test:wizard-isolation;
  - npm run test:unit с zero expected-error noise.
UI_STATES: нет.

После этого запусти npm run test:agent-dod.
```

### Prompt 7 — сократить DoD wall time без потери покрытия

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-DOD-WALLTIME-01
OWNER: tooling
GOAL: уменьшить canonical test:agent-dod wall time минимум на 20% или до
  <=120 s на той же машине без исключения тестов и без снижения стабильности.
ALLOWED_SCOPE:
  - frontend/package.json;
  - максимум один frontend/scripts/ agent-dod orchestrator;
  - vite.config.ts только при доказанной harness-причине;
  - один tooling test при необходимости;
  - новый dated after snapshot.
NON_GOALS:
  - удаление/skip тестов;
  - уменьшение assertions/timeouts ради зелёного результата;
  - ослабление maxWorkers/isolation Electrical без отдельного evidence;
  - превращение focused gate в замену full DoD.
INVARIANTS:
  - canonical sequence сохраняет gates до acceptance;
  - полный unit и integration могут исполняться конкурентно только после
    clean experiment;
  - при падении одного child process второй корректно завершается, итоговый
    exit code красный;
  - output остаётся читаемым, сигналы не теряются;
  - build запускается только после green tests;
  - test counts совпадают с baseline profile.
PROCEDURE:
  1. Сначала временно измерить sequential vs unit+integration concurrent.
  2. Если improvement <15%, flake или memory pressure — не внедрять
     concurrency; выбрать самый дорогой measured harness bottleneck.
  3. После patch выполнить три последовательных полных DoD.
  4. Выполнить один dual-concurrent stress: два test:agent-dod на одном HEAD.
FOCUSED_PROOF:
  - tooling/orchestrator failure propagation proof;
  - before/after min/median/max;
  - три sequential green;
  - dual-concurrent green;
  - zero lint warnings и zero expected-error stack noise.
UI_STATES: нет.

Если цель скорости требует ослабить coverage/isolation, STOP:
FILE / EVIDENCE / DECISION NEEDED.
```

### Prompt 8 — characterization Specification orchestration

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-SPEC-CHAR-01
OWNER: specification
GOAL: зафиксировать публичные temporal/business contracts
  useSpecificationPageModel до extraction.
ALLOWED_SCOPE:
  - один новый или существующий behavior spec для SpecificationPage/model;
  - test utils только при необходимости;
  - production запрещён.
NON_GOALS:
  - refactor;
  - snapshot огромного return object/DOM;
  - изменение API mocks ради удобного теста.
INVARIANTS TO CHARACTERIZE:
  - project/role permissions и manual-edit capability;
  - UUID выбранного ЭР + legacy number образуют правильный query/mutation scope;
  - switch variant/project не показывает stale specification;
  - generate success инвалидирует exact project/variant keys;
  - partial preflight confirmation повторяет исходный immutable scope/options;
  - manual add/delete сохраняют items и exact invalidation;
  - project defaults и generation snapshot синхронизируются в прежнем порядке.
FOCUSED_PROOF:
  cd frontend &&
  npx vitest run <exact specification behavior spec>
UI_STATES: loading, error, empty, full, partial/preflight, stale, permissions.

Если characterization обнаружит реальную утечку scope/state, STOP без
production fix и верни FILE / EVIDENCE / DECISION NEEDED.
После focused proof запусти npm run test:agent-dod.
```

### Prompt 9 — вынести Specification query/session owner

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-SPEC-QUERY-SESSION-01
OWNER: specification
GOAL: вынести из useSpecificationPageModel owner-local query/session hook,
  сохранив project/variant identity и load semantics.
USER_VISIBLE_SUCCESS: переключение проекта/ЭР, loading/error/refetch и
  отображаемая спецификация работают идентично; parent больше не собирает
  query scope вручную в нескольких местах.
ALLOWED_SCOPE:
  - useSpecificationPageModel.ts;
  - один новый owner-local hook;
  - specification characterization spec.
NON_GOALS:
  - generation/save/default mutations;
  - UI/CSS;
  - изменение query keys/retry/cache.
INVARIANTS:
  - UUID остаётся identity, legacy number только adapter;
  - query keys и enabled conditions byte-for-byte equivalent;
  - hook возвращает именованную session/query group, не flat mega-bag;
  - stale A→B data не становится current.
FOCUSED_PROOF:
  - AF11-SPEC-CHAR-01 spec;
  - existing SpecificationPage integration specs;
  - npm run test:architecture;
  - npm run typecheck.
UI_STATES: нет видимого изменения.

Acceptance: parent context и session/query responsibilities реально
уменьшаются; промежуточный slice не расширяет scope только ради финального cap.
Baseline только shrink. Затем npm run test:agent-dod.
```

### Prompt 10 — вынести manual Specification items workflow

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-SPEC-ITEMS-01
OWNER: specification
GOAL: вынести accessories/manual add/delete/save в один owner-local controller.
USER_VISIBLE_SUCCESS: employee/admin может добавить и удалить позицию как
  раньше; guest/не-владелец не получает mutation path.
ALLOWED_SCOPE:
  - useSpecificationPageModel.ts;
  - один новый manual-items controller;
  - specification characterization spec.
NON_GOALS:
  - generate/preflight/default settings;
  - изменение item payload, quantity rules или messages;
  - UI/CSS.
INVARIANTS:
  - exact mutation scope snapshot до async boundary;
  - items order/source/params не меняются;
  - exact query invalidation сохраняется;
  - success/error copy и form reset прежние;
  - controller API props-in/events-out, без доступа к page presentation.
FOCUSED_PROOF:
  - manual add success;
  - invalid/zero quantity no-op;
  - permission denied;
  - delete success;
  - API failure;
  - project/variant switch scope characterization.
UI_STATES: нет видимого изменения.

После focused proof запусти npm run test:agent-dod.
```

### Prompt 11 — вынести generation/preflight/defaults workflow

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-SPEC-GENERATION-01
OWNER: specification
GOAL: вынести generate/preflight/default-settings orchestration из page model
  в consumer-owned controller с immutable mutation scope.
USER_VISIBLE_SUCCESS: full/partial generation, warnings, confirmation и
  defaults работают идентично; parent остаётся composition root.
ALLOWED_SCOPE:
  - useSpecificationPageModel.ts;
  - один новый generation controller;
  - specification characterization spec.
NON_GOALS:
  - API contract, generation formula/options semantics;
  - manual items workflow;
  - redesign/copy-edit.
INVARIANTS:
  - effective mode остаётся full;
  - selected ER ids, options snapshot и confirmPartial timing прежние;
  - invalidation использует исходный project/variant scope;
  - partial/skipped/excluded warnings сохраняются;
  - settings snapshot sync не образует effect loop;
  - controller возвращает именованные state/actions groups.
FOCUSED_PROOF:
  - full generate;
  - partial preflight then confirm;
  - multiple ER invalidation;
  - settings defaults save;
  - API failure;
  - variant/project switch during pending mutation.
UI_STATES: нет видимого изменения.

Acceptance: page model соответствует cap стандарта и не дублирует controller
state/actions. Затем npm run test:agent-dod.
```

### Prompt 12 — повторяемый runner для следующего крупного контекста

```text
Работай из корня TLT через docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF11-CONTEXT-NEXT-<OWNER>-<USE_CASE>
OWNER: <ровно один owner из inventory>
TARGET: <ровно один production hotspot>
SEAM: <один consumer-owned use case из inventory>
GOAL: уменьшить cognitive context TARGET извлечением SEAM, а не переносом LOC.
USER_VISIBLE_SUCCESS: observable behavior TARGET идентично до/после.
ALLOWED_SCOPE:
  - TARGET;
  - максимум один новый production module;
  - один focused behavior spec;
  - один shrink-only architecture baseline при необходимости.
NON_GOALS:
  - второй seam/owner;
  - массовое переименование/move;
  - UX/API/query/formula/units change;
  - generic shared helper без доказанного второго consumer.
INVARIANTS:
  - characterization first: happy path + meaningful edge/failure;
  - новый module имеет явные typed inputs/outputs;
  - один owner side effects;
  - parent не сохраняет дублированный путь;
  - не создаётся новый mega-bag, deep import или cycle;
  - target и новый artifact укладываются в caps своего типа из стандарта.
FOCUSED_PROOF:
  - exact nearest tests из inventory;
  - npm run test:architecture;
  - npm run typecheck.
UI_STATES: browser proof только если observable UI/DOM/CSS изменился.

До patch пересчитай LOC/imports/hooks/callers. После focused proof запусти
npm run test:agent-dod. Один запуск — один SEAM.
```

### Prompt 13 — зафиксировать TLT browser evidence contract

```text
Работай из корня TLT. Выполни один docs/qa slice.

SLICE_ID: AF11-BROWSER-CONTRACT-01
OWNER: qa
GOAL: создать TLT-specific state matrix и machine-readable evidence schema для
  финального reseal.
ALLOWED_SCOPE:
  - новый docs/frontend/browser-state-matrix.md;
  - один JSON schema/example рядом с новым dated audit template;
  - ссылки из viewport-policy/README только при необходимости.
NON_GOALS:
  - production UI patch;
  - screenshots старого HEAD;
  - объявление states passed из source inspection.
INVARIANTS:
  - прочитать skill kontur-ui-quality:verify-kontur-ui и её state-matrix;
  - перенести только общие coverage dimensions, не чужие Project/Run entities;
  - включить TLT Projects/Heat/Electrical/Specification/Reports states из AF11;
  - evidence row: state, action path, URL, viewport, screenshot, geometry,
    overflow, console, failed network, result/blocker;
  - exact required viewport policy;
  - fixture/seed всегда документирует, какое user behavior оно представляет.
FOCUSED_PROOF:
  - markdown links;
  - JSON parse/schema validation;
  - git diff --check.
UI_STATES: contract only, ничего не помечать pass.

Этот документ не становится ACTIVE queue.
```

### Prompt 14 — feature browser/Kontur proof runner

```text
Работай из корня TLT. Выполни один QA slice без production patch.

SLICE_ID: AF11-BROWSER-<PROJECTS|HEAT|ELEC|SPEC|REPORTS>-01
OWNER: <projects|heat|electrical|specification|reports>
AREA: <одна feature area>
GOAL: пройти все обязательные rows AREA из
  docs/frontend/browser-state-matrix.md на текущем чистом HEAD.
ALLOWED_SCOPE:
  - новый docs/audit/<date>-af11-browser-<area>/ evidence JSON/markdown;
  - screenshots этой AREA;
  - никакого production/test patch.
NON_GOALS:
  - исправлять найденный UI defect внутри QA slice;
  - подменять populated/error state пустым screenshot;
  - переиспользовать старый audit.
PREPARATION:
  1. Прочитать kontur-ui-quality:verify-kontur-ui полностью.
  2. Запустить её scripts/run-static-ui-checks.sh из repo root.
  3. Через tool discovery найти mcp__kontur_playwright__browser_*.
  4. Проверить browser_tabs action=list.
  5. Поднять реальный stack через repo commands; seed только idempotent и
     документированный.
INVARIANTS:
  - reach state через видимые user actions;
  - snapshot+screenshot только после settled async state;
  - каждый state проверить на 1440x900 плюс TLT desktop viewports AREA;
  - page overflow, key bounds, sibling overlap, focus/keyboard;
  - console warnings/errors и failed network;
  - long Russian text/identifiers и empty/one/many data;
  - handled API failure виден в UI без uncaught error.
FOCUSED_PROOF:
  - AREA existing Playwright specs;
  - evidence completeness validator;
  - exact screenshot inventory.
UI_STATES:
  - все rows AREA из matrix; ни один required row не пропускать молча.

Если required browser tool/state недоступен или найден defect:
STOP без production commit, зафиксируй FILE / EVIDENCE / DECISION NEEDED.
```

Запусти Prompt 14 отдельно пять раз: Projects, Heat, Electrical,
Specification, Reports.

### Prompt 15 — собрать browser final seal

```text
Работай из корня TLT. Выполни один read-only QA closure.

SLICE_ID: AF11-BROWSER-FINAL-SEAL-01
OWNER: qa
GOAL: доказать полноту пяти feature browser audits на одном production HEAD.
ALLOWED_SCOPE:
  - новый docs/audit/<date>-af11-browser-final/snapshot.md;
  - index/manifest ссылок на существующие evidence этого же HEAD.
NON_GOALS:
  - production fix;
  - копирование screenshots;
  - PASS при разных HEAD или missing rows.
INVARIANTS:
  - Projects/Heat/Electrical/Specification/Reports evidence имеют один HEAD;
  - working tree был clean до каждого run;
  - все required rows/viewports имеют result;
  - console pageerrors/application warnings = 0;
  - unexpected failed network = 0;
  - geometry/page-overflow failures = 0;
  - untested required state делает status BLOCKED.
FOCUSED_PROOF:
  - evidence manifest validator;
  - npm run test:agent-gates;
  - npm run build-storybook.
UI_STATES: aggregation only.

Не называй missing browser proof optional.
```

### Prompt 16 — финальный честный audit

```text
Работай из корня TLT. Выполни один docs/qa final audit.

SLICE_ID: AF11-FINAL-AUDIT-01
OWNER: qa
GOAL: доказать практическую agent-friendliness из текущего дерева и закрыть
  AF11 только при полном acceptance.
ALLOWED_SCOPE:
  - новый docs/audit/<date>-af11-agent-friendliness/snapshot.md;
  - этот runbook status;
  - refactor-backlog closure только если AF11 slices были ACTIVE pending.
NON_GOALS:
  - production/test fix;
  - правка старых audit;
  - повышение score при missing proof.
RECOMPUTE:
  - production artifact caps, imports/hooks/dependencies/type escapes;
  - flat orchestration responsibilities from context inventory;
  - lint warnings and expected-error output counts;
  - three-run DoD wall-time before→after;
  - test counts and build;
  - browser final-seal completeness.
FOCUSED_PROOF:
  - npm run test:agent-gates;
  - npm run test:agent-dod три раза последовательно;
  - dual-concurrent test:agent-dod;
  - npm run build-storybook;
  - AF11-BROWSER-FINAL-SEAL-01 PASS;
  - git diff --check.
UI_STATES: только ссылки на same-HEAD final seal.

PASS допустим только если выполнен весь Definition of Done этого runbook.
Иначе snapshot = BLOCKED с FILE / EVIDENCE / DECISION NEEDED.
```

## 7. Stop conditions программы

Остановить конкретный slice, не расширяя scope, если:

- characterization показывает текущую business/temporal утечку;
- extract требует изменить query key, API payload, formula, unit, ER identity
  или route semantics;
- новый модуль только переименовывает прежний mega-bag;
- speedup достигается skip/exclude, ослаблением timeout/assertion/isolation;
- тестовая тишина достигается global console suppression;
- browser state недостижим без недокументированного прямого DB/API bypass;
- browser proof относится к другому HEAD;
- один и тот же defect не устранён после трёх содержательных попыток.

Формат остановки:

```text
FILE:
EVIDENCE:
INVARIANT AT RISK:
DECISION NEEDED:
SAFE NEXT SLICE:
```
