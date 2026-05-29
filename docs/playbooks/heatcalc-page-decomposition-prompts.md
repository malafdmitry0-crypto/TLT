# HeatCalcPage decomposition prompts

## Цель

`frontend/src/pages/HeatCalcPage.tsx` разросся до большого route-component. Его нужно резать итеративно, маленькими проверяемыми шагами: сначала вынести чистые функции, потом UI-части и хуки.

## Prompt 1. Аудит декомпозиции без кода

Проанализируй `frontend/src/pages/HeatCalcPage.tsx` и составь план декомпозиции без изменения кода.

Требования:

- Найди логические блоки внутри файла.
- Раздели блоки на безопасные для первого выноса и рискованные.
- Отдельно перечисли состояние и эффекты, которые нельзя двигать без тестов.
- Предложи целевую структуру файлов.
- Не пиши код.

## Prompt 1. Результат аудита

Текущий файл содержит несколько разных ответственностей:

- route-level контейнер: загрузка проекта, справочников, настроек, batch-задач;
- чистые функции статуса, фильтров, форматирования и значений таблицы;
- DOM-хелперы прокрутки строки;
- JSX-компоненты фильтра колонки, иконок типа объекта и resize-заголовка;
- состояние таблицы: страницы, фильтры, сортировки, видимость/ширина колонок, выделение строк;
- inline-edit черновики и сохранение ячеек;
- wizard/форма создания и редактирования объекта;
- панель расшифровки расчёта;
- построение render/copy спецификаций колонок;
- import/export и массовые операции расчёта.

Безопасный первый вынос:

- pure helpers для статусов теплопотерь;
- pure helpers для построения backend query;
- pure helpers форматирования параметров/results;
- pure helpers применимости колонок к типу объекта.

Не выносить в первом шаге:

- `ColumnFilterDropdown`, потому что это JSX + local state;
- `ResizableColumnTitle`, потому что JSX + pointer events;
- `scrollTableRowIntoView`, потому что DOM;
- `columnRenderers`, потому что завязан на справочники, JSX и локальные функции;
- React Query/mutations/polling;
- состояние wizard и inline-edit.

Состояние, которое нельзя двигать без отдельного тестового прохода:

- `activeObjectScope`;
- `tableViewStateByType`;
- `allTableViewState`;
- `selectedRowKeys`;
- `draftRows`;
- `pendingInlineDisableSettings`;
- settings/cache state для колонок, вида таблицы, деталей расчёта и шагов полей;
- batch task state;
- wizard state;
- table pagination state.

Целевая структура после нескольких итераций:

- `frontend/src/pages/heatcalc/heatCalcPageUtils.ts` — чистые функции и константы.
- `frontend/src/pages/heatcalc/HeatCalcColumnFilterDropdown.tsx` — выпадающий фильтр колонки.
- `frontend/src/pages/heatcalc/HeatCalcResizableColumnTitle.tsx` — заголовок с resize.
- `frontend/src/pages/heatcalc/heatCalcColumnRenderers.tsx` — спецификации render/copy колонок.
- `frontend/src/pages/heatcalc/useHeatCalcTableState.ts` — scope, фильтры, сортировки, пагинация.
- `frontend/src/pages/heatcalc/useHeatCalcPreferences.ts` — настройки таблицы/вида/деталей.
- `frontend/src/pages/heatcalc/HeatCalcToolbar.tsx` — верхние действия.
- `frontend/src/pages/heatcalc/HeatCalcObjectsTable.tsx` — сама таблица.

## Progress Ledger

Обновляй этот ledger после каждого успешного refactor slice. Ночной runner
`docs/playbooks/god-components-safe-split-nightly-prompt.md` должен выбирать
следующий шаг отсюда и не повторять уже выполненные пункты.

