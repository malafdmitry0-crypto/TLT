# Frontend refactor backlog

**Статус:** ACTIVE — AF100 agent-friendly 10/10

**Актуально на:** 2026-07-26  
**Queue open reason:** explicit user goal — довести frontend agent loop до
исполняемых **10/10** по
[agent-friendly-10-plan.md](./agent-friendly-10-plan.md).
**Inventory at open:** **22** files in **400–445** LOC (production) — all
extracted under Track A.  
**Last closed:** AF100-09b antd пре-бандлится один раз @ `<pending>`
([snapshot](../audit/2026-07-27-af100-09b-antd-prebundle/snapshot.md))  
**Prior:** AF100-09a node-окружение для DOM-free unit-тестов @ `aa9c3fa`
([snapshot](../audit/2026-07-26-af100-09a-node-environment/snapshot.md))  
**Prior:** AF100-06/-07/-08 deterministic full proof @ `42329ed`
([snapshot](../audit/2026-07-26-af100-06-08-execution/snapshot.md))  
**Prior:** AF100-02/-03/-04/-05/-14 @ `fd9ec39`
([snapshot](../audit/2026-07-26-af100-phase-a-execution/snapshot.md))  
**Prior:** AF100-01 `agent:scope` uniqueness @ `e7ed259`  
**Prior track close:** P-TEST-08 @ `8560d79`

### NEXT (единственный)

| Поле | Значение |
|---|---|
| **NEXT** | **AF100-09c** — пре-бандл для integration (long pole переехал туда) |
| Owner | `qa` |
| **Не NEXT** | Не `isolate: false` (отклонён, см. п. 6) и не рост workers |
| Разблокировано | 09b закрыт: unit-налог снят, и замер показал, где остался |

**Почему NEXT = AF100-09c** (измерено на `825e4f6` → 09b):

1. **Long pole переехал в `integration`.** 09b оптимизировал только `unit`,
   и per-file налог теперь распределён крайне неравномерно:

   | Проект | import | файлов | на файл |
   |---|---:|---:|---:|
   | unit (оптимизирован) | 33.4 s | 289 | **0.12 s** |
   | integration (нет) | 50.1 s | 41 | **1.22 s** |

   Integration платит **в 11 раз больше на файл** — тот же antd-налог, который
   в unit уже снят.
2. Блокируют **три места**, а не два (проверено `grep` по bare `importActual`):
   - `HomePage.test.tsx`, `LoginPage.test.tsx` → `importActual('react-router-dom')`;
   - `elecCalcPageTestEnv.componentMocks.tsx` → `importActual('react')` ×3, и это
     **общий setupFile проекта elec-integration**, то есть влияет на все его файлы.
3. Форма слайса: выделить router-файлы в отдельный unoptimized project,
   остальные 39 запустить с `deps.optimizer.client`; для elec-integration
   сначала проверить, переживает ли harness пре-бандл `react`.
   `isolate: true` сохраняется везде.
4. **Бюджет не подтверждён, а не провален.** Прогоны 09b дали PASS 3/3, но
   179.29 / 148.69 / 129.21 s при load average 6.35 / 10.74. Гипотеза
   «первый прогон строит пре-бандл» **опровергнута** (cold 134.25 s против
   warm 134.63 s), значит разброс — шум хоста. Acceptance 09c обязан включать
   quiet-host замер n≥3.
5. Достоверны парные дельты, прогонами подряд на unit-проекте:
   09a **−13.7 s** (env+setup), 09b **−26.6 s** (import 87.7 → 33.4 s).
   Harness tax unit-проекта **185.0 → 95.3 s (−48 %)**.
6. `isolate: false` (−86 % import, wall 84.1 s) **отклонён окончательно**:
   ломает 27 файлов и снимает свойство безопасности — hoisted-моки
   elec-harness, zustand-синглтоны, закэшированная ветка `api/client.ts`,
   module-level кэши Ant/CSS-in-JS начинают течь между файлами. Безопасное
   подмножество — ровно те 87 DOM-free файлов, что уже переведены в `node`.
