# AF12 — остаточный frontend hardening: план и исполняемые промпты

**Статус:** PROPOSED prompt-pack, не ACTIVE-очередь и не заявление о PASS
**Planning BASE_HEAD:** `c03498b07ab2e426ee015259b0b40cdda31c94bd`
**Актуально на:** 2026-07-25
**Владелец программы:** frontend-process
**Маршрутизация `pending`:** только
[refactor-backlog.md](./refactor-backlog.md)

Этот документ содержит только план и готовые к отдельному запуску промпты.
Он не выполняет production-срезы, не меняет acceptance задним числом и не
создаёт вторую frontend-очередь. Любой prompt ниже становится исполняемым
только по явной команде пользователя или после переноса ровно одного контракта
в `refactor-backlog.md`.

Нормативные источники:

- [`frontend/AGENTS.md`](../../frontend/AGENTS.md);
- [стандарт разработки](./agent-development-standard.md);
- [мастер-промпт рефакторинга](./agent-refactor-prompt.md);
- [PR budget](./pr-budget.md);
- [CSS ownership и cascade](./css-strategy.md);
- [UI-kit и form-layout contract](./ui-kit.md);
- [desktop viewport contract](./viewport-policy.md);
- [browser state matrix](./browser-state-matrix.md).

## 1. Исходное состояние на `c03498b`

AF12 начинается после Ant-based миграции Tlt-фасада, а не с исторического
`ef69f97`.

| Область | Подтверждённый остаток |
|---|---|
| Heat geometry | В live browser на `1440×1000` host слоя изоляции схлопнут до `10 px`, при этом `scrollWidth` таблицы равен `561 px` |
| React controlled state | Uncontrolled→controlled warnings после миграции уже отсутствуют; повторно «исправлять» их не нужно |
| Ant Form | Остаётся warning `useForm is not connected` в reference-ветке `InsulationTemperatureRangeField` |
| Ant InputNumber | Остаётся deprecation warning для `addonAfter` |
| Ant Select | Остаётся deprecation warning для `popupClassName` |
| CSS | `10 247` строк в `frontend/src/**/*.css`; LOC является сигналом для ownership-аудита, а не целью удаления строк |
| Browser | Полная same-HEAD матрица ещё не запечатана |
| DoD | Есть одиночный green-run около `155 s`, но нет принятого трёхпрогонного median и dual-concurrent seal |
| Mobile | `390×844` остаётся наблюдением вне обязательного desktop DoD |

Восемь CSS-файлов `>400` строк на planning base:

| LOC | Файл |
|---:|---|
| 910 | `frontend/src/pages/ui-kit.css` |
| 637 | `frontend/src/pages/electrical/elec-workspace.css` |
| 572 | `frontend/src/components/ui-kit/primitives.css` |
| 554 | `frontend/src/components/ui-kit/compact-fields.css` |
| 499 | `frontend/src/pages/heatcalc/heatcalc-field-chrome-core.css` |
| 479 | `frontend/src/styles/table-chrome.css` |
| 455 | `frontend/src/styles/calc-spreadsheet-base.css` |
| 405 | `frontend/src/pages/electrical/elec-workspace-summary.css` |

Файл ровно в `400 LOC` не входит в список `>400`. Перед
`AF12-CSS-OWNER-MAP-01` список пересчитывается из его собственного
`BASE_HEAD`; числа выше остаются planning evidence, а не вечным baseline.

## 2. Scope и неизменяемые интерфейсы

AF12 не меняет:

- публичные React props и публичный barrel `@/components/ui-kit`;
- API payloads, query keys, invalidation, routing и URL semantics;
- формулы, единицы измерения и ER UUID semantics;
- стабильные DOM-классы и `data-testid`;
- validation rules, accessible names, keyboard/focus contract и modal UX;
- desktop breakpoint contract.

CSS разрешено менять только ради доказанной geometry, корректного ownership
или сохранения уже существующего responsive behavior. Эстетические изменения,
редизайн, copy-editing и mobile redesign в AF12 запрещены.

## 3. Порядок исполнения

Каждый узел — отдельный запуск, owner и commit. Объединять соседние prompts в
один commit нельзя.

```text
AF12-HEAT-INSULATION-GEOMETRY-01
  → AF12-HEAT-RANGE-FORM-01
  → AF12-TLT-NUMBER-ADDON-01
  → AF12-TLT-SELECT-POPUP-01
  → AF12-CSS-OWNER-MAP-01
  → AF12-UIKIT-RESPONSIVE-OWNER-01
  → AF12-BROWSER-FINAL-SEAL-01
  → AF12-DOD-REPEATABILITY-01
  → AF12-FINAL-AUDIT-01
```

Production-срезы: 01, 02, 03, 04 и 06. Prompt 05 — docs-only ownership audit,
07 — browser evidence, 08 — tooling/repeatability, 09 — финальная проверка и
docs closure.

## 4. Общий execution contract

Текст каждого prompt ниже автономен и повторяет этот контракт:

1. Один prompt — один `SLICE_ID`, один owner и один отдельный commit.
2. До работы `git status --short` должен быть пуст; исходный
   `BASE_HEAD=$(git rev-parse HEAD)` записывается в evidence и финальный отчёт.
3. Перед patch читаются `frontend/AGENTS.md`,
   `agent-development-standard.md`, `agent-refactor-prompt.md`, `pr-budget.md`,
   `css-strategy.md`, `ui-kit.md`, `viewport-policy.md` и для browser-задач
   `browser-state-matrix.md`.
4. Сначала characterization/focused proof, затем live browser proof через
   Kontur Playwright, после него — `cd frontend && npm run test:agent-dod`.
5. Запрещены `!important`, raw colors, новые глобальные Ant overrides, новые
   случайные breakpoints и любой рост architecture/CSS baseline.
6. Нельзя менять внешний вид «заодно»: CSS patch допускается только для
   geometry, ownership или доказанного сохранения поведения.
