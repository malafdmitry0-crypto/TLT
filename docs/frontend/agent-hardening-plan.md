# План доведения frontend до agent-safe состояния

**Актуально на:** 2026-07-23  
**Статус:** исполняемый hardening backlog после закрытия thin shells и CSS strangler  
**Текущий pending:** **B6** (IMP0/IMP1/B1–B5 done)
**Цель:** агент должен быстро находить владельца поведения, получать зелёную и
однозначную обратную связь и не иметь возможности незаметно вернуть god-файлы,
глобальный CSS или обратные зависимости.

Этот документ не предлагает переписывать frontend заново. Он закрывает остаточные
проблемы поверх уже выполненных M3/M4:

- shell-страницы Heat / Electrical / Specification ≤ 500 LOC;
- `styles.css` превращён в freeze-stub;
- `components → pages` allowlist пуст;
- feature boundaries и wizard isolation существуют.

## 1. Текущий baseline

Значения нужно переснять перед первым slice, если `HEAD` изменился.

| Проверка / метрика | Текущее состояние | Финальная цель |
|---|---:|---:|
| `npm run test:s0-gates` | 15/15 ✅ | green |
| `npm run typecheck` | 17 ошибок ❌ | green |
| `npm run lint` | 6 errors, 13 warnings ❌ | 0 errors; warnings только с обоснованием |
| focused regression tests | 1 failing ❌ | green |
| `styles.css` | 14 LOC ✅ | freeze-stub, без feature rules |
| весь CSS | ~9150 LOC | размер не KPI; один владелец на правило |
| `heatcalc-workspace.css` | 2561 LOC | ≤ 900 LOC на один coherent CSS owner |
| `!important` | 475 | немедленный ratchet; hardening DoD ≤ 150, long-term ≤ 75 |
| production TS/TSX > 500 LOC | 22 | не растёт; target hotspots ниже |
| production TS/TSX > 800 LOC | 5 | 0 |
| `useElecCalcWorkspaceModel` | 1086 LOC | ≤ 650 / ≤ 30 imports |
| `useHeatCalcPageModel` | 830 LOC | ≤ 500 |
| `HeatCalcNormalGlideGrid` | 1191 LOC | ≤ 700 |
| `ObjectWizard` | 776 LOC | ≤ 500 |
| `useElectricalVariantSelection` | 726 LOC | ≤ 450 |
| CSS architecture gate | отсутствует | обязателен |
| complexity / cycle gate | отсутствует | обязателен |
| coverage thresholds | отсутствуют | baseline ratchet |

## 2. Общие правила для всех агентов

1. Перед работой прочитать:
   - `docs/frontend/agent-hardening-plan.md`;
   - `docs/frontend/pr-budget.md`;
   - релевантный production-файл и существующие тесты.
2. Проверить `git status --short`. Чужой WIP не изменять и не форматировать.
3. Один slice = один домен и одна причина изменения.
4. Сначала characterization, затем production-код.
5. Не менять UX, API payload, query keys, invalidation, route semantics, формулы
   или CSS-внешний вид, если slice прямо этого не требует.
6. Не лечить ошибку через `any`, `as unknown as`, `@ts-ignore`, ослабление
   assertion или удаление теста.
7. Не дробить файл только ради LOC. Extract должен иметь имя use-case,
   явные inputs/outputs и самостоятельный тестовый контракт.
8. После каждого slice показать:
   - изменённые файлы;
   - before/after метрику;
   - выполненные команды и результаты;
   - остаточный риск;
   - следующий ID из этого плана.
9. Коммит: один conventional commit на один зелёный slice.
10. Hard stop:
    - бизнес-правило неоднозначно;
    - нужен touch формул, `InsulationLayersTable` или ER UUID semantics;
    - scope не помещается в PR budget;
    - обнаружен чужой незакоммиченный файл в том же scope.

## 3. Финальный Definition of Done

Hardening считается завершённым только когда одновременно:

```text
npm run lint                 green
npm run typecheck            green
npm run build                green
npm run test:s0-gates        green
npm run test:unit            green
npm run test:integration     green
npm run test:agent-gates     green
relevant Playwright smokes   green
git status --short           empty
```

Дополнительно:

