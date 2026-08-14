# Client feedback 09–20 — план исправлений по слайсам

**Статус:** PROPOSED implementation package, не ACTIVE-очередь.

**Дата:** 2026-08-14

**Промпты:** [`prompts.md`](./prompts.md)

**Динамические результаты прогонов:** только `snapshot.md`, который создаёт
финальный слайс CFB-AF. Этот plan не хранит меняющиеся totals и timings.

Единственная ACTIVE frontend-очередь остаётся в
[`docs/frontend/refactor-backlog.md`](../../frontend/refactor-backlog.md).
Этот пакет не добавляет туда `pending`, не меняет её статусы и запускается
только по явному выбору пользователя. Один запуск — один слайс и один commit.

## Цель

Закрыть подтверждённые дефекты обратной связи №9–20 без объединения разных
владельцев в один широкий patch:

- восстановить конечный workflow формирования спецификации;
- отделить машинные диагностические коды от пользовательского текста;
- перестать молча подменять введённые числовые значения;
- выполнить задокументированный all-or-nothing контракт групповой правки;
- сделать `PUT` коэффициента операцией обновления, а не скрытым create;
- сохранить намеренный `persist-invalid` контракт одиночного объекта.

## Проверенный смысл пунктов

| Пункт | Текущий факт | Плановое решение |
|---|---|---|
| 9 | После rehydrate запрос теряет `L_K2i_m` и `R_gr`, получает 422 | CFB-01 хранит полный pending context и даёт безопасный fallback |
| 10–11 | Ant InputNumber молча clamp-ит значение к `min`/`max` | CFB-07/08 вводят opt-in non-clamping draft и показывают domain message |
| 12 | Невалидный объект сохраняется намеренно, но виден `wall_thickness` | CFB-09 локализует field path и объяснение; persist не меняется |
| 13 | Пустая толщина изоляции блокируется локально, сервер не вызывается | Production не менять; оставить regression guard |
| 14 | Confirm отправляет `catalog_selections: {}` и возвращает выбор по кругу | CFB-02 переносит selections через весь pending command |
| 15 | Кнопка отправляет POST, но пустой ЭР сначала получает чужой confirm state | CFB-03 исправляет backend precedence, CFB-04 — UI routing |
| 16–17 | Видны mixed-language message, `Backend` и `SPEC_*` | CFB-05a/05b оставляют коды машинным контрактом, но не пользовательским текстом |
| 18 | Одна модалка получает diagnostics от разных статусов | CFB-04 строит UI state по status/result, а не по общему `unresolved` |
| 19 | UI сейчас clamp-ит, но API сохраняет `999` и отвечает 200 | CFB-06 делает backend all-or-nothing; CFB-08 добавляет ранний UI feedback |
| 20 | Текущий UI не редактирует key, но update endpoint создаёт новый key | CFB-10 разделяет update и create semantics |

## Принятые продуктовые и технические решения

### Спецификация

1. ЭР без единого contributing electrical result не может сформировать BOM.
   Это `blocked` с понятным переходом к электрорасчёту, а не подтверждение
   исключения всех объектов.
2. Если contributing result есть, неназначенные объекты можно подтвердить,
   исключить и сформировать оставшуюся часть.
3. `SPEC_*` остаются API-кодами для ветвления и тестов, но не выводятся в DOM.
4. `selection_required`, `confirmation_required`, `blocked` и `generated` —
   разные состояния. Текст одной модалки не переиспользуется для другого.
5. Полный pending command — `variantIds + options + catalogSelections`.
   Подтверждение меняет только `excludeUnassignedConfirmed`.
6. Не вводить `generation_options` в `SpecificationResponse` и новую колонку
   БД: действующие OpenAPI/migration contracts явно исключают это поле.
   Same-tab navigation и F5 восстанавливают versioned session context,
   scoped по project + ER. Если context отсутствует или повреждён, UI просит
   заново подтвердить настройки и не отправляет неполный запрос.

