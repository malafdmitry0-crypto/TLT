# Осмысленный CSS: план миграции и исполняемые промпты

**Статус:** PROPOSED runbook — политика/промпты, без routing authority

**Актуально на:** 2026-07-25

**Pending / ACTIVE-очередь:** только [refactor-backlog.md](./refactor-backlog.md)  
**AF10 execution board:** [af10-parallel-queue.md](./af10-parallel-queue.md) (HISTORICAL/CLOSED)

Этот документ задаёт целевую политику для удаления статических JSX
`style`/`styles` и перехода к осмысленному owner CSS. Он не разрешает запускать
несколько CSS-slices одновременно и не заменяет:

- [frontend/AGENTS.md](../../frontend/AGENTS.md);
- [стандарт разработки](./agent-development-standard.md);
- [CSS-стратегию](./css-strategy.md);
- [UI-kit и form-layout контракт](./ui-kit.md);
- [viewport policy](./viewport-policy.md);
- [PR budget](./pr-budget.md).

Ни один prompt из этого документа не становится активным автоматически. Его
можно выполнять только по явной команде пользователя или после переноса ровно
одного контракта в актуальный backlog.

## Решение

Цель — не минимальное количество строк CSS. Цель — отсутствие presentation
решений без понятного владельца и смысла.

```text
Статический JSX style/styles  → semantic owner CSS
Повторяемый control contract  → UI-kit / theme
Feature layout и chrome       → CSS рядом с feature-owner
Вычисляемая геометрия         → минимальный runtime-механизм
Third-party style API         → явный adapter с причиной
```

Итоговый контракт:

- static JSX `style`/`styles` равен нулю;
- общий CSS LOC измеряется для наблюдаемости, но не используется как
  самостоятельная оценка качества;
- новый и изменяемый CSS имеет одного owner, стабильный root namespace и
  семантические имена;
- runtime geometry и third-party adapters не маскируют static debt;
- legacy palette, bare Ant, нестандартные breakpoints и visual literals
  уменьшаются отдельными slices;
- перенос presentation не меняет UX, DOM/focus order, API или бизнес-логику.

## Что считается осмысленным CSS

Осмысленное правило отвечает на три вопроса:

1. Какой компонент или экран им владеет?
2. Какую роль или состояние оно выражает?
3. Почему это устойчивый визуальный контракт, а не случайное значение?

Допустимые имена:

```text
.report-wizard__preview
.login-page__role-card
.spec-page__status--error
.electrical-summary__value
```

Недопустимые имена:

```text
.mt-8
.w-100
.font-12
.gray-text
.blue-card
.style1
```

Value-based utility только переносит inline-style в другой синтаксис и не
уменьшает контекст агента.

### Классы presentation-атрибутов

| Класс | Определение | Политика |
|---|---|---|
| `static debt` | Константные margin, padding, display, color, typography, border, background, overflow и размеры в JSX | Удалить полностью |
| `runtime geometry` | Значение действительно вычисляется из данных, измерения контейнера или позиции overlay | Оставлять только вычисляемую часть; разбирать отдельным slice |
| `third-party adapter` | Библиотека требует style API и не предоставляет достаточный class/theme API | Изолировать, документировать owner/reason; разбирать отдельно |

Статические свойства внутри смешанного runtime-объекта всё равно являются
долгом и переносятся в CSS. Наличие одного вычисляемого значения не легализует
остальную статическую presentation.

## Непереговорные правила

- Один запуск — один feature-owner и одна причина изменения.
- Новый CSS импортируется своим production-owner.
- Новый owner CSS использует стабильный root namespace.
- Сначала проверяется Ant theme API, затем UI-kit, затем feature CSS.
- Новый semantic token вводится только для повторяемого устойчивого смысла.
- Conditional presentation выражается modifier class или `data-state`.
- DOM-порядок остаётся visual и keyboard order.
- Заменённый inline-style или selector удаляется в том же slice.
- Старый и новый styling path не остаются активными одновременно.
- Новый `!important`, raw color вне `tokens.css`, bare `.ant-*`, legacy
  `--c-*`/`--a-*` и noncanonical breakpoint запрещены.
- `src/styles.css` остаётся freeze-stub.
- Новый глобальный utility stylesheet запрещён.
- Tailwind, массовая CSS Modules migration и CSS-in-JS не входят в программу.
- Baseline можно только честно уменьшить до результата AST-пересчёта.
- Нельзя менять gate так, чтобы скрыть feature-регрессию.

## Источники фактических метрик

