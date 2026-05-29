# HeatCalcPage Preferences Safe Split Runner Prompt

Status: historical. `useHeatCalcPreferences` already extracted, and normal
table inline editing was removed later in
`heatcalc-page-decomposition-prompts.md` Prompt 21. Do not run this prompt as a
current instruction without first updating its inline-disable references.

Этот prompt предназначен для одного автономного запуска Codex из корня
репозитория. Цель - безопасно продвинуть следующий slice декомпозиции
`HeatCalcPage`: preferences/settings state. Запуск должен сначала доказать
текущее поведение focused tests, и только затем делать минимальный refactor.

## Как запускать

```bash
codex exec -C /Users/dmalafey/Desktop/TLT --sandbox workspace-write --ask-for-approval never - < docs/playbooks/heatcalc-preferences-safe-split-runner-prompt.md
```

## Prompt

Работай в режиме `/fix-focused`, максимально консервативно и агентно.

Primary target:
- `frontend/src/pages/HeatCalcPage.tsx`
- следующий ledger slice: `useHeatCalcPreferences`
- не редактируй `ElecCalcPage`
- не начинай `HeatCalcToolbar`
- не начинай `HeatCalcObjectsTable`
- не делай shared abstraction между HeatCalcPage и ElecCalcPage
- не делай git commit

Goal:
1. Прочитать requirements/docs/routing для HeatCalcPage preferences/settings.
2. Найти текущую реализацию settings state, cache, API preferences, modal drafts,
   resize persistence и inline-edit-disable confirmation.
3. Сначала добавить или подтвердить characterization tests для behavior, который
   защищает extraction.
4. Если tests/evidence достаточны и change budget не превышен, вынести ровно
   один узкий `useHeatCalcPreferences` v1 hook.
5. Если extraction слишком широкий или создаёт худшую связность, сделать
   tests-only characterization и остановиться с finding.
6. Обновить progress ledger и nightly prompt только если slice фактически
   продвинут.
7. Дать Functional Accuracy Report с evidence.

Agent routing:
- Сначала прочитай `AGENTS.md`.
- Затем прочитай `.agents/routing.yaml`.
- Primary role: `frontend_ui_proof`.
- Supporting mental roles: `functional_accuracy`, `qa_regression`,
  `backend_business`.
- Режим `/fix-focused` намеренно перекрывает `frontend_ui_proof.default_mode`,
  потому что это bounded refactor/testing slice, а не заявленный layout bug.
- Если меняешь JSX/CSS/видимый UI, переходи на `/ui-proof` requirements:
  before screenshot, DOM/CSS root cause, verifier, after screenshot.
- Если runtime не разрешает delegation, применяй роли локально. Не создавай
  subagents без явного разрешения runtime/user.

Hard safety rules:
- Не меняй UX, labels, copy, order кнопок или визуальную структуру modal.
- Не меняй API shape.
- Не меняй units.
- Не меняй formulas, coefficients, expected/golden values.
- Не ослабляй assertions ради green tests.
- Не удаляй код без evidence, что он больше не используется.
- Не трогай unrelated dirty files.
- Перед правками выполни `git status --short`.
- Если релевантные файлы уже dirty, прочитай diff и работай поверх него, не
  откатывая чужие изменения.
- Если required test/browser/DB evidence in scope недоступен, финальный статус
  `blocked` или `needs verification`, не `pass`.

Change budget:
- Можно добавить максимум 1 production file:
  `frontend/src/pages/heatcalc/useHeatCalcPreferences.ts`.