7. План §5: рост `maxWorkers` и дробление сценариев **не являются** acceptance.

**Долг, найденный при приёмке 09b** (не блокирует 09c, но обязателен до
AF100-16): `agent:scope` не знает `vite.config.ts` — `unknown path (no owner
rule)`. Обязательный первый шаг agent loop неисполним для конфигов frontend.
Это тот же класс дефекта, что AF100-01/-02. Закрыть в **AF100-12**.

Evidence: [af100-09a-node-environment](../audit/2026-07-26-af100-09a-node-environment/snapshot.md).
Корневые причины и приёмка по slice:
[prompts/af100-execution-plan.md](./prompts/af100-execution-plan.md).

Это **единственный** источник текущего `pending` для frontend. Одновременно
может существовать только одна ACTIVE frontend-очередь. Initiative plans,
archive summaries и audit snapshots **не** маршрутизируют `pending` и не
объявляют `COMPLETE` при непустом backlog.

Очереди RISK / AF10–AF12 и corrective P5–P9 **закрыты** как historical work.
Длинные Done narratives — в
[archive/risk-recovery-and-p-series-historical.md](./archive/risk-recovery-and-p-series-historical.md)
и [archive/af12-historical.md](./archive/af12-historical.md).

Постоянные правила: [стандарт](./agent-development-standard.md).  
Размер slice: [PR budget](./pr-budget.md).  
Исполняемый шаблон: [мастер-промпт](./agent-refactor-prompt.md).  
Viewport / UI Kit: [viewport-policy](./viewport-policy.md), [ui-kit](./ui-kit.md).  
Test split template: [split-large-tests-by-scenario](./prompts/split-large-tests-by-scenario.md).  
**Текущие AF-метрики:** только датированные `docs/audit/YYYY-MM-DD-*/` на
**текущем HEAD** — не цитировать historical **8.1** / fixed **8.3 @ a9b4cb3**.

## Pending — AF100 agent-friendly 10/10

Acceptance и hard gates программы:
[agent-friendly-10-plan.md](./agent-friendly-10-plan.md).  
Исполнительные notes (не очередь):
[prompts/af100-execution-plan.md](./prompts/af100-execution-plan.md).

