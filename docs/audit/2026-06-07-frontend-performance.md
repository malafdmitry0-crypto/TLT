# Аудит производительности фронтенда

**Дата:** 2026-06-07
**Стек:** React 18 + Vite + TypeScript + Zustand + TanStack Query v5 + antd 5 +
glide-data-grid.
**Метод:** статический анализ (3 параллельных среза: bundle/code-splitting,
re-render hotspots, state/server-state). Код не менялся. Находки сверены с
реальным артефактом `frontend/dist/` и исходниками.
**Контекст:** продолжение `docs/audit/2026-06-07-performance.md`, который оставил
фронтенд с двумя непроверенными зонами — bundle/lazy и re-render в больших
компонентах. Этот документ закрывает обе.

## Резюме

Фронтенд **дисциплинирован**: route-level code-splitting на `React.lazy` для всех
страниц, самая тяжёлая зависимость (`glide-data-grid`) лениво подгружается,
selector-подписки на Zustand почти везде, queryKey централизованы и
мемоизированы, reference-данные кэшируются на 1ч и грузятся лениво, polling
самозавершается. Критических находок нет. Ниже — реальные исключения,
приоритизированные по влиянию.

---

## HIGH

### F1. `dnd-vendor` (≈183 КБ) попадает в initial preload ради модалки настроек колонок
- **Файл:** `frontend/vite.config.ts:29-31`
  ```ts
  if (id.includes('node_modules/@dnd-kit')) {
    return 'dnd-vendor';
  }
  ```
- **Проблема:** ручной `manualChunks` сводит все `@dnd-kit/*` в именованный
  vendor-чанк. `@dnd-kit` используется только в трёх компонентах настроек колонок
  (`ColumnSettingsModal`, `ElectricalColumnSettingsModal`,
  `ElectricalCandidateColumnSettingsModal`), доступных лишь из ленивых маршрутов.
  Но именованный vendor-чанк попадает в граф зависимостей entry → Vite ставит на
  него `<link rel="modulepreload">` в `dist/index.html` и грузит на каждой
  странице, включая HomePage/LoginPage, где DnD не нужен.
- **Влияние:** ≈183 КБ JS качается и парсится на первый рендер ради функции за
  кнопкой «настройки колонок». Усугубляется тем, что две electrical-модалки ещё и
  статически импортированы в `ElecCalcPage` (`pages/ElecCalcPage.tsx:53-54`).
- **Рекомендация:** убрать ветку `@dnd-kit` из `manualChunks` (пусть чанкуется
  естественно со своими ленивыми потребителями) **или** лениво грузить три
  ColumnSettings-модалки (heatcalc-модалка уже ленивая — `HeatCalcPage.tsx:84`).
  Любой вариант выводит `dnd-vendor` из initial preload.

---

## MEDIUM

### F2. Cache-scope ячеек инвалидируется по `rows` целиком — один правленый кабель перерисовывает весь вьюпорт
- **Файл:** `frontend/src/components/heatcalc/HeatCalcNormalGlideGrid.tsx:679-708`
- **Проблема:** `modelCellCacheScope = { getCellState, rows, version, visibleGridColumns }`
  (`:679-684`), и `useEffect` полностью чистит `modelCellCacheRef` при любой смене
  идентичности `rows` (`:686-688`). `rows` меняется на каждой подгрузке страницы,
  на каждом infinite-scroll-append и — главное — на каждом оптимистичном
  `setQueriesData` в `ElecCalcPage` (`setElectricalQueryCalculation`), который
  пересобирает `objects`. Каждая такая смена очищает весь кэш, пересоздаёт
  `getModelCell`/`getCellContent`/`drawCell` → `DataEditor` пересчитывает все
  видимые ячейки, хотя изменилась одна строка.
- **Влияние:** ручной выбор марки кабеля (commit одной ячейки) перерисовывает весь
  видимый вьюпорт вместо одной строки. Целевой путь `invalidateDraftRows`
  (`:709-724`) уже делает точечный `editor.updateCells`, но оптимистичный апдейт
  идёт через смену scope → полную очистку.
- **Рекомендация:** убрать `rows` из идентичности cache-scope (для чтения уже есть
  `rowsRef`, `:673-678`) и инвалидировать по изменённым row id, а не по смене
  ссылки `rows`. Ключ кэша по идентичности `record`/`column` уже частично
  проверяется (`:698`), так что стабильные строки сохранят кэш при частичной
  замене `rows`.

### F3. `editorColumns` / `drawHeader` зависят от всего объекта `tableViewState`
- **Файл:** `HeatCalcNormalGlideGrid.tsx:659-668` (`editorColumns`), `:915-950`
  (`drawHeader`)
  ```ts
  [stretchedColumnWidths, tableViewState, visibleGridColumns]   // editorColumns
  ```
