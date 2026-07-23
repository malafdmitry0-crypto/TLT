# Стандарт agent-friendly разработки frontend TLT

**Статус:** нормативный  
**Актуально на:** 2026-07-23  
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

## 2. Единица работы

Один запуск агента выполняет один **vertical slice**:

- один feature-owner и одна причина изменения;
- один наблюдаемый результат;
- characterization до production-изменения;
- focused proof и полный gate;
- удаление заменённого дубля;
- отчёт с остаточным риском.

Feature-owner выбирается по реальному владельцу поведения: `heat`,
`electrical`, `specification`, `reports`, `projects`, `admin`, `auth`, `ui`,
`shared` или `css`. Не объединяй независимые owner-зоны ради удобства.

### Жёсткий budget

```text
max 1 page/shell file
max 2 production helper/CSS files
max 2 test/architecture-baseline files
1 feature-owner
characterization first
src/styles.css: net LOC ≤ 0
```

Если безопасное изменение не помещается в budget, раздели его и выполни только
первый самостоятельно проверяемый slice. Не повышай budget постфактум.

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

Обоснованное изменение не-absolute baseline выполняется отдельным
architecture-slice. Это не относится к `!important`: его baseline `0` не
повышается.

## 6. UI и CSS

- Публичный UI импортируется из `@/components/ui-kit`.
- Feature CSS принадлежит компоненту/экрану и имеет owner root class.
- Глобальные слои подключаются в порядке
  `tokens → base → app-shell → vendor-overrides → styles.css freeze-stub`.
- Ant theme принадлежит `src/theme/appTheme.ts`; `main.tsx` только подключает его.
- `src/styles.css` — freeze-stub: новый feature CSS запрещён.
- Новый bare `.ant-*` запрещён; `!important` запрещён без исключений и остаётся
  на абсолютном baseline `0`.
- Статические presentation styles через JSX `style={{...}}` и Ant
  `styles={{...}}` запрещены. Допустимы только runtime geometry, CSS custom
  properties и документированное требование third-party API; статическая часть
  всё равно выносится в owner class.
- Новое визуальное значение получает semantic token. `--c-*` и `--a-*` —
  legacy palette: существующие ссылки уменьшаются, новые feature-ссылки
  запрещены.
- Новый селектор использует минимальную специфичность. ID selectors, повтор
  классов для усиления, длинная DOM-цепочка и `:has()` вместо явного state class
  запрещены.
- Новые responsive rules используют `480/768/1200/1400`, `print` или
  `prefers-reduced-motion`; остальные существующие значения не распространяются
  за пределы текущего owner.
- Desktop width contract: `1000 px` — functional boundary, `1280 px` — full
  engineering workspace, `1440×900` — primary QA, `1920 px` — wide proof.
  Полная матрица находится в [viewport-policy.md](./viewport-policy.md);
  viewports не являются разрешением добавить одноимённый breakpoint.
- Плотность общих полей задаётся `--tlt-field-*` tokens.
- UI-kit владеет поведением контрола; feature владеет размещением.
- Accessibility-семантика — публичный интерфейс для пользователя и Playwright.

Часть правил пока проверяется review, а не общим architecture gate. Фактическая
граница автоматизации перечислена в
[CSS-стратегии](./css-strategy.md#что-проверяется-автоматически). Красный
действующий LOC/media ratchet остаётся hard stop, даже если его изменение
предлагается отдельной architecture-задачей.

Видимый UI-slice проверяет минимум:

- primary desktop `1440×900`;
- один релевантный крайний профиль из viewport policy;
- для app shell/overflow — `1000×768` и `1920×1080`;
- для плотного engineering layout — `1000×768` constrained и `1280×800` full;
- `390×844`/`768×1024`, только если затронут responsive/mobile contract;
- loading/empty/error/disabled/permission states, если затронуты;
- keyboard navigation и видимый focus;
- text overflow, clipping и пересечения;
- console errors/warnings и failed network requests;
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

Всегда запускаются focused-тесты slice, затем:

```bash
cd frontend
npm run test:agent-gates
npm run test:unit
npm run test:integration
npm run build
```

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
- CSS-решение требует `!important`, нового статического inline-style,
  неканонического breakpoint или не имеет одного owner root;
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
Backlog commit:
Next pending:
```

Не заявляй проверки, которые не запускались.