| # | ID | Status | Owner | Outcome |
|---:|---|---|---|---|
| 1 | **AF100-01** | **done** `e7ed259` | tooling | `agent:scope`: unique 100%, ambiguous/unowned 0; coverage ловит оба класса ошибок |
| 2 | **AF100-02** | **done** `fd9ec39` | tooling | Emitted commands исполнимы: 0 prose, 0 несуществующих npm scripts, path-фильтры матчат; guard на sample из 15 файлов |
| 3 | **AF100-03** | **done** `fd9ec39` | tooling | `css:architecture` → fail-closed gate: 4 файла / 12 тестов; удалённый ratchet → exit 1 с именем группы |
| 4 | **AF100-04** | **done** `fd9ec39` | tooling | Битый PostToolUse hook удалён; root `AGENTS.md` маршрутизирует; guard на пути скриптов в hooks |
| 5 | **AF100-05** | **done** `fd9ec39` | qa | `frontend/playwright.config.ts` удалён; `cd e2e && npx playwright test --list` → 125/34; guard на единственный config |
| 6 | **AF100-06** | **done** `42329ed` | qa | Два флейка (wall-cap + teardown import) устранены; stress 20/20; dual-safe 3/3 |
| 7 | **AF100-07** | **done** `42329ed` | tooling | CI, AGENTS, стандарт и package.json называют `test:agent-dod:dual-safe`; guard на дрейф |
| 8 | **AF100-08** | **done** `42329ed` | qa | Quiet-host n=3: 145.08/145.99/145.68 s; long pole — concurrent unit+integration (~136 s) |
| 9a | **AF100-09a** | **done** `aa9c3fa` | qa | 87 DOM-free файлов → `node`-окружение; env+setup −29.0 s, gates 10.13 → 7.32 s; 1202 теста без изменений; guard на env-ветвление в графе |
| 9b | **AF100-09b** | **done** `<pending>` | qa | `antd` пре-бандлится один раз для `unit`: import 87.7 → 33.4 s, wall −26.6 s; причина поломки — `@ant-design/icons`, не `antd`; 6 моков перенесены на границу `appMessage`; guard 8 тестов, 4 red-demo |
| 9c | **AF100-09c** | **pending → NEXT** | qa | Пре-бандл для integration (1.22 s/файл против 0.12 в unit) + quiet-host профиль n≥3 |
| 10 | **AF100-10+** | **pending** | feature | Stateful/interactive >350 LOC classified; extracts только по одному owner |
| 11 | **AF100-11+** | **pending** | ui | Direct Ant inventory classified; feature debt shrink-only |
| 12 | **AF100-12** | **pending** | tooling | Production path детерминированно возвращает ближайшие tests/harness |
| 13 | **AF100-13** | **pending** | qa | Live U0 browser matrix green на 1000/1280/1440 |
| 14 | **AF100-14** | **done** `fd9ec39` | tooling | Tracked в корне 84 → 14 (только конфигурация); `tmp/` untracked; guard с allowlist корневых файлов |
| 15 | **AF100-15** | **pending** | docs | Backlog/AGENTS/standard/README/scorecard синхронизированы |
| 16 | **AF100-16** | **pending · blocked by all others** | qa | Независимый clean-checkout audit: hard gates + 10.0 |

`AF100-09+`, `AF100-10+` и `AF100-11+` раскрываются только после inventory /
profile: один owner и один измеримый результат на под-slice.

### Нормативная цепочка (обязательна)

```text
AF100-06 (flake dual-safe)
    → AF100-08 (quiet-host profile n≥3)
        → AF100-07 (одна каноническая DoD-команда)
            → AF100-09a (плоский env/setup tax)  ✔ aa9c3fa
                → AF100-09b (collect tax / p50 ≤120 s)
```

Каждая стрелка — **hard block**, не «желательно»:

| Стрелка | Почему нельзя перепрыгнуть |
|---|---|
| **06 → 08** | Профиль long pole / p50 на красном dual-safe или на «обходе» flake — невалидный baseline: фазы искажены ретраями, abort sibling, нестабильным export. 08 **blocked by 06**. |
| **08 → 07** | Канонизировать orchestrator (dual-safe vs sequential) **до** quiet-host n≥3 — выбор вслепую; закрепить в CI/docs проигравшую или нестабильную команду. 07 **blocked by 06 и 08**. |
| **07 → 09+** | Срезать harness/setup tax «до» единой команды и профиля — оптимизация без SoT-команды и без цифр long pole; план §2 запрещает speed-work до измерения. 09+ **blocked by 08** (и фактически 06). |
| **06 → 13** | Пройдено: full proof стабилен 3/3, 13 разблокирован. |
| **\* → 16** | Независимый audit 10.0 только когда все остальные `done`. 16 **blocked by all**. |

**Цепочка пройдена** в `42329ed`: 06 → 08 → 07 закрыты. В `aa9c3fa` закрыт
**09a** — первый под-slice серии 09+; бюджет p50 ≤120 s ещё не достигнут
(140.0 s), поэтому серия продолжается слайсом **09b**.
Остаются независимые 10+, 11+, 12, 15 и заблокированные 13 (browser) и 16.

**Правило dual-safe-close остаётся:** пункт становится `done` только если
`test:agent-dod:dual-safe` зелёный на **этом** HEAD. Sequential
`test:agent-dod` — тот же orchestrator с другим worker-профилем, годен для
отладки, но не для закрытия slice.

## Правила очереди