7. Нельзя ослаблять assertions, coverage, suites, timeout, isolation, ARIA,
   keyboard/focus или stable DOM contracts.
8. Если browser недоступен, focused/browser/full proof красный либо target
   пересекается с чужим WIP, результат — `BLOCKED`; готовый commit запрещён.
9. В commit добавляются только явно перечисленные файлы slice; `git add .`,
   unrelated cleanup и push запрещены.
10. Формат hard stop:

```text
FILE:
BASE_HEAD:
EVIDENCE:
INVARIANT AT RISK:
DECISION NEEDED:
SAFE NEXT SLICE:
```

## 5. Исполняемые промпты

### Prompt 1 — восстановить geometry слоёв изоляции Heat

```text
Работай из корня TLT. Выполни ровно один characterization-first UI/CSS slice.
Используй Kontur Playwright для live browser evidence.

SLICE_ID: AF12-HEAT-INSULATION-GEOMETRY-01
OWNER: heat
GOAL: устранить первопричину схлопывания host таблицы слоёв изоляции.
USER_VISIBLE_SUCCESS:
  - на desktop таблица слоёв занимает ширину секции полей;
  - controls и labels доступны без page-level horizontal overflow;
  - один и три слоя сохраняют существующий внешний вид и workflow.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без patch;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)` в отчёт и browser evidence;
  - убедись, что target-файлы не содержат чужого WIP;
  - это один owner, один slice и один отдельный commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - ближайший production CSS, DOM владельца fields/layers и существующий spec.

ALLOWED_SCOPE:
  - frontend/src/pages/heatcalc/heatcalc-dual-form-shell.css;
  - e2e/tests/heat-form-insulation-layout.spec.ts.
NON_GOALS:
  - изменение внутренностей insulation table;
  - компенсирующий selector/override в другом CSS;
  - изменение field widths, typography, spacing, colors или breakpoints;
  - mobile redesign;
  - API/formula/unit/query/routing changes.

IMPLEMENTATION:
  - удали `contain: inline-size` у owner-слоя изоляции;
  - удали целиком устаревший комментарий, оправдывающий это containment;
  - не добавляй вместо него другой containment, min-width hack или override;
  - не меняй declarations внутри таблицы слоёв.

CHARACTERIZATION_AND_TEST:
  Расширь существующий heat-form-insulation-layout.spec.ts:
  - viewports: 1000×768, 1280×800, 1366×768, 1440×900,
    1440×1000, 1920×1080;
  - каждый viewport проверяет один слой и три слоя;
  - width layers-host >= 85% width fields-host;
  - insulation table заполняет доступную content width host с допуском 2 px;
  - внутренний horizontal overflow таблицы/host <= 2 px;
  - page-level horizontal overflow <= 2 px;
  - обязательные controls и labels видимы;
  - controls/labels не пересекаются, не обрезаны и не выходят за owner host;
  - console errors/warnings и unexpected failed requests отсутствуют.
  Сохрани стабильные data-testid и проверяй behavior, а не Ant DOM internals.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE BROWSER:
  - `cd frontend && npm run css:architecture`;
  - запусти только e2e/tests/heat-form-insulation-layout.spec.ts во всех
    перечисленных desktop viewports;
  - сохрани exact geometry JSON для 1/3 layers.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - live app через Kontur Playwright;
  - минимум 1000×768 и 1440×1000;
  - на каждом viewport отдельно 1 и 3 слоя;
  - screenshot, fields/layers/table bounds, clientWidth/scrollWidth,
    page overflow, clipping/overlap, console и failed requests;
  - 390×844 не является acceptance и не требует исправления.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - architecture/CSS baseline не растёт;
  - никакой эстетической правки;
  - stable classes/data-testid, public props, API, query keys, formulas,
    units и routing неизменны.

HARD_STOP:
  Если простое удаление containment не выполняет geometry contract, STOP.
  Верни исходные и полученные измерения FILE / BASE_HEAD / EVIDENCE /
  INVARIANT AT RISK / DECISION NEEDED / SAFE NEXT SLICE. Не правь таблицу,
  соседний CSS или breakpoint и не создавай готовый commit.
  Browser unavailable либо любой red proof => BLOCKED без готового commit.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - добавь в index только два разрешённых файла;
  - commit:
    `fix(frontend): AF12-HEAT-INSULATION-GEOMETRY-01 restore layers width`;
  - не push;
  - отчёт: BASE_HEAD, before→after geometry по каждому viewport, focused,
    browser, full DoD, commit hash и residual risk.
```

### Prompt 2 — создавать modal form только в editable-ветке

```text
Работай из корня TLT. Выполни ровно один characterization-first React slice.
Используй Kontur Playwright для live browser evidence.

SLICE_ID: AF12-HEAT-RANGE-FORM-01
OWNER: heat
GOAL: устранить `useForm is not connected` в
  InsulationTemperatureRangeField без условных hooks и без изменения UX.
