# Стандарт agent-friendly разработки frontend TLT

**Статус:** нормативный

**Актуально на:** 2026-07-24

**Стек:** React 18, TypeScript, Vite, Ant Design, TanStack Query, Zustand,
Vitest, Testing Library, Playwright.

Этот документ определяет постоянные правила для людей и coding agents. Он
описывает не конкретный этап рефакторинга, а способ безопасно выполнять любые
следующие frontend-изменения.

## 1. Иерархия источников

При противоречии применяй источник выше:

```text
1. Запрос пользователя и системные инструкции
2. Runtime-код, типы, API-контракты и исполняемые тесты
3. frontend/AGENTS.md
4. Этот стандарт
5. refactor-backlog.md
6. Актуальные тематические справочники
7. docs/frontend/archive/ — только исторический контекст
```

Старые метрики и планы не являются доказательством текущего состояния. Перед
slice пересчитывай LOC, зависимости и тестовый baseline.

### 1.1 Единый источник очереди и метрик

- Одновременно может существовать **только одна** ACTIVE frontend-очередь:
  [refactor-backlog.md](./refactor-backlog.md).
- Initiative plans, archive summaries и audit snapshots **не** маршрутизируют
  `pending` и не могут объявлять `COMPLETE`, пока backlog содержит pending
  acceptance той же residual-работы.
- Нормативные документы (`AGENTS.md`, этот стандарт, PR budget, тематические
  справочники) хранят **правила**, а не быстро устаревающие счётчики.
- Динамические метрики (LOC, baseline totals, timing, scores) живут только в
  датированных `docs/audit/YYYY-MM-DD-*/` snapshot. Новый snapshot создаётся
  заново; старые числа не «подправляются» ради зелёного вида.
- В snapshot обязательны: HEAD commit, команды проверки, время (UTC) и среда
  запуска. Незапущенные проверки нельзя выдавать за green.
- Две разные «текущие» оценки одной инициативы запрещены. Если оценка нужна,
  она пересчитывается в audit и не копируется в backlog/стандарт как норматив.

## 2. Единица работы

Один запуск агента выполняет один **vertical slice**:

- один feature-owner и одна причина изменения;
- один наблюдаемый результат;
- characterization до production-изменения;
- focused proof и полный gate;
- удаление заменённого дубля;
- отчёт с остаточным риском.

Feature-owner выбирается по реальному владельцу поведения; допустимые значения
перечислены в `pr-budget.md`. Не объединяй независимые owner-зоны ради удобства.

### Жёсткий budget

Числовые пределы и классификация feature-owner заданы только в
[pr-budget.md](./pr-budget.md). Если безопасное изменение не помещается в этот
контракт, раздели его и выполни только первый самостоятельно проверяемый slice.
Не копируй лимиты в task prompt и не повышай их постфактум.

## 3. Целевая архитектура

Сохраняем текущие feature-зоны; массовый перенос в `src/features/` не является
целью:

```text
pages/heatcalc/
pages/electrical/
pages/specification/
components/ui-kit/
domain/
api/
store/
```

Предпочтительный поток:

```text
route/page shell
  → feature workflow/controller
    → pure model
    → feature API/query
  → UI-kit / presentational view
```

Правила границ:

- page shell собирает сценарий, но не хранит бизнес-алгоритм;
- pure model не импортирует React, Ant Design, router, store или HTTP;
- presentational view принимает данные и события: `props-in / events-out`;
- `api/` владеет HTTP, нормализацией и query keys, но не layout;
- UI-kit не импортирует feature/domain/store/API;
- shared-код появляется только после доказанного независимого повторения;
- новые cross-feature deep imports запрещены;
- существующие исключения уменьшаются через ratchet по одному edge;
- публичные feature entrypoints вводятся постепенно, без массового move.

### Владение состоянием

| Состояние | Владелец |
|---|---|
| Server/cache | TanStack Query |
| Межэкранное клиентское | Zustand, только при реальной необходимости |
| Локальное UI/workflow | feature hook, reducer или component |
| Производное значение | pure selector/model, не дублируемый state |

Сохраняй cache keys, invalidation, cancellation, race behavior и порядок
авторитетности server/client state.

## 4. Размер и понятность

Ориентиры для нового кода:

| Артефакт | Предпочтительно | Hard cap |
|---|---:|---:|
| Pure model | ≤200 LOC | 300 |
| UI component | ≤200 LOC | 300 |
| Workflow/hook | ≤300 LOC | 400 |
| Page shell | ≤400 LOC | 500 |
| Test specification | ≤500 LOC | 700 |

Hard cap не является причиной для бессмысленного дробления. Extract допустим,
если у него есть:

- имя use-case;
- явные inputs/outputs;
- один владелец side effects;
- самостоятельный тестовый контракт;
- уменьшение контекста вызывающего файла.

Имена описывают поведение: `buildElectricalQueryRequest`, а не `process` или
`helper`. Не создавай общие barrels, экспортирующие внутренности feature.

## 5. Стабильные контракты

Если задача явно не говорит обратное, сохраняй:

- пользовательский workflow, тексты и визуальную геометрию;
- API payload/response semantics;
- query keys, invalidation и retry/cancellation;
- route и URL parameter semantics;
- mm↔m и другие units;
- расчётные формулы и goldens;
- ER UUID identity и legacy-number bridge;
- permission, loading, empty, error и disabled states;
- keyboard/focus behavior и accessible names.

