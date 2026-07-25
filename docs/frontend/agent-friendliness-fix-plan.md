# Frontend agent-friendliness fix runbook

**Статус:** HISTORICAL / PARTIALLY EXECUTED — не ACTIVE-очередь

**Актуально на:** 2026-07-25

**ACTIVE `pending`:** не копируется; источник истины —
[refactor-backlog.md](./refactor-backlog.md)

**Исходная оценка:** `7.0/10`

**Целевая оценка:** `≥9.0/10`

Этот документ сохраняет исторический порядок AF10 и не создаёт вторую
frontend-очередь. Единственным источником ACTIVE `pending` остаётся backlog.
Один из исторических prompts может стать активным только по явной команде
пользователя или после переноса ровно одного контракта в backlog.

CSS-продолжение, актуальная политика semantic owner CSS и заменяющие prompts:
[meaningful-css-plan.md](./meaningful-css-plan.md).

Нормативы выполнения:

- [agent-development-standard.md](./agent-development-standard.md);
- [agent-refactor-prompt.md](./agent-refactor-prompt.md);
- [pr-budget.md](./pr-budget.md);
- [css-strategy.md](./css-strategy.md);
- [ui-kit.md](./ui-kit.md);
- [viewport-policy.md](./viewport-policy.md).

## Цель и критерии завершения

Работа выполняется строго последовательно: один запуск — один vertical slice,
один owner. Параллельно выполнять baseline/CSS-срезы нельзя.

Финальное состояние:

| Метрика | Baseline 2026-07-25 | Цель |
|---|---:|---:|
| Full DoD | 1284/1285, load-sensitive flake | 2 последовательных green-run |
| Production-файлы >500 LOC | 16 | 0 |
| Import contexts >20 | 4 | 0 |
| Static inline debt | 262 | 0 |
| Прямые legacy `--c-*`/`--a-*` | около 409 | 0 вне token-owner |
| Неканонические breakpoints | 33 | 0 |
| Bare `.ant-*` selectors | 18 | 0 |
| Ant primitives с Tlt-аналогами | 90 в core + непокрытый долг | 0 |
| `!important` | 0 | сохранить 0 |
| Raw CSS colors вне tokens | 0 | сохранить 0 |
| Production type escapes | 0 | сохранить 0 |

Разрешено оставить только документированные runtime geometry и неизбежные
third-party inline adapters. Полное удаление Ant Design не требуется:
мигрируются только примитивы, для которых есть Tlt-аналог.

Heat mobile redesign не входит в задачу: `<1000 px` остаётся вне общего
workspace-контракта. Mobile viewport используется как дополнительное evidence,
а не как требование переделать инженерный экран.

## Публичные и внутренние контракты

- Backend API, payload, query keys, invalidation, routes, формулы, units и ER
  UUID semantics не меняются.
- `ElectricalVariantTabsProps` и `ElectricalAssignmentPanelProps` сохраняются.
- Экспорты `objectWizardUtils.ts` сохраняются через re-export после разбиения.
- Внутренний Heat model получает состояние загрузки: ошибка обязательных
  запросов, наличие stale snapshot, retry и retrying.
- Architecture baseline-схемы расширяются только новыми shrink-only метриками.
  Существующие baseline не повышаются.
- Tlt-примитивы импортируются только через `@/components/ui-kit`.

## Очерёдность

1. Устранить `ReportPage` test race.
2. Устранить Ant `useForm` warning.
3. Исторически закрыть `RISK-CLOSE-PROOF-01` — выполнено, см.
   [PASS evidence](../audit/2026-07-25-frontend-risk-recovery/snapshot.md).
4. Добавить честный Heat query-error state.
5. Разрезать наиболее опасные контексты.
6. Закрыть пробелы architecture gates.
7. Итерационно сжечь CSS/UI-kit debt.
8. Выполнить финальный аудит и пересчитать оценку.

## Prompt 01 — стабилизировать ReportPage

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-REPORT-FLAKE-01
OWNER: reports
GOAL: Устранить load-sensitive race в ReportPage.test.tsx без изменения
production-поведения.
USER_VISIBLE_SUCCESS: Экспорт PDF и открытие мастера отчёта по-прежнему
используют точный выбранный ER UUID; full suite больше не флапает.
ALLOWED_SCOPE:
  - frontend/src/__tests__/integration/pages/ReportPage.test.tsx.