Этот документ намеренно не копирует текущие totals. Они быстро устаревают и
пересчитываются перед каждым slice.

Источники истины:

```text
frontend/src/__tests__/unit/architecture/inlineStyleBaseline.json
frontend/src/__tests__/unit/architecture/cssArchitectureBaseline.json
frontend/src/__tests__/unit/architecture/visualLiteralBaseline.json
frontend/src/__tests__/unit/architecture/antdPrimitiveBaseline.json
frontend/src/__tests__/unit/architecture/antdPrimitiveExtendedBaseline.json
```

Минимальный preflight:

```bash
cd frontend

npx vitest run \
  src/__tests__/unit/architecture/inlineStyleRatchet.architecture.test.ts

npx vitest run \
  src/__tests__/unit/architecture/cssArchitectureRatchet.architecture.test.ts \
  src/__tests__/unit/architecture/cssImportantRatchet.architecture.test.ts \
  src/__tests__/unit/architecture/visualLiteralRatchet.architecture.test.ts \
  src/__tests__/unit/architecture/antdPrimitivePolicy.architecture.test.ts
```

Если baseline stale, сначала определяется реальный источник изменения. Нельзя
обновлять baseline во время параллельно меняющегося worktree.

## План выполнения

### Этап 0. Стабилизировать рабочее дерево

- Завершить, разделить либо удалить только собственный незавершённый WIP.
- Не начинать CSS-slice поверх изменений другого owner.
- Зафиксировать неизменяемый HEAD для characterization и browser evidence.
- При грязном worktree новый prompt останавливается с
  `FILE / EVIDENCE / DECISION NEEDED`.

### Этап 1. Исправить метрику CSS LOC

Выполнить `AF10-MEANINGFUL-CSS-GATE-01`.

Общий CSS LOC становится информационной метрикой. Качество продолжают
контролировать:

- per-file hard cap;
- shrink-only hotspots;
- ownership и orphan detection;
- freeze глобальных файлов;
- `!important`, raw colors, bare Ant;
- legacy palette и breakpoints;
- static inline, visual literals и UI-kit policy.

Этот этап не меняет production JSX или feature CSS.

### Этап 2. Удалить static inline по owner

Повторять `AF10-SEMANTIC-CSS-STATIC-01`.

Детерминированный выбор следующего owner:

1. Сначала исправить любой `INLINE_STYLE_*_GREW`.
2. Затем выбрать owner с максимальным фактическим `static debt`.
3. При равенстве выбрать лексикографически первый owner path.
4. В одном запуске не пересекать auth, reports, specification, electrical,
   heat, admin и shared.

Каждый slice доводит static debt выбранного owner до нуля, а не просто
уменьшает несколько удобных строк.

### Этап 3. Сжечь независимый CSS-долг

После `static debt = 0` выполнять отдельные owner-slices:

1. legacy palette → semantic aliases;
2. noncanonical breakpoints → канонические контракты с geometry proof;
3. bare Ant → theme API, UI-kit либо scoped owner selector;
4. visual literals → semantic tokens или централизованные canvas palettes;
5. Ant primitives с существующим Tlt-аналогом → public UI-kit import.

Эти причины нельзя объединять с inline-style migration только ради одного
большого commit.

### Этап 4. Разобрать adapters и runtime geometry

После удаления static debt:

- проверить каждый third-party adapter на наличие class/theme API;
- вынести повторяемый adapter в именованный компонент;
- удалить статические части runtime style objects;
- сохранить только данные, которые нельзя выразить CSS layout;
- не пытаться заменить динамические overlay coordinates набором generated
  utility classes.

Literal zero для всех `style`-атрибутов не является самоцелью, если библиотека
требует runtime position. Любое оставшееся исключение должно иметь owner,
reason и browser proof.

### Этап 5. Финальный audit

- Зафиксировать текущий HEAD и чистый worktree.
- Пересчитать все architecture baselines.
- Выполнить full DoD дважды.
- Проверить UI-kit и затронутые feature states.
- Создать датированный snapshot в `docs/audit/`.
- Не объявлять CSS-программу завершённой при красной команде, console warning
  или непроверенном обязательном состоянии.

## Prompt 1 — meaningful CSS architecture gate

