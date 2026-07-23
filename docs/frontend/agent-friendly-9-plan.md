# Frontend TLT: план достижения agent-friendly 9/10

**Статус:** active по явной цели пользователя  
**Актуально на:** 2026-07-23  
**Текущая проверенная оценка:** 8.5/10  
**Цель:** не менее 9.0/10 без redesign и изменения бизнес-контрактов

Этот документ — исполняемый чеклист и набор готовых промптов. Он не открывает
бесконечный refactoring backlog: каждый запуск выполняет ровно один указанный
slice по правилам [agent-development-standard.md](./agent-development-standard.md).

## 1. Проверенный baseline

Состояние проверено по runtime-коду и командами, а не взято из архивного плана.

| Область | Текущее состояние |
|---|---|
| `npm run test:agent-gates` | green: typecheck, lint, architecture, CSS gates |
| Полный Vitest | **green** (unit 1065; EditableTableCell + ReportPage ×3 green after QG-01) |
| Production build | green: `npx vite build` / `npm run build` |
| Lint | 0 errors, 35 warnings; есть production `exhaustive-deps` |
| `!important` | **0** |
| Raw colors вне `tokens.css` | **0** |
| Dependency allowlists | все **0** |
| Production TS/TSX >500 LOC | **18** |
| Complexity baseline | содержит исторический запас и допускает обратный рост |
| Прямой импорт UI-kit barrel | 3 production importers |
| Прямой импорт `antd` | 126 production importers, включая types/message/complex widgets |
| Крупный feature CSS | `elec-workspace.css` 1001; `heatcalc-field-chrome.css` 820 |
| CSS runtime | `StyleProvider hashPriority="low"`; **`@ant-design/cssinjs` direct dep** (`AF9-DEP-01`) |
| Full DoD command | `npm run test:agent-dod` (`AF9-QG-03`) |
| Browser smoke `/ui-kit` | desktop/mobile без page overflow и console warnings |
| Repository parity E2E | запуск Chrome заблокирован `SIGABRT`, assertions не выполнялись |

Закрытые P0 test reds:

- [x] `AF9-QG-01` EditableTableCell token backgrounds (`a42fd2a`);
- [x] `AF9-QG-02` ReportPage isolation — 3× focused green + full unit green (no code change needed);
- [x] `AF9-DEP-01` `@ant-design/cssinjs` direct dependency (`945fa04`);
- [x] `AF9-QG-03` `test:agent-dod` (this slice).

## 2. Что означает 9/10

Цель считается достигнутой только одновременно при следующих условиях:

- [ ] `test:agent-gates`, unit, integration и build зелёные два запуска подряд;
- [ ] быстрый gate не остаётся зелёным при известном красном критичном контракте;
- [ ] lint: 0 errors, 0 production warnings; test-only исключения точечные и объяснены;
- [ ] все прямые runtime-зависимости объявлены в `package.json`;
- [ ] complexity ratchet не оставляет файлу запас до старого исторического LOC;
- [ ] `!important=0`, raw colors outside tokens=0 и dependency allowlists=0 сохранены;
- [ ] два главных workflow hotspots имеют явные owner boundaries и укладываются
  в принятые лимиты;
- [ ] прямые Ant primitives, для которых уже есть эквивалент UI-kit, запрещены
  в новом feature-коде исполняемым правилом;
- [ ] крупнейшие feature CSS owners разделены по реальным component roots;
- [ ] глобальная смена Ant specificity доказана на Heat, Electrical,
  Specification и UI-kit в desktop/mobile состояниях;
- [ ] browser proof включает geometry, overflow, console и failed network audit.

## 3. Приоритетный чеклист

### P0 — убрать ложнозелёное состояние

- [x] **AF9-QG-01:** починить два падения `EditableTableCell` без возврата raw colors. (`a42fd2a`)
- [x] **AF9-QG-02:** стабилизировать `ReportPage` test isolation и `window.open`. (already green ×3)
- [x] **AF9-QG-03:** сделать полный DoD одной явной командой (`test:agent-dod`).
- [x] **AF9-DEP-01:** объявить `@ant-design/cssinjs` прямой dependency. (`945fa04`)
- [ ] **AF9-ARCH-01:** ужесточить и переснять truthful complexity baseline.
- [ ] **AF9-LINT-01:** убрать production warnings и мигрировать на flat ESLint config.