- новый production TS/TSX файл не превышает 500 LOC без allowlist и причины;
- существующие hotspot caps не растут;
- новый CSS не попадает в `styles.css`;
- `!important` ≤ 150, каждый оставшийся случай имеет owner/reason/test;
- bare `.ant-*`, CSS specificity и CSS hotspot caps не растут;
- нет новых `components/hooks/utils → pages` зависимостей;
- нет Heat ↔ Electrical ↔ Specification deep imports;
- документация указывает ровно один следующий pending slice.

## 4. Очередь выполнения

### Phase P-1 — немедленно остановить рост `!important`

Этот трек имеет наивысший приоритет. `IMP0` выполняется до любых параллельных
задач, потому что между двумя аудитами количество уже выросло с 470 до 475.

| ID | Scope | Результат | Зависит |
|---|---|---|---|
| **IMP0** | `done` | per-file ratchet `cssImportantRatchet.architecture.test.ts` + baseline 475 | — |
| **IMP1** | `done` | inventory `css-important-inventory.md` | top-5 owners ~80%; sum=475 matches IMP0 | IMP0 |

### Phase P0 — восстановить доверие к baseline

P0 выполняется раньше любых новых архитектурных extracts.

| ID | Scope | Результат | Зависит |
|---|---|---|---|
| **B1** | `done` | UI primitives readonly TltTable columns/rows | readonly contract | — |
| **B2** | test fixture drift | elec summary + heat draft fixtures типобезопасны | — |
| **B3** | `done` | TltSelect.allowClear + clear control | form-control + CableAlgorithm | B1 |
| **B4** | `done` | ObjectWizard wide props | dead `geometryTitle` removed (banner fixed «Расчёт теплопотерь») | — |
| **B5** | `done` | Electrical variant recoveryNotice null + cable type normalize fallback | — |
| **B6** | Report cleanup | unused code + Report focused tests green | — |
| **B7** | Specification effect contract | exhaustive-deps warning закрыт тестом | — |
| **B8** | test lint cleanup | оставшиеся test-only lint errors закрыты | B1–B7 |
| **B9** | baseline integration | lint/typecheck/build/focused suites green | B1–B8 |

### Phase P1 — добавить автоматические agent gates

| ID | Scope | Результат | Зависит |
|---|---|---|---|
| **G1** | единая команда | `test:agent-gates` с понятным порядком проверок | B9 |
| **G2** | complexity ratchet | LOC/import/effect caps и baseline hotspot allowlist | B9 |
| **G3** | dependency/cycle ratchet | все запрещённые направления + cycles | B9 |
| **G4** | CSS architecture ratchet | `styles.css`, `!important`, root, size, specificity | B9 |
| **G5** | coverage ratchet | текущий coverage становится floor, не «80% из воздуха» | G1 |

### Phase P1.5 — приоритетное сокращение `!important`

После зелёного baseline и полного G4 этот трек выполняется раньше model-thin и
UI-kit expansion. Один PR удаляет `!important` только из одного selector family.

| ID | Owner | Сейчас | Hardening target | Зависит |
|---|---|---:|---:|---|
| **IMP2** | `compact-fields.css` | 115 | ≤ 40 | B3, G4 |
| **IMP3** | Heat workspace owner files | 106 | ≤ 35 суммарно | CSS1–CSS4, G4 |
| **IMP4** | `insulation-layers-table.css` | 88 | ≤ 25 | G4, kill-list proof |
| **IMP5** | `cable-algorithm-panel.css` | 45 | ≤ 15 | B3, G4 |
| **IMP6** | `heat-object-fields.css` | 28 | ≤ 10 | G4 |
| **IMP7** | остальные CSS-файлы | 93 | ≤ 25 суммарно | IMP2–IMP6 |

Milestones:

```text
475 → ≤350  первый burn-down milestone
≤350 → ≤250 второй milestone
≤250 → ≤150 hardening DoD
≤150 → ≤75  long-term, только доказанные third-party/inline conflicts
```

### Phase P2 — уменьшить оставшиеся hotspots