### Тепловые поля

1. Одиночный create/update сохраняет formula-invalid объект с
   `is_valid=false`, `results=null` и structured `validation_errors`. Пункт 12
   не меняет этот контракт.
2. Пустое обязательное поле остаётся локальной ошибкой «Укажите значение» и
   не отправляется. Пункт 13 — guard, не production change.
3. Значение ниже/выше диапазона остаётся видимым draft до исправления. UI
   показывает существующий канонический текст:
   `Минимальное значение — X` / `Максимальное значение — X`.
4. Групповая операция строже одиночного persist: согласно route contract она
   атомарна. Любой несовместимый объект даёт 422, ни один объект/версия не
   изменяется.
5. Диапазоны и зависимости не дублируются в UI/API route: используется
   существующий field/domain и heat-loss application contract.

### Коэффициенты

1. `PUT /admin/coefficients/{key}` обновляет только существующую запись.
2. Неизвестный key возвращает 404 и не меняет количество строк.
3. Создание остаётся отдельной service-operation; новый публичный POST не
   добавляется без отдельного продуктового запроса.

### UI proof

Поддерживается только desktop viewport `>=1000 px`. Mobile/tablet не входят в
acceptance согласно [`viewport-policy.md`](../../frontend/viewport-policy.md).
Для Specification и Heat используются `1000×768`, `1280×800`, `1440×900`;
для modal/state-routing дополнительно `1920×1080`, если меняется размещение.

## Порядок и зависимости

| Слайс | Owner | Пункты | Результат | Зависит от |
|---|---|---:|---|---|
| CFB-00 | qa | proof | Актуальный Case 1 E2E снова достигает spec settings | — |
| CFB-01 | specification | 9 | Полный pending context переживает route/F5 либо безопасно требует настройки | CFB-00 |
| CFB-02 | specification | 14 | Catalog selection не теряется при confirm; partial BOM завершается | CFB-01 |
| CFB-03 | specification | 15 | Backend: zero-contributing ЭР сразу `blocked`; partial ЭР остаётся confirmable | — |
| CFB-04 | specification | 15, 18 | Frontend: outcome reducer открывает только соответствующее состояние | CFB-02, CFB-03 |
| CFB-05a | specification | 16, 17 | Generation diagnostics полностью русские, raw codes скрыты | CFB-04 |
| CFB-05b | specification | 17 | Остаточный user-facing `Backend` удалён из readiness/catalog copy | CFB-05a |
| CFB-06 | heat | 19 | Backend group update валидируется до commit и возвращает атомарный 422 | — |
| CFB-07 | ui | 10, 11 | TltNumberField получает opt-in non-clamping draft contract | — |
| CFB-08 | heat | 10, 11, 19 | Frontend form/group modal показывают min/max и не отправляют invalid draft | CFB-06, CFB-07 |
| CFB-09 | heat | 12, 13 | Frontend показывает human labels; blank-field guard сохранён | CFB-08 |
| CFB-10 | admin | 20 | Backend PUT unknown key → 404, скрытого create нет | — |
| CFB-AF | qa/docs | 9–20 | Сведённый regression proof и датированный snapshot | все выбранные CFB |

Рекомендуемая последовательность:

```text
CFB-00 → CFB-01 → CFB-02 ─┐
                           ├→ CFB-04 → CFB-05a → CFB-05b
CFB-03 ────────────────────┘

CFB-06 ─┐
        ├→ CFB-08 → CFB-09
CFB-07 ─┘

CFB-10 (independent)
все завершённые ветки → CFB-AF
```

CFB-03, CFB-06, CFB-07 и CFB-10 независимы и могут выполняться в любом
порядке, но не в одном agent run/commit.

## Контракты слайсов

### CFB-00 — восстановить E2E proof

- Production не менять.
- Обновить stale locator в
  `e2e/tests/specification-case1-demo-catalog.spec.ts`: current Ex/K controls
  являются button groups, не combobox.