USER_VISIBLE_SUCCESS:
  - reference material показывает неизменяемый диапазон без warning;
  - material="other" открывает прежнюю modal, применяет min/max и валидирует
    их как раньше;
  - Projects → populated Heat проходит без console warning.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без patch;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)` в отчёт и browser evidence;
  - target-файлы не должны пересекаться с чужим WIP;
  - один owner, один slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - InsulationTemperatureRangeField и ближайший integration test.

ALLOWED_SCOPE:
  - frontend/src/components/wizard/InsulationTemperatureRangeField.tsx;
  - frontend/src/__tests__/integration/components/ObjectWizardDependencies.test.tsx
    либо его уже закоммиченный owner-local successor на BASE_HEAD, но не оба
    без доказанной необходимости.
NON_GOALS:
  - forceRender/lifecycle workaround для reference-ветки;
  - console warning suppression или allowlist;
  - перестройка ObjectWizard;
  - изменение public Props, validation, min/max limits, texts или modal UX;
  - CSS/layout/aesthetic changes.

IMPLEMENTATION:
  - оставь public default export и Props без изменений;
  - вынеси только editable branch `material === "other"` в именованный
    дочерний компонент в том же owner-файле;
  - создавай `Form.useForm<RangeModalValues>()` только внутри реально
    смонтированного editable child;
  - перенеси editable-only state/watchers/handlers в child;
  - hooks не должны вызываться условно внутри одного компонента;
  - reference branch не создаёт modal form и не рендерит hidden modal;
  - Apply/Cancel, keyboard Enter/Space, aria-haspopup/expanded, preserve,
    onRangeChange и validation semantics сохраняются.

CHARACTERIZATION_AND_TEST:
  - reference branch с material из справочника показывает formatted range;
  - reference branch не создаёт editable trigger/modal;
  - editable branch открывает modal с текущими min/max;
  - Apply переносит оба значения в parent form и вызывает onRangeChange;
  - invalid min>=max оставляет modal открытой с прежним сообщением;
  - тест явно собирает console.error/console.warn и падает при
    `useForm is not connected`;
  - warning нельзя скрыть mock-реализацией; scoped spy обязательно
    восстанавливается и не поглощает неожиданные сообщения.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE BROWSER:
  - focused integration spec reference/editable/modal branches;
  - ближайший Heat/ObjectWizard test для validation;
  - `cd frontend && npm run typecheck`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - live путь Projects → populated Heat;
  - reference material и material="other";
  - open/apply/cancel modal на 1000×768 и 1440×1000;
  - screenshot и modal/control bounds, keyboard/focus, page overflow;
  - console без `useForm is not connected`, других warnings/errors и
    unexpected failed requests;
  - 390×844 — только необязательное наблюдение вне DoD.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - baseline не растёт, CSS не меняется;
  - никакой эстетической правки;
  - public props, stable classes/data-testid, API, query keys, formulas,
    units, routing и validation неизменны.

HARD_STOP:
  Условный hook, изменение public contract, warning suppression, недоступный
  browser или любой red focused/browser/DoD proof => BLOCKED без готового
  commit. Верни FILE / BASE_HEAD / EVIDENCE / INVARIANT AT RISK /
  DECISION NEEDED / SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - добавь только разрешённые production/test files;
  - commit:
    `fix(frontend): AF12-HEAT-RANGE-FORM-01 mount editable modal form`;
  - не push;
  - отчёт: BASE_HEAD, branch behavior before→after, warning counts, focused,
    browser, full DoD, commit hash и residual risk.
```

### Prompt 3 — заменить deprecated `InputNumber.addonAfter`

```text
Работай из корня TLT. Выполни ровно один characterization-first UI-kit slice.
Используй Kontur Playwright для live browser evidence.

SLICE_ID: AF12-TLT-NUMBER-ADDON-01
OWNER: ui
GOAL: заменить deprecated InputNumber.addonAfter на Space.Compact с соседним
  неинтерактивным unit element без изменения публичного TltNumberField.
USER_VISIBLE_SUCCESS:
  - input и unit образуют прежний единый control без визуального разрыва;
  - короткие и длинные units не обрезаются;
  - UI Kit и Heat работают без addonAfter deprecation warning.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без patch;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)` в отчёт и browser evidence;
  - target-файлы не содержат чужого WIP;
  - один owner, один slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - TltNumberField, tlt-form-controls owner CSS, compact-field consumers и
    существующие FormControls/UI Kit tests.

ALLOWED_SCOPE:
  - frontend/src/components/form-controls/TltNumberField.tsx;
  - frontend/src/styles/tlt-form-controls.css, только если geometry требует
    owner-local adaptation к Space.Compact;
  - максимум два ближайших test-файла, предпочтительно
    FormControls.test.tsx и ui-kit-heatcalc-parity.spec.ts.
NON_GOALS:
  - изменение TltNumberFieldProps;
  - изменение parser/formatter или RU comma behavior;
  - migration UnitInputNumber или других controls;
  - новая density, spacing, color, border или breakpoint;
  - feature-specific override.

IMPLEMENTATION:
  - используй Ant Space.Compact;
  - InputNumber и unit должны быть соседними children одного compact group;
  - unit остаётся неинтерактивным и `aria-hidden="true"`;
  - полностью удали использование prop `addonAfter`;
  - сохрани классы `tlt-number-field__input` и
    `tlt-number-field__unit`, а также public root classes;
  - сохрани id/name/data-testid, wrapper/input styles, addonClassName,
    disabled/readOnly/required/status, min/max/step и handlers;
  - controlled `null`, uncontrolled `undefined/defaultValue`, clear→null,
    partial input, comma parser, Enter/onPressEnter и wheel-off не меняются.

CHARACTERIZATION_AND_TEST:
  - public API compile contract не меняется;
  - root/input/unit classes присутствуют;
  - unit имеет aria-hidden и не попадает в tab order;
  - controlled value, clear→null и defaultValue не создают
    uncontrolled→controlled warning;
  - keyboard Enter вызывает прежние handlers;
  - required/invalid/disabled ARIA сохраняются;
  - short units: `м`, `мм`, `°C`, `шт`, `м/с`;
  - long unit: `Вт/(м·К)` не clipped;
  - geometry assertion: input и unit одной высоты, их seam отличается не
    более чем на 1 px, между ними нет видимого gap, wrapper не overflow.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE BROWSER:
  - focused FormControls/UIKitLibrary unit tests;
  - focused UI Kit parity geometry spec;
  - `cd frontend && npm run css:architecture && npm run typecheck`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - `/ui-kit`: short и long unit examples;
  - Projects → populated Heat: реальные number fields в форме и insulation;
  - 1000×768 и 1440×1000, дополнительно 1440×900 для primary QA;
  - exact input/unit bounds, seam/gap, clipping, keyboard/focus, page/local
    overflow, screenshots;
  - console без `addonAfter` deprecation, uncontrolled→controlled warnings,
    других warnings/errors и unexpected failed requests;
  - 390×844 не является acceptance.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - architecture/CSS baseline не растёт;
  - CSS меняется только для доказанного сохранения geometry;
  - никакой эстетической правки;
  - stable classes/data-testid, public props, API, query keys, formulas,
    units и routing неизменны.