Пока baseline красный, `AF9-QG-01` и `AF9-QG-02` работают по bootstrap-протоколу:

1. каждый агент правит только свой owner и запускает focused proof;
2. если остаётся только известное падение второго QG-slice, агент оставляет
   точный patch без commit и сообщает статус `ready-for-integration`, не `done`;
3. после присутствия обоих patches запускается полный DoD;
4. только на зелёном общем дереве изменения коммитятся раздельно с точным
   `git add` по owner;
5. новые или изменившиеся падения не считаются известным baseline и блокируют
   интеграцию.

### P1 — уменьшить остаточный workflow-риск

- [ ] **AF9-CMP-01:** декомпозировать `useElecCalcWorkspaceModel.tsx`.
- [ ] **AF9-CMP-02:** декомпозировать `useSpecificationPageModel.ts`.

### P2 — сделать UI policy исполняемой

- [ ] **AF9-UI-01:** классифицировать прямые Ant imports и добавить narrow lint gate.
- [ ] **AF9-UI-02:** перевести один Heat primitive family на public UI-kit.
- [ ] **AF9-UI-03:** перевести один Electrical primitive family на public UI-kit.

### P3 — уменьшить CSS context и доказать runtime

- [ ] **AF9-CSS-01:** разделить `elec-workspace.css` по component owners.
- [ ] **AF9-CSS-02:** разделить `heatcalc-field-chrome.css` по component owners.
- [ ] **AF9-QA-01:** закрепить browser matrix после `hashPriority="low"`.
- [ ] **AF9-FINAL:** пересчитать метрики и провести финальный независимый аудит.

## 4. Порядок и параллельность

```text
QG-01 ─┐
QG-02 ─┼─→ QG-03 ───────────────────────────────┐
DEP-01 ┘                                          │
ARCH-01 ──────────────────────────────────────────┤
LINT-01 → CMP-01                                  │
           CMP-02                                 ├─→ QA-01 → FINAL
UI-01 → UI-02                                     │
       → UI-03                                     │
CSS-01 ───────────────────────────────────────────┤
CSS-02 ───────────────────────────────────────────┘
```

Можно параллельно выполнять только slices с разными production owners.
Запрещён параллельный запуск:

- `AF9-LINT-01` и `AF9-CMP-01` — оба могут затронуть Elec model;
- `AF9-UI-03` и `AF9-CSS-01` — оба затрагивают Electrical UI;
- `AF9-UI-02` и `AF9-CSS-02` — оба затрагивают Heat UI;
- `AF9-QG-03` до закрытия обоих красных test slices.

## 5. Общий префикс для каждого агента

Добавляй этот блок перед любым task prompt ниже:

```text
Ты выполняешь ровно один frontend slice в проекте:
/Users/dmalafey/Desktop/TLT

Полностью прочитай:
1. frontend/AGENTS.md
2. docs/frontend/agent-development-standard.md
3. docs/frontend/agent-friendly-9-plan.md
4. ближайший production-код и тесты текущего slice

Сначала выполни git status --short. Не трогай unrelated WIP, включая
frontend/tsconfig.tsbuildinfo и чужие untracked docs.

Один запуск = один owner и один наблюдаемый результат. Characterization first.
Сохрани UX, API/query semantics, routes, units, formulas, permissions и ER UUID.
Не повышай baseline/allowlist, не добавляй any, ts-ignore, important, raw color
вне tokens, bare Ant selector или feature CSS в styles.css.

После focused proof обязательно запусти:
cd frontend
npm run test:agent-gates
npm run test:unit
npm run test:integration
npm run build

Для UI/CSS используй Kontur UI verification, desktop 1440x1000 и mobile
390x844, geometry/overflow/console/network audit и релевантный Playwright spec.
Красный full gate или недоступный обязательный browser proof = blocked без
готового commit. Коммить только файлы slice; push запрещён без команды.

Единственное временное уточнение: AF9-QG-01/02 используют bootstrap-протокол
из раздела P0. Они могут вернуть uncommitted ready-for-integration patch, но не
могут объявить красный общий gate успешным.
```