- Один запуск выполняет один `pending` slice и одного owner.
- Пункт становится `done` только после focused proof (и DoD, если slice
  затрагивает runtime/tests/guardrails) **и** условий закрытия AF100 ниже.
- Before-метрики пересчитываются из текущего дерева; audit snapshot не
  разрешает повысить baseline.
- Новый пункт — только по явной цели пользователя.
- Норматив хранит правила; счётчики — только в `docs/audit/YYYY-MM-DD-*/`.
- Не объявляй инициативу завершённой, пока в этом файле есть pending.
- Extract: behavior-preserving; characterization first for stateful owners;
  after owner **≤399 LOC**; no multi-owner cascade in one slice.
- **Закрывай slice только при зелёном `test:agent-dod:dual-safe` на этом HEAD.**
  Sequential `test:agent-dod` — тот же orchestrator с другим worker-профилем:
  годен для отладки, не годен как acceptance.

### Условия закрытия AF100-slice (поверх стандарта)

Эти **восемь** условий обязательны для каждого AF100-пункта. Они **жёстче**
общих правил стандарта и **не** ослабляются промптом, chat-контрактом или
«локально зелено».

1. **Guard обязателен.** Каждый закрытый дефект оставляет машинную проверку,
   которая краснеет при регрессии: тест, ratchet или fail-closed gate.
   Исправление без guard — **не** `done`.
2. **Guard на обеих ветках.** В slice показаны success path **и** намеренно
   сломанный вход, на котором guard краснеет. Guard без red-demo — не принят.
3. **`NOT RUN` ≠ PASS.** Каждая заявленная проверка — команда + HEAD +
   результат. Отсутствие запуска не закрывает пункт.
4. **Зелёный без обходов.** `done` запрещён при `.only` / `.skip` / retry /
   поднятом timeout / увеличенных workers / raised baseline / ослабленном
   assert. Скорость и стабильность — только устранением причины.
5. **Флейк-стандарт.** Где acceptance требует повторяемости: focused stress
   **≥20/20** и полный proof **PASS 3/3 подряд** на quiet host. Один красный
   обнуляет счётчик; «со второго раза» — не приёмка.
6. **Цифры с текущего дерева.** Before/after на HEAD слайса; старый snapshot
   не заменяет замер. Числа — в `docs/audit/YYYY-MM-DD-*/`, не в backlog.
7. **Чужой WIP неприкосновенен.** `git status --short` до старта; в commit
   только файлы своего slice; `git add .` запрещён.
8. **Без корневого мусора.** Скриншоты, логи, отчёты прогонов не остаются в
   корне репо (иначе растёт долг AF100-14).

## Historical motivation (queue closed — not ACTIVE)

Track A (P-BAND-01..22) and Track B (P-TEST-01..08) **closed**. This section is
provenance only; it does **not** reopen the queue.

Prior inventories / waves (evidence only, not queue authority):

- [P7 band classification](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md)
- [Agent-friendliness residuals](../audit/2026-07-25-agent-friendliness-residuals/snapshot.md)
- [Heavy test files](../audit/2026-07-26-heavy-test-files/snapshot.md)
- [Five residual fixes (partial)](../audit/2026-07-26-agent-friendliness-five-fixes/snapshot.md)
- [agent-scope + docs SoT](../audit/2026-07-26-agent-scope-and-docs-sot/snapshot.md)

Process residuals (not pending unless user promotes): DoD harness extract,
browser re-seal, production→tests registry — see
[prompts/dod-wall-under-120.md](./prompts/dod-wall-under-120.md) and
[agent-scope plan](../audit/2026-07-26-agent-scope-and-docs-sot/snapshot.md).

---

## Closed — Track A: production 400-band extracts

**Goal:** leave the 400–445 production band empty (or only newly grown files
re-inventoried later). One file per slice. Recompute LOC at start of each slice.

Order = risk first (stateful hooks/pages → interactive components → pure
util/domain/api/types).

