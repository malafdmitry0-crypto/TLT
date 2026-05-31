# ElecCalcPage decomposition prompts

## Цель

`frontend/src/pages/ElecCalcPage.tsx` - крупный route-component для SC-04:
электрорасчёт, CO1..CO4, выбор базы кабелей, массовый пересчёт, ручной выбор
марки, модалка кандидатов, основные и candidate-таблицы, настройки колонок,
папки кандидатов и переход в спецификацию. Резать его нужно маленькими
проверяемыми шагами: сначала audit и characterization, затем pure helpers,
затем узкие hooks/components.

Не смешивать декомпозицию с `HeatCalcPage`. Не создавать shared abstraction
между HeatCalc и ElecCalc без отдельного архитектурного finding.

## Prompt 1. Аудит декомпозиции без кода

Проанализируй `frontend/src/pages/ElecCalcPage.tsx` и составь план
декомпозиции без изменения кода.

Требования:

- Найди логические блоки внутри файла.
- Раздели блоки на безопасные для первого выноса и рискованные.
- Отдельно перечисли состояние/effects, которые нельзя двигать без тестов.
- Отдельно перечисли business-critical flows: CO variants, batch calc, manual
  cable selection, candidate apply, specification transition.
- Предложи целевую структуру файлов.
- Не пиши код.

## Prompt 1. Результат аудита

Заполнить после первого ночного audit-only или safe-split запуска.

Ожидаемые responsibility clusters:

- route-level container: проект, роль, variant store, navigation state;
- object/electrical query: backend pagination/cursors, filters, sort, summary;
- electrical calculation state: active job, batch scope, overwrite manual choices;
- cable type/source controls: feature flags, built-in/extended/all, selection
  policy, per-object cable type drafts;
- global recalculation settings: voltage, connection, winding coefficient,
  heating height, laying step, maintain/vapor temperatures, aggressive product;
- main electrical table: columns, renderers, copy values, Glide/Table engines,
  inline layout edits for winding pitch and thread count;
- column settings: main table and candidate table preferences;
- manual cable mark modal: source options and save-to-CO variants;
- candidate sizing modal: auto/manual runs, applied candidate, comparison,
  folders, pin/favorite/exclude/apply;
- result diagnostics: unsupported/stale/failed/success status and guidance;
- navigation to specification/report side effects.

Potential target structure:

- `frontend/src/pages/electrical/elecCalcPageUtils.ts` - pure helpers and
  constants not already reusable.
- `frontend/src/pages/electrical/elecCalcQueryModel.ts` - pure request/filter
  builders if not moved to `utils`.
- `frontend/src/pages/electrical/useElecCalcTableState.ts` - page/filter/sort
  state for main table.
- `frontend/src/pages/electrical/useElecCalcPreferences.ts` - table/candidate
  column settings and view settings persistence.
- `frontend/src/pages/electrical/useElecCalcDataModel.ts` - query results,
  visible rows, stats, object/calculation maps.
- `frontend/src/pages/electrical/useElecCalcBatchJob.ts` - active job polling,
  batch/cancel orchestration and toolbar disabled state.
- `frontend/src/pages/electrical/useElecCalcCableTypeModel.ts` - available
  cable types, per-object drafts, source controls.
- `frontend/src/pages/electrical/useElecCalcCableMarkModal.ts` - manual mark
  modal state and save-to-CO payload.
- `frontend/src/pages/electrical/useElecCalcCandidateModal.ts` - candidate
  sizing modal state and mutations.
- `frontend/src/pages/electrical/useElecCalcCandidateFolders.ts` - folders,
  favorites, exclusion, candidate grouping.
- `frontend/src/pages/electrical/elecCalcColumnRenderers.tsx` - main table
  render/copy specs.
- `frontend/src/pages/electrical/elecCalcCandidateRenderers.tsx` - candidate
  table render/copy/compare specs.
- `frontend/src/components/electrical/ElecCalcToolbar.tsx` - presentational
  toolbar only after UI proof is practical.

## Progress Ledger

Обновляй этот ledger после каждого успешного refactor slice. Ночной runner
`docs/playbooks/eleccalc-safe-split-nightly-prompt.md` должен выбирать следующий
шаг отсюда и не повторять уже выполненные пункты.