## 6. Готовые task prompts

### AF9-QG-01 — EditableTableCell token styles

```text
SLICE_ID: AF9-QG-01
DOMAIN: shared/table
GOAL: восстановить два computed-style контракта EditableTableCell после
переноса цветов в CSS variables.

Воспроизведение:
npx vitest run src/__tests__/unit/components/EditableTableCell.test.tsx

Сейчас inactive editable и invalid/dirty states получают transparent в jsdom
вместо ожидаемых rgb(243,244,246) и rgb(255,241,240).

Сначала установи root cause: runtime CSS cascade, отсутствие token owner в
test environment или неспособность jsdom вычислять custom property. Не заменяй
behavior assertion проверкой className только ради зелёного теста.

Allowed scope:
- EditableTableCell production owner;
- его CSS owner или общий test CSS setup;
- EditableTableCell.test.tsx.

Invariants:
- 0 !important;
- 0 raw colors вне tokens.css;
- runtime state precedence error > dirty > inactive сохраняется;
- Excel flat mode и active editor не меняются.

Acceptance:
- все 8 тестов файла green;
- browser computed styles подтверждают grey/red state;
- full gate green.
```

### AF9-QG-02 — ReportPage test isolation

```text
SLICE_ID: AF9-QG-02
DOMAIN: reports
GOAL: сделать ReportPage integration tests детерминированными без ослабления
ER UUID и standalone report wizard contracts.

Воспроизведение:
npx vitest run src/__tests__/integration/pages/ReportPage.test.tsx
Повтори файл минимум 3 раза и проверь запуск в составе integration suite.

Исследуй leaking mocks, fake timers, window.open restoration, query/store state
и userEvent timing. Characterization должен доказывать точный URL:
/report-wizard?er=<selected UUID>, target и window features.

Allowed scope:
- ReportPage/report wizard wiring одного owner;
- ReportPage.test.tsx;
- один reports test helper при необходимости.

Не:
- подменять UUID legacy slot;
- удалять exact URL assertion;
- увеличивать timeout вместо устранения причины;
- глобально сериализовать весь test suite.

Acceptance:
- test file green 3 последовательных запуска;
- integration suite green;
- exact selected ER UUID contract сохранён.
```

### AF9-QG-03 — единая полная команда DoD

```text
SLICE_ID: AF9-QG-03
DOMAIN: tooling
DEPENDS: AF9-QG-01, AF9-QG-02
GOAL: исключить ситуацию, когда test:agent-gates green, а обязательный полный
frontend DoD red.

Добавь одну каноническую npm-команду, например test:agent-dod, которая в
стабильном порядке запускает:
- test:agent-gates;
- test:unit;
- test:integration;
- production build.

Не дублируй реализации отдельных scripts. Проверь CI/workflow и подключи
команду туда, где принимается готовность frontend. Быстрый gate можно сохранить
для локального feedback, но README/AGENTS должны явно отличать fast и full DoD.

Allowed scope:
- frontend/package.json;
- существующий CI frontend workflow;
- frontend/AGENTS.md и docs frontend navigator.

Acceptance:
- намеренно красный focused test делает full DoD красным;
- восстановленный код даёт green;
- команда не запускает watch mode;
- документирован единый source of truth.
```

### AF9-DEP-01 — прямая CSS-in-JS dependency