```text
Работай из корня /Users/dmalafey/Desktop/TLT.

SLICE_ID: AF10-MEANINGFUL-CSS-GATE-01
OWNER: architecture

GOAL:
Перестать считать общий CSS LOC показателем качества. Разрешить рост
осмысленного owner CSS при удалении JSX style/styles, сохранив строгий запрет
на новый CSS-долг.

PRECONDITION:
1. Прочитай frontend/AGENTS.md,
   docs/frontend/agent-development-standard.md,
   docs/frontend/css-strategy.md,
   docs/frontend/ui-kit.md и docs/frontend/viewport-policy.md.
2. Выполни git status --short.
3. Worktree должен быть чистым. Если он грязный — STOP:
   FILE / EVIDENCE / DECISION NEEDED.
4. Это architecture-only slice. Production JSX и feature CSS не изменять.

ПРОБЛЕМА:
Текущий global CSS LOC ratchet конфликтует с удалением inline-style:
осмысленное правило переносится из TSX в owner CSS, CSS LOC растёт, хотя
архитектура становится лучше. Повышать shrink-only baseline ради green
запрещено.

НОВЫЙ КОНТРАКТ:
1. Общий CSS LOC измеряется и выводится в audit, но не является pass/fail
   метрикой.
2. Сохранить hard cap 400 LOC для нового CSS-файла.
3. Существующий CSS-файл больше 400 LOC остаётся shrink-only.
4. Новый CSS-файл обязан:
   - иметь одного импортирующего production-owner;
   - содержать OWNER-комментарий;
   - использовать стабильный owner root;
   - не быть глобальным utility-файлом.
5. Абсолютно сохранить:
   - !important = 0;
   - raw colors вне tokens.css = 0;
   - styles.css остаётся freeze-stub;
   - новый bare .ant-* = 0;
   - новый legacy --c-* / --a-* = 0;
   - новый noncanonical breakpoint = 0;
   - orphan CSS = 0;
   - cross-feature CSS imports = 0.
6. inlineStyleRatchet остаётся отдельным shrink-only gate:
   - новый static style/styles запрещён;
   - static debt может только уменьшаться;
   - runtime geometry и third-party adapter нельзя использовать для маскировки
     static debt.
7. Не вводить Tailwind, CSS Modules migration, CSS-in-JS, utility framework или
   новый глобальный stylesheet.

ИЗМЕНЕНИЯ:
- Обнови cssArchitectureRatchet и его fixtures.
- Сделай totals.loc информационной метрикой.
- Сохрани per-file cap и все debt/ownership проверки.
- Добавь тесты:
  1. новый semantic owner CSS под cap проходит;
  2. orphan/unowned CSS падает;
  3. CSS-файл больше cap падает;
  4. raw color, !important, bare Ant, legacy palette и нестандартный breakpoint
     падают;
  5. рост static JSX style по-прежнему падает.
- Обнови docs/frontend/css-strategy.md:
  CSS LOC — наблюдаемая величина, а не цель; качество определяется ownership,
  семантикой и отсутствием запрещённого долга.
- Не меняй feature baseline и не выполняй CSS-миграцию в этом slice.

PROOF:
cd frontend
npm run typecheck
npm run lint
npm run test:s0-gates
npm run css:architecture
npm run test:agent-dod

ACCEPTANCE:
- Semantic CSS можно добавить без искусственного компенсирующего удаления строк.
- Все реальные CSS-запреты остались или стали строже.
- Ни один debt baseline не повышен.
- Full DoD green.
- Отдельный conventional commit:
  test(frontend): AF10-MEANINGFUL-CSS-GATE-01 enforce semantic CSS ownership
```

## Prompt 2 — static inline в semantic owner CSS