| Шаг | Статус | Evidence |
|---|---|---|
| Audit decomposition map | Done | 2026-05-30 nightly: docs/backend/frontend/tests safety map; first safe slice выбран без UI/JSX |
| Baseline metrics snapshot | Done | 2026-05-30: `ElecCalcPage.tsx` 5940 строк; hooks snapshot `useState=10`, `useEffect=24`, `useMemo=46`, `useCallback=58`; focused tests 56 pass |
| Pure helper inventory | Done | 2026-05-31: inventory-only prompt; safe/coupled helpers mapped before next code slice |
| Query/filter request builder characterization | Done | `frontend/src/pages/electrical/elecCalcQueryModel.ts`; `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx` |
| Candidate compare/value helpers characterization | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcCandidateCompareModel.ts`; focused unit + `ElecCalcPage` integration, 60 pass |
| Main electrical result/value helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcResultValueModel.ts`; focused unit + candidate/query units + `ElecCalcPage` integration, 65 pass |
| Layout numeric helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcLayoutModel.ts`; focused unit + result/candidate/query units + `ElecCalcPage` integration, 71 pass |
| Main table copy/status characterization | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcMainTableModel.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 76 pass |
| Cable mark/source option helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcCableOptionModel.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 80 pass |
| Cable catalog status helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcCableCatalogModel.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 87 pass |
| Table filter kind helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcTableFilterModel.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 87 pass |
| Cable type constants/helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcCableTypeModel.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 89 pass |
| CO variant, cursor and API guard helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcVariantModel.ts`, `elecCalcCursorModel.ts`, `elecCalcApiResponseGuards.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 96 pass |
| Candidate folder, project cable option and filter input helpers | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcCandidateFolderModel.ts`, `shouldShowProjectCableOption`, `toInputNumberValue`; focused unit + previous pure units + `ElecCalcPage` integration, 100 pass |
| Selection policy and page constants/types | Done | 2026-05-31: `frontend/src/pages/electrical/elecCalcSelectionPolicyModel.ts`, `elecCalcPageModel.ts`; focused unit + previous pure units + `ElecCalcPage` integration, 103 pass |
| Candidate policy reuse and remaining page option constants | Done | 2026-05-31: candidate compare reuses `elecCalcSelectionPolicyModel.ts`; `SHOW_COMMERCIAL_CABLE_BASE_UI`, `CableMarkSelectOption` extracted; focused unit + `ElecCalcPage` integration, 71 pass |
| Resizable column title reuse | Done | 2026-05-31: `ElecCalcPage.tsx` reuses shared `ResizableColumnTitle`; `ElectricalColumnRenderSpec` moved to `elecCalcPageModel.ts`; focused ElecCalc + shared grid checks, 75 pass |
| Ant table column filter dropdown extraction | Done | 2026-05-31: `ColumnFilterDropdown` moved to `components/electrical/ElectricalColumnFilterDropdown.tsx`; characterization unit + `ElecCalcPage` integration, 57 pass |
| Candidate field renderer extraction | Done | 2026-05-31: `renderCandidateElectricalField` moved to `components/electrical/ElectricalCandidateFieldRenderer.tsx`; characterization unit + `ElecCalcPage` integration, 56 pass |
| Electrical query page merge helpers | Done | 2026-05-31: loaded-page fallback and object/calculation de-duplication moved to `elecCalcPageModel.ts`; focused unit + `ElecCalcPage` integration, 57 pass |
| Cable type selection helpers | Done | 2026-05-31: normalize/resolve/build object overrides moved to `elecCalcCableTypeModel.ts`; focused unit + `ElecCalcPage` integration, 58 pass |
| Table view filter/sort state helpers | Done | 2026-05-31: filter/sort state update helpers moved to `elecCalcTableFilterModel.ts`; focused unit + `ElecCalcPage` integration |
| Candidate folder active-state helpers | Done | 2026-05-31: custom folder lookup, folder filtering and counts moved to `elecCalcCandidateFolderModel.ts`; focused unit + `ElecCalcPage` integration |
| Enum filter option builders | Done | 2026-05-31: main/candidate enum option builders and backend capability lookup moved to `elecCalcTableFilterModel.ts`; focused unit + `ElecCalcPage` integration |
| Candidate compare diff keys | Done | 2026-05-31: diff-key detection moved to `elecCalcCandidateCompareModel.ts`; focused unit + `ElecCalcPage` integration |
| Candidate table value accessors | Done | 2026-05-31: candidate table accessor builder moved to `elecCalcCandidateCompareModel.ts`; focused unit + `ElecCalcPage` integration |
| Candidate displayed rows model | Done | 2026-05-31: candidate filter/sort/applied-first projection and marked-row filtering moved to `elecCalcCandidateTableModel.ts`; focused unit + `ElecCalcPage` integration |
| Main/candidate table view state hook | Done | 2026-05-31: filter/sort/reset callbacks and hidden-column cleanup moved to `useElecCalcTableViewState.ts`; focused hook unit + `ElecCalcPage` integration |
| Main pagination/cursor hook | Done | 2026-05-31: page/pageSize, cursor cache, Glide loaded pages and load-more state moved to `useElecCalcPaginationState.ts`; focused hook unit + `ElecCalcPage` integration |
| Ant table compatibility handlers | Done | 2026-05-31: Ant sorter parsing and main/candidate `onChange` adapters moved to `useElecCalcAntTableHandlers.ts`; focused hook unit + `ElecCalcPage` integration |
| Column settings draft hook | Done | 2026-05-31: main/candidate column settings draft state, open/update/reset/select-all/apply handlers moved to `useElecCalcColumnSettingsDraftState.ts`; focused hook unit + `ElecCalcPage` integration |
| Main row selection state hook | Done | 2026-05-31: active row, selected row keys, visibility pruning and selected/manual count helpers moved to `useElecCalcRowSelectionState.ts` and `elecCalcSelectionModel.ts`; focused unit + `ElecCalcPage` integration |
| Electrical error summary model | Done | 2026-05-31: failed-only error item selection, active-row fallback and guidance input moved to `elecCalcErrorSummaryModel.ts`; focused unit + full frontend gate |
| Recalculation params hook | Done | 2026-05-31: selection policy, voltage, connection, layout and TT params moved to `useElecCalcRecalculationParams.ts`; focused hook unit + full frontend gate |
| Cable type state hook | Done | 2026-05-31: default/draft cable type state, available-type normalization, selected-row type resolution and object overrides moved to `useElecCalcCableTypeState.ts`; focused hook unit + full frontend gate |
| Candidate folder UI state hook | Done | 2026-05-31: active folder key, create/rename modal state and open/close helpers moved to `useElecCalcCandidateFolderUiState.ts`; focused hook unit + full frontend gate |
| Candidate folder view model hook | Done | 2026-05-31: active custom folder lookup, active-folder candidate filtering, folder counts and active-folder reset effects moved to `useElecCalcCandidateFolderViewModel.ts`; focused hook unit + full frontend gate |
| Candidate compare state hook | Done | 2026-05-31: marked candidate ids, compare-active state, displayed candidate projection, diff keys and compare row/cell helpers moved to `useElecCalcCandidateCompareState.ts`; focused hook unit + full frontend gate |
| Cable mark modal state hook | Done | 2026-05-31: modal object/type/value/target-variant state, option derivation, selected cable lookup and open/close/change helpers moved to `useElecCalcCableMarkModalState.ts`; focused hook unit + full frontend gate |
| Cable sizing modal state hook | Done | 2026-05-31: modal object/mode/type/manual-mark state, effective cable type, candidate params, query keys and open/reset helpers moved to `useElecCalcCableSizingModalState.ts`; focused hook unit + full frontend gate |
| Cable catalog row resolver | Done | 2026-05-31: cable rows by type/source and catalog commercial/technical statuses moved to `elecCalcCableCatalogModel.ts`; focused model unit + full frontend gate |
| Cable selected-row resolver | Done | 2026-05-31: cable row lookup by mark/source, TT suffix matching, snapshot fallback and synthetic fallback moved to `elecCalcCableCatalogModel.ts`; focused model unit + full frontend gate |
| Boot/view state hook | Done | 2026-05-31: available cable type keys/set, table engine resolution, glide flags and navigation active job id moved to `useElecCalcBootViewState.ts`; focused hook unit + `ElecCalcPage` integration |
| Table projection hook | Done | 2026-05-31: loaded-page projection, visible objects/calculations, display offset and stats moved to `useElecCalcTableProjection.ts`; focused hook unit + `ElecCalcPage` integration |
| Cable mark options hook | Done | 2026-05-31: self-regulating/TT/resistive manual options, project snapshot option and sizing modal options moved to `useElecCalcCableMarkOptions.tsx`; focused hook unit + `ElecCalcPage` integration |
| Column persistence/resize hook | Done | 2026-05-31: main/candidate table settings persistence, guest/registered side effects and column resize handlers moved to `useElecCalcColumnPersistence.ts`; focused hook unit + `ElecCalcPage` integration |
| Page scope effects hook | Done | 2026-05-31: table page reset, pagination cache reset, navigation active job hydration and project/variant active-job cleanup moved to `useElecCalcPageScopeEffects.ts`; focused hook unit + `ElecCalcPage` integration |
| Summary/selection view model | Done | 2026-05-31: toolbar/banner totals, selected valid/manual counts, recalc disabled labels and job progress moved to `elecCalcSummaryModel.ts`; focused model unit + `ElecCalcPage` integration |
| Data lifecycle effects hook | Done | 2026-05-31: electrical page/cursor remembering, candidate-table reset on sizing object change and sizing cable type normalization moved to `useElecCalcDataLifecycleEffects.ts`; focused hook unit + `ElecCalcPage` integration |
| Column view model hook | Done | 2026-05-31: normalized table view settings, main/candidate visible column metas/keys and resolved table font size moved to `useElecCalcColumnViewModel.ts`; focused hook unit + `ElecCalcPage` integration |
| Cable catalog view hook | Done | 2026-05-31: cable rows by visible type and commercial/technical catalog statuses moved to `useElecCalcCableCatalogView.ts`; focused hook unit + `ElecCalcPage` integration |
| Table navigation hook | Done | 2026-05-31: Ant pagination config, Glide infinite-loading state and page/load-more handlers moved to `useElecCalcTableNavigation.ts`; focused hook unit + `ElecCalcPage` integration |
| Filter options hook | Done | 2026-05-31: backend field capability map, main table enum options and candidate enum options moved to `useElecCalcFilterOptions.ts`; focused hook unit + `ElecCalcPage` integration |
| Table dimensions hook | Done | 2026-05-31: main electrical table scrollX calculation and stable scrollY constant moved to `useElecCalcTableDimensions.ts`; focused hook unit + `ElecCalcPage` integration |
| Row class model hook | Done | 2026-05-31: electrical row invalid/active CSS class resolution moved to `useElecCalcRowClassName.ts`; focused hook/model unit + `ElecCalcPage` integration |
| Glide column model hook | Done | 2026-05-31: main/candidate Glide column metadata, widths, filters and candidate meta lookup moved to `useElecCalcGlideColumnModel.ts`; focused hook unit + `ElecCalcPage` integration |
| Main table copy value hook | Done | 2026-05-31: page dependency wrapper around `mainElectricalColumnCopyValue` moved to `useElecCalcElectricalColumnCopyValue.ts`; focused hook unit + `ElecCalcPage` integration |
| Selected rows clipboard effect hook | Done | 2026-05-31: Ctrl+C selected-row TSV copy side effect moved to `useElecCalcSelectedRowsClipboardEffect.ts`; focused hook unit with clipboard/message mocks + `ElecCalcPage` integration |
| Layout editability model | Done | 2026-06-01: layout cell editability rules moved to `elecCalcLayoutModel.ts`; focused model unit + `ElecCalcPage` integration |
| Layout commit validation model | Done | 2026-06-01: pure validation and next layout values for Glide layout commit moved to `elecCalcLayoutModel.ts`; mutation payload assembly remains in `ElecCalcPage`; focused model unit + `ElecCalcPage` integration |
| Main Glide cell state hook | Done | 2026-06-01: thin cell-state hook moved display/editability assembly to `useElecCalcGlideCellState.ts`; page keeps renderers, actions and handlers; focused hook unit + `ElecCalcPage` integration |
| Main table JSX renderers characterization | Backlog | cable mark active actions, status tags, layout cells; no extraction without UI proof if JSX/CSS changes |
| Candidate table render/copy characterization | Backlog | apply/actions, TT duplicate marks, comparison diff |
| Main table state hook | Backlog | remaining row class/cell action state helpers |
| Candidate table state hook | Backlog | remaining marked comparison state |
| Preferences/settings hook | Backlog | main/candidate columns, view settings, role cache |
| Cable source availability hook | Backlog | remaining feature flag and built-in/extended/all available type wiring |
| Batch job/recalc model hook | Backlog | active job polling, selected/all scope, overwrite manual |
| Cable mark modal apply flow hook | Backlog | manual/auto mutations and save-to-CO side effects |
| Candidate sizing modal mutation flow hook | Backlog | auto/manual candidate creation, apply, reload |
| Candidate folders model hook | Backlog | all/favorite/custom folders, rename/delete, excluded |
| Electrical result diagnostics component/model | Backlog | failed/unsupported/stale/success separation |
| Toolbar/actionbar component | Backlog | Only after characterization and UI proof |
| Route shell cleanup | Backlog | Only tiny presentational cleanup, no workflow changes |

