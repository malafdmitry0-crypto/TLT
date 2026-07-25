# Frontend agent confusion reduction — план и готовые промпты

**Статус:** READY ROADMAP / PROMPT PACK — **не ACTIVE queue**  
**Дата:** 2026-07-26  
**Цель:** снизить запутанность frontend для coding agents с `3,0/10` до
`≤2,0/10`, не меняя продуктовые сценарии.  
**Текущий queue authority:** только
[refactor-backlog.md](../../frontend/refactor-backlog.md).  
**Baseline context:** аудит начат на committed HEAD `07af54e`; ветка и активный
backlog продолжили двигаться параллельно во время подготовки документа.
Зафиксированный здесь hash — provenance, а не текущая очередь или числовой
baseline. Перед каждым slice live HEAD, метрики и dirty targets пересчитываются
заново.

## 1. Что именно считаем запутанностью

Frontend считается понятным для агента, если по одному пути файла он быстро и
однозначно отвечает на пять вопросов:

1. Кто feature-owner?
2. Где runtime entrypoint и разрешённая граница импорта?
3. Кто владеет server, shared client и local workflow state?
4. Какие focused tests и полный gate обязательны?
5. Нужен ли browser proof, для каких states и viewports?

Запутанность оценивается повторяемой шкалой:

| Измерение | Вес | `0` | `5` | `10` |
|---|---:|---|---|---|
| Навигация и поиск owner | 25% | один однозначный путь | нужен поиск по нескольким документам | owner неясен |
| Границы и public API | 20% | один разрешённый API | два равноправных пути | deep imports / циклы |
| State/data ownership | 15% | владелец состояния очевиден | часть состояния дублируется | источник истины неясен |
| Выбор tests/proof | 20% | команда определяется автоматически | требуется ручной поиск | gate выбирается наугад |
| Размер открываемого контекста | 10% | локальный use-case | несколько крупных файлов | монолитный workflow |
| Доверие к evidence/docs | 10% | proof привязан к source commit | proof приходится перепроверять | документы противоречат runtime |

**Exit:** итог `≤2,0`, ни одно измерение не выше `3,0`.

### 1.1 Baseline-метрики качества, скорости и надёжности

**Срез:** runtime `12c45b0`; docs-only overlay `07af54e`.

| Группа | Оценка |
|---|---:|
| Код и архитектурные гейты | **8,8 / 10** |
| Процесс, backlog и доказательства | **7,3 / 10** |
| Скорость малого изменения | **9,2 / 10** |
| Скорость полного acceptance-цикла | **6,8 / 10** |
| Надёжность кода | **9,0 / 10** |
| Запутанность, где меньше — лучше | **3,0 / 10** |

#### Исполняемые проверки

| Метрика | Значение |
|---|---:|
| Focused tests | **57 / 57 PASS** |
| TypeScript | **PASS** |
| ESLint | **PASS** |
| Architecture gates | **PASS** |
| CSS ratchets | **PASS** |
| Полный test-контур | **294 файла / 1324 теста PASS** |
| Unit tests в каждом DoD | **1156 PASS** |
| Integration tests в каждом DoD | **168 PASS** |
| DoD repeatability | **2 / 2 PASS · 100%** |
| DoD wall run 1 | **241 с** |
| DoD wall run 2 | **224 с** |
| DoD wall midpoint | **232,5 с** |
| Integration wall range | **136–147 с** |
| Production build | **PASS** |

#### Скорость feedback

| Контур | Оценка / значение |
|---|---:|
| Fast gate | **9,2 / 10** |
| Full DoD | **6,8 / 10** |
| Full DoD range | **224–241 с** |
| Full DoD variability | **17 с · 7,3% от midpoint** |
| Acceptance throughput | **5,5–5,9 tests/s по total wall** |
| Цель `≤120 с` | **не достигнута · фактически 1,87–2,01× медленнее** |

#### Надёжность кода