HARD_STOP:
  Если Space.Compact требует feature override, меняет null/keyboard/ARIA
  semantics или не даёт цельного input/unit на обоих экранах, STOP.
  Browser unavailable либо любой red proof => BLOCKED без готового commit.
  Верни FILE / BASE_HEAD / EVIDENCE / INVARIANT AT RISK / DECISION NEEDED /
  SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - добавь только разрешённые files;
  - commit:
    `fix(frontend): AF12-TLT-NUMBER-ADDON-01 replace deprecated number addon`;
  - не push;
  - отчёт: BASE_HEAD, API/geometry before→after, warning counts, focused,
    browser, full DoD, commit hash и residual risk.
```

### Prompt 4 — перенести popup classes TltSelect на актуальный Ant API

```text
Работай из корня TLT. Выполни ровно один characterization-first UI-kit slice.
Используй Kontur Playwright для live browser evidence.

SLICE_ID: AF12-TLT-SELECT-POPUP-01
OWNER: ui
GOAL: заменить deprecated popupClassName на classNames.popup.root, сохранив
  popup/listbox classes и публичное поведение TltSelect.
USER_VISIBLE_SUCCESS:
  - Select открывается, выбирает значение и очищается как раньше;
  - портал получает все прежние Tlt/custom classes;
  - UI Kit и Heat не печатают popupClassName deprecation warning.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без patch;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)` в отчёт и browser evidence;
  - target-файлы не содержат чужого WIP;
  - один owner, один slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - TltSelect, tlt-form-controls popup selectors и существующие Select tests.

ALLOWED_SCOPE:
  - frontend/src/components/form-controls/TltSelect.tsx;
  - frontend/src/__tests__/unit/components/TltSelect.allowClear.test.tsx;
  - при доказанной необходимости один существующий focused Select test, без
    CSS patch.
NON_GOALS:
  - изменение TltSelectProps;
  - переход на встроенный Ant allowClear;
  - изменение option mapping, typed values или portal container;
  - CSS, density, geometry, copy или breakpoint changes;
  - зависимость теста от лишних Ant DOM деталей.

IMPLEMENTATION:
  - удали prop popupClassName;
  - передай тот же join классов через `classNames.popup.root`;
  - обязательно сохрани:
    `tlt-select__popover`,
    `tlt-select__listbox`,
    `popoverClassName`,
    `listBoxClassName`;
  - сохрани getPopupContainer, trigger classes, value/defaultValue,
    disabled options, clear→null, hidden name input, ARIA и data-testid.

CHARACTERIZATION_AND_TEST:
  Один focused test обязан:
  - render TltSelect с distinct popoverClassName и listBoxClassName;
  - открыть портал реальным user interaction;
  - найти portal under document.body;
  - доказать наличие обоих стабильных Tlt-классов и обоих custom classes на
    popup root;
  - выбрать другое typed value и доказать onChange;
  - закрыть/переоткрыть при необходимости и доказать allowClear→null;
  - явно падать при popupClassName deprecation warning;
  - не подавлять другие console warnings/errors.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE BROWSER:
  - focused TltSelect portal/allowClear tests;
  - ближайший FormControls Select test;
  - `cd frontend && npm run typecheck`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - `/ui-kit` с открытым Select portal;
  - Projects → populated Heat с открытым реальным Select;
  - 1000×768 и 1440×1000;
  - popup screenshot, trigger/popup/listbox bounds, option selection,
    keyboard/focus и allowClear;
  - page/local overflow, console и failed requests;
  - console без `popupClassName` deprecation и других warnings/errors;
  - 390×844 не является acceptance.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - baseline не растёт, CSS не меняется;
  - никакой эстетической правки;
  - public props, stable classes/data-testid, API, query keys, formulas,
    units и routing неизменны.

HARD_STOP:
  Потеря любого popup/listbox class, typed value, clear, keyboard/ARIA
  behavior, недоступный browser или red proof => BLOCKED без готового commit.
  Верни FILE / BASE_HEAD / EVIDENCE / INVARIANT AT RISK / DECISION NEEDED /
  SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - добавь только разрешённые production/test files;
  - commit:
    `fix(frontend): AF12-TLT-SELECT-POPUP-01 migrate popup class API`;
  - не push;
  - отчёт: BASE_HEAD, portal classes, behavior before→after, warning counts,
    focused, browser, full DoD, commit hash и residual risk.
```

### Prompt 5 — аудит CSS ownership для файлов `>400 LOC`

```text
Работай из корня TLT. Выполни ровно один docs-only CSS ownership audit.
Production CSS, TS/TSX, tests и baselines не меняй. Используй Kontur Playwright
для подтверждения browser states, привязанных к владельцам.

SLICE_ID: AF12-CSS-OWNER-MAP-01
OWNER: css
GOAL: отличить крупный, но цельный CSS owner от реально смешанного ownership.
USER_VISIBLE_SUCCESS:
  Следующий agent получает доказанную карту владельцев/seams и знает, каким
  live state ловить regression; LOC не превращается в самоцель.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без audit commit;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)`, UTC, environment и команды;
  - один owner, один docs-only slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - все CSS >400 LOC, их import sites, selector consumers и nearby tests.

ALLOWED_SCOPE:
  - новый
    docs/audit/<date>-af12-css-owner-map/snapshot.md.