## Prompt 2. First safe slice candidate

Выполни только если `Prompt 1` уже заполнен или ты в рамках nightly prompt
сначала сделал audit map.

Предпочтительный порядок:

1. Tests-only characterization для pure helpers around query/filter/candidate
   comparison, если нет достаточного покрытия.
2. Вынести только pure helpers без JSX, React state/effects, DOM, React Query и
   stores.
3. Вынести narrow hook только если он не создаёт giant prop chain и уже покрыт
   focused tests.

Definition of Done:

- Поведение страницы не меняется.
- Нет изменений backend/API/formula/units.
- Добавлен focused test или усилен existing test.
- Запущены typecheck, focused frontend tests, `git diff --check`.
- Если JSX/CSS/visible UI менялись: Playwright/UI proof и layout gate.
- Ledger обновлён только после успешного slice.

## Prompt 3. Вынести candidate compare/value helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только чистые helpers модалки кандидатов в `ElecCalcPage`: значения
полей, display values, compare normalization, service compare keys,
commercial projection и source metadata количества ниток.

Задача:

- Вынести из `frontend/src/pages/ElecCalcPage.tsx` только pure functions без
  JSX, React state/effects, DOM, React Query, store и backend calls.
- Целевой файл:
  `frontend/src/pages/electrical/elecCalcCandidateCompareModel.ts`.