| Сигнал | Значение |
|---|---:|
| Test pass rate в подтверждённых DoD | **1324 / 1324 · 100%** |
| Повторяемость полного DoD | **100% на 2 прогонах** |
| `any` | **0** |
| `@ts-ignore` | **0** |
| `as unknown as` | **0** |
| `!important` | **0** |
| Максимальный import-context | **20** |
| Production files >500 LOC | **0** |
| Browser viewport coverage | **4 / 4** |
| Failed API requests в browser proof | **0** |
| Console seal | **FAIL · 2 Ant warnings** |

#### Размер контекста

| Метрика | Значение |
|---|---:|
| Production files | **439** |
| Production files ≥400 LOC | **22** |
| Production files >500 LOC | **0** |
| Test-related files | **340** |
| Test-related files ≥500 LOC | **9** |
| Максимальный test helper | **705 LOC** |

#### Browser proof

| Метрика | Значение |
|---|---:|
| `1000×768` | **PASS** |
| `1280×800` | **PASS** |
| `1440×900` | **PASS** |
| `1920×1080` | **PASS** |
| Excel без commercial flag | **PASS** |
| Keyboard focus + `ArrowRight` | **PASS** |
| Page-level horizontal overflow | **0** |
| Mobile `<1000 px` | **вне product contract** |

## 2. Непереговорные ограничения

- Этот документ не создаёт вторую очередь. Если пользователь не назвал
  конкретный `CONF-*`, агент берёт следующий `pending` только из backlog.
- Один prompt ниже = один запуск, один owner, одна причина изменения.
- Перед запуском полностью прочитать
  [frontend/AGENTS.md](../../../frontend/AGENTS.md),
  [стандарт](../../frontend/agent-development-standard.md),
  [PR budget](../../frontend/pr-budget.md) и
  [мастер-промпт](../../frontend/agent-refactor-prompt.md).
- Dirty target чужого WIP означает `STOP`; соседний cleanup запрещён.
- Characterization выполняется до production-изменения.
- Нельзя менять UX, API, query keys, invalidation, formulas, units, UUID,
  routes, permissions или keyboard behavior, если это не цель slice.
- Нельзя увеличивать architecture baselines или ослаблять assertions.
- Ant остаётся внутренней основой UI Kit. Массовая замена Ant не является
  целью.
- Viewports `<1000 px` остаются вне product contract. Mobile не добавляется.
- Динамические числа и оценки живут только в датированном audit, не в
  нормативных документах.
- Каждый успешно завершённый slice обязательно коммитится отдельно по Git
  protocol ниже.

### 2.1 Обязательный Git protocol каждого slice

1. До изменения выполнить `git status --short` и зафиксировать allowed files.
2. Сначала выполнить characterization, focused proof и обязательный полный
   gate/browser proof. Непроверенный slice не коммитится.
3. Добавлять только явные файлы текущего slice:

   ```bash
   git add path/to/allowed-file-1 path/to/allowed-file-2
   ```

   `git add .`, широкие globs и staging чужого WIP запрещены.
4. Один `CONF-*` или иной самостоятельный slice получает собственный
   conventional commit:

   ```text
   fix(frontend): <SLICE_ID> <наблюдаемый результат>
   refactor(frontend): <SLICE_ID> <наблюдаемый результат>
   docs(frontend): <SLICE_ID> <наблюдаемый результат>
   ```

5. Если slice взят из ACTIVE backlog:
   - первый commit содержит production/tests и прошедший proof;
   - второй docs-only commit закрывает строку backlog и содержит hash первого
     commit.
6. Docs-only slice получает отдельный docs commit. Если audit должен ссылаться
   на hash implementation commit, audit фиксируется последующим docs-only
   commit, а не пытается содержать собственный hash.
7. `blocked`, красный DoD, отсутствующий browser proof или hard stop означает
   **без готового commit**.
8. Нельзя объединять несколько slice ID или owners в один commit.
9. В финальном отчёте обязательны commit hash, точный список staged files и
   `git status --short` после commit.