| ID | Scope | Результат | Зависит |
|---|---|---|---|
| **CSS1** | Heat CSS inventory | карта секций и owners, без изменения CSS | G4 |
| **CSS2** | Heat workspace shell CSS | layout/chrome вынесен move-only | CSS1 |
| **CSS3** | Heat wizard-form CSS | dual-form/form chrome у владельца | CSS2 |
| **CSS4** | Heat insulation page CSS | page-scope insulation rules у владельца | CSS3 |
| **ELEC1** | Elec workspace table controller | coherent controller + characterization | G2/G3 |
| **ELEC2** | Elec candidate controller | candidate workflow отделён от main table | ELEC1 |
| **ELEC3** | Elec workspace presentation model | return assembly без JSX callbacks в god hook | ELEC2 |
| **HEAT1** | Heat workspace data controller | query/drafts/data lifecycle boundary | G2/G3 |
| **HEAT2** | Heat interaction controller | grid/excel/selection boundary | HEAT1 |
| **GRID1** | Normal Glide pure model | drawing/math/hit-testing вне React component | G2 |
| **WIZ1** | ObjectWizard reference data | queries/options вынесены в один owner hook | G2/G3 |
| **WIZ2** | ObjectWizard form sync | required-field/name sync в отдельном hook | WIZ1 |
| **VAR1** | variant reconciliation | route/store/query selection отделены от commands | G2/G3 |
| **VAR2** | variant commands | create/copy/rename/activate/delete controller | VAR1 |

### Phase P3 — унифицировать повторяемый UI и закрыть документацию

| ID | Scope | Результат | Зависит |
|---|---|---|---|
| **UI1** | Heat repeated field family | один реальный участок использует Tlt contract | B9/G4 |
| **UI2** | Specification params | повторяемые controls через form layer | UI1 |
| **DOC1** | plan/status cleanup | один SoT, без E8/C4/1194 stale pointers | все completed slices |
| **FINAL1** | final audit | все DoD commands + browser evidence | всё выше |

## 5. Безопасная параллельность

Максимально полезная конфигурация: три исполнителя и один интегратор.

```text
После clean HEAD:
  Integrator: IMP0 → IMP1      (сначала freeze + inventory)

После IMP0:
  Agent A: B1 → B3 → B4       (ui-kit / wizard)
  Agent B: B2 → B7 → B8       (test fixtures / specification)
  Agent C: B5 → B6            (electrical / report, последовательно)
  Integrator: B9

После B9:
  Agent A: G2
  Agent B: G3
  Agent C: G4
  Integrator: G1 → G5

После gates:
  Priority CSS:    IMP2; CSS1 → CSS2 → CSS3 → CSS4 → IMP3
                   IMP4; IMP5; IMP6 → IMP7
  Electrical lane: ELEC1 → ELEC2 → ELEC3 → VAR1 → VAR2
  Heat lane:       HEAT1 → HEAT2 → GRID1 → WIZ1 → WIZ2
```

Нельзя параллелить два slice, которые меняют один production-файл,
`frontend/package.json`, один architecture test или один CSS owner.
Model-thin lanes не получают приоритет над незавершёнными IMP2–IMP7.

## 6. Обязательный префикс для промптов

При выдаче задания агенту скопировать этот блок и один task-блок ниже.

```text
Ты работаешь в /Users/dmalafey/Desktop/TLT.

Сначала прочитай полностью:
1. docs/frontend/agent-hardening-plan.md
2. docs/frontend/pr-budget.md
3. релевантные production-файлы и существующие тесты.

Перед изменениями выполни git status --short. Не трогай чужой WIP.
Работай только в scope указанного slice. Characterization first.
Не меняй UX/API/query keys/routes/formulas и не ослабляй тесты.
Не используй any, @ts-ignore и широкие casts для обхода ошибки.

После изменения запусти обязательные proof-команды slice и
npm run test:s0-gates. Если baseline или бизнес-правило неоднозначны —
остановись с FILE/LINE/EVIDENCE, не угадывай.

В конце сообщи:
- изменённые файлы;
- before/after;
- команды и результаты;
- остаточный риск;
- commit hash;
- следующий ID плана.
```

## 7. Task-промпты: Phase P0

### B1 — UI primitives readonly contract

```text
Выполни slice B1.

Scope:
- frontend/src/components/ui-kit/UiPrimitives.tsx
- frontend/src/__tests__/unit/components/UiPrimitives.test.tsx

Исправь readonly/mutable несовместимость TltTableColumn без cast и без изменения
runtime. Сначала докажи тестом, что readonly columns являются допустимым public
input. Предпочти readonly contract в props, если компонент не мутирует массив.

Proof:
npx vitest run src/__tests__/unit/components/UiPrimitives.test.tsx
npm run typecheck
```

### B2 — типобезопасные fixtures