- Не трогать `renderCandidateElectricalField`, JSX колонок, CSS, payload,
  backend/API, формулы и persistence.
- Не менять тексты, единицы и форматирование: `Авто/Ручной`, labels типов
  кабеля, selection policy, connection type, stock status, `—`,
  `__empty__`, `formatNumber`, `formatPower`.
- Добавить focused unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts`.
- Проверить, что `ElecCalcPage.tsx` импортирует вынесенные helpers и больше не
  держит локальный duplicate-блок compare/value helpers.

Definition of Done:

- Страница компилируется без изменения UI/JSX.
- Unit покрывает numeric helpers, commercial values, labels, compare
  normalization и thread source.
- Запущены:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx`
- Запущены `npm --prefix frontend run typecheck` и `git diff --check`.
- Playwright/screenshots не требуются, если slice не меняет JSX/CSS/visible UI.

## Prompt 4. Pure helper inventory

Status: Done. Inventory-only; код не менять.

Режим `/audit-only`.
Scope: текущий `frontend/src/pages/ElecCalcPage.tsx` после выноса query model и
candidate compare model.

Анализ документа перед выполнением:

- Playbook корректно задаёт safe-split порядок: сначала audit и
  characterization, потом pure helpers, и только после этого hooks/components.
- Ledger уже закрывает query/filter request builder и candidate compare/value
  helpers, поэтому повторять эти срезы нельзя без нового finding.
- Следующий безопасный шаг перед новым кодовым выносом - инвентарь оставшихся
  helpers: он не меняет UI, payload, формулы, persistence и не требует
  screenshots.
- Рискованные зоны по документу остаются прежними: CO variants, batch calc,
  manual cable selection, candidate apply, specification transition,
  настройки колонок и Glide/Table renderers. Их нельзя выносить без отдельной
  characterization и UI proof, если меняется JSX/CSS/visible behavior.

Pure helpers already extracted:

