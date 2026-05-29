# HeatCalcPage Object Editor Safe Split Runner Prompt

This prompt is for an autonomous Codex run from the repository root. It targets
only the HeatCalc object editor orchestration in `HeatCalcPage`, not formulas,
not table rendering, and not the full `ObjectWizard` component.

## How To Run

```bash
codex --ask-for-approval never exec -C /Users/dmalafey/Desktop/TLT --sandbox workspace-write - < docs/playbooks/heatcalc-object-editor-safe-split-runner-prompt.md
```

## Prompt

Work in `/fix-focused` mode, conservatively.

Primary target:
- `frontend/src/pages/HeatCalcPage.tsx`
- object create/edit wizard orchestration only.

Goal:
1. Audit the current object editor flow from docs -> backend/API -> frontend -> tests.
2. Add or strengthen characterization tests for the existing object editor
   behavior before refactoring.
3. If tests prove the behavior, extract one narrow hook:
   `frontend/src/pages/heatcalc/useHeatCalcObjectEditor.ts`.
4. Keep visible UI and API payload behavior unchanged.
5. Update decomposition ledger only after a successful slice.
6. Produce a Functional Accuracy Report.

Do not:
- Do not edit `ElecCalcPage`.
- Do not refactor `ObjectWizard.tsx` internals in this run.
- Do not implement row drag-and-drop/reorder.
- Do not extract toolbar/table components.
- Do not touch formulas, coefficients, golden numbers, expected calculation
  values, or backend code unless you find a blocking backend contract mismatch.
- Do not change API payload shape or units.
- Do not change labels, button names, modal text, or UX copy unless a failing
  test proves current text is wrong.
- Do not create shared abstractions between heat and electrical pages.
- Do not make a git commit.

Agent routing:
- Read `AGENTS.md`.
- Read `.agents/routing.yaml`.
- Primary role: `frontend_ui_proof`.
- Supporting mental roles: `functional_accuracy`, `qa_regression`,
  `backend_business`.
- `/fix-focused` intentionally overrides `frontend_ui_proof.default_mode`
  because this is a bounded non-visual refactor. If you touch visible JSX/CSS,
  `/ui-proof` evidence becomes mandatory.
- If delegation is unavailable, apply these roles locally.

Hard safety rules:
- Start with `git status --short`.
- If relevant files are dirty, inspect the diff and work with it; do not revert
  user changes.
- Add/strengthen tests before extraction.
- Never weaken assertions for green tests.
- Stop with a finding if extraction creates a giant prop chain or broader
  coupling than the current page code.
- Stop with `needs verification` if an in-scope test or verifier cannot run.
- Keep the slice small enough to review in one pass.

Change budget:
- Max 1 new production file:
  `frontend/src/pages/heatcalc/useHeatCalcObjectEditor.ts`
- Max 1 page file edited:
  `frontend/src/pages/HeatCalcPage.tsx`
- Max 2 existing test files edited, preferred:
  - `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx`
  - `frontend/src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx`
- You may update docs/playbooks ledger files after a successful slice.
- You may run `scripts/sync-docs.py` only if the docs drift gate requires it
  because test counts changed.
- If more production files are needed, stop and report the next safe plan.

Required reading:
- `AGENTS.md`
- `.agents/routing.yaml`
- `.agents/roles/frontend-ui-proof.md`
- `codex-docs/README.md`
- `codex-docs/project-map.md`
- `codex-docs/requirements-map.md`
- `codex-docs/testing.md`
- `docs/api.md`, section "Объекты проекта"
- `docs/analysis/business-rules.md`, especially BR-UI-01/02/03
- `docs/srs.md`
- `docs/tz-compliance.md`
- `docs/srs/ui/employee/03-screen-workspace-heatcalc.md`
- `docs/srs/ui/guest/02-screen-workspace-heatcalc.md`
- `docs/qa/test-cases-objects.md`
- `docs/playbooks/heatcalc-page-decomposition-prompts.md`
- `docs/playbooks/god-components-safe-split-nightly-prompt.md`