- **Проблема:** `tableViewState` — составной `{ filters, sort }`. Сортировка одной
  колонки или правка фильтра рождают новую ссылку `tableViewState`, и
  `editorColumns` пересобирается целиком (`.map`, N новых объектов колонок), а
  `drawHeader` меняет идентичность — `DataEditor` переоценивает колонки/заголовки,
  даже когда менялся только `sort`, а читается только `filters` (и наоборот).
- **Влияние:** лишние пересборки колонок при каждой смене фильтра/сортировки и
  при hover заголовков.
- **Рекомендация:** сузить deps до реально используемых срезов —
  `[stretchedColumnWidths, tableViewState.filters, visibleGridColumns]` для
  `editorColumns`; для `drawHeader` —
  `[..., tableViewState.filters, tableViewState.sort, ...]`. Если `filters`/`sort`
  пересоздаются выше — мемоизировать их в hook'е view-state.

### F4. `ObjectWizard` перерендеривается на каждый keystroke + `.find` по 539 городам в render
- **Файл:** `frontend/src/components/wizard/ObjectWizard.tsx:124-128`, `:290-296`
  ```ts
  function selectObjectWizardWatchedValues(values = {}) {
    return Object.fromEntries(OBJECT_WIZARD_WATCH_FIELDS.map(...));  // новый объект каждый раз
  }
  ```
- **Проблема:** `Form.useWatch(selectObjectWizardWatchedValues, form)` с
  селектором, возвращающим **новый объект** каждый вызов, отключает встроенный
  bail-out `useWatch` → ре-рендер на каждое изменение любого из 18 watched-полей,
  т.е. практически на каждое нажатие клавиши. На каждом таком рендере без `useMemo`
  считаются `selectedClimate = climateEntries.find(...)` (`:290`, линейный скан до
  539 записей), `selectedSecondInsulation`/`selectedThirdInsulation` (`:295-296`),
  и `climateBasis*` строки (`:232-235`).
- **Влияние:** самый заметный пользователю путь — ввод в форму SC-03;
  539-элементный `.find` на каждый keystroke.
- **Рекомендация:** вернуть стабильную форму результата (или мемоизировать
  селектор); как минимум обернуть `selectedClimate`/`selectedSecond/Third` в
  `useMemo` по `[climateEntries, selectedKey]`, а поиск по 539 городам сделать
  lookup'ом по `Map`, построенному в `useMemo`.

### F5. `ElecCalcElectricalTypeControls` без `React.memo`, пересобирает опции и inline-стили
- **Файл:** `frontend/src/pages/electrical/ElecCalcElectricalTypeControls.tsx`
  (нет `memo`; `connectionOptions` собирается inline `:82-94`; ~10 inline
  `style={{...}}`), рендерится дважды — мемоизированно через `defaultElectricalTypeControls`
  (`ElecCalcPage.tsx:1025-1031`) и немемоизированно через `renderElectricalTypeControls`
  (`ElecCalcPage.tsx:1076-1088`, вызовы `:1380-1381`, `:1482`).
- **Проблема:** каждый `InputNumber.onChange` обновляет `recalc` → новый рендер
  страницы → `renderElectricalTypeControls(...)` строит новое поддерево, а сам
  компонент пересоздаёт `connectionOptions` и inline-стили.
- **Рекомендация:** `export default memo(ElecCalcElectricalTypeControls)`, вынести
  `connectionOptions` и повторяющиеся `style`-литералы в module-level константы,
  превратить `render*`-функции в мемоизированные значения/компоненты.

### F6. Whole-store подписки на `authStore`
- **Файлы:** `frontend/src/hooks/useAuth.ts:10` (`const store = useAuthStore()` +
  `return { ...store }`), `frontend/src/pages/ProjectsPage.tsx:87`
  (`const { user, role } = useAuthStore()`)
- **Проблема:** подписка на весь стор → ре-рендер на любое изменение auth-поля
  (включая refresh access-токена), хотя нужны лишь экшены/`user`/`role`.
- **Влияние:** ограниченное (auth меняется редко), но латентный footgun на тяжёлой
  `ProjectsPage`.
- **Рекомендация:** field-селекторы: `useAuthStore((s) => s.user)` и т.п.; в
  `useAuth` тянуть только нужные экшены, не спредить реактивный state.

---

## LOW

### F7. Статический `heatcalc-fields.default.json` (142 КБ) инлайнится в route-чанк
- **Файл:** `frontend/src/config/heatcalc-fields.default.json` (145 240 байт),
  импорт в `domain/heatCalcFieldRegistry.ts:1` (+ `electrical-fields.default.json`
  17 КБ).
- **Проблема:** 142 КБ инлайнятся в JS как объектные литералы (дороже, чем
  `JSON.parse` фетченной строки) и оседают в route-чанке HeatCalc (≈157 КБ).
  Это статическая таблица описаний полей, не меняется в рантайме.
- **Рекомендация:** отдавать как статический `.json`-ассет, фетчить в рантайме
  (кэш браузера) или вынести резолв реестра на бэкенд. Не срочно.