NON_GOALS:
  - изменение ReportPage.tsx;
  - увеличение timeout, sleep, serial-only режим или ослабление assertions;
  - изменение report API, URL или ER scope.
INVARIANTS:
  - каждый интерактивный тест использует собственный userEvent.setup();
  - перед кликом ожидается существующая и enabled-кнопка;
  - результат подтверждается observable mock call, а не таймером;
  - если characterization докажет production race, STOP и выдай отдельный
    FILE / EVIDENCE / DECISION NEEDED вместо production patch.
FOCUSED_PROOF:
  cd frontend && \
  for i in {1..10}; do
    npx vitest run --project integration \
      src/__tests__/integration/pages/ReportPage.test.tsx || exit 1
  done
UI_STATES: видимого изменения нет; browser proof не требуется.

После focused proof обязательно запусти npm run test:agent-dod.
```

## Prompt 02 — убрать `useForm` warning

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.
Используй react-workflow и kontur-ui-quality:verify-kontur-ui.

SLICE_ID: AF10-WIZARD-FORM-CONNECTION-01
OWNER: heat
GOAL: Устранить предупреждение Ant «useForm is not connected» при открытии
редактора диапазона температуры.
USER_VISIBLE_SUCCESS: Модалка диапазона открывается с текущими min/max без
console warning; Apply/Cancel и валидация не меняются.
ALLOWED_SCOPE:
  - frontend/src/components/wizard/InsulationTemperatureRangeField.tsx;
  - frontend/src/__tests__/integration/components/ObjectWizard.*.test.tsx
    (split from ObjectWizardDependencies; see prompts/split-large-tests-by-scenario.md);
  - frontend/src/__tests__/unit/pages/HeatCalcPage.test-utils.tsx.
NON_GOALS:
  - перестройка ObjectWizard;
  - изменение диапазонов, validation rules или form values;
  - подавление сообщения через console mock.
INVARIANTS:
  - подключить modalForm до первого setFieldsValue через поддерживаемый Modal
    lifecycle, ожидаемый вариант — forceRender;
  - удалить это предупреждение из HEATCALC_PAGE_TEST_IGNORED_WARNINGS;
  - тест должен падать при реальном повторном warning.
FOCUSED_PROOF:
  cd frontend && \
  npx vitest run --project integration \
    src/__tests__/integration/components/ObjectWizard.*.test.tsx && \
  npx vitest run src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx
UI_STATES:
  - material=other, modal closed/open/applied/cancelled;
  - wide и side form;
  - 1000×768, 1440×900;
  - дополнительно 1440×1000 и 390×844 по Kontur proof;
  - console без useForm warning.

После browser proof запусти npm run test:agent-dod.
```

## Prompt 03 — честно закрыть текущую RISK-очередь

```text
Запускай только после того, как target docs/backlog-файлы больше не содержат
чужого dirty WIP.

Работай из корня TLT. Выполни docs/qa slice через
docs/frontend/agent-refactor-prompt.md.
Используй browser:control-in-app-browser и
kontur-ui-quality:verify-kontur-ui.

SLICE_ID: RISK-CLOSE-PROOF-01
OWNER: qa
GOAL: Закрыть текущую RISK-очередь только на основании green DoD и полного
Projects/Heat browser evidence.
USER_VISIBLE_SUCCESS: Backlog и новый audit содержат воспроизводимую правду;
EMPTY QUEUE появляется только при полном acceptance.
ALLOWED_SCOPE:
  - новый docs/audit/<date>-frontend-risk-recovery/snapshot.md;
  - docs/frontend/refactor-backlog.md;
  - evidence screenshots/markdown только в новом audit-каталоге.
NON_GOALS:
  - production patch;
  - изменение thresholds/baselines;
  - переписывание historical audit.
INVARIANTS:
  - зафиксировать HEAD и git status;
  - любой failed request, console warning, красная команда или отсутствующий
    viewport оставляет status BLOCKED;
  - не использовать старые screenshots как evidence текущего HEAD.
FOCUSED_PROOF:
  cd frontend && \
  npm run test:agent-gates && \
  npm run test:agent-dod && \
  npm run test:agent-dod
UI_STATES:
  Projects:
    loading, query error, empty, cards/list, filters, create modal,
    bulk selection/actions;
  Heat:
    pipe/tank, wide/side, above-ground/underground,
    climate selected/manual, wind visible/hidden;
  Viewports:
    1000×768, 1280×800, 1366×768, 1440×900;
    1440×1000 и 390×844 — дополнительный Kontur evidence;
  Для каждого состояния:
    page overflow, local scrollers, clipping, focus, console и failed network.

Только при полном green отметь RISK-CLOSE-PROOF-01 done и установи empty queue.
Иначе STOP с FILE / EVIDENCE / DECISION NEEDED.
```

