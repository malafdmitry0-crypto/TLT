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