| # | ID | Status | Owner | Path (approx LOC at queue open) | Extract hint |
|---:|---|---|---|---|---|
| 1 | **P-BAND-01** | **done** `6cf5007` | heat | `useHeatCalcPreferences.ts` **445→323** | [audit](../audit/2026-07-25-p-band-01-prefs/snapshot.md) |
| 2 | **P-BAND-02** | **done** `9c21b70` | admin | `DatabasePage.tsx` **444→230** | [audit](../audit/2026-07-25-p-band-02-database/snapshot.md) |
| 3 | **P-BAND-03** | **done** `907d435` | electrical | `useElecCalcElectricalColumnRenderers.tsx` **443→255** | [audit](../audit/2026-07-25-p-band-03-elec-renderers/snapshot.md) |
| 4 | **P-BAND-04** | **done** `f1a3a64` | heat | `utils/heatCalcInlineEdit.ts` **442→322** | [audit](../audit/2026-07-26-p-band-04-inline-edit/snapshot.md) |
| 5 | **P-BAND-05** | **done** `503539c` | electrical | `utils/electricalCandidateTableColumnsCore.ts` **437→257** | [audit](../audit/2026-07-26-p-band-05-candidate-columns/snapshot.md) |
| 6 | **P-BAND-06** | **done** `83e4c08` | electrical | `ElectricalCandidateGlideGrid.tsx` **430→367** | [audit](../audit/2026-07-26-p-band-06-candidate-glide/snapshot.md) |
| 7 | **P-BAND-07** | **done** `bb0189c` | heat | `HeatCalcGlideGrid.tsx` **429→363** | [audit](../audit/2026-07-26-p-band-07-heat-glide/snapshot.md) |
| 8 | **P-BAND-08** | **done** `bc07b4f` | shared | `api/calculations.ts` **428→212** | [audit](../audit/2026-07-26-p-band-08-calculations-api/snapshot.md) |
| 9 | **P-BAND-09** | **done** `525c1a3` | heat | `utils/heatCalcExcelMode.ts` **427→256** | [audit](../audit/2026-07-26-p-band-09-excel-mode/snapshot.md) |
| 10 | **P-BAND-10** | **done** `99c5726` | heat | `heatCalcColumnRenderers.tsx` **423→293** | [audit](../audit/2026-07-26-p-band-10-heat-renderers/snapshot.md) |
| 11 | **P-BAND-11** | **done** `14e1059` | shared | `types/calculation.ts` **413→109** | [audit](../audit/2026-07-26-p-band-11-calculation-types/snapshot.md) |
| 12 | **P-BAND-12** | **done** `2d35d28` | heat | `domain/heatCalcFieldRules.ts` **412→254** | [audit](../audit/2026-07-26-p-band-12-field-rules/snapshot.md) |
| 13 | **P-BAND-13** | **done** `8538079` | heat | `useHeatCalcNormalGlideController.ts` **412→396** | [audit](../audit/2026-07-26-p-band-13-normal-glide-controller/snapshot.md) |
| 14 | **P-BAND-14** | **done** `b54cd23` | heat | `useHeatCalcTableColumns.tsx` **411→287** | [audit](../audit/2026-07-26-p-band-14-table-columns/snapshot.md) |
| 15 | **P-BAND-15** | **done** `498dfe8` | reports | `ReportWizardPage.tsx` **409→264** | [audit](../audit/2026-07-26-p-band-15-report-wizard/snapshot.md) |
| 16 | **P-BAND-16** | **done** `5040267` | electrical | `ElectricalCandidateColumnSettingsModal.tsx` **409→239** | [audit](../audit/2026-07-26-p-band-16-candidate-settings/snapshot.md) |
| 17 | **P-BAND-17** | **done** `61ef37f` | heat | `useObjectWizardFormSync.ts` **407→310** | [audit](../audit/2026-07-26-p-band-17-form-sync/snapshot.md) |
| 18 | **P-BAND-18** | **done** `8d3afae` | heat | `useHeatCalcObjectsDataModel.ts` **406→389** | [audit](../audit/2026-07-26-p-band-18-objects-data/snapshot.md) |
| 19 | **P-BAND-19** | **done** `ec34232` | heat | `InsulationLayersTable.tsx` **406→246** | [audit](../audit/2026-07-26-p-band-19-insulation-layers/snapshot.md) |
| 20 | **P-BAND-20** | **done** `a156bf0` | electrical | `utils/electricalTableColumns.ts` **405→387** | [audit](../audit/2026-07-26-p-band-20-electrical-columns/snapshot.md) |
| 21 | **P-BAND-21** | **done** `be25348` | heat | `useHeatCalcWorkspaceDataModel.ts` **405→303** | [audit](../audit/2026-07-26-p-band-21-workspace-data/snapshot.md) |
| 22 | **P-BAND-22** | **done** `8c57663` | specification | `useSpecificationPageModel.ts` **403→384** | [audit](../audit/2026-07-26-p-band-22-spec-model/snapshot.md) |