| Шаг | Статус | Evidence |
|---|---|---|
| Audit decomposition map | Done | Этот документ, раздел `Prompt 1. Результат аудита` |
| Pure helpers/constants extraction | Done | `frontend/src/pages/heatcalc/heatCalcPageUtils.ts`; `frontend/src/__tests__/unit/pages/heatcalc/heatCalcPageUtils.test.ts` |
| Column filter dropdown extraction | Done | `frontend/src/pages/heatcalc/HeatCalcColumnFilterDropdown.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcColumnFilterDropdown.test.tsx` |
| Render/copy column specifications extraction | Done | `frontend/src/pages/heatcalc/heatCalcColumnRenderers.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/heatCalcColumnRenderers.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx` |
| Remaining small pure helpers | Done | `draftRowFingerprint`, `uniqueErrorMessages`, `normalizeGlideCellAlign`, `draftErrorMessages`, `escapeTableRowKey` moved to `frontend/src/pages/heatcalc/heatCalcPageUtils.ts`; covered by `frontend/src/__tests__/unit/pages/heatcalc/heatCalcPageUtils.test.ts`; page wiring in `frontend/src/pages/HeatCalcPage.tsx` |
| Table state hook | Done | `frontend/src/pages/heatcalc/useHeatCalcTableState.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcTableState.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; focused HeatCalc suites passed |
| Preferences hook | Done | `frontend/src/pages/heatcalc/useHeatCalcPreferences.ts`; characterization in `HeatCalcPage.settings.test.tsx` and `HeatCalcPage.inline-edit.test.tsx`; focused settings/inline suites and typecheck passed |
| Column settings dialog hook | Done | `frontend/src/pages/heatcalc/useHeatCalcColumnSettingsDialog.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcColumnSettingsDialog.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved settings draft/apply/pending-inline-disable state out of route component; typecheck and focused settings/inline suites passed |
| Object editor hook | Done | `frontend/src/pages/heatcalc/useHeatCalcObjectEditor.ts`; characterization in `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx` and `frontend/src/__tests__/unit/pages/HeatCalcPageSaveReset.test.tsx`; explicit user-requested side slice |
| Toolbar side-placement characterization | Done | `frontend/src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx` covers side placement, DOM order and single toolbar ownership; code extraction not attempted because full UI proof/layout stack was not in scope for this tests-only slice |
| Toolbar extraction | Implemented; needs heat e2e rerun | `frontend/src/pages/heatcalc/HeatCalcToolbar.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; focused HeatCalc toolbar/action tests, typecheck, `git diff --check`, toolbar Playwright verifier and `scripts/codex-functional-audit.sh layout` passed; focused `heat-calculation.spec.ts` rerun blocked at browser launch with `SIGTRAP` before app assertions |
| Inline draft model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcInlineDraftModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcInlineDraftModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved draft/local Excel row state, trailing Excel input rows, inline commit and wizard draft handlers out of route component; typecheck and focused settings/inline suites passed |
| Grid model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcGridModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcGridModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved grid column/cell/error view model out of route component; typecheck and focused HeatCalc suites passed |
| Bulk actions model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcBulkActions.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcBulkActions.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved duplicate/remove selected row orchestration and delete counters out of route component; typecheck and focused HeatCalc suites passed |
| Heat-loss job/recalc model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcHeatLossJob.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcHeatLossJob.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved job polling, batch/cancel mutations, completion handling, recalc ids/tooltips/disabled state out of route component; typecheck and focused HeatCalc suites passed |
| Assumptions panel component | Done | `frontend/src/pages/heatcalc/HeatCalcAssumptionsPanel.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcAssumptionsPanel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved calculation detail rendering out of route component without formula/API/layout changes; typecheck and focused settings suite passed |
| Selected row errors overlay component | Done | `frontend/src/pages/heatcalc/HeatCalcSelectedRowErrorsOverlay.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcSelectedRowErrorsOverlay.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved selected row validation overlay JSX without state/effect/API/layout changes; typecheck and focused inline-edit suite passed |
| Resize model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcResizeModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcResizeModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved side form and column resize drag handlers out of route component without CSS/layout/API/formula changes; typecheck, focused hook test and settings suite passed |
| Draft save model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcDraftSaveModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcDraftSaveModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved draft save target derivation, validation, create/update, cache writes and invalidation out of route component without backend/API/formula/layout changes; typecheck, focused hook test and inline-edit characterization passed |
| Unsaved-change modals component | Done | `frontend/src/pages/heatcalc/HeatCalcUnsavedChangesModals.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcUnsavedChangesModals.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved inline-disable and pending-wizard unsaved-change Modal JSX without backend/API/formula/CSS/layout changes; typecheck, focused modal test and inline-edit characterization passed |
| Excel interaction model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcExcelInteractionModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcExcelInteractionModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved Excel cell/selection/context-menu state, selection/clipboard/keyboard wiring, add-row and reset-selected-row interactions out of route component without backend/API/formula/CSS/layout changes; typecheck, focused hook test and inline-edit characterization passed |
| Normal table interaction model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcNormalTableInteractionModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcNormalTableInteractionModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved normal row class, pagination/infinite loading, normal load/page callbacks and non-Excel selected rows copy hotkey out of route component without backend/API/formula/CSS/layout changes; typecheck, focused hook test and inline-edit characterization passed |
| Wizard/form shell model and panel | Done | `frontend/src/pages/heatcalc/useHeatCalcWizardFormShellModel.ts`; `frontend/src/pages/heatcalc/HeatCalcWizardFormPanel.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcWizardFormShellModel.test.tsx`; `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcWizardFormPanel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved wizard base/display/draft-error derivation and form panel JSX out of route component without backend/API/formula/CSS/layout changes; typecheck, focused tests and HeatCalc basics/actions/inline-edit characterization passed |
| Objects data/query model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcObjectsDataModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved object summary/query capabilities/object queries/all objects/column accessors/all-scope filtering/enum options and visible rows resolver out of route component without backend/API/formula/CSS/layout changes; typecheck, focused tests and HeatCalc basics/actions/inline-edit characterization passed |
| Page effects model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcPageEffectsModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcPageEffectsModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved hidden-column cleanup, selected-row pruning, pending table focus, dirty-draft beforeunload guard, last-saved hidden-by-filter notice, Excel selection cleanup and Excel/all-scope guard without backend/API/formula/CSS/layout/render shell changes; typecheck, focused hook test and HeatCalc basics/actions/inline-edit characterization passed |
| Route actions/counts model hook | Done | `frontend/src/pages/heatcalc/useHeatCalcRouteActionsModel.ts`; `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcRouteActionsModel.test.tsx`; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved object scope/form visibility/table editing mode/toolbar save handlers and scope count labels without backend/API/formula/CSS/layout/render shell changes; typecheck, focused hook test and HeatCalc basics/actions/inline-edit characterization passed |
| Tiny route shell cleanup | Done | `frontend/src/pages/heatcalc/HeatCalcObjectTypeIcons.tsx`; `frontend/src/pages/heatcalc/HeatCalcEmptyProjectState.tsx`; `frontend/src/pages/heatcalc/useHeatCalcRouteShellEffects.ts`; focused empty-state/effects tests; page wiring in `frontend/src/pages/HeatCalcPage.tsx`; moved only icons, no-project empty state, workspace header reset and wizard preload without backend/API/formula/CSS/layout/render shell/table changes; typecheck, focused tests and HeatCalc basics characterization passed |
| Objects table route wrapper extraction | Backlog | `HeatCalcObjectsTable`; high risk, do after renderers/state hooks stabilize |

## Prompt 2. Вынести только pure helpers

Status: Done. Не запускать повторно без нового finding.
Historical prompt below is kept as implementation history, not as the next
runner instruction.

Выполни первый безопасный шаг декомпозиции `frontend/src/pages/HeatCalcPage.tsx`.

Требования:

- Создай `frontend/src/pages/heatcalc/heatCalcPageUtils.ts`.
- Перенеси туда только чистые функции и константы без JSX, React state/effects и DOM.
- Не выноси `ColumnFilterDropdown`, `ResizableColumnTitle`, `PipeTypeIcon`, `TankTypeIcon`, `scrollTableRowIntoView`.
- Сохрани публичное поведение страницы.
- Обнови импорты в `HeatCalcPage.tsx`.
- Добавь unit-тесты на вынесенные функции.
- Запусти typecheck и релевантные frontend-тесты.

## Prompt 3. Вынести UI фильтра колонки

Status: Done. Не запускать повторно без нового finding.
Historical prompt below is kept as implementation history, not as the next
runner instruction.

Вынеси `ColumnFilterDropdown` в отдельный `.tsx` файл.

Требования:

- Не менять UX фильтра.
- Сохранить обработку Enter, include empty, enum/text/range modes.
- Добавить/обновить unit-тест или интеграционный тест страницы.

## Prompt 4. Вынести render/copy спецификации колонок

Status: Done. Не запускать повторно без нового finding.
Historical prompt below is kept as implementation history, not as the next
runner instruction.

Вынеси построение `columnRenderers` в отдельный модуль.

Требования:

- Передавать зависимости явно: справочники, labels, callbacks, активный scope.
- Не тащить внутрь модуля React Query и состояние страницы.
- Проверить copy/export значения для основных колонок.

## Prompt 5. Вынести state hooks

Status: `useHeatCalcTableState` Done; `useHeatCalcPreferences` Done; `useHeatCalcColumnSettingsDialog` Done; `useHeatCalcInlineDraftModel` Done; `HeatCalcToolbar` implemented and awaiting focused heat e2e rerun.
Не начинать toolbar или objects table extraction в том же запуске.

После стабилизации helpers/UI вынеси состояние таблицы в hooks.

Требования:

- Отдельно `useHeatCalcTableState`.
- Отдельно `useHeatCalcPreferences`.
- Сначала покрыть сценарии переключения `pipe/tank/all`, фильтров и сброса фильтров.

## Prompt 6. Вынести grid view model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только модель отображения
таблицы/Glide:

- `excelFieldInfoById`;
- `excelTableErrors`;
- `selectedRowErrorMessages`;
- `excelCellDisplayValue`;
- `glideGridColumns`;
- `getGlideGridCellState`;
- `getNormalGlideGridCellState`.

Жёсткие границы:

- Не трогать `saveDraftRows`, React Query cache updates, API calls и mutations.
- Не переносить `useHeatCalcExcelSelection`, `useHeatCalcExcelKeyboard`,
  `useHeatCalcExcelClipboard`.
- Не менять JSX/layout, toolbar, modal тексты и CSS.
- Не менять формулы, единицы измерения, object payload mapping или expected
  business values.
- Если нужен новый файл, использовать namespace `frontend/src/pages/heatcalc/`.

Definition of Done:

- Новый hook/model с явными inputs и focused tests.
- `HeatCalcPage.tsx` только подключает hook и передаёт результат дальше.
- Existing inline/settings/actions suites остаются зелёными.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 7. Вынести bulk actions model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только модель групповых действий
над строками:

- вычисление `tableDeleteRows`, `selectedObjectCount`, `deleteTargetCount`;
- `duplicateSelectedObjects`;
- `removeSelectedObjects`;
- минимальные helper-вычисления, которые нужны только этим действиям.

Жёсткие границы:

- Не трогать `saveDraftRows`, `updateSavedExcelObjectsInCaches`,
  `updateObjectInCurrentQuery`, React Query cache writes и object create/update
  payload mapping для сохранения draft.
- Не переносить Excel selection/keyboard/clipboard hooks.
- Не менять JSX/layout, CSS, toolbar labels, modal тексты.
- Не менять API contracts, формулы, единицы измерения, expected business
  values.
- Новый файл держать в `frontend/src/pages/heatcalc/`.

Functional trace:

- SRS: `docs/srs/ui/guest/02-screen-workspace-heatcalc.md` UC-G-10,
  UC-G-22, UC-G-23.
- QA: `docs/qa/test-cases-objects.md` TC-OBJ-11 для удаления.
- Frontend characterization: `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs и focused tests на duplicate/remove model.
- `HeatCalcPage.tsx` только подключает hook и передаёт callbacks/counts дальше.
- Existing `HeatCalcPage.actions.test.tsx`, inline/settings suites остаются
  зелёными.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 8. Вынести heat-loss job/recalc model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только frontend-модель фонового