NON_GOALS:
  - production/test/CSS patch;
  - уменьшение LOC;
  - перенос selector family;
  - повышение/изменение baseline;
  - предложение split только потому, что файл длинный.

INVENTORY:
  - воспроизводимо пересчитай total LOC frontend/src/**/*.css;
  - перечисли все CSS >400 LOC на текущем BASE_HEAD;
  - planning seed c03498b: 10 247 total и восемь файлов:
    ui-kit.css, elec-workspace.css, primitives.css, compact-fields.css,
    heatcalc-field-chrome-core.css, table-chrome.css,
    calc-spreadsheet-base.css, elec-workspace-summary.css;
  - если текущий список отличается, зафиксируй новый факт и причину diff,
    не подгоняй его под planning seed.

ДЛЯ КАЖДОГО ФАЙЛА ОБЯЗАТЕЛЬНО:
  - реальный feature/component owner по imports и DOM roots;
  - независимые responsibilities/selector families;
  - foreign selectors и фактический consumer каждого;
  - все direct import sites и порядок CSS imports;
  - зависимости от tokens, shared chrome и owner roots;
  - responsive blocks, canonical breakpoint и связанный base selector;
  - cascade/order/specificity связи, мешающие безопасному move;
  - ближайшие automated tests;
  - точный live browser state + viewport, способный обнаружить regression;
  - verdict: COHESIVE_LARGE, MIXED_OWNERSHIP, либо BLOCKED_UNKNOWN;
  - только для MIXED_OWNERSHIP: минимальный первый seam и его proof.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE BROWSER:
  - воспроизводимая LOC-команда повторно даёт таблицу snapshot;
  - `cd frontend && npm run css:architecture`;
  - markdown links/paths существуют;
  - `git diff --check`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - live representative state для каждого distinct owner из карты;
  - минимум UI Kit, populated Electrical grid/summary и populated Heat;
  - shared table/spreadsheet files должны быть привязаны к реальному consumer
    state, а не к абстрактной странице;
  - минимум 1440×1000 и один релевантный edge viewport из viewport-policy;
  - screenshots/geometry, page/local overflow, console warnings/errors и
    failed requests записываются в snapshot;
  - 390×844 может быть наблюдением, но не acceptance.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - никакого baseline growth;
  - CSS и внешний вид вообще не меняются;
  - audit не объявляет большой цельный файл проблемой только по LOC.

HARD_STOP:
  Невозможность доказать owner/import/cascade либо недоступный browser/red
  proof => snapshot status BLOCKED и без готового commit. Не исправляй
  найденный CSS в audit slice. Верни FILE / BASE_HEAD / EVIDENCE /
  INVARIANT AT RISK / DECISION NEEDED / SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - добавь только новый snapshot;
  - commit:
    `docs(frontend): AF12-CSS-OWNER-MAP-01 audit CSS ownership`;
  - не push;
  - отчёт: BASE_HEAD, total/list, cohesive vs mixed verdicts, focused,
    browser, full DoD, commit hash и residual risk.
```

### Prompt 6 — перенести responsive CSS в владельцев UI Kit showcase

```text
Работай из корня TLT. Выполни ровно один characterization-first CSS ownership
slice. Используй Kontur Playwright и before/after geometry evidence.

SLICE_ID: AF12-UIKIT-RESPONSIVE-OWNER-01
OWNER: ui
GOAL: убрать доказанные foreign responsive selector families из общего
  ui-kit.css в уже существующие Heat reference и primitives showcase owners.
USER_VISIBLE_SUCCESS:
  Desktop geometry `/ui-kit` идентична BASE_HEAD; изменяется только место
  владения declarations.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без patch;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)` в отчёт и before evidence;
  - target-файлы не содержат чужого WIP;
  - один owner, один slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - AF12-CSS-OWNER-MAP-01 snapshot;
  - UIKitPage import order и три target CSS полностью.

ALLOWED_SCOPE:
  - frontend/src/pages/ui-kit.css;
  - frontend/src/pages/ui-kit-heatcalc-reference.css;
  - frontend/src/pages/ui-kit-primitives-showcase.css;
  - максимум два existing focused CSS/UI Kit test files.
NON_GOALS:
  - новый design;
  - изменение declarations, specificity, media conditions или breakpoint;
  - selector rename;
  - import reorder;
  - token/palette migration;
  - исправление существующего mobile overflow.

CHARACTERIZATION_BEFORE_PATCH:
  На чистом BASE_HEAD сохрани `/ui-kit` screenshot и computed geometry для
  затронутых blocks на 1000×768, 1280×800, 1440×900, 1440×1000,
  1920×1080. Зафиксируй applied rules/computed values и import order.

IMPLEMENTATION:
  - перенеси все responsive rules, rooted in `.uikit-heatcalc-*`, из
    ui-kit.css в ui-kit-heatcalc-reference.css;
  - перенеси оставшиеся `.uikit-alerts`, `.uikit-primitive-*` и
    `.uikit-metrics` rules из ui-kit.css в
    ui-kit-primitives-showcase.css;
  - если foreign selector входит в общий selector list, механически раздели
    list, сохранив declaration block для остальных selectors;
  - сохрани declaration text, selector specificity, canonical media
    conditions и relative order внутри каждого owner;
  - сохрани существующий import order UIKitPage:
    ui-kit.css → ui-kit-primitives-showcase.css →
    ui-kit-heatcalc-reference.css;
  - после move не оставляй дублей и не добавляй compatibility overrides.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE AFTER-BROWSER:
  - exact selector inventory before→after: foreign families отсутствуют в
    ui-kit.css и существуют ровно один раз у правильного owner;
  - `cd frontend && npm run css:architecture`;
  - focused UI Kit/parity tests;
  - `git diff --check`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - live `/ui-kit` after-state на тех же
    1000×768, 1280×800, 1440×900, 1440×1000, 1920×1080;
  - нулевая desktop geometry regression: сравни bounds, computed display/grid,
    gaps, padding, borders и overflow с BASE_HEAD;
  - Heat reference/action bar/form/table и primitives alerts/tabs/metrics;
  - screenshots, keyboard/focus, console warnings/errors и failed requests;
  - 390×844 разрешено сравнить before/after только как observation;
    не объявляй его supported viewport и не исправляй pre-existing overflow.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - architecture/CSS baseline не растёт;
  - никакой эстетической правки;
  - stable classes/data-testid, public props, API, query keys, formulas,
    units и routing неизменны.

HARD_STOP:
  Любое computed/geometry отличие, необходимость нового override/breakpoint,
  недоступный browser или red proof => BLOCKED без готового commit. Не
  «исправляй» отличие новым design declaration. Верни FILE / BASE_HEAD /
  EVIDENCE / INVARIANT AT RISK / DECISION NEEDED / SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - добавь только разрешённые CSS/test files;
  - commit:
    `refactor(frontend): AF12-UIKIT-RESPONSIVE-OWNER-01 move showcase owners`;
  - не push;
  - отчёт: BASE_HEAD, selector/import/cascade before→after, geometry matrix,
    focused, browser, full DoD, commit hash и residual risk.
```