- Можно добавить максимум 1 focused hook test file:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcPreferences.test.tsx`.
- Можно править максимум 2 existing test files. Предпочтительно:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx`
  и, только если нужно для inline-disable coverage,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`.
- Можно править `frontend/src/pages/HeatCalcPage.tsx`.
- Можно править docs ledger:
  `docs/playbooks/heatcalc-page-decomposition-prompts.md`
  и runner prompt:
  `docs/playbooks/god-components-safe-split-nightly-prompt.md`.
- Не менять backend, migrations, API client shape, CSS, e2e, package metadata.
- Если нужно больше файлов, остановись и оформи recommended next safe slice.

Обязательный старт:
Прочитай:
- `codex-docs/README.md`
- `codex-docs/project-map.md`
- `codex-docs/requirements-map.md`
- `codex-docs/testing.md`
- `codex-docs/business-formula-contracts.json` summary
- `.agents/routing.yaml`
- `.agents/roles/frontend-ui-proof.md`
- `docs/playbooks/agent-proof-modes.md`
- `docs/playbooks/heatcalc-page-decomposition-prompts.md`
- `docs/playbooks/god-components-safe-split-nightly-prompt.md`
- `docs/api.md`
- `docs/analysis/business-rules.md`
- `docs/srs.md`
- `docs/tz-compliance.md`
- `docs/srs/ui/employee/03-screen-workspace-heatcalc.md`
- `docs/srs/ui/guest/02-screen-workspace-heatcalc.md`
- `docs/qa/README.md`
- `docs/qa/automation-coverage.md`
- `docs/qa/checklist.md`
- `docs/qa/test-cases-objects.md`

Формульные docs (`formules.md`, `coefficients.MD`,
`docs/context/formulas-summary.md`, `docs/playbooks/formula-validation-agent.md`)
только проверить как out-of-scope guardrail: этот slice не должен менять
calculation mapping, payload units, result diagnostics или coefficients. Если
обнаружишь, что выбранный refactor всё же затрагивает эти зоны, остановись и
переключись на tests-only/finding.

Discovery через `rg`:
- current preferences imports in `HeatCalcPage`;
- local state for:
  - `tableColumnSettings`
  - `tableViewSettings`
  - `calculationDetailsSettings`
  - `fieldInputSettings`
  - `columnSettingsOpen`
  - `columnSettingsType`
  - draft settings
  - `pendingInlineDisableSettings`
- refs:
  - `tableColumnSettingsRef`
  - `tableViewSettingsRef`
  - `sideResizeStateRef`
- queries/mutations:
  - `getUserPreference`
  - `updateUserPreference`
  - `HEATCALC_*_PREF_KEY`
- guest storage functions;
- registered cache functions;
- current tests in:
  - `HeatCalcPage.settings.test.tsx`
  - `HeatCalcPage.inline-edit.test.tsx`
  - `frontend/src/__tests__/unit/utils/heatCalcTableColumns.test.ts`
  - `frontend/src/__tests__/unit/utils/heatCalcTableViewSettings.test.ts`
  - `frontend/src/__tests__/unit/utils/heatCalcCalculationDetailsSettings.test.ts`
  - `frontend/src/__tests__/unit/utils/heatCalcFieldInputSettings.test.ts`
- existing hook test style in `frontend/src/__tests__/unit/pages/heatcalc/`.

Before edits checkpoint:
Составь короткую карту:

`Документация -> backend/API preferences -> frontend implementation -> tests`

Обязательно отметь:
- гостевые настройки хранятся только в localStorage;
- registered settings идут через `GET/PUT /preferences/{key}`;
- visible behavior должно остаться без изменений;
- UI screenshots не требуются, если JSX/CSS/visible UI не менялись;
- DB invariants/Playwright не обязательны, если нет real browser/persisted
  backend flow и API client shape не менялся.

Phase 1: Safety Map
Составь таблицу текущих boundaries:
- какие preferences можно вынести в hook v1;
- какие state/callbacks нельзя двигать в этом запуске;
- какие tests уже покрывают behavior;
- какие coverage gaps нужно закрыть перед extraction.

Ожидаемая граница `useHeatCalcPreferences` v1:
- owns:
  - persisted `tableColumnSettings`
  - persisted `tableViewSettings`
  - persisted `calculationDetailsSettings`
  - persisted `fieldInputSettings`
  - `tableColumnSettingsRef`
  - `tableViewSettingsRef`
  - preference queries/mutations
  - hydration effects for guest/registered settings
  - persisted-write callbacks:
    - `persistTableColumnSettings`
    - `persistTableSettings`
    - `persistTableViewOnly`
  - immediate view updaters:
    - `applySideFormWidthPct`
    - `applyFormSectionWeights`
    - `commitFormSectionWeights`
- does not own in v1:
  - `columnSettingsOpen`
  - `columnSettingsType`
  - draft modal settings
  - `pendingInlineDisableSettings`
  - `ColumnSettingsModal` JSX
  - side resize pointer event wiring
  - column resize pointer event wiring
  - inline edit draft rows
  - wizard state
  - React Query object list/query pagination

Allowed hook dependencies:
- `isRegisteredUser`
- `registeredUserId`
- optional callbacks for page-specific side effects, for example:
  - `onInlineEditingDisabled`
  - `onCloseSettingsModal`
  - `messageApi`/`antdMessage`

Stop extraction if hook needs a giant loosely-related parameter bag or starts
owning modal draft UI.

Phase 2: Characterization Tests First
Перед extraction добавь или подтверди focused tests. Минимум:

P0 existing coverage that must remain green:
- guest column visibility saves to localStorage and applies only active type;
- guest column order and width save to localStorage;
- HeatCalc font size selector stays removed; saved font size values normalize to `compact`;
- guest table/settings label format saves and reloads into modal labels;
- guest form placement saves and applies layout class;
- registered user saves preferences through API and caches DB response;
- registered user null preference clears registered column/view cache and uses defaults.

P0 gaps to add if missing:
- disabling inline editing with dirty draft opens confirmation modal and:
  - `Cancel` keeps current settings and dirty draft;
  - `Discard` discards draft rows, persists pending settings, closes modal;
  - `Save` saves dirty rows, persists pending settings only after successful save.
- registered user null preference clears registered calculation-details cache and
  field-input cache, not just column/view cache.
- guest resetting details/field/view settings to default removes the respective
  localStorage key instead of writing redundant default JSON, if that behavior is
  currently expected by utilities.

Do not add broad Playwright tests in this slice unless JSX/CSS changes.

Baseline commands before production refactor:
- `npm --prefix frontend run test -- --run src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`
- `npm --prefix frontend run typecheck`

If baseline fails before edits, stop and report baseline blocker unless failure
is directly caused by your new characterization test before implementation.

Phase 3: Minimal Refactor
Only if Phase 2 is green or the new characterization test fails for the exact
risk you are fixing, implement one minimal extraction.

Create:
- `frontend/src/pages/heatcalc/useHeatCalcPreferences.ts`

Implementation rules:
- Keep imports local to HeatCalc route namespace where possible.
- Preserve current normalization order.
- Preserve cache clear/write behavior exactly.
- Preserve `tableViewSettingsRef.current` update timing.
- Preserve guest localStorage behavior exactly.
- Preserve registered user behavior exactly:
  - hydrate from registered cache/default on role/user changes;
  - apply server preference value when present;
  - clear matching cache and use defaults when server value is null;
  - update cache only from DB response on successful mutation.
- Preserve `antdMessage.success/error` behavior.
- Preserve `inlineEditingEnabled=false` side effect by calling page callback to
  clear active inline cell.
- Keep modal open/draft state in `HeatCalcPage` for this slice.
- Keep pointer-event resize functions in `HeatCalcPage` for this slice, but they
  may call hook-provided `applySideFormWidthPct`, `commitFormSectionWeights`,
  `persistTableViewOnly`.
- Do not move `ColumnSettingsModal`.

Add:
- `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcPreferences.test.tsx`
  only if direct hook tests can prove behavior without fragile page UI setup.
- Otherwise strengthen page tests instead of forcing a hook test.

After refactor update:
- `docs/playbooks/heatcalc-page-decomposition-prompts.md`
  - mark `Preferences hook` as `Done` only if the hook extraction happened and
    focused tests passed.
  - if tests-only, keep `Preferences hook` as `Next` and add evidence for
    characterization progress.
- `docs/playbooks/god-components-safe-split-nightly-prompt.md`
  - next preferred slice should move to `Toolbar extraction` only if
    `useHeatCalcPreferences` is actually done.
  - otherwise keep preferences as next with narrower guidance.

Verification after changes:
- `npm --prefix frontend run typecheck`
- focused tests:
  - `npm --prefix frontend run test -- --run src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`
  - plus any new hook test file
- HeatCalc focused suite if production extraction happened:
  - `npm --prefix frontend run test -- --run src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx src/__tests__/unit/pages/HeatCalcPage.filters.test.tsx src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx src/__tests__/unit/pages/heatcalc/useHeatCalcTableState.test.tsx`
- `git diff --check`
- `scripts/codex-functional-audit.sh docs`
- `scripts/codex-functional-audit.sh contracts` only if API/UI mapping or docs
  contract might have changed.
- `scripts/test.sh frontend` if extraction happened and focused suites pass.

Metrics to report:
- `wc -l frontend/src/pages/HeatCalcPage.tsx`
- `rg -c "useState" frontend/src/pages/HeatCalcPage.tsx`
- `rg -c "useEffect|useMemo|useCallback|useState" frontend/src/pages/HeatCalcPage.tsx`
- lines in new hook/test, if created.

Stop Conditions:
- No reliable test harness for dirty inline-disable/settings behavior.
- Extraction requires moving modal draft state and pending inline-disable in the
  same slice.
- Hook API becomes a giant prop/result bag with unclear ownership.
- Any settings behavior changes without explicit test evidence.
- Any in-scope focused suite fails after attempted fix.

Final report format:

```text
Functional Accuracy Report
Scope: HeatCalcPage preferences safe split
Mode: /fix-focused
Docs checked: ...
Implementation found:
- Backend/API preferences: ...
- Frontend: ...
- Tests: ...
Safety map:
- extracted:
- left in page:
- blocked/deferred:
Changes:
- ...
Metrics:
- HeatCalcPage lines:
- HeatCalcPage useState:
- Hook/effects total:
Verification:
- Command: ...
- Result: pass/fail/not run
Findings:
- ...
Residual risk:
- ...
Commit: not created
```