пересчёта теплопотерь:

- `activeHeatLossJobId`;
- polling query `getCalcTask`;
- batch/cancel mutations для heat-loss job;
- обработку `succeeded`/`failed`/`cancelled`;
- derived state для toolbar: progress label, disabled flags, scoped/all
  tooltips, aria label, selected/active object ids.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не трогать `saveDraftRows`, object create/update/delete payloads, React Query
  cache writes не связанные с завершением heat-loss job.
- Не переносить Excel selection/keyboard/clipboard hooks.
- Не менять JSX/layout, CSS и toolbar labels кроме переноса существующих строк
  без изменения текста.

Functional trace:

- API: `docs/api.md` — `/calc/heat-loss/batch/jobs` принимает
  `{ project_id, include_errors, object_ids? }`.
- QA: `docs/qa/test-cases-objects.md` TC-OBJ-09 и TC-OBJ-09A.
- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs и focused tests.
- `HeatCalcPage.tsx` только подключает hook и передаёт результат в toolbar.
- Existing `HeatCalcPage.actions.test.tsx`, inline/settings suites остаются
  зелёными.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 9. Вынести assumptions panel

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только отображение расшифровки
расчёта:

- `selectedResults`;
- `selectedParams`;
- `resultValue`;
- `paramValue`;
- `renderAssumptionsPanel`;
- минимальные display helpers, нужные только этому panel.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения и expected
  business values.