```text
Выполни slice B2. Production-код не менять.

Scope:
- frontend/src/__tests__/unit/pages/electrical/elecCalcSummaryModel.test.ts
- frontend/src/__tests__/unit/pages/heatcalc/heatCalcDraftRowsModel.test.ts

Обнови fixtures под реальные типы SystemSummaryBucket и DraftRowState.
Создай локальные typed fixture builders. Не используй unknown casts и не удаляй
проверяемые поля/assertions.

Proof:
npx vitest run \
  src/__tests__/unit/pages/electrical/elecCalcSummaryModel.test.ts \
  src/__tests__/unit/pages/heatcalc/heatCalcDraftRowsModel.test.ts
npm run typecheck
```

### B3 — `TltSelect.allowClear`

```text
Выполни slice B3.

Scope:
- frontend/src/components/form-controls/TltSelect.tsx
- frontend/src/components/wizard/CableAlgorithmPanel.tsx
- максимум 2 соответствующих test files

Сначала зафиксируй ожидаемое поведение очистки CableAlgorithmPanel.
Если очистка является UX-контрактом, добавь типизированный allowClear в TltSelect
с keyboard/a11y поведением и тестом. Если очистка не должна быть доступна —
докажи это существующим поведением и удали только некорректный prop.

Hard stop: если бизнес-ожидание нельзя определить по коду/тестам.

Proof:
npx vitest run <focused TltSelect/CableAlgorithm tests>
npm run typecheck
```

### B4 — ObjectWizard wide props

```text
Выполни slice B4.

Scope:
- frontend/src/components/wizard/ObjectWizard.tsx
- файл, объявляющий ObjectWizardWidePanelProps
- максимум 2 ObjectWizard tests

Разреши geometryTitle contract явно. Не делай prop optional только ради
typecheck. Сначала установи, должен ли title отображаться в wide layout, затем
передай корректное значение или удали мёртвый contract вместе с тестом.

Proof:
npx vitest run src/__tests__/integration/components/ObjectWizardDependencies.test.tsx
npm run typecheck
```

### B5 — Electrical nullability и cable-type normalization

```text
Выполни slice B5.

Scope:
- frontend/src/pages/electrical/useElectricalVariantSelection.ts
- frontend/src/pages/electrical/useElecCalcCableTypeState.ts
- их два focused test files

Сначала отдельно воспроизведи:
1. nullable variant ID в create/copy/activate flow;
2. failing ожидание self_regulating vs self_regulating_tt.

Не подменяй null пустой строкой. Не меняй ER UUID semantics.
Для cable type установи SoT по API types, options model и существующему UI.
Если два источника противоречат друг другу — hard stop с evidence.

Proof:
npx vitest run \
  src/__tests__/unit/pages/electrical/useElectricalVariantSelection.test.tsx \
  src/__tests__/unit/pages/electrical/useElecCalcCableTypeState.test.tsx
npm run typecheck
```

### B6 — Report cleanup

```text
Выполни slice B6.

Scope:
- frontend/src/pages/ReportPage.tsx
- frontend/src/__tests__/integration/pages/ReportPage.test.tsx

Удалить только доказанно неиспользуемые Segmented/firstSupportedVariant или
подключить их, если тесты подтверждают незавершённый UX. Не менять export/print
и состав отчёта. Исправить focused regression без увеличения timeout.

Proof:
npx vitest run src/__tests__/integration/pages/ReportPage.test.tsx
npx eslint src/pages/ReportPage.tsx src/__tests__/integration/pages/ReportPage.test.tsx
npm run typecheck
```

### B7 — Specification effect dependency

```text
Выполни slice B7.

Scope:
- frontend/src/pages/specification/useSpecificationPageModel.ts
- один существующий Specification integration/unit test

Разбери effect около generation_options. Зафиксируй тестом, должен ли state
синхронизироваться при смене spec/generation_options. Исправь dependency contract
без eslint-disable и без бесконечного render loop.

Proof:
npx vitest run <focused specification test>
npx eslint src/pages/specification/useSpecificationPageModel.ts
npm run typecheck
```

### B8 — test-only lint cleanup

```text
Выполни slice B8. Production-код не менять.

Scope:
- frontend/src/__tests__/unit/pages/electrical/ElectricalAssignmentPanel.test.tsx
- frontend/src/__tests__/unit/store/projectStore.test.ts

Убери unused test variables через корректные mock signatures/destructuring.
Не отключай lint rule и не ослабляй assertions.

Proof:
npx eslint <оба файла>
npx vitest run <оба файла>
```