## Prompt 04 — Heat query-error model

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-HEAT-LOAD-STATE-MODEL-01
OWNER: heat
GOAL: Перестать интерпретировать ошибку обязательных workspace queries как
пустой проект.
USER_VISIBLE_SUCCESS: Пока только внутренний контракт; визуального изменения
нет.
ALLOWED_SCOPE:
  - frontend/src/pages/heatcalc/useHeatCalcObjectsDataModel.ts;
  - frontend/src/pages/heatcalc/useHeatCalcWorkspaceDataModel.ts;
  - их два существующих unit test файла.
NON_GOALS:
  - изменение HeatCalcPage;
  - изменение query keys, enabled conditions, staleTime или prefetch;
  - превращение ошибки insulation reference в блокирующую workspace error.
INVARIANTS:
  - обязательные queries: summary; capabilities только когда enabled; active
    object query только когда request enabled; all-objects только в all/excel;
  - inactive query error не блокирует workspace;
  - model возвращает first enabled error, retrying, наличие usable snapshot и
    retry только реально failed enabled queries;
  - stale snapshot не удаляется из-за refetch error.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel.test.tsx \
    src/__tests__/unit/pages/heatcalc/useHeatCalcWorkspaceDataModel.test.ts
UI_STATES: нет видимого изменения.

После focused proof запусти npm run test:agent-dod.
```

## Prompt 05 — Heat query-error UI

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.
Используй browser:control-in-app-browser и
kontur-ui-quality:verify-kontur-ui.

SLICE_ID: AF10-HEAT-LOAD-STATE-UI-01
OWNER: heat
GOAL: Показать единый retryable QueryError для обязательных Heat workspace
queries.
USER_VISIBLE_SUCCESS:
  - ошибка без snapshot показывает QueryError вместо «0 объектов»;
  - ошибка refetch со stale snapshot сохраняет таблицу и показывает alert;
  - Retry повторяет failed queries и отражает loading.
ALLOWED_SCOPE:
  - frontend/src/pages/heatcalc/useHeatCalcPageModel.ts;
  - frontend/src/pages/HeatCalcPage.tsx;
  - один существующий HeatCalcPage test.
NON_GOALS:
  - toast вместо persistent error;
  - изменение empty state;
  - изменение API/query semantics или layout.
INVARIANTS:
  - использовать существующий QueryError;
  - primary actions не должны выглядеть доступными при отсутствии данных;
  - stale usable data остаётся видимым;
  - accessible title и Retry button обязательны.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx
UI_STATES:
  first-load 500; refetch 500 со stale rows; retry success; retry pending;
  1000×768, 1280×800, 1440×900;
  дополнительно 1440×1000 и 390×844;
  alert/button geometry, keyboard focus, console/network.

После browser proof запусти npm run test:agent-dod.
```

## Prompt 06 — разделить objectWizardUtils

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-WIZARD-NAMING-MODEL-01
OWNER: heat
GOAL: Извлечь DN lookup и генерацию pipe/tank names из objectWizardUtils.ts в
чистый objectWizardNaming.ts.
USER_VISIBLE_SUCCESS: Автоматические имена и DN полностью идентичны.
ALLOWED_SCOPE:
  - frontend/src/utils/objectWizardUtils.ts;
  - новый frontend/src/utils/objectWizardNaming.ts;
  - frontend/src/__tests__/unit/utils/objectWizardUtils.test.ts;
  - complexityBaseline.json.
NON_GOALS:
  - API/form converters;
  - изменение строк, округления или единиц;
  - изменение import paths callers.
