# CSS-стратегия TLT: ownership, cascade и контроль качества

**Актуально на:** 2026-07-24

**Статус:** рабочий регламент для нового CSS и безопасного уменьшения
существующего долга.

> Тематический справочник. Обязательные workflow, budget, proof и hard stops:
> [agent-development-standard.md](./agent-development-standard.md).

## Текущее состояние

Основной CSS-strangler завершён:

- `src/styles.css` — freeze-stub без селекторов;
- `!important` в `frontend/src` — `0`;
- raw color literals в `.css` вне `styles/tokens.css` — `0`;
- глобальные слои и Ant theme имеют явных владельцев;
- architecture ratchets подключены к обязательным agent gates.

Это не означает, что весь CSS уже качественный. В коде остаются крупные
owner-файлы, технические palette tokens, сложные селекторы и статические inline
styles, включая JSX color literals. Они считаются существующим долгом, а не
разрешённым шаблоном для нового кода. Актуальные числа всегда пересчитываются из
runtime-кода и baseline; старые снимки из документации не являются источником
истины.

Предлагаемая эволюция CSS-метрик и исполняемые prompts находятся в
[плане осмысленного CSS](./meaningful-css-plan.md). До выполнения отдельного
`AF10-MEANINGFUL-CSS-GATE-01` действующий CSS LOC ratchet остаётся hard stop:
proposal не разрешает повышать baseline или обходить красный gate внутри
feature-slice.

## Основной контракт

```text
Общие визуальные контракты → semantic tokens / UI kit
Уникальный layout и chrome  → CSS рядом с feature-компонентом
App shell                   → styles/app-shell.css
Vendor overrides            → theme API, затем styles/vendor-overrides.css
Legacy                      → только уменьшение, локализация или удаление
```

Цель — не минимальное число CSS-файлов и не минимальный LOC любой ценой. У
каждого правила должен быть один владелец, а изменение одного feature не должно
требовать компенсирующего override в другом слое.

## Слои и ownership

| Слой | Целевое место | Отвечает за | Не отвечает за |
|---|---|---|---|
| Tokens | `styles/tokens.css` | semantic colors, размеры, density и layout tokens | селекторы компонентов |
| Base | `styles/base.css` | document root и общие utility states | feature layout и vendor overrides |
| Design system | `components/ui-kit/*.css` | `.tlt-*`, CompactField, primitives и состояния контролов | layout конкретного экрана |
| Feature / island | CSS рядом с owner-компонентом | toolbar, page chrome, таблица, modal и feature layout | чужие feature и app shell |
| App shell | `styles/app-shell.css` | общий application chrome | layout Heat/Elec/Spec |
| Vendor | `styles/vendor-overrides.css` | неизбежные app-wide third-party overrides | feature-specific overrides |
| Freeze stub | `styles.css` | точка совместимости импорта | любые новые правила |

Допустимое направление зависимостей:

```text
tokens ← base / app-shell / vendor-overrides
tokens ← ui-kit ← feature

ui-kit не знает о heat / electrical / specification
feature A не стилизует feature B
feature не импортирует CSS другого независимого feature
```

## Куда помещать новое правило

1. Поведение относится к Ant component/theme token?

   Настроить `theme/appTheme.ts`.
2. Это переиспользуемый визуальный контракт TLT-компонента?

   Добавить его в UI kit.
3. Это app header/sidebar/page frame?

   Использовать существующего app-shell owner.
4. Это значение с устойчивым смыслом в нескольких местах?

   Добавить semantic token, но не глобальный селектор.
5. Всё остальное?

   Добавить рядом с компонентом под его стабильным root namespace.

```text
Foo.tsx
Foo.css

Foo.tsx → import './Foo.css'
root    → className="feature-foo"
CSS     → .feature-foo ... / .feature-foo__part / .feature-foo--state
```

Plain CSS с owner root/BEM — основной подход. CSS Modules допустимы для
полностью принадлежащих приложению компонентов, если они действительно уменьшают
риск. Массовое внедрение CSS Modules, Tailwind, CSS-in-JS или Cascade Layers не
является текущей целью.

## Cascade и специфичность

Глобальные файлы подключаются один раз в `main.tsx` в зафиксированном порядке:

```ts
import './styles/tokens.css';
import './styles/base.css';
import './styles/app-shell.css';
import './styles/vendor-overrides.css';
import './styles.css'; // freeze-stub
// затем только явно зарегистрированные shared global owners
```

Feature CSS импортирует компонент-владелец. Новый селектор использует минимальную
специфичность, обычно `owner root + target + state`.

Запрещено:

- ID selectors, кроме существующего document-root контракта;
- повторять root/class только для повышения специфичности;
- привязывать стиль к длинной DOM-цепочке, если можно добавить owner class;
- использовать `:has()` как замену явному state/modifier class;
- побеждать соседний файл порядком импорта или компенсирующим override;
- копировать селектор в другой owner вместо исправления источника конфликта.