### B9 — baseline integration

```text
Выполни slice B9 как интегратор. Production semantics не менять.

1. Убедись, что B1–B8 находятся в HEAD и working tree clean.
2. Запусти lint, typecheck, build, s0-gates и все focused suites B1–B8.
3. Если что-то красное — локализуй владельца и верни конкретному slice,
   не делай широкий cleanup.
4. Обнови только baseline-цифры в agent-hardening-plan.md.

Proof:
npm run lint
npm run typecheck
npm run build
npm run test:s0-gates
```

## 8. Task-промпты: Phase P1

### G1 — единая agent gate команда

```text
Выполни slice G1.

Добавь npm script test:agent-gates, который запускает быстрые обязательные
проверки в стабильном порядке. Не дублируй реализацию lint/typecheck — композиция
существующих scripts. Команда должна завершаться non-zero при первом нарушении и
быть пригодна для CI.

Scope:
- frontend/package.json
- при необходимости один небольшой orchestration script
- docs/frontend/README.md

Proof:
npm run test:agent-gates
```

### G2 — complexity ratchet

```text
Выполни slice G2.

Создай architecture test на production TS/TSX:
- абсолютный cap для новых файлов;
- baseline caps для существующих hotspots;
- LOC, imports, useEffect/useState/useCallback как простые сигналы;
- исключить tests, d.ts, generated;
- запретить рост baseline, но не требовать мгновенно исправить legacy.

Используй TypeScript parser/compiler API, не хрупкий regex для imports.
Каждая ошибка обязана содержать CODE, FILE, CURRENT, LIMIT и FIX.
Baseline хранить в reviewable JSON/TS рядом с gate.

Proof:
npx vitest run src/__tests__/unit/architecture
```

### G3 — dependency и cycle ratchet

```text
Выполни slice G3.

Расширь architecture boundaries:
- components/hooks/utils/domain не импортируют pages;
- heat, electrical, specification не делают deep imports друг в друга;
- разрешённые public entrypoints задаются явно;
- найденные legacy exceptions имеют точный allowlist + shrink note;
- production import graph не содержит cycles.

Не перемещай production-файлы в этом slice. Это только gate/baseline.
Ошибки: CODE, FILE, IMPORT, FIX.

Proof:
npm run test:architecture
```

### G4 — CSS architecture ratchet

```text
Выполни slice G4.

Реализуй css:architecture и подключи к test:agent-gates.
Расширь ratchet из IMP0; не создавай второй счётчик или отдельный baseline.
Проверять:
- styles.css остаётся freeze-stub;
- total/per-file !important не растёт;
- CSS hotspot LOC не растёт;
- новый feature selector имеет owner root;
- новые bare .ant-* запрещены;
- specificity/media/breakpoint baseline не ухудшается;
- один CSS owner не содержит селекторы чужого feature;
- новый CSS импортируется владельцем или явным global entry.

Не переписывай CSS и не меняй baseline вручную для прохождения теста.
Ошибки: CODE, FILE, SELECTOR/METRIC, FIX.

Proof:
npm run css:architecture
npm run test:architecture
```

### G5 — coverage ratchet

```text
Выполни slice G5.

Сними текущий V8 coverage на clean green HEAD. Установи thresholds немного ниже
фактического значения с ratchet-политикой: coverage не падает, но не заявляй
произвольные 80%. Добавь отдельные thresholds для pure domain/models, если их
текущий уровень позволяет.

Не добавляй бессодержательные тесты ради процентов.

Proof:
npm run test:coverage
npm run test:agent-gates
```

## 9. Task-промпты: приоритетный `!important` track

### IMP0 — немедленный per-file ratchet

```text
Выполни slice IMP0. CSS declarations не менять.

Создай минимальный architecture gate, который:
- считает !important по каждому frontend/src/**/*.css;
- фиксирует reviewable per-file baseline и total = 475;
- падает при росте total или любого per-file значения;
- разрешает уменьшение без ручного обновления baseline;
- сообщает CODE, FILE, CURRENT, LIMIT и FIX.

Это первая часть будущего G4, не создавай конкурирующий второй механизм.
Если HEAD уже изменил число, пересними значение, покажи diff и причину до
фиксации baseline. Нельзя повышать cap только ради прохождения CI.

Proof:
npx vitest run src/__tests__/unit/architecture
npm run test:s0-gates
```