### F8. Мёртвый код `ObjectCalcCard.tsx` + `CableSelector.tsx` с broad-инвалидацией
- **Файлы:** `frontend/src/components/electrical/ObjectCalcCard.tsx`,
  `.../CableSelector.tsx`
- **Проверено:** `ObjectCalcCard` не импортируется нигде; `CableSelector`
  импортируется только из `ObjectCalcCard`. Оба — мёртвый код. Живой путь выбора
  кабеля — `pages/electrical/useElecCalcCableSelectionMutationFlow.ts:76-77` со
  scoped-инвалидацией. Внутри мёртвого `CableSelector.tsx:32` —
  `invalidateQueries({ queryKey: ['project'] })` (инвалидирует весь namespace).
- **Рекомендация:** удалить оба файла (заодно убирается единственная broad-`['project']`
  инвалидация в дереве). Примечание: фронтовый `CLAUDE.md` ещё описывает их как
  актуальные — обновить при удалении.

### F9. Admin-запросы без `staleTime`
- **Файлы:** `pages/admin/CoefficientsPage.tsx:11`, `UsersPage.tsx:12`,
  `DatabasePage.tsx:139,143`.
- **Проблема:** полагаются на глобальный `staleTime: 30s` → рефетч медленно
  меняющихся справочников каждые 30с при remount (focus-рефетч глобально выключен).
- **Рекомендация:** задать `staleTime` ~5 мин. Admin-only, низкий трафик.

### F10. `projectStore` без `partialize`
- **Файл:** `frontend/src/store/projectStore.ts:38-58` — в localStorage пишется
  весь серверный `Project` на каждый `setCurrentProject` (есть version+migrate, но
  нет `partialize`). Сейчас payload мал → ок; при росте `Project` добавить
  `partialize`.

---

## Проверено и чисто

- **Route-level splitting** — все 17 страниц + layout'ы через `React.lazy` под
  одним `<Suspense>` (`routes/index.tsx:7-31`). В initial bundle страниц нет.
- **`glide-data-grid` (самая тяжёлая, ≈248 КБ + CSS)** — лениво везде
  (`HeatCalcObjectsTableCard.tsx:24-25`, `ElecCalcPage.tsx:148`,
  `ElecCalcCandidateTablePanel.tsx:19`); CSS в отдельном ленивом чанке.
- **`@ant-design/icons`** — только named-импорты, без barrel/полного набора.
  `import *` в `src/` — 0.
- **`ObjectWizard`** — ленивый (`heatCalcObjectWizardLoader.ts`); reference-`useMemo`
  с корректными deps; нет sourcemap в prod-`dist`.
- **`HeatCalcNormalGlideGrid`** — обёрнут в `memo` (`:1264`); `rowsRef`/
  `rowIndexByIdRef`/`visibleGridColumnsRef` держат `invalidateDraftRows`
  стабильным; точечная инвалидация (`:709-728`) сделана хорошо.
- **`ElecCalcPage`/`HeatCalcPage`** — логика декомпозирована в ~40 хуков с
  мемоизацией; `recalc`/`setRecalc` стабильны; крупные `useMemo`
  (`buildElecCalcSummaryViewModel`, `cableTypeOptions` и т.д.) с tight-deps.
- **Zustand selector-дисциплина** — почти все потребители читают примитивы
  через field-селекторы; объект/массив-возвращающих селекторов нет → `useShallow`
  не нужен (его отсутствие корректно).
- **queryKey стабильность** — централизованы (`api/referenceQueries.ts`);
  динамические ключи в `useMemo` + структурный хэш TanStack → нет churn.
- **Reference-кэш** — `staleTime 1ч / gcTime 6ч`; climate (539) лениво через
  `enabled`.
- **Polling** — всё через `utils/calcJobPolling.ts`, `false` при неактивной
  задаче, 15с в фоне → самозавершается.
- **Инвалидация на горячих путях** (inline edit, live cable-select) — узко
  scoped; broad-инвалидация только в мёртвом коде (F8).
- **Пагинация** — object/electrical таблицы на серверной keyset-пагинации с
  `placeholderData: keepPrevious`.

---

## Приоритеты

1. **F1 (HIGH)** — убрать `@dnd-kit` из `manualChunks` или лениво грузить
   ColumnSettings-модалки. Один изолированный фикс, −183 КБ из initial preload.
2. **F2 (MEDIUM)** — не чистить cache-scope по `rows`; инвалидировать по row id.
   Наибольший выигрыш в electrical-гриде при оптимистичных правках.
3. **F4 (MEDIUM)** — стабилизировать `useWatch`-селектор и `Map`-lookup климата;
   самый видимый путь при наборе в форме.
4. **F3, F5, F6 (MEDIUM)** — сужение deps / `memo` / field-селекторы.
5. **F7–F10 (LOW)** — опциональное упрочнение; F8 (удалить мёртвый код) — дешёвый
   побочный выигрыш.
