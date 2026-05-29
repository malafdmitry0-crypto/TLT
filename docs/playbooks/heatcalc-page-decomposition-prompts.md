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

Status: `useHeatCalcTableState` Done; `useHeatCalcPreferences` Done; `useHeatCalcColumnSettingsDialog` Done; `HeatCalcToolbar` implemented and awaiting focused heat e2e rerun.
Не начинать toolbar или objects table extraction в том же запуске.

После стабилизации helpers/UI вынеси состояние таблицы в hooks.

Требования:

- Отдельно `useHeatCalcTableState`.
- Отдельно `useHeatCalcPreferences`.
- Сначала покрыть сценарии переключения `pipe/tank/all`, фильтров и сброса фильтров.