### IMP1 — inventory и классификация

```text
Выполни slice IMP1. Production CSS/TSX не менять.

Создай docs/frontend/css-important-inventory.md. Для каждого selector family с
!important зафиксируй:
- owner CSS и root;
- количество;
- причина: third-party CSS-in-JS / inline style / avoidable specificity /
  duplicate/dead / print;
- состояния, которые надо сохранить;
- рекомендуемый replacement;
- focused test и browser route/viewport.

Сначала разобрать пять крупнейших owners, покрывающих около 80% случаев.
Сумма inventory обязана совпасть с gate IMP0.
```

### IMP2–IMP7 — burn-down по владельцам

```text
Выполни ровно один под-slice выбранного IMP ID:

IMP2.n: compact-fields.css,            115 → ≤40
IMP3.n: Heat workspace owner files,    106 → ≤35 суммарно
IMP4.n: insulation-layers-table.css,    88 → ≤25
IMP5.n: cable-algorithm-panel.css,       45 → ≤15
IMP6.n: heat-object-fields.css,          28 → ≤10
IMP7.n: остальные CSS-файлы,             93 → ≤25 суммарно

Один под-slice = одно selector family. Основной IMP ID остаётся in_progress,
пока его target не достигнут.

Перед изменением:
1. Возьми family из css-important-inventory.md.
2. Зафиксируй computed styles для normal/hover/focus/error/disabled и
   релевантных wide/side/narrow состояний.
3. Определи реальную причину cascade conflict.

Разрешено:
- заменить !important корректным owner root;
- убрать доказанный duplicate/dead rule;
- применить Ant theme/component token;
- сделать contract UI-компонента явным.

Запрещено:
- увеличивать specificity ещё более длинным selector;
- добавлять inline style;
- одновременно переносить CSS между файлами;
- redesign;
- трогать InsulationLayersTable TSX/формулы;
- обновлять ratchet cap вверх.

Proof:
npm run css:architecture
npm run test:s0-gates
focused owner tests
Playwright computed-style + screenshot + console proof

В отчёте: before/after для family, файла и общего total.
```

## 10. Task-промпты: Phase P2

### CSS1–CSS4 — разделение Heat CSS по владельцам

```text
Выполни только указанный CSS slice CSS1/CSS2/CSS3/CSS4.

CSS1: составь карту диапазонов heatcalc-workspace.css → component/root owner;
    production CSS не менять.
CSS2: move-only extract workspace layout/chrome.
CSS3: move-only extract dual-form/wizard-form chrome.
CSS4: move-only extract insulation page-scope rules; island CSS не трогать.

Для move slices:
- никаких declaration changes;
- сохранить import/cascade order;
- selector/declaration counts до и после равны;
- один новый owner CSS максимум;
- не переносить page-scope правило в wizard island;
- `!important` не добавлять и не удалять в move-only slice.

Proof:
npm run css:architecture
npm run test:s0-gates
focused Heat/ObjectWizard tests
Playwright desktop + narrow viewport screenshot/geometry/console proof
```

### ELEC1–ELEC3 — Electrical workspace orchestration

```text
Выполни только указанный slice ELEC1/ELEC2/ELEC3.

ELEC1: выдели coherent main-table controller из useElecCalcWorkspaceModel.
ELEC2: выдели candidate workflow controller.
ELEC3: выдели presentation/props assembly без domain mutation logic.

До extract создай characterization на inputs/outputs и identity-sensitive
callbacks. Не меняй query keys, mutations, invalidation, pagination, selection,
Glide/Ant parity или UUID semantics. Новый controller ≤300 LOC и имеет owner
header: Owns/Writes/Does-not.

После slice исходный model обязан уменьшиться; количество файлов для понимания
одного workflow не должно превысить 5.

Proof:
focused electrical unit tests
Elec integration/smoke
npm run test:agent-gates
```

### HEAT1–HEAT2 — Heat orchestration