INVARIANTS:
  - objectWizardUtils сохраняет прежние exports через re-export;
  - новый module не импортирует React, stores, API или feature pages;
  - characterization покрывает DN boundary, pipe, tank shapes и trailing zeros.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/utils/objectWizardUtils.test.ts \
    src/__tests__/unit/architecture/complexityRatchet.architecture.test.ts
UI_STATES: нет видимого изменения.

После focused proof запусти npm run test:agent-dod.
```

## Prompt 07 — разделить CablePickerCharacteristics

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-CABLE-CHARACTERISTICS-MODEL-01
OWNER: electrical
GOAL: Вынести label/order/format/build logic из CablePickerCharacteristics.tsx
в чистый cablePickerCharacteristicsModel.ts.
USER_VISIBLE_SUCCESS: Порядок, labels, units, fallback «—» и отображаемые поля
не меняются.
ALLOWED_SCOPE:
  - frontend/src/components/electrical/CablePickerCharacteristics.tsx;
  - новый cablePickerCharacteristicsModel.ts;
  - новый focused unit test;
  - complexityBaseline.json.
NON_GOALS:
  - CSS/layout;
  - изменение cable catalog semantics;
  - унификация с другими tables.
INVARIANTS:
  - component оставляет только props, section composition и rendering;
  - model не импортирует React;
  - dynamic CSS custom property остаётся runtime geometry;
  - target component после slice ≤500 LOC, новый helper ≤500 LOC.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/components/CablePickerCharacteristics.test.tsx \
    src/__tests__/unit/architecture/complexityRatchet.architecture.test.ts
UI_STATES:
  object only, cable only, both; pipe/tank; missing and extended cable fields;
  1000×768, 1280×800, 1440×900; no visual diff.

После browser proof запусти npm run test:agent-dod.
```

## Prompt 08 — разделить ElectricalVariantTabs

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-ELEC-VARIANT-RENAME-01
OWNER: electrical
GOAL: Извлечь rename lifecycle, validation и focus restoration в
useElectricalVariantRename.ts.
USER_VISIBLE_SUCCESS: Rename, Enter, Escape, blur, server error и возврат focus
работают идентично.
ALLOWED_SCOPE:
  - frontend/src/pages/electrical/ElectricalVariantTabs.tsx;
  - новый useElectricalVariantRename.ts;
  - ElectricalVariantTabs.test.tsx;
  - complexityBaseline.json или importContextBaseline.json.
NON_GOALS:
  - variant controller/API;
  - новая UX;
  - UI-kit migration в этом slice.
INVARIANTS:
  - props и DOM tab semantics неизменны;
  - selected/active UUID semantics неизменны;
  - component после slice ≤500 LOC;
  - новый hook ≤250 LOC и ≤20 imports.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/electrical/ElectricalVariantTabs.test.tsx \
    src/__tests__/unit/architecture/complexityRatchet.architecture.test.ts
UI_STATES:
  loading, empty, populated, rename valid/empty/error/cancel;
  keyboard arrows/Home/End/Enter/Escape и focus restoration;
  1000×768, 1280×800, 1440×900.

После browser proof запусти npm run test:agent-dod.
```

## Prompt 09 — разделить ElectricalAssignmentPanel

```text
Работай из корня TLT. Выполни ровно один slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-ELEC-ASSIGNMENT-CONTROLLER-01
OWNER: electrical
GOAL: Извлечь counts/mutation/conflict/cleanup/DnD orchestration в
useElectricalAssignmentController.ts.
USER_VISIBLE_SUCCESS: Tabs, counts, assign, unassign, DnD, version conflict и
legacy cleanup работают идентично.
ALLOWED_SCOPE:
  - frontend/src/pages/electrical/ElectricalAssignmentPanel.tsx;
  - новый useElectricalAssignmentController.ts;
  - ElectricalAssignmentPanel.test.tsx;
  - complexityBaseline.json.
NON_GOALS:
  - изменение API/query keys/invalidation;
  - UI-kit migration;
  - изменение supported electrical systems.