Formula docs are conditional. Read these only if you touch calculation mapping,
units, formula traceability, result diagnostics, or golden values:
- `codex-docs/business-formula-contracts.json`
- `formules.md`
- `coefficients.MD`
- `docs/context/formulas-summary.md`
- `docs/playbooks/formula-validation-agent.md`

Discovery:
Use `rg`/file reads to map:
- `WizardState`, `wizardState`, `newWizardRevision`, `lastSavedObject`.
- `formBlockVisible`, `openAddWizard`, `resetNewWizard`, `clearWizard`,
  `closeWizard`, `openNewObjectMode`.
- `openEditWizard`, `pendingWizardObject`, pending wizard modal handlers.
- `handleWizardSubmit`, create/edit payloads, `sort_order`, optimistic object.
- `handleObjectAdded`, `handleObjectEdited`, `syncWizardWithRecord`.
- `useHeatCalcMutations`, `createObject`, `updateObject`, `deleteObject`.
- Excel local row path: `isExcelNewRowId`, `excelLocalRows`, `draftRowsById`.
- Current unit tests covering add/edit/copy/delete/save/reset.

Documentation -> code contract to preserve:
- SRS: the object form is an inline flat form, not a modal.
- SRS: clicking a table row fills the form; "+ Добавить" clears it for a new
  object.
- API docs: `PUT /projects/{id}/objects/{object_id}` requires current
  `version` and triggers heat-loss recalculation.
- QA TC-OBJ-01/02/02A/03/11: create, update, optimistic lock, invalid object,
  delete contracts.
- Business rules: object parameter changes apply only after explicit save; no
  autosave on blur/change.

Phase 1: Baseline Evidence
Before editing, run or inspect:
- `git status --short`
- `npm --prefix frontend run typecheck`
- focused existing tests for HeatCalc object actions/save reset, for example:
  `npm --prefix frontend run test -- --run src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx`

If baseline fails, stop and report the failure unless the failure is clearly
caused by the exact behavior this prompt is supposed to characterize.

Phase 2: Characterization Tests First
Add or strengthen focused tests. Prefer page-level tests over isolated hook
tests because the contract is user workflow + API payload.

P0 tests. Implement at least two, more only if the existing harness makes it
cheap:
1. Editing an existing object submits `updateObject(projectId, objectId,
   { version, params })` with the selected object's current `version`.
2. A successful edit keeps the form in edit mode for the returned object and
   updates the visible object name/params.
3. Creating a new object submits `createObject(projectId, { object_type,
   params, sort_order })`, using the active wizard type and current object
   count for `sort_order`.
4. A create response with `is_valid=false` leaves the returned object open in
   edit mode so validation errors can be corrected.
5. Opening another object while the current normal-mode inline draft is dirty
   opens the "Открыть форму объекта?" guard instead of replacing the form.
   `Cancel` must keep the draft/form state; `Discard` may clear the draft and
   open the target; `Save` may open the saved target only after save succeeds.
6. Editing an Excel local new row through the wizard calls `createObject`,
   removes the local row/draft after success, and opens the created real object.

P1 tests only if nearby and cheap:
- Scope change `pipe/tank/all` preserves the existing behavior of showing or
  clearing the inline form.
- Hiding/showing the form block preserves current add/edit state behavior.

Do not add browser screenshots if you do not change visible JSX/CSS. If you do
change visible JSX/CSS, stop and apply `/ui-proof` requirements with before and
after evidence.

Phase 3: Narrow Hook Extraction
Only after P0 tests pass, extract a narrow hook:

`frontend/src/pages/heatcalc/useHeatCalcObjectEditor.ts`

The hook may own:
- `WizardState` type.
- `wizardState`.
- `newWizardRevision`.
- `lastSavedObject`.
- create/edit/remove mutations via existing `useHeatCalcMutations`, if that
  avoids callback cycles.