**Acceptance per P-BAND-NN:**

1. Single owner; ≤ budget from `pr-budget.md`.
2. Characterization for stateful/interactive before extract.
3. Owner file **≤399 LOC** after; extracted modules named by use-case.
4. Focused tests green; `test:agent-dod` if runtime/tests touched.
5. Audit note under `docs/audit/YYYY-MM-DD-p-band-NN-*/snapshot.md` with
   before/after LOC + HEAD.
6. Mark this row `done` in the same docs closure commit.

If a file is already ≤399 after recompute (another slice shrunk it), mark
done with evidence and take next pending — do not invent extra extract.

---

## Closed — Track B: heavy test contexts

**Goal:** reduce agent open cost for large suites/harnesses still above
comfortable scenario size. Prefer scenario split for suites; helpers extract
for ratchets/harnesses (do **not** fake scenario-split a machine gate).

Template: [split-large-tests-by-scenario](./prompts/split-large-tests-by-scenario.md).

| # | ID | Status | Owner | Path (approx LOC at queue open) | Action |
|---:|---|---|---|---|---|
| 1 | **P-TEST-01** | **done** `b6c7672` | qa | catalog-recalc **509 → 3 scenarios (≤217)** | [audit](../audit/2026-07-26-p-test-01-catalog-recalc/snapshot.md) |
| 2 | **P-TEST-02** | **done** `df94f01` | qa | basics **507 → 4 scenarios (≤278)** | [audit](../audit/2026-07-26-p-test-02-heat-basics/snapshot.md) |
| 3 | **P-TEST-03** | **done** `49d15da` | qa | ReportPage **481 → harness+4 scenarios (≤126)** | [audit](../audit/2026-07-26-p-test-03-report-page/snapshot.md) |
| 4 | **P-TEST-04** | **done** `9c99510` | architecture | inlineStyleRatchet **582→249** gate + helpers | [audit](../audit/2026-07-26-p-test-04-inline-style-ratchet/snapshot.md) |
| 5 | **P-TEST-05** | **done** `b7531b5` | qa | elecCalcPageTestEnv **676→80** barrel + api/component mocks | [audit](../audit/2026-07-26-p-test-05-elec-testenv/snapshot.md) |
| 6 | **P-TEST-06** | **done** `f03b2df` | qa | HeatCalcPage.test-mocks **643→4** barrel + clusters | [audit](../audit/2026-07-26-p-test-06-heatcalc-mocks/snapshot.md) |
| 7 | **P-TEST-07** | **done** `97c6d96` | qa | electrical-candidate-selection **667 → 4 journeys** | [audit](../audit/2026-07-26-p-test-07-elec-candidate-e2e/snapshot.md) |
| 8 | **P-TEST-08** | **done** `8560d79` | qa | inline-form-dependencies **643 → 5 journeys** | [audit](../audit/2026-07-26-p-test-08-inline-form-e2e/snapshot.md) |