- Не трогать `saveDraftRows`, object payload mapping, Excel
  selection/keyboard/clipboard hooks.
- Не менять table layout, CSS, toolbar/actions, column settings и resize.
- Сохранить className `calc-assumptions-panel` и существующие labels/units.

Functional trace:

- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx`.

Definition of Done:

- Новый component/model с явными props и focused tests.
- `HeatCalcPage.tsx` только рендерит component с `selectedObject` и
  `calculationDetailsSettings`.
- Existing settings characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 10. Вынести selected row errors overlay

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только JSX выбранной строки с
ошибками:

- `renderSelectedRowErrorsOverlay`;
- truncation logic: первые 4 сообщения + `ещё N`;
- существующие ARIA/test-id/className.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не трогать state/effects, `saveDraftRows`, object payload mapping, Excel
  selection/keyboard/clipboard hooks.
- Не менять CSS/layout и user-facing тексты.

Functional trace:

- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`.

Definition of Done:

- Новый component с явными props и focused tests.
- `HeatCalcPage.tsx` только рендерит component с `selectedRowErrorMessages`.
- Existing inline-edit characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 11. Вынести resize model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только resize-логику:

- side form resize: `sideFormWidthPctFromClientX`,
  `startSideFormResizeDrag`, `startSideFormResize`,
  `startSideFormMouseResize`;
