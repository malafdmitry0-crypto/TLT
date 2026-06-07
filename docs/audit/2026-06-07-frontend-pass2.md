# Аудит фронтенда — второй проход

**Дата:** 2026-06-07 (повторный аудит после фиксов ErrorBoundary + Skeleton)
**Стек:** React 18.3 + Vite 8 + TS 5.9 + AntD 5.29 + Zustand 4.5 + TanStack Query 5.99 + Axios 1.15
**Масштаб:** ~44 577 строк в `src` (+167 к первому проходу).
**Метод:** статический анализ, код не менялся. Первый проход: `2026-06-07-frontend.md`.

## Сводные числа

| Метрика | 1-й проход | 2-й проход |
|---|---|---|
| Unit/integration тест-файлов / `it()`-блоков | 166 / ~907 | **168 / ~912** |
| E2E spec / тестов | 21 / ~94 | **21 / 92** |
| `: any` / `as any` / `@ts-ignore` (прод) | 0 / 0 / 0 | **0 / 0 / 0** |
| `as unknown as` (прод / тесты) | 9 / — | **9 / 14** |
| ARIA-атрибутов | 272 | **283** |
| `useQuery` / `invalidateQueries` | 75 / — | **100 / 51** |
| ErrorBoundary / Skeleton | 0 / 0 | **есть / есть** |

Тип-дисциплина **не деградировала** при росте кодовой базы: 0 `any`/`ts-ignore`/`eslint-disable`/`console` в проде.

---

## РАЗДЕЛ 1 — Статус прошлых находок

| Находка | Статус | Доказательство |
|---|---|---|
| ВЫСОКАЯ: нет ErrorBoundary | ✅ **CLOSED** | `ErrorBoundary.tsx` (классовый), корень `App.tsx:12` + `RouteErrorBoundary` в `MainLayout.tsx:83`/`AdminLayout.tsx:48`, сброс по `location.pathname`, телеметрия `frontend.render.error_boundary`, тест (4 кейса). |
| СРЕДНЯЯ: нет Skeleton | ✅ **CLOSED** | `PageSkeleton.tsx` (Suspense-fallback), `ReportPage.tsx:209`, `SpecificationPage.tsx:267`, `LoadingSpinner` удалён, тест (2 кейса). |
| СРЕДНЯЯ: `as unknown as` (9) | ⏳ STILL-OPEN | Те же 9 в проде (`ObjectWizard`×2, `ConfirmStep`×2, `heatCalcInlineEdit`×2, `EditableTableCell`, `HeatCalcGlideGrid`, `useHeatCalcTableColumns`). Риск снижен ErrorBoundary. |
| СРЕДНЯЯ: `frontend/CLAUDE.md` рассинхрон | ⏳ STILL-OPEN (ухудшился) | Заявлены `xlsx`/`RHF`/`Zod`/`LoadingSpinner` — 0 импортов; не упомянуты новые `ErrorBoundary`/`PageSkeleton`. |
| НИЗКАЯ: дублирование таблиц | ⏳ STILL-OPEN (выросло) | 3× ColumnSettingsModal = 1775 строк; 4× GlideGrid = 2544 строки (~4300 зеркальной инфраструктуры). |
| НИЗКАЯ: нет undo | ⏳ STILL-OPEN | Только forward-защита (`Popconfirm`/`Modal.confirm`). |
| НИЗКАЯ: i18n невозможен | ⏳ STILL-OPEN (by design) | 0 i18n-библиотек, `locale={ruRU}`. |
| НИЗКАЯ: `getCableOptions: Promise<unknown[]>` | ⏳ STILL-OPEN | `calculations.ts:44`. |
| НИЗКАЯ: a11y-gate только critical/serious | ⏳ STILL-OPEN | `accessibility.spec.ts:38`. |
| НИЗКАЯ: два канала фидбека | ⏳ STILL-OPEN | 118 `message/notification` + 11 `<Alert>`. |

---

## РАЗДЕЛ 2 — Сильные стороны