Сложный селектор допустим только при неизбежной привязке к third-party DOM и
требует комментария причины, focused browser proof и проверки после обновления
библиотеки. Существующая сложность не оправдывает её рост.

## Inline styles

Новые статические presentation styles в JSX запрещены:

```tsx
// запрещено
<Card style={{ marginBottom: 16, color: '#595959' }} />
<Card styles={{ body: { padding: 16 } }} />

// ожидается
<Card className="report-card" />
```

Это правило относится и к Ant `styles={{ ... }}`. Разрешены только:

- runtime geometry/position, реально вычисляемые из данных;
- CSS custom properties, через которые компонент передаёт динамическое значение
  в принадлежащий ему CSS;
- style API third-party компонента, если у него нет `className`, theme token или
  другого поддерживаемого механизма.

Даже в разрешённом inline-style статические части выносятся в owner class.
Third-party исключение фиксируется рядом с использованием: почему class/theme API
недоступны, какой компонент владеет исключением и каким proof оно покрыто.

## Tokens и Ant Design

| Контракт | Источник |
|---|---|
| CSS semantic tokens (`--tlt-*`, `--layout-*`, owner-semantic names) | `styles/tokens.css` |
| Ant component/theme tokens | `theme/appTheme.ts`, передаваемый в `ConfigProvider` |
| Значения, которые должны совпадать | parity test |

Токен получает имя по назначению, а не по значению:

```css
/* хорошо */
--tlt-field-control-height: 26px;
--layout-toolbar-border: var(--color-border);

/* запрещено для нового публичного контракта */
--height-26: 26px;
--gray-217: #d9d9d9;
```

Существующие `--c-*` и `--a-*` — legacy compatibility palette. Их определения
остаются единым raw-color source of truth, но новый feature CSS не обращается к
ним напрямую. Новый визуальный смысл получает semantic alias в `tokens.css`;
alias временно может ссылаться на существующий palette token без добавления
нового raw literal.

Одинаковый literal в `tokens.css`, TypeScript и feature CSS недопустим.
`theme/appTheme.ts` — единственный TypeScript owner конфигурации
`ConfigProvider`; `main.tsx` только подключает её.

## Breakpoints

Для нового и изменяемого responsive CSS используются:

```text
max-width: 480px
max-width: 768px
max-width: 1200px
max-width: 1400px
print
prefers-reduced-motion: reduce
```

Остальные существующие значения — локальный legacy. Их нельзя копировать в
новый файл или распространять на другого owner. Замена legacy breakpoint может
менять layout, поэтому выполняется отдельным визуальным slice с geometry proof.
CSS custom properties не используются внутри media query.

Тестовые desktop widths не являются breakpoints. Functional/full/primary/wide
контракт и точные размеры browser proof заданы в
[viewport-policy.md](./viewport-policy.md).

## Раскладка форм

Поведенческий ownership и целевой контракт формы заданы в
[ui-kit.md](./ui-kit.md). Этот раздел владеет только CSS-механикой и не
дублирует public API UI-kit или viewport-матрицу.

Для нового или изменяемого form layout:

- grid/flex owner — секция или form root, а не отдельный domain field;
- DOM-порядок остаётся источником visual и keyboard order;
- business field class нельзя использовать для `grid-row`, `grid-column`,
  `order`, absolute positioning или компенсирующего offset;
- `:has()`, `:nth-*`, child index и структура внутренних Ant-узлов не задают
  geometry или conditional placement;
- `display: contents` не используется для объединения независимых form sections
  в один неявный layout owner;
- hidden state выражается feature-rendering или явным modifier/state class, а
  не поиском скрытого descendant через selector;
- scoped Ant override может нормализовать внутренний chrome `Form.Item`, но не
  размещать field slot относительно соседей;
- field-level CSS custom property может настраивать intrinsic control width,
  но не slot position, visual order или размер чужой секции.

Если форма находится в resizable pane или меняет placement, её внутренний
reflow ориентируется на доступную ширину контейнера. Числовой container
threshold не выводится из viewport-профиля и не добавляется как локальная
магическая константа: его введение требует отдельного characterization-first
architecture-slice и централизованного контракта по `ui-kit.md`.

Legacy coordinate maps считаются долгом, а не разрешённым шаблоном. При
миграции секции заменённые coordinates удаляются в том же slice; старый и новый
layout paths не остаются активными одновременно.

## Ant Design overrides и `!important`

Порядок решения конфликта:

1. `ConfigProvider` theme/component token или поддерживаемый component API.
2. Собственный TLT-компонент.
3. Scoped override под стабильным owner root.