- Тест обязан дойти до реального generate/candidate flow, а не просто перестать
  падать на locator.
- `specification-readiness-recovery.spec.ts` остаётся зелёным consumer guard.

### CFB-01 — pending context после route/F5

- Characterization сначала воспроизводит полный request body после ухода на
  другой ЭР/route и возврата.
- Ввести feature-owned, versioned session adapter без Zustand/global store.
- Context валидируется при чтении и изолирован project + ER.
- При отсутствии context candidate groups можно показать, но Apply не должен
  отправлять defaults без обязательных numeric options; пользователь получает
  действие «Открыть настройки».
- `useSpecificationPageModel.ts` уже выше preferred cap: slice не увеличивает
  его, а выносит pending-context logic в pure/helper owner.

### CFB-02 — selections через confirmation

- Один pending type владеет options и catalog selections.
- Request sequence фиксируется тестом:
  selection request → confirmation request → generated.
- Финальный request содержит одновременно selected group, исходные options и
  `exclude_unassigned_confirmed=true`.
- Явная отмена не считается generated и не очищает server outcome.

### CFB-03 — backend precedence для пустого ЭР

- При `contributing_objects == 0` результат `blocked` /
  `SPEC_VARIANT_NOT_READY`, даже если все объекты unassigned.
- При `contributing_objects > 0` плюс unassigned остаётся
  `confirmation_required`.
- Формулы, candidate selection и BOM aggregation не меняются.
- Copy не правится в этом слайсе: только status/code/precedence.

### CFB-04 — state-driven Specification UI

- Вынести pure outcome reducer/selector.
- Selection UI строится только из `selection_required` results.
- Confirm modal строится только из `confirmation_required` diagnostics.
- `blocked` закрывает confirm modal и показывает blocker отдельно.
- Для multi-ER mixed results summary группируется по ER; чужой diagnostic не
  попадает под заголовок про неназначенные объекты.
- Если backend mixed-status contract не покрыт тестами и требует нового
  product choice, STOP с `FILE / EVIDENCE / DECISION NEEDED`.

### CFB-05a — generation diagnostics без технического текста

- API codes сохраняются.
- Из generation settings/modal DOM убрать raw `SPEC_*` и слово `Backend`.
- Из backend убрать literal `contributing electrical results`.
- Для известных codes дать русский actionable copy; неизвестный code не
  выводить, использовать безопасное общее сообщение.
- Не менять routing/status logic из CFB-04.

### CFB-05b — остаточный Specification copy cleanup

- Удалить user-facing `backend` из readiness hint и catalog fallback.
- Не менять diagnostic reducer/presentation из CFB-05a.
- Смысл readiness и auto-catalog behavior сохранить; меняется только copy.

### CFB-06 — атомарная групповая правка

- Использовать canonical normalization/heat validation, не hardcoded ranges.
- Собрать problems для всех несовместимых объектов до commit.
- При проблеме: 422, rollback, прежние params/version/results у всех строк.
- При успехе: существующий recalc, stale propagation и audit сохраняются.
- Одиночные create/update persist-invalid не менять.

### CFB-07 — opt-in number draft в UI-kit

- Добавить в `TltNumberField` явный prop, управляющий Ant `changeOnBlur` /
  clamp behavior; имя должно описывать публичное поведение.
- Default сохраняет поведение остальных consumers.
- Opt-in сохраняет typed out-of-range display и отдаёт введённое значение
  наружу, чтобы domain validator мог показать ошибку.
- Проверить decimal comma, clear, Enter, min/max boundary и a11y.
- Heat consumer не менять в этом слайсе.

### CFB-08 — Heat range feedback

- Form fields и group modal opt-in в non-clamping mode.
- Ниже min / выше max: красный field, canonical message, mutation не вызвана.
- Ровно min/max и обычное значение отправляются без преобразования.
- Group modal использует тот же domain validator; Apply disabled/blocked при
  invalid draft.
- Excel mode/inline edit не расширять без доказанного общего owner.

