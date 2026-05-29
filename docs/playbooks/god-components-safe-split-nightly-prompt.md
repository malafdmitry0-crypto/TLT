# HeatCalcPage Safe Split Nightly Prompt

Этот prompt предназначен для ночного запуска Codex в агентском режиме. Цель -
за один автономный проход сделать анализ `HeatCalcPage`, зафиксировать текущее
поведение тестами и выполнить один маленький безопасный refactor slice без
изменения бизнес-поведения.

## Как запускать

Скопируй блок ниже в Codex agent mode из корня репозитория.

```text
Работай в режиме /fix-focused, максимально консервативно и агентно.

Primary target:
- HeatCalcPage only.
- Не редактируй ElecCalcPage в этом запуске.
- Не создавай shared abstraction для HeatCalcPage и ElecCalcPage.

Goal:
1. Проанализировать HeatCalcPage как god-component.
2. Прочитать decomposition roadmap и progress ledger.
3. Добавить или усилить characterization tests для текущего поведения.
4. Сделать ровно один маленький refactor slice, только если tests/evidence
   позволяют доказать неизменность поведения.
5. Обновить progress ledger после успешного slice.
6. Дать Functional Accuracy Report с docs -> backend -> frontend -> tests
   evidence.

Agent routing:
- Сначала прочитай AGENTS.md.
- Затем прочитай .agents/routing.yaml.
- Primary role: frontend_ui_proof.
- Supporting mental roles: functional_accuracy, qa_regression, backend_business.
- Режим /fix-focused намеренно перекрывает default_mode роли frontend_ui_proof,
  потому что запуск должен сделать один bounded code slice.
- Если выбранный slice меняет JSX/CSS/видимый UI, дополнительно применяй
  /ui-proof evidence requirements.
- Если runtime или пользователь не разрешил sub-agents/delegation, применяй эти
  роли локально.
- Если delegation явно разрешен, можно дать sidecar read-only задачи:
  docs_contract для требований и qa_regression для test inventory. Code-edit
  owner только один.

Hard safety rules:
- Не делай широкий рефакторинг.
- Не переписывай архитектуру целиком.
- Не меняй формулы, expected/golden values, API-контракты или units без
  независимого источника правды.
- Не ослабляй assertions ради green tests.
- Не удаляй существующий код без доказательства, что он больше не используется.
- Не делай git commit.
- Не трогай unrelated dirty files.
- Перед правками выполни git status --short. Если HeatCalcPage или релевантные
  test files уже dirty, прочитай diff и работай поверх него, не откатывая
  чужие изменения.
- Если появляется риск сломать поведение, остановись и оформи finding.
- Если in-scope тест/Playwright/browser/DB недоступен, это blocked или needs
  verification, а не pass.

Change budget:
- greenfield extraction: можно добавить максимум 1 production file и 1 test file;
- existing module extraction: можно править максимум 1 existing production helper
  file и 1 existing test file;
- максимум 1 page file edited: frontend/src/pages/HeatCalcPage.tsx;
- максимум 2 test files edited;
- namespace для route-level helpers: `frontend/src/pages/heatcalc/`;
- namespace для reusable UI components: `frontend/src/components/heatcalc/`;
- tests по существующему паттерну: `frontend/src/__tests__/unit/pages/heatcalc/`
  или уже существующий nearest test file;
- не менять backend, если не обнаружен обязательный backend finding;
- не менять ElecCalcPage;
- если нужно больше файлов, остановись и оформи Recommended next safe slice.

Обязательный старт:
Всегда прочитай:
- codex-docs/README.md
- codex-docs/project-map.md
- codex-docs/requirements-map.md
- codex-docs/testing.md
- docs/playbooks/agent-proof-modes.md
- docs/playbooks/heatcalc-page-decomposition-prompts.md
- docs/playbooks/god-components-safe-split-nightly-prompt.md
- docs/api.md
- docs/analysis/business-rules.md
- docs/srs.md
- docs/tz-compliance.md
- docs/srs/ui/employee/03-screen-workspace-heatcalc.md
- docs/srs/ui/guest/02-screen-workspace-heatcalc.md
- relevant docs/qa/*

Условно прочитай только если выбранный slice затрагивает units, calculation
mapping, result diagnostics, formula traceability, payload или coefficients:
- codex-docs/business-formula-contracts.json
- formules.md
- coefficients.MD
- docs/context/formulas-summary.md
- docs/playbooks/formula-validation-agent.md

Discovery через rg:
- HeatCalcPage implementation;
- already extracted modules in `frontend/src/pages/heatcalc/` and
  `frontend/src/components/heatcalc/`;
- remaining local helpers/components in HeatCalcPage;
- useState/useEffect/useMemo/useCallback;
- HeatCalcPage API calls and hooks;
- object create/edit/delete/save paths;
- heat calculation and electrical batch trigger paths from HeatCalcPage;
- persistence/reload path;
- diagnostics/result rendering path;
- column/table/filter/sort/pagination state;
- wizard/inline-edit/import-export state;
- tests for HeatCalcPage, ObjectWizard, heat flow, object persistence;
- relevant Playwright/e2e heat calculation specs;
- formula contracts only if the candidate slice touches calculation mapping,
  result diagnostics, payload, units, or traceability.

Before edits checkpoint:
Составь короткую карту:
Документация -> backend -> frontend -> tests

Прочитай `Progress Ledger` в `docs/playbooks/heatcalc-page-decomposition-prompts.md`.
Не повторяй пункты со статусом Done. Затем выбери ровно один safe slice:
A. tests-only characterization, если нет надежного тестового каркаса;
B. следующий unfinished pure/helper/renderer slice из ledger, если он легко
   покрывается unit tests;
C. tiny presentational extraction, только если UI proof можно сделать без
   большого prop chain;
D. stop with finding, если safe slice превышает Change budget.

Предпочтительный выбор для этого запуска:
1. `Table state hook`, если можно сначала покрыть `pipe/tank/all`, filters,
   sorting, pagination и reset focused tests в рамках Change budget.
2. Иначе `Preferences hook` только как analysis/tests-only, без переноса state.
3. Иначе tests-only characterization.
Не переходи к presentational extraction, если state/tests slice возможен.

Phase 1: HeatCalcPage Audit And Safety Map
Составь таблицу:
- файл и размер;
- количество useState/useEffect/useMemo/useCallback;
- крупные responsibility clusters;
- API calls;
- object save/reload path;
- calculation submit path;
- electrical batch trigger path;
- result rendering path;
- diagnostics/error path;
- table/grid/filter/sort/pagination state;
- wizard/form state;
- inline edit state;
- import/export state;
- existing tests and gaps;
- proposed first safe extraction.

Phase 2: Characterization Tests First
Добавь или усили focused tests, которые фиксируют текущее поведение
HeatCalcPage или вынесенного pure helper.

P0 test cases: выбери только релевантные выбранному slice. Нерелевантные P0
явно отметь как not applicable в финальном отчете, а не реализуй ради галочки.
- submit/save формирует payload в правильных units;
- validation error не отправляет некорректный payload;
- backend error показывает UI error и не затирает старый валидный result, если
  этот flow уже поддерживается;
- successful save или mocked reload сохраняет выбранное/отображаемое состояние,
  если slice затрагивает persistence;
- result diagnostics не теряются при normalization/rendering;
- unsupported/error/stale result не смешивается с successful result, если slice
  затрагивает result helpers;
- boundary value минимум для одного ключевого heat parameter, если slice
  касается calculation mapping;
- metamorphic check: параметр, который должен монотонно увеличивать результат,
  не уменьшает результат, если slice касается расчетного mapping.

P1 если инфраструктура уже рядом и не расширяет diff:
- initial render без проекта/с проектом;
- загрузка существующих параметров;
- ручное изменение input обновляет только ожидаемые derived fields;
- import/export payload shape для HeatCalc objects;
- column/filter helper сохраняет ожидаемые значения для pipe/tank/all scope.

P2 только зафиксируй как residual risk, не реализуй ночью:
- полный browser before/after для всей HeatCalc страницы;
- 50-100 object performance scenario;
- comprehensive import/export round-trip;
- full report/specification side effect chain.

UI/layout proof:
- Если refactor меняет JSX/CSS/видимый UI, обязателен /ui-proof:
  before screenshot, DOM/CSS cause, verifier, after screenshot.
- Если refactor только pure helper без visible UI changes, screenshots не
  обязательны, но объясни это в report.

Backend/API checks, если flow затрагивается:
- payload shape;
- units;
- roles/errors;
- persistence;
- reload;
- DB invariants после UI scenario.

Phase 3: One Minimal Refactor
Если P0 characterization tests для выбранного slice добавлены/найдены и
проходят, сделай ровно один маленький refactor.

Allowed extraction order:
1. narrow `useHeatCalcTableState` hook from the ledger only if focused tests cover the
   state transitions;
2. preferences hook only after table state hook stabilizes;
3. small presentational component with props only, with /ui-proof evidence.

Do not redo completed slices:
- `heatCalcPageUtils.ts` already exists for broad pure helpers.
- `HeatCalcColumnFilterDropdown.tsx` is already extracted.
- `heatCalcColumnRenderers.tsx` is already extracted.
- Remaining small pure helpers are already in `heatCalcPageUtils.ts`.
- If a candidate is already complete, update the ledger/finding and choose the
  next unfinished slice instead of re-extracting it.

Extraction rules:
- Не менять UX.
- Не менять API shape.
- Не менять units.
- Не менять names/labels без необходимости.
- Не тащить React Query/router/global stores в helper.
- Не переносить DOM helpers, pointer events, ColumnFilterDropdown,
  ResizableColumnTitle, PipeTypeIcon, TankTypeIcon в этом запуске.
- Не создавать giant hook.
- Не создавать helper, который принимает десятки loosely related params.
- Если extraction требует слишком много props/dependencies, stop and report
  finding instead of forcing it.
- После успешного slice обнови `Progress Ledger` в
  `docs/playbooks/heatcalc-page-decomposition-prompts.md`.

Verification commands:
- rg-based discovery commands as needed.
- git diff --check.
- scripts/test.sh frontend OR a narrower existing frontend test command if
  repository convention supports it.
- scripts/formula-qa.sh quick if calculation mapping, units, coefficients, or
  formula-related helpers are touched.
- relevant Playwright/e2e heat calculation spec if visible workflow changed.
- scripts/codex-functional-audit.sh layout if JSX/CSS/layout changed.
- scripts/codex-functional-audit.sh db-invariants after persisted UI scenario.
- scripts/codex-functional-audit.sh contracts if formula/API/UI mapping touched.

Stop Conditions:
Stop and report blocked/needs verification if:
- docs and code disagree;
- no reliable test harness exists for the selected slice;
- expected/golden values would need changing without source of truth;
- refactor requires touching unrelated files broadly;
- required change exceeds Change budget;
- extraction creates worse coupling or giant prop chains;
- persistence/reload cannot be verified when in scope;
- formula_id/version/source/error_code traceability cannot be verified when in
  scope;
- Playwright/browser screenshots are required but unavailable.

Final report format:

Functional Accuracy Report
Scope: HeatCalcPage safe split preparation
Mode: /fix-focused
Agent roles used:
- frontend_ui_proof
- functional_accuracy
- qa_regression
- backend_business if applicable
Docs checked:
- ...
Implementation found:
- Backend: ...
- Frontend: ...
- Tests: ...
Safety map:
- state clusters: ...
- effects: ...
- API/persistence: ...
Slice chosen:
- ...
Changes made:
- ...
Verification:
- Command: ...
- Result: pass/fail/not run
Screenshots:
- before: ...
- after: ...
- not required because: pure helper/no visible UI change
Findings:
- ...
Residual risk:
- ...
Recommended next safe slice:
- ...
Ledger updated:
- yes/no, reason
Out of scope:
- ElecCalcPage was not changed.
- Broad HeatCalc architecture rewrite was not attempted.
```

## Почему prompt ограничен

Для `HeatCalcPage` опасен широкий запрос "раздели компонент": агент может
получить большой hook или много файлов вместо доказуемого улучшения. Этот
prompt оставляет анализ и refactor в одном запуске, но заставляет сначала
зафиксировать поведение, выбрать один safe slice и остановиться при нехватке
evidence.