- table column resize: `applyColumnWidth`, `updateColumnWidthDraft`,
  `handleGlideColumnResize`, `handleGlideColumnResizeEnd`,
  `startColumnResize`.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения и expected
  business values.
- Не менять CSS/layout className, пользовательские тексты и структуру
  `HeatCalcObjectsTableCard`.
- Не трогать `saveDraftRows`, Excel selection/keyboard/clipboard, object
  payload mapping, toolbar actions и modal flows.
- Не менять persistence contracts: guest/registered preferences должны
  сохраняться через существующие `useHeatCalcPreferences` callbacks.

Functional trace:

- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.settings.test.tsx`.
- Focused hook tests:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcResizeModel.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs и focused tests.
- `HeatCalcPage.tsx` только подключает hook и передаёт resize callbacks дальше.
- Existing settings characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 12. Вынести draft save model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только draft-save
orchestration:

- `dirtyDraftRows` / `dirtyDraftRowCount`;
- `selectedDirtyRowIds`;
- `saveTargetIds` / `saveTargetCount` / `selectedDirtyTarget`;
- `draftControlsVisible` / `draftDiscardLabel` / `inlineDraftSaving`;
- `updateObjectInCurrentQuery`;
- `updateSavedExcelObjectsInCaches`;
- `saveDraftRows`.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не менять object payload mapping вне уже существующего `buildDraftRowParams`.
- Не менять Excel selection/keyboard/clipboard logic.
- Не менять toolbar UI/CSS/layout/texts.
- Не менять modal flow, кроме wiring на новый hook output.
- Сохранить save flow, сообщения и invalidation query keys.

Functional trace:

- API contract: `docs/api.md`, `PUT /projects/{id}/objects/{object_id}`
  требует `version` и обновляет объект.
- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`.
- Focused hook tests:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcDraftSaveModel.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs и focused tests.
- `HeatCalcPage.tsx` только подключает hook и использует returned values.
- Existing inline-edit characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 13. Вынести unsaved-change modals

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только unsaved-change modal
flow:

- Modal `Отключить редактирование ячеек?`;
- Modal `Открыть форму объекта?`;
- footer buttons `Cancel` / `Discard` / `Save`;
- локальные callback wrappers для pending inline disable и pending wizard.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не менять `saveDraftRows` implementation или `useHeatCalcDraftSaveModel`.
- Не менять Excel selection/keyboard/clipboard/context-menu logic.
- Не менять ColumnSettingsModal, HeatCalcToolbar, HeatCalcObjectsTableCard.
- Не менять CSS/layout/className.
- Не менять тексты модалок и labels кнопок.
- Не менять flow: save modal остаётся открытым при `saveDraftRows().ok === false`.

Functional trace:

- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`.
- Focused component tests:
  `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcUnsavedChangesModals.test.tsx`.

Definition of Done:

- Новый component с явными props.
- `HeatCalcPage.tsx` только рендерит component и передаёт callbacks/state.
- Existing inline-edit characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 14. Вынести Excel interaction model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только Excel interaction shell:

- `selectedExcelCell`, `excelSelectionRange`, `excelContextMenu`;
- clear/close/open context menu callbacks;
- wiring `useHeatCalcExcelSelection`;
- wiring `useHeatCalcExcelClipboard`;
- wiring `useHeatCalcExcelKeyboard`;
- `addExcelRowsBelowSelection`;
- `resetSelectedExcelRows`;
- effects закрытия context menu при выключении Excel mode, outside
  pointerdown, Escape и scroll.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не менять `saveDraftRows`, `useHeatCalcDraftSaveModel`, draft save cache
  writes.
- Не менять `useHeatCalcInlineDraftModel` implementation.
- Не менять object create/update/delete payload mapping.
- Не менять toolbar, ColumnSettingsModal, HeatCalcObjectsTableCard,
  ObjectWizard.
- Не менять CSS/layout/className/user-facing тексты.
- Не переносить data/query/table rows model в этом slice.
- Не смешивать с wizard/form panel extraction.

Functional trace:

- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`.
- Focused hook tests:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcExcelInteractionModel.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs.
- `HeatCalcPage.tsx` только подключает hook и передаёт returned values дальше.
- Existing inline-edit characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 15. Вынести normal table interaction model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только normal table
interaction/view model:

- `tableRowClassName`;
- `normalTablePagination`;
- `normalInfiniteLoading`;
- `handleNormalLoadMore`;
- `handleNormalTablePageChange`;
- non-Excel `Ctrl/Cmd+C` selected rows TSV copy hotkey effect.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не менять data/query model: `objectQueryRequest`, `objectQueryKey`,
  `useQuery` calls, all/visible rows derivation остаются в HeatCalcPage.
- Не менять Excel interaction model, draft save model, wizard/form shell,
  toolbar, table card component.
- Не менять CSS/layout/className/user-facing тексты.
- Не менять copy TSV формат и success message.

Functional trace:

- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`.
- Focused hook tests:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcNormalTableInteractionModel.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs.
- `HeatCalcPage.tsx` только подключает hook и передаёт returned values дальше.
- Existing inline-edit characterization остаётся зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 16. Вынести wizard/form shell

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только wizard/form shell:

- derivation `wizardBaseObject`;
- derivation `wizardFormObject`;
- derivation `wizardDraftFieldErrors`;
- callback wrapper `handleWizardDraftValuesChange`;
- JSX панели формы `renderFormPanel`.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не менять `useHeatCalcObjectEditor`, `useHeatCalcInlineDraftModel`,
  `useHeatCalcDraftSaveModel`, Excel interaction model, table/query model,
  toolbar, table card, column settings, resize и bulk actions.
- Не менять CSS/layout/className/user-facing тексты.
- `ObjectWizard` должен остаться lazy-loaded через `React.lazy` и `Suspense`;
  idle preload сохранить.
- Не смешивать с data/query/visible rows model или layout/render shell
  extraction.

Functional trace:

- SRS: `docs/srs.md` SC-03 и
  `docs/srs/ui/guest/02-screen-workspace-heatcalc.md` UC-G-07/08/09.
- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx`,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx`.
- Focused tests:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcWizardFormShellModel.test.tsx`,
  `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcWizardFormPanel.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs.
- Новый component с явными props.
- `HeatCalcPage.tsx` только подключает hook/component и передаёт значения.
- Existing HeatCalc basics/actions/inline-edit characterization остаётся
  зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suites и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 17. Вынести objects data/query model

Status: Done. Не запускать повторно без нового finding.
Historical prompt ниже сохранён как история выполнения.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только data/query/visible rows
model:

- `objectsSummary`;
- `objectQueryCapabilities`;
- `insulationMaterials`;
- `objectQueryRequest`, `objectQueryKey`, `allProjectObjectsQueryKey`;
- `objectQueryResult`, `objectQueryFetching`;
- `currentPageObjectsForExcel`, `allProjectObjectsData`, `allProjectObjects`;
- prefetch all objects effect;
- `pipeCount`, `tankCount`, `projectObjectCount`, `totalCount`;
- column renderers, configured/source metas, editable Excel column keys,
  table value accessors, field capabilities, visible column keys;
- all-scope indexed/filter/sort rows and enum options;
- pure visible rows resolver for normal/all/Excel modes.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения, expected
  business values.
- Не менять object create/update/delete payload mapping.
- Не менять `useHeatCalcDraftSaveModel`, `useHeatCalcInlineDraftModel`,
  `useHeatCalcExcelInteractionModel`, `useHeatCalcObjectEditor`.
- Не менять toolbar, table card, context menu, modals, CSS/className/user-facing
  тексты.
- Не переносить layout/render shell в этом slice.
- Не менять поведение `pipe/tank/all`, Excel mode, placeholder data,
  filters/sort, pagination/load-more.

Functional trace:

- API: `docs/api.md`, `POST /projects/{id}/objects/query`.
- SRS: `docs/srs/ui/guest/02-screen-workspace-heatcalc.md` SC-03,
  UC-G-07/08/09, UC-G-12, UC-G-23.
- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx`,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx`.
- Focused tests:
  `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcObjectsDataModel.test.tsx`.

Definition of Done:

- Новый hook/model с явными inputs.
- `HeatCalcPage.tsx` только подключает hook и pure visible rows resolver.
- Existing HeatCalc basics/actions/inline-edit characterization остаётся
  зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suite,
  HeatCalc characterization suites и `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 20. Tiny route shell cleanup