INVARIANTS:
  - component props сохраняются;
  - mutation payload и success/error texts сохраняются;
  - controller не рендерит JSX;
  - component после slice ≤500 LOC, helper ≤350 LOC.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/pages/electrical/ElectricalAssignmentPanel.test.tsx \
    src/__tests__/unit/architecture/complexityRatchet.architecture.test.ts
UI_STATES:
  readonly; unassigned; assigned; DnD over/drop;
  version conflict; cleanup confirmation; generic API error;
  1000×768, 1280×800, 1440×900.

После browser proof запусти npm run test:agent-dod.
```

## Prompt 10 — повторяемый complexity runner

Повторять до нуля файлов `>500 LOC` и import contexts `>20`.

```text
Работай из корня TLT. Выполни ровно один characterization-first slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-CONTEXT-NEXT
OWNER: owner выбранного target
GOAL: Уменьшить один следующий hotspot, не создавая нового hotspot.
TARGET_SELECTION:
  1. Пересчитай production LOC и import contexts.
  2. Выбери первый оставшийся target из списка ниже.
  3. Выполни только указанную extraction seam.
TARGET_ORDER_AND_SEAM:
  - FormulasPage.tsx: shared useFormulaCalc model, затем по одному Formula*Tab;
  - objectWizardUtils.ts: form/API mapper module с сохранением re-exports;
  - ColumnSettingsModal.tsx: owner-local row/sortable-row components;
  - ElectricalColumnSettingsModal.tsx: независимые electrical row components;
  - ProjectsPage.tsx: Filters, затем dialogs/presentation components;
  - ElectricalCandidateGlideGrid.tsx: drawing/hit-test pure model;
  - heatCalcTableColumns.ts: storage/cache, затем normalization model;
  - heatCalcExcelMode.ts: spreadsheet TSV parse/format codec;
  - calculations.ts: candidate/folder API module с compatibility re-exports;
  - useHeatCalcTableColumns.tsx: pure selection lookup model;
  - DatabasePage.tsx: payload normalization model;
  - electricalCandidateTableColumns.ts: storage/cache module;
  - UIKitPage.tsx: Foundations, Primitives и Heat reference sections;
  - ObjectWizard.tsx (>20 imports): useObjectWizardFormModel;
  - useHeatCalcPageModel.ts (>20 imports): page context/header hook;
  - elecCalcWorkspacePresentationMap.ts (>20 imports):
    core/table и overlays/candidate presentation maps;
  - useElecCalcWorkspaceDataPlane.ts (>20 imports):
    calc objects и candidate/catalog data planes.
USER_VISIBLE_SUCCESS: Поведение выбранного owner идентично.
ALLOWED_SCOPE:
  - target;
  - один новый owner-local helper/component;
  - максимум два test/baseline файла.
NON_GOALS:
  - соседний cleanup;
  - façade/barrel только ради сокрытия import count;
  - shared abstraction без двух независимых consumers.
INVARIANTS:
  - target после slice ≤500 LOC либо уменьшается минимум на 15%;
  - target import count ≤20 либо уменьшается минимум на 3;
  - новый файл ≤500 LOC и ≤20 imports;
  - public imports сохраняются re-export, если это дешевле безопасной миграции;
  - если нет characterization, этот запуск добавляет только characterization и
    не выполняет extraction.
FOCUSED_PROOF:
  существующий focused owner test + \
  cd frontend && npx vitest run \
    src/__tests__/unit/architecture/complexityRatchet.architecture.test.ts \
    src/__tests__/unit/architecture/importContextRatchet.architecture.test.ts
UI_STATES:
  если JSX/видимое поведение затронуто — Browser + Kontur proof по viewport
  policy; иначе явно записать «no visual diff».

После focused/browser proof запусти npm run test:agent-dod.
```

## Prompt 11 — закрыть CSS guardrail gaps

```text
Работай из корня TLT. Выполни architecture-only slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-CSS-GAP-GATE-01
OWNER: architecture
GOAL: Добавить shrink-only контроль прямых legacy palette refs и
неканонических media breakpoints.
USER_VISIBLE_SUCCESS: Новый CSS больше не может распространять эти два класса
долга.
ALLOWED_SCOPE:
  - cssArchitectureRatchet.architecture.test.ts;
  - cssArchitectureBaseline.json.
NON_GOALS:
  - production CSS migration;
  - изменение canonical breakpoint policy;
  - повышение существующих LOC/bareAnt/media limits.