| Группа | Файл | Статус |
|---|---|---|
| Electrical backend query/filter builder | `frontend/src/pages/electrical/elecCalcQueryModel.ts` | Done |
| Candidate compare/value helpers | `frontend/src/pages/electrical/elecCalcCandidateCompareModel.ts` | Done |
| Main electrical result/value helpers | `frontend/src/pages/electrical/elecCalcResultValueModel.ts` | Done |
| Layout numeric helpers | `frontend/src/pages/electrical/elecCalcLayoutModel.ts` | Done |
| Main table copy/status model | `frontend/src/pages/electrical/elecCalcMainTableModel.ts` | Done |
| Cable mark/source option helpers | `frontend/src/pages/electrical/elecCalcCableOptionModel.ts` | Done |
| Cable catalog status helpers | `frontend/src/pages/electrical/elecCalcCableCatalogModel.ts` | Done |
| Table filter kind helpers | `frontend/src/pages/electrical/elecCalcTableFilterModel.ts` | Done |
| Candidate folder key helpers | `frontend/src/pages/electrical/elecCalcCandidateFolderModel.ts` | Done |

Safe next pure candidates, but only with focused unit tests:

| Группа | Helpers/constants | Почему безопасно | Рекомендуемый target |
|---|---|---|---|
| Main electrical value/display model | `finiteNumber`, `valueText`, `numberText`, `powerText`, `resultNumber`, `objectResultNumber`, `cablePowerPerMeterValue`, `installedPowerPerMeterValue`, `orderCableLengthValue`, `commercialValue`, `commercialNumber`, `selectionPolicyText` | Pure formatting/extraction, no React state/effects, no backend calls. Used by main table render/copy and summary. | `frontend/src/pages/electrical/elecCalcResultValueModel.ts` |
| Main calculation status/source helpers | `getCableMark`, `currentElectricalCalc`, `getCableMarkSource`, `getThreadSource`, `threadSourceTag`, `calcLayoutValues` | Pure mapping from `ElectricalCalcSummary`; affects labels/status badges, so must characterize text output. | Same result value model or `elecCalcResultStatusModel.ts` |
| Layout numeric helpers | `parseElectricalLayoutNumber`, `maxThreadsForCableType`, `pipeOuterDiameterMm`, `maxWindingCoefficientForDiameterMm`, `windingCoefficientForPitch` | Pure numeric/input helpers; no API calls. Need boundary tests because they constrain editable layout cells. | `frontend/src/pages/electrical/elecCalcLayoutModel.ts` |
| Cable mark/source option helpers | `normalizeCableSource`, `normalizeCableMarkOptionSource`, `cableMarkOptionValue`, `catalogSourceFromSnapshot`, `externalCableOptionLabelSource` | Pure option/source mapping. Safe only with tests for project/builtin/commercial/extended/all encoding and snapshot fallback. | `frontend/src/pages/electrical/elecCalcCableOptionModel.ts` |
| Cable catalog status helpers | `hasCommercialData`, `commercialStatus`, `hasValue`, `hasTechnicalData`, `technicalStatus`, `cableSnapshotRow` | Pure catalog row analysis. Needs tests for TLT/TT/resistive completeness and commercial status labels. | `frontend/src/pages/electrical/elecCalcCableCatalogModel.ts` |
| Column filter kind helpers | `filterKindForElectricalColumn`, `filterKindForCandidateColumn`, `CANDIDATE_*_FILTER_KEYS` | Pure, but tightly tied to table column capabilities and candidate settings. Extract only with tests for capability priority and fallback keys. | `frontend/src/pages/electrical/elecCalcTableFilterModel.ts` |

Coupled helpers/components - do not move as pure helpers:

| Группа | Helpers/components | Причина |
|---|---|---|
| Candidate JSX renderers | `renderCandidateElectricalField` | Returns JSX, uses AntD `Space/Text/Tag/Tooltip` and visible table cells; extraction needs renderer characterization and UI proof if behavior changes. |
| Filter/resizable UI | `ColumnFilterDropdown`, `ResizableColumnTitle` | Local components with React state, AntD controls and DOM pointer handling. Move only as UI component slice. |
| Main table render/copy specs | `electricalColumnRenderers`, `electricalColumnCopyValue`, Glide cell state/actions | Mix business labels, row state, active row actions, inline edit and UI actions. Needs dedicated characterization before extraction. |
| Preferences/settings handlers | `openColumnSettings`, `updateDraft*`, `persist*`, `apply*Settings` | Coupled to user role, localStorage/server preferences, modal open state and mutation side effects. |
| Batch/job/recalc flow | `batchMut`, `copyVariantMut`, `cancelJobMut`, active job effects, overwrite manual controls | Business-critical persistence and side effects; requires API/DB/user-flow proof. |
| Cable mark modal flow | `openCableMarkModal`, `changeCableMarkModalCableType`, `applyCableMarkModal`, manual/auto mutations | Persists manual cable selections across CO variants; not a pure helper slice. |
| Candidate modal/folders/apply flow | candidate create/update/apply/folder mutations, compare bar, folder tabs | Mutates candidate state and backend; must stay out of pure helper pass. |
| Route/data model hooks | project/role/variant/query state, pagination cursors, infinite pages, stats, navigation | React Query/Zustand/effects; extract only as narrow hook after characterization. |

Recommended next code prompt:

`Prompt 5. Вынести main electrical result/value helpers`.

Scope for Prompt 5:

- Target only pure helpers listed in "Main electrical value/display model" plus
  optionally `getCableMark`, `currentElectricalCalc`, `getCableMarkSource`,
  `getThreadSource`, `threadSourceTag`, `calcLayoutValues`.
- Do not move JSX renderers, table columns, copy callback, mutations, hooks,
  preferences or Glide actions.
- Add focused unit tests for:
  - `selected_cable` fallback in `getCableMark`;
  - successful vs failed/stale `currentElectricalCalc`;
  - `order_cable_length` explicit numeric parsing and empty value;
  - commercial projection labels/numbers;
  - `manual_selection` and unknown selection policy labels;
  - thread source tags;
  - `calcLayoutValues` defaults.
- Then run focused unit + `ElecCalcPage` integration, typecheck and
  `git diff --check`.

Definition of Done:

- No production code changes for Prompt 4 itself except this playbook update.
- Inventory distinguishes pure helpers, pure-but-needs-tests helpers and
  coupled UI/business flows.
- Ledger marks `Pure helper inventory` as Done.
- `git diff --check` passes.

## Prompt 5. Вынести main electrical result/value helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только чистые helpers отображения и извлечения значений основного
электрорасчёта в `ElecCalcPage`.

Задача:

- Вынести pure helpers из `frontend/src/pages/ElecCalcPage.tsx` в
  `frontend/src/pages/electrical/elecCalcResultValueModel.ts`.
- Разрешённый набор:
  `finiteNumber`, `valueText`, `numberText`, `powerText`, `resultNumber`,
  `objectResultNumber`, `cablePowerPerMeterValue`,
  `installedPowerPerMeterValue`, `orderCableLengthValue`, `commercialValue`,
  `commercialNumber`, `selectionPolicyText`, `getCableMark`,
  `currentElectricalCalc`, `getCableMarkSource`, `getThreadSource`,
  `threadSourceTag`, `calcLayoutValues`.
- Не двигать JSX renderers, table columns, copy callback, Glide actions,
  hooks/effects, React Query, Zustand, mutations, preferences, payload builders
  и business workflow.
- Не менять видимые тексты, формат чисел, единицы, `manual_selection`,
  `stale`/error filtering и fallback `results.selected_cable`.
- Добавить focused unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts`.

Definition of Done:

- `ElecCalcPage.tsx` импортирует вынесенные helpers и не держит локальный
  duplicate-блок result/value helpers.
- Unit покрывает selected cable fallback, success/error/stale filtering,
  explicit `order_cable_length`, commercial projection, selection policy text,
  thread source tags и layout defaults.
- Запущены:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx`
- Запущены `npm --prefix frontend run typecheck` и `git diff --check`.
- Playwright/screenshots не требуются, если JSX/CSS/visible UI не менялись.

## Prompt 7. Вынести main table copy/status model

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только чистая модель текстовых значений основной таблицы SC-04:
TSV/copy values, labels типов/статусов, object display name и metadata
`cable_snapshot_status`.

Анализ документа перед выполнением:

- Ledger после Prompt 6 оставляет `Main table render/copy` как следующий
  безопасный участок, но `electricalColumnRenderers` содержит JSX, AntD
  `Button/Tag/Tooltip/Space`, active-row actions и callbacks. Это не pure
  slice.
- Безопасная часть внутри этого участка - `electricalColumnCopyValue`,
  `objectDisplayName`, label dictionaries и `cableSnapshotStatusTag`: они не
  содержат JSX, React state/effects, DOM, React Query, Zustand, mutations,
  payload builders или backend calls.
- `docs/srs/ui/guest/03-screen-workspace-electrical.md`, `docs/api.md` и
  `docs/context/formulas-summary.md` фиксируют тексты/смысл статусов,
  выбранную марку, параметры укладки, коммерческую проекцию и правило успешного
  электрорасчёта. Этот slice не меняет формулы, единицы, API/payload,
  persistence, JSX/CSS или видимые действия.

Задача:

- Вынести из `frontend/src/pages/ElecCalcPage.tsx` только:
  `CableTypeKey`, `CABLE_TYPE_LABEL`, `OBJECT_TYPE_LABEL`,
  `CONNECTION_TYPE_LABEL`, `STOCK_STATUS_LABEL`, `objectDisplayName`,
  `cableSnapshotStatusTag` и pure-wrapper для `electricalColumnCopyValue`.
- Целевой файл:
  `frontend/src/pages/electrical/elecCalcMainTableModel.ts`.
- В `ElecCalcPage.tsx` оставить `useCallback` и передавать в модель только
  явный context: `calcByObjectId`, offset, cable type resolver и default
  electrical parameters.
- Не двигать `electricalColumnRenderers`, JSX, Glide actions/cell state,
  `handleElectricalGlideCommitCell`, column settings, filters, mutations,
  hooks/effects, payload builders, backend/API и persistence.
- Не менять тексты `Рассчитан`, `Не применимо`, `Требуется пересчёт`,
  `Ошибка`, `Не рассчитан`, `ручн.`, source labels, commercial stock labels,
  `manual_selection`, fallback `results.selected_cable` и filtering
  failed/stale/current calc.