### Prompt 7 — полный browser final seal

```text
Работай из корня TLT. Выполни один read-only browser/QA slice после всех AF12
production-срезов. Production, tests, harness и existing audits не меняй.
Используй Kontur Playwright последовательно по feature area.

SLICE_ID: AF12-BROWSER-FINAL-SEAL-01
OWNER: qa
GOAL: запечатать всю обязательную browser-state-matrix на одном production
  HEAD и добавить AF12-critical Heat/UI-kit evidence.
USER_VISIBLE_SUCCESS:
  Полный desktop state × viewport contract имеет screenshots, geometry,
  console и network evidence; отсутствующая строка блокирует PASS.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без evidence commit;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)` во все rows;
  - проверь, что AF12 production slices 01/02/03/04/06 завершены;
  - один owner, один QA slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md целиком;
  - AF12 production commit reports и существующий evidence schema.

ALLOWED_SCOPE:
  - новый docs/audit/<date>-af12-browser-final/snapshot.md;
  - evidence.json/manifest.json и screenshots/geometry под тем же новым
    audit-каталогом.
NON_GOALS:
  - production/test/harness fix;
  - пропуск труднодостижимого state;
  - reuse screenshots другого HEAD;
  - silent DB/API bypass без user-behavior mapping;
  - mobile redesign.

FOCUSED_PROOF, СТРОГО ПЕРЕД ПОЛНОЙ BROWSER MATRIX:
  - stack/auth/seed smoke;
  - validate evidence schema и required row inventory;
  - проверить, что каждый state из browser-state-matrix имеет action path и
    требуемый viewport list;
  - `git diff --check` для пустого preflight.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  Выполни всю docs/frontend/browser-state-matrix.md последовательно:
  1. Projects;
  2. Heat;
  3. Electrical;
  4. Specification;
  5. Reports;
  6. дополнительный UI Kit AF12 seal.

  Для каждой обязательной `(area, state_id, viewport)` строки:
  - exact BASE_HEAD и captured_at_utc;
  - visible action_path и settled URL;
  - fixture/seed с описанием представляемого user behavior;
  - screenshot;
  - key bounds/geometry и sibling overlaps;
  - page-level и owner-region clientWidth/scrollWidth overflow;
  - keyboard/focus result;
  - page errors, console errors и console warnings с excerpts;
  - failed requests; intentional error injection назвать явно;
  - result pass/fail/blocked и blocker.

  Обязательные AF12 additions:
  - Heat empty, populated и handled error;
  - Heat populated с 1 и 3 insulation layers;
  - Heat geometry contract на всей desktop matrix из Prompt 1;
  - visible Projects → populated Heat path;
  - reference и editable temperature range modal;
  - `/ui-kit` с short/long TltNumberField unit;
  - `/ui-kit` и Heat с открытым TltSelect popup;
  - console не содержит четыре patterns:
    uncontrolled→controlled,
    `useForm is not connected`,
    `addonAfter` deprecation,
    `popupClassName` deprecation.

  Viewport application берётся только из browser-state-matrix и
  viewport-policy. `1440×1000` обязателен для каждой selected state;
  dense/shell/wide profiles добавляются по matrix. `390×844` можно записать
  только отдельным observation с `required=false`; он не заменяет desktop и
  не входит в acceptance.

FULL_PROOF, ТОЛЬКО ПОСЛЕ ЗАВЕРШЕНИЯ ВСЕЙ BROWSER MATRIX:
  `cd frontend && npm run test:agent-dod`

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - никакого baseline growth;
  - production/CSS/UI aesthetics не меняются;
  - public props, stable classes/data-testid, API, query keys, formulas,
    units и routing неизменны.

PASS_RULE:
  PASS запрещён, если отсутствует хотя бы одна required row, screenshot,
  geometry, console или network result, state недостижим, HEAD различается
  между rows либо DoD красный.

HARD_STOP:
  Browser/Kontur/stack/auth unavailable, missing state или red evidence =>
  BLOCKED без готового commit. Не исправляй production внутри QA slice.
  Верни FILE / BASE_HEAD / EVIDENCE / INVARIANT AT RISK / DECISION NEEDED /
  SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_FULL_PASS:
  - добавь только новый audit/evidence каталог;
  - commit:
    `docs(frontend): AF12-BROWSER-FINAL-SEAL-01 seal browser matrix`;
  - не push;
  - отчёт: BASE_HEAD, row counts required/pass, area/viewports, AF12 additions,
    console/network totals, full DoD, commit hash и residual risk.
```

### Prompt 8 — доказать повторяемость canonical DoD

```text
Работай из корня TLT. Выполни один tooling/repeatability slice. Сначала
измерения без harness patch; изменение разрешено только при непройденном
acceptance. Используй temporary logs вне git и Kontur Playwright для
same-production-tree smoke.