```text
SLICE_ID: AF9-DEP-01
DOMAIN: tooling/css-runtime
GOAL: сделать импорт StyleProvider воспроизводимым и независимым от hoisting
внутренней зависимости antd.

Сейчас main.tsx напрямую импортирует @ant-design/cssinjs, но
npm ls @ant-design/cssinjs --depth=0 возвращает empty.

Добавь совместимую текущему antd прямую dependency штатной npm-командой и
обнови lockfile. Не обновляй остальные пакеты. Докажи clean-install resolution
через npm ls, typecheck и production build.

Allowed scope:
- frontend/package.json;
- frontend/package-lock.json.

Acceptance:
- npm ls @ant-design/cssinjs --depth=0 exit 0;
- version совместима с реально используемой antd;
- typecheck/build/full gate green.
```

### AF9-ARCH-01 — truthful complexity ratchet

```text
SLICE_ID: AF9-ARCH-01
DOMAIN: architecture
GOAL: убрать исторический запас complexity baseline, который позволяет уже
уменьшенному файлу снова вырасти до старого размера.

Пример риска: HeatCalcNormalGlideGrid уменьшен примерно 1192→10 LOC, но baseline
всё ещё допускает исторические 1192.

Измени ratchet contract так, чтобы любое уменьшение требовало зафиксировать
новый shrink-only предел в том же slice. Удали baseline entries для файлов,
которые исчезли или стали <= newFileLocCap; для оставшихся запиши текущие
loc/imports/hooks. Stale higher baseline должен выдавать понятную ошибку.

Allowed scope:
- complexityRatchet.architecture.test.ts;
- complexityBaseline.json;
- точное обновление architecture docs.

Не:
- повышать ни одну текущую метрику;
- менять production;
- вводить generated baseline без reviewable JSON diff.

Acceptance:
- искусственное возвращение одного удалённого import/LOC ловится тестом;
- stale baseline ловится с FILE/CURRENT/LIMIT/FIX;
- architecture и full gates green.
```

### AF9-LINT-01 — actionable lint zero

```text
SLICE_ID: AF9-LINT-01
DOMAIN: tooling
GOAL: получить 0 production lint warnings и перейти с deprecated eslintrc на
eslint.config.js без ослабления правил.

Сначала классифицируй все текущие 35 warnings:
- production hooks correctness;
- Fast Refresh mixed exports;
- test-only filesystem security false positives.

Исправь production warnings кодом. Для architecture scanners допустимо только
узкое file-pattern override конкретных правил с комментарием threat model;
нельзя отключать security plugin глобально. Сохрани equivalent rule coverage.

Особое внимание:
useElecCalcWorkspaceModel.tsx missing dependency cableMarkModal.
Не добавляй dependency механически, пока не доказано отсутствие render loop и
stale closure.

Allowed scope:
- ESLint config;
- точечные production files с warning;
- максимум один helper для вынесенных mixed exports.

Acceptance:
- npm run lint: 0 errors и 0 warnings;
- hooks tests и focused Elec tests green;
- deprecated ESLintRCWarning отсутствует;
- full gate green.
```

### AF9-CMP-01 — Electrical workspace model

```text
SLICE_ID: AF9-CMP-01
DOMAIN: electrical
DEPENDS: AF9-LINT-01
GOAL: уменьшить useElecCalcWorkspaceModel.tsx с ~545 LOC до <=400 и сделать
его orchestration явно читаемым.

До изменения зафиксируй behavior map: inputs, returned API, query/mutation
owners, modal lifecycle, cable mark selection, persistence и effects.
Выдели ровно один named use-case owner с самостоятельным тестом. Parent должен
реально уменьшиться; запрещено просто перенести огромный объект return.

Allowed scope:
- useElecCalcWorkspaceModel.tsx;
- максимум два новых electrical helpers/hooks;
- ближайшие unit/integration tests.

Invariants:
- query keys/invalidation/cancellation;
- selected ER UUID;
- cable mark modal behavior;
- batch and table selection;
- no new cross-feature imports.

Acceptance:
- parent <=400 LOC и <30 imports;
- новый hook/model <=300 LOC;
- effect ownership документирован;
- Elec focused tests и full gate green.
```

### AF9-CMP-02 — Specification page model