- Добавить focused unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcMainTableModel.test.ts`.

Definition of Done:

- `ElecCalcPage.tsx` импортирует main-table copy/status helpers и больше не
  держит локальный duplicate-блок copy/status labels.
- Unit покрывает object labels, snapshot status labels/tooltips, heat-loss
  statuses, electrical success/unsupported/stale/error statuses, `selected_cable`
  fallback, thread source suffix, defaults, connection/stock labels,
  commercial values and stale/current filtering for copy text.
- Запущены:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcMainTableModel.test.ts src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx`
- Запущены `npm --prefix frontend run typecheck` и `git diff --check`.
- Playwright/screenshots не требуются, если JSX/CSS/visible UI не менялись.

## Prompt 8. Вынести cable mark/source option helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только чистые helpers выбора источника/значения марки кабеля в
`ElecCalcPage`: normalizer источника, encoding значения option, fallback
источника из `cable_snapshot` и внешняя метка source для catalog rows.

Анализ документа перед выполнением:

- `Prompt 4` отмечает `normalizeCableSource`,
  `normalizeCableMarkOptionSource`, `cableMarkOptionValue`,
  `catalogSourceFromSnapshot`, `externalCableOptionLabelSource` как безопасный
  pure-кандидат при наличии focused unit tests.
- `docs/srs/ui/guest/03-screen-workspace-electrical.md` фиксирует, что список
  марок зависит от типа кабеля и активной базы расчёта, а ручной выбор марки
  сохраняется отдельно по объекту/CO. Этот slice не меняет форму, JSX, тексты
  модалки, payload, backend, формулы, persistence или CO workflow.
- Источник истины для отображения внешней метки уже локализован в
  `frontend/src/utils/cableCatalogSourceLabels.ts`; новая модель должна только
  делегировать туда сравнение extended/builtin строк.

Задача:

- Вынести из `frontend/src/pages/ElecCalcPage.tsx` только:
  `CableMarkOptionSource`, `AUTO_CABLE_MARK_VALUE`,
  `CABLE_MARK_OPTION_SEPARATOR`, `normalizeCableSource`,
  `normalizeCableMarkOptionSource`, `cableMarkOptionValue`,
  `catalogSourceFromSnapshot`, `externalCableOptionLabelSource`.
- Целевой файл:
  `frontend/src/pages/electrical/elecCalcCableOptionModel.ts`.
- Не двигать `CableMarkSelectOption`, `optionWithSourceLabel`,
  `cableMarkOption`, `manualCableOptionsForType`,
  `cableMarkOptionsFor`, `findCableRowForMark`, модалки ручного выбора,
  sizing modal, JSX renderers, React state/effects, React Query/Zustand,
  mutations, payload builders, backend/API и persistence.
- Не менять sentinel и encoding: `__auto__`, separator `::`,
  `encodeURIComponent(mark)`, fallback invalid source -> `builtin`, special
  source `project`, snapshot fallback `actual_catalog_source` -> затем
  `requested_catalog_source`.
- Добавить focused unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcCableOptionModel.test.ts`.

Definition of Done:

- `ElecCalcPage.tsx` импортирует option/source helpers и больше не держит
  локальный duplicate-блок этих функций/констант.
- Unit покрывает source normalization, `project` special case, invalid fallback,
  option encoding для кириллицы/символов, snapshot actual/requested fallback,
  invalid/array snapshot и external label delegation для `all` vs `extended`.
- Запущены:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcCableOptionModel.test.ts src/__tests__/unit/pages/electrical/elecCalcMainTableModel.test.ts src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx`
- Запущены `npm --prefix frontend run typecheck` и `git diff --check`.
- Playwright/screenshots не требуются, если JSX/CSS/visible UI не менялись.

## Prompt 9. Вынести cable catalog status helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только pure helpers анализа строк кабельного каталога и snapshot row:
`CableStatusRow`, `CatalogStatus`, `hasCommercialData`, `commercialStatus`,
`hasValue`, `hasTechnicalData`, `technicalStatus`, `cableSnapshotRow`.

Задача выполнена в
`frontend/src/pages/electrical/elecCalcCableCatalogModel.ts`.
Не двигались JSX, модалки выбора кабеля, mutations, payload builders,
backend/API, persistence и workflow CO.

Evidence:

- Unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcCableCatalogModel.test.ts`.
- Focused run:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcCableCatalogModel.test.ts src/__tests__/unit/pages/electrical/elecCalcTableFilterModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCableOptionModel.test.ts src/__tests__/unit/pages/electrical/elecCalcMainTableModel.test.ts src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx` — 87 pass.
- Playwright/screenshots не требуются, потому что JSX/CSS/visible UI не менялись.

## Prompt 10. Вынести table filter kind helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только pure helpers выбора типа фильтра таблицы:
`ElectricalFilterKind`, `CANDIDATE_NUMERIC_FILTER_KEYS`,
`CANDIDATE_ENUM_FILTER_KEYS`, `CANDIDATE_BOOLEAN_FILTER_KEYS`,
`filterKindForElectricalColumn`, `filterKindForCandidateColumn`.

Задача выполнена в
`frontend/src/pages/electrical/elecCalcTableFilterModel.ts`.
Не двигались `ColumnFilterDropdown`, `ResizableColumnTitle`, JSX, DOM,
табличные renderers, настройки колонок, React state/effects, backend/API и
persistence.

Evidence:

- Unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcTableFilterModel.test.ts`.
- Focused run:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcCableCatalogModel.test.ts src/__tests__/unit/pages/electrical/elecCalcTableFilterModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCableOptionModel.test.ts src/__tests__/unit/pages/electrical/elecCalcMainTableModel.test.ts src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx` — 87 pass.
- Playwright/screenshots не требуются, потому что JSX/CSS/visible UI не менялись.