Status: Done. Scope intentionally tiny: icons, empty state and simple route
shell effects only.

Выполни безопасный cleanup `frontend/src/pages/HeatCalcPage.tsx`:

- вынеси `PipeTypeIcon` и `TankTypeIcon` в
  `frontend/src/pages/heatcalc/HeatCalcObjectTypeIcons.tsx`;
- вынеси empty-project ветку в
  `frontend/src/pages/heatcalc/HeatCalcEmptyProjectState.tsx`;
- вынеси workspace header reset и wizard preload effects в
  `frontend/src/pages/heatcalc/useHeatCalcRouteShellEffects.ts`, только если
  hook остаётся простым и тестируемым без хрупкого mocking.

Жёсткие границы:

- Не менять backend, API contracts, схемы, формулы, единицы измерения или
  expected business values.
- Не менять CSS/layout/className/user-facing тексты.
- Не выносить render shell: `renderTypeBar`, `renderActionsBar`,
  `HeatCalcObjectsTableCard`, context menu, settings modal, unsaved modals.
- Не менять hook wiring и state ownership.
- Не менять порядок/условия table/layout render.
- Не ослаблять assertions и не менять golden/expected значения.

Focused tests:

- `frontend/src/__tests__/unit/pages/heatcalc/HeatCalcEmptyProjectState.test.tsx`
  проверяет текущие title/description.
- `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcRouteShellEffects.test.tsx`
  проверяет reset header context, preload при `projectPresent=true` и отсутствие
  preload при `projectPresent=false`, если effects hook вынесен.

Definition of Done:

- `HeatCalcPage.tsx` стал немного меньше.
- Вынесены только icons/empty state/simple route shell effects.
- Existing HeatCalc basics characterization остаётся зелёной.
- Запустить focused tests, `HeatCalcPage.basics.test.tsx`, typecheck и
  `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 19. Вынести route actions/counts model

Status: Done. Scope intentionally narrow: small route actions and count
labels only.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только small route
actions/counts model в новый hook/model:

`frontend/src/pages/heatcalc/useHeatCalcRouteActionsModel.ts`

Разрешённый scope:

- `handleObjectScopeChange`;
- `handleFormBlockVisibilityChange`;
- `handleTableEditingModeChange`;
- `handleToolbarSave`;
- `typeButtonCountText`;
- `pipeButtonCountText`;
- `tankButtonCountText`;
- `allButtonCountText`.

Жёсткие границы:

- Не менять backend, API contracts, схемы, формулы, единицы измерения или
  expected business values.
- Не менять CSS/layout/className/user-facing тексты.
- Не выносить render shell: `renderTypeBar`, `renderActionsBar`,
  `HeatCalcObjectsTableCard`, context menu, settings modal, unsaved modals.
- Не менять state ownership: `formBlockVisible`, `tableEditingMode` и pending
  states остаются в `HeatCalcPage.tsx`.
- Новый hook только принимает values/callbacks и возвращает derived labels +
  handlers.
- Не менять `HeatCalcToolbar`, `HeatCalcObjectsTableCard`,
  `useHeatCalcObjectsDataModel`, `useHeatCalcDraftSaveModel`,
  `useHeatCalcInlineDraftModel`, `useHeatCalcExcelInteractionModel`,
  `useHeatCalcObjectEditor`.
- Не ослаблять assertions и не менять golden/expected значения.

Поведенческие контракты:

- При смене scope всегда вызывается `selectObjectScope(scope)`;
  для scope `all` wizard не сбрасывается; для pipe/tank при видимой форме
  вызывается `resetNewWizard(scope)`, при скрытой форме — `clearWizard()`.
- При смене видимости формы всегда вызывается
  `setFormBlockVisible(checked)`; `true` сбрасывает wizard по
  `wizardStateType ?? activeTableObjectType`, `false` вызывает `clearWizard()`.
- При смене table editing mode в `excel` из scope `all` сначала выбирается
  `pipe` и показывается info `Excel-режим включён для таблицы трубопроводов`;
  затем вызывается `setTableEditingMode(nextMode)`. При включении `excel`
  вызывается `clearSelectedRows()`. Всегда вызываются
  `clearExcelSelectionState()` и `closeExcelContextMenu()`.
- Toolbar save при `saveTargetCount > 0` вызывает
  `saveDraftRows(saveTargetIds)`, иначе кликает `#inline-object-save`.