**Order:** complete **Track A first** (production band), then Track B in table
order — unless the user names a specific test slice.

**Acceptance per P-TEST-NN:** same `it` titles/asserts; monolit removed or
thinned; focused green; no production change unless fixing test-only import
path; audit snapshot with before/after LOC.

Already done (do not re-open as monolit): HeatCalcNormalGlideGrid, ObjectWizard,
variant selection/tabs, objects data model, candidates, cable-meta, table-batch,
headers-scroll, cssArchitectureRatchet helpers, HeatCalcPage.test-utils barrel.
See [heavy-test audit](../audit/2026-07-26-heavy-test-files/snapshot.md) +
[five-fixes](../audit/2026-07-26-agent-friendliness-five-fixes/snapshot.md).

---

## Process notes (not pending unless user promotes)

These are product/ops targets, **not** a second queue and **not** a reason to
claim EMPTY QUEUE while Track A/B are open:

- DoD wall ≤120s — often unreachable on this host (integration alone can exceed
  120s); dual DoD path exists (`test:agent-dod:dual` / `dual-safe`).
- Deep browser blocked rows (wizard Add, elec system tabs seed) — environment /
  seed, not extract debt.
- Excel live UI source ungated (2026-07-26); served build must match source.

---

## Done index (short)

| Track | Where |
|---|---|
| AF9 | [archive/agent-friendly-9-plan-historical.md](./archive/agent-friendly-9-plan-historical.md) |
| RISK + P0–P9 | [archive/risk-recovery-and-p-series-historical.md](./archive/risk-recovery-and-p-series-historical.md) |
| AF10 | [archive/af10-historical.md](./archive/af10-historical.md) |
| AF11 | [archive/af11-historical.md](./archive/af11-historical.md) |
| AF12 + UI Kit | [archive/af12-historical.md](./archive/af12-historical.md) |
| Ant rollout A–D | [archive/ant-ui-kit-rollout-historical.md](./archive/ant-ui-kit-rollout-historical.md) |
| Meaningful CSS policy | [archive/meaningful-css-historical.md](./archive/meaningful-css-historical.md) + [css-strategy.md](./css-strategy.md) |
| P5–P9 corrective | [p59-corrective-closure](../audit/2026-07-25-p59-corrective-closure/snapshot.md) |
| Heavy-test wave + five residuals | [heavy-test](../audit/2026-07-26-heavy-test-files/snapshot.md), [five-fixes](../audit/2026-07-26-agent-friendliness-five-fixes/snapshot.md) |

### Corrective P5–P9 (closed)

- [x] **P7-CORRECTIVE** — all band files classified  
  [audit](../audit/2026-07-25-p7-stateful-owner-inventory/snapshot.md)
- [x] **P8-CORRECTIVE** — pre-extract char baseline  
  [audit](../audit/2026-07-25-p8-stateful-owner-char/snapshot.md)
- [x] **P9-CORRECTIVE** — excel selection gestures extract  
  [audit](../audit/2026-07-25-p9-stateful-owner-extract/snapshot.md)
- [x] **P59-CORRECTIVE-CLOSE-01** — DoD + browser evidence  
  [audit](../audit/2026-07-25-p59-corrective-closure/snapshot.md)

Representative audits: [P0](../audit/2026-07-24-p0-doc-truth/snapshot.md),
[RISK PASS](../audit/2026-07-25-frontend-risk-recovery/snapshot.md),
[AF12 UI Kit](../audit/2026-07-25-af12-uikit-agent-friendly/snapshot.md).

## Closure rule

После закрытия **последнего** pending (Track A **and** Track B):

1. статус **EMPTY QUEUE**, next=—;
2. evidence остаётся в archive/audit (не вторая очередь);
3. новый point-in-time audit при необходимости;
4. process notes may remain for honesty, but do not activate the queue alone;
5. новый `pending` — только по явной user goal (один owner, один slice).