10. Push выполняется только по явному запросу пользователя.

## 3. Последовательность

| Порядок | Slice | Owner | Результат | Ожидаемый эффект |
|---:|---|---|---|---:|
| 1 | `CONF-DOD-01` | tooling | правдивый и валидируемый DoD contract | `−0,10` |
| 2 | `CONF-EVIDENCE-01` | tooling | current evidence нельзя спутать с historical | `−0,20` |
| 3 | `CONF-FORM-01` | heat | нулевой console noise на Heat critical path | `−0,10` |
| 4 | `CONF-EXCEL-01` | heat | runtime, E2E и browser proof говорят одно | `−0,15` |
| 5 | `CONF-STORYBOOK-01` | tooling | UI API и stories доступны агенту через MCP | `−0,15` |
| 6 | `CONF-SCOPE-01` | tooling | файл автоматически маршрутизируется к owner/tests/proof | `−0,35` |
| 7 | `CONF-UI-BOUNDARY-01` | ui | однозначный выбор TLT facade или raw Ant | `−0,20` |
| 8 | `P-BAND-*` | backlog owner | меньше production-контекста | `−0,25` |
| 9 | `P-TEST-*` | qa/architecture | меньше test/harness-контекста | `−0,15` |
| 10 | `CONF-AUDIT-01` | qa | повторная итоговая оценка | контроль |

Эффекты ориентировочные и не складываются механически. Реалистичный диапазон
после выполнения: `1,7–2,0/10`.

### Зависимости

```text
CONF-DOD-01 ───────────────┐
CONF-FORM-01 ──────────────→ CONF-EXCEL-01
CONF-EVIDENCE-01 ──────────→ CONF-EXCEL-01
CONF-STORYBOOK-01 → CONF-UI-BOUNDARY-01
CONF-SCOPE-01 ─────────────┤
P-BAND-* → P-TEST-* ───────┤
                           └→ CONF-AUDIT-01
```

`CONF-DOD-01`, `CONF-EVIDENCE-01` и `CONF-SCOPE-01` могут разрабатываться
независимо только в отдельных worktrees. Изменения `package.json`,
`AGENTS.md`, backlog и общих scripts нельзя вести параллельно.

## 4. Готовые промпты

Каждый блок можно передать агенту без соседних блоков. Успешный блок обязательно
завершается отдельным commit по разделу 2.1; это требование нельзя опустить из
сокращённого prompt.

---

### Prompt 1 — `CONF-DOD-01`: устранить неоднозначность DoD

```text
Выполни ровно один frontend tooling slice.

SLICE_ID: CONF-DOD-01
OWNER: tooling
GOAL:
Сделать поведение frontend/scripts/agent-dod.mjs самодокументируемым и
валидируемым: default mode, комментарии, env values и package scripts должны
описывать один и тот же runtime contract.

ALLOWED_SCOPE:
- frontend/scripts/agent-dod.mjs
- его существующий self-test или максимум один новый tooling test
- frontend/package.json только если нужен canonical script
- один датированный audit snapshot

NON_GOALS:
- ускорение suite ценой coverage
- увеличение worker budget
- изменение unit/integration tests
- изменение CI workflow
- новый альтернативный full gate

INVARIANTS:
- canonical command остаётся npm run test:agent-dod
- default scheduling остаётся безопасным для текущего host budget
- первый failing child завершает sibling и возвращает исходный exit code
- invalid AGENT_DOD_SUITE_MODE завершается до запуска suites с понятной ошибкой

CHARACTERIZATION:
1. Зафиксируй текущее поведение default/concurrent/sequential.
2. Зафиксируй self-test fail-fast/cleanup.
3. Покажи расхождение комментария и actual default до исправления.

ACCEPTANCE:
- поддерживаемые mode перечислены в одном месте
- неизвестный mode fail-fast
- комментарии и package scripts соответствуют коду
- npm run test:agent-dod:self-test PASS
- npm run test:agent-gates PASS
- npm run test:agent-dod PASS один раз
- audit содержит exact HEAD, host, workers и фактический wall; число не
  копируется в норматив

Следуй frontend/AGENTS.md, agent-development-standard.md и pr-budget.md.
Не трогай чужой WIP. Верни стандартный финальный отчёт slice.
```