```text
Выполни только указанный slice HEAT1/HEAT2.

HEAT1: отдели objects query + draft/data lifecycle controller.
HEAT2: отдели grid/excel/selection interaction controller.

Сначала characterization на loading/error/empty, invalidation, draft reset,
selected row и keyboard flows. Не смешивай HEAT1 и HEAT2. Не меняй query keys,
optimistic updates, save semantics или normal/glide mode parity.

Новый controller ≤300 LOC, явные typed inputs/outputs, без JSX.

Proof:
focused Heat model tests
HeatCalcPage basics/inline-edit/settings
npm run test:agent-gates
```

### GRID1 — Normal Glide pure model

```text
Выполни slice GRID1.

Из HeatCalcNormalGlideGrid вынеси только pure math/render decision helpers:
status mapping/palette, row theme, action rectangles/hit-testing, pagination
index calculations. Canvas drawing side effects оставить у adapter/component
или оформить узким renderer contract.

Сначала перенеси/добавь unit cases для boundary coordinates, active/error/dirty
priority и pagination offsets. Runtime output должен быть идентичен.

Proof:
npx vitest run src/__tests__/unit/components/HeatCalcNormalGlideGrid.test.tsx
performance script, если затронут hot render path
npm run test:agent-gates
```

### WIZ1–WIZ2 — ObjectWizard

```text
Выполни только указанный slice WIZ1/WIZ2.

WIZ1: вынеси reference queries + option/index derivation в
    useObjectWizardReferenceData.
WIZ2: вынеси required-field/name/form synchronization в
    useObjectWizardFormSync.

Не менять Form instance ownership, lazy reference loading, validation timing,
generated names или dual-form isolation. Для timer/effect cleanup обязательны
characterization tests.

Proof:
ObjectWizardDependencies integration
wizard isolation architecture
focused ObjectWizard unit tests
npm run test:agent-gates
```

### VAR1–VAR2 — Electrical variant selection

```text
Выполни только указанный slice VAR1/VAR2.

VAR1: отдели route/store/query reconciliation от mutation commands.
VAR2: собери create/copy/rename/activate/delete в typed command controller.

Сохранить URL param `er`, persisted selection, idempotent replay, readiness,
query cache updates и nullable identity semantics. Не вводить новый context.

Proof:
useElectricalVariantSelection unit suite
relevant Workspace/Report/Specification integration tests
npm run test:agent-gates
```

## 11. Task-промпты: Phase P3

### UI1–UI2 — production adoption UI contract

```text
Выполни только UI1 или UI2 по agent-prompt-ui-kit-strangler.md.

UI1: одна повторяемая Heat field family.
UI2: повторяемые Specification params controls.

Не заменять весь Ant Design. Мигрировать только доказанно повторяемый visual/
a11y contract. Feature сохраняет layout, UI layer владеет control behavior.
Не добавлять второй способ стилизации и не копировать CSS.

Proof:
UI kit unit/integration
feature focused tests
ui-kit ↔ Heat parity e2e для UI1
npm run test:agent-gates
```

### DOC1 — синхронизация документов

```text
Выполни slice DOC1 только после завершения production/gate slices.

Синхронизируй:
- autonomous-continuation-plan.md
- README.md
- pr-budget.md
- metrics-baseline.md
- hotspots.md
- s0-lite-status.md
- agent-hardening-plan.md

Удалить stale E8/C4/Track C/1194 pointers. Оставить один источник следующего
pending ID. Значения метрик переснять командами, не копировать из старых docs.
Исторические commit notes не переписывать.

Proof:
rg по stale markers
все ссылки существуют
git diff содержит только docs
```

### FINAL1 — финальный аудит

```text
Выполни FINAL1 без production-изменений.

1. Пересними все метрики §1.
2. Запусти полный Definition of Done §3.
3. Проверь desktop/narrow Heat, Electrical, Specification, Report и /ui-kit.
4. Проверь console errors, overflow, keyboard/focus и loading/error/empty states.
5. Составь остаточный risk register. Не объявляй завершение при красном gate.

Результат: evidence-backed отчёт с командами, pass counts, screenshots и
перечнем осознанно оставленного legacy.
```

## 12. Приоритет, если нужно остановиться раньше

Если бюджет ограничен, обязательный минимум:

```text
IMP0 → IMP1 → B1–B9 → G1–G4 → IMP2–IMP7 → DOC1 → FINAL1
```

Это остановит рост `!important`, даст зелёный baseline, сократит силовые
override минимум на 68% и предотвратит повторное накопление проблем.
Остальные P2/P3 затем можно выполнять постепенно, не ухудшая архитектуру.