- Count labels: inactive scope показывает total; active scope с selected rows
  показывает `selected/total`; active scope с фильтрами показывает
  `filtered/activeTypeTotal`; иначе показывает total.

Focused tests:

- `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcRouteActionsModel.test.tsx`
  должен покрыть object scope change, form visibility, Excel/normal editing
  mode, toolbar save и count labels.

Definition of Done:

- `HeatCalcPage.tsx` стал меньше.
- Новый hook имеет явные inputs и focused tests.
- Existing HeatCalc basics/actions/inline-edit characterization остаётся
  зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suite,
  HeatCalc characterization suites и `git diff --check`.
- Обновить Progress Ledger после успешного slice.

## Prompt 18. Вынести page effects glue model

Status: Done. Scope intentionally narrow: effects glue only.

Вынеси из `frontend/src/pages/HeatCalcPage.tsx` только безопасно отделяемые
side-effects в новый hook/model:

`frontend/src/pages/heatcalc/useHeatCalcPageEffectsModel.ts`

Разрешённый scope:

- очистка hidden-column state при изменении `visibleTableColumnKeys`;
- prune выбранных строк при изменении `visibleTableObjects`;
- pending table focus: переключение scope по типу объекта или scroll к видимой
  строке;
- очистка Excel selection, когда inline/table editing выключен и dirty rows нет;
- `beforeunload` guard для несохранённых inline/excel draft rows;
- notice `Объект сохранён, но скрыт текущими фильтрами` и очистка
  `lastSavedObject`;
- guard, который возвращает editing mode в `normal`, если Excel mode оказался в
  scope `all`.

Оставить в `HeatCalcPage.tsx`, если перенос потребует перестроить порядок hooks
или смешать ответственность:

- ref bridge `resetInlineDraftActiveCellRef`;
- ref bridge `closeColumnSettingsRef`;
- workspace header reset / wizard preload route-shell effects.

Жёсткие границы:

- Не менять backend, API contracts, формулы, единицы измерения или expected
  business values.
- Не менять CSS/layout/className/user-facing тексты.
- Не выносить render shell: `renderTypeBar`, `renderActionsBar`,
  `HeatCalcObjectsTableCard`, context menu, settings modal, unsaved modals.
- Не менять `useHeatCalcObjectsDataModel`, `useHeatCalcDraftSaveModel`,
  `useHeatCalcInlineDraftModel`, `useHeatCalcExcelInteractionModel`,
  `useHeatCalcObjectEditor`.
- Не ослаблять assertions и не менять golden/expected значения.

Functional trace:

- SRS: `docs/srs/ui/guest/02-screen-workspace-heatcalc.md` SC-03, UC-G-07/08/09,
  UC-G-23.
- API guardrail: `docs/api.md`, object query/update and heat-loss batch sections.
- QA: `docs/qa/test-cases-objects.md` TC-OBJ-09/09A and table/Excel scenarios.
- Frontend characterization:
  `frontend/src/__tests__/unit/pages/HeatCalcPage.basics.test.tsx`,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.inline-edit.test.tsx`,
  `frontend/src/__tests__/unit/pages/HeatCalcPage.actions.test.tsx`.

Focused tests:

- `frontend/src/__tests__/unit/pages/heatcalc/useHeatCalcPageEffectsModel.test.tsx`
  должен покрыть:
  - вызов `cleanHiddenColumnState`;
  - вызов `pruneSelectedRows`;
  - `beforeunload` add/remove;
  - Excel/all scope guard;
  - hidden-by-filter saved object notice;
  - pending focus scope switch и visible-row scroll path.

Definition of Done:

- `HeatCalcPage.tsx` стал меньше.
- Количество `useEffect` в `HeatCalcPage.tsx` уменьшилось.
- Новый hook имеет явные inputs и focused tests.
- Existing HeatCalc basics/actions/inline-edit characterization остаётся
  зелёной.
- Запустить `npm --prefix frontend run typecheck`, focused Vitest suite,
  HeatCalc characterization suites и `git diff --check`.
- Обновить Progress Ledger после успешного slice.