---

### Prompt 2 — `CONF-EVIDENCE-01`: freshness contract для browser evidence

```text
Выполни ровно один frontend tooling slice.

SLICE_ID: CONF-EVIDENCE-01
OWNER: tooling
GOAL:
Ввести минимальный machine-readable contract, который отличает current browser
proof от historical evidence и не позволяет выдать старый served build за
доказательство текущего source.

ALLOWED_SCOPE:
- максимум два frontend tooling scripts/config files
- максимум два tooling tests/fixtures
- docs/frontend/browser-state-matrix.md или один тематический evidence contract
- один датированный audit snapshot

NON_GOALS:
- переписывание старых audit snapshots
- удаление historical evidence
- изменение Playwright product scenarios
- изменение runtime UI

REQUIRED DESIGN:
- manifest содержит sourceCommit, capturedAtUtc, exact URL/build identity,
  viewport width×height, state, console status, failed network count
- status явно current или historical
- current proof с несовпадающим source/build identity завершается ошибкой
- historical proof остаётся читаемым и не блокирует CI
- проверка не использует изменяемые вручную "PASS" строки как источник истины

ACCEPTANCE:
- validator имеет позитивный и stale fixture
- stale current fixture красный с точной причиной
- historical fixture не считается current
- npm run test:agent-gates PASS
- tooling focused tests PASS
- если script включён в runtime/test package scripts, canonical DoD PASS

Сначала проверь существующие evidence formats через rg. Не создавай второй
audit framework, если текущий можно расширить минимально.
```

---

### Prompt 3 — `CONF-FORM-01`: устранить Ant useForm console error

```text
Сначала диагностируй, затем выполни один Heat frontend slice только если
владелец ошибки подтверждён.

SLICE_ID: CONF-FORM-01
OWNER: heat
GOAL:
Устранить warning "Instance created by useForm is not connected to any Form
element" на Heat critical path без suppression и без изменения поведения формы.

ALLOWED_SCOPE:
- точный Heat form owner, найденный через stack/runtime isolation
- максимум один production helper
- ближайший unit/integration test
- один browser evidence snapshot

HARD STOP:
Если warning принадлежит не Heat owner или требует изменения shared/UI-kit,
не расширяй scope. Верни FILE / EVIDENCE / DECISION NEEDED и предложи отдельный
owner slice.

NON_GOALS:
- фильтрация console.error
- mock console
- redesign формы
- изменение validation, initial values, save/reset semantics

CHARACTERIZATION:
- воспроизведи warning на clean navigation
- локализуй конкретный useForm instance и lifecycle condition
- добавь regression test на mount/unmount или conditional Form path

ACCEPTANCE:
- warning отсутствует после login → Heat normal → Excel → normal
- нет новых console warning/error
- form submit/reset/validation assertions сохранены
- focused test PASS
- npm run test:agent-dod PASS
- browser proof на 1000×768 и 1440×900, network failures = 0
```

---

### Prompt 4 — `CONF-EXCEL-01`: выровнять Excel runtime и E2E contract