```text
SLICE_ID: AF9-CMP-02
DOMAIN: specification
GOAL: уменьшить useSpecificationPageModel.ts (~517 LOC, 16 useState) до
понятного workflow owner <=400 LOC.

Сначала классифицируй state: server/cache, persisted preference, workflow,
derived и transient UI. Не заменяй 16 useState одним непрозрачным mega-state.
Выдели один cohesive reducer/hook только если события и invariants можно
назвать и отдельно протестировать.

Allowed scope:
- useSpecificationPageModel.ts;
- максимум два specification model/helper files;
- ближайшие tests.

Invariants:
- flat/grouped structure;
- selected rows and export;
- API/query semantics;
- loading/error/empty/permission states.

Acceptance:
- parent <=400 LOC;
- derived values не дублируются в state;
- public return contract не расширился без необходимости;
- specification unit/integration и full gate green.
```

### AF9-UI-01 — исполняемая политика UI-kit

```text
SLICE_ID: AF9-UI-01
DOMAIN: ui architecture
GOAL: превратить правило «используй UI-kit» в narrow executable policy, не
запрещая оправданные Ant Form/Modal/Table/types/message APIs.

Построй AST-аудит прямых named imports из antd и раздели:
1. primitives с существующим эквивалентом Tlt*;
2. complex/vendor APIs, которым wrapper не нужен;
3. type-only imports;
4. infrastructure theme/ConfigProvider/message.

Добавь lint/architecture rule только для категории 1 в feature UI files.
Existing violations внеси в shrink-only per-file baseline либо мигрируй один
малый family; новый violation должен падать с подсказкой public UI-kit import.

Allowed scope:
- architecture/lint rule и baseline;
- UI-kit docs;
- без массовой production migration.

Acceptance:
- rule не считает type-only/message/Form/Modal автоматически ошибкой;
- новый прямой Button/Card/Alert import в feature UI падает;
- allowlist имеет owner и shrink note;
- architecture/full gate green.
```

### AF9-UI-02 — Heat primitive migration

```text
SLICE_ID: AF9-UI-02
DOMAIN: heat
DEPENDS: AF9-UI-01
GOAL: удалить один наиболее повторяемый direct Ant primitive family из Heat
production UI через @/components/ui-kit.

По аудиту UI-01 выбери один family и максимум два соседних Heat components.
Не оборачивай Ant заново, если эквивалент уже есть. Сохрани DOM semantics,
accessible name, loading/disabled state, size и geometry.

Allowed scope:
- максимум два Heat UI components;
- существующий UI-kit только при доказанном missing prop;
- focused tests.

Acceptance:
- direct-import baseline уменьшается;
- UI-kit public API не получает feature props;
- desktop/mobile browser parity green;
- full gate green.
```

### AF9-UI-03 — Electrical primitive migration

```text
SLICE_ID: AF9-UI-03
DOMAIN: electrical
DEPENDS: AF9-UI-01
GOAL: удалить один direct Ant primitive family из одного Electrical workflow.

Выбери компактный owner, не весь workspace. Сохрани keyboard/focus,
loading/disabled, accessible names и table/modal behavior. Complex Ant widgets
не оборачивай ради метрики.

Allowed scope:
- максимум два соседних Electrical components;
- существующий public UI-kit;
- focused tests.

Acceptance:
- direct-import baseline уменьшается;
- нет feature logic в UI-kit;
- browser proof desktop/mobile;
- Elec focused и full gates green.
```

### AF9-CSS-01 — split Electrical CSS owner

```text
SLICE_ID: AF9-CSS-01
DOMAIN: electrical/css
GOAL: уменьшить elec-workspace.css (~1001 LOC), выделив один реальный
component-owned CSS island.

До move найди все selectors, dynamic modifiers, JSX classes, media/print rules
и exact overlaps. Зафиксируй computed styles/geometry выбранного состояния.
Перенеси один coherent selector family рядом с owning component и удали
оригинал в том же commit.

Allowed scope:
- elec-workspace.css;
- один новый/существующий component CSS;
- owning TSX import;
- один focused test/baseline.

Не:
- redesign;
- компенсирующие overrides;
- рост specificity/media/raw colors/important;
- move нескольких независимых panels.

Acceptance:
- elec-workspace.css уменьшается минимум на 20%;
- новый island <=400 LOC и полностью root-scoped;
- exact selector overlap отсутствует;
- desktop/mobile geometry и full gates green.
```

