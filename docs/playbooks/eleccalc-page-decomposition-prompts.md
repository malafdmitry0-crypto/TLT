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
| Main table render/copy characterization | Backlog | cable mark/status/layout/commerce copy values |
| Candidate table render/copy characterization | Backlog | apply/actions, TT duplicate marks, comparison diff |
| Main table state hook | Backlog | page/filter/sort/cursor state, hidden-column cleanup |
| Candidate table state hook | Backlog | local filter/sort/marked comparison state |
| Preferences/settings hook | Backlog | main/candidate columns, view settings, role cache |
| Cable type/source model hook | Backlog | feature flag, built-in/extended/all, object drafts |
| Batch job/recalc model hook | Backlog | active job polling, selected/all scope, overwrite manual |
| Cable mark modal model hook | Backlog | manual mark, source option, save-to-CO variants |
| Candidate sizing modal model hook | Backlog | auto/manual candidate creation, apply, reload |
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

Safe next pure candidates, but only with focused unit tests:

| Группа | Helpers/constants | Почему безопасно | Рекомендуемый target |
|---|---|---|---|
| Main electrical value/display model | `finiteNumber`, `valueText`, `numberText`, `powerText`, `resultNumber`, `objectResultNumber`, `cablePowerPerMeterValue`, `installedPowerPerMeterValue`, `orderCableLengthValue`, `commercialValue`, `commercialNumber`, `selectionPolicyText` | Pure formatting/extraction, no React state/effects, no backend calls. Used by main table render/copy and summary. | `frontend/src/pages/electrical/elecCalcResultValueModel.ts` |
| Main calculation status/source helpers | `getCableMark`, `currentElectricalCalc`, `getCableMarkSource`, `getThreadSource`, `threadSourceTag`, `calcLayoutValues` | Pure mapping from `ElectricalCalcSummary`; affects labels/status badges, so must characterize text output. | Same result value model or `elecCalcResultStatusModel.ts` |
| Layout numeric helpers | `parseElectricalLayoutNumber`, `maxThreadsForCableType`, `pipeOuterDiameterMm`, `maxWindingCoefficientForDiameterMm`, `windingCoefficientForPitch` | Pure numeric/input helpers; no API calls. Need boundary tests because they constrain editable layout cells. | `frontend/src/pages/electrical/elecCalcLayoutModel.ts` |
| Cable mark/source option helpers | `normalizeCableSource`, `normalizeCableMarkOptionSource`, `cableMarkOptionValue`, `catalogSourceFromSnapshot`, `externalCableOptionLabelSource` | Pure option/source mapping. Safe only with tests for project/builtin/commercial/extended/all encoding and snapshot fallback. | `frontend/src/pages/electrical/elecCalcCableOptionModel.ts` |
| Cable catalog status helpers | `hasCommercialData`, `commercialStatus`, `hasValue`, `hasTechnicalData`, `technicalStatus`, `cableSnapshotRow` | Pure catalog row analysis. Needs tests for TLT/TT/resistive completeness and commercial status labels. | `frontend/src/pages/electrical/elecCalcCableCatalogModel.ts` |
| Candidate folder keys | `candidateCustomFolderKey`, `candidateCustomFolderId` | Pure string helpers, but better move together with candidate folders model to avoid tiny low-value module. | Future `useElecCalcCandidateFolders.ts` |
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