INVARIANTS:
  - legacy refs считаются вне styles/tokens.css;
  - canonical allowlist:
    max-width 480/768/1200/1400, print,
    prefers-reduced-motion: reduce;
  - baseline хранит per-file и total counts;
  - diff двунаправленный: growth и stale baseline падают;
  - fixtures доказывают new-file growth и stale shrink.
FOCUSED_PROOF:
  cd frontend && npm run css:architecture
UI_STATES: нет production change.

После focused proof запусти npm run test:agent-gates.
```

## Prompt 12 — расширить UI-kit policy на весь frontend

```text
Работай из корня TLT. Выполни architecture-only slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-UIKIT-SCOPE-GATE-01
OWNER: architecture
GOAL: Покрыть direct Ant primitives с Tlt-аналогами во всех production
pages/components/hooks, а не только в core подкаталогах.
USER_VISIBLE_SUCCESS: Report/admin/auth/common UI больше не может наращивать
обход UI-kit.
ALLOWED_SCOPE:
  - antdPrimitivePolicy.architecture.test.ts;
  - новый antdPrimitiveExtendedBaseline.json.
NON_GOALS:
  - изменение существующего core baseline;
  - production migration;
  - запрет Ant APIs без Tlt-аналога.
INVARIANTS:
  - сканировать production pages/components/hooks;
  - исключить components/ui-kit, components/form-controls, stories/tests,
    UIKitPage showcase и пути уже покрытые core baseline;
  - запрещённый mapping остаётся:
    Button/Input/InputNumber/Select/Card/Alert/Tag;
  - новый baseline двунаправленный и shrink-only.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/architecture/antdPrimitivePolicy.architecture.test.ts
UI_STATES: нет production change.

После focused proof запусти npm run test:agent-gates.
```

## Prompt 13 — gate для visual literals в TS/TSX

```text
Работай из корня TLT. Выполни architecture-only slice через
docs/frontend/agent-refactor-prompt.md.

SLICE_ID: AF10-VISUAL-LITERAL-GATE-01
OWNER: architecture
GOAL: Запретить рост raw #hex/rgb/hsl literals в production TS/TSX.
USER_VISIBLE_SUCCESS: Новые visual colors проходят через theme, CSS tokens или
централизованный canvas palette.
ALLOWED_SCOPE:
  - новый visualLiteralRatchet.architecture.test.ts;
  - новый visualLiteralBaseline.json.
NON_GOALS:
  - production migration;
  - анализ test expectations;
  - запрет строк, не являющихся color literals.
INVARIANTS:
  - AST scan production ts/tsx, без tests/stories;
  - разрешённые owner-файлы остаются no-growth:
    theme/appTheme.ts,
    utils/glideGridPrimitives.ts,
    components/admin/formulas/formulaPrimitives.tsx,
    pages/UIKitPage.tsx;
  - все остальные файлы — shrink-to-zero;
  - diff двунаправленный с fixtures.
FOCUSED_PROOF:
  cd frontend && npx vitest run \
    src/__tests__/unit/architecture/visualLiteralRatchet.architecture.test.ts
UI_STATES: нет production change.

После focused proof запусти npm run test:agent-gates.
```

## Prompt 14 — CSS ownership split runner

> **SUPERSEDED для новых запусков:** использовать этапы и prompts из
> [meaningful-css-plan.md](./meaningful-css-plan.md). Текст ниже сохранён как
> исторический контракт уже начатой AF10-последовательности.

Повторить по четырём targets в указанном порядке.

```text
Работай из корня TLT. Выполни один CSS ownership slice через
docs/frontend/agent-refactor-prompt.md.
Используй Browser и kontur-ui-quality:verify-kontur-ui.