```text
Выполни ровно один Heat frontend slice.

SLICE_ID: CONF-EXCEL-01
OWNER: heat
GOAL:
Сделать Excel-режим базовым Heat contract во всех уровнях: runtime,
unit/integration, default E2E и browser evidence без commercial flag.

ALLOWED_SCOPE:
- e2e/tests/heat-excel-mode.spec.ts
- релевантный Excel scenario в e2e/tests/heat-calculation.spec.ts
- только ближайшие Heat tests, если требуется characterization
- новый датированный browser evidence directory
- production Heat file только если runtime фактически расходится с контрактом

NON_GOALS:
- изменение UX Excel-режима
- другие commercial features
- изменение table formulas, formatting semantics или persistence
- исправление useForm warning (отдельный CONF-FORM-01)

CHARACTERIZATION:
- запусти приложение без VITE_COMMERCIAL_FEATURES_ENABLED
- докажи, что Excel control видим и переключается
- зафиксируй, какие default E2E сейчас skipped

ACCEPTANCE:
- core Excel E2E не зависит от commercial flag
- никаких blanket skip для describe с базовыми Excel journeys
- Playwright proof: 1000×768, 1280×800, 1440×900
- минимум empty и populated state
- canvas/control имеет положительную geometry и остаётся внутри owner region
- page horizontal overflow отсутствует; допустимый local grid scroll описан
- failed API requests = 0
- evidence привязан к текущему source/build identity
- focused E2E PASS
- npm run test:agent-dod PASS

Не ослабляй ожидания и не заменяй проверку control-only скриншотом.
```

---

### Prompt 5 — `CONF-STORYBOOK-01`: запечатать Storybook MCP

```text
Выполни ровно один tooling slice. Сначала проверь git status.

SLICE_ID: CONF-STORYBOOK-01
OWNER: tooling
GOAL:
Запечатать существующую интеграцию @storybook/addon-mcp так, чтобы следующий
агент мог получать документированные props/stories и preview URLs, не читая
случайные внутренние type definitions.

EXPECTED EXISTING WIP:
- .grok/config.toml
- .mcp.json
- frontend/.storybook/main.ts
- frontend/AGENTS.md
- frontend/package.json
- frontend/package-lock.json

HARD STOP:
Если эти файлы принадлежат другому активному агенту или WIP не завершён, ничего
не перезаписывай. Сообщи точный dirty scope.

NON_GOALS:
- изменение UI компонентов
- добавление stories для feature screens
- dependency upgrades вне addon-mcp
- публикация Storybook наружу

ACCEPTANCE:
- npm run build-storybook PASS
- npm run storybook поднимает local server
- POST initialize к http://127.0.0.1:6006/mcp возвращает MCP capabilities
- tools/list содержит documentation/story preview tools
- минимум один существующий TLT component находится через MCP documentation
- frontend/AGENTS.md описывает MCP как preferred discovery path, но сохраняет
  fallback на public barrel/README при недоступном server
- npm run test:agent-gates PASS
- package/lock согласованы

Добавь только явные файлы slice; не используй git add .
```

---

### Prompt 6 — `CONF-SCOPE-01`: команда маршрутизации файла

```text
Выполни ровно один frontend tooling slice.

SLICE_ID: CONF-SCOPE-01
OWNER: tooling
GOAL:
Добавить команду:
  npm run agent:scope -- <repo-relative-path>
которая однозначно сообщает owner, boundary, state hints, focused proof и
browser requirement для переданного frontend-файла.

ALLOWED_SCOPE:
- максимум один config/registry
- максимум один CLI script
- максимум два tooling tests
- frontend/package.json
- один датированный audit snapshot

NON_GOALS:
- новый framework/CLI dependency
- ручный список каждого файла
- runtime imports из tooling config
- генерация второй ACTIVE очереди
- автоматическое изменение файлов

OUTPUT CONTRACT:
owner:
zone:
public_entrypoint:
state_owner:
focused_tests:
architecture_gates:
full_dod_required:
browser_profiles:
source_rules:

DESIGN:
- используй path rules и исключения, а не сотни записей
- каждый production TS/TSX/CSS файл получает ровно одного owner либо явный
  shared/tooling classification
- конфликт двух правил является ошибкой
- неизвестный файл возвращает non-zero и actionable message
- UI Kit указывает public barrel @/components/ui-kit
- browser profiles выводятся из существующей viewport policy, не дублируются
  новой независимой таблицей

ACCEPTANCE:
- fixtures минимум для Heat, Electrical, Specification, Reports, UI Kit,
  shared API, CSS и test file
- ambiguous и unknown fixtures красные
- coverage report не содержит unowned production files
- команда read-only и завершается быстро
- focused tooling tests PASS
- npm run test:agent-gates PASS
- npm run test:agent-dod PASS, если package scripts/test surface изменены
```