- `resetNewWizard`, `clearWizard`, `closeWizard`, `openNewObjectMode`,
  `openAddWizard`, `openEditWizard`, `handleWizardSubmit`,
  `handleObjectAdded`, `handleObjectEdited`, `syncWizardWithRecord`.
- object-editor derived values:
  `selectedRowId`, `selectedObject`, `formCaptionMode`,
  `formCaptionModeLabel`, `hasWizard`, `submittingObject`.

Keep outside the hook unless moving them is clearly smaller:
- `formBlockVisible` state itself, because it is also a layout preference in
  the page.
- table state/scope hook internals.
- inline draft save/discard implementations.
- JSX for the pending wizard modal.
- object result rendering and calculation details.
- import/export, duplicate, delete-selected loops, batch recalculation.

Acceptable hook inputs should be explicit and typed. Stop if the hook needs a
loosely typed bag of dozens of unrelated values. A reasonable dependency set is:
- `projectId`
- `activeObjectScope`
- `activeTableObjectType`
- `formBlockVisible`
- `excelModeEnabled`
- `projectObjectCount`
- `draftRowsById`
- `setDraftRowsById`
- `setExcelLocalRows`

Add only narrowly needed callbacks if the page still owns related behavior.

The hook must preserve:
- `ObjectWizard` key behavior with `newWizardRevision`.
- `createObject` payload shape and `sort_order`.
- `updateObject` payload shape and object `version`.
- invalid object after create/update remains editable.
- successful add/edit still updates `lastSavedObject`.
- Excel local new row save cleanup.
- dirty normal inline draft guard for `openEditWizard`.

Phase 4: Ledger Update
After a successful extraction:
- Update `docs/playbooks/heatcalc-page-decomposition-prompts.md`.
- Add a ledger row such as:
  `Object editor hook | Done | frontend/src/pages/heatcalc/useHeatCalcObjectEditor.ts; characterization in ...`
- Do not change the existing `Toolbar extraction | Next` row unless you add a
  note that object-editor was an explicit user-requested side slice and toolbar
  remains the next ledger slice for the generic god-component runner.
- Update `docs/playbooks/god-components-safe-split-nightly-prompt.md` only if
  needed to prevent future agents from redoing this object-editor slice.

Verification after changes:
- `npm --prefix frontend run typecheck`
- focused HeatCalc object tests:
  `npm --prefix frontend run test -- --run src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx`
- broader focused HeatCalc page suite if time permits:
  `npm --prefix frontend run test -- --run src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx src/__tests__/unit/pages/HeatCalcPage.filters.test.tsx src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx src/__tests__/unit/pages/heatcalc/useHeatCalcTableState.test.tsx`
- `git diff --check`
- `scripts/codex-functional-audit.sh docs`
- `scripts/test.sh frontend` if time permits after focused tests are green.

Run formula QA only if you touched formula/unit/payload conversion logic. A
plain hook extraction should not need formula QA.

Stop Conditions:
- Baseline focused tests fail for unrelated reasons.
- Characterization cannot prove payload/version/create/edit behavior.
- Extraction requires moving `ObjectWizard.tsx` internals.
- Extraction requires changing visible JSX/CSS without UI proof.
- Hook API becomes a giant unrelated prop bag.
- API payload units or object version semantics become unclear.
- Expected/golden values would need changing.

Final response format:

```text
Functional Accuracy Report
Scope: HeatCalcPage object editor safe split
Docs checked: ...
Implementation found:
- Backend/API: ...
- Frontend: ...
- Tests: ...
Changes:
- ...
Metrics:
- HeatCalcPage lines/useState before -> after, if measured
- New hook lines, if created
Verification:
- Command: ...
- Result: pass/fail/not run
Findings:
- ...
Residual risk: ...
Commit: not created
```