SLICE_ID: AF10-CSS-OWNER-SPLIT-NEXT
OWNER: css
GOAL: Переместить одну связанную selector family из mixed-owner CSS в
именованный owner CSS без visual diff.
TARGET_SELECTION: первый ещё не выполненный пункт:
  1. elec-workspace.css:
     cable-picker-characteristics* → CablePickerCharacteristics.css;
     удалить дублированные 760/980 media blocks;
     новый CSS подключить из ElecCalcWorkspace.
  2. calc-spreadsheet.css:
     C14 excel-virtual-* и excel-context-menu* →
     calc-spreadsheet-excel.css; import в main сразу после базового spreadsheet.
  3. ui-kit.css:
     uikit-heatcalc-* и contextual reference-picker rules →
     ui-kit-heatcalc-reference.css.
  4. ui-kit.css:
     uikit-primitive-*, uikit-status*, uikit-alerts, uikit-metrics,
     uikit-table* → ui-kit-primitives-showcase.css.
USER_VISIBLE_SUCCESS: Pixel/geometry идентичны.
ALLOWED_SCOPE:
  - один page/shell import owner;
  - исходный CSS;
  - один новый CSS;
  - максимум два test/baseline файла.
NON_GOALS:
  - token migration;
  - breakpoint canonicalization;
  - selector redesign.
INVARIANTS:
  - cascade order сохраняется;
  - selectors не дублируются;
  - styles.css не меняется;
  - no !important/raw colors/bare Ant growth.
FOCUSED_PROOF:
  cd frontend && npm run css:architecture
UI_STATES:
  соответствующий component/page в 1000×768, 1280×800, 1440×900;
  exact geometry, local overflow, console/network.

После browser proof запусти npm run test:agent-dod.
```

## Prompt 15 — общий debt burn-down runner

> **SUPERSEDED для новых CSS-запусков:** использовать детерминированный
> per-owner runner из
> [meaningful-css-plan.md](./meaningful-css-plan.md). Текст ниже сохранён как
> история первоначального плана.

Повторять до достижения всех целевых нулей.

```text
Работай из корня TLT. Выполни ровно один debt slice через
docs/frontend/agent-refactor-prompt.md.
Для видимого UI используй Browser и kontur-ui-quality:verify-kontur-ui.

SLICE_ID: AF10-DEBT-NEXT
OWNER: owner выбранного target
GOAL: Уменьшить ровно один тип agent-unfriendly debt в одном production owner.
DEBT_SELECTION: выбрать первый ненулевой класс в этом порядке:
  1. static inline debt;
  2. core + extended Ant primitive baseline;
  3. raw TS/TSX visual literals вне разрешённых owners;
  4. direct legacy --c-* / --a-* refs вне tokens.css;
  5. bare .ant-* selectors;
  6. noncanonical breakpoints.
TARGET_SELECTION:
  - файл с максимальным count выбранного долга;
  - при равенстве — lexicographically first;
  - один target-файл за запуск.
MIGRATION_RULES:
  - static inline: перенести все static occurrences target-файла в owner CSS;
    runtime geometry и third-party adapters не переклассифицировать;
  - Ant primitive: заменить все поддерживаемые mapped primitives на Tlt imports
    через @/components/ui-kit; неподдерживаемая capability = STOP и отдельный
    ui-owner capability slice;
  - visual literals: presentation → CSS/tokens; canvas/grid colors →
    centralized glideGridPrimitives; не читать CSS variables в draw loop;
  - legacy palette: заменить не более 25 refs одной selector family на
    существующие semantic tokens; при отсутствии точного смысла добавить один
    semantic alias в tokens.css;
  - bare Ant: scope под существующий owner root; если root отсутствует,
    добавить его в том же component;
  - breakpoint mapping:
    520/640/720/760 → 768,
    900/980/1100/1180 → 1200,
    1500 → 1400;
    один @media block за slice, geometry proof по обе стороны старой и новой
    границы.
USER_VISIBLE_SUCCESS: UX и semantics не меняются, кроме явно согласованного
responsive transition.
ALLOWED_SCOPE:
  - один target production file;
  - один owner CSS/token/helper;
  - максимум два test/baseline файла.
NON_GOALS:
  - смешивание двух debt classes;
  - повышение baseline;
  - новый global utility или shared abstraction ради одной страницы.
INVARIANTS:
  - выбранный baseline уменьшается в том же slice;
  - все остальные baselines не растут;
  - target static/Ant/visual debt становится 0, кроме bounded palette chunk и
    одного breakpoint block;
  - accessible names, keyboard и primary actions сохраняются.
FOCUSED_PROOF:
  focused owner test + соответствующий architecture ratchet.