---

### Prompt 7 — `CONF-UI-BOUNDARY-01`: однозначный выбор TLT или Ant

```text
Выполни ровно один UI boundary slice.

SLICE_ID: CONF-UI-BOUNDARY-01
OWNER: ui
GOAL:
Убрать необходимость угадывать, когда импортировать TLT facade, а когда raw
Ant: сформулировать короткое decision rule и обеспечить его architecture test.

ALLOWED_SCOPE:
- docs/frontend/ant-ui-kit-strategy.md
- frontend/src/components/ui-kit/README.md
- существующий antd primitive architecture policy/test
- максимум один policy config/baseline file
- один датированный audit snapshot

NON_GOALS:
- массовая миграция прямых Ant imports
- создание wrappers для каждого Ant component
- рост baseline
- feature UI/CSS изменения
- новый второй UI Kit

DECISION RULE:
1. Если публичный TLT equivalent существует — feature импортирует его только
   через @/components/ui-kit.
2. Если equivalent отсутствует — raw Ant разрешён до доказанного повторяемого
   product contract.
3. Новый TLT primitive появляется при повторяемом product behavior, а не ради
   переименования Ant.
4. UI Kit не импортирует feature/domain/store/API.

ACCEPTANCE:
- rule помещается в одну компактную таблицу
- architecture test запрещает raw Ant только для реально существующих TLT
  equivalents
- raw Ant без equivalent не объявляется нарушением
- Storybook MCP используется для проверки documented props/stories, если
  доступен
- existing architecture baselines не растут
- npm run test:ui-kit PASS
- npm run test:agent-gates PASS
- npm run test:agent-dod PASS, если test policy изменена

Если inventory доказывает, что rule и machine guard уже полностью совпадают с
этим acceptance, не создавай косметический patch: зафиксируй read-only PASS в
audit и заверши slice без production/normative изменений.
```

---

### Prompt 8 — выполнить следующий production hotspot из ACTIVE backlog

```text
Выполни ровно один следующий pending P-BAND-* из
docs/frontend/refactor-backlog.md через
docs/frontend/agent-refactor-prompt.md.

Не используй числа из этого prompt как baseline: пересчитай текущий LOC.
Один owner file за запуск. Characterization first для stateful/interactive
owner. Extract только по use-case с явными inputs/outputs и одним владельцем
side effects. После extract исходный owner должен быть ≤399 LOC. Не меняй UX,
API/query/state semantics. Не создавай общий barrel и не переносись массово в
features/.

Focused proof → npm run test:agent-dod → production commit → отдельный backlog
closure commit с production hash. Если target dirty чужим WIP — STOP.
```

Точный список `P-BAND-*`, порядок и acceptance находятся только в
[refactor-backlog.md](../../frontend/refactor-backlog.md); здесь они намеренно
не копируются.

---

### Prompt 9 — выполнить следующий heavy test slice

```text
Выполни ровно один следующий pending P-TEST-* из
docs/frontend/refactor-backlog.md, но только после завершения Track A либо если
пользователь явно назвал этот test slice.

Используй docs/frontend/prompts/split-large-tests-by-scenario.md.
Сохрани те же test titles, assertions, mocks и setup semantics. Scenario suite
разделяй по user journey; machine ratchet/harness разделяй на pure helpers и
thin entrypoint, не выдумывай пользовательские сценарии. Production behavior и
architecture baselines не меняй.

Focused tests должны доказать тот же набор tests до/после. Затем запусти
canonical DoD согласно стандарту. Один owner и один исходный monolith за
запуск.
```