```text
Работай из корня /Users/dmalafey/Desktop/TLT.

SLICE_ID: AF10-SEMANTIC-CSS-STATIC-01
OWNER: выбирается детерминированно по правилам ниже

GOAL:
Удалить весь static JSX style/styles у одного feature-owner и перенести только
устойчивые визуальные правила в осмысленный owner CSS без изменения UX,
геометрии, DOM-порядка или поведения.

PRECONDITION:
1. Прочитай frontend/AGENTS.md и frontend-нормативы.
2. Выполни git status --short.
3. Worktree должен быть чистым. При любом чужом WIP — STOP.
4. AF10-MEANINGFUL-CSS-GATE-01 должен быть green.

ВЫБОР OWNER:
1. Запусти:
   npx vitest run \
     src/__tests__/unit/architecture/inlineStyleRatchet.architecture.test.ts
2. Если есть INLINE_STYLE_*_GREW — сначала исправь этот файл.
3. Иначе выбери owner с максимальным текущим static debt.
4. При равенстве выбери лексикографически первый owner path.
5. Один запуск — один owner. Не объединяй auth, reports, specification,
   electrical, heat, admin и shared.
6. Baseline используется только после фактического AST-пересчёта.

ОПРЕДЕЛЕНИЕ ОСМЫСЛЕННОГО CSS:
- имя описывает компонент, роль или состояние:
  .report-wizard__preview,
  .login-page__card,
  .spec-page__status--error;
- правило находится рядом со своим owner;
- root namespace обязателен;
- используются существующие semantic tokens;
- conditional presentation выражается modifier class или data-state.

ЗАПРЕЩЕНО:
- style={{ ... }} и styles={{ ... }} со статическими значениями;
- классы по физическому значению:
  .mt-8, .w-100, .gray-text, .font-12, .style1;
- перенос каждого JSX-объекта в отдельный одноразовый класс;
- raw colors, legacy palette, !important;
- bare .ant-* вне разрешённого scoped owner;
- новый глобальный utility CSS;
- повышение любого debt baseline;
- изменение текстов, workflow, API, query keys, routes, units и ER UUID;
- redesign одновременно с migration.

ПРАВИЛА МИГРАЦИИ:
1. Зафиксируй characterization основного, loading, empty, error, disabled и
   populated состояний выбранного owner.
2. Переиспользуй существующий owner CSS. Новый файл создавай только при
   отсутствии корректного владельца.
3. Статические margin, padding, width, display, color, typography, border,
   background и overflow перенеси в semantic class.
4. Если style-объект смешивает static и runtime:
   - static часть перенеси в CSS;
   - в JSX оставь только действительно вычисляемое значение.
5. Состояния переводятся в modifier class/data-state, а не в набор условных
   style-объектов.
6. Для Ant сначала используй className или theme/component API; scoped selector
   разрешён только под owner root.
7. Third-party adapter не переписывай в этом slice, если библиотека действительно
   требует style API. Зафиксируй компонент, owner и причину.
8. Удали заменённый inline-код и не оставляй два источника одного правила.
9. Обнови inlineStyleBaseline строго до измеренного меньшего значения.
   Runtime geometry и third-party adapter не должны вырасти.

ACCEPTANCE:
- static debt выбранного owner = 0;
- глобальный static debt строго уменьшился;
- runtime geometry не вырос;
- third-party adapter не вырос;
- нет новых visual literals, legacy palette, bare Ant, нестандартных breakpoint,
  !important и raw colors;
- CSS имеет одного owner и не содержит value-based utility classes;
- geometry и поведение до/после совпадают.

PROOF:
- focused unit/integration tests выбранного owner;
- inlineStyleRatchet;
- visualLiteralRatchet;
- cssArchitectureRatchet;
- antdPrimitivePolicy;
- npm run test:agent-dod;
- browser states на 1440x1000 и 390x844;
- для engineering workspace дополнительно 1280x800 и 1440x900;
- screenshots, page-overflow и sibling-geometry assertions;
- console warnings/errors = 0;
- unexpected failed network = 0.

REPORT:
Slice:
Owner:
Static inline before → after:
Runtime geometry before → after:
Third-party adapters before → after:
Owner CSS created/reused:
Focused proof:
Full DoD:
Browser states/viewports:
Console/network:
Residual adapters:
Commit:
Next owner:
```

## Definition of Done программы

- CSS LOC не используется как самостоятельный quality score.
- Static JSX `style`/`styles` равен нулю.
- Runtime geometry содержит только вычисляемые значения.
- Каждый third-party adapter имеет owner и техническую причину.
- Нет нового legacy palette, bare Ant, noncanonical breakpoint, raw color или
  `!important`.
- Owner CSS не содержит value-based utilities и не пересекает feature-границы.
- UI-kit остаётся feature-agnostic.
- Полный DoD зелёный два запуска подряд на одном HEAD.
- Обязательные browser states проверены с geometry, console и network evidence.
- Финальный датированный audit имеет статус PASS.

## Hard stops

Остановить slice без готового commit, если:

- worktree грязный или целевой owner уже изменяется;
- требуется поднять debt baseline;
- semantic rule нельзя привязать к одному owner;
- перенос требует redesign или изменения DOM/focus order;
- third-party API нельзя заменить без изменения библиотеки;
- возникает новый breakpoint или container threshold без отдельного контракта;
- full DoD красный;
- browser proof показывает overflow, overlap, console warning или failed
  network;
- фактический остаток нельзя достоверно пересчитать.

Формат остановки:

```text
FILE:
EVIDENCE:
DECISION NEEDED:
```
