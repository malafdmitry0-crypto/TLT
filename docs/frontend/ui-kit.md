# UI Kit и контракт раскладки форм

**Актуально на:** 2026-07-25

**Статус:** архитектурная политика UI-kit и новых/изменяемых form layouts.

## Desktop-only product contract (AF12)

- Product UI для UI Kit page (`/ui-kit`) и showcase acceptance: **≥1000 px** CSS
  viewport.
- **&lt;1000 px** — out of product scope: no support claim, no required browser
  matrix rows, no agent-driven mobile CSS without a **separate product
  decision**.
- Canonical UI Kit desktop media condition for owner reflow: `max-width: 1200px`.
- `@media (max-width: 768px)` in UI Kit CSS is **not product scope**; do not
  reintroduce it for UI Kit without a separate product decision.
- CSS ownership (one JSX seam → one CSS owner, base + own desktop media):
  - `ui-kit-page-shell.css` — page/header/nav/main/intro/footer/reduced-motion
  - `ui-kit-foundation.css` — colors, typography, foundation grids
  - `ui-kit-primitives-showcase.css` — alerts, tabs, metrics, primitives
  - `ui-kit-data-showcase.css` — filters, empty/loading, showcase table
  - `ui-kit-heatcalc-reference.css` — Heat reference/form/action bar/layers/table
- Mixed `ui-kit.css` / temporary `ui-kit-responsive.css` are **retired**; new
  UI Kit rules go only to the owner files above.

> Общий workflow, budget, proof и hard stops:
> [agent-development-standard.md](./agent-development-standard.md). Фактический
> public API, Storybook-команды, токены и работающие примеры:
> [`components/ui-kit/README`](../../frontend/src/components/ui-kit/README.md).

## Граница UI-kit

UI-kit — feature-agnostic слой представления. Публичные компоненты импортируются
только через `@/components/ui-kit`; сам kit не импортирует feature, domain,
store, API или бизнес-валидацию.

В runtime уже существуют `CompactField`, `CompactFieldGrid`, Tlt form controls
и CSS-first primitives. Этот документ не дублирует их список, props и
пиксельные значения: источником текущего API является README рядом с кодом.

UI-kit владеет повторяемой анатомией и поведением контрола. Он не владеет
Heat/Electrical/Specification workflow и не превращает feature-формы в
универсальную schema-driven систему.

## Контракт раскладки форм

Контракт ниже обязателен для нового form layout и для legacy-секции, которую
изменяют или мигрируют. Он является целевым направлением, а не утверждением, что
каждая существующая форма уже ему соответствует.

### Ownership

| Уровень | Владеет | Не владеет |
|---|---|---|
| Workspace / page shell | размещение панели, доступная область, resizing и page overflow | координаты отдельных полей |
| Feature form | секции, DOM-порядок, видимость, значения и бизнес-валидация | внутренний chrome переиспользуемого контрола |
| Form section / grid | поток slots, gaps и reflow по доступной ширине | знание API, store или формул |
| `CompactField` | label, control, required, hint, error и accessible association | положение поля среди соседей |
| Tlt control | интерактивное поведение, intrinsic chrome и состояния | layout секции или workspace |

### Инварианты

- DOM-порядок полей одновременно задаёт визуальный порядок и keyboard tab order.
- Добавление, удаление или перемещение поля меняет feature-композицию, но не
  требует новой CSS-координаты.
- Скрытый slot полностью выходит из потока и не оставляет зарезервированную
  ячейку.
- Hint, validation error и длинный label могут увеличивать собственную ячейку,
  но не перекрывают и не обрезают соседние controls.
- Layout секции реагирует на реально доступную ширину своего контейнера.
  Разрешение монитора и browser viewport используются для внешнего proof, но не
  подменяют ширину вложенной панели.
- Feature может передать CSS custom property для intrinsic-размера конкретного
  контрола. Такая переменная не может задавать slot position, визуальный порядок
  или компенсировать чужой layout.
- Visual reordering, не совпадающий с DOM, допустим только как отдельное
  accessibility-решение с keyboard и screen-reader proof; для обычных форм он
  запрещён.

CSS-механика, запрещённые selector patterns и правила миграции находятся в
[css-strategy.md](./css-strategy.md). Мониторы, CSS viewport и обязательные
browser profiles находятся в
[viewport-policy.md](./viewport-policy.md).

## Container width и thresholds

Form layout должен ориентироваться на containing block, когда одна и та же
форма может находиться сверху, снизу или в resizable side pane. Viewport media
query не используется как косвенная оценка ширины такой панели.

Канонические container thresholds пока не установлены. Нельзя придумывать и
распространять значения `compact/wide` только из названий viewport-профилей.
Первый threshold вводится отдельным architecture-slice:

1. characterization текущих поддерживаемых состояний;
2. измерение фактической ширины контейнера в каждом placement;
3. централизованный именованный контракт;
4. geometry proof непосредственно до и после границы.

После появления такого контракта числовые значения документируются здесь один
раз; `viewport-policy.md` их не дублирует.

## Нужен ли отдельный Layout Kit

Большой универсальный Layout Kit сейчас не нужен. Действующая граница:

```text
AppShell / workspace          → application и feature chrome
CompactField / controls       → повторяемая анатомия поля
CompactFieldGrid              → существующий form-grid primitive
feature composition           → секции, порядок и видимость
```

Новый shared layout primitive допустим, только если:

1. существующего `CompactFieldGrid` доказанно недостаточно;
2. один и тот же независимый контракт повторяется минимум в двух feature
   layouts;
3. API не содержит domain field names и не переносит state/validation в kit;
4. adoption удаляет больше feature-specific geometry, чем добавляет shared
   abstraction.

`PageBody` или `ToolbarRow` также вводятся только после доказанного повторения.
Универсальный Page template с вариантами для всех экранов не является целью.

## Proof form-layout slice

Помимо viewport-профилей из общей политики, form-layout proof покрывает:

- исходный порядок, reorder, add/remove и условно скрытое поле;
- required, hint, validation error, disabled и длинный label;
- все затронутые workspace placements и крайние размеры resizable container;
- отсутствие overlap, clipping, page-level overflow и пустых grid holes;
- совпадение DOM, визуального порядка, keyboard focus и accessible names;
- geometry непосредственно по обе стороны каждого изменяемого container
  threshold.

Полные pixel snapshots используются только для стабильного UI-kit visual
contract. Для feature layout предпочтительны geometry assertions и
state-driven Playwright proof.

## Не делать

- schema-driven form DSL «на будущее»;
- второй form kit рядом с `CompactField`/`CompactFieldGrid`;
- перенос feature validation, API mapping или state в UI-kit;
- массовую миграцию Heat, Electrical и Specification одним slice;
- общий layout primitive, доказанный только одним экраном;
- объявлять legacy layout соответствующим этому контракту без browser proof.