### CFB-09 — human labels для structured Heat errors

- Нормализовать backend storage paths (`wall_thickness`) в canonical UI field
  id/label (`Толщина стенки`) в одном pure mapping.
- Показывать backend structured message, не добавляя raw field id.
- D = 2 × wall остаётся persisted invalid и подсвечивает поле.
- Очистка толщины изоляции остаётся локальной required-error без POST.
- Формулу и backend persist contract не менять.

### CFB-10 — update-only коэффициент

- Разделить service methods create/update; убрать upsert из PUT path.
- Missing key: 404, без insert/commit/cache invalidation/audit success.
- Existing key: значение обновлено, cache invalidated, audit записан.
- Current frontend key column остаётся read-only.

### CFB-AF — финальная регрессия

- Production не менять.
- Создать `snapshot.md`: HEAD, UTC, environment, выполненные команды и точные
  PASS/FAIL/NOT RUN.
- Снять browser evidence для affected desktop states и проверить geometry,
  focus, console и failed requests.
- Не исправлять найденный новый defect внутри AF; вернуть его владельцу новым
  отдельным slice.

## Инварианты всей инициативы

- Один слайс, owner и commit за запуск.
- Characterization first; существующие assertions не ослаблять.
- ER UUID, routes, query keys и cache invalidation не менять без явного scope.
- Формулы, units, ranges и candidate selection rules не менять.
- Generated BOM и catalog quantities не меняются за пределами корректного
  исключения unassigned объектов.
- Single-object persist-invalid остаётся 201/200.
- Group update становится 422 all-or-nothing, как обещает route contract.
- `SPEC_*` не удаляются из API и не заменяются разбором текста.
- Не добавлять mobile CSS/proof; viewport ниже 1000 px — N/A.
- Не менять `docs/frontend/refactor-backlog.md`.
- Не трогать чужой WIP и не использовать `git add .`.
- Незапущенная проверка — `NOT RUN`, не green.

## Критерий закрытия

1. Сценарий №9 после route/F5 либо успешно продолжает сохранённый request,
   либо явно требует заполнить настройки; 422-dead-end невозможен.
2. Partial ER формирует BOM после одного catalog selection и одного confirm.
3. Empty ER не показывает unassigned-confirm как путь к пустому BOM.
4. Каждая Specification modal/alert соответствует своему machine status.
5. Пользователь не видит `Backend`, `SPEC_*`, `wall_thickness` и английские
   фрагменты диагностик.
6. Out-of-range draft не clamp-ится молча и не отправляется.
7. Group update invalid value отвечает 422 и не меняет ни одной строки.
8. PUT неизвестного коэффициента отвечает 404 и не создаёт строку.
9. Пункт 13 остаётся зелёным без production change.
10. CFB-AF фиксирует только реально выполненные proof-команды.

## Общие команды proof

Frontend scope/proof определяется из фактического diff:

```text
cd frontend
npm run agent:scope -- <каждый production path>
npm run agent:scope -- --changed --json
npm run agent:proof-run -- --changed
npm run agent:proof-check -- --changed
```

Полный `test:agent-dod:dual-safe` локально не запускается без отдельного
прямого запроса пользователя.

Focused backend запускается в актуальном контейнере:

```text
docker exec -e SECRET_KEY=codex-test-secret-key-at-least-32-chars \
  -w /app heatcalc_backend pytest <точные test paths/nodeids> \
  -q --tb=line --no-cov
```

E2E запускается только из `e2e/`:

```text
cd e2e
PLAYWRIGHT_CHROMIUM_CHANNEL=chrome \
E2E_BASE_URL=http://127.0.0.1:3003 \
  npx playwright test <точные specs> --reporter=list
```

## NEXT

Первый рекомендуемый запуск — CFB-00. После зелёного proof начать CFB-01.
Это рекомендация внутри явно выбранной инициативы, а не новый `pending` в
ACTIVE frontend backlog.