SLICE_ID: AF12-DOD-REPEATABILITY-01
OWNER: tooling
GOAL: доказать median <=120 s либо >=20% ускорение без потери полноты и
  изоляции canonical `npm run test:agent-dod`.
USER_VISIBLE_SUCCESS:
  Три последовательных green DoD и dual-concurrent run воспроизводимы на
  одном HEAD; canonical gate остаётся полным.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без patch;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)`, UTC, machine/environment,
    Node/npm versions и warm node_modules state;
  - один owner, один tooling slice, один commit;
  - logs храни только в mktemp directory.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - frontend/package.json и frontend/scripts/agent-dod.mjs;
  - AF12 browser final seal и предыдущий AF11 feedback profile.

ALLOWED_SCOPE:
  Всегда:
  - новый docs/audit/<date>-af12-dod-repeatability/snapshot.md.
  Только если baseline acceptance не достигнут и profile доказал причину:
  - frontend/scripts/agent-dod.mjs;
  - минимальная command wiring в frontend/package.json;
  - один focused harness self-test.
NON_GOALS:
  - feature production/test changes;
  - сокращение suites, coverage, assertions, timeout или isolation;
  - exclude/skip/only/serial workaround;
  - подавление stderr/console;
  - ослабление architecture gates или production build;
  - cache reuse, нарушающий test isolation/correctness.

BASELINE_MEASUREMENT_BEFORE_ANY_HARNESS_CHANGE:
  - один uncounted warm-up при необходимости;
  - три последовательных warm `npm run test:agent-dod`;
  - для каждого: exact HEAD, exit code, total wall time, phase durations,
    unit/integration test counts, build result;
  - min/median/max;
  - baseline считается принятым без patch, если median <=120 s;
  - planning evidence около 155 s не заменяет эти три измерения.

IF_BASELINE_MEDIAN_GT_120S:
  - профилируй только orchestration, caching и isolation overhead;
  - сохраняй точный порядок gates → full unit+integration → build;
  - сохраняй полный набор suites/tests/coverage/assertions/timeouts;
  - сохраняй семантику process/test isolation и failure propagation;
  - внеси только минимальный доказанный harness patch;
  - after acceptance: median <=120 s ИЛИ
    (baselineMedian-afterMedian)/baselineMedian >=0.20.
  Если безопасного patch нет, STOP, не трогай tests/features.

FOCUSED_PROOF, СТРОГО ПЕРЕД BROWSER SMOKE:
  - harness self-test/failure propagation;
  - exact command inclusion сравнение before→after;
  - test counts и build inclusion совпадают;
  - `cd frontend && npm run test:agent-gates`;
  - `git diff --check`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - докажи, что `frontend/src` production tree не изменился относительно
    AF12 browser seal; любое отличие требует полного reseal;
  - live smoke на 1440×1000: Projects → populated Heat, 1/3 layers,
    NumberField unit и открытый Select;
  - screenshots/geometry, console warnings/errors и failed requests;
  - 390×844 не является acceptance.

FULL_REPEATABILITY_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  На одном candidate HEAD:
  - три последовательных `npm run test:agent-dod`, все green;
  - затем два полных `npm run test:agent-dod` одновременно, оба green;
  - записать exact per-run/phase timings, exit codes, counts и HEAD;
  - after median считать только по трём последовательным runs;
  - dual-concurrent не заменяет ни один из трёх runs.

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - architecture/CSS/test baseline не растёт;
  - UI/CSS/aesthetics не меняются;
  - public props, stable classes/data-testid, API, query keys, formulas,
    units и routing неизменны.

HARD_STOP:
  Median не выполняет ни один threshold, test count/build/gate изменился,
  isolation ослаблена, browser unavailable либо любой run красный =>
  BLOCKED без готового commit. Не сокращай acceptance ради результата.
  Верни FILE / BASE_HEAD / EVIDENCE / INVARIANT AT RISK / DECISION NEEDED /
  SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_GREEN:
  - при no-code acceptance добавь только snapshot и используй commit:
    `docs(frontend): AF12-DOD-REPEATABILITY-01 record repeatable DoD`;
  - при доказанном harness improvement добавь только harness/self-test и
    snapshot и используй commit:
    `perf(frontend): AF12-DOD-REPEATABILITY-01 improve DoD orchestration`;
  - не push;
  - отчёт: BASE_HEAD/candidate HEAD, before→after median, improvement percent,
    3× results, dual results, counts, browser smoke, commit hash и residual
    risk.
```

### Prompt 9 — финальный AF12 audit и closure