---

### Prompt 10 — `CONF-AUDIT-01`: повторная оценка запутанности

```text
Проведи read-only frontend agent-friendliness audit.

SLICE_ID: CONF-AUDIT-01
OWNER: qa
GOAL:
Пересчитать запутанность по rubric из
docs/audit/2026-07-26-agent-confusion-reduction/plan.md и проверить exit ≤2,0.

REQUIRED SAMPLE:
- один Heat runtime file
- один Electrical runtime file
- один Reports/Specification file
- один UI Kit component/story
- один CSS owner
- один unit и один integration/e2e file

FOR EACH SAMPLE:
1. Определи owner и allowed boundary.
2. Определи state owner.
3. Получи focused tests и browser requirement.
4. Сравни ручной путь с npm run agent:scope -- <file>, если команда существует.
5. Зафиксируй неоднозначности, но ничего не исправляй.

REQUIRED CHECKS:
- production LOC band и files > hard caps
- dependency/type/CSS/Ant architecture baselines
- direct Ant imports vs разрешённый decision rule
- canonical DoD wall и результат
- Storybook build/MCP availability
- evidence freshness
- browser console/network health критических путей
- git status и воспроизводимость source commit

OUTPUT:
- датированный snapshot с exact HEAD/UTC/host/commands
- таблица шести confusion dimensions и weighted total
- PASS только если total ≤2,0 и ни одно измерение >3,0
- открытые проблемы как residual findings, не как вторая queue
- никаких production/docs normative изменений
```

## 5. Контрольные метрики

Перед каждым slice значения пересчитываются. Целевые контракты:

| Метрика | Цель |
|---|---|
| Unowned production files в `agent:scope` | `0` |
| Файлы с несколькими owner rules | `0` |
| Raw Ant imports при существующем TLT equivalent | `0` |
| Новые cross-feature deep imports | `0` |
| Production files выше hard cap | `0` |
| Production files в активном диапазоне `400–hard cap` | `0` после закрытия Track A |
| Current evidence с несовпадающим source/build identity | `0` |
| Critical browser path console errors/warnings | `0` |
| Failed network requests в acceptance path | `0` |
| Fast agent gates | сохраняются быстрыми; регрессия объясняется |
| Canonical DoD | `PASS`; wall публикуется честно, без фиктивного `≤120s` |
| Итоговая запутанность | `≤2,0/10`, каждый dimension `≤3,0` |

## 6. Что не делать

- Не создавать отдельные `feature-map.md` для каждого экрана вручную: они
  быстро расходятся с кодом. Предпочтителен один проверяемый path registry и
  read-only CLI.
- Не снижать LOC бессмысленным переносом функций в `helpers.ts`.
- Не превращать UI Kit в wrapper над каждым Ant component.
- Не запускать массовую миграцию всех 150 direct Ant import sites.
- Не объединять tooling, Heat, Electrical, UI и QA в один commit.
- Не повышать workers, timeout или baseline вместо устранения причины.
- Не считать Storybook screenshot доказательством runtime workflow.
- Не добавлять mobile scope ради улучшения agent-friendliness.

## 7. Definition of Done инициативы

Инициатива завершена, когда:

1. `CONF-AUDIT-01` показывает confusion score `≤2,0`.
2. `npm run agent:scope -- <file>` однозначно маршрутизирует representative
   production/test/CSS paths.
3. Ant/TLT decision проверяется кодом, а не памятью агента.
4. Current browser evidence невозможно спутать с historical.
5. Excel core E2E соответствует runtime без commercial flag.
6. Heat critical path не пишет console error/warning.
7. Storybook MCP доступен либо документирован честный fallback.
8. Canonical DoD зелёный и имеет правдивый measured wall.
9. ACTIVE backlog остаётся единственным источником pending и закрывается по
   собственному closure rule.
10. Каждый выполненный slice имеет отдельный conventional commit; для backlog
    сохранена пара production commit → docs closure commit.