1. **ErrorBoundary сделан образцово** — три уровня (корень + route-scoped в обоих layout'ах), сброс по `location.pathname` (`componentDidUpdate`), recoverable `Result`, dev-текст, телеметрия. Каркас переживает ошибку страницы.
2. **Тип-дисциплина без эрозии** — +167 строк, +25 запросов, всё ещё 0 `any`/`ts-ignore`/`console`. `tsconfig`: `strict`+`noUnusedLocals`+`noUnusedParameters`+`noFallthroughCasesInSwitch`.
3. **Зрелый QueryClient + чёткая граница state** — `retry:1`, `refetchOnWindowFocus:false`, `staleTime:30s`; Zustand-сторы крошечные (177 строк суммарно), 51 точечная `invalidateQueries` без глобального `clear()`.
4. **Оркестраторный паттерн крупных файлов** — `ElecCalcPage` (1596) держит 4 `useState`, `FormulasPage` (1475) — 4. Логика в feature-хуках/registry.
5. **Дисциплина мутаций на ошибки** — **88** `onError` в `useMutation` (вне тестов): провалы сохранения/batch/импорта дают `message.error`.
6. **a11y проверяется в CI** — axe-gate (`wcag2a/2aa/21a/21aa`) на двух вьюпортах + `auditKeyboardFocus` (Tab до 35 раз).
7. **Полный code-splitting** — все 19 lazy-страниц, единый `<PageSkeleton/>` fallback.

---

## РАЗДЕЛ 3 — Слабые стороны (по серьёзности)

### ✅ СРЕДНЯЯ — NEW — Ошибки чтения (`useQuery`) не доходят до пользователя — ИСПРАВЛЕНО (2026-06-07)
**Закрыто.** Добавлен переиспользуемый `components/common/QueryError.tsx` (AntD
`Alert type="error"` + кнопка «Повторить» → `refetch`, сообщение через новый
`extractApiErrorMessage` из `api/client.ts`). Подключён в ключевые точки чтения:
`ReportPage` (предпросмотр), `ReportWizardPage` (мастер, заодно текстовый
«Загрузка…» заменён на Skeleton), `SpecificationPage`, `ProjectsPage` (список).
Теперь провал GET показывает причину и retry вместо пустой области. Покрыто
`QueryError.test.tsx` (4 кейса). *Остаток: справочники в admin/референс-пикерах
ещё без явной ветки — можно дотянуть тем же компонентом при необходимости.*

### ✅ СРЕДНЯЯ — NEW — Persist-сторы без `version`/`migrate` — ИСПРАВЛЕНО (2026-06-07)
**Закрыто.** `projectStore` получил `version: 1` + `migrate` с валидатором формы
`isValidProjectSnapshot` — несовместимый/устаревший снимок `currentProject`
отбрасывается в `null` вместо рендера с отсутствующими ключами.
`calculationVariantStore` получил `version: 1` + `migrate`, прогоняющий карту
`projectId→variant` через `normalizeCalculationVariant`. Покрыто тестами migrate
в `projectStore.test.ts` (valid сохраняется, stale/garbage/empty → null).

### 🟠 СРЕДНЯЯ — NEW — a11y-gate и route-boundary не покрывают admin/report-wizard
- `accessibility.spec.ts` покрывает public + guest workspace + employee/projects, но **не** admin-страницы (`users/coefficients/database/references/formulas`) и **не** `ReportWizardPage`. При этом `FormulasPage` (1475 строк) — самый сложный экран.
- **Standalone-маршруты** (`ReportWizardPage`, `Home`, `Login`, `help/*`) вне `MainLayout`/`AdminLayout` → защищены **только корневым** ErrorBoundary (нет route-scoped). Не белый экран, но ошибка заменяет весь вьюпорт; для тяжёлого `ReportWizardPage` стоило бы своя граница.

### 🟡 НИЗКАЯ — NEW — Корневой ErrorBoundary без `resetKey`
`App.tsx:12` — корневой boundary без `resetKey`: если ловит именно он (сбой lazy-чанка/роутера), навигация не сбросит, «Попробовать снова» повторит тот же импорт — реально поможет только reload. Для последнего рубежа приемлемо, но стоит знать.

### 🟡 НИЗКАЯ — NEW — `ReportWizardPage` всё ещё текстовый «Загрузка предпросмотра…»
`ReportWizardPage.tsx:307` — голый `<Paragraph>` вместо `Skeleton`, которым уже снабжены `ReportPage`/`SpecificationPage`. Единственный оставшийся «текстовый флэш» загрузки — непоследовательно с новым паттерном.

### 🟡 НИЗКАЯ — NEW — `useFocusableTableScrollRegions.ts` без теста
a11y focus-management хук (WCAG 2.1.1, `tabIndex`+`aria-label` на `.ant-table-body`, MutationObserver) изменён, но dedicated unit-теста нет.

### 🟡 НИЗКАЯ — STILL-OPEN
- `as unknown as` в проде (9) — двойной каст глушит компилятор на границе форма→`PipeFormValues`/`TankFormValues`.
- Дублирование grid/column-settings (~4300 строк зеркальной инфраструктуры heatcalc↔electrical).
- `getCableOptions: Promise<unknown[]>` (`calculations.ts:44`) — единственный нетипизированный ответ.
- Нет undo деструктивных операций.
- a11y-gate пропускает `moderate`/`minor` (контраст `#1a5276`/`#2e86c1` без явного теста).
- Два канала фидбека без явной политики «toast vs inline».
- `frontend/CLAUDE.md` рассинхрон (заявлены отсутствующие пакеты).
- `dompurify 3.4.0→3.4.8` — подтянуть как security-чувствительный (санитайзер отчётов).

---

## Итог

Обе высокоприоритетные находки первого прохода **закрыты качественно** (ErrorBoundary трёхуровневый с recovery+телеметрией+тестами; Skeleton с `aria-busy`). Тесты подросли (166→168 файлов).

**Новый главный пробел — обработка ошибок чтения (`useQuery`):** мутации защищены (88 `onError`), но провал GET-запроса нигде, кроме `ObjectWizard`, не доводится до пользователя — пустой экран без сообщения и retry. ErrorBoundary это не ловит. Это **#1 на доработку**.

**Приоритет:**
1. `isError`-ветки для query (отчёты, спецификация, списки) — **самое важное**.
2. Persist-сторы: `version`/`migrate` или персистить только `project.id`.
3. Расширить a11y-gate / route-boundary на admin и report-wizard.
4. `ReportWizardPage` → skeleton; тест для `useFocusableTableScrollRegions`.
5. Синхронизировать `frontend/CLAUDE.md`; типизировать `getCableOptions`.