```text
Работай из корня TLT. Выполни один read-only final QA audit, затем docs-only
closure только при полном PASS. Production, tests, harness и старые audits не
исправляй внутри этого slice. Используй Kontur Playwright для critical live
revalidation.

SLICE_ID: AF12-FINAL-AUDIT-01
OWNER: qa
GOAL: пересчитать практическую agent-friendliness на текущем дереве и закрыть
  AF12 только при выполнении всего residual contract.
USER_VISIBLE_SUCCESS:
  Итоговый audit не смешивает LOC с ownership complexity и содержит
  воспроизводимые ссылки на geometry, warning, browser и DoD evidence.

PRECHECK:
  - `git status --short` обязан быть пуст; иначе BLOCKED без closure commit;
  - запиши `BASE_HEAD=$(git rev-parse HEAD)`, UTC и environment;
  - проверь цепочку отдельных AF12 commits;
  - один owner, один QA/docs closure slice, один commit.

READ_FIRST:
  - frontend/AGENTS.md;
  - docs/frontend/agent-development-standard.md;
  - docs/frontend/agent-refactor-prompt.md;
  - docs/frontend/pr-budget.md;
  - docs/frontend/css-strategy.md;
  - docs/frontend/ui-kit.md;
  - docs/frontend/viewport-policy.md;
  - docs/frontend/browser-state-matrix.md;
  - этот AF12 prompt-pack;
  - AF12 CSS owner map, browser final seal и DoD repeatability snapshots;
  - текущий runtime/tests, не только старые audit claims.

ALLOWED_SCOPE:
  - новый docs/audit/<date>-af12-agent-friendliness/snapshot.md;
  - docs/frontend/af12-agent-friendliness-residual-prompts.md только для
    честной смены статуса на CLOSED/PASS;
  - refactor-backlog.md только если AF12 slice был явно ACTIVE pending.
NON_GOALS:
  - production/test/harness fix;
  - правка historical audit;
  - score inflation;
  - создание второй pending queue;
  - объявление optional для отсутствующего обязательного proof.

RECOMPUTE_FROM_TREE_AND_EVIDENCE:
  1. Heat insulation geometry:
     - 1000×768, 1280×800, 1366×768, 1440×900,
       1440×1000, 1920×1080;
     - 1/3 layers;
     - layers-host >=85% fields-host;
     - table fill, local/page overflow <=2 px;
     - no hidden/clipped/overlapping controls or labels.
  2. Console warning patterns, все должны быть 0:
     - uncontrolled→controlled;
     - `useForm is not connected`;
     - InputNumber `addonAfter` deprecation;
     - Select `popupClassName` deprecation.
  3. Browser final seal:
     - каждая required row browser-state-matrix присутствует и pass;
     - screenshots/geometry/console/network относятся к одному sealed
       production HEAD;
     - после seal нет browser-facing production diff;
     - Projects → populated Heat и AF12 UI Kit additions присутствуют.
  4. DoD repeatability:
     - accepted 3-run median <=120 s либо >=20% improvement;
     - три последовательных green;
     - dual-concurrent 2/2 green;
     - одинаковые suites/counts/build/isolation на одном candidate HEAD.
  5. CSS ownership:
     - total и >400 list пересчитаны;
     - каждый крупный файл классифицирован по owner/responsibilities;
     - cohesive large files не штрафуются только за LOC;
     - mixed ownership имеет foreign selectors, import/cascade evidence и
       regression-detecting browser state.
  6. Stable contracts/baselines:
     - public props, API, query keys, formulas, units, routing,
       stable classes/data-testid неизменны;
     - no !important/raw colors/global Ant override/random breakpoint growth;
     - все architecture/CSS baselines non-growing.

FOCUSED_PROOF, СТРОГО ПЕРЕД LIVE BROWSER:
  - воспроизводимые current-tree scans для CSS LOC и forbidden debt;
  - validate все audit links, manifests, row counts и HEAD relationships;
  - `cd frontend && npm run test:agent-gates`;
  - `git diff --check`.

BROWSER_PROOF, ПОСЛЕ FOCUSED:
  - critical live revalidation на 1440×1000 и 1000×768:
    Projects → populated Heat, Heat empty/error/populated, 1/3 layers,
    editable range modal, NumberField unit, открытый Select;
  - geometry/overflow, keyboard/focus, screenshots;
  - console four-pattern count = 0, errors = 0;
  - unexpected failed requests = 0;
  - полная acceptance всё равно берётся из final seal, smoke её не заменяет;
  - 390×844 фиксируется только как observation вне DoD.

FULL_PROOF, ТОЛЬКО ПОСЛЕ BROWSER:
  `cd frontend && npm run test:agent-dod`

PASS_RULE:
  AF12 можно закрыть только если одновременно:
  - Heat geometry green на всей desktop matrix;
  - все четыре warning patterns отсутствуют;
  - browser matrix полностью запечатана;
  - DoD median и dual-concurrent подтверждены;
  - CSS audit различает размер файла и реальную ownership complexity;
  - focused, browser и fresh full DoD green.

STYLE_AND_BASELINE_GUARDS:
  - no !important, raw colors, global Ant overrides, random breakpoints;
  - никакого baseline growth;
  - production/CSS/UI aesthetics не меняются;
  - audit не переписывает evidence и не заявляет незапущенные проверки.

HARD_STOP:
  Любой missing/red/stale/different-HEAD proof, недоступный browser или
  непройденный acceptance => status BLOCKED, AF12 остаётся открытым, score не
  повышается и готовый closure commit запрещён. Не исправляй defect внутри
  audit. Верни FILE / BASE_HEAD / EVIDENCE / INVARIANT AT RISK /
  DECISION NEEDED / SAFE NEXT SLICE.

COMMIT_IF_AND_ONLY_IF_FULL_PASS:
  - добавь только новый audit, status change этого runbook и условный backlog
    closure, если он действительно был ACTIVE;
  - commit:
    `docs(frontend): AF12-FINAL-AUDIT-01 close residual hardening`;
  - не push;
  - отчёт: BASE_HEAD, practical score/rubric, каждый acceptance result,
    warning counts, browser row counts, DoD median/dual, CSS ownership
    verdicts, commit hash и residual risk.
```

## 6. Definition of Done программы

AF12 закрыт только когда:

- Heat geometry проходит всю desktop-матрицу для одного и трёх слоёв;
- uncontrolled→controlled, `useForm is not connected`, `addonAfter` и
  `popupClassName` warning patterns имеют нулевой count;
- browser-state-matrix полностью запечатана same-production-HEAD evidence;
- canonical DoD выполняет принятый median threshold и dual-concurrent proof;
- CSS owner map отличает большой цельный файл от mixed ownership;
- все production-срезы сохранили публичные интерфейсы и не внесли
  эстетических изменений;
- каждый slice имеет собственные owner, BASE_HEAD, green focused/browser/full
  proof и отдельный commit.

`390×844` не входит в обязательный DoD. Его можно сохранять как наблюдение, но
нельзя использовать ни для объявления mobile support, ни как причину
расширить любой AF12 slice.