## Prompt 11. Вынести cable type constants/helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только default/available cable type constants и predicate для
резистивных типов в `ElecCalcPage`.

Анализ документа перед выполнением:

- `docs/srs/ui/guest/03-screen-workspace-electrical.md` фиксирует, что на SC-04
  пользователь выбирает тип кабеля; этот slice не меняет список на экране,
  source controls, object drafts, payload, backend/API, формулы, persistence
  или CO workflow.
- Этот slice не является `Cable type/source model hook`: не двигать React
  state/effects, feature flag source controls, per-object drafts,
  `normalizeAvailableCableType`, `getCableTypeForObject`, модалки,
  mutations или renderers.

Задача:

- Вынести из `frontend/src/pages/ElecCalcPage.tsx` только:
  `DEFAULT_CABLE_TYPE`, `MVP_CABLE_TYPES`, `FULL_FEATURE_CABLE_TYPES`,
  `isResistiveCableType`.
- Целевой файл:
  `frontend/src/pages/electrical/elecCalcCableTypeModel.ts`.
- Не менять порядок типов, default `self_regulating`, full-version список
  `self_regulating`, `self_regulating_tt`, `single_core`, `three_core`, и
  predicate `single_core|three_core`.
- Добавить focused unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcCableTypeModel.test.ts`.

Definition of Done:

- `ElecCalcPage.tsx` импортирует cable type constants/helpers и не держит
  локальный duplicate-блок этих констант.
- Unit покрывает default type, MVP/full списки и resistive predicate.
- Запущены focused unit + existing pure units + `ElecCalcPage` integration,
  `npm --prefix frontend run typecheck` и `git diff --check`.
- Playwright/screenshots не требуются, если JSX/CSS/visible UI не менялись.

Evidence:

- Unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcCableTypeModel.test.ts`.
- Focused run:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcCableTypeModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCableCatalogModel.test.ts src/__tests__/unit/pages/electrical/elecCalcTableFilterModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCableOptionModel.test.ts src/__tests__/unit/pages/electrical/elecCalcMainTableModel.test.ts src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx` — 89 pass.

## Prompt 6. Вынести layout numeric helpers

Status: Done. Не запускать повторно без нового finding.

Режим `/fix-focused`.
Scope: только чистые numeric/input helpers inline-редактирования параметров
укладки в основной таблице `ElecCalcPage`.

Анализ документа перед выполнением:

- `Prompt 4` прямо отмечает `parseElectricalLayoutNumber`,
  `maxThreadsForCableType`, `pipeOuterDiameterMm`,
  `maxWindingCoefficientForDiameterMm`, `windingCoefficientForPitch` как
  следующий безопасный pure-кандидат.
- Документированный oracle для `maxWindingCoefficientForDiameterMm` находится в
  `docs/tnp/algorithms/winding.md` и `docs/context/formulas-summary.md`:
  граничные точки `75/89/108` трактуются консервативно как включённые в нижний
  диапазон.
- `docs/srs/ui/guest/03-screen-workspace-electrical.md` и
  `docs/api.md` фиксируют, что шаг навива и количество ниток являются
  параметрами укладки SC-04; этот slice не меняет payload, backend, формулы,
  JSX/CSS или сохранение.

Задача:

- Вынести из `frontend/src/pages/ElecCalcPage.tsx` только:
  `ELECTRICAL_LAYOUT_EDITABLE_COLUMNS`, `parseElectricalLayoutNumber`,
  `maxThreadsForCableType`, `pipeOuterDiameterMm`,
  `maxWindingCoefficientForDiameterMm`, `windingCoefficientForPitch`.
- Целевой файл:
  `frontend/src/pages/electrical/elecCalcLayoutModel.ts`.
- Не двигать `handleElectricalGlideCommitCell`, Glide cell state/actions,
  table columns/renderers, mutations, hooks/effects, payload builders,
  backend/API и persistence.
- Не менять тексты ошибок, единицы измерения, rounding поведения,
  ограничения `self_regulating -> 3`, full-version `self_regulating_tt` и
  резистивные типы `-> 100`.
- Добавить focused unit:
  `frontend/src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts`.

Definition of Done:

- `ElecCalcPage.tsx` импортирует layout helpers и не держит локальный
  duplicate-блок layout numeric helpers.
- Unit покрывает editable column set, парсинг `12,5`, пустой/невалидный ввод,
  лимиты ниток по типам кабеля, перевод диаметра трубы м -> мм, boundary
  oracle `57/75/89/108` и формулу `sqrt(1 + (pi * D / pitch)^2)`.
- Запущены:
  `npm --prefix frontend test -- --run src/__tests__/unit/pages/electrical/elecCalcLayoutModel.test.ts src/__tests__/unit/pages/electrical/elecCalcResultValueModel.test.ts src/__tests__/unit/pages/electrical/elecCalcCandidateCompareModel.test.ts src/__tests__/unit/pages/electrical/elecCalcQueryModel.test.ts src/__tests__/integration/pages/ElecCalcPage.test.tsx`
- Запущены `npm --prefix frontend run typecheck` и `git diff --check`.
- Playwright/screenshots не требуются, если JSX/CSS/visible UI не менялись.