```css
/* допустимо */
.heat-object-fields--wide .ant-form-item {
  margin-block-end: 0;
}

/* запрещено */
.ant-form-item {
  margin-block-end: 0;
}
```

`!important` запрещён без исключений; текущий baseline равен нулю и не
повышается. Это относится и к third-party/inline-style конфликтам. Если конфликт
невозможно решить через theme/component API, owner root или изменение интеграции,
feature-slice останавливается с `FILE / EVIDENCE / DECISION NEEDED`. Отдельная
architecture-задача может изменить механизм интеграции, но не легализует
`!important`.

## Freeze `styles.css`

В `src/styles.css` допустимы только удаление или обслуживание comment-only
freeze-stub. Новые base, shell, vendor и feature rules туда не добавляются.

Запрещено:

- новое feature-правило или bare `.ant-*`;
- копия существующего селектора;
- временный компенсирующий override;
- удержание LOC-метрики удалением комментариев вместо правил.

## Что проверяется автоматически

Текущий `css:architecture` и связанные architecture tests проверяют:

- freeze `styles.css` и `styles/app-base.css`;
- shrink-only baseline для CSS LOC, bare Ant selectors и количества media rules;
- абсолютный нулевой baseline `!important`;
- raw color literals в CSS вне `tokens.css`;
- порядок глобальных CSS imports;
- orphan CSS и специальные import-owner контракты;
- foreign feature markers для зарегистрированных feature-зон;
- root isolation для отдельных wizard islands.

Следующие правила пока обязательны на review, но не покрыты общим
автоматическим gate:

- статические JSX `style`/`styles`;
- прямые новые ссылки на legacy `--c-*`/`--a-*`;
- специфичность и глубина всех селекторов;
- owner-root isolation каждого CSS-файла;
- значения breakpoint allowlist;
- полный запрет cross-feature CSS imports и semantic duplicates.

Документ не выдаёт manual policy за существующий CI gate. Пока исполняемый
LOC/media ratchet строже этого регламента, его красный результат остаётся hard
stop. Изменение baseline или логики gate выполняется отдельным
architecture-slice, а не внутри feature-задачи.

## Протокол CSS-slice

### До изменения

1. Назначить owner и root class.
2. Найти селекторы, JSX class names, inline styles, modifiers и media/print rules.
3. Проверить theme/UI-kit/semantic-token путь до добавления feature override.
4. Зафиксировать текущую геометрию, computed styles и затронутые состояния.
5. Записать allowed scope, invariants и неавтоматизированные review-проверки.

### Изменение

1. Изменить только CSS владельца и его компонент.
2. Использовать semantic tokens и минимальную специфичность.
3. Удалить заменённый inline-style, селектор или дубль в том же slice.
4. Не оставлять второй равноправный источник визуального контракта.

### После изменения

1. `!important` остаётся `0`.
2. Не появились bare Ant, raw colors, новые legacy palette references или
   нестандартные breakpoints.
3. Owner, cascade и specificity проверены вручную там, где нет общего gate.
4. Focused tests и релевантные browser states прошли.
5. Console errors, overflow, keyboard/focus и print behavior не ухудшились.

## Proof

Точные browser profiles и правила выбора крайних viewport задаёт только
[viewport-policy.md](./viewport-policy.md). CSS-slice добавляет к выбранным
профилям состояния своего владельца:

| Изменение | Дополнительный focused proof |
|---|---|
| Token/UI kit | `/ui-kit`, computed-style parity и затронутые control states |
| Form layout | contract states из `ui-kit.md` и computed geometry на container extremes |
| Table/Glide chrome | populated rows, local scroll, selection и error row |
| Modal/settings | open/close, long content и keyboard focus |
| Specification | populated/stale и screen/print |
| Electrical | затронутый workflow и focused e2e |
| App shell | navigation, overflow и распределение свободного пространства |
| Responsive component | затронутые mobile/tablet states |

Reduced motion, focus-visible и print проверяются, когда slice меняет
соответствующее поведение.

## Definition of Done

- правило находится у одного owner и импортируется им;
- глобальный слой не получил feature-знание;
- `!important` равен нулю;
- нет нового статического inline-style;
- новый визуальный смысл выражен semantic token;
- специфичность и DOM coupling не выросли;
- breakpoint взят из canonical policy;
- automatic gates зелёные, manual checks явно перечислены;
- видимое изменение имеет focused browser proof.

## Не делать

- массовый CSS rewrite или redesign одновременно с extraction;
- Tailwind/CSS Modules/CSS-in-JS migration всего приложения;
- новый глобальный layout kit без доказанного повторения;
- перенос, после которого старый и новый селектор остаются активными;
- объявлять качество только по уменьшению LOC;
- повышать baseline, чтобы feature-slice стал зелёным.