UI_STATES:
  affected states;
  минимум 1440×900 и релевантный edge viewport из viewport-policy;
  для responsive — 1000×768, 1280×800, 1440×900 и boundary±1;
  console, failed network, overflow и focus.

После focused/browser proof запусти npm run test:agent-dod.
```

Если Ant migration обнаружит недостающий Tlt contract, использовать отдельный
slice:

```text
SLICE_ID: AF10-UIKIT-CAPABILITY-<COMPONENT>
OWNER: ui
GOAL: Добавить только конкретную недостающую capability, доказанную feature
blocker evidence.
ALLOWED_SCOPE: один Tlt component, его CSS, unit test, story.
INVARIANTS: feature/domain imports запрещены; native semantics и keyboard
обязательны; feature migration выполняется отдельным следующим slice.
FOCUSED_PROOF:
  cd frontend && npm run test:ui-kit && npm run build-storybook
UI_STATES: default, hover, focus, disabled, loading/error и требуемый blocker
state на 1440×1000 и 390×844.
```

## Prompt 16 — финальный аудит

```text
Работай из корня TLT. Выполни только read-only QA, затем docs closure.
Используй Browser и kontur-ui-quality:verify-kontur-ui.

SLICE_ID: AF10-FINAL-AUDIT-01
OWNER: qa
GOAL: Доказать frontend agent-friendliness ≥9/10 на текущем production HEAD.
ALLOWED_SCOPE:
  - новый датированный
    docs/audit/<date>-frontend-agent-friendliness/snapshot.md;
  - backlog status только после полного PASS;
  - evidence screenshots в новом audit-каталоге.
NON_GOALS:
  - production fix внутри audit;
  - изменение rubric, thresholds или baseline.
ACCEPTANCE:
  - ReportPage focused suite 10 последовательных green;
  - npm run test:agent-dod два последовательных green;
  - production >500 LOC = 0;
  - import contexts >20 = 0;
  - static inline debt = 0;
  - core и extended Ant primitive baselines empty;
  - direct legacy palette refs вне token owner = 0;
  - bare Ant selectors = 0;
  - noncanonical breakpoints = 0;
  - visual literals вне разрешённых owners = 0;
  - type escapes, !important, raw CSS colors и dependency cycles = 0;
  - Projects, Heat, Electrical, Specification и Reports browser states green;
  - console clean и unexpected failed network = 0.
FOCUSED_PROOF:
  cd frontend && \
  npm run test:agent-gates && \
  npm run test:agent-dod && \
  npm run test:agent-dod && \
  npm run build-storybook
UI_STATES:
  1000×768 functional;
  1280×800 full workspace;
  1366×768 height-sensitive;
  1440×900 primary;
  1920×1080 shell/wide;
  1440×1000 и 390×844 по Kontur verification;
  loading/error/empty/populated/mutation/modal/keyboard states затронутых
  owners.

Если хотя бы один acceptance не выполнен, audit остаётся BLOCKED и сообщает
FILE / EVIDENCE / DECISION NEEDED. Оценка ≥9/10 заявляется только после PASS.
```

## Definition of Done всей программы

- `RISK-CLOSE-PROOF-01` закрыт честным green evidence.
- Все целевые architecture metrics достигнуты и baselines уменьшены в тех же
  slices.
- Full DoD проходит два раза подряд на одном production HEAD.
- Обязательная browser-матрица сохранена с точными viewport, состояниями,
  geometry, keyboard/focus, console и network evidence.
- Ни один audit не объявляет PASS при красной команде или непроверенном
  обязательном состоянии.
- Итоговый audit пересчитывает факты из дерева, а не копирует числа из этого
  proposed runbook.

## Допущения и hard stops

- Все prompts выполняются последовательно на актуальном HEAD.
- Чужой dirty WIP сохраняется; target conflict является hard stop.
- `src/styles.css` остаётся freeze-stub с net LOC `≤0`.
- CSS LOC сам по себе не оптимизируется: крупные, но одновладельческие
  `primitives.css`/`compact-fields.css` допустимы.
- Browser closure выполняется на healthy local stack. Искусственно недоступный
  backend используется только для проверки нового Heat error state.
- Если slice не помещается в PR budget, он делится до начала patch, а не
  расширяет scope в процессе.