### AF9-CSS-02 — split Heat field chrome

```text
SLICE_ID: AF9-CSS-02
DOMAIN: heat/css
GOAL: уменьшить heatcalc-field-chrome.css (~820 LOC), выделив один component
owner без визуального изменения.

Выбери selector family по реальному JSX root, включая responsive и state
modifiers. Characterization first: computed style, control bounds и relevant
Heat mode. Перенеси family, подключи CSS owner component, удали source rules.

Allowed scope:
- heatcalc-field-chrome.css;
- один component CSS;
- owning TSX import;
- focused test/baseline.

Acceptance:
- source уменьшается минимум на 20%;
- новый CSS <=400 LOC, root-scoped, no orphan;
- 0 important/raw colors outside tokens;
- Heat desktop/mobile modes и full gates green.
```

### AF9-QA-01 — browser matrix для глобальной specificity

```text
SLICE_ID: AF9-QA-01
DOMAIN: frontend QA
DEPENDS: P0, CSS-01, CSS-02
GOAL: доказать, что StyleProvider hashPriority=low и удаление important не
сломали ключевые runtime states.

Не меняй production до обнаружения конкретной регрессии. Используй реальный
stack и Kontur UI verification. Обязательные routes:
- /ui-kit;
- Heat workspace: populated normal + form/side panel;
- Electrical workspace: populated assignment/candidates;
- Specification: populated table + empty/error, если достижимо.

Каждый route:
- 1440x1000 и 390x844;
- snapshot + screenshot;
- page overflow и key region bounding boxes;
- keyboard/focus для основных actions;
- console warning/error и failed network review.

Запусти repository parity spec. Если Chrome channel SIGABRT, зафиксируй infra
failure, повтори обычным bundled Chromium и не называй assertions passed, пока
они реально не выполнились.

Добавляй только стабильные geometry/behavior assertions, не pixel-perfect
snapshot всего экрана.

Acceptance:
- state evidence сохранено;
- parity assertions реально green;
- обнаруженные regression fixes оформлены отдельными owner slices;
- full frontend DoD green.
```

### AF9-FINAL — финальная оценка

```text
SLICE_ID: AF9-FINAL
DOMAIN: audit/docs
GOAL: независимо подтвердить достижение agent-friendly >=9.0.

Не исправляй production в этом slice. Пересчитай с текущего HEAD:
- full DoD results два раза;
- lint errors/warnings;
- stale complexity baseline;
- files >500 LOC;
- dependency/cycle allowlists;
- important/raw colors;
- direct dependency resolution;
- direct Ant primitive baseline и UI-kit usage;
- top CSS owners;
- browser matrix evidence.

Проверь, что docs не выдают старые snapshots за current truth. Для каждого
невыполненного критерия верни exact FILE/EVIDENCE и оценку ниже 9; не округляй
оценку вверх. Если все exit criteria выполнены, обнови этот документ:
status=complete, итоговые метрики, proof commands и residual risks.
```

## 7. Финальная команда проверки

После появления `test:agent-dod`:

```bash
cd frontend
npm run test:agent-dod
npm run test:agent-dod
```

Дополнительно:

```bash
npm ls @ant-design/cssinjs --depth=0
npm run test:architecture
npm run css:architecture
```

UI принимается только по evidence из `AF9-QA-01`, а не по зелёному static gate.

## 8. Что не требуется для 9/10

- переписать весь frontend с нуля;
- убрать все прямые импорты Ant Design;
- завернуть каждый Ant component в UI-kit;
- сделать все production files меньше 300 LOC;
- внедрить Sass/Less/Tailwind/CSS-in-JS;
- массово перенести код в новый `features/` namespace;
- redesign или изменение пользовательских сценариев.

9/10 означает: агент быстро находит owner, меняет небольшой контекст, получает
правдивый автоматический feedback и не может незаметно вернуть закрытый долг.