Redesign, copy-editing и архитектурный рефакторинг — разные slices.

Нельзя «починить» задачу через:

- `any`, `@ts-ignore`, `@ts-expect-error` без отдельного контракта;
- `as unknown as` и широкие casts;
- удаление или ослабление assertions;
- рост allowlist/baseline внутри feature-slice;
- compensating CSS override вместо устранения владельца конфликта.

Обоснованное изменение shrink-only baseline выполняется отдельным
architecture-slice. Абсолютные CSS-запреты и baseline перечислены в
[CSS-стратегии](./css-strategy.md) и не ослабляются через baseline update.

## 6. UI и CSS

Подробные правила имеют тематических владельцев и здесь не копируются:

| Контракт | Источник истины |
|---|---|
| Public UI, form anatomy и form-layout ownership | [ui-kit.md](./ui-kit.md) |
| CSS layers, selectors, tokens, breakpoints и gates | [css-strategy.md](./css-strategy.md) |
| Мониторы, CSS viewport и browser proof matrix | [viewport-policy.md](./viewport-policy.md) |

На уровне общего стандарта остаются только границы:

- публичный UI импортируется из `@/components/ui-kit`;
- UI-kit владеет повторяемым control behavior, feature — композициями и
  состояниями, workspace — размещением панелей;
- feature CSS имеет одного component/screen owner и не попадает в глобальный
  compatibility layer;
- accessibility-семантика, DOM/focus order и accessible names являются
  публичным контрактом для пользователя и Playwright;
- UI/CSS slice не ослабляет architecture baseline и явно разделяет automatic
  gates и manual review.

Видимый UI-slice выбирает точные обязательные browser profiles по
`viewport-policy.md` и дополнительно проверяет:

- затронутые loading, empty, error, disabled и permission states;
- keyboard navigation и видимый focus;
- text overflow, clipping, пересечения и допустимый local scroll;
- console errors/warnings и failed network requests;
- крайние ширины вложенного контейнера, если меняется form layout или resizable
  pane;
- reduced motion, если добавлена анимация.

Если обязательный browser proof недоступен, UI-slice имеет статус `blocked` и не
коммитится как готовый.

## 7. Рабочий процесс

### 7.1 Preflight

1. Прочитать `frontend/AGENTS.md`, этот стандарт и контракт slice.
2. Выполнить `git status --short`.
3. Не изменять, не форматировать и не добавлять unrelated WIP.
4. Найти owner, ближайшие production-файлы и существующие тесты через `rg`.
5. Пересчитать фактические метрики.
6. Зафиксировать allowed scope, non-goals, invariants и proof.

### 7.2 Characterization

Сначала докажи текущее поведение существующим или новым тестом. Минимум:

- основной сценарий;
- один значимый edge/failure path;
- сохранение публичного контракта.

Тест должен описывать поведение, а не внутреннюю форму будущей реализации.

### 7.3 Implementation

- Внести минимальный patch в разрешённом scope.
- Не форматировать соседние файлы.
- Не выполнять «заодно» cleanup другого owner.
- Удалить заменённый код или доказанный CSS-дубль.
- При появлении нового решения не оставлять второй равноправный путь.

### 7.4 Proof

Всегда запускаются focused-тесты slice, затем канонический полный DoD:

```bash
cd frontend
npm run test:agent-dod
```

`test:agent-dod` последовательно включает fast gates, unit, integration и
production build. Не собирай альтернативную «полную» команду в локальном
prompt или CI.

Для UI дополнительно запускается релевантный Playwright spec. Доступные команды
сверяются с `e2e/package.json`; например:

```bash
cd e2e
E2E_BASE_URL=http://127.0.0.1:3003 npm run test:ui-kit-parity:chrome
```

Красный полный gate, даже из-за несвязанного baseline, означает `blocked`.
Зафиксируй доказательство и не исправляй чужую проблему расширением scope.

## 8. Git и завершение

После полного DoD агент автоматически создаёт conventional commit:

```text
refactor(frontend): <SLICE_ID> <результат>
fix(frontend): <SLICE_ID> <результат>
docs(frontend): <SLICE_ID> <результат>
```

Добавляй в commit только явные файлы slice; не используй широкое `git add .`.
Push выполняется только по явному запросу пользователя.

Если slice взят из `refactor-backlog.md`:

1. Первый commit содержит production и тесты.
2. Затем backlog получает `done`, before→after и hash первого commit.
3. Это фиксируется отдельным docs-only commit.

Два commit нужны потому, что commit не может содержать собственный hash.

## 9. Hard stops

Остановись без готового commit, если:

- бизнес-правило неоднозначно;
- нужно изменить формулу, units, UUID или API/query/route semantics вне scope;
- целевой файл уже изменён чужим WIP;
- изменение не помещается в budget;
- требуется повысить baseline или ослабить тест;
- UI/CSS-решение нарушает тематическую CSS или form-layout политику;
- полный gate красный;
- обязательный browser proof недоступен или показывает регрессию;
- одна причина не устранена после трёх содержательных попыток.

Верни `FILE / EVIDENCE / DECISION NEEDED`, а не общий вопрос «что делать?».

## 10. Финальный отчёт

```text
Slice:
Behavior before → after:
Files changed:
Metrics before → after:
Focused proof:
Full gate:
Browser states/viewports:
Console/network:
Untested states:
Residual risk:
Production commit:
Backlog commit: (если slice взят из backlog)
Next pending:
```

Не заявляй проверки, которые не запускались.
